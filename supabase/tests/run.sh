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
# و0095/0096/0158 بالمقدّمة رغم أنها أقدمُ من 0124: الموجةُ تبدأ من 0124 لأن
# الأساس يوفّر ما قبلها جاهزاً — لكنّ هذه الثلاثَ تُنشئ المتجرَ والبوّابة،
# وكانت خارجَ الفحص كلَّه. تُنزَّل بترتيبها الحقيقيّ قبل الموجة.
WAVE="$MIG/0095_store.sql $MIG/0096_store_read_hardening.sql $MIG/0158_owner_portal.sql $MIG/0114_landing_events.sql $MIG/0124_sold_by_weight.sql $MIG/0125_perf_indexes.sql $MIG/0126_pet_serial.sql $MIG/0127_audit_retention.sql $MIG/0128_rls_initplan.sql $MIG/0129_audit_tiered_retention.sql $MIG/0130_verify_rls.sql $MIG/0131_invoice_items_allow_returns.sql $MIG/0132_retail_return.sql $MIG/0133_invoice_items_dated.sql $MIG/0134_widen_numerics.sql $MIG/0135_checkout_idempotent.sql $MIG/0136_return_idempotent.sql $MIG/0137_system_health.sql $MIG/0138_cron_schedule.sql $MIG/0139_audit_diff.sql $MIG/0140_payroll_advances.sql $MIG/0141_barcode_recovery.sql $MIG/0142_payroll_adjustments.sql $MIG/0143_payroll_unapprove.sql $MIG/0144_merge_products.sql $MIG/0145_product_trash.sql $MIG/0146_products_never_vanish.sql $MIG/0147_pos_layout_prefs.sql $MIG/0148_delivery_companies.sql $MIG/0149_report_aggregates.sql $MIG/0150_invoices_paged.sql $MIG/0151_platform_console.sql $MIG/0152_activity_center.sql $MIG/0153_workspace_says_acting.sql $MIG/0154_manager_mode_stock_edit.sql $MIG/0155_company_charges.sql $MIG/0156_wholesale_marker.sql $MIG/0157_delivery_never_vanishes.sql $MIG/0159_delivery_policy_recursion.sql $MIG/0160_rls_coverage.sql $MIG/0161_catalog_privacy.sql $MIG/0162_policy_self_reference.sql $MIG/0163_rpc_exposure.sql $MIG/0164_code_norm_parity.sql $MIG/0165_lookup_and_restore.sql $MIG/0166_purchase_matches_alt_codes.sql $MIG/0167_no_twin_barcode.sql $MIG/0168_barcode_health.sql $MIG/0169_tidy_inherits_codes.sql $MIG/0170_platform_session_expiry.sql $MIG/0171_pool_product_atomic.sql $MIG/0172_code_variants_server.sql $MIG/0173_variants_ordered.sql $MIG/0174_product_images.sql $MIG/0175_image_library.sql $MIG/0176_store_order_track.sql $MIG/0177_store_featured.sql $MIG/0178_store_read_unbounded.sql $MIG/0179_product_images_select.sql $MIG/0180_delivery_once_per_invoice.sql $MIG/0181_policies_initplan.sql $MIG/0182_store_catalog_stable_order.sql $MIG/0183_store_accept_atomic.sql $MIG/0184_images_hardening.sql $MIG/0185_store_funnel_events.sql $MIG/0186_store_bulk_visible.sql $MIG/0187_store_suggest_products.sql $MIG/0188_store_catalog_priced.sql $MIG/0189_accept_fee_at_decision.sql $MIG/0190_logo_out_of_db.sql $MIG/0191_poultry_farms.sql $MIG/0192_poultry_consume.sql $MIG/0193_poultry_withdrawal.sql $MIG/0194_end_elevation_honest.sql $MIG/0195_cage_layout_sync.sql $MIG/0196_company_norm_and_merge.sql $MIG/0197_company_merge_safe.sql $MIG/0198_company_delete_restores_all.sql $MIG/0199_company_name_unique.sql $MIG/0200_company_twins_per_row.sql $MIG/0201_merge_snapshot_exact.sql $MIG/0202_group_key_invisible.sql $MIG/0203_restore_needs_its_target.sql $MIG/0204_cage_layout_one_door.sql $MIG/0205_purchase_edit_invents_no_stock.sql $MIG/0206_purge_stays_with_cron.sql $MIG/0207_product_movements.sql $MIG/0208_reminder_marks.sql $MIG/0209_activity_relink.sql $MIG/0210_expiry.sql $MIG/0211_purchase_effects.sql $MIG/0212_store_no_expired.sql $MIG/0213_scan_shape_stats.sql $MIG/0214_light_batches.sql $MIG/0215_reorder.sql $MIG/0216_stock_count.sql $MIG/0217_product_lots.sql $MIG/0218_wa_templates.sql $MIG/0219_cages_first_class.sql $MIG/0220_cage_backfill.sql $MIG/0221_drug_favorites.sql $MIG/0222_photographer.sql $MIG/0223_vaccination_recorded_at.sql $MIG/0224_company_ledger.sql $MIG/0225_delivery_courier_ref.sql $MIG/0226_price_changes.sql"

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
# كان هنا: «السياسةُ تحرس المبالغ بنصّها» — وهو وصفُ عالَمٍ انتهى بـ0162.
# سياسةٌ تقرأ جدولَها المحميّ يرفضها بوستغريس بإعادة كتابة الاستعلام (42P17)
# فتُسقط **كلَّ** تحديثٍ عليه؛ فصار التجميدُ بمحفّزٍ والسياسةُ شرطَ ملكيّةٍ وحده
# (CLAUDE.md §٣). والفحصُ ما جرى قطّ ليُكشف: حلقةُ إعادة التنزيل كانت تسقط قبله.
# فيُثبَّت القرارُ كما هو الآن: السياسةُ ملكيّةٌ صرفة، والحراسةُ بالمحفّز.
chk "والسياسةُ شرطُ ملكيّةٍ صرف (لا تقرأ جدولَها — 42P17)" \
    "select (with_check not like '%amount_paid%' and with_check not like '%auth_role%' and with_check like '%auth_clinic%')::text from pg_policies where policyname='invoices_update'" "true"
chk "  والحراسةُ بالمحفّز: يقرأ المبلغَ والدور" \
    "select (p.prosrc like '%amount_paid%' and p.prosrc like '%auth_role%')::text
       from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid='invoices'::regclass and t.tgname='invoices_before_update_guard'" "true"
chk "  وهو invoker لا definer (فلا يشدّ أكثر من السياسة)" \
    "select (not p.prosecdef)::text from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid='invoices'::regclass and t.tgname='invoices_before_update_guard'" "true"
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

# 0141: الباركود لا يضيّع المنتج.
# نزرع الأمراض الثلاثة التي وجدناها بالإنتاج حرفياً — علامةُ اتجاهٍ مخفية،
# وأرقامٌ شرقية، ومسافة — ونتأكّد أن التنظيف يشفيها بلا أن يدمج صفَّين.
# هذه البذرةُ تصنع عمداً ما يمنعه محفّزُ 0167: رمزَين يفترقان خامّاً ويتّحدان
# مطبَّعَين (`555` و`‏555`). وهو تاريخٌ **قائمٌ بالإنتاج** دخل قبل الحارس، وفحصُ
# 0141 قائمٌ عليه — فلا سبيلَ لزرعه إلا بتعطيل الحارس لحظةَ الزرع.
# ويُفحص رجوعُه بعدها: حارسٌ يُعطَّل ويُنسى أخطرُ من حارسٍ لم يوجد.
$P -c "alter table products disable trigger products_no_twin_code;" >/dev/null 2>&1
$P -c "insert into products(id,clinic_id,name,barcode) values
       ('bbbb0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','مخفي',   E'‏8989'),
       ('bbbb0000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','شرقي',   '٢٣٨'),
       ('bbbb0000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','مسافة',  ' 247 '),
       ('bbbb0000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','سليم',   '6972748378670'),
       -- زوجُ التصادم: النظيفُ محجوزٌ سلفاً، فالمريض لا يُلمس ولا يُدمج
       ('bbbb0000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','محجوز',  '555'),
       ('bbbb0000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','مصادم',  E'‏555');" >/dev/null
$P -c "alter table products enable trigger products_no_twin_code;" >/dev/null 2>&1
chk "محفّزُ التوأم رجع مفعَّلاً بعد زرع التاريخ" \
    "select (tgenabled='O')::text from pg_trigger where tgrelid='products'::regclass and tgname='products_no_twin_code'" "true"
$P -f "$MIG/0141_barcode_recovery.sql" >/dev/null 2>&1
# 0141 تُعرّف `product_by_code` أيضاً، وإعادةُ تنزيلها هنا — بعد الموجة كلِّها —
# **تدهس** نسخةَ 0165 الحتميّةَ الترتيب وترجع نسختَها القديمة. فتفشل فحوصُ G5
# بعدها لسببٍ لا علاقةَ له بها. الحلُّ إعادةُ الأحدث بعد الأقدم: من يعيد تنزيل
# هجرةٍ وسط الفحوص يعيد معها كلَّ من عدّل ما عدّلته.
$P -f "$MIG/0165_lookup_and_restore.sql" >/dev/null 2>&1
# و0172 تعدّل `product_by_code` بعد 0165 — فتُعاد بعدها بنفس المنطق، وإلا
# فحصنا نسخةً ماتت قبل أن تصل الإنتاج. العلّةُ نفسُها بنفس السطر مرّتين.
$P -f "$MIG/0172_code_variants_server.sql" >/dev/null 2>&1
$P -f "$MIG/0173_variants_ordered.sql" >/dev/null 2>&1
# و0191 تعدّلها بعد 0173 (مخزنُ الحقل خارجُ الماسح) — **المرّةُ الثالثة** لنفس
# السطر. فمن يمسّ `product_by_code` بهجرةٍ جديدة يضيف سطرَه هنا، وإلا فحصُ
# «كاشيرُ العيادة لا يمسح علفاً» بآخر الملفّ يسقط ويدلّه على هذا الموضع.
$P -f "$MIG/0191_poultry_farms.sql" >/dev/null 2>&1
# و0193 توسّع `poultry_cycle_stats` التي تُنشئها 0191 — فإعادةُ 0191 وحدَها
# **تضيّقها**، ويسقط فحصُ فترة السحب بآخر الملفّ بخطأٍ لا علاقةَ له به
# («column safe_from does not exist»). السلسلةُ صارت ستّةَ ملفّات: من يمسّ
# `product_by_code` أو `poultry_cycle_stats` يضيف ملفَّه هنا.
$P -f "$MIG/0193_poultry_withdrawal.sql" >/dev/null 2>&1

chk "علامةُ الاتجاه انشالت من الباركود" \
    "select barcode from products where id='bbbb0000-0000-0000-0000-000000000001'" "8989"
chk "والأرقام الشرقية انوحّدت" \
    "select barcode from products where id='bbbb0000-0000-0000-0000-000000000002'" "238"
chk "والمسافات انشالت" \
    "select barcode from products where id='bbbb0000-0000-0000-0000-000000000003'" "247"
chk "والسليم ما انتغيّر" \
    "select barcode from products where id='bbbb0000-0000-0000-0000-000000000004'" "6972748378670"
chk "وصفٌّ نظيفُه محجوزٌ لغيره ما انلمس — ولا انخلط منتجان" \
    "select (barcode = E'‏555')::text from products where id='bbbb0000-0000-0000-0000-000000000006'" "true"

chk "المسحُ يلقى المنتج برمزه الأساسي" \
    "select name from public.product_by_code('8989')" "مخفي"
$P -c "select public.attach_product_code('bbbb0000-0000-0000-0000-000000000004','999111');" >/dev/null
chk "والرمزُ الإضافي انضاف" \
    "select (alt_codes @> array['999111'])::text from products where id='bbbb0000-0000-0000-0000-000000000004'" "true"
chk "والرمزُ الأساسي بقي كما هو — ما انمحى" \
    "select barcode from products where id='bbbb0000-0000-0000-0000-000000000004'" "6972748378670"
chk "والمسحُ يلقاه بالرمز الإضافي أيضاً" \
    "select name from public.product_by_code('999111')" "سليم"
$P -c "create or replace function _acode(p uuid, c text) returns text language plpgsql as \$fn\$
begin perform public.attach_product_code(p, c); return 'NOT-GUARDED';
exception when others then return 'guarded'; end \$fn\$;" >/dev/null
chk "ورمزٌ مأخوذٌ لمنتجٍ آخر يُرفض" \
    "select _acode('bbbb0000-0000-0000-0000-000000000001','999111')" "guarded"
chk "ورمزٌ فارغ يُرفض" \
    "select _acode('bbbb0000-0000-0000-0000-000000000001','  ')" "guarded"
chk "وإعادةُ ربطِ نفس الرمز لنفس المنتج ما تكرّره" \
    "select array_length(alt_codes,1)::text from products where id='bbbb0000-0000-0000-0000-000000000004'" "1"
chk "ودالّتا 0141 ممنوعتان على anon" \
    "select (has_function_privilege('anon','public.product_by_code(text)','execute')
          or has_function_privilege('anon','public.attach_product_code(uuid,text)','execute'))::text" "false"
chk "وفهرسُ الرموز الإضافية موجود" \
    "select count(*)::text from pg_indexes where indexname='products_alt_codes_idx'" "1"

# ── 0142: البند اليدوي صفٌّ يُتراكم ويُردّ، والتسليم يُفَكّ ────────────────
# الشكوى كانت «بس قطع واحد باليوم». فهنا نتحقّق من البنية التي أنهتها: جدولٌ
# بمفتاح (موظف، شهر)، وقيدٌ يمنع ردّاً فوق الأصل، ودوالٌّ ممنوعةٌ على anon.
echo "▸ 0142: البنود اليدوية والتراجع"

chk "جدولُ البنود موجود وعليه RLS" \
    "select relrowsecurity::text from pg_class where relname='payroll_adjustments'" "true"
chk "ولا سياسةَ كتابة عليه — كلُّ كتابةٍ من دالّة" \
    "select count(*)::text from pg_policies where tablename='payroll_adjustments' and cmd<>'SELECT'" "0"
chk "وفهرسُ مفتاحِ الموظف موجود (الحذف المتسلسل يبحث به)" \
    "select count(*)::text from pg_indexes where indexname='payroll_adjustments_staff_idx'" "1"
chk "وقيدُ «لا ردَّ فوق الأصل» مثبَّت" \
    "select count(*)::text from pg_constraint where conname='payroll_adjustments_not_over_reversed'" "1"

# القيد يُفحص بالقاعدة لا بالنيّة: ردٌّ أكبر من الأصل لازم يُرفض حتى لو تسلّل
# إليه أحدٌ بـSQL مباشر — وإلا صار «الردّ» زيادةً على الراتب من حيث لا يُدرى.
$P -c "insert into staff (id) values ('cccc0000-0000-0000-0000-00000000ad01') on conflict do nothing" >/dev/null 2>&1
ins "insert into payroll_adjustments (clinic_id, staff_id, period, code, amount, reversed_amount)
     values ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-00000000ad01','2026-09-01','PEN', 10000, 4000);" \
  && printf '   ✓ %s\n' "ردٌّ جزئيٌّ دون الأصل ينقبل" || { printf '   ✗ %s\n' "رفض ردّاً جزئياً سليماً"; fail=1; }
ins "insert into payroll_adjustments (clinic_id, staff_id, period, code, amount, reversed_amount)
     values ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-00000000ad01','2026-09-01','PEN', 10000, 10001);" \
  && { printf '   ✗ %s\n' "قبل ردّاً أكبر من الأصل"; fail=1; } || printf '   ✓ %s\n' "ويرفض ردّاً أكبر من الأصل"
ins "insert into payroll_adjustments (clinic_id, staff_id, period, code, amount)
     values ('11111111-1111-1111-1111-111111111111','cccc0000-0000-0000-0000-00000000ad01','2026-09-01','PEN', -1);" \
  && { printf '   ✗ %s\n' "قبل مبلغاً سالباً"; fail=1; } || printf '   ✓ %s\n' "ويرفض مبلغاً سالباً"

chk "ودوالُّ 0142 ممنوعةٌ على anon" \
    "select (has_function_privilege('anon','public.payroll_add_adjustment(uuid,date,text,numeric,numeric,text)','execute')
          or has_function_privilege('anon','public.payroll_reverse_adjustment(uuid,numeric,numeric,text)','execute')
          or has_function_privilege('anon','public.payroll_unpay_slip(uuid)','execute'))::text" "false"
chk "ومسارُ البحث مثبَّتٌ بكل دوالّ 0142" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('payroll_add_adjustment','payroll_delete_adjustment','payroll_reverse_adjustment',
         'payroll_unpay_slip','payroll_period_frozen')
        and not (coalesce(array_to_string(p.proconfig,','),'') like '%search_path%')" "0"

# ── 0143: فكّ الاعتماد ────────────────────────────────────────────────────
# السلوك (إرجاع الأقساط لأرصدتها) مفحوصٌ على المنطق نفسه بـpayroll-test؛
# وهنا نفحص ما لا يُفحص إلا على قاعدةٍ حقيقية: التنزيل والصلاحيات والمسار.
echo "▸ 0143: فكّ الاعتماد"

chk "دالّةُ الفكّ بتوقيعٍ واحد لا نسختين" \
    "select count(*)::text from pg_proc where proname='payroll_unapprove_run'" "1"
chk "وممنوعة على anon" \
    "select has_function_privilege('anon','public.payroll_unapprove_run(uuid)','execute')::text" "false"
chk "ومسموحة للمصادَق" \
    "select has_function_privilege('authenticated','public.payroll_unapprove_run(uuid)','execute')::text" "true"
chk "وبمسارٍ مثبَّت (definer-path)" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='payroll_unapprove_run'
        and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%'" "1"

# ── 0144: دمج التوائم — الرصيد يُجمع، والرمز يلحق، والفواتير تعود للأصل ──
# الشكوى بأكثر من عيادة: «ندخل المادة ونبيع، وبعدين ما نلقاها فنرجع ندخلها».
# القياس: المادة موجودة تحت رمزٍ آخر. فالدمج يطوي النسخة في أصلها بلا فقد.
echo "▸ 0144: دمج التوائم"

# رقمُ الرفّ هنا `2471` لا `247`: كتلةُ 0141 أعلاه تحجز `247` لنفس العيادة
# (الصفُّ «مسافة» تُطبّعه الهجرةُ من `' 247 '` إلى `247`). وقبل الفهرس الفريد
# بالأساس كان الصفّان يتعايشان — وهي حالةٌ **مستحيلةٌ بالإنتاج**، فالفهرسُ هناك
# قائمٌ منذ 0007. فلمّا صار الأساسُ يقيس عالَمَ الإنتاج رفضها المحفّزُ (0167)
# قبل أن يصل الفهرس، و`on conflict do nothing` لا تمسك استثناءَ محفّز.
# والدمجُ لا يحتاج توأماً مطبَّعاً أصلاً — التصادمُ كان تلوّثاً بين كتلتين.
$P -c "insert into products (id, clinic_id, name, barcode, stock, min_stock)
       values ('dddd0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','سبري حشرات خارجية','2471', 3, 5),
              ('dddd0000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','سبري حشرات خارجيه','6972748378671', 7, 2),
              ('dddd0000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','مجمّع','999', 1, null)
       on conflict do nothing;
       update products set pooled = true where id='dddd0000-0000-0000-0000-000000000003';
       insert into invoice_items (name, qty, unit_price, unit_cost, line_total, stock_qty, product_id)
       values ('x', 1, 1000, 600, 1000, 1, 'dddd0000-0000-0000-0000-000000000002');" >/dev/null 2>&1

$P -c "create or replace function _merge_try(a uuid, b uuid) returns text language plpgsql as \$fn\$
       begin perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
             perform merge_products(a, b); return 'merged';
       exception when others then return 'guarded: ' || sqlerrm; end \$fn\$;" >/dev/null
chk "دمجُ المنتج بنفسه يُرفض" \
    "select left(_merge_try('dddd0000-0000-0000-0000-000000000001','dddd0000-0000-0000-0000-000000000001'), 7)" "guarded"
chk "والمجمَّع (pooled) لا يُدمَج" \
    "select left(_merge_try('dddd0000-0000-0000-0000-000000000001','dddd0000-0000-0000-0000-000000000003'), 7)" "guarded"
chk "ودمجُ توأمين حقيقيين يمرّ" \
    "select _merge_try('dddd0000-0000-0000-0000-000000000001','dddd0000-0000-0000-0000-000000000002')" "merged"
chk "الرصيد انجمع: ٣ + ٧ = ١٠" \
    "select (stock = 10)::text from products where id='dddd0000-0000-0000-0000-000000000001'" "true"
chk "ورمزُ النسخة صار رمزاً إضافياً للأصل" \
    "select (alt_codes @> array['6972748378671'])::text from products where id='dddd0000-0000-0000-0000-000000000001'" "true"
chk "والرمزُ الأساسي للأصل ما انمسّ" \
    "select barcode from products where id='dddd0000-0000-0000-0000-000000000001'" "2471"
chk "وحدُّ التنبيه أخذ الأعلى (٥ لا ٢)" \
    "select min_stock::text from products where id='dddd0000-0000-0000-0000-000000000001'" "5"
chk "وسطرُ الفاتورة رجع للأصل — ما صار بلا صنف" \
    "select count(*)::text from invoice_items where product_id='dddd0000-0000-0000-0000-000000000001'" "1"
chk "والنسخة انحذفت" \
    "select count(*)::text from products where id='dddd0000-0000-0000-0000-000000000002'" "0"
chk "والدالّة بصلاحية المُعرِّف (0146: تكتب بالسلّة) وتفحص العيادة بنفسها" \
    "select (prosecdef and prosrc like '%auth_clinic()%' and prosrc like '%clinic_id = v_clinic%')::text from pg_proc where proname='merge_products'" "true"
chk "وممنوعة على anon" \
    "select has_function_privilege('anon','public.merge_products(uuid,uuid)','execute')::text" "false"
chk "وبمسارٍ مثبَّت" \
    "select (coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text from pg_proc where proname='merge_products'" "true"

# ── 0145: الحذفُ طيٌّ لا محو — سلّةٌ واسترجاعٌ بنفس المعرّف والفواتير ──
# القياس بعيادتين: المادة «اختفت كأنها ما كانت» لأنها حُذفت من الزرّ، والحذف
# كان يمحو الصفَّ ويصفّر product_id بسطور الفواتير. هنا يُختبر أن الحذف يحفظ
# الصورةَ والسطور، وأن الاسترجاع يعيدهما، وأن الاسترجاع الثاني يُرفض.
echo "▸ 0145: سلّة المحذوفات"

$P -c "insert into products (id, clinic_id, name, barcode, stock)
       values ('eeee0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','دراي فود رويال','3182550711159', 4),
              ('eeee0000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','سانك تونا','854871008371', 99)
       on conflict do nothing;
       insert into invoice_items (id, name, qty, unit_price, unit_cost, line_total, stock_qty, product_id)
       values ('eeee1111-0000-0000-0000-000000000001','x', 2, 1000, 600, 2000, 2, 'eeee0000-0000-0000-0000-000000000001');
       insert into generated_barcodes (id, product_id) values ('eeee2222-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000001');" >/dev/null 2>&1

$P -c "create or replace function _del_try(a uuid) returns text language plpgsql as \$fn\$
       begin perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
             perform delete_product(a, 'test'); return 'deleted';
       exception when others then return 'guarded: ' || sqlerrm; end \$fn\$;
       create or replace function _del_noauth(a uuid) returns text language plpgsql as \$fn\$
       begin perform delete_product(a, 'test'); return 'deleted';
       exception when others then return 'guarded: ' || sqlerrm; end \$fn\$;
       create or replace function _restore_try(a uuid) returns text language plpgsql as \$fn\$
       begin perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
             perform restore_product(a); return 'restored';
       exception when others then return 'guarded: ' || sqlerrm; end \$fn\$;" >/dev/null
chk "حذفُ معرّفٍ غير موجود يُرفض" \
    "select left(_del_try('eeee0000-0000-0000-0000-0000000000ff'), 7)" "guarded"
chk "وبلا جلسةٍ لا حذف — الدالّة بصلاحية المُعرِّف فتفحص العيادة بنفسها" \
    "select _del_noauth('eeee0000-0000-0000-0000-000000000001')" "guarded:notauthenticated"
chk "والحذفُ يرجع كم انباع منه (٢)" \
    "select ((delete_product('eeee0000-0000-0000-0000-000000000001', 'غلط')->>'sold_qty')::numeric = 2)::text
       from (select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true)) s" "true"
chk "المنتج ما عاد بالمخزن" \
    "select count(*)::text from products where id='eeee0000-0000-0000-0000-000000000001'" "0"
chk "لكنه بالسلّة بصورته: الرصيد ٤ والسبب محفوظ" \
    "select ((stock = 4) and reason = 'غلط' and row->>'name' = 'دراي فود رويال')::text from products_trash where id='eeee0000-0000-0000-0000-000000000001'" "true"
chk "ومعرّفاتُ سطور الفاتورة والملصق محفوظة" \
    "select (cardinality(invoice_item_ids) = 1 and cardinality(barcode_ids) = 1)::text from products_trash where id='eeee0000-0000-0000-0000-000000000001'" "true"
chk "وسطرُ الفاتورة صار بلا صنف (set null) — كما كان يحصل بصمت" \
    "select count(*)::text from invoice_items where id='eeee1111-0000-0000-0000-000000000001' and product_id is null" "1"
chk "الاسترجاع يمرّ" \
    "select _restore_try('eeee0000-0000-0000-0000-000000000001')" "restored"
chk "ورجع بنفس المعرّف والباركود والرصيد" \
    "select (barcode = '3182550711159' and stock = 4)::text from products where id='eeee0000-0000-0000-0000-000000000001'" "true"
chk "وسطرُ الفاتورة رجع لصنفه — التقرير يستعيد اسمه" \
    "select count(*)::text from invoice_items where id='eeee1111-0000-0000-0000-000000000001' and product_id='eeee0000-0000-0000-0000-000000000001'" "1"
chk "والملصق كذلك" \
    "select count(*)::text from generated_barcodes where id='eeee2222-0000-0000-0000-000000000001' and product_id='eeee0000-0000-0000-0000-000000000001'" "1"
chk "والسلّة انفرغت منه" \
    "select count(*)::text from products_trash where id='eeee0000-0000-0000-0000-000000000001'" "0"
chk "واسترجاعٌ ثانٍ يُرفض" \
    "select left(_restore_try('eeee0000-0000-0000-0000-000000000001'), 7)" "guarded"
# الباركود انشغل أثناء الغياب: يرجع بلا باركود ولا يكسر القيد.
$P -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
       select delete_product('eeee0000-0000-0000-0000-000000000002', null);
       insert into products (id, clinic_id, name, barcode, stock)
       values ('eeee0000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','سانك تونا (معاد)','854871008371', 1);" >/dev/null 2>&1
chk "منتجٌ أُعيد إدخاله بنفس الباركود أثناء الغياب: الاسترجاع يمرّ" \
    "select _restore_try('eeee0000-0000-0000-0000-000000000002')" "restored"
chk "ويرجع بلا باركود بدل أن يكسر التفرّد" \
    "select (barcode is null and stock = 99)::text from products where id='eeee0000-0000-0000-0000-000000000002'" "true"
chk "السلّة محميّة بسياسات الصفوف" \
    "select relrowsecurity::text from pg_class where relname='products_trash'" "true"
chk "والدالّتان بصلاحية المُعرِّف (السلّة بلا سياسة كتابة) وتفحصان العيادة بنفسيهما" \
    "select count(*)::text from pg_proc where proname in ('delete_product','restore_product') and prosecdef
       and prosrc like '%auth_clinic()%' and prosrc like '%clinic_id = v_clinic%'" "2"
chk "والسلّة ما عليها أي سياسة كتابة — كلُّ كتابةٍ من دالّة" \
    "select count(*)::text from pg_policies where tablename='products_trash' and cmd <> 'SELECT'" "0"
chk "وممنوعتان على anon" \
    "select (has_function_privilege('anon','public.delete_product(uuid,text)','execute') or has_function_privilege('anon','public.restore_product(uuid)','execute'))::text" "false"
chk "وبمسارٍ مثبَّت" \
    "select count(*)::text from pg_proc where proname in ('delete_product','restore_product') and coalesce(array_to_string(proconfig,','),'') like '%search_path%'" "2"

# ── 0146: لا يُفلت منتج — كلُّ طريقٍ يُخرج صفّاً يمرّ بالسلّة، والدمجُ يُفكّ ──
# المراجعة العميقة وجدت ثلاثة طرقٍ تحذف بلا سلّة (دمج، ترتيب، حذف مباشر من
# نسخةٍ قديمة). المحفّز يغطّيها كلّها، والدمجُ صار يُفكّ من تبويب المحذوفات.
echo "▸ 0146: لا يُفلت منتج"
JWT="select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);"

$P -c "insert into products (id, clinic_id, name, barcode, stock, alt_codes) values
         ('f0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','توأم يُدمج','X100', 5, array['X101']),
         ('f0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','الأصل','X200', 10, '{}'),
         ('f0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','يُحذف مباشرة','X300', 7, '{}'),
         ('f0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','بلا صنف','X400', 2, '{}'),
         ('f0000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','مصنّف', null, 3, '{}')
       on conflict do nothing;
       insert into companies (id, clinic_id, name) values
         ('aaaa0000-0000-0000-0000-00000000cccc','11111111-1111-1111-1111-111111111111','شركة فحص 0146') on conflict do nothing;
       insert into company_sections (id, clinic_id, company_id, name) values
         ('aaaa0000-0000-0000-0000-00000000aaaa','11111111-1111-1111-1111-111111111111','aaaa0000-0000-0000-0000-00000000cccc','صنف فحص 0146') on conflict do nothing;
       update products set section_id = 'aaaa0000-0000-0000-0000-00000000aaaa', name = 'بلا صنف' where id = 'f0000000-0000-0000-0000-000000000005';
       insert into invoice_items (id, clinic_id, name, qty, unit_price, unit_cost, line_total, stock_qty, product_id) values
         ('f1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','x',1,1000,600,1000,1,'f0000000-0000-0000-0000-000000000001'),
         ('f1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','x',1,1000,600,1000,1,'f0000000-0000-0000-0000-000000000003'),
         ('f1000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','x',1,1000,600,1000,1,'f0000000-0000-0000-0000-000000000004');" >/dev/null 2>&1

chk "المحفّز واقفٌ على الجدول قبل الحذف" \
    "select count(*)::text from pg_trigger where tgname='products_trash_guard' and not tgisinternal" "1"
# ١) الدمج يصوّر ثم يُفكّ
chk "الدمج يمرّ" \
    "select _merge_try('f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000001')" "merged"
chk "والنسخة بالسلّة موسومةً بأصلها" \
    "select (merged_into = 'f0000000-0000-0000-0000-000000000002' and cardinality(invoice_item_ids) = 1 and stock = 5)::text from products_trash where id='f0000000-0000-0000-0000-000000000001'" "true"
chk "والأصل أخذ الرصيد والرمزين (١٠ + ٥)" \
    "select (stock = 15 and alt_codes @> array['X100','X101'])::text from products where id='f0000000-0000-0000-0000-000000000002'" "true"
chk "فكُّ الدمج يمرّ" \
    "select _restore_try('f0000000-0000-0000-0000-000000000001')" "restored"
chk "والأصل ردّ الرصيد والرمزين" \
    "select (stock = 10 and not (alt_codes @> array['X100']) and not (alt_codes @> array['X101']))::text from products where id='f0000000-0000-0000-0000-000000000002'" "true"
chk "والنسخة رجعت بباركودها ورصيدها" \
    "select (barcode = 'X100' and stock = 5)::text from products where id='f0000000-0000-0000-0000-000000000001'" "true"
chk "وسطرُ فاتورتها رجع إليها من الأصل" \
    "select product_id::text from invoice_items where id='f1000000-0000-0000-0000-000000000001'" "f0000000-0000-0000-0000-000000000001"
# ٢) حذفٌ مباشر من الجدول (نسخة قديمة / PostgREST) — المحفّز يمسكه
$P -c "$JWT delete from products where id='f0000000-0000-0000-0000-000000000003';" >/dev/null 2>&1
chk "حذفٌ مباشر بلا دالّة: الصفّ بالسلّة بسطوره" \
    "select (cardinality(invoice_item_ids) = 1 and stock = 7 and merged_into is null)::text from products_trash where id='f0000000-0000-0000-0000-000000000003'" "true"
chk "ويُسترجع" \
    "select _restore_try('f0000000-0000-0000-0000-000000000003')" "restored"
chk "بسطره" \
    "select product_id::text from invoice_items where id='f1000000-0000-0000-0000-000000000003'" "f0000000-0000-0000-0000-000000000003"
# ٣) «رجّع كل قطعة لمكانها» يصوّر ثم يُفكّ — التوأم بالاسم يعطي الأصلَ باركودَه ويستردّه
chk "الترتيب يطوي التوأم بلا صنف في أصله المصنَّف" \
    "select (inventory_tidy_uncat()->>'merged')::text from (select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true)) s" "1"
chk "والتوأم بالسلّة موسوماً بأصله وبأن الأصل كان بلا باركود" \
    "select (merged_into = 'f0000000-0000-0000-0000-000000000005' and keep_barcode is null)::text from products_trash where id='f0000000-0000-0000-0000-000000000004'" "true"
chk "والأصل ورث الباركود والرصيد (٣ + ٢)" \
    "select (barcode = 'X400' and stock = 5)::text from products where id='f0000000-0000-0000-0000-000000000005'" "true"
chk "فكُّ الترتيب يمرّ" \
    "select _restore_try('f0000000-0000-0000-0000-000000000004')" "restored"
chk "والأصل ردّ الباركود والرصيد" \
    "select (barcode is null and stock = 3)::text from products where id='f0000000-0000-0000-0000-000000000005'" "true"
chk "والتوأم رجع بباركوده وسطره" \
    "select (p.barcode = 'X400' and p.stock = 2 and i.product_id = p.id)::text from products p join invoice_items i on i.id='f1000000-0000-0000-0000-000000000004' where p.id='f0000000-0000-0000-0000-000000000004'" "true"
# ٤) الثوابت
chk "الدوالّ الأربع بصلاحية المُعرِّف وبمسارٍ مثبَّت" \
    "select count(*)::text from pg_proc where proname in ('delete_product','restore_product','merge_products','inventory_tidy_uncat','products_trash_capture') and prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%'" "5"
chk "وممنوعة على anon" \
    "select (has_function_privilege('anon','public.merge_products(uuid,uuid)','execute') or has_function_privilege('anon','public.inventory_tidy_uncat()','execute'))::text" "false"
chk "وما تراكم بالسلّة صفٌّ بلا صاحب" \
    "select count(*)::text from products_trash where clinic_id is null" "0"

# ── 0147/0148: شركات التوصيل — ذمّةٌ تُحصَّل كاملةً أو على دفعات ─────────────
# الشركة تسلّم الزبون اليوم وتحاسب بعد شهر: الطلب «مسلَّم» والمال ما زال بذمّتها.
# التحصيل يوزّع المبلغ على الطلبات الأقدم فالأقدم عبر settle_invoice نفسها.
echo "▸ 0148: شركات التوصيل"
chk "خيارا الشاشة المتطوّرة (0147) موجودان" \
    "select count(*)::text from information_schema.columns where table_name='clinic_prefs' and column_name in ('pos_compact','pos_customer_open')" "2"
$P -c "$JWT
       insert into couriers (id, clinic_id, name, kind) values
         ('c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','شركة سريع','company'),
         ('c0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','أبو علي','driver')
       on conflict do nothing;
       insert into invoices (id, clinic_id, total, amount_paid, status) values
         ('c1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', 10000, 0, 'paid'),
         ('c1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', 5000, 0, 'paid'),
         ('c1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111', 7000, 0, 'paid')
       on conflict do nothing;
       insert into delivery_orders (id, clinic_id, invoice_id, courier_id, cod_amount, status, delivered_at) values
         ('c2000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',10000,'delivered', now() - interval '2 days'),
         ('c2000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001', 5000,'delivered', now() - interval '1 day'),
         ('c2000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','c1000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000002', 7000,'out', null)
       on conflict do nothing;
       create or replace function _cs_try(c uuid, amt numeric) returns text language plpgsql as \$fn\$
       declare r jsonb;
       begin perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
             r := courier_settle(c, amt, 'cash', 'test'); return r::text;
       exception when others then return 'guarded: ' || sqlerrm; end \$fn\$;
       create or replace function _kind_try(k text) returns text language plpgsql as \$fn\$
       begin insert into couriers (clinic_id, name, kind) values ('11111111-1111-1111-1111-111111111111', 'x', k); return 'ok';
       exception when others then return 'guarded: ' || sqlerrm; end \$fn\$;" >/dev/null 2>&1
chk "نوعٌ مجهول للسائق يُرفض" \
    "select left(_kind_try('robot'), 7)" "guarded"
chk "الذمّة قبل التحصيل ١٥٬٠٠٠ على طلبين" \
    "select coalesce(sum(i.total - i.amount_paid),0)::text from delivery_orders d join invoices i on i.id=d.invoice_id where d.courier_id='c0000000-0000-0000-0000-000000000001' and d.status='delivered' and d.collected_at is null" "15000.00"
chk "تحصيلٌ جزئي ١٢٬٠٠٠: يسدّد الأقدم كاملاً والثاني جزئياً" \
    "select (r->>'settled')::numeric::int::text || '/' || (r->>'orders') || '/' || (r->>'remaining_owed')::numeric::int::text from (select _cs_try('c0000000-0000-0000-0000-000000000001', 12000)::jsonb r) s" "12000/2/3000"
chk "الطلب الأقدم انختم محصَّلاً" \
    "select (collected_at is not null)::text from delivery_orders where id='c2000000-0000-0000-0000-000000000001'" "true"
chk "والثاني بقي بالذمّة برصيدٍ ٣٬٠٠٠" \
    "select (d.collected_at is null and i.amount_paid = 2000)::text from delivery_orders d join invoices i on i.id=d.invoice_id where d.id='c2000000-0000-0000-0000-000000000002'" "true"
chk "والمالُ دخل بختم وقتِ وصوله لا وقتِ الطلب" \
    "select (jsonb_array_length(payment_details) = 1 and payment_details->0 ? 'at')::text from invoices where id='c1000000-0000-0000-0000-000000000001'" "true"
chk "تحصيلٌ أكبر من الذمّة يُقصّ عليها ويقول كم فاض" \
    "select (r->>'settled')::numeric::int::text || '/' || (r->>'unallocated')::numeric::int::text || '/' || (r->>'remaining_owed')::numeric::int::text from (select _cs_try('c0000000-0000-0000-0000-000000000001', 5000)::jsonb r) s" "3000/2000/0"
chk "وسجلُّ التحصيلات فيه دفعتان بمبلغيهما الفعليين" \
    "select string_agg(amount::int::text, ',' order by created_at) from courier_settlements where courier_id='c0000000-0000-0000-0000-000000000001'" "12000,3000"
chk "وكلُّ دفعةٍ تعرف أيَّ الطلبات سدّدت" \
    "select jsonb_array_length(allocations)::text from courier_settlements where courier_id='c0000000-0000-0000-0000-000000000001' order by created_at limit 1" "2"
chk "ولا ذمّةَ باقية ⇒ تحصيلٌ ثالث يُرفض" \
    "select left(_cs_try('c0000000-0000-0000-0000-000000000001', 100), 7)" "guarded"
chk "وطلبُ السائق «بالطريق» لم يُمسّ" \
    "select (amount_paid = 0)::text from invoices where id='c1000000-0000-0000-0000-000000000003'" "true"
chk "ومبلغٌ سالب يُرفض" \
    "select left(_cs_try('c0000000-0000-0000-0000-000000000001', -5), 7)" "guarded"
chk "والسجلّ محميٌّ بسياسات الصفوف وبلا سياسة كتابة" \
    "select ((select relrowsecurity from pg_class where relname='courier_settlements') and (select count(*) from pg_policies where tablename='courier_settlements' and cmd <> 'SELECT') = 0)::text" "true"
chk "والدالّة بصلاحية المُعرِّف وبمسارٍ مثبَّت وممنوعة على anon" \
    "select (prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%' and not has_function_privilege('anon','public.courier_settle(uuid,numeric,text,text)','execute'))::text from pg_proc where proname='courier_settle'" "true"
chk "ونوعُ السائق مقيَّد بسائق/شركة" \
    "select count(*)::text from pg_constraint where conname='couriers_kind_chk'" "1"

# ── 0149: التقارير تسأل القاعدة — تطابقٌ فلساً بفلس مع منطق الواجهة ─────────
# ٣٢٠ فاتورةً بكل الأشكال (دفعة، مقسّمة، آجلة تُسدَّد لاحقاً، قديمة بلا أرجل،
# مردودة، تصحيح سالب) يولّدها report-fixture.mjs ويحسب المتوقَّع بدوالّ الواجهة
# نفسها؛ ثم تُقارَن مخرجات SQL بها. فلسٌ يفرق = فشل.
echo "▸ 0149: تجميع التقارير بالقاعدة"
FIX=$(mktemp -d)
TZ=Asia/Baghdad node "$HERE/../../scripts/report-fixture.mjs" "$FIX" >/dev/null
$P -f "$FIX/fixture.sql" >/dev/null
$P -c "create or replace function _rpt(q text) returns json language plpgsql as \$fn\$
       declare r json;
       begin perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
             execute 'select coalesce(json_agg(r), ''[]''::json) from (' || q || ') r' into r; return r; end \$fn\$;" >/dev/null
rpt() { psql -h $SOCK -p $PORT -U postgres -d $DB -tAc "select _rpt(\$q\$$2\$q\$)" > "$FIX/$1.json"; }
for R in month week all; do
  FROM=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FIX/expected.json','utf8')).ranges.$R.from)")
  TO=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FIX/expected.json','utf8')).ranges.$R.to)")
  rpt "$R.daily"    "select day, gross, net, invoices from report_receipts_daily('$FROM','$TO','Asia/Baghdad')"
  rpt "$R.total"    "select gross, net, invoices from report_receipts_total('$FROM','$TO')"
  rpt "$R.top"      "select key, qty, revenue from report_top_products('$FROM','$TO', 5)"
  rpt "$R.staff"    "select staff_id, invoices, revenue, profit from report_staff('$FROM','$TO')"
  rpt "$R.touching" "select id from report_invoices('$FROM','$TO')"
done
rpt "cust.byPhone"        "select id from customer_invoices('07701234567', null)"
rpt "cust.byEasternPhone" "select id from customer_invoices('٠٧٧٠٩٩٩٩٩٩٩', null)"
rpt "cust.bySpacedPhone"  "select id from customer_invoices('0790 555 5555', null)"
rpt "cust.byName"         "select id from customer_invoices(null, 'زبون بالاسم')"

# ── الموجة ٥ · البند ٢٣: منطقُ البيع نفسُه على النصفين ─────────────────────
# المرآةُ التجريبية هي ما تجري عليه فحوصُ المنطق — وكانت تنحرف عن الخادم بالمال:
# `Math.round(final_total)` تدوّر إلى **الدينار الكامل** بينما الخادم numeric(14,2).
# والمقارنةُ **تامّة** لا تقريبية: تسامحٌ بفلسٍ يخفي بالضبط ما جئنا له.
echo "▸ البند ٢٣: تطابقُ البيع بين القاعدة والمرآة"
CKF=$(mktemp -d)
node "$HERE/../../scripts/checkout-fixture.mjs" "$CKF" >/dev/null
$P -f "$CKF/calls.sql" >/dev/null
if node "$HERE/../../scripts/checkout-parity.mjs" "$CKF"; then :; else fail=1; fi

# ── 0150: صفحاتٌ بالمؤشّر وبحثٌ بالخادم — نفس نتائج الواجهة وبنفس ترتيبها ────
# `_pages` يدور كما تدور الواجهة على «المزيد»: صفحةٌ فصفحة بمؤشّر (created_at, id)
# حتى تفرغ، ويرجع المعرّفات بترتيب وصولها — فيُفحص التكرارُ والفقدُ والترتيب معاً.
echo "▸ 0150: صفحاتُ الفواتير والبحث بالخادم"
$P -c "create or replace function _pages(p_q text, p_status text, p_limit int) returns json language plpgsql as \$fn\$
       declare ids uuid[] := '{}'; page uuid[]; b_at timestamptz; b_id uuid; guard int := 0;
       begin perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
             loop
               -- بترتيب وصول الصفوف من الدالّة نفسها (لا إعادة ترتيب) — الترتيبُ جزءٌ من الفحص.
               select array_agg(s.id) into page from (select id from search_invoices(p_q, p_status, b_at, b_id, p_limit)) s;
               exit when page is null or cardinality(page) = 0;
               ids := ids || page;
               select created_at, id into b_at, b_id from invoices where id = page[cardinality(page)];
               guard := guard + 1; exit when guard > 100;
             end loop;
             return coalesce(array_to_json(ids), '[]'::json); end \$fn\$;" >/dev/null
rpt "pages.all"       "select _pages(null, 'all', 50) as ids"
rpt "search.name"     "select _pages('ابو علي', 'all', 50) as ids"
rpt "search.phone"    "select _pages('٧٧٠٩٩', 'all', 50) as ids"
rpt "search.invno"    "select _pages('inv-000057', 'all', 50) as ids"
rpt "search.staff"    "select _pages('احمد', 'all', 50) as ids"
rpt "search.refunded" "select _pages(null, 'refunded', 7) as ids"
rpt "search.paidName" "select _pages('سارة', 'paid', 50) as ids"
for S in name phone invno staff refunded paidName; do
  # نفسُ الاستفسار والحالة من expected.json — لا نسخةٌ ثانية تنحرف عنه.
  Q=$(node -e "const s=JSON.parse(require('fs').readFileSync('$FIX/expected.json','utf8')).pages.searches.$S; console.log(s.q==null?'null':\"'\"+s.q+\"'\")")
  ST=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FIX/expected.json','utf8')).pages.searches.$S.status)")
  rpt "count.$S" "select count_invoices_matching($Q, '$ST') as n"
done
rpt "pages.window"    "select id from search_invoices(null, 'all', '2026-08-19T12:00:00+03:00', null, 200, '2026-08-04T12:00:00+03:00')"
rpt "open_debts" "select id from open_debts()"
if node "$HERE/../../scripts/report-parity.mjs" "$FIX" | sed 's/^/ /'; then :; else fail=1; fi
chk "0150: دوالُّ الصفحات بصلاحية المُستدعي وبمسارٍ مثبَّت" \
    "select count(*)::text from pg_proc where proname in ('search_invoices','count_invoices_matching','open_debts','invoice_matches')
       and not prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%'" "4"
chk "وتوقيعٌ واحد لـsearch_invoices (لا نسخةٌ قديمة بخمسة معاملات تبقى)" \
    "select count(*)::text from pg_proc where proname='search_invoices'" "1"
chk "وممنوعة على anon" \
    "select count(*)::text from pg_proc p where proname in ('search_invoices','count_invoices_matching','open_debts') and has_function_privilege('anon', p.oid, 'execute')" "0"
chk "وسقفُ الصفحة ٢٠٠ مهما طُلب (٣٢٠ بالعيادة)" \
    "select json_array_length(_rpt('select id from search_invoices(p_limit => 5000)'))::text" "200"
$P -c "create or replace function _rpt_as(who uuid, q text) returns json language plpgsql as \$fn\$
       declare r json;
       begin perform set_config('request.jwt.claim.sub', who::text, true);
             execute 'select coalesce(json_agg(r), ''[]''::json) from (' || q || ') r' into r; return r; end \$fn\$;" >/dev/null
chk "وعيادةٌ أخرى لا ترى منها فاتورة (نفس البحث برقم فاتورةٍ موجودة)" \
    "select json_array_length(_rpt_as('11111111-1111-1111-1111-111111111111', 'select id from search_invoices(''inv-000057'', ''all'', null, null, 50)'))::text" "0"
chk "search_norm مرآةُ searchable: همزة/تاء/ياء/تشكيل/مسافة/أرقام شرقية" \
    "select search_norm('أَبُو عَلِيّ — ٠٧٧٠ ةى')" "ابوعلي—0770هي"
chk "وخيارُ الصفحات موجودٌ وافتراضيُّه نعم" \
    "select column_default from information_schema.columns where table_name='clinic_prefs' and column_name='invoices_paged'" "true"
chk "الدوالّ بصلاحية المُستدعي (سياسات الصفوف تحكمها) وبمسارٍ مثبَّت" \
    "select count(*)::text from pg_proc where proname in ('report_invoices','customer_invoices','receipt_legs','report_receipts_daily','report_receipts_total','report_top_products','report_staff')
       and not prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%'" "7"
chk "وممنوعة على anon" \
    "select count(*)::text from pg_proc p where proname in ('report_invoices','report_receipts_daily','customer_invoices') and has_function_privilege('anon', p.oid, 'execute')" "0"
chk "وفهرسُ الهاتف المطبَّع والمدّة موجودان" \
    "select count(*)::text from pg_indexes where indexname in ('invoices_clinic_phone_idx','invoices_open_debt_idx')" "2"
chk "وتاريخٌ مكسور بساق دفع لا يُسقط التقرير" \
    "select (safe_ts('not-a-date') is null and safe_ts('2026-09-01T10:00:00Z') is not null)::text" "true"
rm -rf "$FIX"

# ── 0151: لوحةُ المنصّة — الدخولُ إلى عيادةٍ بهويّة المشغّل، بلا أثرٍ على غيره ──
# مفتاحُ المشغّل بالحزمة عامّ (_dvtest_flags)، فالفحصُ يثبت: الحارسَ (غيرُ
# المشغّل يُرفض، وصفُّ جلسةٍ مزروع لا يمنح شيئاً)، والطريقَ (auth_clinic/auth_role
# تنقلب للعيادة المدخولة)، والأثرَ (سجلُّ العيادة وسجلُّ الجلسات)، والعزلَ (عيادةٌ
# أخرى لا تتأثّر).
echo "▸ 0151: لوحةُ المنصّة"
ADM=33333333-3333-3333-3333-333333333333
C1=11111111-1111-1111-1111-111111111111
C2=22222222-2222-2222-2222-222222222222
$P -c "create or replace function _pf(who uuid, q text) returns text language plpgsql as \$fn\$
       declare r text; begin perform set_config('request.jwt.claim.sub', who::text, true); execute q into r; return r; end \$fn\$;
       create or replace function _pf_try(who uuid, q text) returns text language plpgsql as \$fn\$
       declare r text; begin perform set_config('request.jwt.claim.sub', who::text, true); execute q into r; return 'allowed';
       exception when others then return 'guarded: ' || sqlerrm; end \$fn\$;
       update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
chk "غيرُ المشغّل لا يدخل عيادة" \
    "select left(_pf_try('$ADM', 'select platform_enter(''$C1'')::text'), 7)" "guarded"
$P -c "insert into platform_sessions(admin_id, acting_clinic) values ('$ADM','$C1') on conflict do nothing;" >/dev/null
chk "وصفُّ جلسةٍ مزروعٌ بلا صفة مشغّل لا يمنح شيئاً" \
    "select _pf('$ADM', 'select auth_clinic()::text')" "$ADM"
$P -c "delete from platform_sessions; update _dvtest_flags set admin = true;" >/dev/null
chk "المشغّلُ يدخل العيادة ١١١١" \
    "select _pf('$ADM', 'select (platform_enter(''$C1'', ''فحص'')->>''ok'')')" "true"
chk "فتصير عيادتُه ١١١١" "select _pf('$ADM', 'select auth_clinic()::text')" "$C1"
chk "وبدور مدير" \
    "select _pf('$ADM', 'select auth_role()') || '/' || _pf('$ADM', 'select auth_role_base()')" "manager/manager"
chk "والسياقُ يقولها" "select _pf('$ADM', 'select platform_context()->>''acting''')" "$C1"
chk "ولا أثرَ بسجلّ حركات العيادة (بالاتفاق معها)" \
    "select count(*)::text from audit_log where clinic_id='$C1' and entity='platform'" "0"
chk "وبسجلّ الجلسات الداخلي صفٌّ مفتوح بالسبب" \
    "select count(*)::text from platform_session_log where admin_id='$ADM' and acting_clinic='$C1' and left_at is null and reason='فحص'" "1"
chk "وعيادةٌ أخرى لا تتأثّر بجلسته" "select _pf('$C2', 'select auth_clinic()::text')" "$C2"
chk "الانتقالُ إلى ٢٢٢٢ يقفل الأولى ويفتح الثانية" \
    "select _pf('$ADM', 'select (platform_enter(''$C2'')->>''clinic_id'')')" "$C2"
chk "  سجلّ: واحدةٌ مقفلة وواحدةٌ مفتوحة" \
    "select count(*) filter (where left_at is not null)::text || '/' || count(*) filter (where left_at is null)::text from platform_session_log where admin_id='$ADM'" "1/1"
chk "والنبضُ يرى العيادتين" "select (count(*) >= 2)::text from platform_pulse()" "true"
chk "وديونُ ٢٢٢٢ بالنبض = ما بالجدول" \
    "select ((select open_debt_count from platform_pulse() where clinic_id='$C2') = (select count(*) from invoices where clinic_id='$C2' and coalesce(status,'paid')<>'refunded' and coalesce(amount_paid,total) < total-0.01))::text" "true"
$P -c "insert into audit_log (clinic_id, actor, action, entity, entity_id) values ('$C1', '$C1', 'UPDATE', 'products', 'x');" >/dev/null
chk "والحركةُ عبر العيادات تُرى وتُفلتر بالعيادة" \
    "select (count(*) >= 1)::text from platform_activity(50, '$C1') where entity='products' and clinic_id='$C1'" "true"
chk "  وبلا فلتر لا تُخلط بعيادة ثانية" \
    "select count(*)::text from platform_activity(500, '$C2') where clinic_id <> '$C2'" "0"
chk "وسجلُّ الدخول يعمل" "select count(*)::text from platform_logins(10)" "0"
chk "والخروجُ يعيده لنفسه" \
    "select _pf('$ADM', 'select (platform_leave()->>''was_acting'')') || '/' || _pf('$ADM', 'select auth_clinic()::text')" "true/$ADM"
chk "  ولا جلسةَ مفتوحة بالسجلّ الداخلي، ولا أثرَ بسجلّ العيادة" \
    "select (select count(*) from platform_session_log where admin_id='$ADM' and left_at is null)::text || '/' || (select count(*) from audit_log where entity='platform')::text" "0/0"
chk "وسجلُّ الجلسات الداخلي للمشغّل وحده (سياسةٌ واحدة بلا شرط عيادة)" \
    "select (count(*) = 1 and bool_and(qual not like '%auth_clinic%'))::text from pg_policies where tablename='platform_session_log'" "true"
chk "دوالُّ المنصّة بصلاحية المُعرِّف وبمسارٍ مثبَّت" \
    "select count(*)::text from pg_proc where proname in ('platform_enter','platform_leave','platform_context','platform_pulse','platform_activity','platform_logins','platform_acting_clinic') and prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%'" "7"
chk "وممنوعةٌ على anon" \
    "select count(*)::text from pg_proc p where proname in ('platform_enter','platform_pulse','platform_activity','platform_logins','platform_leave') and has_function_privilege('anon', p.oid, 'execute')" "0"
chk "وجدولُ الجلسات محميٌّ بلا أي سياسة" \
    "select ((select relrowsecurity from pg_class where relname='platform_sessions') and (select count(*) from pg_policies where tablename='platform_sessions')=0)::text" "true"
$P -c "update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null

# ── 0152: مركزُ الحركات — التصنيفُ والملخّصُ والصفحاتُ بالمؤشّر ─────────────
# نفسُ حالات activity-cases.json التي يفحصها activity-kinds-test.mjs على
# الواجهة تُفحص هنا على audit_kind() — فالمرآتان تتطابقان بالبناء لا بالوعد.
echo "▸ 0152: مركزُ الحركات"
CASES="$HERE/../../scripts/activity-cases.json"
N=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CASES','utf8')).length)")
for i in $(seq 0 $((N-1))); do
  read -r E A K < <(node -e "const c=JSON.parse(require('fs').readFileSync('$CASES','utf8'))[$i]; console.log(c.entity, c.action, c.kind)")
  D=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CASES','utf8'))[$i]; console.log(JSON.stringify(c.details).replace(/'/g,\"''\"))")
  chk "audit_kind: $E/$A → $K" "select audit_kind('$E', '$A', '$D'::jsonb)" "$K"
done
# بياناتٌ معلومة لعيادة ١١١١: ٣ بيعات أمس، مرتجعان اليوم، تغييرُ مخزون اليوم، دخولٌ اليوم.
$P -c "delete from audit_log where clinic_id='$C1' and entity_id like 'act-%';
       insert into audit_log (clinic_id, actor, action, entity, entity_id, details, created_at) values
         ('$C1','$C1','INSERT','invoices','act-1','{\"total\":1000,\"customer_name\":\"ابو علي\"}', now() - interval '1 day'),
         ('$C1','$C1','INSERT','invoices','act-2','{\"total\":2000,\"customer_name\":\"ام حسن\"}', now() - interval '1 day' + interval '1 minute'),
         ('$C1','$C2','INSERT','invoices','act-3','{\"total\":3000,\"customer_name\":\"سارة\"}', now() - interval '1 day' + interval '2 hour'),
         ('$C1','$C1','UPDATE','invoices','act-4','{\"total\":1000,\"__changed\":{\"status\":[\"paid\",\"refunded\"]}}', now() - interval '2 minute'),
         ('$C1','$C1','UPDATE','invoices','act-5','{\"total\":2000,\"__changed\":{\"status\":[\"paid\",\"refunded\"]}}', now() - interval '1 minute'),
         ('$C1','$C1','UPDATE','products','act-6','{\"name\":\"رويال\",\"logo\":\"$(printf 'x%.0s' $(seq 1 300))\",\"__changed\":{\"stock\":[5,3],\"updated_at\":[\"a\",\"b\"]}}', now());
       insert into login_events (clinic_id, user_id, email, name, created_at) values ('$C1','$C1','a@b.c','مدير','$(date -u +%Y-%m-%dT%H:%M:%SZ)');" >/dev/null
FROM3=$(date -u -d '3 days ago' +%Y-%m-%dT00:00:00Z); TO3=$(date -u -d 'tomorrow' +%Y-%m-%dT23:59:59Z)
chk "الملخّص بالنوع: ٣ بيعات و٢ مرتجع و١ مخزون و١ دخول" \
    "select _pf('$C1', 'select string_agg(kind||''=''||n, '','' order by kind) from (select kind, sum(n) n from activity_summary(''$FROM3'',''$TO3'',''UTC'',''day'') where kind in (''sale'',''refund'',''stock'',''login'') group by kind) s')" "login=1,refund=2,sale=3,stock=1"
chk "  وبالساعة يوزّع على أدلّةٍ لا يخلطها" \
    "select _pf('$C1', 'select (count(distinct bucket) >= 2)::text from activity_summary(''$FROM3'',''$TO3'',''UTC'',''hour'') where kind = ''sale''')" "true"
chk "الصفحة بفلتر النوع: البيعات الثلاث وحدها بترتيب الأحدث" \
    "select _pf('$C1', 'select string_agg(entity_id, '','') from activity_page(''$FROM3'',''$TO3'', array[''sale''])')" "act-3,act-2,act-1"
chk "  والمؤشّر يكمل بلا تكرارٍ ولا فقد (٢ ثم ١)" \
    "select _pf('$C1', 'with p1 as (select * from activity_page(''$FROM3'',''$TO3'', array[''sale''], null, null, null, null, null, 2)), l as (select * from p1 order by created_at, id limit 1) select (select string_agg(p1.entity_id, '','') from p1) || ''|'' || (select string_agg(n.entity_id, '','') from l, lateral activity_page(''$FROM3'',''$TO3'', array[''sale''], null, null, l.created_at, l.src, l.id, 2) n)')" "act-3,act-2|act-1"
chk "  وفلترُ الموظف يعزل بيعةَ الحساب الثاني" \
    "select _pf('$C1', 'select string_agg(entity_id, '','') from activity_page(''$FROM3'',''$TO3'', null, ''$C2'')')" "act-3"
chk "  والبحثُ بالاسم بالتطبيع («أم حسن» بهمزة)" \
    "select _pf('$C1', 'select string_agg(entity_id, '','') from activity_page(''$FROM3'',''$TO3'', null, null, ''أم حسن'')')" "act-2"
chk "  والمختصرُ يُسقط القيمةَ الطويلة ويبقي الاسم والتغيير" \
    "select _pf('$C1', 'select (brief ? ''name'' and not (brief ? ''logo'') and brief->''__changed'' ? ''stock'' and not (brief->''__changed'' ? ''updated_at''))::text from activity_page(''$FROM3'',''$TO3'', array[''stock''])')" "true"
chk "  والدخولُ يدخل نفسَ القائمة من جدوله" \
    "select _pf('$C1', 'select count(*)::text from activity_page(''$FROM3'',''$TO3'', array[''login''])')" "1"
chk "والموظفون بعدّاداتهم (الحسابُ الثاني بيعةٌ واحدة، والأوّل خمسٌ فأكثر مع بقية الحزمة)" \
    "select _pf('$C1', 'select ((select n from activity_actors(''$FROM3'',''$TO3'') where actor=''$C2'') = 1 and (select n from activity_actors(''$FROM3'',''$TO3'') where actor=''$C1'') >= 5)::text')" "true"
chk "وعيادةٌ أخرى لا ترى منها سطراً" \
    "select _pf('$C2', 'select count(*)::text from activity_page(''$FROM3'',''$TO3'') where entity_id like ''act-%''')" "0"
chk "والمحفّزات الجديدة على كل جدولٍ موجود من القائمة" \
    "select (count(*) filter (where to_regclass(t) is not null) = count(*) filter (where exists (select 1 from pg_trigger g join pg_class c on c.oid=g.tgrelid where c.relname=t and g.tgname='audit_all')))::text from unnest(array['clinic_visits','care_entries','lab_results','courier_settlements','payroll_adjustments','staff_recurring','staff_loan_events','pet_problems','pet_movements','journeys','clinic_notes','generated_barcodes','wa_accounts','lab_device_links']) t" "true"
chk "دوالُّ الحركات بصلاحية المُستدعي (سياسةُ المدير تحكمها) وبمسارٍ مثبَّت" \
    "select count(*)::text from pg_proc where proname in ('activity_summary','activity_page','activity_actors','audit_kind','activity_brief') and not prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%'" "5"
chk "وممنوعةٌ على anon" \
    "select count(*)::text from pg_proc p where proname in ('activity_summary','activity_page','activity_actors') and has_function_privilege('anon', p.oid, 'execute')" "0"
$P -c "delete from audit_log where entity_id like 'act-%'; delete from login_events where email='a@b.c';" >/dev/null

# ── 0153: الخادمُ يقول للمتصفّح «أنا داخلُ عيادةٍ» فيمتنع عن بذرِ إعداداته ──
# مقيسٌ على الإنتاج: ثلاثةَ عشرَ صفَّ إعداداتٍ للمشغّل هبطت بعيادة زبونٍ بعد
# ثانيتين من دخوله. البوّابةُ بالمتصفّح تسأل هذه الدالّة — فإن لم تقل الحقيقة
# عادت الثغرة.
echo "▸ 0153: my_workspace تقول إن المشغّل داخل"
$P -c "update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
chk "بلا مشغّلٍ داخل: المفتاح موجودٌ وفارغ" \
    "select ((my_workspace() ? 'platform_acting') and my_workspace()->>'platform_acting' is null)::text
       from (select set_config('request.jwt.claim.sub','$C1',true)) s" "true"
$P -c "update _dvtest_flags set admin = true;" >/dev/null
$P -c "select platform_enter('$C1'::uuid) from (select set_config('request.jwt.claim.sub','$ADM',true)) s;" >/dev/null
chk "ومشغّلٌ داخلٌ: تقول أيَّ عيادةٍ هي (فتمتنع البذرة)" \
    "select _pf('$ADM', 'select my_workspace()->>''platform_acting''')" "$C1"
chk "  وعيادةُ العمل هي المدخولة لا حسابُه" \
    "select _pf('$ADM', 'select my_workspace()->>''clinic_id''')" "$C1"
chk "وطبيبٌ عاديّ لا يرى بها شيئاً (الدالّةُ لا تُسرّب)" \
    "select _pf('$C2', 'select coalesce(my_workspace()->>''platform_acting'', ''none'')')" "none"
$P -c "select platform_leave() from (select set_config('request.jwt.claim.sub','$ADM',true)) s;
       update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
chk "وبعد الخروج تعود فارغة" \
    "select coalesce(_pf('$ADM', 'select my_workspace()->>''platform_acting'''), 'none')" "none"

echo
# ── 0154: استثناءُ المخزن من وضع المدير — عمودٌ واحد، افتراضُه القفل ─────────
# الخطرُ هنا افتراضٌ مقلوب: عمودٌ افتراضُه `true` يفتح مخازنَ كلِّ العيادات
# القائمة بضربةٍ واحدة عند الترحيل. فيُفحص الافتراضُ نفسُه، لا وجودُ العمود.
echo "▸ 0154: خيارُ تعديل المخزن بوضع المدير"
chk "العمود موجودٌ ومنطقيّ وnot null" \
    "select (data_type || '/' || is_nullable) from information_schema.columns
      where table_schema='public' and table_name='clinic_prefs' and column_name='manager_mode_stock_edit'" "boolean/NO"
chk "وافتراضُه false — القفلُ يشمل المخزن ما لم تختر العيادة غيرَه" \
    "select column_default from information_schema.columns
      where table_schema='public' and table_name='clinic_prefs' and column_name='manager_mode_stock_edit'" "false"
$P -c "insert into clinic_prefs (clinic_id) values ('$C1'::uuid) on conflict (clinic_id) do nothing;" >/dev/null
chk "وصفٌّ قائمٌ لم يُلمس: قيمتُه false لا null" \
    "select manager_mode_stock_edit::text from clinic_prefs where clinic_id='$C1'::uuid" "false"

# ── 0157: سجلُّ التوصيل لا يختفي، والتحصيلُ الغلط يُفَكّ لا يُزوَّر ────────────
# نزلت على الإنتاج قبل واجهتها، فكانت بالحزمة بلا فحصٍ واحد — تُطبَّق مرّتين
# وتسكت. هذي الأربعة تثبّت ما تعتمد عليه الواجهةُ الجديدة (قسمُ الشركات وفكُّ
# التحصيل): السلّة، والحارسُ الذي يمنع غيرَ المدير من الفكّ، والسياسةُ التي
# تجمّد طلبَ الشركة، والمحفّزُ الذي يصوّر الطلبَ قبل أن يأخذه التتالي.
# (RLS نفسُها لا تُفحص هنا: الحزمةُ تجري كـsuperuser فتتجاوزها — انظر CLAUDE.md.)
echo "▸ 0157: التوصيل لا يختفي والفكُّ للمدير وحده"
RCP=77777777-7777-7777-7777-777777777777
$P -c "insert into auth.users(id) values ('$RCP') on conflict do nothing;
       insert into memberships(user_id,clinic_id,role,status) values ('$RCP','$C1','receptionist','active') on conflict do nothing;
       insert into couriers(id,clinic_id,name,kind) values ('cccccccc-0157-4000-8000-000000000001','$C1','شركة الفحص','company') on conflict do nothing;
       insert into invoices(id,clinic_id) values ('dddddddd-0157-4000-8000-000000000001','$C1') on conflict do nothing;
       insert into delivery_orders(id,clinic_id,invoice_id,courier_id,status,cod_amount)
         values ('eeeeeeee-0157-4000-8000-000000000001','$C1','dddddddd-0157-4000-8000-000000000001','cccccccc-0157-4000-8000-000000000001','delivered',5000)
         on conflict do nothing;
       update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
chk "سلّةُ طلبات التوصيل موجودة" \
    "select (to_regclass('public.delivery_orders_trash') is not null)::text" "true"
chk "courier_unsettle مُعرِّفٌ ومسارُه مثبَّت" \
    "select (prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text from pg_proc where proname='courier_unsettle'" "true"
chk "  وموظّفُ استقبالٍ لا يفكّ تحصيلاً (الحارسُ داخل الدالّة لا بالواجهة)" \
    "select left(_pf_try('$RCP', 'select courier_unsettle(''00000000-0000-0000-0000-000000000000''::uuid)::text'), 18)" "guarded:forbidden"
chk "  والمديرُ يمرّ من حارس الدور (فيقف عند «لا تحصيل بهذا المعرّف»)" \
    "select (_pf_try('$C1', 'select courier_unsettle(''00000000-0000-0000-0000-000000000000''::uuid)::text') like '%settlement not found%')::text" "true"
chk "حارسُ طلب الشركة محفّزٌ (0159) لا سياسةٌ تستعلم من جدولها" \
    "select (exists (select 1 from pg_trigger where tgname='delivery_orders_before_update_guard' and tgrelid='delivery_orders'::regclass)
             and prosrc like '%company%' and prosrc like '%collected_at%')::text from pg_proc where proname='delivery_orders_guard_company'" "true"
$P -c "delete from delivery_orders where id = 'eeeeeeee-0157-4000-8000-000000000001';" >/dev/null
chk "حذفُ طلبٍ يصوّره بالسلّة قبل أن يذهب (المحفّزُ لا الواجهة)" \
    "select count(*)::text from delivery_orders_trash where id = 'eeeeeeee-0157-4000-8000-000000000001'" "1"
chk "  والصورةُ تحمل مبلغَه وحاملَه" \
    "select ((row->>'cod_amount')::numeric = 5000 and courier_id = 'cccccccc-0157-4000-8000-000000000001')::text from delivery_orders_trash where id = 'eeeeeeee-0157-4000-8000-000000000001'" "true"

# ── 0207: حركاتُ المادة — القصّةُ تُقرأ، والمجهولُ يبقى مجهولاً ──────────
# القالبُ **قصّةُ الإنتاج نفسُها** حرفاً بحرف («رمل جاك 20 لتر»، عيادةٌ حقيقية،
# ١٥–١٦ أيلول): وُلد بـ١٥، ثمّ تعديلُ فاتورةٍ لا يغيّر شيئاً، ثمّ بيعُ واحدة،
# ثمّ تعديلُ فاتورةٍ **رفع الرصيد من ١٤ إلى ١٥** — وهي القطعةُ التي اخترعها
# الحصرُ قبل 0205. وقالبٌ يُقاس على ما تُنتجه القاعدة فعلاً لا على ما يُسهّل
# كتابة الفحص (درسُ كشف التوصيل).
$P -c "insert into products (id, clinic_id, name, stock) values
         ('b7000000-0000-0000-0000-000000000001','$C1','رملُ الفحص',15) on conflict do nothing;
       insert into purchases (id, clinic_id, created_at) values
         ('b7000000-0000-0000-0000-0000000000a1','$C1','2026-09-15 09:55:34+00') on conflict do nothing;
       insert into purchase_items (id, clinic_id, purchase_id, product_id, qty) values
         ('b7000000-0000-0000-0000-0000000000b1','$C1','b7000000-0000-0000-0000-0000000000a1','b7000000-0000-0000-0000-000000000001',15) on conflict do nothing;
       insert into invoices (id, clinic_id, created_at) values
         ('b7000000-0000-0000-0000-0000000000c1','$C1','2026-09-15 17:34:20+00') on conflict do nothing;
       insert into invoice_items (id, clinic_id, invoice_id, product_id, qty) values
         ('b7000000-0000-0000-0000-0000000000d1','$C1','b7000000-0000-0000-0000-0000000000c1','b7000000-0000-0000-0000-000000000001',1) on conflict do nothing;
       insert into audit_log (clinic_id, action, entity, entity_id, details, created_at) values
         ('$C1','INSERT','products','b7000000-0000-0000-0000-000000000001','{\"stock\":15}','2026-09-15 09:55:34+00'),
         ('$C1','UPDATE','products','b7000000-0000-0000-0000-000000000001','{\"__changed\":{\"stock\":[15,0]}}','2026-09-15 13:36:06+00'),
         ('$C1','UPDATE','products','b7000000-0000-0000-0000-000000000001','{\"__changed\":{\"stock\":[0,15]}}','2026-09-15 13:36:06+00'),
         ('$C1','UPDATE','purchases','b7000000-0000-0000-0000-0000000000a1','{\"__changed\":{\"total\":[1,2]}}','2026-09-15 13:36:06+00'),
         ('$C1','UPDATE','products','b7000000-0000-0000-0000-000000000001','{\"__changed\":{\"stock\":[15,14]}}','2026-09-15 17:34:20+00'),
         ('$C1','UPDATE','products','b7000000-0000-0000-0000-000000000001','{\"__changed\":{\"stock\":[14,0]}}','2026-09-16 09:22:25+00'),
         ('$C1','UPDATE','products','b7000000-0000-0000-0000-000000000001','{\"__changed\":{\"stock\":[0,15]}}','2026-09-16 09:22:25+00'),
         ('$C1','UPDATE','purchases','b7000000-0000-0000-0000-0000000000a1','{\"__changed\":{\"total\":[2,3]}}','2026-09-16 09:22:25+00');" >/dev/null 2>&1
PM="select set_config('request.jwt.claim.sub','$C1',true)"
chk "0207: الحركاتُ أربعُ خطواتٍ لا سبع (الخطوةُ الوسطى تُطوى)" \
    "select count(*)::text from ($PM) s, product_movements('b7000000-0000-0000-0000-000000000001')" "4"
chk "  والميلادُ يُسمّى «أوّل إدخال» لا شراءً" \
    "select kind from ($PM) s, product_movements('b7000000-0000-0000-0000-000000000001') order by at limit 1" "open"
chk "  والبيعُ يُسمّى بيعاً وبفرقٍ سالب" \
    "select kind||':'||delta::text from ($PM) s, product_movements('b7000000-0000-0000-0000-000000000001') where at = '2026-09-15 17:34:20+00'" "sale:-1"
chk "  **وتعديلُ الفاتورة يُسمّى تعديلَ فاتورةٍ لا «تعديلاً مجهولاً»**" \
    "select kind from ($PM) s, product_movements('b7000000-0000-0000-0000-000000000001') where at = '2026-09-16 09:22:25+00'" "purchase_edit"
chk "  **ويكشف القطعةَ المخترَعة: ١٤ ⇐ ١٥**" \
    "select from_qty::text||'->'||to_qty::text from ($PM) s, product_movements('b7000000-0000-0000-0000-000000000001') where at = '2026-09-16 09:22:25+00'" "14->15"
chk "  والصفرُ الوسطيُّ لا يُعرض أبداً (لم يوجد خارج المعاملة)" \
    "select count(*)::text from ($PM) s, product_movements('b7000000-0000-0000-0000-000000000001') where to_qty = 0" "0"
# **وما لا يُعرف يبقى مجهولاً**: تغييرٌ بلا فاتورةٍ تقابله زمنياً.
$P -c "insert into audit_log (clinic_id, action, entity, entity_id, details, created_at) values
         ('$C1','UPDATE','products','b7000000-0000-0000-0000-000000000001','{\"__changed\":{\"stock\":[15,9]}}','2026-09-18 11:00:00+00');" >/dev/null 2>&1
chk "  وتغييرٌ بلا فاتورةٍ يُقال «تعديل» ولا يُخمَّن" \
    "select kind from ($PM) s, product_movements('b7000000-0000-0000-0000-000000000001') where at = '2026-09-18 11:00:00+00'" "adjust"
chk "  وعيادةٌ أخرى لا ترى حركاتِ مادّةٍ ليست لها" \
    "select count(*)::text from (select set_config('request.jwt.claim.sub','$C2',true)) s, product_movements('b7000000-0000-0000-0000-000000000001')" "0"

# ── 0206: الكنسُ شغلُ الجدولة وحدَها ─────────────────────────────────────
# **يُقاس هنا قبل المنح الشامل بالأسفل**: الكتلةُ التالية تمنح `execute` على كلّ
# دوالّ المخطّط لـ`authenticated` كي يعمل `_rls_try`، فتُلغي أثرَ هذه الهجرة.
# فحالةُ الإنتاج تُقاس قبلها، والسلوكُ يُقاس بعدها بعد إعادة النزع.
chk "0206: الكنسُ المسطَّح منزوعٌ عن authenticated" \
    "select has_function_privilege('authenticated', p.oid, 'execute')::text
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='purge_activity_log'" "false"
chk "  وعن anon كذلك" \
    "select has_function_privilege('anon', p.oid, 'execute')::text
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='purge_activity_log'" "false"
chk "  والمجدوَلةُ ذاتُ التدرُّج منزوعةٌ هي الأخرى (0129)" \
    "select has_function_privilege('authenticated', p.oid, 'execute')::text
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='purge_audit_log'" "false"

# ── 0159: سياسةُ التحديث كانت تستعلم من جدولها فأسقطت كلَّ تحديثٍ بـ42P17 ──────
# أوّلُ فحصٍ بالحزمة يمرّ من RLS فعلاً: `_rls_try` ينزل إلى دور `authenticated`
# (nosuperuser) قبل التنفيذ، فتُعاد كتابةُ السياسات كما بالإنتاج. بدور superuser
# كانت 0157 تمرّ مرّتين وتسكت — والإنتاج يرجع 500 على كلّ PATCH.
echo "▸ 0159: تحديثُ التوصيل يمرّ من RLS بدورٍ عاديّ"
$P -c "grant usage on schema public to authenticated;
       grant select, insert, update, delete on all tables in schema public to authenticated;
       -- «all tables» تشمل العروض — والإنتاجُ ينزع هذا العرضَ (0161). بلا هذا السطر يبدو
       -- عرضُ الكتالوج المشترك ممنوحاً للداخلين فيُحسب ثغرةً بسياج المصوّر (0222).
       revoke all on shared_catalog_source from authenticated;
       grant usage, select on all sequences in schema public to authenticated;
       grant execute on all functions in schema public to authenticated;
       create or replace function _rls_try(who uuid, q text) returns text language plpgsql as \$fn\$
       declare n int; begin
         perform set_config('request.jwt.claim.sub', who::text, true);
         set local role authenticated;
         execute q; get diagnostics n = row_count;
         reset role; return 'rows:' || n;
       exception when others then return 'guarded:' || sqlstate || ':' || sqlerrm; end \$fn\$;
       insert into couriers(id,clinic_id,name,kind) values ('cccccccc-0159-4000-8000-000000000001','$C1','سائق الفحص','driver') on conflict do nothing;
       insert into invoices(id,clinic_id) values ('dddddddd-0159-4000-8000-000000000001','$C1'), ('dddddddd-0159-4000-8000-000000000002','$C1') on conflict do nothing;
       insert into delivery_orders(id,clinic_id,invoice_id,courier_id,status,cod_amount) values
         ('eeeeeeee-0159-4000-8000-000000000001','$C1','dddddddd-0159-4000-8000-000000000001',null,'preparing',3000),
         ('eeeeeeee-0159-4000-8000-000000000002','$C1','dddddddd-0159-4000-8000-000000000002','cccccccc-0157-4000-8000-000000000001','delivered',5000)
         on conflict do nothing;
       update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
# والسلوك: المنحُ الشامل أعلاه أعاد ما نزعته 0206، فنُعيد النزعَ لنقيس حالةَ
# الإنتاج لا حالةَ الحزمة — ثمّ ننادي الدالّةَ بدور `authenticated` فعلاً.
# **وبصراحة: هذان الفحصان يمرّان بالهجرة وبدونها** لأن النزعَ هنا يدويّ.
# حارسُ الهجرة هو الفحصُ الثابت أعلاه (قِستُ فشلَه بإسقاط 0206 من WAVE: يرجع
# «true»). وقيمةُ هذين أنهما يثبّتان القرار: **نزعٌ لا حذف** — فلو حُذفت الدالّةُ
# يوماً صار الجوابُ 42883 بدل 42501، وهذا يكسر نسخَ PWA المخزَّنة بلا داعٍ.
$P -c "revoke execute on function public.purge_activity_log() from public, anon, authenticated;" >/dev/null
chk "0206 سلوكياً: موظّفٌ مسجَّلٌ لا يقدر يكنس سجلَّ عيادته" \
    "select split_part(_rls_try('$C1', 'select purge_activity_log()'), ':', 1)" "guarded"
chk "  والرفضُ رفضُ صلاحيةٍ لا خطأُ دالّةٍ مفقودة" \
    "select split_part(_rls_try('$C1', 'select purge_activity_log()'), ':', 2)" "42501"
# المنحُ الشامل أعلاه (`grant execute on all functions … to authenticated`) لازمٌ
# لـ`_rls_try` كي يعمل بدورٍ عاديّ — لكنه **يلغي منعَ 0163** عن المساعدتين
# الداخليّتين (`deduct_stock_pooled` و`credit_stock`)، فتصيران منادَاتَين ممّن
# لا يجوز، ويفشل فحصُ 0163 بعده بسببٍ لا علاقةَ له به.
# فتُعاد 0163 لتستردّ سلطتَها: هي المرجعُ بمن ينادي ماذا، ومنحٌ شاملٌ لأجل فحصٍ
# لا يعلو عليها. (وقد صار الفحصُ بهذا أقوى: يُثبت أن 0163 تغلب منحاً شاملاً.)
$P -f "$MIG/0163_rpc_exposure.sql" >/dev/null 2>&1
chk "موظّفُ استقبالٍ يرسل طلباً مع سائق (كان 42P17 على كلّ تحديث)" \
    "select _rls_try('$RCP', 'update delivery_orders set courier_id=''cccccccc-0159-4000-8000-000000000001'', status=''out'', dispatched_at=now() where id=''eeeeeeee-0159-4000-8000-000000000001''')" "rows:1"
chk "  ويختم استلامَ نقد السائق" \
    "select _rls_try('$RCP', 'update delivery_orders set status=''delivered'', delivered_at=now(), collected_at=now() where id=''eeeeeeee-0159-4000-8000-000000000001''')" "rows:1"
chk "  ولا يختم تحصيلَ طلبِ شركة — المحفّز يرفض بجملةٍ عربية" \
    "select left(_rls_try('$RCP', 'update delivery_orders set collected_at=now() where id=''eeeeeeee-0159-4000-8000-000000000002'''), 13)" "guarded:P0001"
chk "  ولا يبدّل شركتَه بسائق (الالتفافُ بخطوتين)" \
    "select left(_rls_try('$RCP', 'update delivery_orders set courier_id=''cccccccc-0159-4000-8000-000000000001'' where id=''eeeeeeee-0159-4000-8000-000000000002'''), 13)" "guarded:P0001"
chk "  لكن يعدّل ملاحظةَ طلب الشركة (العمودان المحميّان وحدهما)" \
    "select _rls_try('$RCP', 'update delivery_orders set customer_name=''فحص'' where id=''eeeeeeee-0159-4000-8000-000000000002''')" "rows:1"
chk "  والمديرُ يختم تحصيلَ الشركة" \
    "select _rls_try('$C1', 'update delivery_orders set collected_at=now() where id=''eeeeeeee-0159-4000-8000-000000000002''')" "rows:1"
chk "  وعيادةٌ أخرى لا تمسّ الصفَّ (صفرُ صفوف — وهذا ما ترميه الواجهةُ خطأً الآن)" \
    "select _rls_try('$C2', 'update delivery_orders set customer_name=''x'' where id=''eeeeeeee-0159-4000-8000-000000000001''')" "rows:0"
chk "والسياسةُ ما تستعلم من جدولها" \
    "select (with_check not like '%delivery_orders d%' and qual not like '%delivery_orders d%')::text from pg_policies where tablename='delivery_orders' and policyname='delivery_orders_update'" "true"

# ── 0162: ثلاثُ سياساتٍ أخرى كانت تستعلم من جدولها — الفواتير والإعدادات والملفّ ──
# نفسُ الجذر ونفسُ الطريقة: بدور `authenticated` عبر `_rls_try`، فالسياسةُ تُعاد
# كتابتُها كما بالإنتاج. قبل 0162 كانت كلُّ سطرٍ هنا يرجع guarded:42P17.
echo "▸ 0162: التحديثُ المباشر يمرّ من RLS، والمجمَّدُ يُرفض بمحفّزٍ لا بسياسة"
$P -c "insert into clinic_prefs(clinic_id, dial_code) values ('$C1','+964') on conflict (clinic_id) do nothing;
       insert into profiles(id, full_name, email) values ('$RCP','موظّف الفحص','rcp@dvtest') on conflict (id) do nothing;
       update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
chk "موظّفُ استقبالٍ يعدّل ملاحظةَ فاتورةٍ (كان 42P17 على كلّ PATCH)" \
    "select _rls_try('$RCP', 'update invoices set notes=''فحص'' where id=''dddddddd-0159-4000-8000-000000000001''')" "rows:1"
chk "  ولا يغيّر مبلغَها — المحفّز يرفض بجملةٍ عربية" \
    "select left(_rls_try('$RCP', 'update invoices set total=total+1 where id=''dddddddd-0159-4000-8000-000000000001'''), 13)" "guarded:P0001"
chk "  ولا حالتَها" \
    "select left(_rls_try('$RCP', 'update invoices set status=''refunded'' where id=''dddddddd-0159-4000-8000-000000000001'''), 13)" "guarded:P0001"
chk "  والمديرُ يغيّر المبلغ" \
    "select _rls_try('$C1', 'update invoices set discount=1 where id=''dddddddd-0159-4000-8000-000000000001''')" "rows:1"
chk "  وعيادةٌ أخرى صفرُ صفوف" \
    "select _rls_try('$C2', 'update invoices set notes=''x'' where id=''dddddddd-0159-4000-8000-000000000001''')" "rows:0"
chk "الإعدادات: موظّفٌ يحفظ رمزَ الهاتف (كان 42P17 منذ 0161 — حفظُ الإعدادات كلُّه)" \
    "select _rls_try('$RCP', 'update clinic_prefs set dial_code=''+965'' where clinic_id=''$C1''')" "rows:1"
chk "  ولا يقلب مشاركةَ الكتالوج" \
    "select left(_rls_try('$RCP', 'update clinic_prefs set catalog_share=true where clinic_id=''$C1'''), 13)" "guarded:P0001"
chk "  والمديرُ يقلبها" \
    "select _rls_try('$C1', 'update clinic_prefs set catalog_share=true where clinic_id=''$C1''')" "rows:1"
chk "الملفّ الشخصيّ: الاسمُ يُعدَّل" \
    "select _rls_try('$RCP', 'update profiles set full_name=''فحص'' where id=''$RCP''')" "rows:1"
chk "  والبريدُ لا" \
    "select left(_rls_try('$RCP', 'update profiles set email=''x@dvtest'' where id=''$RCP'''), 13)" "guarded:P0001"
chk "ولا سياسةَ بالقاعدة كلّها تستعلم من جدولها (verify_no_self_ref_policies)" \
    "select count(*)::text from verify_no_self_ref_policies()" "0"

# ── 0163: دوالُّ الخزن الداخلية للمالك وحده، ودوالُّ العيادة لا تُنادى بلا هويّة ──
echo "▸ 0163: من يقدر ينادي ماذا"
chk "deduct_stock_pooled وcredit_stock لا تُنادى من anon ولا من authenticated" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('deduct_stock_pooled','credit_stock') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))" "0"
chk "  ويبقى المالكُ يناديهما (pos_checkout تحتاجهما)" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('deduct_stock_pooled','credit_stock') and has_function_privilege('postgres', p.oid, 'execute')" "2"
chk "settle_invoice وrecord_purchase وset_override_pin لا تُنادى بلا هويّة" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('settle_invoice','record_purchase','set_override_pin') and has_function_privilege('anon', p.oid, 'execute')" "0"
chk "  وتبقى للمسجَّلين" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('settle_invoice','record_purchase','set_override_pin') and has_function_privilege('authenticated', p.oid, 'execute')" "3"
chk "ودوالُّ الهويّة التي تناديها السياسات تبقى لـanon (وإلا صارت الصفحات العامّة permission denied)" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('auth_clinic','auth_role','is_clinic_staff') and has_function_privilege('anon', p.oid, 'execute')" "3"
chk "ولا دالّةَ SECURITY DEFINER بلا search_path (مستشارُ Supabase: function_search_path_mutable)" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname in ('quota_period_end','quota_period_start','phone_key','inv_norm_code','inv_norm_name') and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')" "0"

# ── 0164: تطبيعُ الرمز واحدٌ بالطرفين — تطابقٌ حرفاً بحرف ──────────────────
# نفسُ منهج فحص التقارير (0149): القيمُ من ملفٍ واحد، والمتوقَّعُ تحسبه دالّةُ
# الواجهة **نفسها** (matchCode عبر esbuild) لا نسخةٌ منها؛ ثم يُقارَن ناتجُ
# inv_norm_code بها. رمزٌ واحد يفرق = الطرفان افترقا = فشل.
echo "▸ 0164: تطبيعُ الرمز — المتصفّح والقاعدة"
CNF=$(mktemp -d)
node "$HERE/../../scripts/code-norm-parity.mjs" "$CNF" >/dev/null
$P -f "$CNF/code-norm.sql" >/dev/null
chk "كلُّ قيمةٍ ملغومة تُطبَّع بالطرفين إلى النتيجة ذاتها" \
    "select count(*)::text from _code_norm_fixture where inv_norm_code(raw) is distinct from expected" "0"
chk "  وملفُ القيم لم يُفرَّغ (فحصٌ على صفرِ قيمٍ ليس نجاحاً)" \
    "select (count(*) >= 100)::text from _code_norm_fixture" "true"
# والفحصُ يقدر أن يفشل: نطبّق التطبيعَ القديم على القيم فلا بدّ أن يخالف.
chk "  والتطبيعُ القديم يخالفها فعلاً (لو مرّ لكان الفحص أعمى)" \
    "select (count(*) > 0)::text from _code_norm_fixture
       where translate(regexp_replace(coalesce(raw,''), '\s', '', 'g'), '٠١٢٣٤٥٦٧٨٩', '0123456789') is distinct from expected" "true"
$P -c "drop table if exists _code_norm_fixture;" >/dev/null

# ── وصيغُ الماسح: مجموعةُ القاعدة = مجموعةُ الواجهة، **بترتيبها** ─────────
# نفسُ حجّة فحص التطبيع أعلاه: مرآةٌ بلا فحصٍ تنحرف. والترتيبُ جزءٌ من العقد
# لا تفصيلُ عرض — `rescueScan` تقف عند أوّل صيغةٍ مصيبة، فمن يرتّب غيرَ
# ترتيبها يبيع غيرَ ما تبيع الشاشة. (وقعت فعلاً: `array_agg(distinct)` يرتّب
# بالقيمة، فاختار الخادمُ صيغةً غيرَ التي تختارها الواجهة على زوجِ UPC-A/EAN-13.)
$P -f "$CNF/code-variants.sql" >/dev/null
chk "صيغُ الماسح تتطابق طرفاً بطرف" \
    "select count(*)::text from _code_variants_fixture where inv_code_variants(raw) is distinct from expected" "0"
chk "  والقالبُ ليس فارغاً" \
    "select (count(*) >= 100)::text from _code_variants_fixture" "true"
chk "  وفيه رمزٌ برأس AIM فعلاً — وإلا فالفحصُ لا يقيس الفرعَ المقصود" \
    "select (count(*) > 0)::text from _code_variants_fixture where array_length(expected,1) > 1" "true"
$P -c "drop table if exists _code_variants_fixture;" >/dev/null
rm -rf "$CNF"


# ── 0165/0166: الرمزُ الإضافيّ يُقرأ، والاستدعاءُ حتميّ ────────────────────
# كان هذا القسمُ **ساكناً** كلَّه: ستُّ فحوصٍ تقرأ `prosrc` وتكتفي بأن التعريف
# يذكر `alt_codes`. وفحصُ نصٍّ يمرّ ولو كان الفرعُ ميّتاً — وهذا بعينه ما حصل
# بأوّل صياغة 0168 (فرعٌ لا يُنتج صفّاً أبداً، كشفه بناءُ الفحص لا الفحص).
# وسببُ سكونه أن جداولَ الشراء بالأساس كانت هياكلَ بعمودٍ أو عمودَين فيستحيل
# **تشغيلُ** `record_purchase`؛ صارت الآن بشكل الإنتاج (harness.sql)، فصار
# السلوكُ مفحوصاً. والفحوصُ الساكنةُ تبقى معه: نصٌّ يحرس الشكل، وسلوكٌ يحرس الأثر.
echo "▸ 0165/0166: الرموزُ الإضافية والحتمية"
chk "مطابقةُ الشراء تقرأ alt_codes (record_purchase)" \
    "select (prosrc like '%alt_codes%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_purchase'" "true"
chk "ومثلُها update_purchase" \
    "select (prosrc like '%alt_codes%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_purchase'" "true"
# المقطعُ يقف عند `= v_code` فيمرّ ولو انقلب `desc` إلى `asc` — أي ولو صار
# الإضافيُّ يغلب الأساسيّ، وهو نقيضُ ما يحرسه. فيمتدّ إلى الاتجاه نفسِه.
chk "والأساسيُّ يغلب الإضافيّ بترتيب الشراء (بالاتجاه لا بالوجود)" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_purchase','update_purchase') and prosrc like '%order by (inv_norm_code(barcode) = v_code and coalesce(barcode,'''') <> '''') desc%'" "2"
# كان هنا فحصا نصٍّ على `product_by_code`: واحدٌ يطلب مقطعَ الترتيب والثاني
# مقطعَ المطابقة المطبَّعة. سقطا لمّا أعادت 0172/0173 كتابةَ الدالّة — لا لأن
# السلوكَ انكسر، بل لأن النصَّ تغيّر: صار `p.barcode` باسمٍ مستعار، والتطبيعُ
# يُحسب مرّةً بمتغيّر (`v_norm`) بدل تكرار النداء. أي أن الفحصَين كانا يحرسان
# **صياغةً** لا أثراً، فمنعا تحسيناً وما حرسا شيئاً. وهذا نقيضُ قاعدة القسم
# نفسِه: «نصٌّ يحرس الشكل، وسلوكٌ يحرس الأثر» — والأثرُ هنا هو المقصود.
#
# فالحتميّةُ مفحوصةٌ سلوكياً بالأسفل (DET-500: الصاحبُ قبل المستعير، ومطويّاً
# كذلك)، والذي كان ناقصاً فعلاً هو **التطبيع**: رمزٌ أُدخل بأرقامٍ عربية أو
# بمسافة. وهما حالتان مقيستان بالإنتاج لا مؤلَّفتان.
chk "والاستعادةُ ترشّح الرموزَ الإضافية المسروقة" \
    "select (prosrc like '%{alt_codes}%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='restore_product'" "true"

# ── والآن السلوكُ نفسُه: نشتري، ونستدعي، ونستعيد ─────────────────────────
# عيادةٌ خاصّةٌ بهذا القسم كي لا تختلط ببقايا الكتل السابقة.
AC="11111111-1111-1111-1111-111111111111"
# بلا فاصلةٍ منقوطة: تُحقن داخل `from (…) s` فتصير `(select …;) s` — خطأُ صياغة.
ACJ="select set_config('request.jwt.claim.sub','$AC',true)"
# G1 سلوكياً: سطرُ شراءٍ **بلا product_id** ورمزُه باركودُ مصنعٍ هو رمزٌ
# **إضافيّ** لمنتجٍ قائم رمزُه الأساسيّ رقمُ رفّ — الحالةُ المقيسة بالإنتاج
# (٢٨١ منتجاً بأربع عيادات رمزُه يدويّ). المطلوب: يُرصَّد على القائم، ولا
# يُنشأ توأمٌ برصيدٍ مقسوم. مقيسٌ على الإنتاج بمعاملةٍ متراجعة قبل كتابته هنا:
# ٥ ⇒ ٨ على الصفّ القائم، وصفرُ صفوفٍ جديدة.
$P -c "insert into products (id, clinic_id, name, barcode, alt_codes, stock) values
         ('a1000000-0000-0000-0000-000000000001','$AC','رفّ ٢٤٧','SHELF-247',array['6970967772736'],5)
       on conflict do nothing;" >/dev/null 2>&1
# `(صفٌّ مركَّب) is not null` يعني **كلَّ** أعمدته غيرُ فارغة — وصفُّ الشراء فيه
# أعمدةٌ تقبل الفراغ (الشركة، المرجع، الملاحظات)، فالجوابُ `false` عن صفٍّ سليم.
# فخٌّ يقول «فشل» عن نجاح. فيُنتزع عمودٌ واحدٌ بدل الصفّ كلِّه.
chk "الشراءُ بالرمز الإضافيّ يُرصَّد على القائم" \
    "select ((record_purchase(
       jsonb_build_array(jsonb_build_object('product_id',null,'barcode','6970967772736','name','وصلت بضاعة','qty',3,'purchase_price',1000,'sell_price',1500)),
       jsonb_build_object('company_name','مورّد فحص'))).id is not null)::text
     from ($ACJ) s" "true"
chk "  فيصير رصيدُه ثمانيةً لا خمسة" \
    "select stock::text from products where id='a1000000-0000-0000-0000-000000000001'" "8.000"
chk "  ولا يُنشأ توأمٌ باسم السطر" \
    "select count(*)::text from products where clinic_id='$AC' and name='وصلت بضاعة'" "0"

# G5 سلوكياً: صاحبُ الرمز أساسيّاً ومستعيرٌ يحمله إضافياً — أيُّهما يرجع أوّلاً؟
# والزرعُ بهذا الترتيب وحدَه ممكن: محفّزُ 0167 يرفض إدراجَ الأساسيّ بعد أن صار
# إضافياً لغيره — فيُدرَج الصاحبُ أوّلاً ثم يُعطى المستعيرُ رمزَه بتحديث.
$P -c "insert into products (id, clinic_id, name, barcode, stock, created_at) values
         ('a1000000-0000-0000-0000-000000000012','$AC','صاحبُ الرمز','DET-500',1,'2026-05-01'),
         ('a1000000-0000-0000-0000-000000000011','$AC','المستعير','ZZZ-9',1,'2026-01-01')
       on conflict do nothing;
       update products set alt_codes = array['DET-500'] where id='a1000000-0000-0000-0000-000000000011';" >/dev/null 2>&1
chk "الاستدعاءُ يرجع صفَّين للرمز المشترَك" \
    "select count(*)::text from ($ACJ) s, product_by_code('DET-500')" "2"
chk "  والأوّلُ صاحبُ الرمز لا المستعير (حتميةٌ لا حظّ)" \
    "select name from ($ACJ) s, product_by_code('DET-500') limit 1" "صاحبُالرمز"
chk "  وبحالةٍ مطويّة كذلك" \
    "select name from ($ACJ) s, product_by_code('det-500') limit 1" "صاحبُالرمز"

# والتطبيعُ سلوكياً — بدلَ فحصَي النصّ اللذين سقطا أعلاه. الحالتان من الإنتاج:
# كيبوردٌ عربيّ وقتَ إدخال الرمز، ومسافةٌ التصقت به من لصقِ إكسل. وكلٌّ منهما
# يدخل بمنتجٍ مستقلّ لأن محفّز 0167 يرفض توأماً بالتطبيع — فلا يمكن زرعُ
# «خامٍّ ومطبَّعٍ» على نفس الرمز أصلاً، وهذا بذاته حارسٌ ثانٍ.
$P -c "insert into products (id, clinic_id, name, barcode, stock, created_at) values
         ('a1000000-0000-0000-0000-000000000031','$AC','مُدخَلٌ بالعربية','٥٩٠٥٥٥٥',1,'2026-01-01'),
         ('a1000000-0000-0000-0000-000000000032','$AC','مُدخَلٌ بمسافة','590 6666',1,'2026-01-01')
       on conflict do nothing;" >/dev/null 2>&1
chk "  ورمزٌ أُدخل بأرقامٍ عربية يُلقى بمسحةٍ إنكليزية" \
    "select name from ($ACJ) s, product_by_code('5905555') limit 1" "مُدخَلٌبالعربية"
chk "  ورمزٌ التصقت به مسافةٌ يُلقى بلا مسافة" \
    "select name from ($ACJ) s, product_by_code('5906666') limit 1" "مُدخَلٌبمسافة"

# ── تعديلُ فاتورةٍ بيع منها: العكسُ لا يخترع بضاعة ───────────────────────
# `update_purchase` تهدم أثرَ السطور القديمة ثمّ تبني الجديدة. والهدمُ كان
# `greatest(0, stock - old_qty)` — فلو بيعَ جزءٌ من الكمية قبل التعديل، الحصرُ
# بصفرٍ يبلع الفرقَ ثمّ تُضاف الكميةُ كاملةً، فيقفز الرصيد.
#
# **وقعت بالإنتاج**: 2026-09-16، «رمل جاك 20 لتر»، سجلُّ التدقيق يقول
# `stock [14,0]` ثمّ `[0,15]` — قطعةٌ اخترعها النظام والمستخدمُ ما غيّر كمية.
#
# السيناريو هنا مُصغَّرٌ عنه: اشترِ ٥٠، بِع ٤٥ (الرصيد ٥)، ثمّ عدّل الفاتورة
# **بلا تغيير الكمية**. الصحيح أن يبقى ٥.
$P -c "select set_config('request.jwt.claim.sub','$AC',false);
       insert into products (id, clinic_id, name, barcode, stock) values
         ('a1000000-0000-0000-0000-000000000041','$AC','رملٌ سريعُ الحركة','FAST-50',0)
       on conflict do nothing;" >/dev/null 2>&1
$P -c "select set_config('request.jwt.claim.sub','$AC',false);
       select record_purchase(
         jsonb_build_array(jsonb_build_object('product_id','a1000000-0000-0000-0000-000000000041','barcode','FAST-50','name','رملٌ سريعُ الحركة','qty',50,'purchase_price',1000,'sell_price',1500)),
         jsonb_build_object('company_name','مورّدُ الرمل'));" >/dev/null 2>&1
chk "الشراءُ رصّد خمسين" \
    "select stock::text from products where id='a1000000-0000-0000-0000-000000000041'" "50.000"
# بيعُ ٤٥ — نُنقص الرصيدَ مباشرةً كما يفعل البيع، فالمقصودُ فحصُ التعديل وحده.
$P -c "update products set stock = 5 where id='a1000000-0000-0000-0000-000000000041';" >/dev/null 2>&1
$P -c "select set_config('request.jwt.claim.sub','$AC',false);
       select update_purchase(
         (select id from purchases where clinic_id='$AC' and company_name='مورّدُ الرمل' order by created_at desc limit 1),
         jsonb_build_array(jsonb_build_object('product_id','a1000000-0000-0000-0000-000000000041','barcode','FAST-50','name','رملٌ سريعُ الحركة','qty',50,'purchase_price',1000,'sell_price',1500)),
         jsonb_build_object('company_name','مورّدُ الرمل'));" >/dev/null 2>&1
chk "تعديلٌ بلا تغييرِ كميةٍ لا يخترع بضاعة (الرصيدُ يبقى ٥)" \
    "select stock::text from products where id='a1000000-0000-0000-0000-000000000041'" "5.000"
# وتخفيضُ الكمية بعدها يُطرح من الرصيد الحقيقيّ: ٥٠ ⇒ ٣٠ يعني ‎-٢٠‎ ⇒ الرصيدُ
# ٥ − ٢٠ = سالب، وهذا **يُحصر بصفرٍ بحقّ**: بضاعةٌ ما وصلت لا تبقى بالرفّ.
$P -c "select set_config('request.jwt.claim.sub','$AC',false);
       select update_purchase(
         (select id from purchases where clinic_id='$AC' and company_name='مورّدُ الرمل' order by created_at desc limit 1),
         jsonb_build_array(jsonb_build_object('product_id','a1000000-0000-0000-0000-000000000041','barcode','FAST-50','name','رملٌ سريعُ الحركة','qty',30,'purchase_price',1000,'sell_price',1500)),
         jsonb_build_object('company_name','مورّدُ الرمل'));" >/dev/null 2>&1
chk "  وتخفيضُ الكمية يُطرح فعلاً ولا ينزل تحت صفر" \
    "select stock::text from products where id='a1000000-0000-0000-0000-000000000041'" "0.000"

# ومنتجٌ «مجمّع» (رصيدُه مجهولٌ وحوضُ قسمه يغطّيه): أوّلُ كميةٍ تُستلم تجعله
# معدوداً. التجريبيُّ يطفئ الصفة منذ البداية، والخادمُ كان يتركها — و`freshSale`
# يعطي المجمَّعَ سقفاً لا نهائياً، فمنتجٌ اشترته عيادةٌ يبقى يُباع بلا حدّ.
$P -c "select set_config('request.jwt.claim.sub','$AC',false);
       insert into products (id, clinic_id, name, barcode, stock, pooled) values
         ('a1000000-0000-0000-0000-000000000042','$AC','مجمَّعٌ يُشترى','POOL-9',0,true)
       on conflict do nothing;
       select record_purchase(
         jsonb_build_array(jsonb_build_object('product_id','a1000000-0000-0000-0000-000000000042','barcode','POOL-9','name','مجمَّعٌ يُشترى','qty',7,'purchase_price',100,'sell_price',150)),
         jsonb_build_object('company_name','مورّدُ المجمَّع'));" >/dev/null 2>&1
chk "الشراءُ يفكّ صفةَ «مجمّع» عن المنتج" \
    "select pooled::text from products where id='a1000000-0000-0000-0000-000000000042'" "false"
chk "  ورصيدُه صار سبعةً معدودة" \
    "select stock::text from products where id='a1000000-0000-0000-0000-000000000042'" "7.000"

# G3 سلوكياً: رمزٌ إضافيٌّ لمحذوفٍ يصير لغيره أثناء الغياب — الاستعادةُ لا
# تسترجعه (وإلا صار رمزٌ واحدٌ على منتجَين)، ورمزُه الحرُّ يبقى.
$P -c "select set_config('request.jwt.claim.sub','$AC',false);
       insert into products (id, clinic_id, name, barcode, alt_codes, stock) values
         ('a1000000-0000-0000-0000-000000000021','$AC','سيُحذف','DEL-100',array['STOLEN-1','MINE-1'],4)
       on conflict do nothing;
       select delete_product('a1000000-0000-0000-0000-000000000021','فحص');
       update products set alt_codes = array['DET-500','STOLEN-1'] where id='a1000000-0000-0000-0000-000000000011';
       select restore_product('a1000000-0000-0000-0000-000000000021');" >/dev/null 2>&1
chk "الاستعادةُ لا تعيد رمزاً صار لغيره" \
    "select (not (alt_codes @> array['STOLEN-1']))::text from products where id='a1000000-0000-0000-0000-000000000021'" "true"
chk "  وتُبقي رمزَه الذي ما زال حرّاً" \
    "select (alt_codes @> array['MINE-1'])::text from products where id='a1000000-0000-0000-0000-000000000021'" "true"
chk "  وباركودُه ورصيدُه يرجعان كما كانا" \
    "select (barcode = 'DEL-100' and stock = 4)::text from products where id='a1000000-0000-0000-0000-000000000021'" "true"
chk "ولا رمزَ واحدٌ على منتجَين بعدها" \
    "select count(*)::text from products where clinic_id='$AC' and alt_codes @> array['STOLEN-1']" "1"

# عزلُ العيادات — **بدور `authenticated` لا كـsuperuser**: `product_by_code`
# تعتمد سياساتِ الصفوف لا فحصاً بجسمها، وsuperuser يتجاوز RLS (CLAUDE.md §٣).
# ففحصُ عزلٍ يجري بالدور الأعلى يمرّ لسببٍ خاطئ ويطمئنُّ على ما لم يُقس.
chk "الاستدعاءُ يرى صفَّي عيادته بدور authenticated" \
    "select _rls_try('$AC', 'select 1 from product_by_code(''DET-500'')')" "rows:2"
chk "  ولا يرى شيئاً لعيادةٍ أخرى" \
    "select _rls_try('22222222-2222-2222-2222-222222222222', 'select 1 from product_by_code(''DET-500'')')" "rows:0"
chk "وصحّةُ الباركودات تعمل بدور authenticated" \
    "select left(_rls_try('$AC', 'select 1 from verify_barcode_health()'), 5)" "rows:"
chk "ومحفّزُ التوأم يحرس بدور authenticated كذلك" \
    "select left(_rls_try('$AC', 'insert into products (clinic_id,name,barcode) values (''$AC'',''محاولة'',''DET-500'')'), 8)" "guarded:"


# ── 0172: الخادمُ يعرف صيغَ الماسح (س٥) ─────────────────────────────────
# كانت طبقاتُ النجدة كلُّها بالمتصفّح، والخادمُ يُسأل بالرمز **كما وصل**. فمنتجٌ
# أُدخل بجهازٍ آخرَ قبل قليل ومُسح بماسحٍ مضبوطٍ على AIM أو GTIN-14 يخيب
# بالطبقات الأربع: القائمةُ لا تعرفه، والخادمُ سُئل بالرمز الملبَّس. ومن هنا
# قرارُ «أُعيد إدخالها» الذي يصنع التوأمَ ويقسم الرصيد.
echo "▸ 0172: صيغُ الماسح بالخادم"
chk "قشرُ رأس AIM يولّد الرمزَ العاري" \
    "select (inv_code_variants(']C16221031492405') @> array['6221031492405'])::text" "true"
chk "  وGTIN-14 بصفرٍ يولّد EAN-13" \
    "select (inv_code_variants('06221031492405') @> array['6221031492405'])::text" "true"
chk "  وUPC-A بـ١٢ يولّد EAN-13 بصفر" \
    "select (inv_code_variants('045496830434') @> array['0045496830434'])::text" "true"
# ثلاثُ خطواتٍ لا خطوةٌ واحدة: «AIM ثم ١٤ ثم ١٣ ثم ١٢» سلسلةٌ تكتمل.
chk "  والسلسلةُ تكتمل: AIM ثم أصفارٌ متتالية" \
    "select (inv_code_variants(']c100622103149240') @> array['622103149240'])::text" "true"
chk "  ورمزٌ نظيف لا يولّد إلا نفسَه" \
    "select array_length(inv_code_variants('6221031492405'),1)::text" "1"

# عيادةُ هذا القسم وحدها — ولا تُخلط ببقايا ما سبق.
VC="33333333-3333-3333-3333-333333333333"
VCJ="select set_config('request.jwt.claim.sub','$VC',true)"
$P -c "insert into products (id, clinic_id, name, barcode, alt_codes, stock, created_at) values
         ('c1720000-0000-0000-0000-000000000001','$VC','أساسيّ','6221031492405','{}',5,'2026-01-01'),
         ('c1720000-0000-0000-0000-000000000002','$VC','مخزونٌبصفر','0045496830434','{}',5,'2026-01-02'),
         ('c1720000-0000-0000-0000-000000000003','$VC','صاحبُإضافيّ','RF-0172',array['9781234567897'],5,'2026-01-03')
       on conflict do nothing;" >/dev/null 2>&1
chk "«]C1 + ١٣ رقماً» يرجع صاحبَه من الخادم" \
    "select name from ($VCJ) s, product_by_code(']C16221031492405') limit 1" "أساسيّ"
chk "  و«0 + EAN-13» كذلك" \
    "select name from ($VCJ) s, product_by_code('06221031492405') limit 1" "أساسيّ"
chk "  وUPC-A ممسوحاً على مخزونٍ بـEAN-13" \
    "select name from ($VCJ) s, product_by_code('045496830434') limit 1" "مخزونٌبصفر"
chk "  والرمزُ الإضافيُّ يُنقذ مثلَ الأساسيّ" \
    "select name from ($VCJ) s, product_by_code('09781234567897') limit 1" "صاحبُإضافيّ"
chk "  ورمزٌ لا يخصّ أحداً يبقى لا شيء" \
    "select count(*)::text from ($VCJ) s, product_by_code('1112223334445')" "0"

# **الحرفيُّ يغلب التخمين**: لو خُلطت الصيغُ بالمطابقة الحرفية لصار رمزٌ يطابق
# صاحبَه حرفياً ويطابق آخرَ بصيغةٍ ⇒ صفّان ⇒ «رمزٌ ملتبس» تصرخ به الواجهةُ على
# مسارٍ كان سليماً. فالصيغُ لا تُسأل إلا بعد خيبةِ الحرفيّ.
$P -c "insert into products (id, clinic_id, name, barcode, stock, created_at) values
         ('c1720000-0000-0000-0000-000000000004','$VC','اثنتاعشرة','045496830434',5,'2026-01-04')
       on conflict do nothing;" >/dev/null 2>&1
chk "الحرفيُّ يغلب التخمين — صفٌّ واحد لا صفّان" \
    "select count(*)::text from ($VCJ) s, product_by_code('045496830434')" "1"
chk "  وهو صاحبُ الرمز حرفياً" \
    "select name from ($VCJ) s, product_by_code('045496830434') limit 1" "اثنتاعشرة"
chk "  والعكسُ كذلك" \
    "select name from ($VCJ) s, product_by_code('0045496830434') limit 1" "مخزونٌبصفر"

# عزلُ العيادات **بدور authenticated**: الدالّةُ بصلاحية المُستدعي، وsuperuser
# يتجاوز RLS — ففحصُ عزلٍ بالدور الأعلى يمرّ لسببٍ خاطئ (CLAUDE.md §٣).
chk "الصيغُ لا توسّع ما يُرى: عيادةٌ أخرى لا تلقاه" \
    "select _rls_try('22222222-2222-2222-2222-222222222222', 'select 1 from product_by_code('']C16221031492405'')')" "rows:0"
chk "  وصاحبُها يلقاه بدور authenticated" \
    "select _rls_try('$VC', 'select 1 from product_by_code('']C16221031492405'')')" "rows:1"
chk "والدالّتان المساعدتان ممنوعتان على anon" \
    "select (has_function_privilege('anon','public.inv_code_variants(text)','execute')
          or has_function_privilege('anon','public.inv_code_step(text)','execute'))::text" "false"
chk "والاستدعاءُ بصلاحية المُستدعي لا المالك — وإلا بطل العزل" \
    "select prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='product_by_code'" "false"

# ── 0167: رمزٌ واحد لمنتجٍ واحد ──────────────────────────────────────────
# سلوكيّ: الحزمةُ تعرف `products` و`inv_norm_code` (0164)، فالمحفّزُ يُجرَّب حقاً.
echo "▸ 0167: حارسُ التوأم"
$P -c "insert into products (id, clinic_id, name, barcode, stock, alt_codes) values
         ('e7000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','صاحبُ الرمز','TW-100', 1, array['TW-ALT']),
         ('e7000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','عيادةٌ أخرى','TW-100', 1, '{}')
       on conflict do nothing;" >/dev/null 2>&1
$P -c "create or replace function _twin_try(q text) returns text language plpgsql as \$fn\$
       declare h text;
       begin execute q; return 'accepted';
       exception when others then get stacked diagnostics h = pg_exception_hint; return 'guarded:' || coalesce(h, sqlerrm); end \$fn\$;" >/dev/null
chk "رمزٌ مأخوذ يُرفض، والرسالةُ تسمّي صاحبَه" \
    "select (_twin_try('insert into products (clinic_id,name,barcode) values (''11111111-1111-1111-1111-111111111111'',''محاولة'',''TW-100'')') like 'guarded:%صاحبُ الرمز%')::text" "true"
chk "والتوأمُ المطبَّع كذلك (علامةُ اتجاهٍ خفية)" \
    "select (_twin_try('insert into products (clinic_id,name,barcode) values (''11111111-1111-1111-1111-111111111111'',''محاولة'',''' || chr(8206) || 'TW-100'')') like 'guarded:%')::text" "true"
chk "ورمزٌ يملكه غيرُه كـalt_codes يُرفض (ما لا يراه الفهرسُ الفريد)" \
    "select (_twin_try('insert into products (clinic_id,name,barcode) values (''11111111-1111-1111-1111-111111111111'',''محاولة'',''TW-ALT'')') like 'guarded:%')::text" "true"
chk "وعيادةٌ أخرى بنفس الرمز تمرّ (العزلُ محفوظ)" \
    "select count(*)::text from products where id='e7000000-0000-0000-0000-000000000002'" "1"
chk "وتحديثُ الصفّ نفسِه برمزه لا يُرفض (إعفاءُ ما لم يتغيّر)" \
    "select _twin_try('update products set barcode = ''TW-100'' where id = ''e7000000-0000-0000-0000-000000000001''')" "accepted"
chk "ورمزٌ حرٌّ يُقبل" \
    "select _twin_try('update products set barcode = ''TW-FREE'' where id = ''e7000000-0000-0000-0000-000000000001''')" "accepted"
chk "المحفّزُ invoker لا definer" \
    "select (not prosecdef)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='products_no_twin_code'" "true"
# ساكن: «رتّب المخزن» تحذف التوأم قبل أن تورّث رمزَه (وإلا خرقت الفهرسَ الفريد)
chk "رتّبِ المخزن: الحذفُ قبل توريث الرمز" \
    "select (strpos(prosrc,'delete from products where id = dup.id') < strpos(prosrc,'update products set stock = greatest(0, coalesce(stock,0)'))::text
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='inventory_tidy_uncat'" "true"
chk "والاستعادةُ تفحص alt_codes الغير قبل أن تعيد الباركود" \
    "select (prosrc like '%unnest(coalesce(o.alt_codes%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='restore_product'" "true"
# G11: attach_product_code بلا مستدعٍ من الواجهة — والصلاحياتُ تبقى محكومة
chk "attach_product_code لا تُنادى بلا هويّة" \
    "select has_function_privilege('anon','public.attach_product_code(uuid,text)','execute')::text" "false"
chk "  وتبقى للمسجَّلين" \
    "select has_function_privilege('authenticated','public.attach_product_code(uuid,text)','execute')::text" "true"


# ── 0168: صحّةُ الباركودات — صفرٌ على النظيف، وكلُّ نوعٍ على الملغوم ────────
# عيادةٌ خاصّةٌ بهذا الفحص لا تختلط ببقايا الكتل السابقة، ونقيس أنّها ترجع صفراً
# **قبل** الزرع: لو تسرّب صفٌّ من عيادةٍ أخرى لانكشف قبل أن نصدّق الأنواع.
echo "▸ 0168: صحّةُ الباركودات"
HB="e8000000-0000-0000-0000-000000000088"
# الهويّةُ تُضبط داخل الاستعلام نفسِه (كبقية الكتل): `chk` يجري كـsuperuser بلا جلسة.
HBJ="(select set_config('request.jwt.claim.sub','$HB',true)) s cross join lateral verify_barcode_health() h"
chk "الدالّة definer بمسارٍ مثبَّت" \
    "select (prosecdef and proconfig @> array['search_path=public'])::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='verify_barcode_health'" "true"
chk "  ولا تكتب شيئاً (stable)" \
    "select (provolatile='s')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='verify_barcode_health'" "true"
chk "  ولا تُنادى بلا هويّة" \
    "select has_function_privilege('anon','public.verify_barcode_health()','execute')::text" "false"
chk "  وتبقى للمسجَّلين" \
    "select has_function_privilege('authenticated','public.verify_barcode_health()','execute')::text" "true"
chk "عيادةٌ بلا رموزٍ معطوبة ترجع صفراً" \
    "select count(*)::text from $HBJ" "0"
# الزرعُ يمرّ بمحفّز التوأم (0167) فيَرفض صفَّ التوأم ويُسقط العبارةَ كلَّها —
# فيُعطَّل للزرع وحده، ويُفحَص رجوعُه: حارسٌ يُعطَّل ويُنسى أخطرُ من حارسٍ لم يوجد.
$P -c "alter table products disable trigger products_no_twin_code;" >/dev/null 2>&1
$P -c "insert into products (id, clinic_id, name, barcode, alt_codes, stock) values
  ('e8000000-0000-0000-0000-000000000001','$HB','توأم أ','HB-100','{}',0),
  ('e8000000-0000-0000-0000-000000000002','$HB','توأم ب','hb-100','{}',0),
  ('e8000000-0000-0000-0000-000000000003','$HB','صاحبُ الرمز','HB-OWN','{}',0),
  ('e8000000-0000-0000-0000-000000000004','$HB','المستعير','HB-BORROW',array['HB-OWN'],0),
  ('e8000000-0000-0000-0000-000000000005','$HB','كيبورد عربي','اففحس','{}',0),
  ('e8000000-0000-0000-0000-000000000006','$HB','إكسل علمي','1.23457E+12','{}',0),
  ('e8000000-0000-0000-0000-000000000007','$HB','إكسل ذيل','8681234567890.0','{}',0),
  ('e8000000-0000-0000-0000-000000000008','$HB','رمزٌ فارغ',chr(8206)||' ','{}',0),
  ('e8000000-0000-0000-0000-000000000009','$HB','سليم','6970967772736','{}',0)
  on conflict do nothing;" >/dev/null 2>&1
$P -c "alter table products enable trigger products_no_twin_code;" >/dev/null 2>&1
chk "محفّزُ التوأم رجع مفعَّلاً بعد الزرع" \
    "select (tgenabled='O')::text from pg_trigger where tgrelid='products'::regclass and tgname='products_no_twin_code'" "true"
chk "  والزرعُ وصل كاملاً (وإلا فالأنواعُ تُقاس على لا شيء)" \
    "select count(*)::text from products where clinic_id='$HB'" "9"
chk "توأمٌ مطبَّع: الصفّان كلاهما (وطيُّ الحالة يجمعهما)" \
    "select count(*)::text from $HBJ where h.kind='twin'" "2"
chk "ورمزٌ إضافيٌّ صاحبُه غيرُه: المستعيرُ وحده" \
    "select coalesce(string_agg(h.product_name,'،'),'∅') from $HBJ where h.kind='alt_owned'" "المستعير"
chk "وحروفٌ عربية بالباركود" \
    "select count(*)::text from $HBJ where h.kind='arabic'" "1"
chk "وشكلا إكسل (علميّ وذيلُ صفر)" \
    "select count(*)::text from $HBJ where h.kind='excel'" "2"
chk "ورمزٌ يفرغ بعد التطبيع" \
    "select count(*)::text from $HBJ where h.kind='empty'" "1"
chk "والرمزُ السليم لا يُشتكى منه" \
    "select count(*)::text from $HBJ where h.product_name='سليم'" "0"
# بالمعرّفات لا بالأسماء: كتلةُ 0165/0166 تزرع «المستعير» و«صاحبُ الرمز» بعيادةِ
# الفحص الأولى، فالمطابقةُ بالاسم كانت تجد صفَّ العيادة **نفسِها** وتظنّه تسرّباً.
# ومعرّفاتُ هذه الكتلة وحدَها تبدأ بـ`e8000000` فالسؤالُ صار دقيقاً: أترى عيادةٌ
# أخرى شيئاً ممّا زُرع هنا؟
chk "ولا ترى عيادةٌ رموزَ عيادةٍ أخرى" \
    "select count(*)::text from (select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true)) s cross join lateral verify_barcode_health() h where h.product_id::text like 'e8000000-%'" "0"

# ── 0174: صورة المنتج — مسارٌ بالقاعدة والبايتات بالمخزن ─────────────────────
# لا storage بالحزمة، فالمفحوص هنا: العمود، وأن كتلوج المتجر صار يرجعه،
# وأن التوقيع القديم أُسقط (بقاؤه يجعل نداء p_slug وحده ملتبساً بين توقيعين).
echo "▸ 0174: صورة المنتج"
chk "products.image_path موجود" \
    "select count(*)::text from information_schema.columns where table_name='products' and column_name='image_path'" "1"
chk "وكتلوج المتجر يرجع المسار" \
    "select (prosrc like '%p.image_path%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='store_catalog'" "true"
chk "وتوقيعٌ واحد للدالّة لا اثنان" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='store_catalog'" "1"

# ── 0175: مكتبة الصور — القراءة للجميع والكتابة للمشغّل وحده ─────────────────
# الحارس بالقاعدة لا بالواجهة، فيُفحص بدور authenticated حقيقيّ (_rls_try):
# موظّفُ عيادةٍ لا يكتب صفاً بالمكتبة، والمشغّل يكتب. وعدّادُ الاستعمال
# definer بحارسه الداخليّ — يُرفض لغير المشغّل قبل أن يلمس المنتجات.
echo "▸ 0175: مكتبة الصور"
chk "الجدول موجود وRLS مفعّلة" \
    "select (relrowsecurity)::text from pg_class where relname='image_library'" "true"
chk "وكتابتها مشروطة بصفة المشغّل" \
    "select (count(*) = 3)::text from pg_policies where tablename='image_library' and cmd in ('INSERT','UPDATE','DELETE') and coalesce(qual, with_check) like '%is_platform_admin%'" "true"
$P -c "update _dvtest_flags set admin = false;" >/dev/null
chk "موظّفُ عيادةٍ لا يضيف للمكتبة (RLS بدورٍ حقيقيّ)" \
    "select left(_rls_try('$C1', 'insert into image_library(name, path) values (''فحص'', ''library/x.webp'')'), 13)" "guarded:42501"
chk "  ولا ينادي عدّادَ الاستعمال" \
    "select left(_pf_try('$C1', 'select image_library_usage(''library/x.webp'')::text'), 7)" "guarded"
$P -c "update _dvtest_flags set admin = true;" >/dev/null
chk "والمشغّل يضيف" \
    "select _rls_try('$ADM', 'insert into image_library(name, company, section, path) values (''رويال كانين ٢ كغم'', ''رويال كانين'', ''أكل قطط'', ''library/t1.webp'')')" "rows:1"
chk "  وعدّادُه يشتغل (صفرُ استعمالٍ لصورةٍ جديدة)" \
    "select _pf('$ADM', 'select image_library_usage(''library/t1.webp'')::text')" "0"
chk "  والعدّاد definer بمسارٍ مثبَّت" \
    "select (prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text from pg_proc where proname='image_library_usage'" "true"
$P -c "update _dvtest_flags set admin = false;" >/dev/null

# ── 0176: قرار الطلب نهائي، والتتبّع برقمٍ وهاتفٍ معاً ───────────────────────
echo "▸ 0176: حارس حالة الطلب وتتبّع الزبون"
# صفُّ اشتراكٍ فعّال: كلُّ عيادةٍ حيّةٍ لها واحد (الأربعُ المقيسة على باقةٍ
# مدفوعةٍ سارية)، ومتجرٌ بلا اشتراكٍ حالةٌ لا تنتجها القاعدة. وبدونه صار
# `store_front` يقول «مغلق» بحقّ — فالقالبُ يُقاس على ما تُنتجه القاعدة فعلاً.
$P -c "insert into subscriptions (clinic_id, plan, current_period_end)
         values ('$C1', 'super', now() + interval '1 year')
       on conflict (clinic_id) do update set current_period_end = now() + interval '1 year';" >/dev/null 2>&1
$P -c "insert into store_profiles (clinic_id, slug, enabled) values ('$C1', 'trackclinic', true) on conflict (clinic_id) do update set slug = 'trackclinic';
       insert into store_orders (id, clinic_id, order_no, customer_name, customer_phone, items, subtotal, status, total)
         values ('ee176000-0000-4000-8000-000000000001', '$C1', 'SO-TST01', 'زبون التتبّع', '0770 123 4567', '[]'::jsonb, 25000, 'new', 25000)
       on conflict do nothing;" >/dev/null
$P -c "update store_orders set status='accepted' where id='ee176000-0000-4000-8000-000000000001';" >/dev/null
chk "طلبٌ جديد يتقرّر قبولاً" \
    "select status from store_orders where id='ee176000-0000-4000-8000-000000000001'" "accepted"
chk "  والختمُ الزمنيّ من الخادم لا من المتصفح" \
    "select (decided_at is not null and decided_at > now() - interval '1 minute')::text from store_orders where id='ee176000-0000-4000-8000-000000000001'" "true"
chk "  ومقبولٌ لا يرجع «جديد» (يُقبل مرتين عند موظفٍ ثانٍ)" \
    "select left(_pf_try('$C1', 'update store_orders set status=''new'' where id=''ee176000-0000-4000-8000-000000000001'''), 7)" "guarded"
chk "  ولا يتحوّل لقرارٍ آخر" \
    "select left(_pf_try('$C1', 'update store_orders set status=''rejected'' where id=''ee176000-0000-4000-8000-000000000001'''), 7)" "guarded"
chk "التتبّع بالرقم والهاتف معاً يرجع الحالة" \
    "select status from store_order_track('trackclinic', 'so-tst01', '+964 770 123 4567')" "accepted"
chk "  وهاتفٌ غلط يرجع لا شيء — الرقمُ وحده لا يكفي" \
    "select count(*)::text from store_order_track('trackclinic', 'SO-TST01', '0999 999 9999')" "0"
chk "  والدالّة definer بمسارٍ مثبَّت" \
    "select (prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text from pg_proc where proname='store_order_track'" "true"

# ── 0177: مختارات المتجر ─────────────────────────────────────────────────────
echo "▸ 0177: مختارات المتجر"
chk "العلم موجود وافتراضه false" \
    "select column_default from information_schema.columns where table_name='products' and column_name='store_featured'" "false"
chk "والكتلوج يرجعه" \
    "select (prosrc like '%store_featured%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='store_catalog'" "true"

# ── 0178: قراءة الستور بلا حدود، وحدُّ الطلبات يعرف ذيل الرقم ─────────────────
# حاجز 0096 كان يُرجع كتلوجاً فارغاً و«لا طلب» بصمتٍ بعد ٣٠٠ قراءة/دقيقة/IP —
# وخلف CGNAT العراقي الـIP لآلاف الزبائن الشرعيين. الفحص يضغط ٣٥٠ نداءً بنفس
# الرأس المزوَّر الذي كان يشبع الحاجز، وكلُّها لازم ترجع. وحدُّ «١٠ طلبات
# للرقم» صار يقارن آخر عشر خانات فما ينخدع بكتابة +964 بعد 0771.
echo "▸ 0178: قراءة بلا حدود وحدُّ طلباتٍ بالذيل"
chk "٣٥٠ تتبّعاً متتالياً من نفس الـIP كلُّها ترجع — الحاجز انكسر فعلاً" \
    "select count(*)::text from (select set_config('request.headers','{\"x-forwarded-for\":\"9.9.9.9\"}',true)) s cross join lateral (select t.status from generate_series(1,350) g cross join lateral store_order_track('trackclinic','SO-TST01','07701234567') t) q where q.status='accepted'" "350"
chk "  ولا يُكتب صفُّ عدّادٍ للقراءة بعد اليوم" \
    "select count(*)::text from store_read_hits where ip='9.9.9.9'" "0"
chk "  والقراءتان صارتا stable بلا لمسٍ للعدّاد" \
    "select (bool_and(provolatile='s') and bool_and(prosrc not like '%store_read_hits%'))::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('store_catalog','store_order_track')" "true"
chk "  وحارسا الطول باقيان (هاتفٌ قصير لا يرجع شيئاً)" \
    "select count(*)::text from store_order_track('trackclinic','SO-TST01','123')" "0"
t_ms=$(psql -h $SOCK -p $PORT -U postgres -d $DB -tAc "select round(extract(epoch from (clock_timestamp() - now()))*1000/350, 3)::text from (select count(*) from generate_series(1,350) g cross join lateral store_order_track('trackclinic','SO-TST01','07701234567') t) s" | tr -d '[:space:]')
printf '   ℹ متوسط كلفة نداء التتبّع محلياً: %s ms\n' "$t_ms"
$P -c "insert into products (id, clinic_id, name, sell_price, stock, store_visible)
         values ('ee178000-0000-4000-8000-000000000001', '$C1', 'منتج ستور 0178', 5000, 30, true)
       on conflict (id) do update set store_visible = true, stock = 30;
       insert into store_orders (clinic_id, order_no, customer_name, customer_phone, items, subtotal, status, total)
         select '$C1', 'SO-RL'||g, 'مغرِق', '0771 555 6666', '[]'::jsonb, 1000, 'new', 1000 from generate_series(1,10) g;" >/dev/null
chk "عشرةٌ بالرقم المحلي ثم +964 لنفس الذيل: الحدُّ يمسكها" \
    "select store_place_order('trackclinic', 'زبون فحص', '+964 771 555 6666', 'عنوان', '', '[{\"product_id\":\"ee178000-0000-4000-8000-000000000001\",\"qty\":1}]'::jsonb)->>'error'" "rate_limited"
chk "  ورقمٌ بذيلٍ آخر يطلب طبيعياً" \
    "select store_place_order('trackclinic', 'زبون فحص', '0772 000 1122', 'عنوان', '', '[{\"product_id\":\"ee178000-0000-4000-8000-000000000001\",\"qty\":2}]'::jsonb)->>'ok'" "true"
chk "  وكسرٌ بالكمية يُرفض كلُّه لا يُدوَّر" \
    "select store_place_order('trackclinic', 'زبون فحص', '0773 000 1122', 'عنوان', '', '[{\"product_id\":\"ee178000-0000-4000-8000-000000000001\",\"qty\":2.5}]'::jsonb)->>'error'" "bad_items"
chk "  والدوالُّ الثلاث definer بمسارٍ مثبَّت" \
    "select (count(*) = 3)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('store_catalog','store_order_track','store_place_order') and p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%'" "true"

# ── 0180: فاتورةٌ واحدة = طلبُ توصيلٍ واحد ───────────────────────────────────
# الجذر: رسالةُ فشل التوصيل بشاشة البيع كانت تدلّ الكاشير على «تبويب التوصيل»
# — والتبويبُ موجودٌ لكنّه كلُّه تحديثٌ لصفٍّ قائم، ولا موضعَ بالتطبيق يُنشئ
# طلباً لفاتورةٍ قائمة. فالمخرجُ الوحيد أمامه إعادةُ البيعة، وهي التي تولّد
# صفَّ التوصيل الثاني: ذمّةٌ مضاعفةٌ على شركة التوصيل. والقاعدةُ لم تمنعه —
# 0069 أعطته فهرساً عادياً لا فريداً. القياسُ قبل الشحن: ٤٨٨ صفّاً بالإنتاج
# وصفرُ تكرار، فالفريدُ ينزل بلا تنظيف.
echo "▸ 0180: طلبُ توصيلٍ واحدٌ لكلّ فاتورة"
$P -c "insert into invoices(id,clinic_id) values
         ('dddddddd-0180-4000-8000-000000000001','$C1'),
         ('dddddddd-0180-4000-8000-000000000002','$C1') on conflict do nothing;
       insert into delivery_orders(id,clinic_id,invoice_id,status,cod_amount) values
         ('eeeeeeee-0180-4000-8000-000000000001','$C1','dddddddd-0180-4000-8000-000000000001','preparing',7000)
         on conflict do nothing;" >/dev/null
chk "الفهرسُ فريدٌ فعلاً" \
    "select indisunique::text from pg_index where indexrelid='delivery_orders_invoice_uniq'::regclass" "true"
chk "  والعاديُّ المكرَّر انشال (لا يجاوره فهرسان بنفس العمود)" \
    "select count(*)::text from pg_class where relname='delivery_orders_invoice_idx'" "0"
# بدور `authenticated` لا بـsuperuser: المسارُ الإنتاجيّ يمرّ من RLS أوّلاً،
# فلو ردّته سياسةٌ قبل أن يصل القيدَ لظهر الفحصُ أخضرَ على غير ما يدّعي.
chk "طلبٌ ثانٍ لنفس الفاتورة يُرفض بـ23505 (لا بسياسةٍ ولا بشيءٍ آخر)" \
    "select left(_rls_try('$C1', 'insert into delivery_orders(clinic_id,invoice_id,status,cod_amount) values (''$C1'',''dddddddd-0180-4000-8000-000000000001'',''preparing'',7000)'), 13)" "guarded:23505"
chk "  وباسم الفهرس بالنصّ — فرسالةُ المستخدم تُلتقط باسمه لا برمزٍ عامّ" \
    "select (_rls_try('$C1', 'insert into delivery_orders(clinic_id,invoice_id,status,cod_amount) values (''$C1'',''dddddddd-0180-4000-8000-000000000001'',''preparing'',7000)') like '%delivery_orders_invoice_uniq%')::text" "true"
chk "  والفاتورةُ الأولى ما زال لها صفٌّ واحدٌ لا صفران" \
    "select count(*)::text from delivery_orders where invoice_id='dddddddd-0180-4000-8000-000000000001'" "1"
chk "  وفاتورةٌ أخرى تمرّ طبيعياً (القيدُ على التكرار لا على الإنشاء)" \
    "select _rls_try('$C1', 'insert into delivery_orders(clinic_id,invoice_id,status,cod_amount) values (''$C1'',''dddddddd-0180-4000-8000-000000000002'',''preparing'',9000)')" "rows:1"
chk "  وعيادةٌ أخرى لا تُدخل صفّاً بعيادتنا أصلاً (العزلُ قبل القيد)" \
    "select left(_rls_try('$C2', 'insert into delivery_orders(clinic_id,invoice_id,status,cod_amount) values (''$C1'',''dddddddd-0180-4000-8000-000000000002'',''preparing'',9000)'), 7)" "guarded"

# ── 0182: ترتيبُ الكتلوج حاسمٌ والمختارُ يتصدّر ────────────────────────────
# `order by category, name` ليس حاسماً: منتجان بنفس الفئة والاسم يرجعان بترتيبٍ
# يقرّره بوستغريس، فبندُ العتبةِ بين صفحتَي `offset` قد يتكرّر أو يُقفَز فوقه —
# «عرض المزيد» علِق ٨–٩ من ٣٠ محاولة. و`p.id` آخرَ المفاتيح يحسمه.
# والتوفّرُ **لا يدخل** الترتيبَ عمداً: محسوبٌ من stock ومن pooled_stock، فبيعةٌ
# أثناء التصفّح تقلب المرتبةَ فيسقط المنتجُ من الصفحة التالية صامتاً.
echo "▸ 0182: ترتيبُ الكتلوج"
$P -c "insert into products (id, clinic_id, name, category, sell_price, stock, store_visible, store_featured) values
         ('a1820000-0000-4000-8000-000000000001','$C1','توأم الترتيب','food',1000,5,true,false),
         ('a1820000-0000-4000-8000-000000000002','$C1','توأم الترتيب','food',1000,5,true,false),
         ('a1820000-0000-4000-8000-000000000003','$C1','مختار الفحص','zzz',2000,5,true,true)
       on conflict (id) do update set store_visible = excluded.store_visible, store_featured = excluded.store_featured;" >/dev/null
chk "الترتيبُ حاسم: نفسُ الاستعلام مرّتين يعطي نفسَ التسلسل" \
    "select (a.ids = b.ids)::text from (select string_agg(id::text,',' order by rn) ids from (select id, row_number() over () rn from store_catalog('trackclinic',100,0)) x) a cross join (select string_agg(id::text,',' order by rn) ids from (select id, row_number() over () rn from store_catalog('trackclinic',100,0)) y) b" "true"
chk "  وصفحتان بـoffset لا تتقاطعان ولا تُسقطان صفّاً" \
    "select (count(*) = count(distinct id))::text from (select id from store_catalog('trackclinic',2,0) union all select id from store_catalog('trackclinic',2,2)) q" "true"
chk "  والمختارُ يتصدّر من الخادم لا من المتصفّح" \
    "select (featured)::text from store_catalog('trackclinic',100,0) limit 1" "true"
# لقطةُ الترتيب قبل البيعة، ثم نُفرغ رصيدَ منتجٍ ونقارن: هذا هو الفرقُ بين
# «خللِ عرض» و«قائمةٍ ناقصة» — ولو دخل التوفّرُ الفرزَ لتبدّل التسلسل هنا.
$P -c "drop table if exists _o182_before; create table _o182_before as
         select id, row_number() over () rn from store_catalog('trackclinic',100,0);" >/dev/null 2>&1
$P -c "update products set stock = 0 where id = 'a1820000-0000-4000-8000-000000000001';" >/dev/null
chk "  والتوفّرُ خارجَ الترتيب: نفادُ منتجٍ أثناء التصفّح لا يزحزح التسلسل" \
    "select (b.ids = a.ids)::text from (select string_agg(id::text,',' order by rn) ids from _o182_before) b cross join (select string_agg(id::text,',' order by rn) ids from (select id, row_number() over () rn from store_catalog('trackclinic',100,0)) y) a" "true"
chk "  والنافدُ باقٍ بالكتلوج مُعلَّماً لا محذوفاً" \
    "select (count(*) = 1)::text from store_catalog('trackclinic',100,0) where id = 'a1820000-0000-4000-8000-000000000001' and not available" "true"
$P -c "drop table if exists _o182_before;" >/dev/null 2>&1
chk "  والدالّة definer بمسارٍ مثبَّت وstable" \
    "select (prosecdef and provolatile='s' and coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text from pg_proc where proname='store_catalog'" "true"

# ── 0183: القبولُ ذرّيّ، والأعمدةُ مجمَّدة، والحدودُ على ما ينتظر ──────────
# الجذر: القبولُ كان ثلاثَ رحلاتٍ من المتصفّح (فاتورة ← توصيل ← ختم)، وكلُّ
# حدٍّ بينها نقطةُ انكسار: فاتورةٌ بلا ختمٍ تترك الطلبَ «جديداً» والبضاعةَ
# خارجة، وختمٌ بلا توصيلٍ يترك طلباً «مقبولاً» لا يراه أحد. صارت معاملةً واحدة.
echo "▸ 0183: القبولُ الذرّيّ وحرّاسُ الطلب"
$P -c "insert into products (id, clinic_id, name, sell_price, purchase_price, stock, store_visible)
         values ('a1830000-0000-4000-8000-000000000001','$C1','منتج القبول',5000,3000,20,true)
       on conflict (id) do update set stock = 20, store_visible = true;
       insert into store_orders (id, clinic_id, order_no, customer_name, customer_phone, items, subtotal, delivery_fee, total, status)
         values ('e1830000-0000-4000-8000-000000000001','$C1','SO-ACC01','زبون القبول','0770 111 2233',
                 jsonb_build_array(jsonb_build_object('product_id','a1830000-0000-4000-8000-000000000001','name','منتج القبول','qty',2,'price',5000,'total',10000)),
                 10000, 2000, 12000, 'new')
       on conflict (id) do nothing;" >/dev/null
# `_pf` تضبط هويّةَ المستدعي قبل التنفيذ: الدالّةُ definer وتفحص العيادةَ
# والدورَ بنفسها (درس 0145)، فبلا هويّةٍ ترفض — وهذا هو المقصود.
chk "القبولُ يولّد الفاتورةَ وصفَّ التوصيل ويختم الطلبَ بنداءٍ واحد" \
    "select (_pf('$C1', 'select store_accept_order(''e1830000-0000-4000-8000-000000000001'')::text')::jsonb->>'ok')" "true"
chk "  والطلبُ صار مقبولاً بمرجع فاتورته" \
    "select (status = 'accepted' and invoice_id is not null)::text from store_orders where id='e1830000-0000-4000-8000-000000000001'" "true"
chk "  وصفُّ التوصيل انولد بنفس الفاتورة" \
    "select (count(*) = 1)::text from delivery_orders d join store_orders o on o.invoice_id = d.invoice_id where o.id='e1830000-0000-4000-8000-000000000001'" "true"
chk "  والمخزونُ انسحب مرّةً واحدة (20−2=18)" \
    "select stock::int::text from products where id='a1830000-0000-4000-8000-000000000001'" "18"
chk "  وأجرةُ التوصيل بندُ خدمةٍ على الفاتورة لا حالةٌ خاصّة" \
    "select (count(*) = 1)::text from invoice_items ii join store_orders o on o.invoice_id = ii.invoice_id where o.id='e1830000-0000-4000-8000-000000000001' and ii.name = 'أجرة توصيل'" "true"
chk "قبولٌ أُعيد يرجع نفسَ الفاتورة ولا يسحب مخزوناً ثانياً" \
    "select (_pf('$C1', 'select store_accept_order(''e1830000-0000-4000-8000-000000000001'')::text')::jsonb->>'already')" "true"
chk "  والمخزون ما تحرّك" \
    "select stock::int::text from products where id='a1830000-0000-4000-8000-000000000001'" "18"
chk "  وعيادةٌ أخرى لا تقبل طلبَ الأولى" \
    "select left(_pf_try('$C2', 'select store_accept_order(''e1830000-0000-4000-8000-000000000001'')::text'), 7)" "guarded"
$P -c "insert into store_orders (id, clinic_id, order_no, customer_name, customer_phone, items, subtotal, delivery_fee, total, status)
         values ('e1830000-0000-4000-8000-000000000002','$C1','SO-ACC02','زبون الطبيب','0770 444 5566',
                 jsonb_build_array(jsonb_build_object('product_id','a1830000-0000-4000-8000-000000000001','name','منتج القبول','qty',1,'price',5000,'total',5000)),
                 5000, 0, 5000, 'new')
       on conflict (id) do nothing;" >/dev/null
# طبيبٌ بيطريٌّ بعيادة C1 — المفردةُ الحيّة `veterinarian` لا «doctor».
# أوّلُ صياغةٍ لحارس القبول كتبت قائمةَ أدوارٍ فيها «doctor»، وقياسُ الإنتاج
# نسفها: طبيبان حيّان كانا سيُمنعان. فالفحصُ يثبّت المفردةَ الصحيحة.
VET="55555555-5555-5555-5555-555555555555"
$P -c "insert into auth.users(id) values ('$VET') on conflict do nothing;
       insert into memberships(user_id,clinic_id,role,status) values ('$VET','$C1','veterinarian','active') on conflict do nothing;" >/dev/null
chk "  وطبيبٌ بيطريّ من نفس العيادة يقبل (المفردةُ veterinarian لا doctor)" \
    "select (_pf('$VET', 'select store_accept_order(''e1830000-0000-4000-8000-000000000002'')::text')::jsonb->>'ok')" "true"
# تجميدُ الأعمدة — بدور `authenticated` لا superuser، وإلا مرّ المحفّزُ بلا شدّ.
chk "بنودُ الطلب مجمَّدة: تعديلُ المجموع يُرفض بـhint عربيّ" \
    "select left(_rls_try('$C1', 'update store_orders set total = 1 where id = ''e1830000-0000-4000-8000-000000000001'''), 13)" "guarded:P0001"
chk "  وهاتفُ الزبون كذلك" \
    "select left(_rls_try('$C1', 'update store_orders set customer_phone = ''0000'' where id = ''e1830000-0000-4000-8000-000000000001'''), 13)" "guarded:P0001"
# فخُّ ترتيب المحفّزات: BEFORE تُطلَق أبجدياً، فاسمُ التجميد لازم يسبق حارسَ 0176.
chk "محفّزُ التجميد يسبق حارسَ الحالة أبجدياً (وإلا انقلب كلُّ قبولٍ خطأً)" \
    "select (min(tgname) = 'store_orders_before_update_freeze')::text from pg_trigger where tgrelid='store_orders'::regclass and not tgisinternal and tgname like 'store_orders_before%'" "true"
chk "  وكلاهما invoker لا definer (نمط 0162)" \
    "select (bool_and(not prosecdef))::text from pg_proc where proname in ('store_orders_guard_freeze','store_orders_guard_status')" "true"
# الحدود: العدُّ على ما ينتظر لا على كلّ الحالات.
# ثلاثمئةُ طلبٍ مبتوتٍ **قبل خمس ساعات**: داخل نافذة اليوم وخارج نافذة الساعة.
# حشرُها بلحظةٍ واحدة كان يُشعل سقفَ الساعة الذي أضافته هذه الهجرة — والقالبُ
# يُقاس على ما تُنتجه القاعدةُ فعلاً: طلباتُ يومٍ كامل لا تصل بثانية.
$P -c "insert into store_orders (clinic_id, order_no, customer_name, customer_phone, items, subtotal, total, status, created_at)
         select '$C1', 'SO-OLD'||g, 'مبتوت', '0771 999 0000', '[]'::jsonb, 100, 100, 'rejected', now() - interval '5 hours' from generate_series(1,300) g;" >/dev/null
chk "ثلاثمئةُ طلبٍ **مبتوت** لا تُقفل الباب (الحدُّ على ما ينتظر)" \
    "select coalesce(store_place_order('trackclinic','زبون جديد','0779 123 4567','عنوان','', jsonb_build_array(jsonb_build_object('product_id','a1830000-0000-4000-8000-000000000001','qty',1)))->>'error','none')" "none"
# الرفضُ الجماعيّ: بديلُ «سياسة DELETE» التي تخالف قانونَ البيت (الحذفُ طيّ).
# معلَّقاتٌ قديمةٌ للرفض الجماعيّ — تُزرع «جديدة» ابتداءً: إرجاعُ مرفوضٍ إلى
# «جديد» يمنعه حارسُ 0176 بحقّ (قرارُ الطلب نهائيّ)، فالقالبُ لا يخرقه ليختبر.
$P -c "insert into store_orders (clinic_id, order_no, customer_name, customer_phone, items, subtotal, total, status, created_at)
         select '$C1', 'SO-STALE'||g, 'معلَّق قديم', '0772 888 0000', '[]'::jsonb, 100, 100, 'new', now() - interval '48 hours' from generate_series(1,5) g;" >/dev/null
chk "الرفضُ الجماعيّ يبتّ القديمَ المعلَّق بضغطة" \
    "select (_pf('$C1', 'select store_reject_stale(24)::text')::int > 0)::text" "true"
chk "  ولا يبقى معلَّقٌ أقدمُ من يوم" \
    "select count(*)::text from store_orders where clinic_id='$C1' and status='new' and created_at < now() - interval '24 hours'" "0"
# الاشتراك: منتهٍ ⇒ المتجرُ يقول «مغلق» بدل أن يَعِد بلا وفاء.
$P -c "update subscriptions set current_period_end = now() - interval '1 day', trial_ends_at = now() - interval '1 year' where clinic_id='$C1';" >/dev/null
chk "اشتراكٌ منتهٍ يُغلق واجهةَ المتجر" \
    "select store_front('trackclinic')->>'error'" "closed"
chk "  ويمنع وقوعَ طلبٍ لا أحدَ يقدر يقبله" \
    "select store_place_order('trackclinic','زبون','0779 555 1122','عنوان','', jsonb_build_array(jsonb_build_object('product_id','a1830000-0000-4000-8000-000000000001','qty',1)))->>'error'" "closed"
$P -c "update subscriptions set current_period_end = now() + interval '1 year' where clinic_id='$C1';" >/dev/null
chk "  ويرجع بالتجديد" \
    "select coalesce(store_front('trackclinic')->>'error','open')" "open"

# ── الموجة ١ «البرهان»: ما صار يُفحص بعد أن دخل المتجرُ والبوّابةُ الحزمة ────
# الجذر: 0095 و0096 و0158 — المتجرُ كلُّه وبوّابةُ المالك — كانت **خارج** هذه
# الحزمة، فأيُّ هجرةٍ تلمسها تمرّ خضراءَ بلا فحص. وإدخالُها كشف ثلاثةَ أشياء:
#   • 0096 لا تُعاد أبداً بعد 0177/0178 (`cannot change return type`) — مقيسٌ
#     على الإنتاج: الدالّةُ الحيّة تسعةُ أعمدة وهي تعرّفها بسبعة. دَينٌ حيّ.
#   • الأساسُ كان يبني store_orders رخواً، و`create table if not exists` تجعل
#     0095 بلا أثر — فالقالبُ كُتب على عالَمٍ أوسعَ من الإنتاج.
#   • وسياساتُ 0095/0158/0174 عاريةٌ بالمصدر: 0128 تلفُّها وتحفظ الأصل، فكلُّ
#     إعادةِ تنزيلٍ تفكُّ اللفَّ وتكدّس نسخةً ثانية. صُحّحت من المنبع.
# ── 0184: الصورةُ تُورَّث بالطيّ ولا تُدفن مع التوأم ────────────────────────
# الجذر: الدمجُ والترتيبُ يورّثان الرصيدَ والرموزَ والصلاحية، ولا يورّثان
# `image_path` ولا `store_desc` — فمنتجٌ مصوَّرٌ يُطوى بمنتجٍ بلا صورة تضيع
# صورتُه: الصفُّ يذهب لسلّة المحذوفات ومعه مسارُه، والباقي يبقى فارغاً.
#
# والفحصُ يقيس **الاتجاهين**: الفراغُ يُملأ، والموجودُ لا يُزاح. لأن إصلاحاً
# بـ`coalesce` معكوسَ الترتيب يمرّ بفحصٍ من طرفٍ واحد ويمحو صورةَ الأصل.
echo "▸ 0184: الصورةُ تُورَّث بالطيّ"
$P -c "insert into products (id, clinic_id, name, sell_price, purchase_price, stock, image_path, store_desc, store_visible)
       values ('a1840000-0000-4000-8000-000000000001','$C1','أصلٌ بلا صورة',1000,500,5,null,null,false),
              ('a1840000-0000-4000-8000-000000000002','$C1','توأمٌ مصوَّر',1000,500,3,'$C1/pic-a.jpg','وصفُ-التوأم',true),
              ('a1840000-0000-4000-8000-000000000003','$C1','أصلٌ مصوَّر',1000,500,5,'$C1/keep-b.jpg','وصفُ-الأصل',false),
              ('a1840000-0000-4000-8000-000000000004','$C1','توأمٌ مصوَّرٌ ثانٍ',1000,500,3,'$C1/pic-c.jpg','وصفٌ-آخر',true)
       on conflict (id) do nothing;" >/dev/null

chk "الدمجُ يورّث صورةَ التوأم لأصلٍ بلا صورة" \
    "select _pf('$C1', 'select (merge_products(''a1840000-0000-4000-8000-000000000001''::uuid, ''a1840000-0000-4000-8000-000000000002''::uuid)).image_path')" "$C1/pic-a.jpg"
chk "  والوصفُ معها" \
    "select store_desc from products where id='a1840000-0000-4000-8000-000000000001'" "وصفُ-التوأم"
chk "  و**الظهورُ بالمتجر لا يُورَّث** — النشرُ يُقصد لا يُستنتَج" \
    "select store_visible::text from products where id='a1840000-0000-4000-8000-000000000001'" "false"
chk "وصورةُ الأصل **لا تُزاح** بصورة التوأم (coalesce لا استبدال)" \
    "select _pf('$C1', 'select (merge_products(''a1840000-0000-4000-8000-000000000003''::uuid, ''a1840000-0000-4000-8000-000000000004''::uuid)).image_path')" "$C1/keep-b.jpg"
chk "  والوصفُ كذلك" \
    "select store_desc from products where id='a1840000-0000-4000-8000-000000000003'" "وصفُ-الأصل"
# والمطويُّ يبقى بسلّة المحذوفات بمسارِه — فالاسترجاعُ يرجّع صورتَه هو.
chk "  والمطويُّ محفوظٌ بسلّته ومعه مسارُه" \
    "select (row->>'image_path') from products_trash where id='a1840000-0000-4000-8000-000000000002'" "$C1/pic-a.jpg"

# «رتّب المخزن» نفسُ المنطق: غيرُ المصنَّف يُطوى بمصنَّفٍ يطابقه اسماً.
# والقسمُ يُزرع **قبل** أن يُشار إليه: المفتاحُ الأجنبيُّ بالقالب صار كالإنتاج
# (`products.section_id → company_sections`)، فصفٌّ يشير إلى قسمٍ لا وجودَ له
# صار يُرفض هنا كما يُرفض هناك.
$P -c "insert into company_sections (id, clinic_id, name, pooled_stock)
         values ('5e180000-0000-4000-8000-000000000001','$C1','قسمٌ مجمَّع',0)
       on conflict (id) do nothing;" >/dev/null
$P -c "insert into products (id, clinic_id, name, sell_price, purchase_price, stock, section_id, image_path, store_desc)
       values ('a1840000-0000-4000-8000-000000000011','$C1','مادةُ الترتيب',1000,500,5,'5e180000-0000-4000-8000-000000000001',null,null),
              ('a1840000-0000-4000-8000-000000000012','$C1','مادةُ الترتيب',1000,500,4,null,'$C1/tidy-a.jpg','وصفٌ-من-غير-المصنَّف')
       on conflict (id) do nothing;" >/dev/null
chk "«رتّب المخزن» طوى التوأمَ فعلاً (شرطٌ مسبَق للسطر التالي)" \
    "select _pf('$C1', 'select (inventory_tidy_uncat()->>''merged'')::int >= 1')" "true"
chk "  والمسارُ وصل الأصل" \
    "select image_path from products where id='a1840000-0000-4000-8000-000000000011'" "$C1/tidy-a.jpg"

# الدلو: الحارسُ `to_regclass` يتخطّاه بالحزمة (لا مخطّط storage)، فنفحص أنّ
# الهجرةَ **لا تنفجر** بغيابه — وهو بالضبط ما تقيسه إعادةُ التنزيل مرّتين.
chk "  وهجرةُ الدلو تُتخطّى بلا انفجارٍ حين لا مخطّطَ storage" \
    "select (to_regclass('storage.buckets') is null)::text" "true"

# ── 0185: قمعُ المتجر يُقاس — والقيدُ يتّسع للأحداث الأربعة ────────────────
# الجذر: خطّةُ ت١ قالت «لا تحتاج هجرةً، قيدُ الجدول على device وحده». والقياسُ
# على الإنتاج كذّبها: 0114 وضعت قيداً على `event` كذلك وبنصٍّ صريح. ولولا
# القياسُ لشُحنت أربعةُ أحداثٍ ترفضها القاعدةُ ويبلع `api/track.ts` فشلَها
# بتصميمه — فيبدو القياسُ شغّالاً وهو يقيس صفراً.
echo "▸ 0185: قمعُ المتجر يُقاس"
# القبولُ يُبرهَن بإدراجٍ فعليّ لا بقراءة نصِّ القيد: نصٌّ يحوي الاسمَ قد يكون
# بتعليقٍ أو بفرعٍ آخر — الإدراجُ هو الحَكَم.
$P -c "insert into landing_events (event, path, device, visitor_day)
       values ('store_view','/s/x','mobile','d1'), ('store_add','/s/x','mobile','d1'),
              ('store_checkout_open','/s/x','mobile','d1'), ('store_order','/s/x','mobile','d1'),
              ('store_view','/s/x','desktop','d2'), ('store_order','/s/x','mobile','d1');" >/dev/null
chk "الأحداثُ الأربعةُ الجديدةُ تُدرَج فعلاً (الحَكَمُ الإدراجُ لا نصُّ القيد)" \
    "select count(distinct event)::text from landing_events where event like 'store%'" "4"
$P -c "insert into landing_events (event, path, device, visitor_day)
       values ('page_view','/','mobile','d9'), ('cta_click','/','mobile','d9'),
              ('signup_start','/','mobile','d9'), ('signup_done','/','mobile','d9'),
              ('trial_start','/','mobile','d9');" >/dev/null
chk "  وأحداثُ الهبوط الخمسةُ ما سقط منها اسمٌ بالتوسيع" \
    "select count(distinct event)::text from landing_events where event not like 'store%'" "5"
chk "  واسمٌ خارج القائمة ما زال يُرفض (القيدُ اتّسع ولا انفتح)" \
    "select left(_pf_try('$C1', 'insert into landing_events (event, device, visitor_day) values (''whatever'',''mobile'',''d3'')'), 7)" "guarded"
# `landing_funnel` **لم تُلمس** عمداً: تغييرُ نوعِ المُرجَع يرمي
# cannot change return type (درسُ 0096) — فالقمعُ الجديد دالّةٌ ثانية.
chk "  و landing_funnel باقيةٌ بخمسة أعمدة (ما مُدَّت)" \
    "select (array_length(string_to_array(pg_get_function_result(p.oid), ','), 1))::text
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='landing_funnel'" "5"
chk "  و store_funnel دالّةٌ جديدةٌ definer بمسارٍ مثبَّت" \
    "select (prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='store_funnel'" "true"
chk "  وممنوعةٌ على anon" \
    "select has_function_privilege('anon','store_funnel(int)','execute')::text" "false"
# الزائرُ يُعدّ مميّزاً (بصمةُ يومه) والطلبُ يُعدّ حدثاً: زائران وطلبان.
# والصلاحيةُ تُضبط هنا صراحةً: فحصٌ سابقٌ بالحزمة قد يكون أطفأها، فيمرّ فحصُ
# «العيادةُ ترجع صفراً» لسببٍ غلط ويسقط هذا — وقد وقع بالضبط.
$P -c "update _dvtest_flags set admin = true;" >/dev/null
chk "  والمشغّلُ يرى القمع — زائرٌ مميّزٌ لا حدث، وطلبان حدثان" \
    "select viewers::text || '/' || orders::text from store_funnel(30) limit 1" "2/2"
$P -c "update _dvtest_flags set admin = false;" >/dev/null
chk "  والعيادةُ العاديةُ ترجع صفرَ صفوف — أرقامُ السوق ليست لها" \
    "select count(*)::text from store_funnel(30)" "0"
$P -c "update _dvtest_flags set admin = true;" >/dev/null

# ── 0186: النشرُ الجماعيّ ──────────────────────────────────────────────────
# الجذر: النشرُ كان صنفاً صنفاً مع إعادةِ تحميلٍ كاملة. المقيسُ على الإنتاج:
# ٦٩١ ك.ب JSON لأكبر عيادة (٩٩٠ منتجاً) ⇒ نشرُ ٤٠ = ~٢٧ ميغا وضغطاتٌ تُبلَع
# بصمت. والثلاثُ الكبار عندهنّ ٩٩٠ و٩٦٢ و٧٣٠ منتجاً وصفرُ منتجٍ معروض.
echo "▸ 0186: النشرُ الجماعيّ"
$P -c "insert into products (id, clinic_id, name, sell_price, purchase_price, stock, store_visible)
       values ('a1860000-0000-4000-8000-000000000001','$C1','نشرٌ جماعيّ ١',1000,500,5,false),
              ('a1860000-0000-4000-8000-000000000002','$C1','نشرٌ جماعيّ ٢',2000,900,5,false),
              ('a1860000-0000-4000-8000-000000000003','$C1','بلا سعر',0,500,5,false),
              ('a1860000-0000-4000-8000-000000000004','$C2','منتجُ عيادةٍ أخرى',3000,1000,5,false)
       on conflict (id) do update set store_visible = false;" >/dev/null
# الاقتباسُ مُضاعَفٌ عمداً: `_pf` تأخذ الاستعلامَ **نصّاً** فتُنفّذه، فاقتباسٌ
# مفردٌ بالداخل يقطع النصَّ الخارجيّ.
ALL4="array[''a1860000-0000-4000-8000-000000000001'',''a1860000-0000-4000-8000-000000000002'',''a1860000-0000-4000-8000-000000000003'',''a1860000-0000-4000-8000-000000000004'']::uuid[]"

chk "نداءٌ واحدٌ ينشر اثنين ويتخطّى الذي بلا سعر" \
    "select (_pf('$C1', 'select store_set_visible($ALL4, true)::text')::jsonb->>'changed')" "2"
chk "  والمتخطَّى **يُقال بالعدد** لا يُطوى بصمت" \
    "select (_pf('$C1', 'select store_set_visible($ALL4, true)::text')::jsonb->>'skipped_no_price')" "1"
chk "  ومنتجُ العيادة الأخرى ما انلمس (القصُّ داخل الدالّة)" \
    "select store_visible::text from products where id='a1860000-0000-4000-8000-000000000004'" "false"
chk "  والذي بلا سعرٍ باقٍ مخفيّاً — الصفرُ كان يُباع مجّاناً" \
    "select store_visible::text from products where id='a1860000-0000-4000-8000-000000000003'" "false"
chk "  والاثنان انعرضا فعلاً" \
    "select count(*)::text from products where id in ('a1860000-0000-4000-8000-000000000001','a1860000-0000-4000-8000-000000000002') and store_visible" "2"
# إعادةُ النداء ترجع صفراً: `changed` عددُ ما تبدّل لا عددُ ما أُرسل.
chk "نداءٌ مُعادٌ يرجع صفراً لا يدّعي عملاً لم يقع" \
    "select (_pf('$C1', 'select store_set_visible($ALL4, true)::text')::jsonb->>'changed')" "0"
chk "والإخفاءُ الجماعيُّ يرجع الاثنين" \
    "select (_pf('$C1', 'select store_set_visible($ALL4, false)::text')::jsonb->>'changed')" "2"
# الصلاحيةُ نسخةٌ من `products_write` — موظّفُ الاستقبال يُردّ.
chk "  وموظّفُ الاستقبال يُردّ (نفسُ قائمة products_write)" \
    "select left(_pf_try('$RCP', 'select store_set_visible($ALL4, true)::text'), 7)" "guarded"
chk "  والطبيبُ يمرّ (القائمةُ manager أو veterinarian لا manager وحده)" \
    "select left(_pf_try('$VET', 'select store_set_visible($ALL4, true)::text'), 7)" "allowed"
chk "  ومصفوفةٌ فارغةٌ لا ترمي" \
    "select (_pf('$C1', 'select store_set_visible(array[]::uuid[], true)::text')::jsonb->>'changed')" "0"
chk "  ودفعةٌ فوق السقف تُردّ" \
    "select left(_pf_try('$C1', 'select store_set_visible((select array_agg(gen_random_uuid()) from generate_series(1,501)), true)::text'), 7)" "guarded"
chk "  والدالّةُ definer بمسارٍ مثبَّت وممنوعةٌ على anon" \
    "select (prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%'
             and not has_function_privilege('anon', p.oid, 'execute'))::text
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='store_set_visible'" "true"

# ── 0187: «انشر أكثرَ ما تبيع» ─────────────────────────────────────────────
# المقيسُ على الإنتاج: حصّةُ أعلى ٤٠ منتجاً من إيراد ٩٠ يوماً = ٩٠٫٤٪ و٤٣٫٣٪
# و٣٥٫٦٪ عند الثلاثِ الكبار، و٤٠/٤٠ مسعَّرة، وصفرٌ منشور. فرفُّ البداية
# استعلامٌ لا اجتهاد. والفحصُ يقيس **التعريفات المنسوخة** قبل الترتيب: تعريفٌ
# ثانٍ للبيع أو للتوفّر يعني رقمين للشيء الواحد بشاشتين.
echo "▸ 0187: اقتراحُ رفِّ البداية"
$P -c "insert into products (id, clinic_id, name, sell_price, purchase_price, stock, section_id, store_visible)
       values ('a1870000-0000-4000-8000-000000000001','$C1','الأكثرُ بيعاً',5000,2000,10,null,false),
              ('a1870000-0000-4000-8000-000000000002','$C1','بيعٌ أقلّ',3000,1000,10,null,false),
              ('a1870000-0000-4000-8000-000000000003','$C1','نافدٌ لكنّه يُباع',9000,3000,0,null,false),
              ('a1870000-0000-4000-8000-000000000004','$C1','منشورٌ أصلاً',9000,3000,10,null,true),
              ('a1870000-0000-4000-8000-000000000005','$C1','بلا سعرٍ لكنّه يُباع',0,3000,10,null,false),
              ('a1870000-0000-4000-8000-000000000006','$C1','مرتجَعٌ صافيه سالب',4000,1000,10,null,false),
              ('a1870000-0000-4000-8000-000000000007','$C1','مجمَّعٌ رصيدُه بالقسم',7000,2000,0,'5e180000-0000-4000-8000-000000000001',false),
              ('a1870000-0000-4000-8000-000000000008','$C2','منتجُ عيادةٍ أخرى',9999,1000,10,null,false)
       on conflict (id) do nothing;
       insert into company_sections (id, clinic_id, name, pooled_stock)
         values ('5e180000-0000-4000-8000-000000000001','$C1','قسمٌ مجمَّع',25)
       on conflict (id) do update set pooled_stock = 25;" >/dev/null
# فاتورتان: واحدةٌ مدفوعة وواحدةٌ **مرتجَعة** — الثانيةُ لا تُحتسب إطلاقاً.
$P -c "insert into invoices (id, clinic_id, subtotal, discount, total, amount_paid, cost_total, profit, item_count, status, created_at)
       values ('11870000-0000-4000-8000-000000000001','$C1',100000,0,100000,100000,40000,60000,5,'paid', now() - interval '10 days'),
              ('11870000-0000-4000-8000-000000000002','$C1',99000,0,99000,99000,30000,69000,1,'refunded', now() - interval '9 days')
       on conflict (id) do nothing;
       insert into invoice_items (id, invoice_id, clinic_id, product_id, name, qty, unit_price, unit_cost, line_total)
       values ('22870000-0000-4000-8000-000000000001','11870000-0000-4000-8000-000000000001','$C1','a1870000-0000-4000-8000-000000000001','الأكثرُ بيعاً',10,5000,2000,50000),
              ('22870000-0000-4000-8000-000000000002','11870000-0000-4000-8000-000000000001','$C1','a1870000-0000-4000-8000-000000000002','بيعٌ أقلّ',3,3000,1000,9000),
              ('22870000-0000-4000-8000-000000000003','11870000-0000-4000-8000-000000000001','$C1','a1870000-0000-4000-8000-000000000003','نافدٌ لكنّه يُباع',4,9000,3000,36000),
              ('22870000-0000-4000-8000-000000000004','11870000-0000-4000-8000-000000000001','$C1','a1870000-0000-4000-8000-000000000004','منشورٌ أصلاً',4,9000,3000,36000),
              ('22870000-0000-4000-8000-000000000005','11870000-0000-4000-8000-000000000001','$C1','a1870000-0000-4000-8000-000000000005','بلا سعرٍ لكنّه يُباع',4,9000,3000,36000),
              ('22870000-0000-4000-8000-000000000006','11870000-0000-4000-8000-000000000001','$C1','a1870000-0000-4000-8000-000000000006','مرتجَعٌ صافيه سالب',1,4000,1000,4000),
              ('22870000-0000-4000-8000-000000000007','11870000-0000-4000-8000-000000000001','$C1','a1870000-0000-4000-8000-000000000006','مرتجَعٌ صافيه سالب',-2,4000,1000,-8000),
              ('22870000-0000-4000-8000-000000000008','11870000-0000-4000-8000-000000000001','$C1','a1870000-0000-4000-8000-000000000007','مجمَّعٌ رصيدُه بالقسم',2,7000,2000,14000),
              ('22870000-0000-4000-8000-000000000009','11870000-0000-4000-8000-000000000002','$C1','a1870000-0000-4000-8000-000000000002','بيعٌ أقلّ',11,9000,3000,99000)
       on conflict (id) do nothing;" >/dev/null

chk "الأعلى إيراداً يتصدّر" \
    "select _pf('$C1', 'select name from store_suggest_products(40) limit 1')" "الأكثرُبيعاً"
chk "  والمنشورُ أصلاً ليس اقتراحاً" \
    "select _pf('$C1', 'select count(*)::text from store_suggest_products(40) where id = ''a1870000-0000-4000-8000-000000000004''')" "0"
chk "  والذي بلا سعرٍ لا يُقترَح (نفسُ شرط 0186)" \
    "select _pf('$C1', 'select count(*)::text from store_suggest_products(40) where id = ''a1870000-0000-4000-8000-000000000005''')" "0"
chk "  والنافدُ لا يُقترَح ولو كان يُباع" \
    "select _pf('$C1', 'select count(*)::text from store_suggest_products(40) where id = ''a1870000-0000-4000-8000-000000000003''')" "0"
# لولا نسخُ تعريف `store_catalog` لسقط منتجٌ يعرضه المتجرُ نفسُه «متوفّراً».
chk "  والمجمَّعُ رصيدُه بالقسم **يُقترَح** (تعريفُ التوفّر منسوخٌ من الكتلوج)" \
    "select _pf('$C1', 'select available::text from store_suggest_products(40) where id = ''a1870000-0000-4000-8000-000000000007''')" "true"
# ولولا نسخُ تعريف `report_top_products` لصار المرتجَعُ أعلى مبيعاً بالعيادة.
chk "  والفاتورةُ المرتجَعةُ لا تُحتسب إطلاقاً (٩٩ ألفاً ما رفعته)" \
    "select _pf('$C1', 'select revenue::int::text from store_suggest_products(40) where id = ''a1870000-0000-4000-8000-000000000002''')" "9000"
chk "  والسطرُ الراجعُ يخصم فصافيه سالبٌ فيسقط" \
    "select _pf('$C1', 'select count(*)::text from store_suggest_products(40) where id = ''a1870000-0000-4000-8000-000000000006''')" "0"
chk "  ومنتجُ عيادةٍ أخرى لا يظهر أبداً" \
    "select _pf('$C1', 'select count(*)::text from store_suggest_products(200) where id = ''a1870000-0000-4000-8000-000000000008''')" "0"
chk "  والسقفُ يُحترَم" \
    "select _pf('$C1', 'select count(*)::text from store_suggest_products(2)')" "2"
# **الحدُّ الصريح**: تقترح ولا تكتب. لو كتبت لهبط نشرٌ لم تطلبه العيادة (درسُ 0153).
chk "**لا تكتب حرفاً**: عددُ المعروض ما تغيّر بعد الاقتراح" \
    "select count(*)::text from products where clinic_id='$C1' and store_visible and id::text like 'a1870000%'" "1"
chk "  وهي invoker لا definer (نفسُ report_top_products)" \
    "select (not prosecdef)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='store_suggest_products'" "true"
chk "  وبمسارٍ مثبَّت وممنوعةٌ على anon" \
    "select (coalesce(array_to_string(proconfig,','),'') like '%search_path%'
             and not has_function_privilege('anon', p.oid, 'execute'))::text
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='store_suggest_products'" "true"

# ── 0189: الأجرةُ تُحسم عند القبول ─────────────────────────────────────────
# المقيس: ٥٢٣ صفَّ توصيلٍ من ٥٢٣ **بلا منطقة**، وإحدى عشرةَ قيمةَ أجرةٍ بين
# صفرٍ و١٥ ألفاً. فرقمٌ ثابتٌ بالإعدادات لا يصف ما تفعله العيادةُ فعلاً.
echo "▸ 0189: أجرةُ التوصيل بلحظة القبول"
$P -c "insert into products (id, clinic_id, name, sell_price, purchase_price, stock, store_visible)
         values ('a1890000-0000-4000-8000-000000000001','$C1','منتجُ الأجرة',10000,4000,50,true)
       on conflict (id) do update set stock = 50;
       insert into store_orders (id, clinic_id, order_no, customer_name, customer_phone, items, subtotal, delivery_fee, total, status)
         values ('e1890000-0000-4000-8000-000000000001','$C1','SO-FEE01','زبونُ الأجرة','0770 555 1111',
                 jsonb_build_array(jsonb_build_object('product_id','a1890000-0000-4000-8000-000000000001','name','منتجُ الأجرة','qty',1,'price',10000,'total',10000)),
                 10000, 2000, 12000, 'new'),
              ('e1890000-0000-4000-8000-000000000002','$C1','SO-FEE02','زبونٌ ثانٍ','0770 555 2222',
                 jsonb_build_array(jsonb_build_object('product_id','a1890000-0000-4000-8000-000000000001','name','منتجُ الأجرة','qty',1,'price',10000,'total',10000)),
                 10000, 2000, 12000, 'new'),
              ('e1890000-0000-4000-8000-000000000003','$C1','SO-FEE03','زبونٌ ثالث','0770 555 3333',
                 jsonb_build_array(jsonb_build_object('product_id','a1890000-0000-4000-8000-000000000001','name','منتجُ الأجرة','qty',1,'price',10000,'total',10000)),
                 10000, 2000, 12000, 'new')
       on conflict (id) do nothing;" >/dev/null

chk "أجرةٌ تُكتب عند القبول تغلب أجرةَ الطلب" \
    "select (_pf('$C1', 'select store_accept_order(''e1890000-0000-4000-8000-000000000001''::uuid, null, 5000)::text')::jsonb->>'ok')" "true"
chk "  وصفُّ التوصيل بالأجرة الجديدة لا القديمة" \
    "select d.delivery_fee::int::text from delivery_orders d join store_orders o on o.invoice_id = d.invoice_id where o.id='e1890000-0000-4000-8000-000000000001'" "5000"
chk "  وبندُ الفاتورة بنفس الرقم — لا رقمان ينحرفان" \
    "select ii.unit_price::int::text from invoice_items ii join store_orders o on o.invoice_id = ii.invoice_id where o.id='e1890000-0000-4000-8000-000000000001' and ii.name='أجرة توصيل'" "5000"
chk "  و**المجموعُ يتبعها** (١٠٠٠٠ + ٥٠٠٠ لا ١٢٠٠٠)" \
    "select i.total::int::text from invoices i join store_orders o on o.invoice_id = i.id where o.id='e1890000-0000-4000-8000-000000000001'" "15000"
# صفرٌ صريحٌ قرارٌ («مجّاناً لهذا الطلب») لا «استعمل الافتراض».
chk "وصفرٌ صريحٌ يعني مجّاناً — لا رجوعاً لأجرة الطلب" \
    "select (_pf('$C1', 'select store_accept_order(''e1890000-0000-4000-8000-000000000002''::uuid, null, 0)::text')::jsonb->>'ok')" "true"
chk "  فلا بندَ أجرةٍ بالفاتورة أصلاً" \
    "select count(*)::text from invoice_items ii join store_orders o on o.invoice_id = ii.invoice_id where o.id='e1890000-0000-4000-8000-000000000002' and ii.name='أجرة توصيل'" "0"
chk "  والمجموعُ بلا أجرة" \
    "select i.total::int::text from invoices i join store_orders o on o.invoice_id = i.id where o.id='e1890000-0000-4000-8000-000000000002'" "10000"
# وبلا وسيطٍ يبقى السلوكُ القديم حرفياً — لا انحدار.
chk "وبلا وسيطٍ تبقى أجرةُ الطلب كما كانت (لا انحدار)" \
    "select (_pf('$C1', 'select store_accept_order(''e1890000-0000-4000-8000-000000000003''::uuid)::text')::jsonb->>'ok')" "true"
chk "  والأجرةُ ٢٠٠٠ والمجموعُ ١٢٠٠٠" \
    "select d.delivery_fee::int::text || '/' || i.total::int::text from delivery_orders d join store_orders o on o.invoice_id = d.invoice_id join invoices i on i.id = o.invoice_id where o.id='e1890000-0000-4000-8000-000000000003'" "2000/12000"
chk "  ولا توقيعٌ قديمٌ بقي (نداءٌ بوسيطين ما يصير غامضاً)" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='store_accept_order'" "1"

echo "▸ الموجة ١: المتجرُ والبوّابةُ داخل الحزمة"
chk "ولا سياسةَ تنادي auth_clinic() عاريةً بعد الموجة كاملةً (مرّتين)" \
    "select count(*)::text from pg_policies where schemaname='public' and ((coalesce(qual,'') like '%auth_clinic()%' and coalesce(qual,'') not like '%( SELECT auth_clinic%') or (coalesce(with_check,'') like '%auth_clinic()%' and coalesce(with_check,'') not like '%( SELECT auth_clinic%'))" "0"
chk "  وجداولُ المتجر والبوّابة موجودةٌ فعلاً (0095 و0158 جرتا)" \
    "select (count(*) = 5)::text from pg_class where relname in ('store_profiles','store_orders','portal_settings','portal_sessions','portal_login_log')" "true"
chk "  وقيودُ store_orders كما بالإنتاج لا كما يسهّل القالب" \
    "select (count(*) = 6)::text from information_schema.columns where table_schema='public' and table_name='store_orders' and is_nullable='NO' and column_name in ('clinic_id','order_no','customer_name','customer_phone','items','subtotal')" "true"
chk "  و store_order_track ممنوحةٌ لـanon بعد 0163 (كانت تُسحب بصمت)" \
    "select has_function_privilege('anon','store_order_track(text,text,text)','execute')::text" "true"
chk "  ومحفّظُ حالة الطلب بمسارٍ مثبَّت — وباقٍ invoker" \
    "select (coalesce(array_to_string(proconfig,','),'') like '%search_path%' and not prosecdef)::text from pg_proc where proname='store_orders_guard_status'" "true"
chk "  وعزلُ المتجر حقيقيّ: عيادةٌ أخرى ما تشوف طلبات الأولى" \
    "select _rls_try('$C2', 'select count(*) from store_orders')" "rows:1"
# التغطيةُ تُقاس بقائمةٍ صريحة لا بعدد. العدُّ كان يقيس **جداولَ الظلّ** التي
# يصنعها أساسُ الحزمة نفسُه بلا RLS (clinics، appointments، audit_log…): رقمٌ
# يتبدّل كلّما لُمس الأساس، ولا يقول شيئاً عن الهجرات. فحذفُ تعريفٍ رخوٍ من
# الأساس كان يرفعه من ٣٣ إلى ٣٤ — إشارةٌ كاذبة عن إصلاحٍ حقيقيّ. والقائمةُ
# تسأل ما يعنينا: كلُّ جدولٍ تحميه هجرةٌ بالموجة، محميٌّ فعلاً بعد تنزيلين.
for t in store_profiles store_orders portal_settings portal_sessions portal_codes portal_login_log portal_flags; do
  chk "  RLS مفعَّلٌ على $t" \
      "select relrowsecurity::text from pg_class where relname='$t'" "true"
done

# ── 0190: لا بايتاتِ شعارٍ داخل الجدول ────────────────────────────────────
# المقيس على الإنتاج: ٤٧ صفَّ إعدادات، **٧** منها `logo_url like 'data:%'`
# وصفرٌ يحمل مساراً، أكبرُها ١٠٦٬١٣٤ محرفاً — ومعها ١٢٣ صفَّ تدقيقٍ = ٢٨٪ من
# سجلّ التدقيق كلِّه. وترويسةُ 0174 كانت تقول إن هذا «نُظّف يدوياً».
# الفحصُ بدور `authenticated` لا superuser: المحفّزُ لا يرى غيرَه أصلاً.
echo "▸ 0190: الشعارُ مسارٌ لا بايتات"
chk "مديرٌ يكتب شعاراً \`data:\` ⇒ مرفوض" \
    "select left(_rls_try('$C1', 'update clinic_prefs set logo_url=''data:image/png;base64,AAAA'' where clinic_id=''$C1'''), 13)" "guarded:P0001"
chk "  ومسارٌ يمرّ" \
    "select _rls_try('$C1', 'update clinic_prefs set logo_url=''$C1/logo-abc.png'' where clinic_id=''$C1''')" "rows:1"
chk "  وتفريغُه يمرّ (إزالةُ الشعار)" \
    "select _rls_try('$C1', 'update clinic_prefs set logo_url=null where clinic_id=''$C1''')" "rows:1"
chk "  وإدراجُ صفٍّ جديدٍ ببايتات مرفوضٌ كذلك — لا التفافَ بالبذرة" \
    "select left(_rls_try('$C2', 'insert into clinic_prefs (clinic_id, logo_url) values (''$C2'', ''data:image/png;base64,AAAA'')'), 13)" "guarded:P0001"
# والسبعةُ القديمة تبقى عاملة: قيدٌ (not valid) كان سيفشّل كلَّ تحديثٍ لصفوفها.
$P -c "update clinic_prefs set logo_url='data:image/png;base64,LEGACY' where clinic_id='$C1'::uuid;" >/dev/null
chk "صفٌّ قديمٌ يحمل بايتات ⇒ تحديثُ عمودٍ آخرَ يمرّ (لا يُحبس صاحبُه)" \
    "select _rls_try('$C1', 'update clinic_prefs set dial_code=''+966'' where clinic_id=''$C1''')" "rows:1"
chk "  وشعارُه باقٍ كما هو" \
    "select (logo_url like 'data:%')::text from clinic_prefs where clinic_id='$C1'::uuid" "true"
chk "  وكتابةُ نفسِ القيمة حرفياً تمرّ (المقارنةُ بـold لا بالشكل)" \
    "select _rls_try('$C1', 'update clinic_prefs set logo_url=''data:image/png;base64,LEGACY'' where clinic_id=''$C1''')" "rows:1"
chk "  وتبديلُها ببايتاتٍ أخرى مرفوض" \
    "select left(_rls_try('$C1', 'update clinic_prefs set logo_url=''data:image/png;base64,OTHER'' where clinic_id=''$C1'''), 13)" "guarded:P0001"
chk "  والخروجُ منها إلى مسارٍ مسموحٌ دائماً — طريقُ النقل مفتوح" \
    "select _rls_try('$C1', 'update clinic_prefs set logo_url=''$C1/logo-moved.png'' where clinic_id=''$C1''')" "rows:1"
# ولا انحدارَ على حارس 0162 بنفس المحفّز. والتصفيرُ أوّلاً: الحارسُ يقارن
# بـ`old`، وكتلةُ 0162 قبلُ تركت القيمةَ true — فكتابةُ true ثانيةً «لا تغيير»
# فتمرّ بحقّ. (فحصٌ يمرّ لسببٍ غيرِ سببه فحصٌ لا يحرس.)
$P -c "update clinic_prefs set catalog_share=false where clinic_id='$C1'::uuid;" >/dev/null
chk "وحارسُ مشاركة الكتالوج (0162) باقٍ: موظّفٌ يُرفض" \
    "select left(_rls_try('$RCP', 'update clinic_prefs set catalog_share=true where clinic_id=''$C1'''), 13)" "guarded:P0001"
chk "  والمديرُ يمرّ" \
    "select _rls_try('$C1', 'update clinic_prefs set catalog_share=true where clinic_id=''$C1''')" "rows:1"
chk "  والمحفّزُ invoker بمسارٍ مثبَّت (درس 0162: لا definer يشدّ أكثر من السياسة)" \
    "select (not prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text from pg_proc where proname='clinic_prefs_guard_share'" "true"


# ── 0191: حقولُ الدواجن ───────────────────────────────────────────────────
# القياسُ قبل البناء: صفرُ أثرٍ لحقلٍ بالنظام كلِّه (الأنواعُ بلا دواجن، و٨٢
# طيراً أليفاً، و٦١٣ منتجَ «دجاج» كلُّها أكلُ قططٍ بنكهته). فهذه بنيةُ رهانٍ
# جديد، وتُفحص بنفس صرامةِ ما هو حيّ.
echo "▸ 0191: حقولُ الدواجن — حقلٌ ⇒ قاعةٌ ⇒ دفعةٌ ⇒ يوم"
$P -c "insert into poultry_farms (id, clinic_id, name) values ('f1910000-0000-4000-8000-000000000001','$C1','حقلُ الفحص') on conflict (id) do nothing;
       insert into poultry_houses (id, clinic_id, farm_id, label, capacity, default_kind, default_breed, default_count)
         values ('a1910000-0000-4000-8000-000000000001','$C1','f1910000-0000-4000-8000-000000000001','جملون ١',25000,'broiler','Ross 308',20000) on conflict (id) do nothing;
       insert into poultry_cycles (id, clinic_id, farm_id, house_id, kind, breed, placed_on, placed_count, chick_unit_cost)
         values ('c1910000-0000-4000-8000-000000000001','$C1','f1910000-0000-4000-8000-000000000001','a1910000-0000-4000-8000-000000000001','broiler','Ross 308', current_date - 10, 20000, 500) on conflict (id) do nothing;" >/dev/null

chk "الدفعةُ تُفتح بعددها وتاريخها" \
    "select placed_count::text from poultry_cycles where id='c1910000-0000-4000-8000-000000000001'" "20000"
chk "  والعمرُ يُحسب من تاريخ وضع الدجاج لا من اليوم" \
    "select days::text from poultry_cycle_stats('c1910000-0000-4000-8000-000000000001'::uuid)" "10"

# **قاعةٌ واحدةٌ = دفعةٌ نشطةٌ واحدة**: دفعتان نشطتان تجعلان كلَّ رقمٍ يوميٍّ
# بعدهما لا يُعرف لأيّهما.
chk "دفعةٌ نشطةٌ ثانيةٌ بنفس الجملون مرفوضة" \
    "select left(_rls_try('$C1', 'insert into poultry_cycles (clinic_id, farm_id, house_id, kind, placed_on, placed_count) values (''$C1'',''f1910000-0000-4000-8000-000000000001'',''a1910000-0000-4000-8000-000000000001'',''broiler'', current_date, 5000)'), 13)" "guarded:23505"

# يومٌ لا يُدخَل مرّتين: التكرارُ يضاعف النفوقَ ويُسقط كلَّ مؤشّر.
$P -c "insert into poultry_daily (clinic_id, cycle_id, on_date, dead, culled)
         values ('$C1','c1910000-0000-4000-8000-000000000001', current_date - 9, 30, 5),
                ('$C1','c1910000-0000-4000-8000-000000000001', current_date - 8, 12, 0) on conflict do nothing;" >/dev/null
chk "يومٌ مكرّرٌ لنفس الدفعة مرفوض" \
    "select left(_rls_try('$C1', 'insert into poultry_daily (clinic_id, cycle_id, on_date, dead) values (''$C1'',''c1910000-0000-4000-8000-000000000001'', current_date - 9, 7)'), 13)" "guarded:23505"
chk "  والحيُّ = المُدخَل − النافق − المستبعَد" \
    "select alive::text from poultry_cycle_stats('c1910000-0000-4000-8000-000000000001'::uuid)" "19953"

# العلفُ سطرُ استهلاكٍ لا عمودٌ بالإدخال — رقمان للعلف ينحرفان.
$P -c "insert into poultry_use (clinic_id, cycle_id, on_date, kind, name, qty, unit, unit_cost, line_cost)
         values ('$C1','c1910000-0000-4000-8000-000000000001', current_date - 9, 'feed','علف بادئ', 800, 'kg', 1000, 800000),
                ('$C1','c1910000-0000-4000-8000-000000000001', current_date - 8, 'feed','علف نامي', 1200, 'kg', 950, 1140000),
                ('$C1','c1910000-0000-4000-8000-000000000001', current_date - 8, 'med','مضاد حيوي', 2, 'pack', 15000, 30000),
                ('$C1','c1910000-0000-4000-8000-000000000001', current_date - 8, 'service','قنينة غاز', 1, null, 25000, 25000);" >/dev/null
chk "مجموعُ العلف بالكيلو من سطور الاستهلاك" \
    "select feed_kg::int::text from poultry_cycle_stats('c1910000-0000-4000-8000-000000000001'::uuid)" "2000"
chk "  وكلفةُ العلف منفصلةٌ عن كلفة الدواء" \
    "select feed_cost::int::text || '/' || med_cost::int::text from poultry_cycle_stats('c1910000-0000-4000-8000-000000000001'::uuid)" "1940000/30000"
chk "  والخدمةُ تُحسب بالكلف الأخرى لا بالعلف" \
    "select other_cost::int::text from poultry_cycle_stats('c1910000-0000-4000-8000-000000000001'::uuid)" "25000"
chk "  وكلفةُ الصيصان = السعرُ × العدد" \
    "select chick_cost::int::text from poultry_cycle_stats('c1910000-0000-4000-8000-000000000001'::uuid)" "10000000"

# إغلاقُ الدفعة: مغلقةٌ بلا تاريخٍ تعني جرداً بلا حصيلة.
chk "إغلاقٌ بلا تاريخٍ مرفوض" \
    "select left(_rls_try('$C1', 'update poultry_cycles set status=''closed'' where id=''c1910000-0000-4000-8000-000000000001'''), 13)" "guarded:23514"
chk "  وبتاريخٍ يمرّ" \
    "select _rls_try('$C1', 'update poultry_cycles set status=''closed'', closed_on=current_date, sold_count=19900, sold_weight_kg=45000, sale_total=90000000 where id=''c1910000-0000-4000-8000-000000000001''')" "rows:1"
chk "  وبعد الإغلاق يتوقّف عدّادُ العمر" \
    "select days::text from poultry_cycle_stats('c1910000-0000-4000-8000-000000000001'::uuid)" "10"

# العزل — الجوهر. عيادةٌ أخرى لا ترى حقلاً ليس لها ولا تكتب فيه.
for t in poultry_farms poultry_houses poultry_cycles poultry_daily poultry_use; do
  chk "  RLS مفعَّلٌ على $t" "select relrowsecurity::text from pg_class where relname='$t'" "true"
done
chk "عيادةٌ أخرى ما تشوف حقلَ الأولى" \
    "select _rls_try('$C2', 'select count(*) from poultry_farms')" "rows:1"
chk "  ولا تكتب دفعةً بحقلِ غيرها" \
    "select left(_rls_try('$C2', 'insert into poultry_cycles (clinic_id, farm_id, house_id, kind, placed_on, placed_count) values (''$C1'',''f1910000-0000-4000-8000-000000000001'',''a1910000-0000-4000-8000-000000000001'',''broiler'', current_date, 100)'), 13)" "guarded:42501"
chk "  ومجاميعُ دفعةٍ ليست لها ترجع فارغةً (الدالّةُ invoker فتمرّ من RLS)" \
    "select _rls_try('$C2', 'select * from poultry_cycle_stats(''c1910000-0000-4000-8000-000000000001''::uuid)')" "rows:0"
chk "والدالّةُ invoker بمسارٍ مثبَّت" \
    "select (not prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text from pg_proc where proname='poultry_cycle_stats'" "true"

# مخزنُ الحقل: نفسُ الجدول، وفارغُ `farm_id` يبقى مخزنَ العيادة كما كان.
chk "منتجاتُ العيادة القديمة بقيت بلا حقل" \
    "select (count(*) = 0)::text from products where farm_id is not null" "true"


# ── 0192: صرفُ مخزن الحقل ─────────────────────────────────────────────────
echo "▸ 0192: الصرفُ ذرّيّ، بسعر الشراء، والنقصُ يُقال"
$P -c "insert into poultry_farms (id, clinic_id, name) values ('f1920000-0000-4000-8000-000000000001','$C1','حقلُ الصرف') on conflict (id) do nothing;
       insert into poultry_houses (id, clinic_id, farm_id, label) values ('a1920000-0000-4000-8000-000000000001','$C1','f1920000-0000-4000-8000-000000000001','جملون') on conflict (id) do nothing;
       insert into poultry_cycles (id, clinic_id, farm_id, house_id, kind, placed_on, placed_count)
         values ('c1920000-0000-4000-8000-000000000001','$C1','f1920000-0000-4000-8000-000000000001','a1920000-0000-4000-8000-000000000001','broiler', current_date - 5, 15000) on conflict (id) do nothing;
       insert into products (id, clinic_id, name, sell_price, purchase_price, stock, farm_id)
         values ('b1920000-0000-4000-8000-000000000001','$C1','علف بادئ', 0, 900, 1000, 'f1920000-0000-4000-8000-000000000001')
       on conflict (id) do update set stock = 1000, purchase_price = 900, farm_id = 'f1920000-0000-4000-8000-000000000001';
       insert into products (id, clinic_id, name, sell_price, purchase_price, stock)
         values ('b1920000-0000-4000-8000-000000000002','$C1','معلب قطط', 5000, 3000, 20) on conflict (id) do update set farm_id = null;
       update _dvtest_flags set admin = false;" >/dev/null

chk "الصرفُ يخصم من المخزن ويقيّد الكلفة بسعر الشراء" \
    "select (_pf('$C1','select poultry_consume(''c1920000-0000-4000-8000-000000000001''::uuid, ''feed'', ''b1920000-0000-4000-8000-000000000001''::uuid, null, 300)::text')::jsonb->>'ok')" "true"
chk "  والرصيدُ نزل ٣٠٠" \
    "select stock::int::text from products where id='b1920000-0000-4000-8000-000000000001'" "700"
chk "  والكلفةُ ٣٠٠ × ٩٠٠ (شراءً لا بيعاً — لا ربحَ على ما استعمله الحقل)" \
    "select line_cost::int::text from poultry_use where cycle_id='c1920000-0000-4000-8000-000000000001' order by created_at desc limit 1" "270000"

# الرصيدُ يُترك يسلب عمداً، والنقصُ يُرجَّع ليُقال بصوت.
chk "صرفٌ فوق الرصيد يُسجَّل ويُرجّع النقص" \
    "select (_pf('$C1','select poultry_consume(''c1920000-0000-4000-8000-000000000001''::uuid, ''feed'', ''b1920000-0000-4000-8000-000000000001''::uuid, null, 900)::text')::jsonb->>'shortfall')::numeric::int::text" "200"
chk "  والرصيدُ سالبٌ ظاهرٌ لا مقصوصٌ بصمت" \
    "select stock::int::text from products where id='b1920000-0000-4000-8000-000000000001'" "-200"

# مادّةٌ من مخزن العيادة لا تُصرف على دفعةِ دجاج.
chk "معلبُ قططٍ من مخزن العيادة يُرفض" \
    "select replace(_pf_try('$C1','select poultry_consume(''c1920000-0000-4000-8000-000000000001''::uuid, ''feed'', ''b1920000-0000-4000-8000-000000000002''::uuid, null, 1)::text'), ' ', '')" "guarded:not_farm_stock"
chk "  ورصيدُ المعلب ما انلمس" \
    "select stock::int::text from products where id='b1920000-0000-4000-8000-000000000002'" "20"

# خدمةٌ بلا مادّة (قنينة غاز) تُقيَّد كلفةً بلا خصم.
chk "خدمةٌ بلا منتجٍ تُقيَّد" \
    "select (_pf('$C1','select poultry_consume(''c1920000-0000-4000-8000-000000000001''::uuid, ''service'', null, ''قنينة غاز'', 1)::text')::jsonb->>'ok')" "true"

# الحذفُ يرجّع البضاعة — تصحيحُ إدخالٍ لا يترك رصيداً منقوصاً للأبد.
$P -c "update _dvtest_flags set admin = false;" >/dev/null
chk "حذفُ صرفٍ يرجّع كمّيتَه للمخزن" \
    "select (_pf('$C1','select poultry_unconsume((select id from poultry_use where cycle_id=''c1920000-0000-4000-8000-000000000001'' and qty=900 limit 1))::text')::jsonb->>'ok')" "true"
chk "  والرصيدُ رجع ٧٠٠" \
    "select stock::int::text from products where id='b1920000-0000-4000-8000-000000000001'" "700"

# دفعةٌ مغلقةٌ لا تُصرف عليها: كلفةٌ بعد الجرد تغيّر حصيلةً قيلت.
$P -c "update poultry_cycles set status='closed', closed_on=current_date where id='c1920000-0000-4000-8000-000000000001';" >/dev/null
chk "الصرفُ على دفعةٍ مغلقةٍ مرفوض" \
    "select replace(_pf_try('$C1','select poultry_consume(''c1920000-0000-4000-8000-000000000001''::uuid, ''feed'', null, ''علف'', 10)::text'), ' ', '')" "guarded:cycle_closed"

chk "والدالّتان definer بمسارٍ مثبَّتٍ وممنوعتان عن anon" \
    "select (count(*) = 2)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('poultry_consume','poultry_unconsume') and p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%' and not has_function_privilege('anon', p.oid, 'execute')" "true"

# ── الماسحُ لا يصل مخزنَ الحقل (0191) ─────────────────────────────────────
# الواجهةُ تفصل العرضَين، لكنّ الماسحَ يمرّ من الخادم — فالفصلُ ناقصٌ ما لم
# يكن بـ`product_by_code` نفسِها. وكيسُ علفٍ يُمسح بكاشير العيادة كان يُباع
# بصفرٍ ويخصم من رصيدِ دفعةٍ جارية.
echo "▸ 0191: كاشيرُ العيادة لا يمسح علفاً"
$P -c "update products set barcode = '6221033000123' where id='b1920000-0000-4000-8000-000000000001';
       update products set barcode = '6221033000999' where id='b1920000-0000-4000-8000-000000000002';" >/dev/null
chk "باركودُ مخزن الحقل ما ينلكه بالماسح" \
    "select _rls_try('$C1', 'select * from product_by_code(''6221033000123'')')" "rows:0"
chk "  وباركودُ مخزن العيادة ينلكه كما كان" \
    "select _rls_try('$C1', 'select * from product_by_code(''6221033000999'')')" "rows:1"
# ومسارُ الصيغ (0173) مثلُه: صيغةٌ لا يملكها إلا صفُّ حقلٍ لا تُختار، وإلا
# رجع الاستعلامُ الأخيرُ فارغاً وقال الكاشيرُ «غير موجود» عن مادةٍ بمخزنه.
chk "  ولا يُنتشل بمسار صيغ الماسح" \
    "select _rls_try('$C1', 'select * from product_by_code(''06221033000123'')')" "rows:0"
chk "والمخزنُ ما انلمس — لا بيعَ ولا خصم" \
    "select stock::int::text from products where id='b1920000-0000-4000-8000-000000000001'" "700"


# ── 0193: فترةُ السحب ─────────────────────────────────────────────────────
# لحمٌ يُذبح قبل تاريخه يحمل بقايا دواء. فالخطأُ هنا لا يُرى بشاشة — يُؤكَل.
# ولهذا المجهولُ هو الافتراض: كلُّ سطرِ دواءٍ بلا رقمٍ يصرخ ولا يصمت.
echo "▸ 0193: فترةُ السحب — المجهولُ يصرخ، والآمنُ يُحسب من آخر سطر"
$P -c "insert into poultry_farms (id, clinic_id, name) values ('f1930000-0000-4000-8000-000000000001','$C1','حقلُ السحب') on conflict (id) do nothing;
       insert into poultry_houses (id, clinic_id, farm_id, label) values ('a1930000-0000-4000-8000-000000000001','$C1','f1930000-0000-4000-8000-000000000001','جملون') on conflict (id) do nothing;
       insert into poultry_cycles (id, clinic_id, farm_id, house_id, kind, placed_on, placed_count)
         values ('c1930000-0000-4000-8000-000000000001','$C1','f1930000-0000-4000-8000-000000000001','a1930000-0000-4000-8000-000000000001','broiler', current_date - 20, 10000) on conflict (id) do nothing;
       update poultry_cycles set status='active', closed_on=null where id='c1930000-0000-4000-8000-000000000001';
       delete from poultry_use where cycle_id='c1930000-0000-4000-8000-000000000001';
       insert into products (id, clinic_id, name, sell_price, purchase_price, stock, farm_id)
         values ('b1930000-0000-4000-8000-000000000001','$C1','مضاد حيوي', 0, 15000, 50, 'f1930000-0000-4000-8000-000000000001'),
                ('b1930000-0000-4000-8000-000000000002','$C1','فيتامين',   0,  5000, 50, 'f1930000-0000-4000-8000-000000000001'),
                ('b1930000-0000-4000-8000-000000000003','$C1','علف نامي',  0,   900, 5000, 'f1930000-0000-4000-8000-000000000001')
       on conflict (id) do update set stock = excluded.stock, farm_id = excluded.farm_id;
       update _dvtest_flags set admin = false;" >/dev/null

chk "دفعةٌ بلا دواءٍ: لا تاريخَ أمانٍ ولا مجهول" \
    "select coalesce(safe_from::text,'-') || '/' || withdrawal_unknown::text from poultry_cycle_stats('c1930000-0000-4000-8000-000000000001'::uuid)" "-/false"

# سطرُ دواءٍ بسبعة أيام يوم (اليوم − ٣) ⇒ الأمانُ بعد أربعة أيام من اليوم.
chk "صرفُ دواءٍ بسحبٍ ٧ أيام يرجّع تاريخَ أمانه فوراً" \
    "select (_pf('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''med'', p_product => ''b1930000-0000-4000-8000-000000000001''::uuid, p_name => null, p_qty => 2, p_on_date => current_date - 3, p_withdrawal => 7)::text')::jsonb->>'safe_from') = (current_date + 4)::text" "t"
chk "  والدفعةُ تقولها بترويستها" \
    "select safe_from::text from poultry_cycle_stats('c1930000-0000-4000-8000-000000000001'::uuid)" "$(date -u -d '+4 days' +%Y-%m-%d)"
chk "  وما بيها مجهول" \
    "select withdrawal_unknown::text from poultry_cycle_stats('c1930000-0000-4000-8000-000000000001'::uuid)" "false"

# **الأقصى لا الأخير**: دواءٌ نزل اليومَ بسحبٍ يومٍ واحد لا يقصّر تاريخَ الأمان.
chk "دواءٌ ثانٍ أقصرُ سحباً لا يقدّم التاريخ" \
    "select (_pf('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''med'', p_product => ''b1930000-0000-4000-8000-000000000002''::uuid, p_name => null, p_qty => 1, p_withdrawal => 1)::text')::jsonb->>'ok')" "true"
chk "  والتاريخُ بقي على الأبعد" \
    "select safe_from::text from poultry_cycle_stats('c1930000-0000-4000-8000-000000000001'::uuid)" "$(date -u -d '+4 days' +%Y-%m-%d)"

# صفرٌ قولٌ صريحٌ لا مجهول: «قرأتُ العلبة وماكو فترةُ سحب».
chk "صفرٌ يُسجَّل صفراً — لا يُخلط بالمجهول" \
    "select (_pf('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''med'', p_product => ''b1930000-0000-4000-8000-000000000002''::uuid, p_name => null, p_qty => 1, p_withdrawal => 0)::text')::jsonb->>'safe_from') is not null" "t"
chk "  والدفعةُ ما صارت مجهولة" \
    "select withdrawal_unknown::text from poultry_cycle_stats('c1930000-0000-4000-8000-000000000001'::uuid)" "false"

# **الجوهر**: سطرٌ واحدٌ بلا رقمٍ يجعل الدفعةَ كلَّها مجهولة.
chk "دواءٌ بلا رقمٍ ⇒ الدفعةُ «فترةُ سحبٍ مجهولة»" \
    "select (_pf('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''med'', p_product => ''b1930000-0000-4000-8000-000000000001''::uuid, p_name => null, p_qty => 1)::text')::jsonb->>'ok')" "true"
chk "  والرايةُ ارتفعت" \
    "select withdrawal_unknown::text from poultry_cycle_stats('c1930000-0000-4000-8000-000000000001'::uuid)" "true"
chk "  والتاريخُ المعروفُ ما ضاع معها" \
    "select safe_from::text from poultry_cycle_stats('c1930000-0000-4000-8000-000000000001'::uuid)" "$(date -u -d '+4 days' +%Y-%m-%d)"

# رقمٌ على كيس علفٍ لا معنى له: يُهمَل صامتاً ولا يدفع تاريخَ الأمان.
chk "سحبٌ على العلف يُهمَل" \
    "select (_pf('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''feed'', p_product => ''b1930000-0000-4000-8000-000000000003''::uuid, p_name => null, p_qty => 100, p_withdrawal => 30)::text')::jsonb->>'safe_from')" ""
chk "  وما انكتب بالسطر" \
    "select (count(*) = 0)::text from poultry_use where cycle_id='c1930000-0000-4000-8000-000000000001' and kind='feed' and withdrawal_days is not null" "true"
chk "  ولا دفع تاريخَ الدفعة" \
    "select safe_from::text from poultry_cycle_stats('c1930000-0000-4000-8000-000000000001'::uuid)" "$(date -u -d '+4 days' +%Y-%m-%d)"

# رقمٌ خارجُ المدى يُرفض بالدالّة وبالقيد معاً — طرفان لا طرف.
chk "سحبٌ ٩٠٠ يوماً مرفوضٌ بالدالّة" \
    "select replace(_pf_try('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''med'', p_product => null, p_name => ''دواء'', p_qty => 1, p_withdrawal => 900)::text'), ' ', '')" "guarded:bad_withdrawal"
chk "  وبالقيد لو دخل من طريقٍ آخر" \
    "select left(_rls_try('$C1', 'insert into poultry_use (clinic_id, cycle_id, on_date, kind, name, qty, withdrawal_days) values (''$C1'',''c1930000-0000-4000-8000-000000000001'', current_date, ''med'', ''دواء'', 1, 500)'), 13)" "guarded:23514"

# توقيعٌ واحدٌ لا اثنان: وسيطٌ بقيمةٍ افتراضية يترك القديمةَ حيّةً فيراها
# PostgREST التباساً (PGRST203) ويسقط كلُّ صرفٍ من الواجهة.
chk "poultry_consume توقيعٌ واحدٌ بالقاعدة" \
    "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='poultry_consume'" "1"
chk "  وهي definer بمسارٍ مثبَّتٍ وممنوعةٌ عن anon" \
    "select (p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%' and not has_function_privilege('anon', p.oid, 'execute'))::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='poultry_consume'" "true"
chk "و poultry_cycle_stats بقيت invoker بعد إعادة إنشائها" \
    "select (not prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%')::text from pg_proc where proname='poultry_cycle_stats'" "true"


# ── 0193: مرجعُ المحاولة — شرطُ الطابور ───────────────────────────────────
# الطابورُ **يعيد بطبعه**. فنداءُ صرفٍ بلا مرجعٍ يعني خصمَين من المخزن وسطرَي
# كلفةٍ على دفعةٍ واحدة كلَّما ضعف النت — ازدواجاً منهجياً لا نادراً (0171).
echo "▸ 0193: الصرفُ يُعاد بلا ازدواج"
$P -c "update products set stock = 100 where id='b1930000-0000-4000-8000-000000000002';
       delete from poultry_use where client_ref = 'ref-dup-1';" >/dev/null

chk "صرفٌ بمرجعٍ يمرّ ويخصم" \
    "select (_pf('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''feed'', p_product => ''b1930000-0000-4000-8000-000000000002''::uuid, p_name => null, p_qty => 10, p_meta => ''{\"client_ref\":\"ref-dup-1\"}''::jsonb)::text')::jsonb->>'ok')" "true"
chk "  والرصيدُ نزل ١٠" \
    "select stock::int::text from products where id='b1930000-0000-4000-8000-000000000002'" "90"
# نفسُ النداء مرّةً ثانية — كما يفعل الطابور حين يضيع الجواب لا الطلب.
chk "إعادةُ نفس المرجع تُرجع سطرَ الأوّل" \
    "select (_pf('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''feed'', p_product => ''b1930000-0000-4000-8000-000000000002''::uuid, p_name => null, p_qty => 10, p_meta => ''{\"client_ref\":\"ref-dup-1\"}''::jsonb)::text')::jsonb->>'replayed')" "true"
chk "  **والرصيدُ ما انلمس ثانيةً**" \
    "select stock::int::text from products where id='b1930000-0000-4000-8000-000000000002'" "90"
chk "  ولا سطرَ كلفةٍ ثانٍ على الدفعة" \
    "select count(*)::text from poultry_use where client_ref='ref-dup-1'" "1"
# وبلا مرجعٍ يبقى السلوكُ القديم: كلُّ نداءٍ سطرٌ (الشاشةُ تصرف مرّةً بضغطة).
chk "وبلا مرجعٍ: نداءان سطران — لا فلترةَ صامتة" \
    "select (_pf('$C1','select poultry_consume(p_cycle => ''c1930000-0000-4000-8000-000000000001''::uuid, p_kind => ''feed'', p_product => ''b1930000-0000-4000-8000-000000000002''::uuid, p_name => null, p_qty => 5)::text')::jsonb->>'ok')" "true"
chk "  والرصيدُ نزل ٥ كذلك" \
    "select stock::int::text from products where id='b1930000-0000-4000-8000-000000000002'" "85"
# الفهرسُ فريدٌ **بالعيادة**: مرجعٌ من جهازِ عيادةٍ أخرى لا يمنع هذه.
chk "المرجعُ فريدٌ بالعيادة لا بالجدول" \
    "select (indexdef like '%clinic_id, client_ref%')::text from pg_indexes where indexname='poultry_use_client_ref_idx'" "true"
chk "  وجزئيٌّ فلا يصطدم القديمُ كلُّه بـNULL واحدة" \
    "select (indexdef like '%WHERE (client_ref IS NOT NULL)%')::text from pg_indexes where indexname='poultry_use_client_ref_idx'" "true"


# ── 0194: «أُقفل وضعُ المدير» صادقة ─────────────────────────────────────────
# كانت `end_elevation` تكتب السطرَ مع كلّ نداء — والخروجُ ينادي دائماً — فصار كلُّ
# خروجٍ «أُقفل وضعُ المدير» ولو لم يُفتح. وخروجُ المشغّل من عيادة زبونٍ يترك سطراً
# بسجلّها (خطٌّ أحمر). السطرُ الآن لرفعٍ أُقفل فعلاً، ولا أثرَ للمشغّل.
echo "▸ 0194: لا سطرَ بلا رفعٍ أُقفل، ولا أثرَ للمشغّل"
ADM=33333333-3333-3333-3333-333333333333
C1=11111111-1111-1111-1111-111111111111
$P -c "delete from staff_elevations; delete from audit_log where details->>'event' = 'override.lock';
       update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
# **النداءُ بجملةٍ والعدُّ بجملةٍ أخرى.** الجملةُ الواحدة لا ترى صفوفاً كتبتها هي نفسُها
# (لقطةُ MVCC تُثبَّت ببدايتها) — فعدٌّ بنفس جملة النداء كان يرى صفراً دائماً: فحصُ
# «سطرٌ صادق» يفشل على شيفرةٍ صحيحة، وفحصُ المشغّل لا يقدر أن يفشل. (أمسكته مراجعةٌ عدائية.)
$P -c "select _pf('$C1','select end_elevation()::text');" >/dev/null
chk "خروجٌ بلا رفعٍ ⇒ لا سطر (0048 القديمة كانت تكتب واحداً هنا)" \
    "select count(*)::text from audit_log where details->>'event'='override.lock'" "0"
# رفعٌ انتهى وحده يبقى صفُّه يوماً حتى يكنسه elevate_with_pin (0048) — فخروجٌ بعده بساعاتٍ
# كان يعدّه «قفلاً» ويكتب «أُقفل وضعُ المدير» الآن عن قفلٍ لم يحصل. يُكنس بلا سطر.
$P -c "insert into staff_elevations(user_id, clinic_id, until) values ('$C1','$C1', now() - interval '2 hours');" >/dev/null
chk "  (رفعٌ منتهٍ مزروع — وإلا مرّ ما بعده فارغاً)" \
    "select count(*)::text from staff_elevations where user_id='$C1' and until < now()" "1"
$P -c "select _pf('$C1','select end_elevation()::text');" >/dev/null
chk "رفعٌ انتهى وحده ⇒ لا سطر («أُقفل» عن قفلٍ لم يحصل)" \
    "select count(*)::text from audit_log where details->>'event'='override.lock'" "0"
chk "  وصفُّه كُنس مع ذلك" "select count(*)::text from staff_elevations where user_id='$C1'" "0"
$P -c "insert into staff_elevations(user_id, clinic_id, until) values ('$C1','$C1', now() + interval '10 minutes');" >/dev/null
$P -c "select _pf('$C1','select end_elevation()::text');" >/dev/null
chk "قفلُ رفعٍ حقيقيّ ⇒ سطرٌ صادقٌ واحد بعيادته" \
    "select count(*)::text from audit_log where details->>'event'='override.lock' and clinic_id='$C1'" "1"
chk "  والرفعُ حُذف" "select count(*)::text from staff_elevations where user_id='$C1'" "0"
$P -c "update _dvtest_flags set admin = true;" >/dev/null
chk "المشغّلُ يدخل ١١١١" "select _pf('$ADM', 'select (platform_enter(''$C1'', ''فحص 0194'')->>''ok'')')" "true"
$P -c "insert into staff_elevations(user_id, clinic_id, until) values ('$ADM','$C1', now() + interval '10 minutes');" >/dev/null
$P -c "select _pf('$ADM','select end_elevation()::text');" >/dev/null
# السطرُ الوحيد هو سطرُ الفحص السابق (رفعُ ١١١١ الحقيقيّ) — أيُّ سطرٍ ثانٍ أثرُ المشغّل.
chk "خروجُ المشغّل برفعٍ حيّ ⇒ لا أثرَ بسجلّ العيادة (بالاتفاق معها)" \
    "select count(*)::text from audit_log where details->>'event'='override.lock'" "1"
chk "  والرفعُ حُذف مع ذلك — الأمانُ لا يتغيّر" "select count(*)::text from staff_elevations where user_id='$ADM'" "0"
$P -c "select set_config('request.jwt.claim.sub','$ADM',false); select platform_leave();
       update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
chk "end_elevation بصلاحية المُعرِّف وبمسارٍ مثبَّت، ممنوعةٌ عن anon، مسموحةٌ للمسجَّل" \
    "select (p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%' and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='end_elevation'" "true"


# ── 0195/0204 ← 0220: بابُ الرسمة الواحدة **مقطوع** ─────────────────────────
# كان هنا فحصُ «الحفظ بشرط النسخة». النسخةُ نفسُها صارت الثغرة (أرقامُ الإنتاج
# ١–٢ تتصادف بين العيادات)، فالتخطيطُ صار صفوفاً (0219) والبابُ القديم يرمي
# بجملةٍ عربية. ما بقي من هنا حيٌّ: الكتابةُ المباشرة للعمود ممنوعة، والسجلّ يُقرأ.
echo "▸ 0220: الحفظُ القديم مقطوع — والعمودُ مجمَّدٌ للقراءة"
C1=11111111-1111-1111-1111-111111111111
$P -c "insert into clinic_prefs (clinic_id) select '$C1' where not exists (select 1 from clinic_prefs where clinic_id='$C1');
       update clinic_prefs set cage_layout = '[{\"id\":\"r1\",\"name\":\"القديمة\",\"cages\":[\"201\"]}]', cage_layout_rev = 2 where clinic_id = '$C1';" >/dev/null
chk "حزمةٌ قديمة تحفظ رسمتها ⇒ تُرفض **باسم القطع** (لا تعارضاً يدور للأبد)" \
    "select _rls_try('$C1', 'select save_cage_layout(''{\"v\":2,\"rooms\":[],\"cages\":[]}'', 2)')" "guarded:P0001:cage_layout_moved"
chk "  والعمودُ ما انمسّ (أرشيفٌ ومرجعُ تراجع)" \
    "select (cage_layout like '%201%' and cage_layout_rev = 2)::text from clinic_prefs where clinic_id='$C1'" "true"
chk "تحديثٌ مباشرٌ للتخطيط من المتصفّح **يُرفض**" \
    "select _rls_try('$C1', 'update clinic_prefs set cage_layout = ''[]'' where clinic_id = auth_clinic()')" "guarded:P0001:cage_layout_direct_write"
chk "  والنسخةُ كذلك" \
    "select _rls_try('$C1', 'update clinic_prefs set cage_layout_rev = 99 where clinic_id = auth_clinic()')" "guarded:P0001:cage_layout_direct_write"
chk "  و«احذف الصفّ وأدخله من جديد» لم يعد باباً خلفياً (INSERT محروس)" \
    "select _rls_try('33333333-3333-3333-3333-333333333333', 'insert into clinic_prefs (clinic_id, cage_layout) values (auth_clinic(), ''[]'')')" "guarded:P0001:cage_layout_direct_write"
chk "  وصفُّ تفضيلاتٍ جديدٌ **بلا** تخطيط يُدرج عادياً" \
    "select _rls_try('33333333-3333-3333-3333-333333333333', 'insert into clinic_prefs (clinic_id) values (auth_clinic())')" "rows:1"
chk "وتفضيلٌ آخرُ بنفس الصفّ يُحدَّث عادياً (لا يشدّ أكثرَ من اللازم)" \
    "select _rls_try('$C1', 'update clinic_prefs set pos_compact = true where clinic_id = auth_clinic()')" "rows:1"
chk "والمحفّزُ invoker لا definer (درس 0162)" \
    "select (not p.prosecdef)::text from pg_trigger tg join pg_proc p on p.oid=tg.tgfoid where tg.tgname='clinic_prefs_cage_layout_guard'" "true"
chk "save_cage_layout ممنوحةٌ عمداً (النزعُ يعطي 42501 بلا جملة) وممنوعةٌ عن anon" \
    "select (has_function_privilege('authenticated','public.save_cage_layout(text,integer)','execute') and not has_function_privilege('anon','public.save_cage_layout(text,integer)','execute'))::text" "true"
# سجلُّ الترتيب القديم: `__changed` = [كان, صار] — يرجّع «كان».
$P -c "delete from audit_log where entity='clinic_prefs';
       insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
       values ('$C1', null, 'UPDATE', 'clinic_prefs', '$C1',
               jsonb_build_object('__changed', jsonb_build_object('cage_layout',
                 jsonb_build_array('KAN','SAR'))));" >/dev/null
chk "سجلُّ الترتيب القديم يُقرأ بهويّة العيادة ويرجّع «كان»" \
    "select _pf('$C1', 'select layout from cage_layout_history(50) limit 1')" "KAN"
chk "  ولا يرى سجلَّ عيادةٍ أخرى" \
    "select _pf('22222222-2222-2222-2222-222222222222', 'select count(*)::text from cage_layout_history(50)')" "0"


# ── 0196: اسمُ الشركة مفتاحٌ واحد، والطيُّ لا يفقد صفّاً ────────────────────
# الجذرُ المقيس: ١٠٢ شركةٍ مكرّرة من ١٤٣ لأن المقارنة كانت بطرفٍ مطبَّعٍ وطرفٍ
# خام. وهنا يُقاس الطرفان معاً، ويُقاس أنّ الطيَّ ينقل **قبل** أن يحذف.
# (ملاحظةٌ للقارئ: `chk` يمسح المسافاتِ من المُخرَج، فالمتوقَّعُ بلا مسافات.)
echo "▸ 0196: الشركةُ الواحدة صفٌّ واحد، والطيُّ لا يفقد شيئاً"
C1=11111111-1111-1111-1111-111111111111
C2=22222222-2222-2222-2222-222222222222
$P -c "delete from company_charges; delete from purchase_payments; delete from company_sections;
       update products set company_id = null, section_id = null;
       update purchases set company_id = null;
       delete from companies;" >/dev/null

# التطبيعُ مرآةُ `groupKey` — والقيمُ من الإنتاج لا مخترَعة.
chk "«شركة تاج الخيل» ⇒ ة تصير ه والمسافاتُ تُمسح" \
    "select inv_norm_group('شركة تاج الخيل')" "شركهتاجالخيل"
chk "  و«شركه  تاج   الخيل» نفسُ المفتاح (إملاءٌ ومسافاتٌ مختلفة)" \
    "select (inv_norm_group('شركه  تاج   الخيل') = inv_norm_group('شركة تاج الخيل'))::text" "true"
chk "  وأشكالُ الألف الأربعة تصير ا" \
    "select inv_norm_group('أإآٱ')" "اااا"
chk "  وى/ئ ⇒ ي، وؤ ⇒ و" "select inv_norm_group('ىئؤ')" "ييو"
chk "  و«ROYAL CANIN» = «royal canin»" \
    "select (inv_norm_group('ROYAL CANIN') = inv_norm_group('royal canin'))::text" "true"
# درسُ 0150: الأرقامُ الشرقية تُترجم **قبل** مسح التشكيل، وإلا مُحيت كلَّها.
chk "  والأرقامُ الشرقية تُترجم لا تُمحى (درس 0150)" \
    "select inv_norm_group('٧٧٠٩٩')" "77099"

chk "أوّلُ ensure_company تُنشئ بالاسم كما كُتب" \
    "select _pf('$C1', 'select ((ensure_company(''شركة تاج الخيل'')).name = ''شركة تاج الخيل'')::text')" "true"
chk "  والنداءُ الثاني بنفس الاسم **لا** يُنشئ" \
    "select count(*)::text from companies where clinic_id='$C1'" "1"
chk "  ولا بإملاءٍ آخر ولا بمسافاتٍ زائدة" \
    "select _pf('$C1', 'select ((ensure_company(''شركه  تاج الخيل'')).id = (select id from companies where clinic_id = auth_clinic() limit 1))::text')" "true"
$P -c "select _pf('$C1', 'select ensure_company(''ROYAL CANIN'')::text');
       select _pf('$C1', 'select ensure_company(''royal canin'')::text');
       select _pf('$C1', 'select ensure_company(''Royal   Canin'')::text');" >/dev/null
chk "  وثلاثةُ نداءاتٍ بإملاءاتٍ لاتينيةٍ مختلفة ⇒ صفٌّ واحدٌ إضافيّ" \
    "select count(*)::text from companies where clinic_id='$C1'" "2"
chk "الاسمُ يُحفظ كما كُتب لا مطبَّعاً (المفتاحُ للمقارنة والاسمُ للعرض)" \
    "select (name = 'ROYAL CANIN')::text from companies where clinic_id='$C1' and inv_norm_group(name)='royalcanin'" "true"
chk "  واسمٌ فارغ يُرفض" "select _pf_try('$C1', 'select ensure_company(''   '')')" "guarded:bad_name"
chk "وعيادةٌ أخرى لها شركتُها هي (لا تسريب)" \
    "select _pf('$C2', 'select (ensure_company(''شركة تاج الخيل'')).clinic_id::text')" "$C2"

# ── الطيّ: كلُّ عمودٍ يشير إلى الشركة يُنقل، ولا صفَّ يضيع ──
$P -c "delete from companies where clinic_id='$C2';" >/dev/null
KEEP=$($P -t -A -c "select id::text from companies where clinic_id='$C1' and inv_norm_group(name)='شركهتاجالخيل'")
DROP=$($P -t -A -c "insert into companies (id, clinic_id, name, note) values (gen_random_uuid(), '$C1', 'شركة تاج الخيل', 'ملاحظة') returning id::text")
SKEEP=$($P -t -A -c "insert into company_sections (clinic_id, company_id, name) values ('$C1','$KEEP','دراي فود') returning id::text")
SDROP=$($P -t -A -c "insert into company_sections (clinic_id, company_id, name) values ('$C1','$DROP','دراي فود') returning id::text")
SONLY=$($P -t -A -c "insert into company_sections (clinic_id, company_id, name) values ('$C1','$DROP','مكمّلات') returning id::text")
PA=$($P -t -A -c "insert into products (id, clinic_id, name, company_id, section_id) values (gen_random_uuid(),'$C1','علف-أ','$DROP','$SDROP') returning id::text")
PB=$($P -t -A -c "insert into products (id, clinic_id, name, company_id, section_id) values (gen_random_uuid(),'$C1','علف-ب','$DROP','$SONLY') returning id::text")
PU=$($P -t -A -c "insert into purchases (id, clinic_id, company_id, company_name) values (gen_random_uuid(),'$C1','$DROP','توأم') returning id::text")
$P -c "insert into purchase_payments (id, clinic_id, company_id, amount) values (gen_random_uuid(),'$C1','$DROP', 40);
       insert into company_charges (clinic_id, company_id, amount) values ('$C1','$DROP', 7), ('$C1','$DROP', 9);" >/dev/null

# بذرةٌ تُقاس قبل الطيّ — وإلا مرّ الفحصُ التالي على فراغ.
chk "(قبل الطيّ) المطويّةُ تحمل منتجَين وفاتورةً ودفعةً ومطالبتين وصنفَين" \
    "select (
       (select count(*) from products where company_id='$DROP') = 2 and
       (select count(*) from purchases where company_id='$DROP') = 1 and
       (select count(*) from purchase_payments where company_id='$DROP') = 1 and
       (select count(*) from company_charges where company_id='$DROP') = 2 and
       (select count(*) from company_sections where company_id='$DROP') = 2)::text" "true"
chk "الطيُّ يمرّ ويرجّع الباقي" \
    "select (_pf('$C1', 'select (merge_companies(''$KEEP'', ''$DROP'')).id::text') = '$KEEP')::text" "true"
chk "  المنتجان انتقلا" "select count(*)::text from products where company_id='$KEEP'" "2"
chk "  ولا واحدٌ منهما فقد شركتَه (set null كان سيُفرغها لو حُذفت قبل النقل)" \
    "select count(*)::text from products where id in ('$PA','$PB') and company_id is null" "0"
chk "  الفاتورةُ انتقلت واسمُها توحّد باسم الباقي" \
    "select (company_id='$KEEP' and company_name = (select name from companies where id='$KEEP'))::text from purchases where id='$PU'" "true"
# العمودُ الذي يغيب عن أيّ جردٍ عجل — ودفترُ المورّد ينقص بلا خطأ لو نُسي.
chk "  **دفعةُ المورّد انتقلت** (purchase_payments)" \
    "select count(*)::text from purchase_payments where company_id='$KEEP'" "1"
chk "  والمطالبتان انتقلتا (cascade كان سيمحوهما)" \
    "select count(*)::text from company_charges where company_id='$KEEP'" "2"
chk "  الصنفُ المتطابقُ طُوي: «دراي فود» واحدٌ بالباقي" \
    "select count(*)::text from company_sections where company_id='$KEEP' and inv_norm_group(name)='درايفود'" "1"
chk "  ومنتجُه انتقل لصنف الباقي لا صار فارغاً" \
    "select (section_id='$SKEEP')::text from products where id='$PA'" "true"
chk "  والصنفُ الذي لا مقابلَ له انتقل كما هو" \
    "select (company_id='$KEEP')::text from company_sections where id='$SONLY'" "true"
chk "  ولا منتجَ من الاثنين فقد صنفَه" \
    "select count(*)::text from products where id in ('$PA','$PB') and section_id is null" "0"
chk "  والمطويّةُ اختفت" "select count(*)::text from companies where id='$DROP'" "0"
chk "  وملاحظتُها لم تُرمَ (الباقي كان بلا ملاحظة)" \
    "select (note = 'ملاحظة')::text from companies where id='$KEEP'" "true"
chk "طيُّ الشيء بنفسه يُرفض" "select _pf_try('$C1', 'select merge_companies(''$KEEP'', ''$KEEP'')')" "guarded:bad_merge"
# ترفض بـ`no_keep` لا `bad_merge`: العيادةُ الثانية **لا ترى** صفَّ الأولى
# أصلاً — رفضٌ أدقُّ من المتوقَّع، وهو الصحيح.
chk "وطيُّ شركةِ عيادةٍ أخرى يُرفض (لا تراها أصلاً)" \
    "select _pf_try('$C2', 'select merge_companies(''$KEEP'', ''$DROP'')')" "guarded:no_keep"

chk "تقريرُ التوائم يرجع صفراً بعد الطيّ" "select _pf('$C1', 'select count(*)::text from company_twins()')" "0"
$P -c "insert into companies (clinic_id, name) values ('$C1','شركة تاج الخيل');" >/dev/null
chk "  ويرى التوأمَ الجديد وعددَ ما يحمله قبل أن تضغط" \
    "select _pf('$C1', 'select (rows::text || ''/'' || products::text) from company_twins() limit 1')" "2/2"
chk "  ويُبقي الأقدمَ باقياً (ما تعرفه العيادة)" \
    "select _pf('$C1', 'select (keep_id = ''$KEEP'')::text from company_twins() limit 1')" "true"

chk "الدوالُّ الخمس بمسارٍ مثبَّت، ممنوعةٌ عن anon، مسموحةٌ للمسجَّل" \
    "select bool_and(coalesce(array_to_string(p.proconfig,','),'') like '%search_path%' and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('inv_norm_group','ensure_company','ensure_company_section','merge_companies','company_twins')" "true"
# `inv_norm_name` تطوي المسافاتِ ولا تمسحها، ويعتمد عليها `record_purchase`.
# دالّةٌ ثانيةٌ بغرضٍ ثانٍ — لا تعديلٌ لتلك، والفحصُ يثبت أنهما ما زالتا تختلفان.
chk "و inv_norm_name لم تُمَسّ — ما زالت تختلف عن inv_norm_group" \
    "select (inv_norm_name('شركة تاج الخيل') <> inv_norm_group('شركة تاج الخيل'))::text" "true"

# ── ومرآةُ المفتاح: القاعدةُ تطبّع كما تطبّع الواجهة، قيمةً قيمة ───────────
# نفسُ منهج 0164: المتوقَّعُ تحسبه دالّةُ الواجهة **نفسها** (`groupKey` عبر
# esbuild) لا نسخةٌ منها؛ ثم يُقارَن ناتجُ `inv_norm_group` بها. وهذا بالضبط ما
# أمسك خطأً بأوّل كتابةٍ للهجرة: `translate` كانت تقابل «ة» بـ«ا» لا بـ«ه»،
# فمفتاحُ القاعدة «شركاتاجالخيل» ومفتاحُ الواجهة «شركهتاجالخيل» — **مرآةٌ
# تفترق عن أصلها هي نفسُ صنفِ العطب الذي جئنا نصلحه**.
GKF=$(mktemp -d)
node "$HERE/../../scripts/group-key-parity.mjs" "$GKF" >/dev/null
chk "كلُّ قيمةٍ تُطبَّع بالطرفين إلى النتيجة ذاتها" \
    "$(cat "$GKF/group-key.sql")" "ok"
rm -rf "$GKF"

# ── 0197: الطيُّ لا يفقد شيئاً، والحذفُ صار قابلاً للرجوع ──────────────────
# القاعدةُ هنا **حافظات**: «س لازم يبقى يساوي ص بعد الطيّ». الأعدادُ تُلقط قبل
# وبعد، فالفحصُ يمسك الفقدَ حتى لو جاء من طريقٍ لم نتوقّعه.
echo "▸ 0197: حافظاتُ الطيّ — لا منتجَ ولا فلسَ ولا وحدةَ حوضٍ تضيع"
$P -c "delete from company_sections_trash; delete from companies_trash; delete from company_merges;
       delete from company_charges; delete from purchase_payments; delete from company_sections;
       update products set company_id = null, section_id = null;
       update purchases set company_id = null; delete from companies; delete from products_trash;" >/dev/null

K=$($P -t -A -c "insert into companies (clinic_id, name, note) values ('$C1','اليف هاوس','الوكيل الرسمي') returning id::text")
D=$($P -t -A -c "insert into companies (clinic_id, name, note) values ('$C1','اليف  هاوس','رقم المندوب 0770') returning id::text")
# صنفٌ متطابقُ الاسم بالطرفين **وبحوضٍ غيرِ صفر على الاثنين** — العيبُ الذي
# كان يمرّ أخضرَ لأن البذرةَ القديمة تركت الحوضَ صفراً.
SK=$($P -t -A -c "insert into company_sections (clinic_id, company_id, name, pooled_stock) values ('$C1','$K','دراي فود', 7.500) returning id::text")
SD=$($P -t -A -c "insert into company_sections (clinic_id, company_id, name, pooled_stock) values ('$C1','$D','درايفود', 2.250) returning id::text")
SO=$($P -t -A -c "insert into company_sections (clinic_id, company_id, name, pooled_stock) values ('$C1','$D','مكمّلات', 1.000) returning id::text")
PA=$($P -t -A -c "insert into products (id, clinic_id, name, company_id, section_id, stock) values (gen_random_uuid(),'$C1','علف-أ','$D','$SD', 4) returning id::text")
PB=$($P -t -A -c "insert into products (id, clinic_id, name, company_id, section_id, stock) values (gen_random_uuid(),'$C1','علف-ب','$D','$SO', 6) returning id::text")
PC=$($P -t -A -c "insert into products (id, clinic_id, name, company_id, section_id, stock) values (gen_random_uuid(),'$C1','علف-ج','$K','$SK', 5) returning id::text")
QU=$($P -t -A -c "insert into purchases (id, clinic_id, company_id, company_name, total, amount_paid) values (gen_random_uuid(),'$C1','$D','اليف  هاوس', 900000, 300000) returning id::text")
$P -c "insert into purchase_payments (id, clinic_id, company_id, amount) values (gen_random_uuid(),'$C1','$D', 120000);
       insert into company_charges (clinic_id, company_id, amount) values ('$C1','$D', 5000), ('$C1','$D', 2500);" >/dev/null

# ــ الحافظات قبل الطيّ ــ
OWED_B=$($P -t -A -c "select coalesce(sum(greatest(0, total - coalesce(amount_paid,total))),0)::text from purchases where clinic_id='$C1'")
CHG_B=$($P -t -A -c "select coalesce(sum(amount),0)::text from company_charges where clinic_id='$C1'")
PROD_B=$($P -t -A -c "select count(*)::text from products where clinic_id='$C1'")
NOCO_B=$($P -t -A -c "select count(*)::text from products where clinic_id='$C1' and company_id is null")
NOSE_B=$($P -t -A -c "select count(*)::text from products where clinic_id='$C1' and section_id is null")
POOL_B=$($P -t -A -c "select coalesce(sum(pooled_stock),0)::text from company_sections where clinic_id='$C1'")
SELL_B=$($P -t -A -c "select (coalesce((select sum(stock) from products where clinic_id='$C1'),0) + coalesce((select sum(pooled_stock) from company_sections where clinic_id='$C1'),0))::text")
PAY_B=$($P -t -A -c "select coalesce(sum(amount),0)::text from purchase_payments where clinic_id='$C1'")

chk "تقريرُ التوائم يقول **ما ينتقل** لا ما بالمجموعة كلِّها" \
    "select _pf('$C1', 'select (products::text || ''/'' || moving_products::text) from company_twins() limit 1')" "3/2"
chk "  ويقول حوضَ المطويّات" \
    "select _pf('$C1', 'select pool_moving::text from company_twins() limit 1')" "3.250"
# 0200: ولكلّ صفٍّ عددُه — بلا هذا تجمد أرقامُ النافذة على الأقدم حين تبدّل
# العيادةُ الباقي، فتقرأ «٢ منتج» وهي واحد.
chk "  ولكلّ صفٍّ عددُه على حدة (rows_detail)" \
    "select _pf('$C1', 'select (jsonb_array_length(rows_detail) = 2)::text from company_twins() limit 1')" "true"
chk "  والباقيةُ تحمل منتجاً واحداً والمطويّةُ اثنين" \
    "select _pf('$C1', 'select ((rows_detail->0->>''products'')::int = 1 and (rows_detail->1->>''products'')::int = 2)::text from company_twins() limit 1')" "true"
chk "  وحوضُ كلٍّ منهما على حدة (٧٫٥ و٣٫٢٥)" \
    "select _pf('$C1', 'select ((rows_detail->0->>''pool'')::numeric = 7.5 and (rows_detail->1->>''pool'')::numeric = 3.25)::text from company_twins() limit 1')" "true"

chk "الطيُّ يمرّ" "select (_pf('$C1', 'select (merge_companies(''$K'', ''$D'')).id::text') = '$K')::text" "true"

# ــ الحافظات بعد الطيّ: كلُّ واحدةٍ لازم تطابق ما قبلها ــ
chk "المطلوبُ للمورّدين لم يتغيّر فلساً" \
    "select (coalesce(sum(greatest(0, total - coalesce(amount_paid,total))),0)::text = '$OWED_B')::text from purchases where clinic_id='$C1'" "true"
chk "ومجموعُ المطالبات" \
    "select (coalesce(sum(amount),0)::text = '$CHG_B')::text from company_charges where clinic_id='$C1'" "true"
chk "ومجموعُ دفعات المورّد" \
    "select (coalesce(sum(amount),0)::text = '$PAY_B')::text from purchase_payments where clinic_id='$C1'" "true"
chk "وعددُ المنتجات" "select (count(*)::text = '$PROD_B')::text from products where clinic_id='$C1'" "true"
chk "ولا منتجَ فقد شركتَه" "select (count(*)::text = '$NOCO_B')::text from products where clinic_id='$C1' and company_id is null" "true"
chk "ولا منتجَ فقد صنفَه" "select (count(*)::text = '$NOSE_B')::text from products where clinic_id='$C1' and section_id is null" "true"
# **الفحصُ الذي يهمّ**: الحوضُ وحداتٌ تُباع، وكان يتبخّر بفرعِ الاسم المتطابق.
chk "**مجموعُ حوض الأصناف لم يتغيّر**" \
    "select (coalesce(sum(pooled_stock),0)::text = '$POOL_B')::text from company_sections where clinic_id='$C1'" "true"
chk "  والحوضُ هبط بالصنف الصحيح لا بغيره (٧٫٥ + ٢٫٢٥)" \
    "select pooled_stock::text from company_sections where id='$SK'" "9.750"
chk "ومجموعُ الوحدات القابلة للبيع (رصيد + حوض) ثابت" \
    "select ((coalesce((select sum(stock) from products where clinic_id='$C1'),0) + coalesce((select sum(pooled_stock) from company_sections where clinic_id='$C1'),0))::text = '$SELL_B')::text" "true"
chk "والملاحظتان **اتّحدتا** ولم تُرمَ إحداهما" \
    "select (note like '%الوكيل%' and note like '%المندوب%')::text from companies where id='$K'" "true"
chk "والفاتورةُ انتقلت واسمُها توحّد" \
    "select (company_id='$K' and company_name='اليف هاوس')::text from purchases where id='$QU'" "true"

# ــ السلّة والفكّ ــ
# صورةُ الصنف المطويّ **بعد الطيّ وقبل الفكّ**: الفكُّ يستهلكها فيحذفها.
# والمحفّزُ يكتبها بـ«حذفٌ صريح» لأنه لا يعرف الطيّ — فتُصحَّح بعده (0201)،
# وإلّا تناقض سجلّان عن حدثٍ واحد ومن يسترجع الصنفَ وحدَه ضاعف الحوض.
chk "  وصورةُ الصنف المطويّ تحمل وجهتَه وحوضَه ومنتجاتِه هو" \
    "select (folded_into='$SK' and pooled_moved=2.250 and product_ids = array['$PA']::uuid[])::text
       from company_sections_trash where id='$SD'" "true"
chk "السلّةُ فيها صورةُ المطويّة بمعرّفها ووجهتُها" \
    "select (merged_into='$K' and array_length(product_ids,1)=2 and jsonb_array_length(sections)=2)::text from companies_trash where id='$D'" "true"
chk "  ودفترُ الطيّ يقول أين ذهبت" "select _pf('$C1','select (company_redirect(''$D'') = ''$K'')::text')" "true"
chk "الفكُّ يرجّعها **بنفس معرّفها**" \
    "select (_pf('$C1', 'select (restore_company(''$D'')).id::text') = '$D')::text" "true"
chk "  وكلُّ حافظةٍ رجعت لقيمتها: المطلوب" \
    "select (coalesce(sum(greatest(0, total - coalesce(amount_paid,total))),0)::text = '$OWED_B')::text from purchases where clinic_id='$C1'" "true"
chk "  والحوض" "select (coalesce(sum(pooled_stock),0)::text = '$POOL_B')::text from company_sections where clinic_id='$C1'" "true"
chk "  وحوضُ الباقي رجع ٧٫٥ بالضبط (طرحُ ما أُضيف لا تخمين)" \
    "select pooled_stock::text from company_sections where id='$SK'" "7.500"
chk "  والمنتجان رجعا للمطويّة" "select count(*)::text from products where company_id='$D'" "2"
chk "  والفاتورةُ والدفعةُ والمطالبتان" \
    "select ((select count(*) from purchases where company_id='$D')=1 and
             (select count(*) from purchase_payments where company_id='$D')=1 and
             (select count(*) from company_charges where company_id='$D')=2)::text" "true"
# **الحافظةُ التي لم تُكتب** (0201): أصنفُ كلِّ منتجٍ لشركته هو؟ كلُّ ما عداها
# — العددُ والرصيدُ والحوضُ والمال — كان يمرّ أخضرَ بينما منتجٌ لم يتحرّك بالطيّ
# أصلاً يهبط بعد الفكّ بصنفِ شركةٍ أخرى. السببُ: لقطةُ الصنف تُقرأ **بعد** نقل
# المنتجات إليه فتحمل منتجاتِ الطرفين، والفكُّ يردُّ كلَّ ما بالقائمة.
chk "  و**لا منتجَ بصنفِ شركةٍ أخرى** (الحافظةُ التي لم تُكتب)" \
    "select count(*)::text from products p join company_sections s on s.id = p.section_id
      where p.clinic_id='$C1' and s.company_id is distinct from p.company_id" "0"
chk "  والملاحظةُ فُكَّ اتّحادُها: الباقيةُ رجعت لملاحظتها وحدها" \
    "select (note = 'الوكيل الرسمي')::text from companies where id='$K'" "true"
chk "  والمطويّةُ بملاحظتها هي" \
    "select (note = 'رقم المندوب 0770')::text from companies where id='$D'" "true"

chk "  والسلّةُ ودفترُ الطيّ فُرّغا" \
    "select ((select count(*) from companies_trash where id='$D')=0 and (select count(*) from company_merges where from_id='$D')=0)::text" "true"
# صورةُ الصنف المطويّ استُهلكت بالفكّ: بقاؤها تعني صنفاً «محذوفاً» وهو بالقائمة،
# وتبويبُ المحذوفات يعرض صفّاً حيّاً واسترجاعُه يرمي `already_there`.
chk "  ولا صورةَ صنفٍ معلّقةٌ بعد الفكّ (الصنفُ حيٌّ بالقائمة)" \
    "select ((select count(*) from company_sections_trash where id='$SD')=0 and (select count(*) from company_sections where id='$SD')=1)::text" "true"

# ــ الحذفُ الخامّ صار طيّاً: هذا هو الباب الذي كان مفتوحاً ويفقد الآن ــ
# والقياسُ هنا **بالحافظات كما بالطيّ**: `company_charges` و`company_sections`
# مفتاحُهما `on delete cascade` — فالحذفُ الصريح يمحو الصفَّ نفسَه لا يفرّغ
# عموداً، ولقطةُ المعرّفات وحدَها لا تعيد صفّاً غيرَ موجود. هذا بالضبط ما سأل
# عنه المالك: «ما يروح ولا تفاصيل أخرى مثلاً الديونُ الي على الشركات».
CHG_D=$($P -t -A -c "select coalesce(sum(amount),0)::text from company_charges where company_id='$D'")
SEC_D=$($P -t -A -c "select count(*)::text from company_sections where company_id='$D'")
POOL_D=$($P -t -A -c "select coalesce(sum(pooled_stock),0)::text from company_sections where company_id='$D'")
$P -c "delete from companies where id='$D';" >/dev/null
chk "حذفٌ مباشرٌ بلا دالّة ⇒ صورةٌ بالسلّة (المحفّزُ صوّر قبل الخروج)" \
    "select (merged_into is null and array_length(product_ids,1)=2)::text from companies_trash where id='$D'" "true"
chk "  والاسترجاعُ يرجّع المنتجَين اللذين أفرغهما set null" \
    "select (_pf('$C1','select (restore_company(''$D'')).id::text') = '$D')::text" "true"
chk "  وعادا لشركتهما" "select count(*)::text from products where company_id='$D'" "2"
chk "  **ومطالباتُها رجعت بمبلغها** (cascade محاها، واللقطةُ معرّفاتٌ لا صفوف)" \
    "select (coalesce(sum(amount),0)::text = '$CHG_D')::text from company_charges where company_id='$D'" "true"
chk "  وأصنافُها رجعت بعددها" \
    "select (count(*)::text = '$SEC_D')::text from company_sections where company_id='$D'" "true"
chk "  وبحوضها فلساً بفلس (وحداتٌ تُباع)" \
    "select (coalesce(sum(pooled_stock),0)::text = '$POOL_D')::text from company_sections where company_id='$D'" "true"
chk "  ومنتجاتُها رجعت لأصنافها لا صارت بلا صنف" \
    "select count(*)::text from products where company_id='$D' and section_id is null" "0"
# حذفُ صنفٍ يُصوَّر كذلك — كان يُمحى بلا سلّة، ومعه حوضُه. صنفٌ جديدٌ مستقلّ
# حتى لا يعتمد الفحصُ على حالةِ ما قبله.
SX=$($P -t -A -c "insert into company_sections (clinic_id, company_id, name, pooled_stock) values ('$C1','$K','مكمّلات ٢', 3.250) returning id::text")
PX=$($P -t -A -c "insert into products (id, clinic_id, name, company_id, section_id) values (gen_random_uuid(),'$C1','علف-د','$K','$SX') returning id::text")
$P -c "delete from company_sections where id='$SX';" >/dev/null
chk "حذفُ صنفٍ ⇒ صورةٌ بحوضه بالسلّة (كان يُمحى بلا أثر)" \
    "select ((row->>'pooled_stock')::numeric = 3.250 and array_length(product_ids,1) = 1)::text from company_sections_trash where id='$SX'" "true"
chk "  ومنتجُه فقد صنفَه بالتتالي (set null) — وهذا ما يرجّعه الاسترجاع" \
    "select (section_id is null)::text from products where id='$PX'" "true"
chk "  والاسترجاعُ يرجّعه بحوضه" \
    "select _pf('$C1','select (restore_company_section(''$SX'')).pooled_stock::text')" "3.250"
chk "  ومنتجُه رجع إليه" "select (section_id = '$SX')::text from products where id='$PX'" "true"

# ــ لقطةُ السلّة لا تُعطَب: منتجٌ محذوفٌ شركتُه طُويت ــ
$P -c "select _pf('$C1', 'select delete_product(''$PB'', ''فحص'')::text');" >/dev/null
chk "منتجٌ بالسلّة شركتُه ستُطوى" "select ((row->>'company_id')::uuid = '$D')::text from products_trash where id='$PB'" "true"
$P -c "select _pf('$C1', 'select merge_companies(''$K'', ''$D'')::text');" >/dev/null
chk "  الطيُّ أعاد توجيه لقطته (لا 23503 عند الاسترجاع)" \
    "select ((row->>'company_id')::uuid = '$K')::text from products_trash where id='$PB'" "true"
chk "  والاسترجاعُ ينجح ويرجع المنتجُ لشركةٍ قائمة" \
    "select (_pf('$C1', 'select (restore_product(''$PB'')).company_id::text') = '$K')::text" "true"

# ــ الصلاحية بدورٍ حقيقيّ: الحزمةُ superuser فما لا يُفحص بـauthenticated لا يُعرف ــ
# نفسُ موظّف الاستقبال الذي تزرعه كتلةُ 0157 — بلا `on conflict` على أعمدةٍ
# لا قيدَ فريداً عليها بالقالب.
$P -c "insert into auth.users(id) values ('$RCP') on conflict do nothing;
       insert into memberships(user_id,clinic_id,role,status) values ('$RCP','$C1','receptionist','active') on conflict do nothing;" >/dev/null
D2=$($P -t -A -c "insert into companies (clinic_id, name) values ('$C1','اليف هاوس') returning id::text")
chk "موظّفُ الاستقبال لا يطوي شركة" \
    "select left(_rls_try('$RCP', 'select merge_companies(''$K'',''$D2'')'), 8)" "guarded:"
chk "  ولا صفَّ تحرّك برفضه (لا نصفَ طيّ)" \
    "select (count(*) = 1)::text from companies where id='$D2'" "true"
chk "ولا أحدَ يكتب بالسلّة بيده (سياستُها قراءةٌ فقط)" \
    "select left(_rls_try('$C1', 'insert into companies_trash(id,clinic_id,row) values (gen_random_uuid(),''$C1'',''{}''::jsonb)'), 8)" "guarded:"
chk "والسلّةُ تُقرأ بالعيادة" \
    "select left(_rls_try('$C1', 'select count(*) from companies_trash'), 5)" "rows:"

chk "دوالُّ 0197 بصلاحية المُعرِّف وبمسارٍ مثبَّت وفحصِ عيادةٍ بالنصّ" \
    "select bool_and(p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%' and p.prosrc like '%clinic_id = v_clinic%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('merge_companies','merge_company_sections','restore_company','restore_company_section')" "true"
chk "  وممنوعةٌ عن anon مسموحةٌ للمسجَّل" \
    "select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('merge_companies','merge_company_sections','restore_company','restore_company_section','company_redirect','company_twins')" "true"
# ــ 0203: لا استرجاعَ يقول «تمّ» وهو رجع فارغاً ــ
# اطوِ، ثمّ احذفِ الباقيةَ نفسَها، ثمّ استرجعِ المطويّة: كلُّ تحديثٍ بفرع الطيّ
# مشروطٌ بـ`company_id = merged_into`، وحذفُ الباقية يجعله NULL — فلا شيءَ
# يعود والشاشةُ تقول «رجعت بكل شي». الرفضُ يقول الترتيب.
M1=$($P -t -A -c "insert into companies (clinic_id, name) values ('$C1','مختبر الفحص') returning id::text")
M2=$($P -t -A -c "insert into companies (clinic_id, name) values ('$C1','مختبر  الفحص') returning id::text")
MP=$($P -t -A -c "insert into products (id, clinic_id, name, company_id, stock) values (gen_random_uuid(),'$C1','مادة','$M2', 3) returning id::text")
$P -c "select _pf('$C1', 'select merge_companies(''$M1'', ''$M2'')::text');
       select _pf('$C1', 'select delete_company(''$M1'')::text');" >/dev/null
chk "استرجاعُ مطويّةٍ وجهتُها محذوفة **يُرفض** (لا نجاحَ كاذب)" \
    "select _pf_try('$C1', 'select restore_company(''$M2'')')" "guarded:no_merge_target"
chk "  ولا صفَّ أُنشئ برفضه" "select count(*)::text from companies where id='$M2'" "0"
chk "والترتيبُ الصحيح يعمل: الباقيةُ أوّلاً" \
    "select (_pf('$C1','select (restore_company(''$M1'')).id::text') = '$M1')::text" "true"
chk "  ثمّ المطويّةُ ترجع بمنتجها" \
    "select (_pf('$C1','select (restore_company(''$M2'')).id::text') = '$M2')::text" "true"
chk "  والمنتجُ رجع لصاحبته" "select (company_id='$M2')::text from products where id='$MP'" "true"
$P -c "delete from products where id='$MP'; delete from companies where id in ('$M1','$M2');
       delete from companies_trash; delete from company_merges;" >/dev/null

# ــ 0202: محرفٌ لا يُرى ما عاد يصنع شركةً ثانية ــ
chk "مفتاحُ المقارنة يمسح المحارفَ غير المرئية" \
    "select (inv_norm_group('رويال كانين') = inv_norm_group(E'\\u200fرويال\\u200bكانين'))::text" "true"
chk "  واسمٌ كلُّه محارفُ اتجاهٍ = اسمٌ فارغ ⇒ يُرفض" \
    "select _pf_try('$C1', 'select ensure_company(E''\\u200b\\u200f'')')" "guarded:bad_name"
chk "  والاسمُ المحفوظ بلا ما لا يُرى" \
    "select _pf('$C1', 'select ((ensure_company(E''\\u200fرويال كانين'')).name = ''رويال كانين'')::text')" "true"
chk "  وإضافتُه ثانيةً بمحرفٍ آخر لا تُنشئ صفّاً" \
    "select _pf('$C1', 'select ((ensure_company(E''رويال\\u200bكانين'')).name = ''رويال كانين'')::text')" "true"
$P -c "delete from companies where clinic_id='$C1' and inv_norm_group(name)='رويالكانين';" >/dev/null

# ــ 0198: الحذفُ بدالّته — السببُ يُكتب، والمنعُ يُسمع ــ
D3=$($P -t -A -c "insert into companies (clinic_id, name) values ('$C1','شركةٌ للحذف') returning id::text")
$P -c "insert into company_charges (clinic_id, company_id, amount) values ('$C1','$D3', 1250);" >/dev/null
$P -c "select _pf('$C1', 'select delete_company(''$D3'', ''توأمٌ بالغلط'')::text');" >/dev/null
chk "delete_company تحذف الصفَّ وتكتب السبب (سياسةُ السلّة قراءةٌ فقط فلا تُكتب من المتصفّح)" \
    "select count(*)::text from companies where id='$D3'" "0"
chk "  والسببُ وصل اللقطة" "select reason from companies_trash where id='$D3'" "توأمٌبالغلط"
chk "  ومطالبتُها صورتُها بالسلّة صفّاً كاملاً لا معرّفاً" \
    "select ((charges->0->>'amount')::numeric = 1250)::text from companies_trash where id='$D3'" "true"
chk "  والاسترجاعُ يعيدها بمبلغها" \
    "select (_pf('$C1','select (restore_company(''$D3'')).id::text') = '$D3')::text" "true"
chk "  والدَّينُ رجع" "select coalesce(sum(amount),0)::text from company_charges where company_id='$D3'" "1250"
chk "وموظّفُ الاستقبال لا يحذف شركة" \
    "select left(_rls_try('$RCP', 'select delete_company(''$D3'')'), 8)" "guarded:"
chk "  ولا صفَّ تحرّك برفضه" "select count(*)::text from companies where id='$D3'" "1"

# ــ 0199: القفلُ بالقاعدة — يمنع المتصفّح ولا يكسر الفكّ ــ
# `ensure_company` دفاعٌ أوّل يُلتَفّ عليه بإدراجٍ من PostgREST أو لوحة Supabase
# أو نسخةِ واجهةٍ قديمة. والمحفّزُ يحرس **الكتابةَ المباشرة** وحدها: فهرسٌ فريدٌ
# كان سيرفض الفكَّ نفسَه (المطويّةُ ترجع بنفس اسم الباقية) فيصير المطويُّ بلا رجعة.
$P -c "delete from company_sections; delete from companies where clinic_id='$C1';" >/dev/null
U1=$($P -t -A -c "insert into companies (clinic_id, name) values ('$C1','بيورينا') returning id::text")
chk "إدراجٌ مباشرٌ من المتصفّح بنفس الاسم يُرفض" \
    "select _rls_try('$C1', 'insert into companies (clinic_id, name) values (auth_clinic(), ''بيورينا'')')" "guarded:23505:company_twin_name"
chk "  وبإملاءٍ آخر كذلك (المفتاحُ مطبَّع)" \
    "select _rls_try('$C1', 'insert into companies (clinic_id, name) values (auth_clinic(), ''بيورينا  '')')" "guarded:23505:company_twin_name"
$P -c "select _pf('$C1', 'select ensure_company(''بيورينا بلس'')::text');" >/dev/null
chk "  وتسميةُ شركةٍ قائمةٍ باسم أختها تُرفض كذلك (UPDATE لا INSERT وحده)" \
    "select _rls_try('$C1', 'update companies set name = ''بيورينا'' where name = ''بيورينا بلس''')" "guarded:23505:company_twin_name"
chk "  واسمٌ مختلفٌ فعلاً يمرّ" \
    "select (count(*) = 1)::text from companies where clinic_id='$C1' and name='بيورينا بلس'" "true"
chk "  وعيادةٌ أخرى لها اسمُها هي (النطاقُ العيادة)" \
    "select _pf('$C2', 'select ((ensure_company(''بيورينا'')).clinic_id = ''$C2'')::text')" "true"
$P -c "insert into company_sections (clinic_id, company_id, name) values ('$C1','$U1','دراي فود');" >/dev/null
chk "والصنفُ كذلك: نفسُ الاسم بنفس الشركة يُرفض" \
    "select _rls_try('$C1', 'insert into company_sections (clinic_id, company_id, name) values (auth_clinic(), ''$U1'', ''درايفود'')')" "guarded:23505:company_section_twin_name"
chk "  ونفسُ الاسم **بشركةٍ أخرى** يمرّ (النطاقُ الشركة)" \
    "select _pf('$C1', 'select ((ensure_company_section((select id from companies where clinic_id = auth_clinic() and name = ''بيورينا بلس''), ''دراي فود'')).name = ''دراي فود'')::text')" "true"
# **الفحصُ الذي سحب الفهرس**: الفكُّ يعيد المطويّةَ بنفس اسم الباقية.
D9=$($P -t -A -c "insert into companies (clinic_id, name) values ('$C2','بيورينا') returning id::text")
K9=$($P -t -A -c "select id::text from companies where clinic_id='$C2' and name='بيورينا' and id <> '$D9'")
chk "والطيُّ يمرّ رغم المحفّز (دالّةُ مُعرِّفٍ لا متصفّح)" \
    "select (_pf('$C2', 'select (merge_companies(''$K9'', ''$D9'')).id::text') = '$K9')::text" "true"
chk "  **والفكُّ يرجّعها بنفس اسم الباقية** — فهرسٌ فريدٌ كان سيرفضه للأبد" \
    "select (_pf('$C2', 'select (restore_company(''$D9'')).name') = 'بيورينا')::text" "true"
chk "  وصارتا صفّين باسمٍ واحدٍ فعلاً (هذا معنى الفكّ)" \
    "select count(*)::text from companies where clinic_id='$C2' and inv_norm_group(name)='بيورينا'" "2"
chk "والمحفّزان موجودان وinvoker (لا يشدّان أكثر من السياسة)" \
    "select (count(*) = 2 and bool_and(not p.prosecdef))::text from pg_trigger tg join pg_proc p on p.oid=tg.tgfoid where tg.tgname in ('companies_no_twin_guard','company_sections_no_twin_guard') and not tg.tgisinternal" "true"

chk "والمحفّزان قبل الحذف موجودان" \
    "select count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgname in ('companies_trash_guard','company_sections_trash_guard') and not t.tgisinternal" "2"



# ── 0210: الانتهاء — مُدّتان بيد العيادة، وكتمٌ يرتفع بتبدّل الوجبة ──────────
echo "▸ 0210: الانتهاء"
$P -c "update _dvtest_flags set admin = false; delete from platform_sessions;" >/dev/null
chk "(تهيئة) C2 بعيادته هو لا بعيادة C1" "select _pf('$C2', 'select auth_clinic()::text')" "$C2"
chk "مدةُ الإرجاع عمودٌ صحيحٌ غيرُ فارغٍ افتراضُه ٩٠" \
    "select data_type||'/'||is_nullable||'/'||column_default from information_schema.columns where table_name='clinic_prefs' and column_name='expiry_return_days'" "integer/NO/90"
chk "  والحرجةُ كذلك بـ٣٠" \
    "select data_type||'/'||is_nullable||'/'||column_default from information_schema.columns where table_name='clinic_prefs' and column_name='expiry_critical_days'" "integer/NO/30"
# الحزمةُ تنشئ clinic_prefs بنفسها (harness.sql) **بلا RLS** — فكلُّ فحصِ سياسةٍ عليها
# كان يمرّ مهما كانت السياسة (أمسكه فحصُ «عيادةٌ أخرى» أدناه: rows:1). الإنتاجُ مقيس
# (٢٥/٩): relrowsecurity وrelforcerowsecurity كلاهما true — فالحزمةُ تطابقه هنا.
$P -c "alter table clinic_prefs enable row level security; alter table clinic_prefs force row level security;
       insert into clinic_prefs (clinic_id) values ('$C1') on conflict do nothing;" >/dev/null
chk "  وصفٌّ قائمٌ يأخذ ٩٠/٣٠ بلا كتابة" \
    "select expiry_return_days||'/'||expiry_critical_days from clinic_prefs where clinic_id='$C1'" "90/30"
chk "  وأيُّ موظفٍ يعدّلها كبقية التفضيلات (بدور authenticated)" \
    "select _rls_try('$RCP', 'update clinic_prefs set expiry_return_days = 120 where clinic_id = ''$C1''')" "rows:1"
chk "  وعيادةٌ أخرى لا تلمسها" \
    "select _rls_try('$C2', 'update clinic_prefs set expiry_return_days = 60 where clinic_id = ''$C1''')" "rows:0"
chk "  وصفرُ يومٍ يُرفض (الحدُّ ١..٧٣٠)" \
    "select left(_rls_try('$C1', 'update clinic_prefs set expiry_critical_days = 0 where clinic_id = ''$C1'''), 13)" "guarded:23514"
$P -c "update clinic_prefs set expiry_return_days = 90 where clinic_id='$C1';" >/dev/null

chk "expiry_ack تاريخٌ **nullable بلا افتراض** (استرجاعُ اللقطات القديمة)" \
    "select data_type||'/'||is_nullable||'/'||coalesce(column_default,'-') from information_schema.columns where table_name='products' and column_name='expiry_ack'" "date/YES/-"
$P -c "insert into products (id, clinic_id, name, barcode, stock, expiry_date)
       values ('e2100000-0000-4000-8000-000000000001','$C1','سيفوتاكس الفحص','0210000000001', 6, '2026-10-01')
       on conflict (id) do nothing;" >/dev/null
chk "الكتمُ: موظّفُ استقبالٍ لا يكتم (سياسةُ products_write القائمة)" \
    "select _rls_try('$RCP', 'update products set expiry_ack = expiry_date where id = ''e2100000-0000-4000-8000-000000000001''')" "rows:0"
chk "  والبيطريُّ يكتم" \
    "select _rls_try('$VET', 'update products set expiry_ack = expiry_date where id = ''e2100000-0000-4000-8000-000000000001''')" "rows:1"
chk "  والمديرُ كذلك" \
    "select _rls_try('$C1', 'update products set expiry_ack = expiry_date where id = ''e2100000-0000-4000-8000-000000000001''')" "rows:1"
chk "  ومكتومٌ = التاريخان متساويان" \
    "select (expiry_ack = expiry_date)::text from products where id='e2100000-0000-4000-8000-000000000001'" "true"
$P -c "select set_config('request.jwt.claim.sub','$C1',false); select delete_product('e2100000-0000-4000-8000-000000000001', 'فحص 0210');" >/dev/null
chk "والكتمُ يعبر الحذفَ (بالسلّة بتاريخه)" \
    "select row->>'expiry_ack' from products_trash where id='e2100000-0000-4000-8000-000000000001'" "2026-10-01"
$P -c "select set_config('request.jwt.claim.sub','$C1',false); select restore_product('e2100000-0000-4000-8000-000000000001');" >/dev/null
chk "  والاسترجاعَ (رجع مكتوماً بنفس التاريخ)" \
    "select coalesce((select expiry_ack::text from products where id='e2100000-0000-4000-8000-000000000001'), 'missing')" "2026-10-01"
$P -c "select set_config('request.jwt.claim.sub','$C1',false); select delete_product('e2100000-0000-4000-8000-000000000001', 'فحص 0210 لقطة قديمة');
       update products_trash set row = row - 'expiry_ack' where id='e2100000-0000-4000-8000-000000000001';
       select restore_product('e2100000-0000-4000-8000-000000000001');" >/dev/null
chk "ولقطةٌ أقدمُ بلا المفتاح تُسترجع (NULL = غيرُ مكتوم) — عمودٌ NOT NULL كان سيمنعها" \
    "select coalesce((select coalesce(expiry_ack::text, 'null') from products where id='e2100000-0000-4000-8000-000000000001'), 'missing')" "null"
$P -c "update products set expiry_ack = expiry_date where id='e2100000-0000-4000-8000-000000000001';
       update products set expiry_date = '2027-03-01' where id='e2100000-0000-4000-8000-000000000001';" >/dev/null
chk "ووجبةٌ جديدةٌ بتاريخٍ آخر ترفع الكتمَ وحدَها (لا محفّز)" \
    "select (expiry_ack = expiry_date)::text from products where id='e2100000-0000-4000-8000-000000000001'" "false"
chk "expiry_ack_qty رقمٌ nullable بلا افتراض (الرصيدُ لحظةَ الكتم)" \
    "select data_type||'/'||is_nullable||'/'||coalesce(column_default,'-') from information_schema.columns where table_name='products' and column_name='expiry_ack_qty'" "numeric/YES/-"
$P -c "delete from audit_log where entity_id like 'kp0210-%';
       insert into audit_log (clinic_id, action, entity, entity_id, details, created_at) values
         ('$C1','CLIENT','client','kp0210-1','{\"event\":\"sale.expired\"}', now() - interval '200 days'),
         ('$C1','CLIENT','client','kp0210-2','{\"event\":\"invoice.print\"}', now() - interval '200 days'),
         ('$C1','CLIENT','client','kp0210-3','{\"event\":\"sale.expired\"}', now() - interval '400 days');
       select public.purge_audit_log(90, 365);" >/dev/null
chk "الكنس: «بيعُ منتهٍ» عمرُه ٢٠٠ يوم يبقى (طبقةُ المال)، والطباعةُ بعمره تُكنس، و٤٠٠ يوم يُكنس" \
    "select string_agg(entity_id, ',' order by entity_id) from audit_log where entity_id like 'kp0210-%'" "kp0210-1"
# (الحجبُ عن المسجَّل يفحصه أوّلُ الحزمة قبل المنح الشامل للـ_rls_try — هنا بعده فلا يُقاس.)
chk "  والكنسُ والمعاينةُ ما زالتا بصلاحية المُعرِّف وبمسارٍ مثبّت" \
    "select count(*)::text from pg_proc p where p.proname in ('purge_audit_log','audit_log_preview') and p.pronamespace='public'::regnamespace and p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%'" "2"
$P -c "insert into audit_log (clinic_id, action, entity, entity_id, details, created_at) values ('$C1','X',null,'kp0210-null','{}', now() - interval '200 days');
       select public.purge_audit_log(90, 365);" >/dev/null
chk "  وكيانٌ فارغٌ بلا حدثٍ ما زال يُكنس (NULL لا يُسقطه من الشرط — فخُّ 0129)" \
    "select count(*)::text from audit_log where entity_id = 'kp0210-null'" "0"
chk "audit_kind: «بيعُ منتهٍ» نوعٌ باسمه لا «طباعة»" \
    "select audit_kind('client', 'CLIENT', '{\"event\":\"sale.expired\"}'::jsonb) || '/' || audit_kind('client', 'CLIENT', '{\"event\":\"sale.expiredx\"}'::jsonb)" "sale_expired/print"


# ── 0211: الشراءُ يقول ماذا فعل — كشفٌ لكلّ سطر ──────────────────────────
# الخمسةُ من الخطة (٢·١) تفشل قبل الهجرة (الجدولُ غير موجود)، ومعها ما أضافه
# البناء: «كان» بالتعديل صورةُ ما قبل التعديل لا السالبُ الوسطيّ، والمشالُ يُقال.
echo "▸ 0211: كشفُ الشراء"
$P -c "select set_config('request.jwt.claim.sub','$C1',false);
       insert into products (id, clinic_id, name, barcode, alt_codes, stock, sell_price, purchase_price) values
         ('e2110000-0000-4000-8000-000000000001','$C1','سيفوتاكس الكشف','EFF-1','{}',4,3000,2000),
         ('e2110000-0000-4000-8000-000000000002','$C1','شامبو الكشف',null,'{}',2,5000,4000),
         ('e2110000-0000-4000-8000-000000000003','$C1','رفّ الكشف','SHELF-EFF',array['EFF-ALT-9'],1,1000,800)
       on conflict (id) do nothing;
       select record_purchase(jsonb_build_array(
         jsonb_build_object('barcode','EFF-1','name','سيفوتاكس الكشف','qty',50,'purchase_price',2000,'sell_price',2500),
         jsonb_build_object('name','شامبو الكشف','qty',3,'purchase_price',4000,'sell_price',0),
         jsonb_build_object('barcode','EFF-ALT-9','name','وصلت بالرمز الإضافي','qty',2,'purchase_price',800,'sell_price',0),
         jsonb_build_object('barcode','EFF-NEW-1','name','رمل الكشف','qty',15,'purchase_price',100,'sell_price',150)),
         jsonb_build_object('company_name','مورّد الكشف'));" >/dev/null
EP="(select id from purchases where clinic_id='$C1' and company_name='مورّد الكشف' order by created_at desc limit 1)"
chk "0211: سعرُ البيع تبدّل بالباركود — مكتوبٌ قبلُ وبعدُ، وبـchanged، والرصيدُ ليس فيه" \
    "select count(*)::text from purchase_effects where purchase_id = $EP and matched_by='barcode'
       and (before->>'sell_price')::numeric = 3000 and (after->>'sell_price')::numeric = 2500
       and 'sell_price' = any(changed) and 'stock' <> all(changed)" "1"
chk "  والرصيدُ قبل/بعد صحيح (٤ ⇒ ٥٤)" \
    "select (before->>'stock')::numeric::int||'->'||(after->>'stock')::numeric::int from purchase_effects where purchase_id = $EP and line_no = 1" "4->54"
chk "  **سطرٌ بلا باركود لُقي بالاسم — الفرعُ الذي لا يعرفه المتصفّح صار مكتوباً**" \
    "select matched_by from purchase_effects where purchase_id = $EP and line_no = 2" "name"
chk "  وسعرُ بيعٍ صفرٌ لا يكتب فوق القائم فلا يُعدّ تبديلاً" \
    "select cardinality(changed)::text from purchase_effects where purchase_id = $EP and line_no = 2" "0"
chk "  ورمزٌ إضافيٌّ وحدَه ⇒ alt_code" \
    "select matched_by||'/'||product_id::text from purchase_effects where purchase_id = $EP and line_no = 3" "alt_code/e2110000-0000-4000-8000-000000000003"
chk "  وتعلُّمُ ما لا يُتعلَّم لا يُقال: الأساسيُّ قائمٌ فلا يتبدّل الباركود" \
    "select ('barcode' = any(changed))::text from purchase_effects where purchase_id = $EP and line_no = 3" "false"
chk "  ورمزٌ جديد ⇒ created بلا «قبل» وبلا matched_by" \
    "select outcome||'/'||coalesce(matched_by,'-')||'/'||(before is null)::text from purchase_effects where purchase_id = $EP and line_no = 4" "created/-/true"
chk "  وكلُّها op=record وبعدد السطور" \
    "select count(*) filter (where op='record')::text from purchase_effects where purchase_id = $EP" "4"
# تعديلٌ: السيفوتاكس ٥٠ ⇒ ٤٠ بعد بيع ٥٠ (الرصيد ٤)، والرملُ الجديد يُشال من الفاتورة.
$P -c "update products set stock = 4 where id='e2110000-0000-4000-8000-000000000001';
       select set_config('request.jwt.claim.sub','$C1',false);
       select update_purchase($EP, jsonb_build_array(
         jsonb_build_object('product_id','e2110000-0000-4000-8000-000000000001','barcode','EFF-1','name','سيفوتاكس الكشف','qty',40,'purchase_price',2000,'sell_price',2500),
         jsonb_build_object('name','شامبو الكشف','qty',3,'purchase_price',4000,'sell_price',0),
         jsonb_build_object('barcode','EFF-ALT-9','name','وصلت بالرمز الإضافي','qty',2,'purchase_price',800,'sell_price',0)),
         jsonb_build_object('company_name','مورّد الكشف'));" >/dev/null
chk "update_purchase تضيف صفوفَ op=update **ولا تمسح** صفوفَ record" \
    "select count(*) filter (where op='record')||'/'||count(*) filter (where op='update') from purchase_effects where purchase_id = $EP" "4/4"
chk "  و«كان» صورةُ ما قبل التعديل (٤) و«صار» بعد الحصرة (صفر، لا −٦)" \
    "select (before->>'stock')::numeric::int||'->'||(after->>'stock')::numeric::int||'/'||matched_by from purchase_effects where purchase_id = $EP and op='update' and line_no = 1" "4->0/id"
chk "  والمشالُ من الفاتورة يُقال: removed بكميةٍ سالبة ورصيدٍ نقص" \
    "select outcome||'/'||qty::int||'/'||(before->>'stock')::numeric::int||'->'||(after->>'stock')::numeric::int from purchase_effects where purchase_id = $EP and op='update' and product_id = (select product_id from purchase_effects where purchase_id = $EP and op='record' and line_no = 4)" "removed/-15/15->0"
EPID=$($P -tAc "select $EP")
chk "الكشفُ يُقرأ بالعيادة (بدور authenticated)" \
    "select (_rls_try('$C1', 'select 1 from purchase_effects where purchase_id = ''$EPID''') <> 'rows:0')::text" "true"
chk "  وعيادةٌ أخرى لا تراه" \
    "select _rls_try('$C2', 'select 1 from purchase_effects where purchase_id = ''$EPID''')" "rows:0"
chk "  ولا يُكتب إلا من الدالّتين (لا سياسةَ كتابة)" \
    "select left(_rls_try('$C1', 'update purchase_effects set qty = 0 where purchase_id = ''$EPID'''), 7)" "rows:0"
# وسطران لنفس المادّة بالتعديل (قالبُ التدقيق العدائيّ حرفاً): ٥٠ اشتُريت و٤٥ بيعت ثمّ
# التعديلُ ١٠+٣٠. الثاني صورتُه وسطيّةٌ (−٣٥) — والقارئُ يعتمد على أن **آخرَ** «صار»
# لكلّ مادّة هو الحالُ النهائية وأوّلَ «كان» ما قبل التعديل. هذا ما يُحرس هنا.
$P -c "insert into products (id, clinic_id, name, barcode, alt_codes, stock) values
         ('e2110000-0000-4000-8000-000000000021','$C1','مكرّر الكشف','DUPX','{}',0) on conflict (id) do nothing;
       select set_config('request.jwt.claim.sub','$C1',false);
       select record_purchase(jsonb_build_array(jsonb_build_object('product_id','e2110000-0000-4000-8000-000000000021','name','مكرّر الكشف','qty',50,'purchase_price',1,'sell_price',0)),
         jsonb_build_object('company_name','مكرّر ١'));
       update products set stock = 5 where id='e2110000-0000-4000-8000-000000000021';
       select update_purchase((select id from purchases where company_name='مكرّر ١' and clinic_id='$C1'), jsonb_build_array(
         jsonb_build_object('product_id','e2110000-0000-4000-8000-000000000021','name','مكرّر الكشف','qty',10,'purchase_price',1,'sell_price',0),
         jsonb_build_object('product_id','e2110000-0000-4000-8000-000000000021','name','مكرّر الكشف','qty',30,'purchase_price',1,'sell_price',0)),
         jsonb_build_object('company_name','مكرّر ١'));" >/dev/null
chk "سطران لنفس المادّة بالتعديل: أوّلُ «كان» = ما قبل التعديل (٥)، وآخرُ «صار» = النهائيّ (٠)" \
    "select (select (before->>'stock')::numeric::int from purchase_effects e where e.product_id='e2110000-0000-4000-8000-000000000021' and op='update' order by line_no limit 1)
       ||'->'||(select (after->>'stock')::numeric::int from purchase_effects e where e.product_id='e2110000-0000-4000-8000-000000000021' and op='update' order by line_no desc limit 1)
       ||'/'||(select stock::int from products where id='e2110000-0000-4000-8000-000000000021')" "5->0/0"
# ٢·٤ مرآةً بمرآة: التوأمان بالاسم — نفسُ قالب repo-demo-test حرفاً.
$P -c "insert into companies (id, clinic_id, name) values
         ('e2110000-0000-4000-8000-0000000000c1','$C1','شركة الكشف ت'),
         ('e2110000-0000-4000-8000-0000000000c2','$C1','شركة الكشف س') on conflict do nothing;
       insert into products (id, clinic_id, name, alt_codes, stock, company_id, created_at) values
         ('e2110000-0000-4000-8000-000000000011','$C1','كالسيوم التوأم','{}',1,null,'2026-01-01'),
         ('e2110000-0000-4000-8000-000000000012','$C1','كالسيوم التوأم','{}',1,'e2110000-0000-4000-8000-0000000000c2','2026-06-01')
       on conflict (id) do nothing;
       select set_config('request.jwt.claim.sub','$C1',false);
       select record_purchase(jsonb_build_array(jsonb_build_object('name','كالسيوم التوأم','qty',5,'purchase_price',100,'sell_price',0)),
         jsonb_build_object('company_id','e2110000-0000-4000-8000-0000000000c1','company_name','توأم ١'));" >/dev/null
chk "توأمان بالاسم وفاتورةُ شركةٍ ثالثة: شركةٌ أخرى قبل «بلا شركة» (كالمرآة)" \
    "select product_id::text from purchase_effects e join purchases p on p.id = e.purchase_id where p.company_name='توأم ١'" "e2110000-0000-4000-8000-000000000012"
$P -c "delete from products where id in ('e2110000-0000-4000-8000-000000000011','e2110000-0000-4000-8000-000000000012');
       insert into products (id, clinic_id, name, alt_codes, stock, company_id, created_at) values
         ('e2110000-0000-4000-8000-000000000013','$C1','كالسيوم التوأم','{}',1,'e2110000-0000-4000-8000-0000000000c2','2026-01-01'),
         ('e2110000-0000-4000-8000-000000000014','$C1','كالسيوم التوأم','{}',1,null,'2026-06-01')
       on conflict (id) do nothing;
       select set_config('request.jwt.claim.sub','$C1',false);
       select record_purchase(jsonb_build_array(jsonb_build_object('name','كالسيوم التوأم','qty',1,'purchase_price',100,'sell_price',0)),
         jsonb_build_object('company_name','توأم ٢'));" >/dev/null
chk "  وفاتورةٌ بلا شركة ⇒ الأقدم (كالمرآة)" \
    "select product_id::text from purchase_effects e join purchases p on p.id = e.purchase_id where p.company_name='توأم ٢'" "e2110000-0000-4000-8000-000000000013"
chk "  والكشفُ يعيش بعمر الفاتورة (cascade)" \
    "select confdeltype::text from pg_constraint where conrelid='purchase_effects'::regclass and confrelid='purchases'::regclass" "c"


# ── 0212: المتجرُ لا يبيع المنتهي — قرارُ المالك ─────────────────────────
echo "▸ 0212: المتجرُ والمنتهي"
TODAY_BGD="(now() at time zone 'Asia/Baghdad')::date"
$P -c "update store_profiles set enabled = true where clinic_id = '$C1';
       insert into products (id, clinic_id, name, sell_price, purchase_price, stock, store_visible, expiry_date) values
         ('e2120000-0000-4000-8000-000000000001','$C1','منتهٍ بالمتجر',5000,3000,9,true, $TODAY_BGD - 1),
         ('e2120000-0000-4000-8000-000000000002','$C1','آخرُ يومٍ بالمتجر',5000,3000,9,true, $TODAY_BGD),
         ('e2120000-0000-4000-8000-000000000003','$C1','بلا تاريخٍ بالمتجر',5000,3000,9,true, null)
       on conflict (id) do update set expiry_date = excluded.expiry_date, store_visible = true, stock = 9;" >/dev/null
chk "0212: الكتلوجُ لا يعرض المنتهي (أمس)" \
    "select count(*)::text from store_catalog('trackclinic',100,0) where id = 'e2120000-0000-4000-8000-000000000001'" "0"
chk "  ويعرض آخرَ يومٍ صالح (اليوم) وما بلا تاريخ" \
    "select count(*)::text from store_catalog('trackclinic',100,0) where id in ('e2120000-0000-4000-8000-000000000002','e2120000-0000-4000-8000-000000000003')" "2"
chk "سلّةٌ قديمةٌ فيها منتهٍ تُرفض بـbad_items («حدّث الصفحة»)" \
    "select store_place_order('trackclinic', 'زبون الانتهاء', '0779 212 0001', 'عنوان', '', '[{\"product_id\":\"e2120000-0000-4000-8000-000000000001\",\"qty\":1}]'::jsonb)->>'error'" "bad_items"
chk "  وآخرُ يومٍ صالح يُطلب عادي" \
    "select store_place_order('trackclinic', 'زبون الانتهاء', '0779 212 0002', 'عنوان', '', '[{\"product_id\":\"e2120000-0000-4000-8000-000000000002\",\"qty\":1}]'::jsonb)->>'ok'" "true"
# طلبٌ وقع والمادّةُ صالحة ثمّ انتهت قبل القبول.
$P -c "insert into store_orders (id, clinic_id, order_no, customer_name, customer_phone, items, subtotal, delivery_fee, total, status)
         values ('e2120000-0000-4000-8000-0000000000a1','$C1','SO-EXP01','زبون الانتهاء','0779 212 0003',
                 jsonb_build_array(jsonb_build_object('product_id','e2120000-0000-4000-8000-000000000001','name','منتهٍ بالمتجر','qty',1,'price',5000,'total',5000)),
                 5000, 0, 5000, 'new') on conflict (id) do nothing;" >/dev/null
chk "القبولُ يرفض طلباً انتهت مادّتُه بعد وقوعه — بالاسم" \
    "select (_pf_try('$C1', 'select store_accept_order(''e2120000-0000-4000-8000-0000000000a1'')::text') like '%store_item_expired%')::text" "true"
chk "  ولا يخرج من الرفّ شيء، والطلبُ باقٍ «جديد» ليقرّر فيه" \
    "select (select stock::int from products where id='e2120000-0000-4000-8000-000000000001')||'/'||(select status from store_orders where id='e2120000-0000-4000-8000-0000000000a1')" "9/new"
chk "  والدالّتان ما زالتا بصلاحية المُعرِّف ومسارٍ مثبّت" \
    "select count(*)::text from pg_proc where proname in ('store_place_order','store_accept_order','store_catalog') and pronamespace='public'::regnamespace and prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%'" "3"


# ── 0213: قياسُ صيغ المسح — صامت، مختومٌ بالعيادة، ولا تراه العيادات ─────
echo "▸ 0213: قياسُ صيغ المسح"
$P -c "update _dvtest_flags set admin = false; delete from platform_sessions; delete from scan_shape_stats;" >/dev/null
SS="select _pf('$C1', 'select note_scan_shapes(current_date, ''{\"sale:ean13\":3,\"purchase:gs1_ai\":1}''::jsonb, array[''0106285096000842172705311024A123''], ''$C1''::uuid)::text')"
$P -c "$SS; $SS;" >/dev/null
chk "العدُّ يُجمع بالدفعات (٣+٣ و١+١)، والعيّنةُ تُحفظ" \
    "select (counts->>'sale:ean13')||'/'||(counts->>'purchase:gs1_ai')||'/'||cardinality(samples) from scan_shape_stats where clinic_id='$C1' and day=current_date" "6/2/2"
$P -c "select _pf('$C1', 'select note_scan_shapes(current_date, ''{\"x\":5,\"sale:ean8\":99999,\"sale:alnum\":\"7\"}''::jsonb, ''{}'', ''$C1''::uuid)::text');" >/dev/null
chk "  والمدخلُ مقصوص: مفتاحٌ مجهولٌ يُسقط، والعددُ ≤ ١٠٬٠٠٠، والنصُّ لا يُعدّ رقماً" \
    "select coalesce(counts->>'x','-')||'/'||(counts->>'sale:ean8')||'/'||coalesce(counts->>'sale:alnum','-') from scan_shape_stats where clinic_id='$C1' and day=current_date" "-/10000/-"
$P -c "select _pf('$C2', 'select note_scan_shapes(current_date, ''{\"sale:ean13\":50}''::jsonb, ''{}'', ''$C1''::uuid)::text');" >/dev/null
chk "عدُّ عيادةٍ وصل من جهازٍ مشتركٍ بهويّة أخرى لا يُكتب بأيٍّ منهما" \
    "select count(*)||'/'||(select counts->>'sale:ean13' from scan_shape_stats where clinic_id='$C1' and day=current_date) from scan_shape_stats where clinic_id='$C2'" "0/6"
$P -c "update _dvtest_flags set admin = true;
       select _pf('$C1', 'select note_scan_shapes(current_date, ''{\"sale:ean13\":100}''::jsonb, ''{}'', ''$C1''::uuid)::text');
       update _dvtest_flags set admin = false;" >/dev/null
chk "  ودخولُ المشغّل لا يترك أثراً (0151)" \
    "select counts->>'sale:ean13' from scan_shape_stats where clinic_id='$C1' and day=current_date" "6"
chk "العياداتُ لا ترى الجدول (RLS بلا سياسة)" \
    "select _rls_try('$C1', 'select 1 from scan_shape_stats')" "rows:0"
chk "  والدالّةُ بصلاحية المُعرِّف ومسارٍ مثبّت، ومحجوبةٌ عن anon" \
    "select (prosecdef and coalesce(array_to_string(proconfig,','),'') like '%search_path%' and not has_function_privilege('anon', oid, 'execute'))::text from pg_proc where proname='note_scan_shapes'" "true"

# ── 0214: الوجباتُ الخفيفة — تاريخُ كلّ وجبةٍ مع سطرها، ووسمُ الإرجاع ────
echo "▸ 0214: الوجباتُ الخفيفة"
$P -c "insert into products (id, clinic_id, name, barcode, alt_codes, stock, expiry_date) values
         ('e2140000-0000-4000-8000-000000000001','$C1','سيفوتاكس الوجبات','LB-1','{}',0,null) on conflict (id) do nothing;
       select set_config('request.jwt.claim.sub','$C1',false);
       select record_purchase(jsonb_build_array(jsonb_build_object('product_id','e2140000-0000-4000-8000-000000000001','name','سيفوتاكس الوجبات','qty',10,'purchase_price',1,'sell_price',0,'expiry_date','2026-12-01')),
         jsonb_build_object('company_name','وجبة أ'));
       select record_purchase(jsonb_build_array(jsonb_build_object('product_id','e2140000-0000-4000-8000-000000000001','name','سيفوتاكس الوجبات','qty',5,'purchase_price',1,'sell_price',0,'expiry_date','2027-06-01')),
         jsonb_build_object('company_name','وجبة ب'));" >/dev/null
chk "كلُّ وجبةٍ تحفظ تاريخَها مع سطرها — والقديمةُ لا تُنسى حين يتبدّل تاريخُ المنتج" \
    "select string_agg(pi.expiry_date::text, ',' order by pi.expiry_date) || '/' || (select expiry_date::text from products where id='e2140000-0000-4000-8000-000000000001')
     from purchase_items pi where pi.product_id='e2140000-0000-4000-8000-000000000001'" "2026-12-01,2027-06-01/2026-12-01"
# تعديلُ الفاتورة القديمة بلا تاريخٍ مكتوب، وتاريخُها المحفوظ بـbatch_expiry (كما يرسله المتصفّح).
$P -c "select set_config('request.jwt.claim.sub','$C1',false);
       select update_purchase((select id from purchases where company_name='وجبة أ' and clinic_id='$C1'),
         jsonb_build_array(jsonb_build_object('product_id','e2140000-0000-4000-8000-000000000001','name','سيفوتاكس الوجبات','qty',10,'purchase_price',1,'sell_price',0,'batch_expiry','2026-12-01')),
         jsonb_build_object('company_name','وجبة أ'));" >/dev/null
chk "  وتعديلُ الفاتورة القديمة يُبقي تاريخَ وجبتها للسطر (batch_expiry)" \
    "select pi.expiry_date::text from purchase_items pi join purchases p on p.id=pi.purchase_id where p.company_name='وجبة أ'" "2026-12-01"
# 0217 غيّرت القاعدةَ بقرار المالك: تاريخُ المادة = **أقربُ** دفعةٍ فيها رصيد لا أحدثُها —
# الوجبتان على الرفّ، والأقربُ هو ما يُنبَّه عليه.
chk "  وتاريخُ الرفّ = أقربُ وجبةٍ فيها رصيد (0217 — كان «الأحدث» قبلها)" \
    "select expiry_date::text from products where id='e2140000-0000-4000-8000-000000000001'" "2026-12-01"
chk "  والكشفُ (0211) ما زال يُكتب بالتعديل" \
    "select count(*)::text from purchase_effects e join purchases p on p.id=e.purchase_id where p.company_name='وجبة أ' and e.op='update'" "1"
chk "وجباتُ المادّة بتواريخها (لخطّ زمنها)، الأحدثُ أوّلاً" \
    "select string_agg(coalesce(expiry_date::text,'-'), ',') from (select set_config('request.jwt.claim.sub','$C1',true)) s, product_batches('e2140000-0000-4000-8000-000000000001')" "2027-06-01,2026-12-01"
chk "  وعيادةٌ أخرى لا ترى وجباتِ غيرها" \
    "select count(*)::text from (select set_config('request.jwt.claim.sub','$C2',true)) s, product_batches('e2140000-0000-4000-8000-000000000001')" "0"
chk "return_mark تاريخٌ nullable بلا افتراض (كـexpiry_ack)" \
    "select data_type||'/'||is_nullable||'/'||coalesce(column_default,'-') from information_schema.columns where table_name='products' and column_name='return_mark'" "date/YES/-"
chk "  والبيطريُّ يسِم (سياسةُ products_write القائمة)، والاستقبالُ لا" \
    "select _rls_try('$VET', 'update products set return_mark = expiry_date where id = ''e2140000-0000-4000-8000-000000000001''')||'|'||_rls_try('$RCP', 'update products set return_mark = expiry_date where id = ''e2140000-0000-4000-8000-000000000001''')" "rows:1|rows:0"

# ── 0215: اقتراحُ الطلب — معدّلُ البيع يُجمع بالقاعدة ─────────────────────
echo "▸ 0215: اقتراحُ الطلب"
chk "المهلةُ عمودٌ صحيحٌ غيرُ فارغٍ افتراضُه ٧" \
    "select data_type||'/'||is_nullable||'/'||column_default from information_schema.columns where table_name='clinic_prefs' and column_name='reorder_lead_days'" "integer/NO/7"
chk "  وصفرٌ يُرفض (١..٩٠)" \
    "select left(_rls_try('$C1', 'update clinic_prefs set reorder_lead_days = 0 where clinic_id = ''$C1'''), 13)" "guarded:23514"
$P -c "insert into products (id, clinic_id, name, stock) values ('e2150000-0000-4000-8000-000000000001','$C1','مادةُ المعدّل',3) on conflict (id) do nothing;
       insert into invoices (id, clinic_id) values ('e2150000-0000-4000-8000-0000000000a1','$C1'),('e2150000-0000-4000-8000-0000000000a2','$C1'),('e2150000-0000-4000-8000-0000000000a3','$C1') on conflict do nothing;
       insert into invoice_items (id, clinic_id, invoice_id, product_id, qty, created_at) values
         ('e2150000-0000-4000-8000-0000000000b1','$C1','e2150000-0000-4000-8000-0000000000a1','e2150000-0000-4000-8000-000000000001', 10, now() - interval '3 days'),
         ('e2150000-0000-4000-8000-0000000000b2','$C1','e2150000-0000-4000-8000-0000000000a2','e2150000-0000-4000-8000-000000000001', -2, now() - interval '2 days'),
         ('e2150000-0000-4000-8000-0000000000b3','$C1','e2150000-0000-4000-8000-0000000000a3','e2150000-0000-4000-8000-000000000001', 50, now() - interval '60 days')
       on conflict do nothing;" >/dev/null
chk "صافي المبيع بآخر ٣٠ يوماً: ١٠ − ٢ مرتجع = ٨ (ولا يدخل ما قبل المدة)" \
    "select sold::int::text from (select set_config('request.jwt.claim.sub','$C1',true)) s, product_sales_rate(30) where product_id='e2150000-0000-4000-8000-000000000001'" "8"
chk "  وبـ٩٠ يوماً يدخل الأقدم (٥٨)" \
    "select sold::int::text from (select set_config('request.jwt.claim.sub','$C1',true)) s, product_sales_rate(90) where product_id='e2150000-0000-4000-8000-000000000001'" "58"
chk "  والمدّةُ مقصوصة (١٠٠٠ يوم ⇒ ١٨٠ — لا مسحَ للجدول كلّه)" \
    "select sold::int::text from (select set_config('request.jwt.claim.sub','$C1',true)) s, product_sales_rate(1000) where product_id='e2150000-0000-4000-8000-000000000001'" "58"
chk "  وعيادةٌ أخرى لا ترى مبيعَ غيرها" \
    "select count(*)::text from (select set_config('request.jwt.claim.sub','$C2',true)) s, product_sales_rate(30) where product_id='e2150000-0000-4000-8000-000000000001'" "0"


# ── 0216: الجردُ الدوريّ — الفرقُ بموافقة، والخسارةُ سحبٌ «من المخزن» ─────────
echo "▸ 0216: الجردُ بموافقة وسحبُ المخزن"
K=e2160000-0000-4000-8000-0000000000
$P -c "insert into products (id, clinic_id, name, stock, purchase_price) values
         ('${K}01','$C1','جرد تالف',10,2000), ('${K}02','$C1','جرد مطابق',5,1000),
         ('${K}03','$C1','جرد خطأ إدخال',4,500), ('${K}04','$C1','جرد زيادة',1,700),
         ('${K}05','$C1','جرد مرفوض',6,300), ('${K}06','$C2','جرد عيادة ثانية',9,100),
         ('${K}07','$C1','جرد بلا سعر',3,0)
         , ('${K}08','$C1','جرد مجمّع',0,100)
       on conflict (id) do nothing;
       update products set pooled = true where id = '${K}08';" >/dev/null
chk "عددُ اليوم عمودٌ صحيحٌ افتراضُه ٥" \
    "select data_type||'/'||is_nullable||'/'||column_default from information_schema.columns where table_name='clinic_prefs' and column_name='count_daily_n'" "integer/NO/5"
chk "الاستقبالُ يعدّ: ناقصٌ بسببه يعلَّق، والمطابقُ يُختم بلا موافقة" \
    "select _pf('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}01\",\"counted\":7,\"reason\":\"damaged\",\"note\":\"انكسرت\"},{\"product_id\":\"${K}02\",\"counted\":5},{\"product_id\":\"${K}07\",\"counted\":1,\"reason\":\"damaged\"}]''::jsonb)::text')" '{"matched":1,"pending":2}'
chk "  **والرصيدُ ما تغيّر** قبل الموافقة" \
    "select stock::int::text from products where id='${K}01'" "10"
chk "  واسمُ من عدّ محفوظ، والسببُ والملاحظة" \
    "select coalesce(counted_by::text,'-')||'|'||reason||'|'||note||'|'||status from stock_counts where product_id='${K}01'" "$RCP|damaged|انكسرت|pending"
chk "فرقٌ بلا سبب يُرفض ويسمّي المادة" \
    "select _pf_try('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}03\",\"counted\":2}]''::jsonb)::text') like '%count_reason%'" "t"
chk "  وزيادةٌ بسبب «تالف» تُرفض (السببُ يطابق الاتجاه)" \
    "select _pf_try('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}04\",\"counted\":3,\"reason\":\"damaged\"}]''::jsonb)::text') like '%count_reason%'" "t"
chk "  وعدٌّ سالب يُرفض" \
    "select _pf_try('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}04\",\"counted\":-1,\"reason\":\"found\"}]''::jsonb)::text') like '%count_bad_qty%'" "t"
chk "  والمادةُ المجمَّعة تُعدّ من قسمها لا من هنا" \
    "select _pf_try('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}08\",\"counted\":1,\"reason\":\"found\"}]''::jsonb)::text') like '%count_pooled%'" "t"
chk "  ومادةُ عيادةٍ أخرى لا تُعدّ" \
    "select _pf_try('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}06\",\"counted\":1,\"reason\":\"shortage\"}]''::jsonb)::text') like '%count_product_missing%'" "t"
$P -c "select _pf('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}03\",\"counted\":2,\"reason\":\"entry_error\"},{\"product_id\":\"${K}04\",\"counted\":3,\"reason\":\"found\"},{\"product_id\":\"${K}05\",\"counted\":2,\"reason\":\"shortage\"}]''::jsonb)::text');" >/dev/null
chk "الاستقبالُ لا يوافق (المديرُ وحده)" \
    "select _pf_try('$RCP', 'select stock_count_decide(array(select id from stock_counts where product_id=''${K}01''), true)::text') like '%count_needs_manager%'" "t"
chk "  وبدور authenticated فعلاً: رفضٌ مقصود (P0001 ⇒ الواجهةُ تعرض سببه العربيّ)" \
    "select split_part(_rls_try('$RCP', 'select stock_count_decide(array(select id from stock_counts where product_id=''${K}01''), true)'), ':', 2)" "P0001"
chk "  ومديرُ عيادةٍ أخرى لا يصل سطورَ غيرها" \
    "select _pf('$C2', 'select stock_count_decide(array(select id from stock_counts where product_id=''${K}01''), true)::text')::jsonb->>'approved'" "0"
chk "مادةٌ معلَّقة لا تُعدّ ثانيةً حتى يقرّر المدير (عدٌّ «مطابق» كان يمحو النقص)" \
    "select _pf_try('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}05\",\"counted\":6}]''::jsonb)::text') like '%count_already_pending%'" "t"
chk "  والمعلَّقُ باقٍ كما هو" \
    "select string_agg(status||counted_qty::int, ',') from stock_counts where product_id='${K}05'" "pending2"
chk "عددٌ NaN أو Infinity يُرفض (وإلا صار الرصيدُ NaN بالموافقة)" \
    "select (_pf_try('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}04\",\"counted\":\"NaN\",\"reason\":\"found\"}]''::jsonb)::text') like '%count_bad_qty%')::text||(_pf_try('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${K}04\",\"counted\":\"Infinity\",\"reason\":\"found\"}]''::jsonb)::text') like '%count_bad_qty%')::text" "truetrue"
chk "المديرُ يرفض: الرصيدُ باقٍ والسطرُ مرفوض" \
    "select _pf('$C1', 'select stock_count_decide(array(select id from stock_counts where product_id=''${K}05'' and status=''pending''), false)::text')::jsonb->>'rejected'||'|'||(select stock::int from products where id='${K}05')" "1|6"
# بيعٌ بين العدّ والموافقة: ١٠ ⇒ ٨. العدُّ لقى ٧ من ١٠ (−٣) ⇒ بعد الموافقة ٥ لا ٧.
$P -c "update products set stock = 8 where id = '${K}01';" >/dev/null
chk "المديرُ يوافق على الكلّ" \
    "select _pf('$C1', 'select stock_count_decide(array(select id from stock_counts where product_id in (''${K}01'',''${K}03'',''${K}04'',''${K}07'') and status=''pending''), true)::text')::jsonb->>'approved'" "4"
chk "  **الفرقُ لا الرقم**: ما بيع بعد العدّ يبقى مبيعاً (٨ − ٣ = ٥)" \
    "select stock::int::text||'|'||(select applied_delta::int from stock_counts where product_id='${K}01' and status='approved') from products where id='${K}01'" "5|-3"
chk "  وخطأُ الإدخال والزيادةُ يصحّحان الرصيد" \
    "select string_agg(stock::int::text, ',' order by name) from products where id in ('${K}03','${K}04')" "2,3"
chk "  والتالفُ صار **سحباً من المخزن** بيومه، بسعر الشراء، وبموادّه" \
    "select count(*)||'|'||sum(amount)::int||'|'||min(method)||'|'||min(category)||'|'||min(description) from expenses where id in (select expense_id from stock_counts where product_id='${K}01')" "1|6000|stock|سحبمخزن|سحبمخزن—تالف:جردتالف×3"
chk "  ومادةٌ بلا سعر شراء لا تصنع سحباً صفرياً (تبقى بالجرد بلا قيمة)" \
    "select coalesce(expense_id::text,'-')||'|'||status from stock_counts where product_id='${K}07'" "-|approved"
chk "  وخطأُ الإدخال والزيادةُ **لا سحبَ لهما**" \
    "select count(*)::text from stock_counts where product_id in ('${K}03','${K}04') and expense_id is not null" "0"
chk "  والموافقةُ لا تُطبَّق مرّتين (المعتمدُ لا يعود معلَّقاً)" \
    "select _pf('$C1', 'select stock_count_decide(array(select id from stock_counts where product_id=''${K}01''), true)::text')::jsonb->>'approved'||'|'||(select stock::int from products where id='${K}01')" "0|5"
chk "سحبُ المخزن لا يُضاف باليد (محفّزٌ بدور authenticated)" \
    "select split_part(_rls_try('$C1', 'insert into expenses (clinic_id, amount, description, method, staff_id) values (''$C1'', 5, ''يدوي'', ''stock'', ''$C1'')'), ':', 3)" "stock_expense_locked"
chk "  ولا يُحذف باليد (حذفُه يُخفي خسارةً والرصيدُ مصحَّح)" \
    "select split_part(_rls_try('$C1', 'delete from expenses where method = ''stock'''), ':', 3)" "stock_expense_locked"
chk "  وطريقةٌ مجهولةٌ ما زالت تُرفض (القيدُ وُسّع لا أُزيل)" \
    "select left(_rls_try('$C1', 'insert into expenses (clinic_id, amount, description, method, staff_id) values (''$C1'', 5, ''x'', ''wallet'', ''$C1'')'), 13)" "guarded:23514"
chk "سطورُ الجرد لا تُكتب مباشرةً من التطبيق" \
    "select left(_rls_try('$C1', 'insert into stock_counts (clinic_id, product_name, system_qty, counted_qty) values (''$C1'', ''x'', 1, 1)'), 13)" "guarded:42501"
chk "  وتُقرأ للعيادة بدور authenticated، ولا تُرى لغيرها" \
    "select _rls_try('$RCP', 'select 1 from stock_counts where product_id = ''${K}01''')||'|'||_rls_try('$C2', 'select 1 from stock_counts where product_id = ''${K}01''')" "rows:1|rows:0"
chk "تقريرُ الخسائر بأسبابها: تالف ٦٠٠٠+٠، خطأ ١٠٠٠، زيادة −١٤٠٠" \
    "select string_agg(reason||':'||lines||':'||value::int, ',' order by reason) from (select set_config('request.jwt.claim.sub','$C1',true)) s, report_stock_losses(now() - interval '1 day', now() + interval '1 day')" "damaged:2:6000,entry_error:1:1000,found:1:-1400"
chk "  وعيادةٌ أخرى لا ترى خسائرَ غيرها" \
    "select count(*)::text from (select set_config('request.jwt.claim.sub','$C2',true)) s, report_stock_losses(now() - interval '1 day', now() + interval '1 day')" "0"
chk "حالةُ العدّ: المطابقُ بلا فرق، والتالفُ بفرق" \
    "select string_agg(case when last_diff_at is null then 'clean' else 'diff' end, ',' order by product_id) from (select set_config('request.jwt.claim.sub','$C1',true)) s, stock_count_state() where product_id in ('${K}01','${K}02')" "diff,clean"
chk "الدالّتان definer وتفحصان العيادةَ بنصّهما (الحزمةُ superuser لا تمسك هذا)" \
    "select string_agg(proname||':'||prosecdef||':'||(prosrc like '%clinic_id = v_clinic%'), ',' order by proname) from pg_proc where proname in ('stock_count_submit','stock_count_decide')" "stock_count_decide:true:true,stock_count_submit:true:true"
chk "  والموافقةُ تفحص الدورَ بنصّها" \
    "select (prosrc like '%auth_role() is distinct from ''manager''%')::text from pg_proc where proname='stock_count_decide'" "true"
chk "ولا شيءَ منها لـanon" \
    "select string_agg(has_function_privilege('anon', p.oid, 'execute')::text, ',') from pg_proc p where proname in ('stock_count_submit','stock_count_decide','report_stock_losses','stock_count_state')" "false,false,false,false"

# ── 0217: الدفعات — مجموعُها = الرصيد دائماً، والبيعُ من الأقرب انتهاءً ─────────
# الفعلُ بمعاملةٍ والقراءةُ بأخرى: الحارسُ مؤجَّلٌ لنهاية المعاملة، واللقطةُ لا ترى
# ما فعلته دالّةٌ بنفس الاستعلام.
echo "▸ 0217: الدفعات"
L=e2170000-0000-4000-8000-0000000000
D1=$(date -d '+40 days' +%F); D2=$(date -d '+200 days' +%F); D3=$(date -d '+250 days' +%F); D4=$(date -d '+20 days' +%F); DX=$(date -d '-3 days' +%F); D9=$(date -d '+300 days' +%F)
$P -c "insert into products (id, clinic_id, name, stock, purchase_price, expiry_date) values ('${L}01','$C1','دفعات أ',10,100,'$D1') on conflict (id) do nothing;" >/dev/null
chk "مادةٌ جديدةٌ برصيد ⇒ دفعةٌ افتتاحية بكميتها وتاريخها" \
    "select string_agg(source||':'||qty::int||':'||coalesce(expiry_date::text,'-'), ',') from product_lots where product_id='${L}01'" "opening:10:$D1"
$P -c "select set_config('request.jwt.claim.sub','$C1',false);
       select record_purchase(jsonb_build_array(jsonb_build_object('product_id','${L}01','name','دفعات أ','qty',20,'purchase_price',100,'sell_price',0,'expiry_date','$D2')),
         jsonb_build_object('company_name','شركة الدفعات'));" >/dev/null
chk "الشراءُ يصنع دفعتَه بتاريخ السطر وشركته" \
    "select string_agg(source||':'||qty::int||':'||expiry_date||':'||coalesce(company_name,'-'), ',' order by expiry_date) from product_lots where product_id='${L}01'" "opening:10:$D1:-,purchase:20:$D2:شركةالدفعات"
chk "  وتاريخُ المادة = أقربُ دفعة (لا الأحدث)" \
    "select expiry_date::text||'|'||stock::int from products where id='${L}01'" "$D1|30"
$P -c "update products set stock = stock - 12 where id = '${L}01';" >/dev/null
chk "البيعُ من الأقرب انتهاءً: الافتتاحيةُ تخلص (١٠) والباقي من الشراء (٢)" \
    "select string_agg(source||':'||qty::int, ',' order by expiry_date) from product_lots where product_id='${L}01'" "opening:0,purchase:18"
chk "  وتاريخُ المادة صار تاريخَ الدفعة الباقية" \
    "select expiry_date::text from products where id='${L}01'" "$D2"
$P -c "update products set stock = stock + 2 where id = '${L}01';" >/dev/null
chk "المرتجعُ يرجع لأقرب دفعةٍ صالحةٍ فيها رصيد" \
    "select string_agg(source||':'||qty::int, ',' order by expiry_date) from product_lots where product_id='${L}01'" "opening:0,purchase:20"
$P -c "select set_config('request.jwt.claim.sub','$C1',false);
       select update_purchase((select id from purchases where company_name='شركة الدفعات' and clinic_id='$C1'),
         jsonb_build_array(jsonb_build_object('product_id','${L}01','name','دفعات أ','qty',25,'purchase_price',100,'sell_price',0,'expiry_date','$D2')),
         jsonb_build_object('company_name','شركة الدفعات'));" >/dev/null
chk "تعديلُ الفاتورة (٢٠⇒٢٥) يزيد دفعتَها ٥ — لا دفعةٌ ثانية ولا ضياعُ ما بيع" \
    "select count(*)||'|'||sum(qty)::int||'|'||(select stock::int from products where id='${L}01') from product_lots where product_id='${L}01' and source='purchase'" "1|25|25"
$P -c "select set_config('request.jwt.claim.sub','$C1',false);
       select update_purchase((select id from purchases where company_name='شركة الدفعات' and clinic_id='$C1'),
         jsonb_build_array(jsonb_build_object('name','بديل الدفعات','qty',1,'purchase_price',1,'sell_price',0)), jsonb_build_object('company_name','شركة الدفعات'));" >/dev/null
chk "  ومسحُ المادة من الفاتورة يمسح دفعتَها" \
    "select count(*)::text from product_lots where product_id='${L}01' and source='purchase'" "0"
chk "  والرصيدُ والدفعاتُ متطابقان بعدها" \
    "select ((select stock from products where id='${L}01') = (select coalesce(sum(qty),0) from product_lots where product_id='${L}01'))::text" "true"
$P -c "insert into products (id, clinic_id, name, stock, purchase_price, expiry_date) values ('${L}02','$C1','دفعات ب',3,50,'$DX') on conflict (id) do nothing;" >/dev/null
chk "مادةٌ دخلت بتاريخٍ فات: دفعتُها تحفظه (التنبيهُ لا يضيع)" \
    "select coalesce(expiry_date::text,'-') from product_lots where product_id='${L}02'" "$DX"
$P -c "select set_config('request.jwt.claim.sub','$C1',false); select lot_add('${L}02', 5, '$D1', 'وصلت من المندوب');" >/dev/null
chk "إضافةُ دفعةٍ باليد (المدير) تزيد الرصيد بها" \
    "select stock::int::text||'|'||(select count(*) from product_lots where product_id='${L}02') from products where id='${L}02'" "8|2"
chk "  والاستقبالُ لا يضيف دفعات" \
    "select (_pf_try('$RCP', 'select lot_add(''${L}02'', 5, ''$D1'')::text') like '%lot_forbidden%')::text" "true"
$P -c "update products set stock = stock - 2 where id = '${L}02';" >/dev/null
chk "البيعُ لا يُفترض من علبةٍ منتهية: يُسحب من الصالحة" \
    "select string_agg(qty::int::text, ',' order by expiry_date) from product_lots where product_id='${L}02'" "3,3"
chk "  وتاريخُ المادة = الأقربُ **الصالح** — المنتهيةُ تبقى ظاهرةً بدفعتها ولا تُلبس الجديدةَ ثوبَها" \
    "select expiry_date::text||'|'||(select count(*) from product_lots where product_id='${L}02' and qty>0 and expiry_date < current_date) from products where id='${L}02'" "$D1|1"
$P -c "select _pf('$RCP', 'select stock_count_submit(''[{\"product_id\":\"${L}02\",\"counted\":4,\"reason\":\"expired\"}]''::jsonb)::text');" >/dev/null
$P -c "select _pf('$C1', 'select stock_count_decide(array(select id from stock_counts where product_id=''${L}02'' and status=''pending''), true)::text');" >/dev/null
chk "جردٌ بسبب «منتهي» يُسحب من المنتهي أوّلاً (المنتهي ٣⇒١، الصالح ٣ باقٍ)" \
    "select string_agg(qty::int::text, ',' order by expiry_date) from product_lots where product_id='${L}02'" "1,3"
$P -c "insert into products (id, clinic_id, name, stock, purchase_price, expiry_date) values ('${L}03','$C1','دفعات ج',6,10,'$D1') on conflict (id) do nothing;" >/dev/null
$P -c "select set_config('request.jwt.claim.sub','$C1',false); select lot_add('${L}03', 4, '$D2');" >/dev/null
$P -c "select _pf('$RCP', 'select stock_count_submit(jsonb_build_array(jsonb_build_object(''product_id'',''${L}03'',''counted'',0,''reason'',''damaged'',''lots'',(select jsonb_agg(jsonb_build_object(''lot_id'',id,''counted'',case when expiry_date=''$D1'' then 5 else 4 end)) from product_lots where product_id=''${L}03''))))::text');" >/dev/null
chk "الجردُ بالدفعة: الأولى ٦ لقينا ٥، الثانية ٤ لقينا ٤ ⇒ المادةُ ٩ معلَّقة، ورصيدُها ما تغيّر" \
    "select counted_qty::int||'|'||jsonb_array_length(lot_counts)||'|'||(select stock::int from products where id='${L}03') from stock_counts where product_id='${L}03' and status='pending'" "9|2|10"
$P -c "select _pf('$C1', 'select stock_count_decide(array(select id from stock_counts where product_id=''${L}03'' and status=''pending''), true)::text');" >/dev/null
chk "  والموافقةُ تنقص الدفعةَ المعدودة بعينها" \
    "select string_agg(qty::int::text, ',' order by expiry_date) from product_lots where product_id='${L}03'" "5,4"
chk "  ودفعةُ مادةٍ أخرى لا تُعدّ تحت هذه" \
    "select (_pf_try('$RCP', 'select stock_count_submit(jsonb_build_array(jsonb_build_object(''product_id'',''${L}03'',''counted'',0,''reason'',''damaged'',''lots'',jsonb_build_array(jsonb_build_object(''lot_id'',(select id from product_lots where product_id=''${L}01'' limit 1),''counted'',1)))))::text') like '%count_lot_missing%')::text" "true"
chk "تعديلُ تاريخ المادة باليد يمرّ (بدور authenticated)" \
    "select _rls_try('$C1', 'update products set expiry_date = ''$D3'' where id = ''${L}03''')" "rows:1"
chk "  ويعدّل الدفعةَ التي يمثّلها، والمادةُ تبقى على الأقرب" \
    "select (select string_agg(expiry_date::text, ',' order by expiry_date) from product_lots where product_id='${L}03' and qty>0)||'|'||(select expiry_date::text from products where id='${L}03')" "$D2,$D3|$D2"
$P -c "select _pf('$C1', 'select lot_edit((select id from product_lots where product_id=''${L}03'' and expiry_date=''$D3''), ''$D4'', 2)::text');" >/dev/null
chk "فصلُ جزءٍ من دفعةٍ بتاريخٍ آخر لا يغيّر الرصيد، والمادةُ تأخذ الأقرب" \
    "select stock::int::text||'|'||expiry_date||'|'||(select string_agg(qty::int::text, ',' order by expiry_date) from product_lots where product_id='${L}03' and qty>0) from products where id='${L}03'" "9|$D4|2,4,3"
$P -c "update products set stock = 0 where id = '${L}02';" >/dev/null
$P -c "update products set expiry_date = '$D9', stock = 7 where id = '${L}02';" >/dev/null
chk "رصيدٌ جديدٌ بعد النفاد بلا فاتورة ⇒ دفعةُ «تعديل» بالتاريخ الجديد (لا تُلصق بدفعةٍ فارغة)" \
    "select string_agg(source||':'||qty::int||':'||coalesce(expiry_date::text,'-'), ',') from product_lots where product_id='${L}02' and qty > 0" "adjust:7:$D9"
$P -c "insert into products (id, clinic_id, name, stock, pooled) values ('${L}04','$C1','دفعات مجمّعة',5,true) on conflict (id) do nothing;" >/dev/null
chk "المجمَّعةُ بلا دفعات (رصيدُها بحوض القسم)" \
    "select count(*)::text from product_lots where product_id='${L}04'" "0"
chk "**لا مادةَ رصيدُها ≠ مجموعُ دفعاتها** بالحزمة كلّها" \
    "select count(*)::text from products p where not coalesce(p.pooled,false) and p.farm_id is null and coalesce(p.stock,0) <> (select coalesce(sum(qty),0) from product_lots l where l.product_id=p.id)" "0"
chk "الدفعاتُ تُقرأ للعيادة بدور authenticated، ولا تُرى لغيرها، ولا تُكتب مباشرةً" \
    "select _rls_try('$RCP', 'select 1 from product_lots where product_id = ''${L}03''')||'|'||_rls_try('$C2', 'select 1 from product_lots where product_id = ''${L}03''')||'|'||_rls_try('$C1', 'update product_lots set qty = 99 where product_id = ''${L}03''')" "rows:3|rows:0|rows:0"
chk "الدوالُّ الكاتبة definer وتفحص العيادةَ بنصّها" \
    "select string_agg(proname||':'||prosecdef||':'||(prosrc like '%clinic_id = v_clinic%'), ',' order by proname) from pg_proc where proname in ('lot_add','lot_edit')" "lot_add:true:true,lot_edit:true:true"
# (منعُ الداخليّة lots_* عن التطبيق يُقاس على الإنتاج بعد التنزيل: المنحُ الشاملُ بالحزمة يعيده هنا.)

# ── 0217 بعد التدقيق العدائيّ ────────────────────────────────────────────────
echo "▸ 0217: ما أمسكه التدقيق"
# الإنتاجُ يمنع الداخليّةَ عن authenticated؛ الحزمةُ منحتها كلَّها فأخفت العطل — نعيد المنع
# ونحفظ مادةً **بدور التطبيق حتى نهاية المعاملة** (المحفّزُ المؤجَّل يجري عند الختم بدوره).
$P -c "revoke execute on function public.lots_reconcile(uuid, boolean), public.lots_from_purchase(uuid, uuid),
         public.lots_refresh_expiry(uuid), public.lots_move_purchase(uuid, uuid, uuid) from authenticated;" >/dev/null
out=$($P -c "begin; select set_config('request.jwt.claim.sub','$C1',true); set local role authenticated;
  insert into products (id, clinic_id, name, stock, expiry_date) values ('${L}10','$C1','دفعات بدور التطبيق',4,'$D1');
  update products set stock = 6 where id = '${L}10';
  update products set expiry_date = '$D2' where id = '${L}10';
  commit;" 2>&1 >/dev/null && echo OK) || true
chk "**حفظُ مادةٍ بدور التطبيق** (إضافة، رصيد، تاريخ) يمرّ والدوالُّ الداخلية ممنوعةٌ عليه" "select '$out'" "OK"
chk "  ودفعتُها بالرصيد الجديد والتاريخ المعدَّل" \
    "select string_agg(qty::int||':'||expiry_date, ',') from product_lots where product_id='${L}10'" "6:$D2"
chk "  والداخليّةُ ممنوعةٌ فعلاً (كالإنتاج)" \
    "select has_function_privilege('authenticated','public.lots_reconcile(uuid,boolean)','execute')::text" "false"
# شراءٌ بلا تاريخ لمادةٍ تاريخُها فات: لا يرث المنتهي
$P -c "insert into products (id, clinic_id, name, stock, expiry_date) values ('${L}11','$C1','دفعات بلا تاريخ',2,'$DX') on conflict (id) do nothing;" >/dev/null
$P -c "select set_config('request.jwt.claim.sub','$C1',false);
       select record_purchase(jsonb_build_array(jsonb_build_object('product_id','${L}11','name','دفعات بلا تاريخ','qty',5,'purchase_price',1,'sell_price',0)),
         jsonb_build_object('company_name','شركة بلا تاريخ'));" >/dev/null
chk "شراءٌ بلا تاريخ لا يرث تاريخاً فات (بضاعةٌ جديدة لا تصل منتهية)" \
    "select coalesce(expiry_date::text,'-') from product_lots where product_id='${L}11' and source='purchase'" "-"
chk "  والمادةُ فيها منتهٍ وجديد: تاريخُها لا يصير المنتهي (الأقربُ الصالحُ أوّلاً)" \
    "select coalesce(expiry_date::text,'-') from products where id='${L}11'" "$DX"
# (الوحيدُ المؤرَّخ منتهٍ هنا فيبقى — لا صالحَ مؤرَّخاً يتقدّمه. والمادةُ «ب» تثبت القاعدة:)
chk "  وبدفعةٍ صالحةٍ مؤرَّخة: المادةُ تأخذ الصالحة والمنتهيةُ تبقى ظاهرةً بدفعتها" \
    "select (select expiry_date::text from products where id='${L}02')||'|'||(select count(*) from product_lots where product_id='${L}02' and qty>0 and expiry_date < current_date)" "$D9|0"
# تاريخٌ صحّحته العيادةُ لا يمحوه تعديلُ الفاتورة
$P -c "insert into products (id, clinic_id, name, stock) values ('${L}12','$C1','دفعات مصحّحة',0) on conflict (id) do nothing;
       select set_config('request.jwt.claim.sub','$C1',false);
       select record_purchase(jsonb_build_array(jsonb_build_object('product_id','${L}12','name','دفعات مصحّحة','qty',5,'purchase_price',1,'sell_price',0,'expiry_date','$D2')),
         jsonb_build_object('company_name','شركة التصحيح'));" >/dev/null
$P -c "select set_config('request.jwt.claim.sub','$C1',false); select lot_edit((select id from product_lots where product_id='${L}12'), '$D3');" >/dev/null
$P -c "select set_config('request.jwt.claim.sub','$C1',false);
       select update_purchase((select id from purchases where company_name='شركة التصحيح' and clinic_id='$C1'),
         jsonb_build_array(jsonb_build_object('product_id','${L}12','name','دفعات مصحّحة','qty',6,'purchase_price',1,'sell_price',0,'expiry_date','$D2')),
         jsonb_build_object('company_name','شركة التصحيح'));" >/dev/null
chk "تاريخٌ صحّحته العيادةُ لا يكتب فوقه تعديلُ الفاتورة (والكميةُ تتعدّل)" \
    "select qty::int||':'||expiry_date from product_lots where product_id='${L}12'" "6:$D3"
# دمجُ التوأمين ينقل الدفعةَ بباقيها
$P -c "insert into products (id, clinic_id, name, stock, expiry_date) values ('${L}13','$C1','توأم يبقى',3,'$D2'), ('${L}14','$C1','توأم يُطوى',0,null) on conflict (id) do nothing;
       select set_config('request.jwt.claim.sub','$C1',false);
       select record_purchase(jsonb_build_array(jsonb_build_object('product_id','${L}14','name','توأم يُطوى','qty',10,'purchase_price',1,'sell_price',0,'expiry_date','$D4')),
         jsonb_build_object('company_name','شركة التوأم'));" >/dev/null
$P -c "update products set stock = 4 where id = '${L}14';" >/dev/null
$P -c "select set_config('request.jwt.claim.sub','$C1',false); select merge_products('${L}13','${L}14');" >/dev/null
chk "دمجُ التوأمين ينقل دفعةَ الشراء **بباقيها** (٤ لا ١٠) ولا يمسّ دفعات الباقي" \
    "select string_agg(source||':'||qty::int||':'||expiry_date, ',' order by expiry_date) from product_lots where product_id='${L}13' and qty>0" "purchase:4:$D4,opening:3:$D2"
# صارت مجمَّعة: دفعاتُها تزول
$P -c "update products set pooled = true, stock = 0 where id = '${L}12';" >/dev/null
chk "مادةٌ صارت مجمَّعة تفقد دفعاتها (لا رصيدَ وهميّ بالمراقبة)" \
    "select count(*)::text from product_lots where product_id='${L}12'" "0"
chk "**والتطابقُ ما زال تامّاً** بالحزمة كلّها" \
    "select count(*)::text from products p where not coalesce(p.pooled,false) and p.farm_id is null and coalesce(p.stock,0) <> (select coalesce(sum(qty),0) from product_lots l where l.product_id=p.id)" "0"

# ── 0218: قوالبُ الواتساب الخاصة بالعيادة ────────────────────────────────────
echo "▸ 0218: قوالب الواتساب"
chk "العيادةُ تحفظ قالبها بدور authenticated" \
    "select _rls_try('$C1', 'insert into wa_templates (title, body) values (''عرض الصيف'', ''هلا {{اسم_المالك}}، خصم على لقاح {{اسم_الحيوان}}'')')" "rows:1"
chk "  والاستقبالُ من نفس العيادة يحفظ ويقرأ" \
    "select _rls_try('$RCP', 'insert into wa_templates (title, body) values (''تذكير بأسلوبنا'', ''نص'')')||'|'||_rls_try('$RCP', 'select 1 from wa_templates')" "rows:1|rows:2"
chk "  وعيادةٌ أخرى لا تراها ولا تعدّلها ولا تحذفها" \
    "select _rls_try('$C2', 'select 1 from wa_templates')||'|'||_rls_try('$C2', 'update wa_templates set body = ''x''')||'|'||_rls_try('$C2', 'delete from wa_templates')" "rows:0|rows:0|rows:0"
chk "  ولا تكتب قالباً باسم عيادةٍ غيرها" \
    "select left(_rls_try('$C2', 'insert into wa_templates (clinic_id, title, body) values (''$C1'', ''دسّ'', ''x'')'), 13)" "guarded:42501"
chk "عنوانٌ فارغ يُرفض" \
    "select left(_rls_try('$C1', 'insert into wa_templates (title, body) values (''  '', ''x'')'), 13)" "guarded:23514"
chk "التعديلُ يختم «آخر تعديل» ولا ينقل القالبَ لعيادةٍ أخرى" \
    "select _rls_try('$C1', 'update wa_templates set body = ''نص معدّل'' where title = ''عرض الصيف''')||'|'||split_part(_rls_try('$C1', 'update wa_templates set clinic_id = ''$C2'' where title = ''عرض الصيف'''), ':', 1)" "rows:1|guarded"
$P -c "insert into wa_templates (clinic_id, title, body) select '$C2', 'ق'||g, 'نص' from generate_series(1,100) g;" >/dev/null
chk "سقفُ ١٠٠ قالبٍ للعيادة (بهينت عربيّ)" \
    "select split_part(_rls_try('$C2', 'insert into wa_templates (title, body) values (''١٠١'', ''x'')'), ':', 3)" "wa_templates_full"
chk "ولا شيءَ منها لـanon" \
    "select has_table_privilege('anon','public.wa_templates','select')::text" "false"

# ── 0219/0220: الأقفاصُ صفوفٌ مختومةٌ بعياداتها ─────────────────────────────
# الجذرُ المقيس: رسمةُ عيادةٍ عبرت لأخرى من الباب الشرعيّ. فالفحوصُ هنا كلُّها
# بدور `authenticated` (الحزمةُ superuser تتجاوز RLS فلا ترى هذا الصنف أصلاً).
echo "▸ 0219: الأقفاص صفوف — عزلٌ وذرّيةٌ وإشغال"
C1=11111111-1111-1111-1111-111111111111
C2=22222222-2222-2222-2222-222222222222
C3=44444444-4444-4444-4444-444444444444
C4=66666666-6666-6666-6666-666666666666
K=a0000000-0219-4000-8000-0000000000
$P -c "create or replace function _cops(who uuid, ops text) returns text language sql as \$fn\$
         select _rls_try(who, format('select cage_layout_apply(%L::uuid, %L::jsonb)', who, ops)) \$fn\$;
       create or replace function _cops_as(who uuid, stamp uuid, ops text) returns text language sql as \$fn\$
         select _rls_try(who, format('select cage_layout_apply(%L::uuid, %L::jsonb)', stamp, ops)) \$fn\$;
       insert into pets(id, name, clinic_id) values
         ('b0000000-0219-4000-8000-000000000001','لولو','$C1'),
         ('b0000000-0219-4000-8000-000000000002','ميشو','$C1'),
         ('b0000000-0219-4000-8000-000000000003','بسبس','$C1'),
         ('b0000000-0219-4000-8000-000000000004','سكر','$C3') on conflict do nothing;" >/dev/null

chk "العيادةُ ترسم غرفةً وثلاثة أقفاص بدفعةٍ واحدة" \
    "select _cops('$C1', '[{\"op\":\"room_insert\",\"id\":\"${K}b1\",\"name\":\"الفندقة\",\"x\":0,\"z\":0,\"w\":4,\"d\":1},
       {\"op\":\"cage_insert\",\"id\":\"${K}c1\",\"room_id\":\"${K}b1\",\"code\":\"101\",\"x\":0,\"z\":0},
       {\"op\":\"cage_insert\",\"id\":\"${K}c2\",\"room_id\":\"${K}b1\",\"code\":\"102\",\"x\":1,\"z\":0},
       {\"op\":\"cage_insert\",\"id\":\"${K}c3\",\"room_id\":\"${K}b1\",\"code\":\"103\",\"x\":2,\"z\":0,\"color\":\"#22d3ee\",\"facing\":2}]')" "rows:1"
chk "  والصفوفُ مختومةٌ بعيادتها" \
    "select count(*)::text from cages where clinic_id='$C1' and id::text like 'a0000000-0219%'" "3"
chk "عيادةٌ أخرى لا ترى أقفاصها ولا تعدّلها ولا تحذفها" \
    "select _rls_try('$C2', 'select 1 from cages')||'|'||_rls_try('$C2', 'update cages set code = ''x''')||'|'||_rls_try('$C2', 'delete from cages')" "rows:0|rows:0|rows:0"
chk "  ولا تُدخل قفصاً باسمها" \
    "select split_part(_rls_try('$C2', 'insert into cages (clinic_id, room_id, code) values (''$C1'', ''${K}b1'', ''دسّ'')'), ':', 1)" "guarded"
chk "  ولا تعلّق قفصها بغرفة عيادةٍ غيرها" \
    "select _cops('$C2', '[{\"op\":\"room_insert\",\"id\":\"${K}b2\",\"name\":\"غرفة C2\",\"x\":0,\"z\":0,\"w\":1,\"d\":1},{\"op\":\"cage_insert\",\"id\":\"${K}c9\",\"room_id\":\"${K}b1\",\"code\":\"901\",\"x\":0,\"z\":0}]')" \
    "guarded:P0001:room_cross_clinic"
chk "  ولا تحدّث صفَّ عيادةٍ أخرى عبر الدفعة (يُرفض لا يُعاد خلقُه)" \
    "select _cops('$C2', '[{\"op\":\"cage_update\",\"id\":\"${K}c1\",\"room_id\":\"${K}b1\",\"code\":\"666\",\"x\":0,\"z\":0}]')" \
    "guarded:P0001:cage_row_gone"
chk "  والرفضُ ذرّيّ: غرفةُ الدفعة المرفوضة ما انكتبت" \
    "select count(*)::text from cage_rooms where id='${K}b2'" "0"
chk "العيادةُ لا تُنقل (clinic_id مجمَّد)" \
    "select split_part(_rls_try('$C1', 'update cages set clinic_id = ''$C2'' where id = ''${K}c1'''), ':', 1)" "guarded"
# **هذا هو الفحصُ الذي يقتل العبور**: هويّةُ الجلسة تبدّلت عمّا قُرئ منه.
chk "دفعةٌ مختومةٌ بعيادةٍ غير عيادة الجلسة ⇒ تُرفض كلُّها بصوت" \
    "select _cops_as('$C1', '$C2', '[{\"op\":\"cage_insert\",\"id\":\"${K}c8\",\"room_id\":\"${K}b1\",\"code\":\"888\",\"x\":3,\"z\":0}]')" \
    "guarded:P0001:clinic_switched"
chk "رقمٌ توأم (بتطبيع المسافة والحرف) يُرفض بالاسم" \
    "select _cops('$C1', '[{\"op\":\"cage_insert\",\"id\":\"${K}c8\",\"room_id\":\"${K}b1\",\"code\":\"  101 \",\"x\":3,\"z\":0}]')" \
    "guarded:P0001:code_twin"
chk "خانةٌ مشغولة بقفص يُرفض إدراجُ ثانٍ فيها" \
    "select _cops('$C1', '[{\"op\":\"cage_insert\",\"id\":\"${K}c8\",\"room_id\":\"${K}b1\",\"code\":\"888\",\"x\":0,\"z\":0}]')" \
    "guarded:P0001:cage_cell_taken"
chk "قفصٌ خارج حدود غرفته يُرفض بالاسم (لا قفصَ يطفو بلا غرفة)" \
    "select _cops('$C1', '[{\"op\":\"cage_insert\",\"id\":\"${K}c8\",\"room_id\":\"${K}b1\",\"code\":\"888\",\"x\":9,\"z\":9}]')" \
    "guarded:P0001:cage_outside_room"
chk "تصغيرُ غرفةٍ يقصّ أقفاصها يُرفض — ولو جاء من جهازٍ ثانٍ بنفس اللحظة" \
    "select _cops('$C1', '[{\"op\":\"room_update\",\"id\":\"${K}b1\",\"name\":\"الفندقة\",\"x\":0,\"z\":0,\"w\":1,\"d\":1}]')" \
    "guarded:P0001:room_cuts_cages"
chk "تبادلُ رقمين (١٠١↔١٠٢) **ينجح** بمعاملةٍ واحدة" \
    "select _cops('$C1', '[{\"op\":\"cage_update\",\"id\":\"${K}c1\",\"room_id\":\"${K}b1\",\"code\":\"102\",\"x\":0,\"z\":0},{\"op\":\"cage_update\",\"id\":\"${K}c2\",\"room_id\":\"${K}b1\",\"code\":\"101\",\"x\":1,\"z\":0}]')" "rows:1"
chk "  والرقمان تبادلا فعلاً" \
    "select string_agg(code, ',' order by x) from cages where room_id='${K}b1'" "102,101,103"
chk "تحديثُ قفصٍ انحذف من جهازٍ ثانٍ ⇒ يُرفض لا يُعاد خلقُه" \
    "select _cops('$C1', '[{\"op\":\"cage_update\",\"id\":\"${K}ff\",\"room_id\":\"${K}b1\",\"code\":\"555\",\"x\":3,\"z\":0}]')" \
    "guarded:P0001:cage_row_gone"

echo "▸ 0219: الإقامةُ ↔ القفص — بابٌ واحد وساكنٌ واحد"
A=c0000000-0219-4000-8000-00000000000
chk "حالةٌ جديدة برقم قفص ترتبط به بمعرّفه" \
    "select _rls_try('$C1', 'insert into admissions (id, pet_id, cage) values (''${A}1'', ''b0000000-0219-4000-8000-000000000001'', ''101'')')" "rows:1"
chk "  والمعرّفُ هو القفصُ الذي رقمُه ١٠١ **الآن** (بعد التبادل)" \
    "select (cage_id = '${K}c2')::text from admissions where id='${A}1'" "true"
chk "حالةٌ جديدة بقفصٍ مسكون ⇒ تنكتب «بلا قفص» (رفضُها كان يُكرّر ملفَّ الحيوان عند إعادة الحفظ)" \
    "select _rls_try('$C1', 'insert into admissions (id, pet_id, cage) values (''${A}5'', ''b0000000-0219-4000-8000-000000000002'', ''101'')')" "rows:1"
chk "  بلا رقمٍ ولا معرّف — ولا تستولي على قفص الساكن" \
    "select coalesce(cage, 'null')||':'||coalesce(cage_id::text, 'null') from admissions where id='${A}5'" "null:null"
chk "والقفصُ الفاضي يقبله" \
    "select _rls_try('$C1', 'insert into admissions (id, pet_id, cage) values (''${A}2'', ''b0000000-0219-4000-8000-000000000002'', ''102'')')" "rows:1"
chk "المعرّفُ لا يُكتب مباشرة من المتصفّح (بابٌ واحد)" \
    "select _rls_try('$C1', 'update admissions set cage_id = ''${K}c3'' where id = ''${A}1''')" "guarded:P0001:cage_id_direct_write"
chk "نقلٌ لقفصٍ مسكون يُرفض بالاسم" \
    "select split_part(_rls_try('$C1', 'update admissions set cage = ''102'' where id = ''${A}1'''), ':', 3)" "cage_occupied"
chk "ونقلٌ لقفصٍ فاضي يمرّ" \
    "select _rls_try('$C1', 'update admissions set cage = ''103'' where id = ''${A}1''')" "rows:1"
chk "  ويُسجَّل **حركةً واحدة** بالضبط" \
    "select count(*)::text from pet_movements where admission_id='${A}1' and event='cage_changed'" "1"
chk "تسميةُ القفص تمرّ" \
    "select _cops('$C1', '[{\"op\":\"cage_update\",\"id\":\"${K}c3\",\"room_id\":\"${K}b1\",\"code\":\"301\",\"x\":2,\"z\":0,\"color\":\"#22d3ee\",\"facing\":2}]')" "rows:1"
chk "  وتجرّ نصَّ ساكنه معها (لا رقعَ من المتصفّح)" \
    "select cage||':'||(cage_id='${K}c3')::text from admissions where id='${A}1'" "301:true"
chk "  **والحيوانُ لم يتحرّك**: لا حركةَ جديدة بسجلّه" \
    "select count(*)::text from pet_movements where admission_id='${A}1' and event='cage_changed'" "1"
chk "  وتبادلُ رقمين تحت ساكنٍ يمرّ" \
    "select _cops('$C1', '[{\"op\":\"cage_update\",\"id\":\"${K}c1\",\"room_id\":\"${K}b1\",\"code\":\"101\",\"x\":0,\"z\":0},{\"op\":\"cage_update\",\"id\":\"${K}c2\",\"room_id\":\"${K}b1\",\"code\":\"102\",\"x\":1,\"z\":0}]')" "rows:1"
chk "  بلا حركاتٍ وهمية (~…) ولا حركةٍ للساكن" \
    "select (select count(*) from pet_movements where to_cage like '~%' or from_cage like '~%')||':'||(select count(*) from pet_movements where admission_id='${A}2' and event='cage_changed')" "0:0"
chk "  والساكنُ بقي بقفصه (بمعرّفه) ونصُّه صار رقمَ القفص الجديد" \
    "select cage||':'||(cage_id='${K}c1')::text from admissions where id='${A}2'" "101:true"
chk "حذفُ قفصٍ مسكون يُرفض — من أيّ عميلٍ كان" \
    "select split_part(_cops('$C1', '[{\"op\":\"cage_delete\",\"id\":\"${K}c3\"}]'), ':', 3)" "cage_occupied_delete"
chk "  وحذفٌ مباشر كذلك" \
    "select split_part(_rls_try('$C1', 'delete from cages where id = ''${K}c3'''), ':', 3)" "cage_occupied_delete"
chk "حذفُ غرفةٍ فيها أقفاص يُرفض" \
    "select split_part(_rls_try('$C1', 'delete from cage_rooms where id = ''${K}b1'''), ':', 3)" "room_not_empty"
chk "التخريجُ يفرّغ القفص، والترقيدُ بعده يمرّ" \
    "select _rls_try('$C1', 'update admissions set status = ''discharged'' where id = ''${A}1''')||'|'||_rls_try('$C1', 'insert into admissions (id, pet_id, cage) values (''${A}3'', ''b0000000-0219-4000-8000-000000000003'', ''301'')')" "rows:1|rows:1"
chk "إعادةُ تفعيل المُخرَج وقفصُه مسكون تمرّ (لا تُفشل تغييرَ الحالة)" \
    "select _rls_try('$C1', 'update admissions set status = ''active'' where id = ''${A}1''')" "rows:1"
chk "  ويرجع «بلا قفص» ولا يستولي على قفص غيره" \
    "select coalesce(cage_id::text, 'null')||':'||coalesce(cage, 'null') from admissions where id='${A}1'" "null:null"
chk "رقمٌ غير مرسوم = يتيمٌ مرئيّ لا رفض" \
    "select _rls_try('$C1', 'update admissions set cage = ''999'' where id = ''${A}1''')" "rows:1"
chk "  بلا معرّف" "select coalesce(cage_id::text, 'null') from admissions where id='${A}1'" "null"
chk "  ورسمُ قفصٍ بنفس الرقم يمرّ" \
    "select _cops('$C1', '[{\"op\":\"cage_insert\",\"id\":\"${K}c4\",\"room_id\":\"${K}b1\",\"code\":\"999\",\"x\":3,\"z\":0}]')" "rows:1"
chk "  ويربط اليتيمَ به تلقائياً" "select (cage_id='${K}c4')::text from admissions where id='${A}1'" "true"
chk "نقلُ ساكنٍ مربوطٍ إلى رقمٍ غير مرسوم يُرفض (حزمةٌ قديمة تعيد التسمية ويُرفض حفظُ رسمتها)" \
    "select split_part(_rls_try('$C1', 'update admissions set cage = ''555'' where id = ''${A}2'''), ':', 3)" "cage_not_drawn"
chk "  والساكنُ بقي بقفصه" "select cage||':'||(cage_id='${K}c1')::text from admissions where id='${A}2'" "101:true"
$P -c "select set_config('request.jwt.claim.sub','$C1',false);
       insert into admissions (id, pet_id, clinic_id, cage) values ('${A}6', 'b0000000-0219-4000-8000-000000000003', '$C1', '888');" >/dev/null
chk "قفصٌ مسكون لا يأخذ رقماً مكتوباً على راقدٍ غير مربوط (راقدان برقمٍ واحد يُخفي أحدَهما)" \
    "select _cops('$C1', '[{\"op\":\"cage_update\",\"id\":\"${K}c1\",\"room_id\":\"${K}b1\",\"code\":\"888\",\"x\":0,\"z\":0}]')" \
    "guarded:P0001:code_held_by_orphan"
# إقامةٌ خرجت قبل 0219: نصُّها باقٍ ومعرّفُها فارغ. سحبةُ الكانبان تعيدها بلا لمس النصّ.
$P -c "insert into admissions (id, pet_id, clinic_id, cage, status) values ('${A}7', 'b0000000-0219-4000-8000-000000000003', '$C1', '999', 'discharged');
       update admissions set cage_id = null where id = '${A}7';" >/dev/null
chk "إعادةُ تفعيل إقامةٍ من قبل 0219 وقفصُها مسكون تمرّ" \
    "select _rls_try('$C1', 'update admissions set status = ''active'' where id = ''${A}7''')" "rows:1"
chk "  **وترجع بلا قفص** — لا راقدان برقمٍ واحد يختفي أحدُهما" \
    "select coalesce(cage, 'null')||':'||coalesce(cage_id::text, 'null') from admissions where id='${A}7'" "null:null"
$P -c "insert into cage_rooms (clinic_id, name) select '$C2', 'غ'||g from generate_series(1, 40) g;" >/dev/null
chk "سقفُ الغرف (٤٠) بجملةٍ عربية" \
    "select _cops('$C2', '[{\"op\":\"room_insert\",\"id\":\"${K}b3\",\"name\":\"الـ٤١\",\"x\":0,\"z\":0,\"w\":1,\"d\":1}]')" "guarded:P0001:too_many_rooms"
chk "cage_layout_apply بصلاحية المُستدعي وبمسارٍ مثبَّت، ممنوعةٌ عن anon" \
    "select (not p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%' and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))::text from pg_proc p where p.proname='cage_layout_apply'" "true"
chk "حرّاسُ الصفوف كلُّهم invoker (لا يشدّون أكثر من السياسة)" \
    "select bool_and(not p.prosecdef)::text from pg_proc p where p.proname in ('cage_rooms_guard','cages_guard','cages_delete_guard','cage_rooms_delete_guard','cages_sync_admissions','admissions_cage_link')" "true"
chk "والفهرسُ الفريد للإشغال قائمٌ بشرطه" \
    "select count(*)::text from pg_indexes where indexname='adm_one_active_per_cage' and indexdef like '%status = ''active''%'" "1"

echo "▸ 0220: الترحيل من الرسمة للصفوف — مرآةُ parseLayout حرفاً"
# v1 بعيادة C3: رمزٌ مكرّر بالغرفة وبين غرفتين، رمزٌ فارغ، غرفةٌ بلا معرّف، ٧ رموز
# تلتفّ لصفٍّ ثانٍ. وإقامةٌ نشطة برقمٍ موجود قبل الترحيل.
$P -c "insert into clinic_prefs (clinic_id) select '$C3' where not exists (select 1 from clinic_prefs where clinic_id='$C3');
       update clinic_prefs set cage_layout = '[{\"id\":\"r1\",\"name\":\"الإقامة\",\"cages\":[\"101\",\"102\",\" 101 \",\"\",\"103\",\"104\",\"105\",\"106\",\"107\"]},{\"id\":\"r2\",\"name\":\"العزل\",\"cages\":[\"103\",\"201\"]},{\"id\":\"\",\"name\":\"ساقطة\",\"cages\":[\"301\"]}]' where clinic_id = '$C3';
       insert into admissions (id, pet_id, clinic_id, cage) values ('${A}9', 'b0000000-0219-4000-8000-000000000004', '$C3', '105');
       select backfill_cage_layout('$C3');" >/dev/null
chk "v1: غرفتان (بلا المعرّف سقطت بقفصها)" "select count(*)::text from cage_rooms where clinic_id='$C3'" "2"
chk "v1: ثمانية أقفاص (المكرَّرُ والفارغ سقطا)" "select count(*)::text from cages where clinic_id='$C3'" "8"
chk "v1: الهندسةُ مرآةُ upgradeV1 — ١٠٧ يلتفّ للصفّ الثاني" \
    "select x||'/'||z from cages where clinic_id='$C3' and code='107'" "0/1"
chk "v1: غرفةُ العزل بعد فجوة خليّة (٦+١)" "select x::text from cage_rooms where clinic_id='$C3' and name='العزل'" "7"
chk "v1: ٢٠١ بأرض العزل وبغرفتها" \
    "select c.x||'/'||c.z||'/'||r.name from cages c join cage_rooms r on r.id=c.room_id where c.clinic_id='$C3' and c.code='201'" "7/0/العزل"
chk "الإقامةُ النشطة ارتبطت بقفصها أثناء الترحيل" \
    "select (a.cage_id = c.id)::text from admissions a join cages c on c.clinic_id=a.clinic_id and c.code='105' where a.id='${A}9'" "true"
# v2 بعيادة C4: باب، لون، اتجاه وطابق، توأمٌ بحرفٍ مختلف، أرقامٌ نصّية وخردة، rev مضمَّن.
$P -c "insert into clinic_prefs (clinic_id) select '$C4' where not exists (select 1 from clinic_prefs where clinic_id='$C4');
       update clinic_prefs set cage_layout = '{\"v\":2,\"rev\":77,\"rooms\":[{\"id\":\"r1\",\"name\":\"فندقة\",\"x\":2,\"z\":0,\"w\":\"3\",\"d\":2,\"door\":{\"side\":\"left\",\"at\":1}}],\"cages\":[{\"code\":\"A1\",\"x\":2,\"z\":0,\"color\":\"#f00\",\"facing\":2,\"level\":1},{\"code\":\"a1\",\"x\":3,\"z\":0},{\"code\":\"\"},{\"code\":\"B2\",\"x\":\"junk\",\"z\":1,\"facing\":9},{\"code\":\"Z9\",\"x\":40,\"z\":7}]}' where clinic_id = '$C4';
       select backfill_cage_layout('$C4');" >/dev/null
chk "v2: عرضٌ نصّيٌّ رقمي وبابٌ يسار/١" "select w||'/'||d||'/'||door_side||'/'||door_at from cage_rooms where clinic_id='$C4' and name='فندقة'" "3/2/left/1"
chk "v2: ثلاثة أقفاص (التوأمُ a1 والفارغ سقطا)" "select count(*)::text from cages where clinic_id='$C4'" "3"
chk "v2: A1 بلونه واتجاهه وطابقه" "select color||'/'||facing||'/'||level from cages where clinic_id='$C4' and code='A1'" "#f00/2/1"
chk "v2: x خردة ⇒ ٠، واتجاهٌ ٩ ⇒ ٠" "select x||'/'||facing from cages where clinic_id='$C4' and code='B2'" "0/0"
chk "v2: قفصٌ خارج كلّ غرفة ⇒ غرفةٌ «غير مصنّفة» تحويه (لا يضيع)" \
    "select r.name||':'||(c.x >= r.x and c.x < r.x+r.w and c.z >= r.z and c.z < r.z+r.d)::text from cages c join cage_rooms r on r.id=c.room_id where c.clinic_id='$C4' and c.code='Z9'" "غيرمصنّفة:true"
$P -c "insert into auth.users(id) values ('77777777-0220-4000-8000-000000000001') on conflict do nothing;
       insert into clinic_prefs (clinic_id, cage_layout) values ('77777777-0220-4000-8000-000000000001', 'x{') on conflict do nothing;" >/dev/null
chk "خردة = صفرُ صفوف وسطرٌ بالتقرير (لا بذرة)" \
    "select (backfill_cage_layout('77777777-0220-4000-8000-000000000001')->0->>'skipped')||':'||(select count(*) from cages where clinic_id='77777777-0220-4000-8000-000000000001')" "bad_json:0"
$P -c "update cages set color = '#0f0' where clinic_id='$C3' and code='101'; select backfill_cage_layout(null);" >/dev/null
chk "إعادةُ الترحيل لا تكرّر" "select count(*)::text from cages where clinic_id='$C3'" "8"
chk "  ولا تدهس تعديلاً على الصفوف" "select color from cages where clinic_id='$C3' and code='101'" "#0f0"
chk "وشبكةُ ربط الإقامات تنعاد بعد قيام الفهرس بلا خطأ" \
    "select (backfill_admission_cages(null)->>'linked')" "0"
# المنحُ الشامل بالحزمة أعاد ما نزعته 0220 — نُعيدها لتستردّ سلطتها ثم نقيس.
$P -f "$MIG/0220_cage_backfill.sql" >/dev/null 2>&1
chk "دوالُّ الترحيل ممنوعةٌ عن دور العيادة" \
    "select bool_and(not has_function_privilege('authenticated', p.oid, 'execute'))::text from pg_proc p where p.proname in ('backfill_cage_layout','backfill_admission_cages','_cage_bf_int','_cage_bf_str')" "true"


# ── 0221: أدويةُ الطبيب المفضّلة ─────────────────────────────────────────────
# للطبيب داخل عيادته: زميلُه بنفس العيادة لا يراها، وعيادةٌ أخرى كذلك.
echo "▸ 0221: الأدوية المفضّلة"
C1=11111111-1111-1111-1111-111111111111
C2=22222222-2222-2222-2222-222222222222
chk "الطبيبُ يحفظ دواءً مفضّلاً بدور authenticated" \
    "select _rls_try('$C1', 'insert into drug_favorites (name) values (''  Ceftriaxone  '')')" "rows:1"
chk "  مختوماً بهويّته وعيادته، والاسمُ مقصوص" \
    "select (user_id = '$C1' and clinic_id = '$C1' and name = 'Ceftriaxone')::text from drug_favorites where name ilike '%ceftriaxone%'" "true"
chk "  ويقرؤه" \
    "select _rls_try('$C1', 'select 1 from drug_favorites')" "rows:1"
chk "نفسُ الدواء بحالة أحرفٍ أخرى لا يتكرّر" \
    "select left(_rls_try('$C1', 'insert into drug_favorites (name) values (''ceftriaxone'')'), 13)" "guarded:23505"
chk "زميلُه بنفس العيادة لا يرى قائمته ولا يشيل منها" \
    "select _rls_try('$RCP', 'select 1 from drug_favorites')||'|'||_rls_try('$RCP', 'delete from drug_favorites')" "rows:0|rows:0"
chk "  وله قائمتُه هو" \
    "select _rls_try('$RCP', 'insert into drug_favorites (name) values (''Ceftriaxone'')')||'|'||_rls_try('$RCP', 'select 1 from drug_favorites')" "rows:1|rows:1"
chk "عيادةٌ أخرى لا تراها ولا تكتب باسم غيرها" \
    "select _rls_try('$C2', 'select 1 from drug_favorites')||'|'||left(_rls_try('$C2', 'insert into drug_favorites (user_id, name) values (''$C1'', ''x'')'), 13)" "rows:0|guarded:42501"
# بلا سياسةِ تحديث: RLS لا تمرّر صفّاً مهما كانت الصلاحية (الإنتاجُ ينزعها أصلاً).
chk "ولا تعديل (تُضاف أو تُشال فقط) — ولا صفّ يتغيّر" \
    "select _rls_try('$C1', 'update drug_favorites set name = ''y''')||'|'||(select count(*) from drug_favorites where name = 'y')::text" "rows:0|0"
chk "الطبيبُ يشيل مفضّلته" \
    "select _rls_try('$C1', 'delete from drug_favorites where lower(name) = ''ceftriaxone''')" "rows:1"
chk "اسمٌ فارغ يُرفض" \
    "select left(_rls_try('$C1', 'insert into drug_favorites (name) values (''  '')'), 13)" "guarded:23514"
$P -c "insert into drug_favorites (clinic_id, user_id, name) select '$C2', '$C2', 'دواء '||g from generate_series(1,150) g;" >/dev/null
chk "سقفُ ١٥٠ للطبيب (بهينت عربيّ)" \
    "select split_part(_rls_try('$C2', 'insert into drug_favorites (name) values (''z'')'), ':', 3)" "drug_favorites_full"
chk "ولا شيءَ منها لـanon" \
    "select has_table_privilege('anon','public.drug_favorites','select')::text" "false"

# ── 0222: موظّفُ التصوير — قفلٌ من الخادم ───────────────────────────────────
# السياجُ بدور authenticated (الحزمةُ superuser تتجاوز RLS)، والبوّابةُ بمحاكاة
# `request.path` كما تضعها PostgREST قبل النداء.
echo "▸ 0222: موظف التصوير"
C1=11111111-1111-1111-1111-111111111111
C2=22222222-2222-2222-2222-222222222222
PHO=88888888-8888-8888-8888-888888888888
PP=a0000000-0222-4000-8000-0000000000
$P -c "insert into memberships(user_id,clinic_id,role,status) values ('$PHO','$C1','photographer','active') on conflict do nothing;
       insert into staff(id, clinic_id, name, user_id, role, permissions) values ('${PP}f1','$C1','المصوّر','$PHO','photographer','{}') on conflict do nothing;
       insert into products(id, clinic_id, name, barcode, stock, purchase_price, sell_price) values
         ('${PP}01','$C1','رويال كانين','690001',5, 9000, 12000),
         ('${PP}02','$C2','منتج عيادة ثانية','690002',3, 1000, 2000) on conflict do nothing;
       insert into invoices(id, clinic_id) values ('${PP}a1','$C1') on conflict do nothing;
       insert into store_profiles (clinic_id, slug, enabled) values ('$C1','phostore',true) on conflict (clinic_id) do nothing;" >/dev/null
chk "كلُّ جدولٍ بسياسات عليه سياجُ المصوّر (لا جدولَ منسيّ)" \
    "select coalesce(string_agg(t, ','), '') from verify_photographer_fence() t" ""
chk "المصوّرُ دورُه photographer بالخادم" \
    "select _pf('$PHO', 'select auth_role()')" "photographer"
chk "لا يرى الفواتير ولا المنتجات مباشرةً (سعرُ الشراء بها)" \
    "select _rls_try('$PHO', 'select 1 from invoices')||'|'||_rls_try('$PHO', 'select 1 from products')" "rows:0|rows:0"
chk "  ولا يكتب فاتورة" \
    "select left(_rls_try('$PHO', 'insert into invoices (clinic_id) values (''$C1'')'), 13)" "guarded:42501"
chk "  ويقرأ واجهةَ المتجر ولا يكتب إعدادَ العيادة" \
    "select (_rls_try('$PHO', 'select 1 from store_profiles') <> 'rows:0')::text||'|'||_rls_try('$PHO', 'update clinic_prefs set dial_code = dial_code')" "true|rows:0"
chk "  ويرى صفَّه وحده من الكادر" \
    "select _rls_try('$PHO', 'select 1 from staff')" "rows:1"
chk "والكادرُ الآخرُ لم يتغيّر عليه شي (الاستقبالُ يرى الفواتير)" \
    "select (_rls_try('$RCP', 'select 1 from invoices') <> 'rows:0')::text" "true"
chk "المصوّرُ يقرأ المنتجات من photo_products — بلا سعر شراء ولا منتجات عيادةٍ أخرى" \
    "select _pf('$PHO', 'select (jsonb_array_length(photo_products()) >= 1 and not (photo_products()->0 ? ''purchase_price'') and not exists (select 1 from jsonb_array_elements(photo_products()) e where e->>''id'' = ''${PP}02''))::text')" "true"
chk "ويضع صورةَ منتجٍ بمجلّد عيادته" \
    "select _rls_try('$PHO', 'select set_product_image(''${PP}01'', ''$C1/p-1.jpg'')')" "rows:1"
chk "  والمسارُ انحفظ فعلاً" \
    "select image_path from products where id='${PP}01'" "$C1/p-1.jpg"
chk "  ولا يضع مساراً من مجلّد عيادةٍ أخرى" \
    "select split_part(_rls_try('$PHO', 'select set_product_image(''${PP}01'', ''$C2/x.jpg'')'), ':', 3)" "bad_image_path"
chk "  ولا يلمس منتجَ عيادةٍ أخرى" \
    "select split_part(_rls_try('$PHO', 'select set_product_image(''${PP}02'', null)'), ':', 3)" "product_not_found"
chk "بلا إذن المتجر: لا ينشر ولا يعدّل واجهةَ المتجر" \
    "select split_part(_rls_try('$PHO', 'select store_set_visible(array[''${PP}01''::uuid], true)'), ':', 3)||'|'||_rls_try('$PHO', 'update store_profiles set enabled = true')" "not_authorized|rows:0"
$P -c "update staff set permissions = '{\"manageStore\": true}' where id = '${PP}f1';" >/dev/null
chk "بإذن «تحكّم كامل بالمتجر»: ينشر ويختار ويصف ويعدّل الواجهة" \
    "select _rls_try('$PHO', 'select store_set_visible(array[''${PP}01''::uuid], true)')||'|'||_rls_try('$PHO', 'select store_set_featured(''${PP}01'', true)')||'|'||_rls_try('$PHO', 'select store_set_desc(''${PP}01'', ''وصف'')')||'|'||_rls_try('$PHO', 'update store_profiles set enabled = true')" "rows:1|rows:1|rows:1|rows:1"
chk "  ولا يرى طلبات الزبائن حتى بالإذن" \
    "select _rls_try('$PHO', 'select 1 from store_orders')" "rows:0"
chk "  ولا يغيّر السعر (المنتجاتُ مسيَّجةٌ للكتابة)" \
    "select _rls_try('$PHO', 'update products set sell_price = 1 where id = ''${PP}01''')||'|'||(select sell_price::int::text from products where id='${PP}01')" "rows:0|12000"
chk "والاستقبالُ بلا إذن المتجر ما زال لا ينشر (لم يتّسع لغيره)" \
    "select split_part(_rls_try('$RCP', 'select store_set_visible(array[''${PP}01''::uuid], false)'), ':', 3)" "not_authorized"
$P -c "update staff set permissions = '{}' where id = '${PP}f1';" >/dev/null
# البوّابة: request.path كما تضعه PostgREST.
$P -c "create or replace function _gate(who uuid, path text) returns text language plpgsql as \$fn\$
         begin perform set_config('request.path', path, true);
               return _rls_try(who, 'select public.api_gate()'); end \$fn\$;" >/dev/null
chk "البوّابة: المصوّرُ لا ينادي دالّةً خارج قائمته (البيع، التقارير)" \
    "select split_part(_gate('$PHO', '/rpc/pos_checkout'), ':', 3)||'|'||split_part(_gate('$PHO', '/rpc/report_receipts_total'), ':', 3)" "photographer_forbidden|photographer_forbidden"
chk "  وينادي ما بقائمته (الإقلاع والصور)" \
    "select _gate('$PHO', '/rpc/my_workspace')||'|'||_gate('$PHO', '/rpc/set_product_image')" "rows:1|rows:1"
chk "  وغيرُه لا تمسّه أبداً، والجداولُ تمرّ للسياج" \
    "select _gate('$RCP', '/rpc/pos_checkout')||'|'||_gate('$C1', '/rpc/report_receipts_total')||'|'||_gate('$PHO', '/products')" "rows:1|rows:1|rows:1"

# ── ما أمسكه التدقيقُ العدائيّ قبل النشر ──
$P -c "insert into staff_elevations(user_id, clinic_id, until) values ('$PHO','$C1', now() + interval '10 minutes')
         on conflict (user_id) do update set until = excluded.until, clinic_id = excluded.clinic_id;" >/dev/null
chk "رفعُ PIN المدير لا يُطفئ السياج: المصوّرُ المرفوعُ ما زال لا يرى الفواتير" \
    "select _pf('$PHO', 'select auth_role()')||'|'||_rls_try('$PHO', 'select 1 from invoices')" "manager|rows:0"
chk "  ولا البوّابة" \
    "select split_part(_gate('$PHO', '/rpc/pos_checkout'), ':', 3)" "photographer_forbidden"
$P -c "delete from staff_elevations where user_id = '$PHO';" >/dev/null
chk "ولا يقرأ clinic_prefs (مرآةُ الـPIN بها)" \
    "select _rls_try('$PHO', 'select 1 from clinic_prefs')" "rows:0"
chk "البوّابةُ لا تفتح الرفعَ للمصوّر، وتطابق الاسمَ كاملاً لا بادئتَه" \
    "select split_part(_gate('$PHO', '/rpc/elevate_with_pin'), ':', 3)||'|'||split_part(_gate('$PHO', '/rpc/photo_products_all'), ':', 3)||'|'||_gate('$PHO', '/rpc/my_workspace/')" "photographer_forbidden|photographer_forbidden|rows:1"
chk "  ومنحُها لـservice_role صريح (خطّافُ وظائف الدفع)" \
    "select has_function_privilege('service_role', 'public.api_gate()', 'execute')::text" "true"
chk "المصوّرُ بلا إذن المتجر لا يرى السعرَ ولا الرصيد" \
    "select _pf('$PHO', 'select (photo_products()->0->>''sell_price'' is null and photo_products()->0->>''stock'' is null)::text')" "true"
$P -c "insert into staff(id, clinic_id, name, user_id, role, permissions) values ('${PP}f2','$C1','طبيب الفحص','$VET','veterinarian','{\"manageStore\": false}') on conflict (id) do update set permissions = excluded.permissions;" >/dev/null
chk "إطفاءُ المدير لإذن المتجر عن طبيبٍ يُحترم بالخادم" \
    "select split_part(_rls_try('$VET', 'select store_set_visible(array[''${PP}01''::uuid], true)'), ':', 3)" "not_authorized"
$P -c "update staff set permissions = '{}' where id = '${PP}f2';" >/dev/null
chk "  وبلا استثناء: قالبُ الطبيب يشمل المتجر" \
    "select _rls_try('$VET', 'select store_set_visible(array[''${PP}01''::uuid], true)')" "rows:1"
chk "لا عرضَ (view) ممنوحٌ للداخلين يتخطّى السياج" \
    "select count(*)::text from verify_photographer_fence() v where v like 'view:%'" "0"

# ── 0223: متى انكتب اللقاح ─────────────────────────────────────────────────
# سجلٌّ سابق (جرعةُ أيلول تُدخَل بتشرين) يُعرف بختم إدخاله، والقديمُ يبقى «لا نعرف».
echo "▸ 0223: ختمُ إدخال اللقاح"
VXP=a2230000-0000-0000-0000-000000000001
$P -c "insert into pets(id, name, clinic_id) values ('$VXP', 'لقاحات', '$C1') on conflict (id) do nothing;" >/dev/null
chk "العمودُ موجود: timestamptz يقبل الفراغ وافتراضيُّه now()" \
    "select data_type||'/'||is_nullable||'/'||column_default from information_schema.columns where table_name='vaccinations' and column_name='created_at'" "timestampwithtimezone/YES/now()"
chk "جرعةٌ سابقةٌ تُدخَل بدور authenticated تُختم بيوم إدخالها لا بيوم إعطائها" \
    "select _rls_try('$C1', 'insert into vaccinations (pet_id, name, status, administered_at, dose_number, doses_total) values (''$VXP'', ''Rabies'', ''administered'', current_date - 30, 1, null)')" "rows:1"
chk "  administered_at قبل أسابيع وcreated_at اليوم — والمجموعُ المجهول يبقى فارغاً لا ١" \
    "select (administered_at = current_date - 30 and created_at::date = current_date and doses_total is null)::text from vaccinations where pet_id='$VXP'" "true"
chk "عيادةٌ أخرى لا تكتب سجلاً سابقاً بملفّ غيرها" \
    "select left(_rls_try('$C2', 'insert into vaccinations (pet_id, name, clinic_id) values (''$VXP'', ''x'', ''$C1'')'), 13)" "guarded:42501"
$P -f "$MIG/0223_vaccination_recorded_at.sql" >/dev/null 2>&1
chk "والهجرةُ تنعاد بلا أثرٍ ثانٍ ولا تمسّ القيمَ المختومة" \
    "select count(*)::text from vaccinations where pet_id='$VXP' and created_at is not null" "1"

# ── 0224: دفترُ كلّ شركة ──────────────────────────────────────────────────
# رصيدٌ قبل النظام، وتسديدٌ على الحساب يُوزَّع بالقاعدة، وإلغاءٌ يردّ ما وزّعه —
# كلُّها بدور authenticated (الكتابةُ من الدوالّ وحدها، والجدولُ للقراءة).
echo "▸ 0224: دفترُ الشركة"
C1=11111111-1111-1111-1111-111111111111
C2=22222222-2222-2222-2222-222222222222
VET=55555555-5555-5555-5555-555555555555
RCP=77777777-7777-7777-7777-777777777777
LCO=a2240000-0000-4000-8000-000000000001
LKP=a2240000-0000-4000-8000-000000000002
LP1=a2240000-0000-4000-8000-0000000000a1
LP2=a2240000-0000-4000-8000-0000000000a2
$P -c "insert into companies (id, clinic_id, name) values ('$LCO','$C1','شركة الدفتر'), ('$LKP','$C1','شركة الدفتر الباقية') on conflict (id) do nothing;
       insert into purchases (id, clinic_id, company_id, company_name, total, amount_paid, status, purchased_at) values
         ('$LP1','$C1','$LCO','شركة الدفتر',100,40,'partial','2026-01-10 10:00+03'),
         ('$LP2','$C1','$LCO','شركة الدفتر',50,0,'unpaid','2026-02-01 10:00+03') on conflict (id) do nothing;" >/dev/null
# سببُ الرفض وحده (الحقلُ الثالث من «guarded:P0001:السبب»).
_lerr() { echo "split_part(_rls_try('$1', '$2'), ':', 3)"; }
OPEN_ID="(select id from company_entries where company_id=''$LCO'' and kind=''opening'' and voided_at is null)"
PAY_ID="(select id from company_entries where company_id=''$LCO'' and kind=''payment'')"
chk "الرصيدُ السابق للمدير وحده: الطبيبُ يُرفض" \
    "select $(_lerr $VET "select company_opening_add(''$LCO'', 90, ''2025-12-31'')")" "forbidden"
chk "  والمديرُ يقيّده بتاريخه" \
    "select _rls_try('$C1', 'select company_opening_add(''$LCO'', 90, ''2025-12-31'', ''دفتر ورقي'')')" "rows:1"
chk "  وثانٍ حيٌّ لنفس الشركة يُرفض" \
    "select $(_lerr $C1 "select company_opening_add(''$LCO'', 5, ''2025-12-31'')")" "opening_exists"
chk "  وتاريخٌ بالمستقبل يُرفض" \
    "select $(_lerr $C1 "select company_adjust(''$LCO'', ''debit'', 5, current_date + 3, ''x'')")" "bad_date"
chk "الجدولُ بلا سياسة كتابة: إدراجٌ مباشر يُرفض حتى للمدير" \
    "select left(_rls_try('$C1', 'insert into company_entries (company_id, kind, direction, amount) values (''$LCO'', ''opening'', ''credit'', 1)'), 13)" "guarded:42501"
chk "تسديدٌ أكثرُ من الدين (٩٠ + ٦٠ + ٥٠) يُرفض، والاستقبالُ لا يسدّد، وعيادةٌ أخرى لا ترى الشركة" \
    "select $(_lerr $C1 "select company_pay(''$LCO'', 201, ''cash'', null)")||'|'||$(_lerr $RCP "select company_pay(''$LCO'', 10, ''cash'', null)")||'|'||$(_lerr $C2 "select company_pay(''$LCO'', 10, ''cash'', null)")" "over_pay|forbidden|no_company"
chk "الطبيبُ يسدّد ١٢٠ بتاريخ سابق: ٩٠ للرصيد السابق و٣٠ لأقدم فاتورة" \
    "select _pf('$VET', 'select (r->>''to_opening'')::numeric::int||''/''||(r->>''to_invoices'')::numeric::int||''/''||(r->>''invoices'') from (select company_pay(''$LCO'', 120, ''cash'', ''2026-03-01'', ''للمندوب'') r) x')" "90/30/1"
chk "  الأقدمُ صارت ٧٠ مدفوعاً (جزئية)، والأحدثُ لم تُمسّ" \
    "select (select amount_paid::int||'/'||status from purchases where id='$LP1')||'|'||(select amount_paid::int||'/'||status from purchases where id='$LP2')" "70/partial|0/unpaid"
chk "  ودفعتُها تحمل صفَّ التسديد ويومَه ببغداد" \
    "select count(*)::text||'/'||min((paid_at at time zone 'Asia/Baghdad')::date)::text from purchase_payments where purchase_id='$LP1' and entry_id is not null" "1/2026-03-01"
chk "  والرصيدُ السابق القائم صفر" "select company_pool_due('$LCO','$C1')::int::text" "0"
chk "رصيدٌ سُدِّد منه لا يُلغى قبل تسديده" \
    "select $(_lerr $C1 "select company_entry_void($OPEN_ID, ''غلط'')")" "has_payments"
chk "  والإلغاءُ للمدير، وبسببٍ مكتوب" \
    "select $(_lerr $VET "select company_entry_void($PAY_ID, ''غلط'')")||'|'||$(_lerr $C1 "select company_entry_void($PAY_ID, '' '')")" "forbidden|reason_required"
# الكتابةُ بطلبٍ والقراءةُ بآخر: الاستعلامُ الفرعيّ والدالّةُ الثابتة (stable)
# يُقيَّمان قبل الكتابة إن جمعهما تعبيرٌ واحد، فيقرآن ما قبلها.
chk "إلغاءُ التسديد يمرّ بسببه" "select _rls_try('$C1', 'select company_entry_void($PAY_ID, ''انكتب مرتين'')')" "rows:1"
chk "  ويردّ ما وزّعه: الفاتورةُ ٤٠ والدفعةُ زالت وصورتُها بالصفّ" \
    "select 'rows:1|'||(select amount_paid::int||'/'||status from purchases where id='$LP1')||'|'||(select count(*) from purchase_payments where purchase_id='$LP1')::text||'|'||(select jsonb_array_length(void_detail)::text from company_entries where company_id='$LCO' and kind='payment')" "rows:1|40/partial|0|1"
chk "  والصفُّ باقٍ مختوماً لا محذوفاً، والرصيدُ السابق رجع ٩٠، وإلغاؤه ثانيةً يُرفض" \
    "select (select count(*) from company_entries where company_id='$LCO' and voided_at is not null)::text||'/'||company_pool_due('$LCO','$C1')::int::text||'/'||$(_lerr $C1 "select company_entry_void($PAY_ID, ''x'')")" "1/90/already_void"
chk "التسويةُ بلا سبب تُرفض، وبسببٍ تُقيَّد" \
    "select $(_lerr $C1 "select company_adjust(''$LCO'', ''debit'', 10, null, null)")||'|'||_rls_try('$C1', 'select company_adjust(''$LCO'', ''debit'', 10, null, ''خصم كمية'')')" "note_required|rows:1"
chk "  وخصمُ ١٠ ينزل الرصيدَ السابق إلى ٨٠" "select company_pool_due('$LCO','$C1')::int::text" "80"
chk "  ورصيدٌ لو أُلغي صار السابقُ سالباً لا يُلغى (الخصمُ عليه)" \
    "select $(_lerr $C1 "select company_entry_void($OPEN_ID, ''x'')")" "has_payments"
chk "عيادةٌ أخرى لا ترى صفّاً من الدفتر، وصاحبتُه ترى الثلاثة" \
    "select _rls_try('$C2', 'select 1 from company_entries')||'|'||_rls_try('$C1', 'select 1 from company_entries where company_id=''$LCO''')" "rows:0|rows:3"
chk "كلُّ دالّةٍ كاتبة definer بـsearch_path وتقيّد بالعيادة نصّاً (أو بحارسها)" \
    "select bool_and(p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%' and (p.prosrc like '%clinic_id = v_clinic%' or p.prosrc like '%company_entry_guard(%'))::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('company_pay','company_entry_void','company_opening_add','company_adjust')" "true"
chk "السياجُ يشمل الجدولَ الجديد (المصوّرُ لا يرى دفترَ الديون)" \
    "select count(*)::text from verify_photographer_fence() v where v like '%company_entries%'" "0"

# ــ الطيّ والحذف والاسترجاع: الدفترُ يتبع شركتَه ــ
$P -c "select _rls_try('$C1', 'select company_entry_void((select id from company_entries where company_id=''$LCO'' and kind=''adjust''), ''نعيده'')');" >/dev/null
chk "(قبل الطيّ) إلغاءُ الخصم ثم الرصيد ٩٠، ورصيدٌ جديد ٣٠، وتسديدُ ٥٠: ٣٠ للرصيد و٢٠ للفاتورة" \
    "select _rls_try('$C1', 'select company_entry_void($OPEN_ID, ''نعيده'')')||'|'||_rls_try('$C1', 'select company_opening_add(''$LCO'', 30, null)')||'|'||_pf('$C1', 'select (r->>''to_opening'')::numeric::int||''/''||(r->>''to_invoices'')::numeric::int from (select company_pay(''$LCO'', 50, ''card'', null) r) x')" "rows:1|rows:1|30/20"
LCNT=$($P -t -A -c "select count(*) from company_entries where company_id='$LCO'")
LPOOL=$($P -t -A -c "select company_pool_due('$LCO','$C1')")
chk "(البذرة) خمسةُ صفوف (ثلاثةٌ ملغاة) والرصيدُ السابق مسدَّدٌ كلُّه" "select '$LCNT/'||round($LPOOL)::text" "5/0"
chk "الطيُّ يمرّ" "select (_pf('$C1', 'select (merge_companies(''$LKP'', ''$LCO'')).id::text') = '$LKP')::text" "true"
chk "  وينقل صفوفَ الدفتر حيّةً للباقية (cascade كان سيمحوها)" \
    "select count(*)::text from company_entries where company_id='$LKP'" "$LCNT"
chk "الفكُّ يمرّ" "select (_pf('$C1', 'select (restore_company(''$LCO'')).id::text') = '$LCO')::text" "true"
chk "  ويردّها لشركتها" \
    "select (select count(*) from company_entries where company_id='$LCO')::text||'/'||(select count(*) from company_entries where company_id='$LKP')::text" "$LCNT/0"
$P -c "select _pf('$C1', 'select delete_company(''$LCO'', ''فحص'')::text');" >/dev/null
chk "الحذفُ الصريح: الصفوفُ كاملةً بالسلّة والتتالي محاها من الجدول" \
    "select jsonb_array_length(entries)::text||'/'||(select count(*) from company_entries where company_id='$LCO')::text from companies_trash where id='$LCO'" "$LCNT/0"
chk "  والاسترجاعُ يمرّ" "select (_pf('$C1', 'select (restore_company(''$LCO'')).id::text') = '$LCO')::text" "true"
chk "  ويعيدها، ويربط دفعةَ الفاتورة بتسديدها — فالرصيدُ السابق صفرٌ كما كان (بلا الربط يصير ‑٢٠)" \
    "select (select count(*) from company_entries where company_id='$LCO')::text||'/'||(select count(*) from purchase_payments where entry_id is not null and purchase_id='$LP1')::text||'/'||round(company_pool_due('$LCO','$C1'))::text" "$LCNT/1/0"
$P -f "$MIG/0224_company_ledger.sql" >/dev/null 2>&1
chk "والهجرةُ تنعاد بلا أثرٍ ثانٍ: لا صفَّ يتبدّل ولا محفّزَ يتكرّر" \
    "select (select count(*) from company_entries where company_id='$LCO')::text||'/'||(select count(*) from pg_trigger where tgrelid='companies'::regclass and tgname in ('companies_trash_guard_entries','companies_restore_entries'))::text" "$LCNT/2"
# بعد إعادة التنزيل: المنحُ الشامل بأوّل الحزمة (0159) يعطي كلَّ دالّةٍ للداخلين،
# والهجرةُ تنزعه عن أدواتها الداخلية وعن anon.
chk "الأدواتُ الداخلية لا يناديها الداخلون، والكاتبةُ ممنوعةٌ عن anon" \
    "select (not has_function_privilege('authenticated','public.company_pool_due(uuid,uuid)','execute') and not has_function_privilege('authenticated','public.company_entry_guard(uuid,date,boolean)','execute') and not has_function_privilege('anon','public.company_pay(uuid,numeric,text,date,text)','execute') and has_function_privilege('authenticated','public.company_pay(uuid,numeric,text,date,text)','execute'))::text" "true"

# ── 0225: رقمُ الطلب على طلب التوصيل ────────────────────────────────────────
# عمودٌ اختياريّ يكتبه أيُّ كادرٍ بالعيادة — حتى على طلب شركة (المحفّزُ يجمّد
# الحاملَ والتحصيلَ وحدهما) — ولا يكتبه غيرُها، وطولُه محروس، والسلّةُ تحمله.
echo "▸ 0225: رقمُ الطلب (courier_ref)"
RCP=77777777-7777-7777-7777-777777777777
chk "العمودُ نصٌّ يقبل الفراغ" \
    "select data_type||'/'||is_nullable from information_schema.columns where table_name='delivery_orders' and column_name='courier_ref'" "text/YES"
chk "الاستقبالُ يكتب رقمَ الطلب على طلب شركة (المحفّزُ لا يمسّه)" \
    "select _rls_try('$RCP', 'update delivery_orders set courier_ref=''BX-1234'' where id=''eeeeeeee-0159-4000-8000-000000000002''')" "rows:1"
chk "  ويمسحه" \
    "select _rls_try('$RCP', 'update delivery_orders set courier_ref=null where id=''eeeeeeee-0159-4000-8000-000000000002''')" "rows:1"
chk "    (والمسحُ يكتب NULL فعلاً)" \
    "select coalesce(courier_ref,'∅') from delivery_orders where id='eeeeeeee-0159-4000-8000-000000000002'" "∅"
chk "  لكنّه ما زال لا يغيّر حاملَ طلبِ شركة (المحفّزُ باقٍ كما هو)" \
    "select split_part(_rls_try('$RCP', 'update delivery_orders set courier_id=null, courier_ref=''Z9'' where id=''eeeeeeee-0159-4000-8000-000000000002'''), ':', 2)||'|'||coalesce((select courier_ref from delivery_orders where id='eeeeeeee-0159-4000-8000-000000000002'),'∅')" "P0001|∅"
chk "عيادةٌ أخرى لا تكتب رقماً على طلب غيرها" \
    "select _rls_try('$C2', 'update delivery_orders set courier_ref=''X1'' where id=''eeeeeeee-0159-4000-8000-000000000001''')" "rows:0"
chk "الطولُ محروس: فارغٌ ولا أطولُ من ٦٤" \
    "select split_part(_rls_try('$C1', 'update delivery_orders set courier_ref='''' where id=''eeeeeeee-0159-4000-8000-000000000001'''), ':', 2)||'|'||split_part(_rls_try('$C1', 'update delivery_orders set courier_ref=repeat(''9'', 65) where id=''eeeeeeee-0159-4000-8000-000000000001'''), ':', 2)" "23514|23514"
chk "  واسمُ القيد هو ما تترجمه الواجهة (errors.c)" \
    "select count(*)::text from pg_constraint where conname='delivery_orders_courier_ref_len'" "1"
chk "لا فهرسَ فريد على الرقم: التكرارُ ينبَّه بالشاشة ولا يُفشل إعادةَ طلبٍ محفوظ" \
    "select _rls_try('$C1', 'update delivery_orders set courier_ref=''DUP-7'' where id in (''eeeeeeee-0159-4000-8000-000000000001'',''eeeeeeee-0180-4000-8000-000000000001'')')" "rows:2"
$P -c "insert into invoices(id,clinic_id) values ('dddddddd-0225-4000-8000-000000000001','$C1') on conflict do nothing;
       insert into delivery_orders(id,clinic_id,invoice_id,status,cod_amount,courier_ref) values
         ('eeeeeeee-0225-4000-8000-000000000001','$C1','dddddddd-0225-4000-8000-000000000001','preparing',4000,'AW-55') on conflict do nothing;
       delete from delivery_orders where id='eeeeeeee-0225-4000-8000-000000000001';" >/dev/null
chk "والطلبُ المحذوف يحمل رقمَه بالسلّة (0157 تصوّر الصفَّ كاملاً)" \
    "select row->>'courier_ref' from delivery_orders_trash where id='eeeeeeee-0225-4000-8000-000000000001'" "AW-55"
chk "السياجُ ما زال يغطّي delivery_orders (عمودٌ جديد لا يفتح باباً)" \
    "select count(*)::text from verify_photographer_fence() v where v like '%delivery_orders%'" "0"
$P -f "$MIG/0225_delivery_courier_ref.sql" >/dev/null 2>&1
chk "والهجرةُ تنعاد بلا أثرٍ ثانٍ: قيدٌ واحد والقيمُ باقية" \
    "select (select count(*) from pg_constraint where conname='delivery_orders_courier_ref_len')::text||'/'||(select count(*) from delivery_orders where courier_ref='DUP-7')::text" "1/2"

# ── 0226: رفعُ الأسعار بنسبة ────────────────────────────────────────────────
# الحسابُ مرآةُ priceRaise.ts فلساً بفلس، والمعاينةُ وثيقةٌ بلقطةٍ واحدة، والحفظُ يقارن
# البصمةَ تحت القفل ويكتب بالمقارنة ثمّ التبديل، والإرجاعُ لا يدوس تعديلاً لاحقاً ولا
# يشقّ مجموعة، ورفعٌ لاحقٌ قائمٌ يحجز سطرَه. كلُّ نداءٍ بدور authenticated.
echo "▸ 0226: رفعُ الأسعار بنسبة"
C1=11111111-1111-1111-1111-111111111111
C2=22222222-2222-2222-2222-222222222222
VET=55555555-5555-5555-5555-555555555555
RCP=77777777-7777-7777-7777-777777777777
PHO=88888888-8888-8888-8888-888888888888
X=a2261111-0000-4000-8000-0000000000
PA=${X}01; PB=${X}02; PC=${X}03; PD=${X}04; PE=${X}05; PZ=${X}09; PO=${X}0f
SC=${X}c1; S1=${X}d1; S2=${X}d2; SCO=${X}c2
# الإنتاجُ يدقّق المنتجاتِ والخدمات (audit_all من 0044/0045) — والحزمةُ بلا تلك الموجة،
# فيُركَّب المحفّزُ هنا بشكله ليُقاس التخطّي على تدقيقٍ حقيقيّ لا على صمت.
$P -c "drop trigger if exists audit_all on products;
       create trigger audit_all after insert or update or delete on products for each row execute function audit_change();
       drop trigger if exists audit_all on clinic_services;
       create trigger audit_all after insert or update or delete on clinic_services for each row execute function audit_change();
       insert into products(id, clinic_id, name, sell_price, purchase_price, category, bulk_group, stock) values
         ('$PA','$C1','رويال A',5000,3500,'cat226','GX',4), ('$PB','$C1','رويال B',5000,3500,'cat226','GX',2),
         ('$PC','$C1','معلبات',1666,1200,'cat226',null,9), ('$PE','$C1','رمل',1000,600,'cat226',null,3),
         ('$PZ','$C1','صفر',0,0,'cat226',null,1), ('$PO','$C2','عيادة ثانية',5000,1,'cat226',null,1)
       on conflict (id) do nothing;
       insert into products(id, clinic_id, name, sell_price, purchase_price, category, has_sub_unit, sub_unit_price, units_per_box, stock)
       values ('$PD','$C1','حبوب',4500,3000,'cat226',true,1500,3,5) on conflict (id) do nothing;
       insert into clinic_service_categories(id, clinic_id, name) values ('$SC','$C1','فحوص 226'), ('$SCO','$C2','غيرها') on conflict do nothing;
       insert into clinic_services(id, clinic_id, category_id, name, price, cost) values
         ('$S1','$C1','$SC','فحص عام',15000,null), ('$S2','$C2','$SCO','عيادة ثانية',9000,null) on conflict do nothing;" >/dev/null
SPEC='{"pct_bp":2500,"round":"smart","max_step":250,"products":true,"services":true,"p_categories":["cat226"],"p_exclude":[],"s_categories":["'$SC'"],"s_exclude":[],"skip_recent":true}'
_perr() { echo "split_part(_rls_try('$1', '$2'), ':', 3)"; }
_prev() { echo "_pf('$1', 'select price_change_preview(''$2''::jsonb)::text')::jsonb"; }
# الكتابةُ بطلبٍ والقراءةُ بآخر: قراءةٌ بنفس الجملة تقرأ لقطةَ ما قبل الكتابة (درس 0224).
W() { psql -h $SOCK -p $PORT -U postgres -d $DB -tAc "$1"; }

chk "المعاينةُ للمدير وحده: الطبيبُ والاستقبالُ والمصوّرُ يُرفضون" \
    "select $(_perr $VET "select price_change_preview(''$SPEC''::jsonb)")||'|'||$(_perr $RCP "select price_change_preview(''$SPEC''::jsonb)")||'|'||$(_perr $PHO "select price_change_preview(''$SPEC''::jsonb)")" "forbidden|forbidden|forbidden"
chk "المعاينة: ٥ منتجات (المجموعةُ كاملة، والصفرُ يُعدّ ولا يُكتب، وعيادةٌ أخرى لا تدخل) + مفردٌ + خدمة" \
    "select (d->'counts'->>'products')||'/'||(d->'counts'->>'sub_units')||'/'||(d->'counts'->>'services')||'/'||(d->'counts'->>'lines')||'/'||(d->'skipped'->>'zero_products') from (select $(_prev $C1 "$SPEC") d) x" "5/1/1/7/1"
chk "  والأرقامُ الصريحة: 5000→6250، 1666→2100، 1000→1250، 15000→18750" \
    "select string_agg((l->>'o')::numeric::int||'→'||(l->>'w')::numeric::int, ',' order by (l->>'o')::numeric, l->>'id') from (select $(_prev $C1 "$SPEC") d) x, jsonb_array_elements(d->'lines') l where l->>'f' <> 'sub_unit_price'" "1000→1250,1666→2100,4500→5750,5000→6250,5000→6250,15000→18750"
chk "  والمفردُ (1500×3 = العلبة 4500) يُرفع ليبقى ×3 ≥ العلبة 5750: 1950 لا 1900، ويُعلَّم" \
    "select (l->>'w')::numeric::int||'|'||(l->'fl')::text from (select $(_prev $C1 "$SPEC") d) x, jsonb_array_elements(d->'lines') l where l->>'f' = 'sub_unit_price'" '1950|["sub_aligned"]'
chk "نطاقان معاً (صنف + موادّ معيّنة) يُرفض لا يتقاطع بصمت" \
    "select $(_perr $C1 "select price_change_preview(''{\"pct_bp\":2500,\"round\":\"smart\",\"max_step\":250,\"products\":true,\"p_categories\":[\"cat226\"],\"p_ids\":[\"$PA\"]}''::jsonb)")" "mixed_scope"
chk "  ونسبةٌ ١٠١٪ وخطوةٌ ١٠٠ (ليست بسلّم القواسم) تُرفضان" \
    "select $(_perr $C1 "select price_change_preview(''{\"pct_bp\":10100,\"round\":\"smart\",\"max_step\":250,\"products\":true}''::jsonb)")||'|'||$(_perr $C1 "select price_change_preview(''{\"pct_bp\":2500,\"round\":\"fixed\",\"max_step\":100,\"products\":true}''::jsonb)")" "bad_pct|bad_step"
H=$(W "select $(_prev $C1 "$SPEC")->>'plan_hash'")
INV0=$(W "select count(*)||'/'||coalesce(sum(line_total),0) from invoice_items")
AUD0=$(W "select count(*) from audit_log where entity in ('products','clinic_services') and clinic_id='$C1'")
chk "بصمةٌ غيرُ بصمة المعاينة ⇒ «المعاينة قديمة» ولا يُكتب شيء" \
    "select $(_perr $C1 "select price_change_apply(''$SPEC''::jsonb, ''xxxxxxxx'', null, null)")||'|'||(select sell_price::int from products where id='$PA')::text||'|'||(select count(*) from price_changes where clinic_id='$C1')::text" "stale_preview|5000|0"
chk "الحفظُ بالبصمة الصحيحة يمرّ" \
    "select _rls_try('$C1', 'select price_change_apply(''$SPEC''::jsonb, ''$H'', ''رفع الشهر'', ''ref-0226-apply-1'')')" "rows:1"
chk "  والأسعارُ صارت ما عرضته المعاينة بالضبط (والمفردُ 1950)" \
    "select string_agg(sell_price::int::text, ',' order by id) || '|' || (select sub_unit_price::int from products where id='$PD')::text || '|' || (select price::int from clinic_services where id='$S1')::text from products where id in ('$PA','$PB','$PC','$PD','$PE')" "6250,6250,2100,5750,1250|1950|18750"
chk "  ولا يُمسّ: سعرُ الشراء، والصفر، وعيادةٌ أخرى، وخدمتُها" \
    "select (select string_agg(purchase_price::int::text, ',' order by id) from products where id in ('$PA','$PC','$PD'))||'|'||(select sell_price::int from products where id='$PZ')||'|'||(select sell_price::int from products where id='$PO')||'|'||(select price::int from clinic_services where id='$S2')" "3500,1200,3000|0|5000|9000"
chk "  والفواتيرُ القديمة كما هي سطراً ومبلغاً" \
    "select count(*)||'/'||coalesce(sum(line_total),0) from invoice_items" "$INV0"
chk "  والرأسُ بأرقامه: ٥ منتجات و١ مفرد و١ خدمة و٧ سطور، «+25%»" \
    "select n_products||'/'||n_sub||'/'||n_services||'/'||n_lines||'/'||title||'/'||status from price_changes where clinic_id='$C1'" "5/1/1/7/+25%/applied"
chk "التدقيق: لا سطرَ «تعديل منتج» واحد للرفع، وسطرٌ واحد بنوع price_change" \
    "select ((select count(*) from audit_log where entity in ('products','clinic_services') and clinic_id='$C1') - $AUD0)::text||'|'||(select count(*) from audit_log a where a.entity='price_changes' and audit_kind(a.entity, a.action, a.details) = 'price_change')::text" "0|1"
chk "إعادةُ النداء بنفس المرجع (جوابٌ ضاع): نفسُ الرفع يرجع، لا رفعٌ ثانٍ" \
    "select _pf('$C1', 'select price_change_apply(''$SPEC''::jsonb, ''$H'', null, ''ref-0226-apply-1'')::text')::jsonb->>'replayed'" "true"
chk "  (رفعٌ واحد بالجدول)" "select count(*)::text from price_changes where clinic_id='$C1'" "1"
# تعديلٌ يدويّ بعد الرفع: يُدقَّق كالعادة (التخطّي محصورٌ بمعاملة الرفع)، ويبقى عند الإرجاع.
W "select _rls_try('$C1', 'update products set sell_price = 1300 where id = ''$PE''')" >/dev/null
chk "تعديلُ سعرٍ يدويّ بعد الرفع يُدقَّق كالعادة (التخطّي لا يتسرّب)" \
    "select count(*)::text from audit_log where entity='products' and entity_id='$PE' and details->'__changed' ? 'sell_price'" "1"
chk "معاينةٌ ثانية بنفس النطاق: ما رُفع خلال ٣٠ يوماً يُتخطّى (لا ٢٥٪ فوق ٢٥٪)" \
    "select (d->'counts'->>'lines')||'/'||(d->'counts'->>'recent_skipped') from (select $(_prev $C1 "$SPEC") d) x" "0/7"
CH=$(W "select id from price_changes where clinic_id='$C1' order by apply_seq limit 1")
R=$(W "select _pf('$C1', 'select price_change_undo(''$CH'', array[''$PB''::uuid], ''زبون اعترض'', ''ref-0226-undo-1'')::text')::jsonb->>'restored'")
chk "إرجاعُ مادةٍ من مجموعة يُرجع المجموعةَ كلَّها (لا سعرين على رفٍّ واحد)" \
    "select '$R'||'|'||(select string_agg(sell_price::int::text, ',' order by id) from products where id in ('$PA','$PB'))||'|'||(select status from price_changes where id='$CH')" "2|5000,5000|partially_undone"
chk "  وإعادةُ نداء الإرجاع بمرجعه تُرجع نفسَ الجواب ولا تُرجع شيئاً ثانياً" \
    "select _pf('$C1', 'select price_change_undo(''$CH'', array[''$PB''::uuid], ''زبون اعترض'', ''ref-0226-undo-1'')::text')::jsonb->>'replayed'" "true"
chk "  والإرجاعُ بلا سبب يُرفض، وعيادةٌ أخرى لا تصل الرفع" \
    "select $(_perr $C1 "select price_change_undo(''$CH'', null, '' '', null)")||'|'||$(_perr $C2 "select price_change_undo(''$CH'', null, ''x'', null)")||'|'||$(_perr $C2 "select price_change_detail(''$CH'')")" "reason_required|no_change|no_change"
# رفعٌ لاحق B على المعلبات وحدها (بطلبٍ صريح فوق الرفع السابق).
SPECB='{"pct_bp":1000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PC'"],"p_exclude":[],"skip_recent":false}'
HB=$(W "select $(_prev $C1 "$SPECB")->>'plan_hash'")
chk "رفعٌ ثانٍ صريحٌ فوق الأوّل (skip_recent=false) يُعلِّم السطرَ «حديث»" \
    "select ($(_prev $C1 "$SPECB")->'lines'->0->'fl')::text" '["recent"]'
chk "  ويمرّ" "select _rls_try('$C1', 'select price_change_apply(''$SPECB''::jsonb, ''$HB'', null, null)')" "rows:1"
chk "  والمعلباتُ 2100→2350" "select sell_price::int::text from products where id='$PC'" "2350"
CB=$(W "select id from price_changes where clinic_id='$C1' order by apply_seq desc limit 1")
R=$(W "select (r->>'restored')||'/'||(r->>'blocked')||'/'||(r->>'kept_changed')||'/'||(r->>'status') from (select _pf('$C1', 'select price_change_undo(''$CH'', null, ''رجّعها'', null)::text')::jsonb r) x")
chk "إرجاعُ الأوّل: المعلباتُ محجوزةٌ برفعٍ لاحق (تبقى معلّقة)، والمعدَّلُ بيدٍ يبقى، والباقي يرجع" \
    "select '$R'||'|'||(select string_agg(coalesce(sell_price::int::text,'')||':'||coalesce(sub_unit_price::int::text,'-'), ',' order by id) from products where id in ('$PC','$PD','$PE'))||'|'||(select price::int from clinic_services where id='$S1')" "3/1/1/partially_undone|2350:-,4500:1500,1300:-|15000"
chk "  والتفصيلُ يسمّي الرفعَ اللاحق الحاجز، ويعرض السعرَ الحاليّ" \
    "select (l->'later'->>'title')||'|'||(l->>'cur')::numeric::int from (select _pf('$C1', 'select price_change_detail(''$CH'')::text')::jsonb d) x, jsonb_array_elements(d->'lines') l where l->>'item' = '$PC'" "+10%|2350"
R1=$(W "select _pf('$C1', 'select price_change_undo(''$CB'', null, ''غلط'', null)::text')::jsonb->>'restored'")
R2=$(W "select _pf('$C1', 'select price_change_undo(''$CH'', null, ''رجّعها'', null)::text')::jsonb->>'status'")
chk "إرجاعُ اللاحق ثمّ الأوّل: المعلباتُ ترجع لأصلها 1666 لا 2100 (الأصلُ لا يضيع)" \
    "select '$R1|$R2|'||(select sell_price::int from products where id='$PC')::text" "1|undone|1666"
LE=$(W "select id from price_change_lines where change_id='$CH' and item_id='$PE'")
chk "«رجّعه للأصل» لسطرٍ عُدِّل بيد: بسعرٍ غير الحاليّ يُرفض" \
    "select $(_perr $C1 "select price_change_force(''$LE'', 1250, ''الأصل'')")" "price_moved"
chk "  وبالحاليّ يمرّ" "select _rls_try('$C1', 'select price_change_force(''$LE'', 1300, ''الأصل'')')" "rows:1"
chk "  فيرجع 1000، ويُدقَّق كتعديلٍ يدويّ (سطرٌ ثانٍ للمادة)" \
    "select (select sell_price::int from products where id='$PE')::text||'|'||(select count(*) from audit_log where entity='products' and entity_id='$PE' and details->'__changed' ? 'sell_price')::text" "1000|2"
chk "  والطبيبُ لا يفرض" "select $(_perr $VET "select price_change_force(''$LE'', 1000, ''x'')")" "forbidden"
# مادةٌ تُحذف بعد الرفع: «زالت» لا خطأ.
SPECC='{"pct_bp":2000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PA'"],"p_exclude":[],"skip_recent":false}'
HC=$(W "select $(_prev $C1 "$SPECC")->>'plan_hash'")
chk "رفعُ عضوٍ من مجموعة يرفع المجموعةَ كلَّها" \
    "select _rls_try('$C1', 'select price_change_apply(''$SPECC''::jsonb, ''$HC'', null, null)')" "rows:1"
CC=$(W "select id from price_changes where clinic_id='$C1' order by apply_seq desc limit 1")
chk "  سطران، والمجموعةُ 6000" \
    "select (select count(*) from price_change_lines where change_id='$CC')::text||'|'||(select string_agg(sell_price::int::text, ',' order by id) from products where id in ('$PA','$PB'))" "2|6000,6000"
chk "  وحذفُ عضوٍ منها يمرّ (للسلّة)" "select _rls_try('$C1', 'delete from products where id=''$PB''')" "rows:1"
R=$(W "select (r->>'restored')||'/'||(r->>'kept_missing') from (select _pf('$C1', 'select price_change_undo(''$CC'', null, ''x'', null)::text')::jsonb r) x")
chk "  والإرجاعُ يقول «زالت» للمحذوف ويرجع الباقي" \
    "select '$R|'||(select sell_price::int from products where id='$PA')::text" "1/1|5000"
chk "الجدولُ بلا سياسة كتابة: إدراجٌ مباشر يُرفض حتى للمدير" \
    "select left(_rls_try('$C1', 'insert into price_changes (pct_bp, round_mode, max_step, currency, spec, plan_hash, title, apply_seq, event_seq) values (1, ''smart'', 1, ''IQD'', ''{}'', ''x'', ''x'', 1, 1)'), 13)" "guarded:42501"
chk "  وعيادةٌ أخرى لا ترى صفّاً منهما، وصاحبتُها ترى رفوعَها الثلاثة" \
    "select _rls_try('$C2', 'select 1 from price_change_lines')||'|'||_rls_try('$C1', 'select 1 from price_changes')" "rows:0|rows:3"
# السعرُ قبل الرفع لمرتجع الكاشير: سلسلةٌ قائمة ⇒ أقدمُ «قبل».
SPECD='{"pct_bp":5000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PC'"],"p_exclude":[],"skip_recent":false}'
HD=$(W "select $(_prev $C1 "$SPECD")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECD''::jsonb, ''$HD'', null, null)')" >/dev/null
HD2=$(W "select $(_prev $C1 "$SPECD")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECD''::jsonb, ''$HD2'', null, null)')" >/dev/null
chk "السعرُ قبل الرفع (مرتجع الكاشير): رفعان قائمان 1666→2500→3750 ⇒ «قبل» آخر رفع 2500 (من اشترى بينهما) و«بعد» 3750، ويقرؤه الاستقبال" \
    "select (r->'$PC'->>'o')::numeric::int||'→'||(r->'$PC'->>'w')::numeric::int from (select _pf('$RCP', 'select price_raise_prior()::text')::jsonb r) x" "2500→3750"
# قفلٌ بيد بيعةٍ أخرى: الرفعُ يقول «مشغول» بعد محاولاتٍ قصيرة ولا ينتظر ممسكاً أقفالَه.
SPECE='{"pct_bp":500,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PE'"],"p_exclude":[],"skip_recent":false}'
HE=$(W "select $(_prev $C1 "$SPECE")->>'plan_hash'")
( psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "begin; select 1 from products where id='$PE' for update; select pg_sleep(4); commit;" >/dev/null 2>&1 & )
sleep 0.7
chk "صفٌّ مقفولٌ ببيعة: الرفعُ يرجع «busy» ولا يمسّ شيئاً" \
    "select $(_perr $C1 "select price_change_apply(''$SPECE''::jsonb, ''$HE'', null, null)")||'|'||(select sell_price::int from products where id='$PE')::text" "busy|1000"
sleep 3.5
chk "  وبعد ما تخلص البيعة يمرّ" "select _rls_try('$C1', 'select price_change_apply(''$SPECE''::jsonb, ''$HE'', null, null)')" "rows:1"
chk "    والرمل 1000→1050 (٥٪ بخطوة ٥٠ لا ٢٥٠)" "select sell_price::int::text from products where id='$PE'" "1050"
chk "كلُّ دالّةٍ كاتبة definer بـsearch_path وتقيّد بالعيادة نصّاً" \
    "select bool_and(p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') like '%search_path%' and p.prosrc like '%clinic_id = v_clinic%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('price_change_apply','price_change_undo','price_change_force','price_change_detail')" "true"
chk "  والمعاينةُ stable (لقطةٌ واحدة) والحسابُ immutable" \
    "select string_agg(proname||':'||provolatile::text, ',' order by proname) from pg_proc where proname in ('price_change_preview','_price_step','_price_raise','_price_plan')" "_price_plan:s,_price_raise:i,_price_step:i,price_change_preview:s"
chk "السياجُ يشمل الجدولين (المصوّرُ لا يقرأ ولا يكتب)" \
    "select count(*)::text from verify_photographer_fence() v where v like '%price_change%'" "0"
$P -f "$MIG/0226_price_changes.sql" >/dev/null 2>&1
chk "والهجرةُ تنعاد بلا أثرٍ ثانٍ: الرفوعُ والمحفّزُ كما هي" \
    "select (select count(*) from price_changes where clinic_id='$C1')::text||'/'||(select count(*) from pg_trigger where tgrelid='price_changes'::regclass and tgname='audit_all')::text" "6/1"
chk "الأدواتُ الداخلية لا يناديها الداخلون، والأبوابُ ممنوعةٌ عن anon" \
    "select (not has_function_privilege('authenticated','public._price_plan(uuid,jsonb,boolean)','execute') and not has_function_privilege('authenticated','public._price_lock_rows(uuid,uuid[],uuid[])','execute') and not has_function_privilege('authenticated','public._price_change_live()','execute') and not has_function_privilege('anon','public.price_change_apply(jsonb,text,text,text)','execute') and has_function_privilege('authenticated','public.price_change_apply(jsonb,text,text,text)','execute'))::text" "true"

# «رجّعه للأصل» على مجموعة: محرّرُ المجموعة يكتب أعضاءها بسعرٍ واحد فيبقون كلُّهم «تعديل بيد»؛
# فرضُ عضوٍ واحد كان يشقّ الرفَّ بسعرين (أمسكه الفحصُ الحيّ). ومن انشقّ قبلُ بسعرٍ آخر يبقى.
PG1=${X}21; PG2=${X}22; PG3=${X}23
W "insert into products(id, clinic_id, name, sell_price, purchase_price, category, bulk_group, stock) values
     ('$PG1','$C1','مجموعة ي ١',2000,1000,'cat226b','GY',1), ('$PG2','$C1','مجموعة ي ٢',2000,1000,'cat226b','GY',1),
     ('$PG3','$C1','مجموعة ي ٣',2000,1000,'cat226b','GY',1) on conflict (id) do nothing" >/dev/null
SPECG='{"pct_bp":2500,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PG1'"],"p_exclude":[],"skip_recent":false}'
HG=$(W "select $(_prev $C1 "$SPECG")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECG''::jsonb, ''$HG'', null, null)')" >/dev/null
CG=$(W "select id from price_changes where clinic_id='$C1' order by apply_seq desc limit 1")
W "select _rls_try('$C1', 'update products set sell_price = 2700 where id in (''$PG1'', ''$PG2'')')" >/dev/null
W "select _rls_try('$C1', 'update products set sell_price = 2800 where id = ''$PG3''')" >/dev/null
R=$(W "select (r->>'restored')||'/'||(r->>'kept_changed') from (select _pf('$C1', 'select price_change_undo(''$CG'', null, ''x'', null)::text')::jsonb r) x")
LG=$(W "select id from price_change_lines where change_id='$CG' and item_id='$PG1'")
LG3=$(W "select id from price_change_lines where change_id='$CG' and item_id='$PG3'")
FG=$(W "select _pf('$C1', 'select price_change_force(''$LG'', 2700, ''الأصل'')::text')::jsonb->>'restored'")
chk "فرضُ عضوٍ من مجموعة يرجّع أعضاءها الذين بنفس السعر معاً (2000,2000) ويترك المنشقّ 2800" \
    "select '$R|$FG|'||(select string_agg(sell_price::int::text, ',' order by id) from products where id in ('$PG1','$PG2','$PG3'))||'|'||(select string_agg(coalesce(undo_outcome,'-'), ',' order by item_id) from price_change_lines where change_id='$CG')" "0/3|2|2000,2000,2800|restored,restored,kept_changed"
chk "  وفرضٌ بسعرٍ غير الحاليّ يُرفض ولا يمسّ أحداً" \
    "select $(_perr $C1 "select price_change_force(''$LG3'', 2700, ''x'')")||'|'||(select sell_price::int from products where id='$PG3')::text" "price_moved|2800"
F3=$(W "select _pf('$C1', 'select price_change_force(''$LG3'', 2800, ''x'')::text')::jsonb->>'restored'")
chk "  وبسعره الحاليّ يرجع وحده 2000" \
    "select '$F3|'||(select string_agg(sell_price::int::text, ',' order by id) from products where id in ('$PG1','$PG2','$PG3'))" "1|2000,2000,2000"

# ── ما أمسكه التدقيقُ العدائيّ ──────────────────────────────────────────────
# «زالت» سطرٌ قائم لا محسوم: 1000 → A 1300 → B 1750، تُحذف المادة، يُرجَع B ثمّ A. عدُّه
# محسوماً كان يُمرّ A فيحسمه «تعديل بيد» ويُرجع B إلى 1300 بعد الاسترجاع — فيضيع الأصل.
PK=${X}31
W "insert into products(id, clinic_id, name, sell_price, purchase_price, category, stock) values ('$PK','$C1','زالت ثم رجعت',1000,500,'cat226c',1) on conflict (id) do nothing" >/dev/null
SPECK='{"pct_bp":3000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PK'"],"p_exclude":[],"skip_recent":false}'
HK=$(W "select $(_prev $C1 "$SPECK")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECK''::jsonb, ''$HK'', null, null)')" >/dev/null
CKA=$(W "select id from price_changes where clinic_id='$C1' order by apply_seq desc limit 1")
HK2=$(W "select $(_prev $C1 "$SPECK")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECK''::jsonb, ''$HK2'', null, null)')" >/dev/null
CKB=$(W "select id from price_changes where clinic_id='$C1' order by apply_seq desc limit 1")
W "select _rls_try('$C1', 'delete from products where id = ''$PK''')" >/dev/null
UB=$(W "select (r->>'kept_missing')||'/'||(r->>'status') from (select _pf('$C1', 'select price_change_undo(''$CKB'', null, ''x'', null)::text')::jsonb r) x")
chk "«زالت»: إرجاعُ اللاحق والمادةُ محذوفة يبقيه «جزئياً» (سطرُه معلّقٌ يُعاد) لا «مرجوعاً»" "select '$UB'" "1/partially_undone"
chk "  والأقدمُ يُحجز به (لا يُحسم «تعديل بيد» والأصلُ 1000 بيده)" \
    "select $(_perr $C1 "select price_change_undo(''$CKA'', null, ''x'', null)")" "later_batch"
W "select _rls_try('$C1', 'select restore_product(''$PK'')')" >/dev/null
W "select _pf('$C1', 'select price_change_undo(''$CKB'', null, ''x'', null)::text')" >/dev/null
W "select _pf('$C1', 'select price_change_undo(''$CKA'', null, ''x'', null)::text')" >/dev/null
chk "  وبعد الاسترجاع: اللاحقُ ثمّ الأقدم ⇒ 1000 بالضبط، والرفعان «مرجوع»" \
    "select (select sell_price::int from products where id='$PK')::text||'|'||(select string_agg(status, ',' order by apply_seq) from price_changes where id in ('$CKA','$CKB'))" "1000|undone,undone"

# المرفوعُ حديثاً بالوحدة: عضوٌ انضمّ لمجموعةٍ بعد رفعها لا يُرفع وحده.
PZ1=${X}41; PZ2=${X}42; PZ3=${X}43; PS=${X}44
W "insert into products(id, clinic_id, name, sell_price, purchase_price, category, bulk_group, stock) values
     ('$PZ1','$C1','مجموعة ز ١',5000,1000,'cat226d','GZ',1), ('$PZ2','$C1','مجموعة ز ٢',5000,1000,'cat226d','GZ',1),
     ('$PS','$C1','علبة بلا مفرد',10000,5000,'cat226d',null,1) on conflict (id) do nothing" >/dev/null
SPECZ='{"pct_bp":2500,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PZ1'"],"p_exclude":[],"skip_recent":false}'
HZ=$(W "select $(_prev $C1 "$SPECZ")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECZ''::jsonb, ''$HZ'', null, null)')" >/dev/null
W "insert into products(id, clinic_id, name, sell_price, purchase_price, category, bulk_group, stock) values ('$PZ3','$C1','مجموعة ز ٣',6250,1000,'cat226d','GZ',1) on conflict (id) do nothing" >/dev/null
SPECZ2='{"pct_bp":2500,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PZ1'"],"p_exclude":[],"skip_recent":true}'
chk "مجموعةٌ رُفعت وانضمّ لها عضوٌ بسعرها: الرفعُ الثاني يتخطّاها كلَّها (لا 6250/6250/8000)" \
    "select (d->'counts'->>'lines')||'/'||(d->'counts'->>'recent_skipped') from (select $(_prev $C1 "$SPECZ2") d) x" "0/3"
SPECS='{"pct_bp":2000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PS'"],"p_exclude":[],"skip_recent":false}'
HS=$(W "select $(_prev $C1 "$SPECS")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECS''::jsonb, ''$HS'', null, null)')" >/dev/null
W "update products set has_sub_unit = true, sub_unit_price = 1200, units_per_box = 10 where id = '$PS'" >/dev/null
SPECS2='{"pct_bp":2000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PS'"],"p_exclude":[],"skip_recent":true}'
chk "  وعلبةٌ رُفعت حديثاً يتبعها مفردُها بالتخطّي (لا مفردٌ يُرفع وحده)" \
    "select (d->'counts'->>'lines')||'/'||(d->'counts'->>'recent_skipped') from (select $(_prev $C1 "$SPECS2") d) x" "0/2"

# «قبل الرفع» من السلسلة المتّصلة الأخيرة: 1000 → 1300، يدويّ 2000، 2000 → 2500 ⇒ 2000.
PH=${X}51
W "insert into products(id, clinic_id, name, sell_price, purchase_price, category, stock) values ('$PH','$C1','سلسلة مقطوعة',1000,500,'cat226e',1) on conflict (id) do nothing" >/dev/null
SPECH='{"pct_bp":3000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PH'"],"p_exclude":[],"skip_recent":false}'
HH=$(W "select $(_prev $C1 "$SPECH")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECH''::jsonb, ''$HH'', null, null)')" >/dev/null
W "select _rls_try('$C1', 'update products set sell_price = 2000 where id = ''$PH''')" >/dev/null
SPECH2='{"pct_bp":2500,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PH'"],"p_exclude":[],"skip_recent":false}'
HH2=$(W "select $(_prev $C1 "$SPECH2")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECH2''::jsonb, ''$HH2'', null, null)')" >/dev/null
chk "السعرُ قبل الرفع بعد تعديلٍ يدويّ بين رفعين: 2000 (ما بيع به) لا 1000" \
    "select (r->'$PH'->>'o')::numeric::int||'→'||(r->'$PH'->>'w')::numeric::int from (select _pf('$RCP', 'select price_raise_prior()::text')::jsonb r) x" "2000→2500"

# إذنُ تخطّي التدقيق ينتهي مع كتابات الرفع — ما بعدها بنفس المعاملة يُدقَّق.
PF=${X}61
W "insert into products(id, clinic_id, name, sell_price, purchase_price, category, stock) values ('$PF','$C1','إذن التخطي',4000,1000,'cat226f',1) on conflict (id) do nothing" >/dev/null
SPECF='{"pct_bp":1000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PF'"],"p_exclude":[],"skip_recent":false}'
HF=$(W "select $(_prev $C1 "$SPECF")->>'plan_hash'")
chk "بعد الرفع بنفس المعاملة: الإذنُ مفرَّغ (طفرةٌ ثانيةٌ بطلبٍ واحد تُدقَّق)" \
    "select _pf('$C1', 'select coalesce(nullif(current_setting(''dv.price_change'', true), ''''), ''cleared'') from (select price_change_apply(''$SPECF''::jsonb, ''$HF'', null, null) as r) x')" "cleared"
CF=$(W "select id from price_changes where clinic_id='$C1' order by apply_seq desc limit 1")
chk "  وبعد الإرجاع كذلك" \
    "select _pf('$C1', 'select coalesce(nullif(current_setting(''dv.price_change'', true), ''''), ''cleared'') from (select price_change_undo(''$CF'', null, ''x'', null) as r) x')" "cleared"

# الإرجاعُ يقفل مسبقاً كالحفظ: صفٌّ بيد بيعةٍ ⇒ «مشغول» لا جمودٌ تكون البيعةُ ضحيّتَه.
PU=${X}71
W "insert into products(id, clinic_id, name, sell_price, purchase_price, category, stock) values ('$PU','$C1','قفل الإرجاع',3000,1000,'cat226g',1) on conflict (id) do nothing" >/dev/null
SPECU='{"pct_bp":1000,"round":"smart","max_step":250,"products":true,"services":false,"p_ids":["'$PU'"],"p_exclude":[],"skip_recent":false}'
HU=$(W "select $(_prev $C1 "$SPECU")->>'plan_hash'")
W "select _rls_try('$C1', 'select price_change_apply(''$SPECU''::jsonb, ''$HU'', null, null)')" >/dev/null
CU=$(W "select id from price_changes where clinic_id='$C1' order by apply_seq desc limit 1")
( psql -h $SOCK -p $PORT -U postgres -d $DB -q -c "begin; select 1 from products where id='$PU' for update; select pg_sleep(4); commit;" >/dev/null 2>&1 & )
sleep 0.7
chk "الإرجاعُ وصفٌّ مقفولٌ ببيعة: «busy» ولا يمسّ شيئاً" \
    "select $(_perr $C1 "select price_change_undo(''$CU'', null, ''x'', null)")||'|'||(select sell_price::int from products where id='$PU')::text||'|'||(select status from price_changes where id='$CU')" "busy|3300|applied"
sleep 3.5
W "select _pf('$C1', 'select price_change_undo(''$CU'', null, ''x'', null)::text')" >/dev/null
chk "  وبعد البيعة يرجع 3000" "select sell_price::int::text from products where id='$PU'" "3000"

# نبضُ الكنس يقيس أثرَ الرفع بنافذة المال (سنة) لا ٩٠ يوماً.
W "delete from audit_log where created_at < now() - interval '80 days';
   insert into audit_log(clinic_id,action,entity,details,created_at) values
     (gen_random_uuid(),'INSERT','price_changes','{}'::jsonb, now() - interval '100 days'),
     (gen_random_uuid(),'X','client','{\"event\":\"sale.expired\"}'::jsonb, now() - interval '100 days');
   update _dvtest_flags set admin = true;" >/dev/null
chk "أثرُ رفعٍ عمرُه ١٠٠ يوم ليس «كنساً متوقّفاً» (نافذتُه سنة كما بـpurge_audit_log)" \
    "select value::int::text from public.system_health() where metric='audit_purge_lag'" "0"
W "update _dvtest_flags set admin = false; delete from audit_log where created_at < now() - interval '80 days';" >/dev/null

# ── التطابق: الحسابُ والمعاينةُ كاملةً بين القاعدة وpriceRaise.ts (المصدرُ نفسُه) ──
PRF=$(mktemp -d)
node "$HERE/../../scripts/price-fixture.mjs" "$PRF" >/dev/null
$P -f "$PRF/plan-seed.sql" >/dev/null
$P -tA -f "$PRF/round.sql" > "$PRF/round-actual.json"
$P -tA -f "$PRF/plan.sql" > "$PRF/plan-actual.jsonl"
if node "$HERE/../../scripts/price-parity.mjs" "$PRF"; then :; else fail=1; fi
rm -rf "$PRF"

# ── التراجع يُجرَّب لا يُكتب ورقاً (آخرَ الحزمة لأنه يعيد الباب القديم) ─────────
echo "▸ rollback_0220: الباب القديم يرجع بترتيب اليوم"
$P -f "$HERE/rollback_0220.sql" >/dev/null
chk "الرسمةُ المجمَّدة صارت ترتيبَ اليوم (من الصفوف) ونسختُها ارتفعت" \
    "select (cage_layout like '%\"code\": \"107\"%' or cage_layout like '%\"code\":\"107\"%')::text from clinic_prefs where clinic_id='$C3'" "true"
chk "  وsave_cage_layout تحفظ من جديد بدور authenticated" \
    "select _rls_try('$C3', format('select save_cage_layout(%L, %s)', '{\"v\":2,\"rooms\":[],\"cages\":[]}', (select cage_layout_rev from clinic_prefs where clinic_id='$C3')))" "rows:1"
echo "▸ rollback_0222: السياجُ يُرفع والمصوّرُ يُعلَّق لا يُحذف"
$P -f "$HERE/rollback_0222.sql" >/dev/null
chk "لا سياسةَ سياجٍ باقية (ولا على الملفّات)" \
    "select count(*)::text from pg_policies where policyname like 'photographer_fence%'" "0"
chk "  والمصوّرُ معلَّقٌ بدورٍ قديم — صفُّه باقٍ" \
    "select role||':'||status from memberships where user_id='$PHO'" "groomer:suspended"
chk "  والاستقبالُ ما تغيّر عليه شي" \
    "select (_rls_try('$RCP', 'select 1 from invoices') <> 'rows:0')::text" "true"
chk "  والنشرُ بالمتجر رجع للمدير والطبيب" \
    "select _rls_try('$VET', 'select store_set_visible(array[''${PP}01''::uuid], false)')||'|'||split_part(_rls_try('$RCP', 'select store_set_visible(array[''${PP}01''::uuid], false)'), ':', 3)" "rows:1|not_authorized"
chk "  والدوالُّ الجديدة زالت بعد تصفير الخطّاف" \
    "select (to_regprocedure('public.api_gate()') is null and to_regprocedure('public.staff_can(text)') is null)::text" "true"
[ $fail -eq 0 ] && echo "✓ كل الفحوص عبرت" || { echo "✗ اكو فحصٌ فشل"; exit 1; }
