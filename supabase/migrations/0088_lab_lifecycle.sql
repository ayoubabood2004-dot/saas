-- ============================================================================
-- doctorVet — 0088: دورة حياة التحليل (LIS lifecycle).
--
-- كل تحليل يمر بمراحل واضحة لها ختم زمني، من لحظة طلبه لحد اعتماد نتيجته:
--   مطلوب → العينة مسحوبة → قيد التشغيل → النتيجة جاهزة → مُعتمدة
-- + أولوية (عادي/عاجل) + من سحب العينة ومن اعتمد النتيجة، لحساب زمن الإنجاز
-- (TAT) وإظهار طابور عمل المختبر. راجع src/lib/labStatus.ts.
--
-- Additive & idempotent. الصفوف القديمة تُعتبر «مُعتمدة» (نتيجة نهائية أصلاً)،
-- وبطاقات الطلب المعلّقة (panel_id='ordered' بلا قيم) تُعتبر «مطلوبة».
-- ============================================================================

alter table lab_results
  add column if not exists status       text not null default 'verified'
    check (status in ('ordered','collected','running','resulted','verified','canceled')),
  add column if not exists priority     text not null default 'routine'
    check (priority in ('routine','urgent')),
  add column if not exists ordered_at   timestamptz,
  add column if not exists collected_at timestamptz,
  add column if not exists running_at   timestamptz,
  add column if not exists resulted_at  timestamptz,
  add column if not exists verified_at  timestamptz,
  add column if not exists collected_by text,
  add column if not exists verified_by  text;

-- Backfill: existing saved results are final → verified at their taken time.
update lab_results
   set verified_at = coalesce(verified_at, taken_at, created_at)
 where status = 'verified' and verified_at is null;

-- Pending order placeholders (sold but not yet run) → 'ordered'.
update lab_results
   set status = 'ordered',
       ordered_at = coalesce(ordered_at, created_at)
 where panel_id = 'ordered'
   and values is null
   and snap_result is null;

-- Worklist queries hit clinic + status + time constantly.
create index if not exists lab_results_worklist_idx
  on lab_results (clinic_id, status, ordered_at desc);
