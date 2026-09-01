#!/usr/bin/env bash
# ============================================================================
# فحص الهجرات على بوستغريس حقيقيّ — قبل ما تلمس قاعدة العيادات
#
# ينصب عنقوداً مؤقتاً، يبني مخطّطاً بشكل النظام (أدوار سوبابيس، auth.uid،
# auth_clinic، والجداول التي تلمسها الموجة)، ينزّل الهجرات، ثم يفحص:
#   * تنزل بلا خطأ، وتنعاد بلا أثرٍ ثانٍ (idempotent)
#   * الرؤية ما تتغيّر لأي دور — نفس الصفوف قبل وبعد
#   * الأرقام التسلسلية بلا تصادم، حتى بعشرين عميلاً متزامناً
#   * الكنس يحذف القديم وحده، ويرفض مدّةً قصيرة
#   * الصلاحيات منزوعة عن anon/authenticated
#
#   bash supabase/tests/run.sh
# ============================================================================
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/var/tmp/dvtest-pgdata}
PORT=${PORT:-5433}
SOCK=/var/tmp
DB=dvtest
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../migrations"
# الهجرات التي يغطّيها هذا المخطّط الأساس. زدها كل ما تنضاف موجة.
WAVE="$MIG/0124_sold_by_weight.sql $MIG/0125_perf_indexes.sql $MIG/0126_pet_serial.sql $MIG/0127_audit_retention.sql $MIG/0128_rls_initplan.sql $MIG/0129_audit_tiered_retention.sql $MIG/0130_verify_rls.sql $MIG/0131_invoice_items_allow_returns.sql $MIG/0132_retail_return.sql $MIG/0133_invoice_items_dated.sql $MIG/0134_widen_numerics.sql $MIG/0135_checkout_idempotent.sql $MIG/0136_return_idempotent.sql $MIG/0137_system_health.sql $MIG/0138_cron_schedule.sql $MIG/0139_audit_diff.sql $MIG/0140_payroll_advances.sql"

command -v "$PGBIN/initdb" >/dev/null || { echo "ما لكيت بوستغريس بـ $PGBIN"; exit 1; }

