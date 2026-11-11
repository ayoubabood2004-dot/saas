-- ============================================================================
-- قالبُ الإنتاج قبل 0264: `report_receipts_daily` كما قيست بالإنتاج (٨/١١) لا كما بنصّ 0149.
--
-- أوّلُ تطبيقٍ لـ0264 بالإنتاج رُفض بـdrift_body عليها، والقياسُ (pg_proc.prosrc سطراً سطراً): نصُّ 0149 بلا أسماء
-- الأعمدة (as day/gross/net/invoices) ومضغوطٌ بأربعة أسطر — بصمتُه 497fd195fcfc215f925d1f981f0ffda8. والحزمةُ تنزل
-- 0264 فوق هذا النصّ — كما ستنزل بالإنتاج — لا فوق نصّ المستودع الذي لا يوجد هناك. والصلاحياتُ تبقى (create or replace).
-- ============================================================================
create schema if not exists dvtest;
create table if not exists dvtest.prodlike_0264 (sig text primary key, fp text);

create or replace function public.report_receipts_daily(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad')
returns table (day date, gross numeric, net numeric, invoices int)
language sql stable security invoker set search_path = public as $$
select (r.at at time zone p_tz)::date, round(sum(r.amount), 2),
round(sum(case when r.total > 0 then r.profit * r.amount / r.total else 0 end), 2), count(distinct r.invoice_id)::int
from receipt_legs() r where r.at >= p_from and r.at <= p_to group by 1 order by 1
$$;

insert into dvtest.prodlike_0264
select 'public.report_receipts_daily(timestamptz,timestamptz,text)', md5(public._drift_code(prosrc))
  from pg_proc where oid = to_regprocedure('public.report_receipts_daily(timestamptz,timestamptz,text)')
on conflict (sig) do update set fp = excluded.fp;
