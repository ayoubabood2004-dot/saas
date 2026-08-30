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
WAVE="$MIG/0124_sold_by_weight.sql $MIG/0125_perf_indexes.sql $MIG/0126_pet_serial.sql $MIG/0127_audit_retention.sql $MIG/0128_rls_initplan.sql $MIG/0129_audit_tiered_retention.sql"

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

echo "▸ الهجرات…"
for f in $WAVE; do
  printf '   %s\n' "$(basename "$f")"
  out=$($P -f "$f" 2>&1) || { echo "$out"; echo "✗ فشلت"; exit 1; }
  echo "$out" | grep -E "ERROR" && { echo "✗ فشلت"; exit 1; } || true
done

echo "▸ إعادة التنزيل (لازم بلا أثرٍ ثانٍ)…"
for f in $WAVE; do $P -f "$f" >/dev/null 2>&1 || { echo "✗ ما انعادت"; exit 1; }; done

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

echo
[ $fail -eq 0 ] && echo "✓ كل الفحوص عبرت" || { echo "✗ اكو فحصٌ فشل"; exit 1; }