cleanup() { "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

# بوستغريس يرفض يشتغل بحساب الجذر، فننزل لحسابٍ عاديّ للخادم وحده
# (psql يبقى بحسابنا — الاتصال بمقبسٍ محلّي بثقةٍ محلّية).
AS=""
if [ "$(id -u)" = "0" ]; then
  id pgtest >/dev/null 2>&1 || useradd -m pgtest
  AS="su pgtest -c"
fi
run_pg() { if [ -n "$AS" ]; then $AS "$*"; else eval "$*"; fi; }

echo "▸ عنقودٌ مؤقّت…"
"$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
# وخادمٌ شارد من تشغيلةٍ سابقة انقطعت: `pg_ctl` ما يوصله لأن ملفّ رقمه راح
# مع `rm -rf`، فيبقى حيّاً — ثم يموت بمنتصف فحوصنا **فيمسح مقبسنا معه**
# (شُخّصت هذه: نصفُ الفحوص طلع فاشلاً وما بيه عطلٌ أصلاً). فنقتله بالاسم.
pkill -9 -f "postgres .*-D $PGDATA" >/dev/null 2>&1 || true
sleep 1
rm -f "$SOCK/.s.PGSQL.$PORT" "$SOCK/.s.PGSQL.$PORT.lock"
rm -rf "$PGDATA"; mkdir -p "$PGDATA"
[ -n "$AS" ] && chown -R pgtest "$PGDATA"
chmod 700 "$PGDATA"
run_pg "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8" >/dev/null
rm -f "$SOCK/.s.PGSQL.$PORT" "$SOCK/.s.PGSQL.$PORT.lock"
run_pg "$PGBIN/pg_ctl -D $PGDATA -l /var/tmp/dvtest.log -o '-k $SOCK -p $PORT -c listen_addresses=' -w start" >/dev/null

for _ in $(seq 1 30); do
  pg_isready -h "$SOCK" -p "$PORT" -q && break
  sleep 1
done
pg_isready -h "$SOCK" -p "$PORT" -q || { echo "ما صعد الخادم:"; tail -5 /var/tmp/dvtest.log; exit 1; }

P="psql -h $SOCK -p $PORT -U postgres -d $DB -v ON_ERROR_STOP=1 -q"
createdb -h $SOCK -p $PORT -U postgres $DB

echo "▸ المخطّط الأساس…"
$P -f "$HERE/harness.sql" >/dev/null

# دَينُ بياناتٍ حقيقيّ من الإنتاج: صفٌّ قديم بكميّةٍ صفر، دخل قبل أن يوجد
# أيّ حارس. يُزرع قبل الهجرات ليواجه التعبئة كما واجهها هناك.
# الصفّ سبق الحارس بالإنتاج، فنرفع الحارس لحظةَ زرعه ثم نعيده `not valid`
# — وهذا بالضبط ما وجدته التعبئة هناك: صفٌّ مخالف يعيش تحت حارسٍ لم يفحصه.
$P -c "alter table invoice_items drop constraint if exists invoice_items_nonneg;
       insert into invoices(id,clinic_id) values
       ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
       update invoices set created_at = now() - interval '120 days'
        where id='cccccccc-0000-0000-0000-000000000001';
       insert into invoice_items(invoice_id,clinic_id,name,qty,unit_price,unit_cost,line_total,stock_qty)
       values ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','zero-legacy',0,1250,750,0,0);
       alter table invoice_items add constraint invoice_items_nonneg
         check (qty > 0 and unit_price >= 0 and unit_cost >= 0 and coalesce(stock_qty,0) >= 0) not valid;" >/dev/null

echo "▸ الهجرات…"
for f in $WAVE; do
  printf '   %s\n' "$(basename "$f")"
  out=$($P -f "$f" 2>&1) || { echo "$out"; echo "✗ فشلت"; exit 1; }
  echo "$out" | grep -E "ERROR" && { echo "✗ فشلت"; exit 1; } || true
done

echo "▸ إعادة التنزيل (لازم بلا أثرٍ ثانٍ)…"
for f in $WAVE; do
  out=$($P -f "$f" 2>&1) || { echo "✗ ما انعادت: $(basename "$f")"; echo "$out" | tail -5; exit 1; }
done

fail=0
chk() { # chk "الوصف" "استعلام" "المتوقّع"
  got=$(psql -h $SOCK -p $PORT -U postgres -d $DB -tAc "$2" | tr -d '[:space:]')
  if [ "$got" = "$3" ]; then printf '   ✓ %s\n' "$1"
  else printf '   ✗ %s — طلع «%s» والمتوقّع «%s»\n' "$1" "$got" "$3"; fail=1; fi
}

echo "▸ الفحوص…"
$P -c "insert into pets(name) select 'p'||g from generate_series(1,500) g;" >/dev/null

chk "ما تكرّر رقمٌ تسلسليّ" \
    "select (count(*)=count(distinct serial))::text from pets" "true"
chk "ولا رقمَ فارغ" \
    "select (count(*) filter (where serial is null))::text from pets" "0"
chk "نسخ الأمان ما تتكدّس بإعادة التنزيل" \
    "select (count(*)=count(distinct policyname||tablename))::text from rls_policy_backup" "true"
chk "ما بقي نداءٌ عارٍ بأي سياسة" \
    "select count(*)::text from pg_policies where schemaname='public' and (public._needs_wrap(qual) or public._needs_wrap(with_check))" "0"
# البرهان: الفرق بين الأصل والحالي هو اللفّ وحده — لا شرطٌ ولا دور
chk "ولا سياسةٌ ضاعت"        "select ضاعت::text            from public.verify_rls_equivalence()" "0"
chk "ولا شرطٌ تغيّر"          "select تغير_شرطها::text      from public.verify_rls_equivalence()" "0"
chk "ولا دورٌ تبدّل"          "select تغيرت_صلاحياتها::text from public.verify_rls_equivalence()" "0"
chk "ولا لفٌّ مزدوج" \
    "select count(*)::text from pg_policies where qual like '%SELECT ( SELECT%' or with_check like '%SELECT ( SELECT%'" "0"
chk "الكنس ممنوع على authenticated" \
    "select has_function_privilege('authenticated','public.purge_audit_log(int,int)','execute')::text" "false"
chk "الكنس ممنوع على anon" \
    "select has_function_privilege('anon','public.purge_audit_log(int,int)','execute')::text" "false"
chk "نسخة الأمان ما تنقرأ من التطبيق" \
    "select has_table_privilege('authenticated','public.rls_policy_backup','select')::text" "false"
chk "توليد الرقم مسموحٌ للمُدخِل" \
    "select has_function_privilege('authenticated','public.next_pet_serial()','execute')::text" "true"

# الكنس: قديمٌ ينمسح وجديدٌ يبقى
# طبقتان: ضجيجٌ يوميّ عمره ٢٠٠ يوم، وأثرُ فواتير بنفس العمر
$P -c "insert into audit_log(clinic_id,action,entity,created_at)
       select gen_random_uuid(),'X','pets',      now()-(g||' days')::interval from generate_series(1,200) g;" >/dev/null
$P -c "insert into audit_log(clinic_id,action,entity,created_at)
       select gen_random_uuid(),'X','invoices',  now()-(g||' days')::interval from generate_series(1,200) g;" >/dev/null
$P -c "insert into audit_log(clinic_id,action,entity,created_at)
       select gen_random_uuid(),'X',null,        now()-(g||' days')::interval from generate_series(1,200) g;" >/dev/null

chk "الكنس بطبقتين يحذف شيئاً" "select (public.purge_audit_log(90,365) > 0)::text" "true"
chk "الحركة اليومية ما تتعدّى ٩٠ يوماً" \
    "select count(*)::text from audit_log where entity='pets' and created_at < now() - interval '90 days'" "0"
chk "وكيانٌ فارغ ينكنس هو الآخر" \
    "select count(*)::text from audit_log where entity is null and created_at < now() - interval '90 days'" "0"
chk "وأثرُ الفواتير يبقى كاملاً — ولا صفّ منه انحذف" \
    "select count(*)::text from audit_log where entity='invoices'" "200"
chk "ويُكنس بعد سنة لا قبلها" \
    "select count(*)::text from audit_log where entity='invoices' and created_at < now() - interval '365 days'" "0"
$P -c "create or replace function _probe(a int, b int) returns text language plpgsql as \$fn\$
begin perform public.purge_audit_log(a, b); return 'NOT-GUARDED';
exception when others then return 'guarded'; end \$fn\$;" >/dev/null
chk "ويرفض مدّةَ مالٍ أقصر من الباقي" "select _probe(90,30)" "guarded"
# المسبار يلزم يكون دالّةً: استدعاءٌ مباشر يرمي خطأً فيرجع psql فارغاً — وهو
# نفس ما يرجّعه لو ما كان اكو حارس أصلاً، فيمرّ الفحص وهو ما فحص شيئاً.
chk "ويرفض مدّةً خطرة" "select _probe(1, 365)" "guarded"
chk "والحارس ما سمح بحذف صفٍّ واحد" \
    "select (count(*) > 0)::text from audit_log" "true"

# السلة المختلطة: راجعٌ سالب + مشترى موجب بنفس الفاتورة (0122 مع قيد 0051)
ins() { psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "$1" >/dev/null 2>&1; }
ins "insert into invoice_items(name,qty,unit_price,unit_cost,line_total,stock_qty) values ('ret',-1,1000,600,-1000,-1);" \
  && printf '   ✓ %s\n' "السطر الراجع (سالب) ينقبل" || { printf '   ✗ %s\n' "السطر الراجع انرفض"; fail=1; }
ins "insert into invoice_items(name,qty,unit_price,unit_cost,line_total,stock_qty) values ('buy',2,5000,3000,10000,2);" \
  && printf '   ✓ %s\n' "وسطر البيع معه" || { printf '   ✗ %s\n' "سطر البيع انرفض"; fail=1; }
ins "insert into invoice_items(name,qty,unit_price,unit_cost,line_total,stock_qty) values ('svc',1,15000,0,15000,null);" \
  && printf '   ✓ %s\n' "وخدمةٌ بلا مخزون" || { printf '   ✗ %s\n' "الخدمة انرفضت"; fail=1; }
ins "insert into invoice_items(name,qty,unit_price,unit_cost,line_total,stock_qty) values ('z',0,100,50,0,0);" \
  && { printf '   ✗ %s\n' "قبل كميةً صفراً"; fail=1; } || printf '   ✓ %s\n' "ويرفض كميةً صفراً"
ins "insert into invoice_items(name,qty,unit_price,unit_cost,line_total,stock_qty) values ('n',1,-100,50,-100,1);" \
  && { printf '   ✗ %s\n' "قبل سعراً سالباً"; fail=1; } || printf '   ✓ %s\n' "ويرفض سعراً سالباً"
ins "insert into invoice_items(name,qty,unit_price,unit_cost,line_total,stock_qty) values ('c',-1,1000,600,-1000,1);" \
  && { printf '   ✗ %s\n' "قبل تناقض الإشارة"; fail=1; } || printf '   ✓ %s\n' "ويرفض سطراً يبيع ويردّ بآنٍ واحد"

# الإرجاع الخالص (0132): بضاعةٌ ترجع للرصيد، وسحبٌ لكل صنف — بلا فاتورة
$P -c "insert into memberships(user_id,clinic_id,role,status) values
       ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','manager','active');" >/dev/null
$P -c "insert into products(id,clinic_id,stock) values
       ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',5);" >/dev/null
$P -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
       select retail_return(
         '[{\"product_id\":\"aaaaaaaa-0000-0000-0000-000000000001\",\"name\":\"شامبو\",\"qty\":-2,\"unit_price\":1000,\"stock_qty\":-2},
           {\"product_id\":null,\"name\":\"خدمة\",\"qty\":-1,\"unit_price\":500}]'::jsonb,
         '{\"method\":\"transfer\",\"customer_name\":\"أبو علي\"}'::jsonb);" >/dev/null 2>&1

chk "الإرجاع يرجّع البضاعة للرصيد (5 + 2)" \
    "select stock::text from products where id='aaaaaaaa-0000-0000-0000-000000000001'" "7.000"
chk "وسحبٌ منفصل لكل صنف" \
    "select count(*)::text from expenses where category='مرتجع'" "2"
chk "بالمبلغ الصحيح (2000 + 500)" \
    "select sum(amount)::text from expenses where category='مرتجع'" "2500.00"
chk "والوصف يحمل «راجع» واسم الصنف" \
    "select (count(*)>0)::text from expenses where description like 'راجع: شامبو%'" "true"
chk "واسم الزبون معه" \
    "select (count(*)>0)::text from expenses where description like '%أبو علي%'" "true"
chk "و«حوالة» تُترجم bank بالسحوبات" \
    "select distinct method from expenses where category='مرتجع'" "bank"
# الإرجاع ما ينشئ فاتورة — نعدّ ما عدا الفواتير المزروعة للفحوص الأخرى
chk "ولا تُخترع فاتورة" \
    "select count(*)::text from invoices where id not in ('bbbbbbbb-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001')" "0"
$P -c "create or replace function _rprobe() returns text language plpgsql as \$fn\$
begin perform retail_return('[]'::jsonb, '{}'::jsonb); return 'NOT-GUARDED';
exception when others then return 'guarded'; end \$fn\$;" >/dev/null
chk "وسلّةٌ فارغة تُرفض" "select _rprobe()" "guarded"

# 0133: البند يرث تاريخ فاتورته بالتعبئة الرجعية
$P -c "insert into invoices(id,clinic_id) values
       ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
       update invoices set created_at = now() - interval '200 days'
        where id='bbbbbbbb-0000-0000-0000-000000000001';
       insert into invoice_items(invoice_id,clinic_id,name,qty,unit_price,unit_cost,line_total,stock_qty)
       values ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','old',1,100,50,100,1);" >/dev/null
chk "بندٌ جديد يُختم باليوم" \
    "select (created_at > now() - interval '1 day')::text from invoice_items where name='old'" "true"
$P -f "$MIG/0133_invoice_items_dated.sql" >/dev/null 2>&1
chk "وبعد التعبئة يرث تاريخ فاتورته" \
    "select (created_at < now() - interval '199 days')::text from invoice_items where name='old'" "true"
chk "والفهرس الزمنيّ موجود" \
    "select count(*)::text from pg_indexes where indexname='invoice_items_clinic_created_idx'" "1"
# الصفّ القديم بكميّة صفر: عبَرت التعبئة فوقه، وورث تاريخ فاتورته
chk "الصفّ القديم (كميّة صفر) ما منع التعبئة" \
    "select (created_at < now() - interval '119 days')::text from invoice_items where name='zero-legacy'" "true"
chk "ولا انحذف ولا انتغيّر" \
    "select qty::text from invoice_items where name='zero-legacy'" "0.000"
chk "والحارس رجع بعد التعبئة" \
    "select count(*)::text from pg_constraint where conname='invoice_items_nonneg'" "1"

# 0134: ما بقي عمودٌ رقميّ بسقفٍ ضيّق، ومبلغٌ ضخم ينقبل
chk "ما بقي عمود numeric تحت ٢٤ خانة" \
    "select count(*)::text from information_schema.columns c
      join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
      where c.table_schema='public' and c.data_type='numeric'
        and c.numeric_precision is not null and c.numeric_precision < 24" "0"
ins "insert into invoice_items(name,qty,unit_price,unit_cost,line_total,stock_qty)
     values ('ضخم',1,99999999999999999999.99,0,99999999999999999999.99,1);" \
  && printf '   ✓ %s\n' "مبلغ ١٠٠ كوينتليون ينقبل (كان يُرفض عند ١٠ مليار)" \
  || { printf '   ✗ %s\n' "المبلغ الضخم انرفض"; fail=1; }
chk "والسياسة المعتمِدة رجعت" \
    "select count(*)::text from pg_policies where tablename='invoices' and policyname='invoices_update'" "1"
chk "وبنصّها كاملاً (تحرس المبالغ)" \
    "select (with_check like '%amount_paid%' and with_check like '%auth_role%')::text from pg_policies where policyname='invoices_update'" "true"
chk "والعرض المعتمِد رجع" \
    "select count(*)::text from pg_views where viewname='shared_catalog_source'" "1"
chk "وما ينقرأ من التطبيق" \
    "select has_table_privilege('authenticated','public.shared_catalog_source','select')::text" "false"

# 0135: البيعة تُعاد بأمان — نفس المرجع لا يخلق فاتورةً ثانية
out=$($P -c "insert into products(id,clinic_id,stock) values
       ('dddddddd-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',10);" 2>&1) \
  || { echo "زرع المنتج فشل: $out"; exit 1; }
CART='[{"product_id":"dddddddd-0000-0000-0000-000000000001","name":"x","qty":2,"unit_price":1000,"unit_cost":600,"stock_qty":2}]'
run3() { psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select retail_checkout('$CART'::jsonb, jsonb_build_object('client_ref','REF-1'));" >/dev/null 2>&1 || true; }
run3; run3; run3
chk "ثلاث محاولات بنفس المرجع = فاتورة واحدة" \
    "select count(*)::text from invoices where client_ref='REF-1'" "1"
chk "والمخزون انخصم مرّة واحدة (10-2)" \
    "select stock::text from products where id='dddddddd-0000-0000-0000-000000000001'" "8.000"
chk "وبنودها ما تكرّرت" \
    "select count(*)::text from invoice_items where invoice_id=(select id from invoices where client_ref='REF-1')" "1"
# وبلا مرجع: السلوك القديم كما هو — كل نداء فاتورة
psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select retail_checkout('$CART'::jsonb, '{}'::jsonb);" >/dev/null 2>&1 || true
psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select retail_checkout('$CART'::jsonb, '{}'::jsonb);" >/dev/null 2>&1 || true
chk "وبلا مرجع يبقى السلوك القديم (فاتورتان)" \
    "select count(*)::text from invoices where client_ref is null and subtotal=2000" "2"

# 0136: والمرتجع كذلك — الخطر هنا أقسى: إعادةٌ تزيد المخزون وتصرف الخزنة مرّتين
$P -c "insert into products(id,clinic_id,stock) values
       ('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',3);" >/dev/null
RCART='[{"product_id":"eeeeeeee-0000-0000-0000-000000000001","name":"مرجَّع","qty":-2,"unit_price":1500,"stock_qty":-2}]'
ret3() { psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select retail_return('$RCART'::jsonb, jsonb_build_object('client_ref','RET-1'));" >/dev/null 2>&1 || true; }
ret3; ret3; ret3
chk "ثلاث محاولات بنفس المرجع = ائتمانُ مخزونٍ واحد (3 + 2)" \
    "select stock::text from products where id='eeeeeeee-0000-0000-0000-000000000001'" "5.000"
chk "وسحبٌ واحد لا ثلاثة" \
    "select count(*)::text from expenses where description like 'راجع: مرجَّع%'" "1"
chk "وبالمبلغ الصحيح مرّةً واحدة" \
    "select sum(amount)::text from expenses where description like 'راجع: مرجَّع%'" "3000.00"
chk "ومرجعٌ واحد انحفظ بنتيجته" \
    "select (result->>'total')::text from rpc_refs where fn='retail_return' and client_ref='RET-1'" "3000.00"
# وبلا مرجع: السلوك القديم كما هو — كل نداء إرجاعٌ مستقلّ
psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select retail_return('$RCART'::jsonb, '{}'::jsonb);" >/dev/null 2>&1 || true
psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  select retail_return('$RCART'::jsonb, '{}'::jsonb);" >/dev/null 2>&1 || true
chk "وبلا مرجع يبقى السلوك القديم (سحبان زيادة)" \
    "select count(*)::text from expenses where description like 'راجع: مرجَّع%'" "3"
chk "والمخزون معهما (5 + 2 + 2)" \
    "select stock::text from products where id='eeeeeeee-0000-0000-0000-000000000001'" "9.000"
# سلّةٌ فاشلة ما تحجز مرجعها: الحجز يتراجع مع الكتلة، فالإعادة تشتغل
$P -c "create or replace function _fprobe() returns text language plpgsql as \$fn\$
begin perform retail_return('[{\"name\":\"x\",\"qty\":0}]'::jsonb, jsonb_build_object('client_ref','RET-DEAD'));
  return 'NOT-GUARDED'; exception when others then return 'guarded'; end \$fn\$;" >/dev/null
chk "وإرجاعٌ فاشل يُرفض" "select _fprobe()" "guarded"
chk "ولا يترك مرجعاً محجوزاً وراءه" \
    "select count(*)::text from rpc_refs where client_ref='RET-DEAD'" "0"
chk "وجدول المراجع ما ينكتب من التطبيق" \
    "select has_table_privilege('authenticated','public.rpc_refs','insert')::text" "false"
chk "والكنس ممنوع على authenticated" \
    "select has_function_privilege('authenticated','public.purge_rpc_refs(int)','execute')::text" "false"
$P -c "update rpc_refs set created_at = now() - interval '30 days';" >/dev/null
chk "والكنس يمسح القديم" "select (public.purge_rpc_refs(7) > 0)::text" "true"

# 0137: الأسقف تُقاس — والحارس يمنع غيرَ المشغّل
$P -c "create or replace function _hprobe() returns text language plpgsql as \$fn\$
begin perform * from public.system_health(); return 'NOT-GUARDED';
exception when others then return 'guarded'; end \$fn\$;" >/dev/null
chk "غيرُ المشغّل ما يشوف الأسقف" "select _hprobe()" "guarded"
chk "وممنوعة على anon" \
    "select has_function_privilege('anon','public.system_health(int)','execute')::text" "false"

# نرفع مفتاحَ المشغّل، فما بعده يُفحص من زاويته هو
$P -c "update _dvtest_flags set admin = true;" >/dev/null
chk "والمشغّل يشوف كل المقاييس" "select count(*)::text from public.system_health()" "7"
chk "والنسبة محسوبة لا فارغة" \
    "select (count(*) = 0)::text from public.system_health() where pct is null" "true"
chk "وحجمُ القاعدة تحت سقف الباقة" \
    "select (pct > 0 and pct < 100)::text from public.system_health() where metric='db_size'" "true"
chk "والأقربُ للسقف يطلع أوّلاً" \
    "select (max(pct) = (array_agg(pct))[1])::text from public.system_health()" "true"

# نبضُ الكنس: صفرٌ وهو حيّ، ويصعد لحظةَ يموت. نزرع صفّاً تجاوز نافذته
# ٣١٠ أيام (٤٠٠ - ٩٠) — وهذا بالضبط ما يبدو عليه جدولٌ توقّف ولا أحد يدري.
chk "تأخّرُ الكنس صفرٌ والجدولة حيّة" \
    "select (value = 0)::text from public.system_health() where metric='audit_purge_lag'" "true"
$P -c "insert into audit_log(clinic_id,action,entity,created_at)
       values (gen_random_uuid(),'X','pets', now() - interval '400 days');" >/dev/null
chk "ويصعد لمّا يتوقّف الكنس" \
    "select (value > 300)::text from public.system_health() where metric='audit_purge_lag'" "true"
chk "فيتجاوز حدَّ الخطر بوضوح" \
    "select (pct > 100)::text from public.system_health() where metric='audit_purge_lag'" "true"
# ولا يُخدع بأثر المال: نافذتُه سنة، فصفٌّ عمره ٤٠٠ يوم متأخّرٌ ٣٥ لا ٣١٠
$P -c "delete from audit_log where created_at < now() - interval '399 days';
       insert into audit_log(clinic_id,action,entity,created_at)
       values (gen_random_uuid(),'X','invoices', now() - interval '400 days');" >/dev/null
chk "وأثرُ المال يُحسب بنافذته هو (سنة لا ٩٠ يوم)" \
    "select (value > 30 and value < 40)::text from public.system_health() where metric='audit_purge_lag'" "true"

# 0139: المُدقِّق يكتب الفرق لا اللقطة
# نبني جدولاً بشكلِ منتَجٍ حقيقيّ (اسم + مخزون + عمودٌ ضخم كالشعار) وعليه
# نفس مُدقِّق الإنتاج، فنقيس السلوك لا النيّة.
$P -c "create table if not exists audit_probe (
         id uuid primary key default gen_random_uuid(),
         clinic_id uuid, name text, stock numeric(14,3), notes text, logo text);
       drop trigger if exists audit_all on audit_probe;
       create trigger audit_all after insert or update or delete on audit_probe
         for each row execute function audit_change();
       delete from audit_log where entity = 'audit_probe';" >/dev/null

$P -c "insert into audit_probe(id, clinic_id, name, stock, notes)
       values ('11111111-0000-0000-0000-0000000000aa',
               '11111111-1111-1111-1111-111111111111','شامبو',10,'ملاحظة');" >/dev/null

chk "الإضافة تُسجَّل" \
    "select count(*)::text from audit_log where entity='audit_probe' and action='INSERT'" "1"
chk "وتحمل الحقول التعريفية" \
    "select (details ? 'name' and details ? 'stock')::text from audit_log where entity='audit_probe' and action='INSERT'" "true"
chk "وما تحمل الحشو (ملاحظاتٌ ما تقرأها الشاشة)" \
    "select (details ? 'notes')::text from audit_log where entity='audit_probe' and action='INSERT'" "false"
chk "ولا تحمل __changed (ماكو ما قبلها)" \
    "select (details ? '__changed')::text from audit_log where entity='audit_probe' and action='INSERT'" "false"

# التعديل: الفرق صريح «كان ← صار»
$P -c "update audit_probe set stock = 3 where id='11111111-0000-0000-0000-0000000000aa';" >/dev/null
chk "التعديل يسجّل الفرق" \
    "select (details->'__changed'->'stock'->>0)::numeric::text from audit_log where entity='audit_probe' and action='UPDATE'" "10.000"
chk "وقيمتَه الجديدة معه" \
    "select (details->'__changed'->'stock'->>1)::numeric::text from audit_log where entity='audit_probe' and action='UPDATE'" "3.000"
chk "والاسم معه كي تسمّيه الشاشة" \
    "select details->>'name' from audit_log where entity='audit_probe' and action='UPDATE'" "شامبو"
chk "وما يسجّل حقلاً ما تغيّر" \
    "select (details->'__changed' ? 'name')::text from audit_log where entity='audit_probe' and action='UPDATE'" "false"

# حقلٌ خارج القائمة يتغيّر: الفرق يمسكه رغم أنه مو تعريفيّ
$P -c "update audit_probe set notes = 'انتبه' where id='11111111-0000-0000-0000-0000000000aa';" >/dev/null
chk "وحقلٌ خارج القائمة ينمسك بالفرق" \
    "select (details->'__changed'->'notes'->>1) from audit_log where entity='audit_probe' and action='UPDATE' order by created_at desc limit 1" "انتبه"

# القيم الضخمة: تُقلَّم بالتخزين، **ولا يخفي التقليمُ تغييراً**
$P -c "update audit_probe set logo = repeat('A',5000) where id='11111111-0000-0000-0000-0000000000aa';" >/dev/null
chk "القيمة الضخمة تنقلّم" \
    "select (details->'__changed'->'logo'->>1 like '[large:%')::text from audit_log where entity='audit_probe' and action='UPDATE' order by created_at desc limit 1" "true"
chk "والسطر يبقى صغيراً" \
    "select (length(details::text) < 500)::text from audit_log where entity='audit_probe' and action='UPDATE' order by created_at desc limit 1" "true"
# الفخّ: شعارٌ آخر بنفس الطول تماماً — التقليم يعطيه نفس العلامة، فلو قارنّا
# المقلَّم لبدا «ما تغيّر». المقارنة على الأصل، فلازم ينمسك.
$P -c "update audit_probe set logo = repeat('B',5000) where id='11111111-0000-0000-0000-0000000000aa';" >/dev/null
chk "وتبديلُ ضخمٍ بضخمٍ بنفس الطول ما ينخفي" \
    "select (details->'__changed' ? 'logo')::text from audit_log where entity='audit_probe' and action='UPDATE' order by created_at desc limit 1" "true"

# الحذف: لقطةٌ كاملة — هذي النسخة الوحيدة
$P -c "delete from audit_probe where id='11111111-0000-0000-0000-0000000000aa';" >/dev/null
chk "الحذف يحفظ الصفّ كاملاً" \
    "select (details ? 'name' and details ? 'notes' and details ? 'stock')::text from audit_log where entity='audit_probe' and action='DELETE'" "true"
chk "وبقيمه الأخيرة" \
    "select details->>'notes' from audit_log where entity='audit_probe' and action='DELETE'" "انتبه"

# والحجم: هذا سببُ الشغل كلّه. نقيسه على صفٍّ بعرض فاتورةٍ حقيقية (٢٢ عموداً)
# لا على جدولٍ ضيّق، وإلا بدا التوفير أقلّ مما هو. والحدّ حارسٌ دائم: لو زاد
# أحدٌ قائمةَ الحقول التعريفية حتى صار السطر ثقيلاً، ينكسر الفحص.
$P -c "alter table audit_probe
         add column if not exists subtotal numeric(14,2),
         add column if not exists discount numeric(14,2),
         add column if not exists discount_type text,
         add column if not exists amount_paid numeric(14,2),
         add column if not exists cost_total numeric(14,2),
         add column if not exists profit numeric(14,2),
         add column if not exists item_count int,
         add column if not exists customer_phone text,
         add column if not exists payment_method text,
         add column if not exists payment_details jsonb,
         add column if not exists barcode text,
         add column if not exists unit_label text,
         add column if not exists created_at timestamptz default now(),
         add column if not exists client_ref text;
       delete from audit_log where entity = 'audit_probe';
       insert into audit_probe(id, clinic_id, name, stock, notes, subtotal, discount,
                               discount_type, amount_paid, cost_total, profit, item_count,
                               customer_phone, payment_method, barcode, unit_label, client_ref)
       values ('11111111-0000-0000-0000-0000000000bb',
               '11111111-1111-1111-1111-111111111111','فاتورة عريضة',1,'ملاحظة طويلة نوعاً ما',
               69750,6000,'fixed',63750,44895,18855,31,'07701234567','cash',
               '6221033001234','علبة','s-mtgzh0td-o3yrwcqt');
       update audit_probe set amount_paid = 60000 where id='11111111-0000-0000-0000-0000000000bb';" >/dev/null

chk "سطرُ التعديل أصغر بمرّاتٍ من اللقطة الكاملة (٤ مرّات فأكثر)" \
    "select (length(a.details::text) * 4 < length(to_jsonb(p)::text))::text
       from audit_log a, audit_probe p
      where a.entity='audit_probe' and a.action='UPDATE'
        and p.id='11111111-0000-0000-0000-0000000000bb'" "true"
chk "ومع ذلك يحمل الفرق كاملاً" \
    "select (a.details->'__changed'->'amount_paid'->>0)::numeric::text
       from audit_log a where a.entity='audit_probe' and a.action='UPDATE'" "63750.00"

# والتدقيق ما يُفشل العملية أبداً — حتى لو انهار
$P -c "create or replace function _audit_boom() returns trigger language plpgsql as \$fn\$
begin raise exception 'boom'; end \$fn\$;" >/dev/null
chk "ولا يزال المُدقِّق يبلع أخطاءه" \
    "select (details is not null)::text from audit_log where entity='audit_probe' order by created_at desc limit 1" "true"

# 0140: السحب على حساب الشهر — العمود والقيد والدالّة الجديدة، بلا ازدواج.
# المخطّط هنا هيكلٌ لجداول الرواتب (0112 خارج الحزمة)، فنفحص الشكل لا السلوك؛
# السلوك (القصّ والتسوية والحرّاس) مفحوصٌ على المنطق نفسه بـscripts/payroll-test.mjs.
chk "عمودُ النوع انضاف على السلف" \
    "select count(*)::text from information_schema.columns where table_schema='public' and table_name='staff_loans' and column_name='kind'" "1"
chk "وافتراضُه سلفة — فكلُّ القائم سلف" \
    "select column_default from information_schema.columns where table_schema='public' and table_name='staff_loans' and column_name='kind'" "'loan'::text"
chk "وقيدُه موجود مرّةً واحدة رغم إعادة التنزيل" \
    "select count(*)::text from pg_constraint where conname='staff_loans_kind_chk'" "1"
ins "insert into staff_loans(kind) values ('advance');" \
  && printf '   ✓ %s\n' "ويقبل «سحباً»" || { printf '   ✗ %s\n' "رفض «سحباً»"; fail=1; }
ins "insert into staff_loans(kind) values ('x');" \
  && { printf '   ✗ %s\n' "قبل نوعاً مجهولاً"; fail=1; } || printf '   ✓ %s\n' "ويرفض نوعاً مجهولاً"
chk "ودالّةُ السحب بتوقيعٍ واحد لا نسختين" \
    "select count(*)::text from pg_proc where proname='payroll_disburse_advance'" "1"
chk "وممنوعة على anon" \
    "select has_function_privilege('anon','public.payroll_disburse_advance(uuid,numeric,text,text)','execute')::text" "false"
chk "ومسموحة للمصادَق" \
    "select has_function_privilege('authenticated','public.payroll_disburse_advance(uuid,numeric,text,text)','execute')::text" "true"
chk "ودالّةُ الاعتماد واحدة" \
    "select count(*)::text from pg_proc where proname='payroll_approve'" "1"
chk "وتسوّي السحب مع القسط" \
    "select (prosrc like '%''LOAN'',''ADV''%')::text from pg_proc where proname='payroll_approve'" "true"
chk "وبمسارٍ مثبَّت (definer-path)" \
    "select (count(*) = 2)::text from pg_proc where proname in ('payroll_approve','payroll_disburse_advance') and 'search_path=public' = any(proconfig)" "true"

echo
[ $fail -eq 0 ] && echo "✓ كل الفحوص عبرت" || { echo "✗ اكو فحصٌ فشل"; exit 1; }
