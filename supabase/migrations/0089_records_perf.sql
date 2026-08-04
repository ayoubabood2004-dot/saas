-- ============================================================================
-- doctorVet — 0089: فهارس أداء لشاشة الحالات.
--
-- شاشة الحالات (/records) كانت تسحب الجرعات بطلب منفصل لكل حيوان — عيادة فيها
-- ٤٠٠ حيوان = ٤٠٠ طلب، والصفحة تنتهي مهلتها قبل ما توصل، فتطلع فاضية.
--
-- الكود صار يسحب بطلب واحد على مستوى العيادة (ولليوم الحالي فقط بشاشة الحالات)
-- بدل الطلب لكل حيوان — راجع loadRecordsSnap في src/lib/prefetchData.ts
-- و listClinicTreatments / listClinicVisits في src/lib/repo.ts.
--
-- الفهارس هنا هي الجزء المقابل بقاعدة البيانات: بلاها الاستعلام الجديد يصير
-- مسح كامل للجدول. إضافية بالكامل — ما تلمس أي بيانات ولا أي عمود.
--
-- 0006 عمل فهرس على (clinic_id) لحاله. المطلوب هنا مركّب لأن الاستعلام يرشّح
-- بالعيادة واليوم معاً، ويرتّب بالتاريخ تنازلياً.
-- ============================================================================

-- شاشة الحالات: where clinic_id = ? and day = ?
create index if not exists treatment_entries_clinic_day_idx
  on treatment_entries (clinic_id, day desc);

-- التقارير: where clinic_id = ? order by day desc limit N
create index if not exists medical_visits_clinic_date_idx
  on medical_visits (clinic_id, visit_date desc);
