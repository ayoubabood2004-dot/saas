-- 0083 — Roster backfill: أي حساب منضم لعيادة (membership فعالة) بدون صف كادر
-- ينسجل تلقائياً بإدارة الكادر، مربوطاً بحسابه (user_id) حتى يظهر بالعدد
-- والحضور. يُصلح الحسابات التي انضمت قبل اكتمال ربط الدعوات بالكادر (0029).

insert into staff (clinic_id, name, email, role, status, user_id, join_date)
select m.clinic_id,
       coalesce(nullif(pr.full_name, ''), split_part(coalesce(pr.email, 'موظف'), '@', 1)),
       pr.email,
       case when m.role in ('manager','veterinarian','receptionist','groomer') then m.role else 'veterinarian' end,
       'active',
       m.user_id,
       current_date
  from memberships m
  join profiles pr on pr.id = m.user_id
 where m.status = 'active'
   and m.clinic_id <> m.user_id  -- الموظفون المنضمّون فقط، ليس المدير نفسه
   and not exists (select 1 from staff s where s.clinic_id = m.clinic_id and s.user_id = m.user_id);

-- وربط أي صف كادر قديم بلا user_id بحسابه عبر تطابق البريد (إن وجد)
update staff s
   set user_id = m.user_id, status = 'active'
  from memberships m
  join profiles pr on pr.id = m.user_id
 where s.clinic_id = m.clinic_id
   and s.user_id is null
   and m.status = 'active'
   and pr.email is not null
   and lower(coalesce(s.email, '')) = lower(pr.email);
