# الملاحظةُ الصوتية داخل الزيارة والطبلة — الخطة

طلبُ المالك (٢٢/١١): «الدكتور يسجّل بصمة صوتية داخل الملاحظات وتضلّ محفوظة بشكل احترافي» — داخل الزيارة وطبلتها
وخطّتها العلاجية. هذه الخطةُ كُتبت على `main` (`ebf4630`) بعد قراءةٍ لأربعة محاور (ملاحظات الزيارة، وسائط الملفّات،
حرّاس المنصّة، التسجيل بالمتصفّح) ومراجعةٍ عدائيّة بثلاث عدسات (٣٨ اعتراضاً فُحصت كلُّها بالشِفرة).

**قراراتُ المالك (٢٢/١١):** الحذفُ لصاحب التسجيل خلال ٢٤ ساعة والزيارةُ مفتوحة وللمدير بأيّ وقت، والمحذوفُ يسمعه المدير
وحده (ويرجعه صاحبُ الحذف خلال ٢٤ ساعة)؛ أطولُ تسجيلٍ ٥ دقائق؛ النشرُ لكلّ العيادات مرّةً واحدة ومفتاحُ الإيقاف
`delete from public.voice_pilot;`؛ والتطويرُ على `claude/saas-project-b2hfi6` بعد إرجاعه على `main`.

ما يلي هو التصميمُ المنفَّذ (بالإنكليزية مع نصوص الواجهة العربية وإشارات الشِفرة `ملف:سطر`).

---


### Voice notes inside the visit and its treatment plan (الطبلة / الخطة العلاجية)

Written against `ebf4630` (= origin/main, 22/11), after three adversarial reviews (38 objections, all checked against the code).

### 0. The decisions, in one place

| Decision | Choice | Why (checked in the code) |
|---|---|---|
| Where rows live | **New table `public.visit_voice_notes`, with no foreign keys** (clinic, pet and visit are soft references) | `pet_notes` has a `for all` policy (`0037_pet_notes.sql:26-29`), a client-stamped author (`repo.ts:869-876`) and in-band markers (`VisitPage.tsx:243-246,266-270`). `media_items` is readable by pet owners (`0249:233-238`), its `kind` enum has no audio (`0001_init.sql:24`), and old clients draw every row as `<img>` (`Attach.tsx:144-156`). Pet deletion is open to any staff member (`ClinicRecords.tsx:286-292`; `0014:22-36`), so a foreign key to pets would take the recordings with it. |
| Where files live | **New private bucket `voice-notes`**, path `<clinic>/<pet>/<note>.<m4a\|webm\|ogg>` | `medical-media/<pet>/…` is open to the pet owner (`0039:8-19,34-49`) and allows images and PDF only (`0039:23-26`). |
| Who writes | **Three SECURITY DEFINER functions**: `voice_note_add`, `voice_note_void`, `voice_note_restore` | The table has a SELECT-only policy and grant, so no freeze trigger is needed and the 0159/0162 self-reference trap cannot occur. Photographers are refused by `api_gate`, since the functions are not on its list (`0233:739-781`). |
| Delete | **Soft delete only**, restorable with the same id. History is kept in the row. Deleted audio can be heard only by the manager (owner's decision, 22/11); the deleter may restore it (undo) within 24 h. The row stays visible to staff. No path deletes a row or a referenced file. | CLAUDE.md «اختفى كأنه ما كان = حُذف»; the pattern of `0236:24-39` |
| Durability | **Memory first; IndexedDB mirror with a strict commit; XHR upload with real abort; one attempt per clip; a `who` stamp; local copy deleted only after the server row exists and `info(path)` confirms the size** | `outbox.ts:186-189,467`; `inflight.ts:36-60` |
| Owner exposure | **None.** Clinic only; never in the owner portal, the care report or WhatsApp | §A6 |
| Rollout | **All clinics at once** (owner's decision, 22/11). 0287 seeds the all-clinics row of `voice_pilot` on its **first** apply only; `delete from public.voice_pilot;` is the kill switch, and re-applying 0287 never re-opens it | the kill switch is data only, no DDL |
| Migration | **0287** | The branch head `9643587` stops at 0286 (GitHub API); `memory/state.md:30` reserves 0286 for that branch. |

#### Where the earlier maps disagreed, and what was decided

- **Storage path:** a separate bucket. `medical-media/<pet>/voice/…` would expose files to the pet owner (`0039:16,34-49`), and `medical-media/voice/…` would widen that bucket's MIME list for every folder.
- **Table:** a sibling table, for the reasons in the first row above.
- **rls-initplan:** the guard enforces 0 (`scripts/db-baseline.json`).
  - Every new table policy wraps auth helpers in `(select …)`.
  - db-guard does not see storage policies inside `do $$ … $$` blocks, so those are wrapped by hand and run in the suite's storage stub (check 13).
- **Development branch:** `claude/saas-project-b2hfi6`, reset to `main` on 22/11 by the owner's decision; its earlier history is kept at `claude/saas-project-b2hfi6-old`.

---

## A. Product behaviour (what the vet sees)

### A1. Entry points

All recording UI lives in one lazy module (§G). Every entry point is shown only when `user?.role !== "owner"` and `voice_can_record()` returned true (§D4.1).

1. **VisitPage action bar** (`VisitPage.tsx:975-990`, next to «إضافة ملاحظة» at `:985`): a «🎙 ملاحظة صوتية» button. It opens the note modal with the recorder focused.
2. **Note modal** (`VisitPage.tsx:1078-1085`): the recorder sits under the textarea.
   - If `noteDay` is set, the kind is `day` (this covers the «+ ملاحظة» cell in الطبلة at `:1433-1438` and `:1521-1526`); otherwise it is `note`.
   - The modal gets `dismissible={!recording}`.
3. **TreatmentPlan diagnosis step** (`TreatmentPlan.tsx:870-874`): kind `plan`.
   - Saved clips go into `ClinicalRecord.voice` as `{id, ms, by}`.
   - Shown only when TreatmentPlan receives a `visitId`; PetPassport's wizard (`PetPassport.tsx:2795`) passes none, so it is hidden there.
   - The plan modal gets `dismissible={!planRecording}` (`VisitPage.tsx:1064-1075`).
4. **`/voice`** (a new ClinicOnly route), with three parts:
   - this device's unsent recordings for the signed-in user;
   - a count of other users' unsent recordings on this device;
   - for managers, «تسجيلات حيوانات انحذفت».
5. **Later:** the closing note in EndVisitModal (`VisitPage.tsx:2099-2102`). The kind `closing` is reserved in the table; there is no UI in v1.

### A2. Recorder (one component, used everywhere)

- **Idle:** a large round «سجّل» button with the hint «لحد ٥ دقايق · ينحفظ أوّل ما توقّف».
  - One explainer line is shown whenever the microphone permission is not `granted`, or `navigator.permissions` cannot be asked. iOS Home Screen apps ask again on every launch.
  - A low-space warning appears when `navigator.storage.estimate()` shows less than about 15 MB free.
  - On iOS Home Screen without working Wake Lock or the video fallback (§C5): «الشاشة تنطفي حسب قفل الجهاز — ارفع مدة القفل قبل تسجيل طويل».
- **Recording:**
  - A pulsing red dot and the timer `0:24 / 5:00`, in Western digits (`utils.ts:25-26`).
  - A 5-bar level meter.
  - «وقّف واحفظ» (at least 56 px) and «إلغاء». No pause in v1.
  - All UI tones are muted, all players are paused and disabled, and Esc or a backdrop tap does nothing.
- **Silence watchdog:** after 3 s near zero, the banner «ما يوصل صوت للمايك — تأكّد ما مكتوم» appears. It does not stop the recording.
- **Limits:**
  - At 4:30 the timer turns amber with «باقي ٣٠ ثانية».
  - At 5:00 it stops by itself, saves, and offers «سجّل جزء ثاني».
  - Clips under 1 s (media duration) are discarded with «قصير كلش — ما انحفظ».
- **Stop = saved on this device, then upload starts.** There is no preview gate. The card moves through these states:
  - «دنحفظ…» until the strict IndexedDB commit;
  - then «على هالجهاز — خلّي التطبيق مفتوح لحد ما يصير انرفع ✓», or in memory-only mode «بالذاكرة بس — لا تسكّر الصفحة لحد ما يرتفع»;
  - then «دنرفع… 45%», or «النت بطيء — يكمل»;
  - then «انرفع ✓», shown **only** after `voice_note_add` returns the row with the same id and `info(path)` reports the same size.
- **«حذف» on the card:**
  - If the row already exists, it calls `voice_note_void`.
  - If not, it sets `void_requested`; the card reads «انحذفت — تنرفع للمحذوفات», and the note reaches the server already deleted, so it is still recoverable.
- **Cancel:** under 5 s it discards at once. Otherwise an in-sheet confirmation: «تلغي التسجيل (0:32)؟ ما راح ينحفظ» [إي، ألغِه] [لا، كمّل]. Never `window.confirm`.
- **Closing while recording** (the modal's ✕ or a route change): the recording stops and is saved, with the toast «انحفظ التسجيل (0:12)». Nothing records without the recorder on screen.

### A3. Player and lists

- **Player row:**
  - ▶︎/❚❚ (44 px); a seek bar that seeks only inside `seekable`; `0:12 / 0:42` taken from the stored `duration_ms`, which is the media duration.
  - A speed chip 1× → 1.5× → 2×, remembered per device in `vp_voice_rate`; it is off in the Opus fallback (§E).
  - A ⋯ menu with «حذف» and details (format, size, history).
  - Header: kind label, `doctor_name` and `recorded_at`, plus «وصل السيرفر {{time}}» when `created_at` is after the visit's `ended_at` or more than 10 min from `recorded_at`.
  - Only one clip plays at a time, and none plays while recording.
- **VisitPage section «الملاحظات الصوتية (n)»**, under «ملاحظات الزيارة» (`VisitPage.tsx:1012-1035`):
  - Server rows plus this device's clips with their state.
  - If the read fails: «الملاحظات الصوتية ما انحملت — أعد المحاولة». Never an empty list.
- **«المحذوفة (k)»:**
  - Every staff member sees deleted rows: who deleted them, when, and the reason.
  - Play appears only for the manager; «رجّعها» for the manager, or for the deleter within 24 h (undo). Everyone else sees «الصوت محجوب بعد الحذف»; the storage policy enforces this (§B).
- **الطبلة day cells:** chips «🎙 0:42» under the day's text notes (`VisitPage.tsx:1430-1432,1518-1520`); a tap plays inline.
- **Plan card:** a slot injected only by VisitPage (`ClinicalRecordCard.tsx:43,160-164`).
  - It shows chips for `record.voice`.
  - An id with no server row yet shows «تسجيل د. علي (0:42) ما ارتفع بعد من جهازه», using `by` and `ms` from the plan entry.
  - PetPassport, StayLog and UnifiedMedicalRecord pass no slot.
- **Unsent-recordings chip:** `VoiceChip` (boot code) sits in TopBar (`TopBar.tsx:174`) and Sidebar (`Sidebar.tsx:194`), next to OutboxChip.
  - It shows when any user's count on this device is above 0: own clips as «تسجيلات ما ارتفعت: n» (red if any failed), otherwise «تسجيلات لحساب ثاني: n».
  - A tap opens `/voice`.
  - When the signed-in user's own count is above 0, it lazy-loads the uploader, which has no i18n, so clips upload without reopening the visit.

### A4. Delete, history, deleted pets

- **Confirmation:** the ⋯ menu opens an inline confirmation naming the item: «تحذف الملاحظة الصوتية (0:42) — د. علي، 10:42؟ تروح للمحذوفات ويقدر المدير يرجّعها», with an optional reason of up to 200 characters, labelled as visible to staff.
- **Deleted notes stay in the table and the bucket.** They show greyed: «حذفها X · وقت».
  - `history` records every delete and restore (by whom, when, why) and is shown in the details.
- **No hard delete anywhere:**
  - the table has no DELETE grant or policy;
  - there is no foreign key;
  - storage keeps any file a row references.
- **Deleted pets:** voice notes survive with their `pet_name`. Managers find them on `/voice` under «تسجيلات حيوانات انحذفت (n)». This list is listen-only, because a pet cannot be restored (pets have no trash).

### A5. Closed visit (`ended`, `VisitPage.tsx:232`)

- No new recordings, the same rule as text notes (`VisitPage.tsx:975,1033,1433,1521`).
- Clips recorded before closing that are still queued still upload. The server checks the visit, not its status.
- `recorded_at` is clamped to the visit window (§B), and the late «وصل السيرفر» marker makes any later addition visible.
- Playback always works. After closing, delete and restore are manager-only.

### A6. Roles (server-enforced)

Recording is possible only while `voice_pilot` allows the clinic: 0287 seeds the all-clinics row on its first apply (owner's decision), and the kill switch empties the table.

| Action | Manager | Vet | Reception / groomer | Photographer | Pet owner | Platform operator in a clinic |
|---|---|---|---|---|---|---|
| Record | ✓ | ✓ (`editMedical`, `staff.ts:76`) | ✗ unless the manager grants `editMedical` | ✗ | ✗ (UI hidden, server refuses) | ✗ (`voice_operator`: it would leave a trace, 0151) |
| Listen | ✓ | ✓ | ✓ (as text notes, `0037:27-29`) | ✗ (fence) | ✗ | ✓ (support) |
| Delete own (≤24 h, visit open) | ✓ | ✓ | – | ✗ | ✗ | ✗ |
| Delete anyone's | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ (`voice_operator`) |
| Hear a deleted note | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ (acts as manager; reading leaves no trace) |
| Restore | ✓ | only their own deletions, ≤24 h | same | ✗ | ✗ | ✗ (`voice_operator`) |

- **Owner exposure: none in v1.** No owner policy exists, and voice is not added to the care report (`VisitPage.tsx:731-776`), the portal, the journey page or WhatsApp.
- The migration header warns: never add this table to owner-read loops such as the table list at `0249:208`.

### A7. Printing

- **«طباعة الطبلة»** (`printSheet`, `VisitPage.tsx:689-725`): the notes column of each day's first row gets «🎙 ملاحظة صوتية 0:42 — د. علي» for every day voice note. Days that have voice notes but no doses get their own row.
  - The string is `t("vbk.voiceMark", …)`; `treatmentSheetPrint.ts` is unchanged.
- **«تقرير للزبون»:** no marker. Plan voice notes appear only in the JSON.

---

## B. Data model: `supabase/migrations/0287_visit_voice_notes.sql`

The order is load-bearing: tables come before the SQL functions that read them, because SQL function bodies are validated at creation.

```sql
-- ٠٢٨٧ — الملاحظةُ الصوتية داخل الزيارة
-- (header: owner request; §0 decisions; kill switch = delete from public.voice_pilot; soft rollback
--  supabase/tests/rollback_0287_soft.sql; never add this table to owner-read loops (0249:208);
--  applies after 0285, independent of 0286; re-runnable)
set lock_timeout = '5s';

-- ٠) drift guard on audit_kind — 0271's body
do $$ begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
end $$;
select public._drift_assert('public.audit_kind(text,text,jsonb)', 'c3c2fc42e126499d5e724ae15f6fff5d', '-- +0287');

-- ١) tables
create table if not exists public.voice_pilot (
  clinic_id uuid primary key,            -- '00000000-0000-0000-0000-000000000000' = every clinic
  added_at  timestamptz not null default now()
);
alter table public.voice_pilot enable row level security;
revoke all on table public.voice_pilot from public, anon, authenticated;
comment on table public.voice_pilot is
  'RLS-DENY-ALL-BY-DESIGN — clinics allowed to record voice notes (0287); written by the owner in the SQL editor, read only by voice_can_record().';
-- owner's decision (22/11): every clinic at once. Implementation: create the table AND insert the all-clinics row
-- ('00000000-0000-0000-0000-000000000000') inside one `do` block guarded by `to_regclass('public.voice_pilot') is null`,
-- so only the FIRST apply seeds it and a re-apply never undoes the kill switch (`delete from public.voice_pilot;`).

create table if not exists public.visit_voice_notes (
  id          uuid primary key,                         -- generated on the device = idempotency key
  clinic_id   uuid not null,                            -- soft (as 0261)
  pet_id      uuid not null,                            -- soft: the recording outlives a deleted pet
  visit_id    uuid not null,                            -- soft (0261/0263)
  kind        text not null check (kind in ('note','day','plan','closing')),
  day         date,
  path        text not null,
  mime        text not null check (mime in ('audio/mp4','audio/webm','audio/ogg')),
  codecs      text check (codecs is null or codecs ~ '^[a-z0-9.]{1,24}$'),
  duration_ms integer not null check (duration_ms between 0 and 600000),
  bytes       integer not null check (bytes between 1 and 10485760),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null,                     -- device time, clamped to the visit window
  created_at  timestamptz not null default now(),       -- server receive time
  created_by  uuid,
  doctor_name text check (char_length(doctor_name) <= 120),
  pet_name    text check (char_length(pet_name) <= 120),
  voided_at   timestamptz,
  voided_by   uuid,
  voided_name text check (char_length(voided_name) <= 120),
  void_reason text check (char_length(void_reason) <= 200),
  history     jsonb not null default '[]'::jsonb,       -- append-only {a,at,by,name,reason}; definers only
  constraint visit_voice_notes_day check ((kind = 'day') = (day is not null)),
  constraint visit_voice_notes_void check ((voided_at is null) = (voided_by is null)
             and (voided_at is not null or (voided_name is null and void_reason is null))),
  constraint visit_voice_notes_history check (case when jsonb_typeof(history) = 'array'
             then jsonb_array_length(history) <= 100 else false end),
  constraint visit_voice_notes_path check (path = clinic_id::text || '/' || pet_id::text || '/' || id::text || '.' ||
             case mime when 'audio/mp4' then 'm4a' when 'audio/webm' then 'webm' else 'ogg' end),
  constraint visit_voice_notes_path_key unique (path)
);
create index if not exists visit_voice_notes_visit  on public.visit_voice_notes (visit_id, created_at);
create index if not exists visit_voice_notes_clinic on public.visit_voice_notes (clinic_id, created_at desc);

-- ٢) helpers
create or replace function public.voice_can_record() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean := false;
begin
  if auth.uid() is null or platform_acting_clinic() is not null or not is_clinic_staff() then return false; end if;
  if not exists (select 1 from public.voice_pilot p
                  where p.clinic_id = auth_clinic() or p.clinic_id = '00000000-0000-0000-0000-000000000000'::uuid) then
    return false;
  end if;
  if to_regprocedure('public.staff_can(text)') is not null then   -- dynamic: rollback_0222 drops staff_can (0285:25-27)
    execute 'select public.staff_can($1)' into v using 'editMedical';
    return coalesce(v, false);
  end if;
  return coalesce(auth_role() in ('manager','veterinarian'), false);
end $$;
revoke all on function public.voice_can_record() from public, anon;
grant execute on function public.voice_can_record() to authenticated;   -- storage policies and the UI ask it

create or replace function public.voice_object_free(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.visit_voice_notes v where v.path = p_name)
$$;
revoke all on function public.voice_object_free(text) from public, anon;
grant execute on function public.voice_object_free(text) to authenticated;

-- audio access: unreferenced (uploading/orphan) or live → yes; deleted → the manager only (owner's decision, 22/11)
create or replace function public.voice_object_readable(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select v.voided_at is null
                          or coalesce(auth_role(), '') = 'manager'
                     from public.visit_voice_notes v where v.path = p_name), true)
$$;
revoke all on function public.voice_object_readable(text) from public, anon;
grant execute on function public.voice_object_readable(text) to authenticated;

create or replace function public._voice_author() returns text
language sql stable security definer set search_path = public as $$
  select left(coalesce(
    (select nullif(btrim(s.name), '') from public.staff s where s.user_id = auth.uid() and s.clinic_id = auth_clinic() order by s.created_at limit 1),
    (select nullif(btrim(pr.full_name), '') from public.profiles pr where pr.id = auth.uid())), 120)
$$;
revoke all on function public._voice_author() from public, anon, authenticated;
```

**Why `is_clinic_staff()` is required:**
- `staff_can()` returns true for a pet-owner account, because `auth_role_base` falls back to `'manager'` when there is no membership (`0151:77-87`) and `staff_can` returns true for any manager (`0222:74-75`).
- `is_clinic_staff()` means a membership or a clinic profile role (`0049:49-59`).

```sql
-- ٣) writers — all: definer + search_path + "clinic_id = v_clinic" in the body (static check, CLAUDE.md 0145 lesson)
create or replace function public.voice_note_add(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_id    uuid := nullif(p->>'id', '')::uuid;
  v_pet   uuid := nullif(p->>'pet_id', '')::uuid;
  v_visit uuid := nullif(p->>'visit_id', '')::uuid;
  v_kind  text := coalesce(nullif(p->>'kind', ''), 'note');
  v_mime  text := coalesce(p->>'mime', '');
  v_bytes int  := nullif(p->>'bytes', '')::int;
  v_sha   text := lower(coalesce(p->>'sha256', ''));
  v_codecs text := case when coalesce(p->>'codecs', '') ~ '^[a-z0-9.]{1,24}$' then p->>'codecs' end;   -- malformed → null
  v_dur   int  := least(greatest(coalesce(nullif(p->>'duration_ms', '')::int, 0), 0), 600000);        -- clamped
  v_at    timestamptz := coalesce(nullif(p->>'recorded_at', '')::timestamptz, now());
  v_opened timestamptz; v_ended timestamptz; v_pet_name text;
  v_path text; v_size bigint; r public.visit_voice_notes;
begin
  if auth.uid() is null or v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if platform_acting_clinic() is not null then
    raise exception 'voice_operator' using errcode = '42501', hint = 'المشغّل يسمع الملاحظات الصوتية ولا يسجّل ولا يحذف بعيادة زبون.';
  end if;
  if not public.voice_can_record() then
    raise exception 'voice_forbidden' using errcode = '42501', hint = 'التسجيل الصوتي لمن عنده صلاحية السجلات الطبية (الطبيب والمدير).';
  end if;
  if v_id is null or v_pet is null or v_visit is null then
    raise exception 'voice_bad' using errcode = '22023', hint = 'بيانات التسجيل ناقصة.';
  end if;
  -- the visit anchors the clinic (not its status: a clip recorded while open is accepted after close)
  select v.opened_at, v.ended_at into v_opened, v_ended
    from public.clinic_visits v where v.id = v_visit and v.clinic_id = v_clinic and v.pet_id = v_pet;
  if not found then
    raise exception 'voice_visit' using errcode = 'P0001', hint = 'الزيارة مو موجودة بعيادتك لهذا الحيوان.';
  end if;
  select left(nullif(btrim(pt.name), ''), 120) into v_pet_name from public.pets pt where pt.id = v_pet and pt.clinic_id = v_clinic;
  -- device time held inside the visit window — clamped, never rejected (a skewed clock must not cost the recording)
  v_at := greatest(v_opened - interval '10 minutes',
                   least(v_at, coalesce(v_ended, now()) + interval '10 minutes', now() + interval '10 minutes'));
  v_path := v_clinic::text || '/' || v_pet::text || '/' || v_id::text || '.'
            || case v_mime when 'audio/mp4' then 'm4a' when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' else 'x' end;
  if coalesce(p->>'path', '') <> v_path then
    raise exception 'voice_path' using errcode = '22023', hint = 'مسار الملف مو لهذا التسجيل.';
  end if;
  -- row ⇒ object (postgres bypasses RLS on production, 0230:25-26; the suite builds a stub in check 13)
  if to_regclass('storage.objects') is not null then
    execute 'select coalesce((metadata->>''size'')::bigint, -1) from storage.objects where bucket_id = ''voice-notes'' and name = $1'
      into v_size using v_path;
    if v_size is null then
      raise exception 'voice_object_missing' using errcode = 'P0001', hint = 'الملف الصوتي ما وصل السيرفر بعد.';
    elsif v_size >= 0 and v_size <> v_bytes then
      raise exception 'voice_size' using errcode = 'P0001', hint = 'الملف وصل بحجمٍ غير حجمه — يُعاد رفعه.';
    end if;
  end if;
  insert into public.visit_voice_notes (id, clinic_id, pet_id, visit_id, kind, day, path, mime, codecs,
      duration_ms, bytes, sha256, recorded_at, created_by, doctor_name, pet_name)
  values (v_id, v_clinic, v_pet, v_visit, v_kind, case when v_kind = 'day' then nullif(p->>'day', '')::date end,
      v_path, v_mime, v_codecs, v_dur, v_bytes, v_sha, v_at, auth.uid(), public._voice_author(), v_pet_name)
  on conflict (id) do nothing
  returning * into r;
  if r.id is null then   -- a retry whose reply was lost
    select * into r from public.visit_voice_notes where id = v_id and clinic_id = v_clinic;
    if r.id is null or r.path <> v_path or r.sha256 <> v_sha then
      raise exception 'voice_id_taken' using errcode = '23505', hint = 'معرّف التسجيل مستعمل لملفٍّ ثاني.';
    end if;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.voice_note_add(jsonb) from public, anon;
grant execute on function public.voice_note_add(jsonb) to authenticated;
```

**`voice_note_void(p_id uuid, p_reason text default null) returns jsonb`** — same header as `voice_note_add`.
- If `platform_acting_clinic()` is set → `voice_operator`.
- `select … where id = p_id and clinic_id = v_clinic for update`. Not found → `voice_gone` (P0002). Already deleted → return the row unchanged.
- `select (v.status = 'open') into v_open from public.clinic_visits v where v.id = r.visit_id and v.clinic_id = v_clinic`.
- Allowed only if `auth_role() = 'manager'`, or the caller is the author (`r.created_by = auth.uid()`), the note is younger than 24 h and `coalesce(v_open, false)`. Otherwise `voice_void_forbidden` (42501) with the hint «حذف تسجيل غيرك للمدير — وتسجيلك تحذفه خلال ٢٤ ساعة والزيارة مفتوحة».
- Then:
  ```sql
  update … set voided_at = now(), voided_by = auth.uid(), voided_name = public._voice_author(),
               void_reason = nullif(left(btrim(coalesce(p_reason, '')), 200), ''),
               history = history || jsonb_build_array(jsonb_build_object('a','void','at',now(),'by',auth.uid(),'name',…,'reason',…))
  where id = p_id and clinic_id = v_clinic returning * into r;
  ```

**`voice_note_restore(p_id uuid) returns jsonb`** — same operator refusal and lookup; not deleted → return the row unchanged.
- Allowed only if `auth_role() = 'manager'`, or `r.voided_by = auth.uid()` and `r.voided_at > now() - interval '24 hours'`. Otherwise `voice_restore_forbidden`.
- Clears the four void columns and appends `{a:'restore', at, by, name}` to `history`, `where id = p_id and clinic_id = v_clinic`.

**`voice_orphans() returns setof public.visit_voice_notes`** — `language sql stable set search_path = public`, **invoker**, so RLS applies.
- Body: `select v.* … where v.clinic_id = auth_clinic() and not exists (select 1 from public.pets p where p.id = v.pet_id) order by v.created_at desc, v.id`.
- The client pages it with `.range()` and stops at an empty page.

**`voice_notes_ready() returns boolean`** — `language sql stable set search_path = public as $$ select true $$`. It is the owner's anon probe: 42501 means installed, PGRST202 means missing.

All of these get `revoke all on function public.X(…) from public, anon; grant execute … to authenticated;`, the form `redefine-fingerprint.mjs:227` requires.

```sql
-- ٤) reading: clinic only (ownership condition alone — nothing reads its own table)
alter table public.visit_voice_notes enable row level security;
drop policy if exists visit_voice_notes_select on public.visit_voice_notes;
create policy visit_voice_notes_select on public.visit_voice_notes for select to authenticated
  using (clinic_id = (select auth_clinic()));
revoke all on table public.visit_voice_notes from public, anon, authenticated;
grant select on table public.visit_voice_notes to authenticated;
do $$ begin                                   -- guarded: rollback_0222 drops the function
  if to_regprocedure('public.photographer_fence_table(text)') is not null then
    perform public.photographer_fence_table('visit_voice_notes');
  end if;
end $$;

-- ٥) audit (0261:201-209): insert/delete with the full row; void/restore only when voided_at really changes
drop trigger if exists audit_all on public.visit_voice_notes;
create trigger audit_all after insert or delete on public.visit_voice_notes for each row execute function audit_change();
drop trigger if exists audit_void on public.visit_voice_notes;
create trigger audit_void after update of voided_at on public.visit_voice_notes
  for each row when (old.voided_at is distinct from new.voided_at) execute function audit_change();
-- the keep list (0271:508-519) carries pet_id, pet_name, kind, recorded_at, doctor_name → the activity log names both

-- ٦) audit_kind = 0271:569-628 verbatim + ONE line after 0271:617:
--      when p_entity = 'visit_voice_notes' then 'medical'   -- +0287
--    (then 0271's revoke and grant lines verbatim)
```

**Storage block.** It runs in the suite only against the stub (check 13). It uses no DROP statements, because the deploy tooling holds those for confirmation (`0236:23-24`). The existence checks use the **spaced** form that `migration-idempotency.mjs:44` requires.

```sql
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('voice-notes', 'voice-notes', false, 10485760, array['audio/mp4','audio/webm','audio/ogg'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;
  end if;
  if to_regclass('storage.objects') is null then return; end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_read') then
    create policy voice_notes_read on storage.objects for select to authenticated
      using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth_clinic())::text
             and public.voice_object_readable(name));
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_insert') then
    create policy voice_notes_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth_clinic())::text
                  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(m4a|webm|ogg)$'
                  and (select public.voice_can_record()));
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_delete') then
    create policy voice_notes_delete on storage.objects for delete to authenticated   -- orphan cleanup, by the uploader only
      using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth_clinic())::text
             and owner_id = (select auth.uid())::text and public.voice_object_free(name));
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_keep') then
    create policy voice_notes_keep on storage.objects as restrictive for delete to authenticated
      using (case when bucket_id = 'voice-notes' then public.voice_object_free(name) else true end);
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_no_overwrite') then
    create policy voice_notes_no_overwrite on storage.objects as restrictive for update to authenticated
      using (bucket_id <> 'voice-notes') with check (bucket_id <> 'voice-notes');
  end if;
  -- isolation that does not depend on any other permissive policy on storage.objects
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_fence_read') then
    create policy voice_notes_fence_read on storage.objects as restrictive for select to authenticated
      using (case when bucket_id = 'voice-notes'
                  then (storage.foldername(name))[1] = (select auth_clinic())::text and public.voice_object_readable(name)
                  else true end);
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_fence_insert') then
    create policy voice_notes_fence_insert on storage.objects as restrictive for insert to authenticated
      with check (case when bucket_id = 'voice-notes'
                       then (storage.foldername(name))[1] = (select auth_clinic())::text
                            and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(m4a|webm|ogg)$'
                            and (select public.voice_can_record())
                       else true end);
  end if;
end $$;
```

**Notes on §B:**
- **Photographer:** already blocked by the restrictive `photographer_fence` on `storage.objects` (`0222:266-277`). `api_gate` needs no change.
- **`rollback_0222`:** no lines needed. No policy, default or constraint calls `staff_can` or `is_photographer` directly; `voice_can_record` uses a dynamic `execute`.
- **Kill switch** (data only, no DDL): `delete from public.voice_pilot;`. Recording stops everywhere, and listening keeps working.
- **Soft rollback** `supabase/tests/rollback_0287_soft.sql`, tested in the suite:
  - `delete from public.voice_pilot;`
  - `revoke execute on function public.voice_note_add(jsonb) from authenticated;`
  - plus, guarded by `to_regclass`, `drop policy if exists voice_notes_insert on storage.objects;`
  - Re-applying 0287 restores the grant and the policy; pilot rows are re-inserted by hand. A destructive rollback is never run on production, because the data is clinical.

---

## C. Recording pipeline (`src/lib/voice/voiceRecorder.ts`: a non-React controller with no Supabase import)

1. **Start, inside the tap handler, in this order:**
   1. Singleton check; refuse with «أكو تسجيل شغّال» if one is already running.
   2. Create the meter's own `AudioContext` **synchronously**, before any `await` (iOS gesture rule).
   3. Start the wake-lock path (item 5).
   4. Call `getUserMedia({audio:{channelCount:{ideal:1}, echoCancellation:true, noiseSuppression:true, autoGainControl:true}})`.
   5. Map errors with `cameraPhaseOf` (`cameraCapture.ts:18-39`) to denied, busy, unavailable or failed.
   6. With no `MediaRecorder` → «هالمتصفّح ما يدعم التسجيل الصوتي».
2. **Format (`voiceFormat.ts`, pure):**
   - Probe `isTypeSupported` in order: `audio/mp4;codecs=mp4a.40.2` (64 kbps) → `audio/webm;codecs=opus` (32 kbps) → `audio/ogg;codecs=opus` (32 kbps) → `audio/mp4` (64 kbps) → none means unavailable.
   - Always set `audioBitsPerSecond`. Afterwards store the base type from `recorder.mimeType` (strip `;codecs`; `audio/x-m4a` → `audio/mp4`), the extension, and `codecs`.
   - Windows Chrome clamps AAC to ≥96 kbps, so 5 min ≈ 3.6 MB.
3. **`recorder.start(1000)`; on every `dataavailable`:**
   - Append the `ArrayBuffer` to the **in-memory array, which is the truth** for the active clip.
   - Mirror it to IndexedDB `chunks` as `{id, seq, at_ms, buf}`, one put per chunk, each with its own `oncomplete`/`onerror`/`onabort`.
   - On `UnknownError`, `InvalidStateError`, `AbortError` or `db.onclose`: reopen once and retry that chunk.
   - On a second failure, or `QuotaExceededError`: switch the clip to **memory-only**. It shows a permanent banner, keeps `holdUpdates(Infinity)` until the server row returns, registers the leave gate (§D8) and a `beforeunload` prompt, and uploads straight from memory.
   - The clip's `alive_at` is updated per chunk; it is the fallback only (item 10).
4. **Clip row at start** (store `clips`):
   - `id = uuid()` from `@/lib/utils` (`utils.ts:83-85`; `crypto.randomUUID` alone breaks iOS < 15.4).
   - `who = outboxInternals.whoNow()` (`outbox.ts:186-189,467`).
   - Plus `pet_id`, `visit_id`, `kind`, `day`, local labels (pet name, visit date), `recorded_at` (ISO), and `state: 'recording'`.
5. **While recording:**
   - **Holds and locks:** `holdUpdates(Infinity)` (`inflight.ts:36-47`); a Web Lock `dv-voice-rec:<id>` held for the recorder's whole life; the id added to a module-level set of live clips; `onLeave(flush)` registered (§D8).
   - **Keeping the screen on:**
     - `navigator.wakeLock.request('screen')`, re-acquired on `visible`.
     - If it is missing or rejects (iOS Home Screen < 18.4), play a muted, `playsinline`, looping 1-second `public/keepawake.mp4` from `'self'` (allowed by the new `media-src`).
     - If neither can be confirmed, show the warning line from §A2. Verified on devices (§I).
   - **Meter:** `createMediaStreamSource` → `AnalyserNode` (not connected to the output), RMS at about 15 fps.
   - **Silence around the recording:** `muteSounds()` (a new counter in `sounds.ts`; `tone()` returns early while it is above 0); all voice players paused and disabled.
   - **Storage:** `navigator.storage.persist()` on the first recording.
6. **Interruptions always stop and save, and mark the clip `interrupted`:**
   - `visibilitychange` → hidden, or `pagehide`: `requestData()` then `stop()`.
   - Track `mute` or `ended` (a phone call); `recorder.onerror`; the 5:00 limit; unmount; logout (§D8).
   - On return: «وقف التسجيل لأن الشاشة انقفلت… انحفظ 0:38» + «سجّل ثاني». A continuation is always a new clip.
7. **Stop:**
   - Stop the tracks; `ctx.close()`; release the wake lock and the video.
   - Assemble the bytes from memory.
   - Compute `duration_ms` = **media duration** parsed from the container (`voiceMedia.ts`; falls back to the clock only if the parse fails).
   - For WebM, patch the EBML Duration (pure and deterministic, so the same bytes always give the same output).
   - Compute `sha256` with `crypto.subtle.digest`.
   - **Verify the mirror:** IndexedDB holds seq 0..N-1 and their byte total equals the memory total. Write any missing chunks if IndexedDB works; otherwise go memory-only.
   - Commit `state:'recorded'` with `{bytes, sha256, duration_ms}` in a transaction opened with `{durability:'strict'}`. Only then does the card say «على هالجهاز».
   - Release the Web Lock and the update hold (unless memory-only), unmute, and kick the uploader.
   - **Do not** set `navigator.audioSession` here (§E sets it only around playback).
8. **Truncation check** (the iOS 26.0–26.1 MP4 bug): if the media duration is under 60% of the clock, keep everything and say «التسجيل يمكن انقطع — اسمعه قبل ما تعتمد عليه». Never delete automatically. `audio.duration` is never read.
9. **WebM:** with the Duration element patched at stop, `<audio>` gets a real duration. Seeking is still offered only inside `seekable` (§E).
10. **Crash and tab-close recovery:**
    - A clip in `recording` is **live** if `navigator.locks.query()` shows `dv-voice-rec:<id>` held, or the id is in this tab's live set. Otherwise it is **crashed, immediately**.
    - Without Web Locks (iOS < 15.4): it counts as crashed if `alive_at` is older than 10 s, with a 10 s re-scan while any clip is in `recording`.
    - Recovery uses only the unbroken run of chunks from seq 0; it is a valid partial file. Duration is parsed from those bytes.
    - With seq 0 missing: «بداية التسجيل ناقصة — ما ينفع يتشغّل». Bytes are kept until an explicit discard.
    - The clip is shown on `/voice` and in that visit's panel: «تسجيل ما انحفظ (0:48) — بوبي، زيارة 22/11» [احفظه] [احذفه]. «احذفه» asks first in the app. Never deleted automatically.

---

## D. Upload and durability (`voiceShelf.ts` + `voiceUploader.ts` in `src/lib/voice/`; the network calls in flat `src/lib/voiceApi.ts`)

1. **IndexedDB `dv-voice` v1:**
   - `clips` (key `id`; indexes `who.user` and `visit_id`);
   - `chunks` (key `[id, seq]`);
   - `demo_audio` (key `path`; demo only).
   - The adapter sits behind an interface, so the core logic is tested with an in-memory fake.
2. **States:** `recording → saving → recorded | memory → uploading → saved (⇒ local purge) | waiting(network|server|read_only|other_clinic|other_user|not_ready) | failed(forbidden|visit|bug|id|server_file|too_big|format|local_corrupt)`.
   - Every clip carries `void_requested?: {at, reason}`, written in the same transaction as its state.
3. **When the uploader runs:**
   - Triggers: right after save, `online`, `visibilitychange` → visible, VisitPage mount, `/voice` mount, and `VoiceChip` mount when the user's own count is above 0 (it lazy-imports the uploader, which reads no i18n).
   - Backoff 5 s → 30 s → 2 min → 10 min (cap).
   - One uploader across tabs via `navigator.locks.request('dv-voice-upload', {ifAvailable:true})`, falling back to a 60 s lease in IndexedDB.
   - **One attempt per clip at a time:** attempt N+1 never starts while attempt N is unsettled.
4. **Per clip:**
   1. **Identity:** `who.user` must equal the current user (else «تسجيل لحساب ثاني»).
      - The server's clinic comes from `rpcJson("my_workspace")`. A different confirmed clinic → wait (other clinic).
      - `UNCONFIRMED` uploads under the server's clinic; this is safe because the server accepts only a visit of `auth_clinic()`.
   2. **Pre-flight:**
      - `rpcJson("voice_can_record")` must be true, else `failed('forbidden')`. The page caches the last answer per user and clinic for offline display; a never-confirmed answer hides the button.
      - `select id from clinic_visits where id = visit_id` under RLS. No row → `failed('visit')`; nothing is uploaded, so there is no orphan.
   3. **Assemble and verify:** from memory, or from IndexedDB plus the deterministic WebM patch; recompute `sha256`. A mismatch → `failed('local_corrupt')`, keeping everything.
   4. **Upload:** `voiceApi.putObject(path, blob, base, signal)`.
      - It is an **XHR** `POST {supabaseUrl}/storage/v1/object/voice-notes/<path>` with headers `authorization: Bearer <session token>`, `apikey`, `x-upsert: false`, `content-type: <base type>` and `cache-control: max-age=3600`, and the raw Blob as the body.
      - storage-js `upload()` cannot be aborted (`index.mjs:603-627`); XHR gives `abort()` and `upload.onprogress`.
      - Wrapped in `holdUntil(…)` (`inflight.ts:53-58`), so no service-worker reload happens mid-upload.
      - **Watchdog:** after 20 s without progress the label becomes «النت بطيء — يكمل». After 60 s without progress: `abort()`, then `waiting(network)`.
   5. **Create the row:** `rpcJson("voice_note_add", {p})`.
   6. **Confirm the object:** `storage.from("voice-notes").info(path)` size must equal `bytes`. If not, keep local data and retry later.
   7. **If `void_requested`:** `rpcJson("voice_note_void", …)`.
   8. **Purge local chunks and the clip.** This happens only after steps 5–7 succeed for the same id.

**Error classes** (`isNetworkError`, `outbox.ts:139-144`; `transientReject`, `outbox.ts:315-323`, now also in `outboxInternals`; `rpcJson` errors now carry `status`):

| Source | Result |
|---|---|
| Network or our own abort | `waiting(network)` |
| 401 / 408 / 429 / ≥500, `jwt expired`, `PGRST001` or `PGRST002` | `waiting(server)`, with backoff |
| Upload 409, `Duplicate` or `already exists` | treat as uploaded (the server's size check decides) |
| Upload 400/403 with "row-level security" | `failed('forbidden')` |
| Upload 413 | `failed('too_big')` |
| Upload 415 or a MIME message | `failed('format')` |
| Upload "Bucket not found"; RPC `42P01`, `PGRST202`, `PGRST205` | `waiting(not_ready)` |
| RPC `voice_forbidden` / `voice_operator` | `failed('forbidden')` |
| RPC `voice_visit` | `failed('visit')` |
| RPC `voice_bad` / `voice_path` / `23514` | `failed('bug')` |
| RPC `voice_id_taken` | `failed('id')` |
| RPC `voice_object_missing` / `voice_size` | `dropOrphan(path)`, which counts only if `storage.from("voice-notes").remove([path])` returns that path (a refused delete returns nothing, `0236:12-14`); then re-upload once; else `failed('server_file')` |

- **Permanent failures are never purged.** The exits are «أعد», «نزّله ملف» (an `<a download>` of the local Blob named `<pet>-<yyyy-mm-dd>-<m-ss>.<ext>`), and «احذفه من الجهاز».
  - «احذفه من الجهاز» is allowed only after that download, or an in-app confirmation naming the pet and the duration.
- **Pending flag:** after each shelf change, write `localStorage.vp_voice_pending = {"<user>":[n, failed]}`, counting every unsaved clip including `recording`. Dispatch `vp:voice-pending` (and the `storage` event reaches other tabs). `VoiceChip` reads it synchronously.
- **No silent «تم»:**
  - The UI states the true level (§A2).
  - Void and restore return the row; an unexpected state → `voice_stale` and the list reloads.
  - Lists are read through `voiceList` / `voiceOrphans`, which throw.
- **Read-only (expired subscription):** every write in `voiceApi` checks `isConfigReadOnly()` (`clinicSync.ts:26`). Pending clips wait with «الاشتراك منتهي — يرتفع بعد التجديد». The record button is hidden; listening works.
- **Logout:**
  - `inflight.ts` gains `onLeave(fn)`, `settleLeave(ms)` and `setLeaveGate(fn)`.
  - `signOut(opts?)` (`AuthContext.tsx:621-672`):
    - First: if `!opts?.force` and the gate reports memory-only clips, it does not sign out. The voice chunk opens its own in-app sheet «تسجيلات بالذاكرة بس (n)» with [ارفعها هسة] [نزّلها ملف] [اطلع وضيّعها (n)]. The sheet is rendered in its own root, because `AuthProvider` sits outside the router (`App.tsx:429-435`). The last button calls `signOut({force:true})`.
    - Then: `settleLeave(2500)` runs before the hard navigation. A running recording stops and its final chunk and strict commit are awaited, and an in-flight upload gets that same window.
  - **Other tabs:** they get `SIGNED_OUT`, which only redirects softly (`AuthContext.tsx:312`, `App.tsx:95`), so the unmount stop saves the clip.
  - **Persisted unsent clips are not purged.** They are stamped work waiting for their author, as the outbox does (`outbox.ts:396`). Other users see «تسجيل لحساب ثاني (n)».
  - Trade-off: a shared device holds the audio until it uploads. This is an owner decision.
- **Orphans:**
  - The client removes an orphan only on a permanent rejection or an explicit discard, and only its own (`owner_id`).
  - Referenced files are kept forever (`voice_notes_keep`).
  - **Pet deletion purges nothing:** rows and files survive (soft `pet_id`), and `repo.deletePet` (`repo.ts:655-669`) is unchanged.
  - The owner's orphan query is in §I.

---

## E. Playback

- **CSP, measured by the design author:**
  - With the current `vercel.json:20`, `<audio src=blob:>` and `<audio src=https://*.supabase.co/…>` both raise a `media-src` violation.
  - With the change below, both reach `loadedmetadata`. `fetch(blob:)` stays blocked (`connect-src`), so a blob URL is never fetched; the Blob object is used.
  - New `vercel.json:20` value (one directive added, nothing else changed): `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com; media-src 'self' blob: https://*.supabase.co; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`
  - `'self'` is also what lets the keep-awake video play (§C5).
- **Service worker** (`vite.config.ts:144-156`): exclude the bucket, so audio skips Cache Storage and range requests reach Supabase unchanged:
  `urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/") && !url.pathname.includes("/voice-notes/")`.
- **Signed URLs:**
  - `voiceApi.sign(paths)` makes one `createSignedUrls(paths, 3600)` call (**1 h**) and **throws** on error (unlike `withSignedMedia`, `repo.ts:529-540`). A path missing from the result shows «ما انحمّل — أعد».
  - Deleted notes the viewer may not hear fail signing by policy and are drawn without a player.
  - Paths are signed in a batch at list load; re-signed by a 45-minute timer while mounted, and on `visible` when older than 45 min. That keeps `play()` synchronous inside the tap (iOS) and limits how long a deleted note stays audible in already-open screens to 1 h.
- **Element:** `<audio preload="none">`, no `crossorigin`. On tap, synchronously:
  1. `src = url; preload = "auto"; playbackRate = rate;`
  2. if `navigator.audioSession` exists: `type = 'playback'`;
  3. `play()`.
  - On `pause` or `ended`: `audioSession.type = 'auto'`, so UI tones keep respecting the silent switch.
- **Errors:**
  - `NotAllowedError` → «اضغط تشغيل مرّة ثانية».
  - **"Format not supported" is decided only by `canPlayHere(mime, codecs)`** (`canPlayType`).
  - Error code 4 on a playable format means fetch failure or expiry (the spec's "dedicated media source failure steps") → re-sign that path and retry once (on iOS at the next tap) → otherwise «الصوت ما انحمّل — أعد».
- **Opus where `<audio>` cannot play it** (iPhone ≤ 17.3):
  - `fetch(signedUrl)` (allowed by `connect-src`) → `decodeAudioData` → `AudioBufferSourceNode` with the same controls.
  - The speed chip is off there, because `playbackRate` would shift the pitch.
  - If decoding fails: «هالجهاز ما يشغّل هالصيغة (opus) — اسمعها من جهاز ثاني أو حدّث النظام».
- **Seeking:**
  - Allowed only inside `audio.seekable`; when that is empty the bar shows progress only.
  - A seek into an unbuffered range waits for `progress`.
- **Local clips:** play from `URL.createObjectURL(new Blob(chunks, {type}))`, revoked on unmount.

---

## F. Demo mode (`src/lib/demoVoice.ts`, flat; `loadDemoVoice = () => import("./demoVoice")` in `repoDemo.ts` next to `:5667`)

- **Same contract and rules as cloud:**
  - list, orphans, add, void, restore, sign;
  - `editMedical` and not an owner;
  - the author's 24 h window on an open visit, the manager at any time;
  - deleted audio only for the manager;
  - `history`; idempotent add; `recorded_at` clamp.
  - The pilot does not apply in demo.
- **Storage:** rows in localStorage `vp_demo_voice`; audio in the IndexedDB `demo_audio` store, never in the demo DB (`demoStore.ts:367-385` would throw `DemoQuotaError`). Signing returns `blob:` URLs.
- **Caps:** 2:00 per note and 30 notes per device, each stated in the UI, with the banner «بالتجريبي: التسجيل يبقى بهالجهاز».
- It imports only `./voiceApi` (types and pure helpers), `./repoDemo` and `./voice/*`; never Supabase.

---

## G. i18n

- **New owned namespace `vnote`.** In `src/i18n/hot-paths.json` `owned`:
  `"vnote": { "owner": "src/components/voice/VoiceNotes.tsx", "with": ["src/components/voice/VoicePlayer.tsx", "src/components/voice/VoiceRecorderUi.tsx"] }`
  - Cold keys are closed: `arCold` is at 49,942 of 50,000 (`memory/state.md:52`).
  - TreatmentPlan cannot read `vbk`, because it is statically imported by `PetPassport.tsx:50` and `VisitPage.tsx:25`.
- **Loading:**
  - The owner exports `VoiceNotesPanel`, `VoiceRecorder`, `VoicePlanSlot`, `VoiceChips`, `VoiceShelfPage` and the leave-gate sheet.
  - Each is loaded only as `page(() => import("@/components/voice/VoiceNotes").then((m) => ({ default: m.X })), ["vnote"])`:
    - from VisitPage (next to `:66-71`);
    - from TreatmentPlan (as `PhotoSource`, `:40-42`);
    - from **App.tsx** for the `/voice` route.
  - **Never from TopBar, Sidebar or any other boot module:** `i18n-hot-guard.mjs:340-353` treats only App.tsx and routePrefetch as gated.
  - Companions are imported only by the owner. No `t()` runs at module level.
  - The `vnote` chunk must stay ≤ 8,000 B gzipped and be listed in `sw.js` (`store-weight-guard.mjs:254-262`).
- **Shared types** (`VoiceRef`, `VoiceRow`, slot and renderer props) live in `src/lib/voice/voiceTypes.ts`. `ClinicalRecord.voice` lives in `clinicalRecord.ts`. Nothing outside the vnote family imports from `src/components/voice/*`, not even `import type` (`i18n-owned-guard.mjs:47-56`).
- **Boot chip keys (hot `outbox` namespace, measured with store-weight-guard):**
  - `outbox.voice` «تسجيلات ما ارتفعت: {{n}}»
  - `outbox.voiceOthers` «تسجيلات لحساب ثاني: {{n}}»
  - `outbox.voiceFailed` «تسجيلات ما ارتفعت — تحتاجك: {{n}}»
- **`vnote` keys (ar | en; `en.json` is the base, same keys in both):**
  - `rec.*`:
    - start, hint, explain «راح يطلب المتصفّح إذن المايك — اسمح حتى تسجّل», starting, live, stop, cancel, cancelAsk, cancelYes, cancelNo;
    - near, limit, short, silent, cutHidden, cutTrack, cutClosed, again, busyOther;
    - memoryOnly «هالجهاز ما قدر يحفظ التسجيل عليه — لا تسكّر الصفحة لحد ما يرتفع», maybeCut, lowSpace «مساحة الجهاز قليلة — التسجيل يمكن ما ينحفظ عليه», wakeWarn «الشاشة تنطفي حسب قفل الجهاز — ارفع مدة القفل قبل تسجيل طويل».
  - `mic.*`: denied, busy, unavailable, failed, unsupported.
  - `st.*`:
    - saving «دنحفظ…», local «على هالجهاز — خلّي التطبيق مفتوح لحد ما يصير انرفع ✓», memory «بالذاكرة بس — لا تسكّر الصفحة لحد ما يرتفع»;
    - uploading «دنرفع… {{pct}}%», slow «النت بطيء — يكمل», saved «انرفع ✓», waiting, server «السيرفر ما جاوب — يرجع يحاول وحده», notReady;
    - readOnly, otherClinic, otherUser, failed «ما ارتفع: {{why}}», retry, voidPending «انحذفت — تنرفع للمحذوفات».
  - `shelf.*`: title, crashed, noHead «بداية التسجيل ناقصة — ما ينفع يتشغّل», save, discard, download «نزّله ملف», discardAsk «تحذف التسجيل اللي على هالجهاز ({{dur}}) — {{pet}}؟ ما ارتفع، فما يرجع. نزّله ملف أوّل».
  - `leave.*`: title, body, upload, download, discard.
  - `list.*`: title, empty, failed, retry, trash.
  - `orph.*`: title «تسجيلات حيوانات انحذفت ({{n}})», empty.
  - `kind.*`: note, day, plan, closing.
  - `play.*`: play, pause, speed, cant, loadFailed, again, hidden «الصوت محجوب بعد الحذف», late «وصل السيرفر {{time}}».
  - `del.*`: btn, ask, reason «السبب (اختياري، يشوفه الكادر)», done, by, restore, restored, history «انحذفت {{when}} — رجعت {{when2}}».
  - `err.*`: forbidden, visit, operator, voidForbidden, restoreForbidden, gone, stale, bug, id, serverFile, tooBig, format, localCorrupt. Their text matches the server hints.
  - Misc:
    - `plan.line` «🎙 ملاحظة صوتية مرفقة ({{n}} · {{dur}})» and `plan.notUp` «تسجيل {{name}} ({{dur}}) ما ارتفع بعد من جهازه»;
    - `demo.note`;
    - `readOnly` «الاشتراك منتهي — تسمع وما تسجّل».
- **Outside `vnote`:**
  - `vbk.voiceBtn` and `vbk.voiceMark` (`vbk` is owned by VisitPage).
  - `act.voiceAdd` «سجّل ملاحظة صوتية لـ {{pet}}», `act.voiceVoid`, `act.voiceRestore`, `act.voiceDel` «انمسحت ملاحظة صوتية لـ {{pet}} من القاعدة» (`act` is owned by ActivityLog). ActivityLog tells void from restore by `__changed.voided_at[1]` being null.
- **i18n-guard caps:**
  - New files start at cap 0 (`i18n-guard.mjs:188`). Existing caps must not rise: VisitPage 45, TreatmentPlan 33, ClinicalRecordCard 20, TopBar 1, ActivityLog 6.
  - TreatmentPlan gets **no** Arabic literal; its voice line comes from the slot through `onChange(refs, line, busy)`.

---

## H. Tests

### `supabase/tests/run.sh`

- Append `$MIG/0287_visit_voice_notes.sql` to `WAVE` (`run.sh:30`; enforced by `migration-idempotency.mjs`). 0287 is also re-applied by the `_m0252` loops (`run.sh:6408-6416`); the drift guard passes there through its marker (`0252` `_drift_assert`).
- New section after the 0285 block and **before** `rollback_0222` (`run.sh:11743-11761`), plus post-rollback lines after `:11762`.
- Calls go through `rv()` (`_v0252`, `run.sh:6434-6441`) and `_rls_try` (`run.sh:1239-1245`).
- The operator is set up as at `run.sh:5499`.

**Seed** (`VV=c2870000-0000-4000-8000-0000000000`):
- **Users:**
  - `e1` vet C1 (staff name «د. علي»), `e2` vet C1, `e3` receptionist C1, `e4` manager C1;
  - `e5` pet owner (profile role `owner`, no membership);
  - `e6` vet C2, `e7` vet C3.
  - Profile roles are set in the section, because the suite's `is_clinic_staff()` reads `profiles.role` only (`harness.sql:52-55`).
- **Pets:** `a1` C1 «بوبي», `a2` C2, `a3` C1 «ميشو» (used only by the deletion check), `a5` C3.
- **Visits:**
  - `b1` C1 open (`a1`); `b2` C1 ended (`a1`, opened now−2d, ended now−1d);
  - `b3` C2 open; `b4` C1 open (`a3`); `b5` C3 open.
- **Pilot:** 0287 seeded the all-clinics row; the section empties `voice_pilot`, inserts C1 and C2 (not C3), and restores the all-clinics row at its end (also assert the first-apply seed: before emptying, `voice_pilot` holds exactly the all-clinics row, and a re-apply after `delete` leaves it empty).
- **Helper:** `_vj(id, pet, visit, kind, day, clinic, …)` builds the payload.

**Checks:**

1. **Shape:**
   - no foreign keys on `visit_voice_notes`; the two indexes; `path` unique; RLS enabled;
   - exactly 2 policies (select + `photographer_fence_sel`); `voice_pilot` has RLS on and 0 policies;
   - `verify_photographer_fence()` = '', `verify_no_self_ref_policies()` = 0, and `verify_rls_coverage()` names neither table.
2. **Static definer check:**
   - The three writers and the four helpers: `prosecdef`, `proconfig` contains `search_path=public`, and the writers' `prosrc` contains `clinic_id = v_clinic`.
   - `voice_orphans` is invoker.
   - `anon` cannot execute `voice_note_add`.
3. **Add:** `e1` adds → `clinic_id=C1`, `created_by=e1`, `doctor_name='د. علي'`, `pet_name='بوبي'`, `path=C1/a1/<id>.m4a`. The same payload again → same row, count 1. The same id with another `sha256` → `voice_id_taken`.
4. **Clamps:**
   - `duration_ms` 999999 → stored 600000; `codecs` "BAD CODEC" → null;
   - `recorded_at` two days before `opened_at` → `opened_at` − 10 min;
   - `recorded_at` an hour in the future → ≤ now + 10 min.
5. **Refusals:**
   - `e3`, `e5` and `e7` (C3 is not in the pilot) → `voice_forbidden`.
   - `e6` (C2) adding to C1's visit → `voice_visit`; visit `b1` with pet `a2` → `voice_visit`.
   - A wrong path → `voice_path`; kind `day` without a day → `23514`.
6. **Operator** (ADM acting in C1): add, void and restore → `voice_operator`; `_rls_try(ADM,'select 1 from visit_voice_notes')` = `rows:N`; reset afterwards.
7. **Direct writes as `e1`** (with the blanket grant present): insert → `guarded:42501`; update → `rows:0`; delete → `rows:0`. This proves RLS; check 15 proves the revokes.
8. **Isolation:** reads by `e1` and `e3` = N; by `e6`, `e5` and PHO = 0.
9. **Delete and restore:**
   - `e2` deletes `e1`'s note → `voice_void_forbidden`.
   - `e1` deletes it → `voided_by=e1`, `voided_name='د. علي'`, `history` has length 1 with `a=void`. Again → unchanged.
   - `e3` restores → forbidden. `e1` restores → the void columns are null and `history` has length 2 (void, restore).
   - `e6` deletes a C1 note → `voice_gone`.
10. **Ended visit `b2`:**
    - an add with an in-window `recorded_at` is accepted;
    - an add with `recorded_at` after `ended_at` + 10 min is clamped to `ended_at` + 10 min, and `created_at > ended_at` (the UI's «وصل السيرفر» case);
    - `e1` delete → forbidden; `e4` delete → ok; `e4` restore → ok.
11. **Audit:**
    - the INSERT row has `details->>'pet_name'='بوبي'` and `doctor_name`; the UPDATE row has `__changed.voided_at`;
    - `audit_kind('visit_voice_notes', …)` = `medical` for the three new cases in `scripts/activity-cases.json` (read at `run.sh:1045-1048`).
12. **Helpers:**
    - `voice_object_free`: a referenced path → false; a random path → true.
    - `voice_object_readable` for a deleted note: `e3` → false; `e4` → true; `e1` (the deleter) → false. An unreferenced path → true.
13. **Storage stub matrix.** Build a Supabase-shaped schema:

    ```sql
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
      owner_id text default current_setting('request.jwt.claim.sub', true), metadata jsonb, created_at timestamptz default now(),
      unique (bucket_id, name));
    create function storage.foldername(name text) returns text[] language sql immutable as
      $f$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $f$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant execute on function storage.foldername(text) to authenticated;
    ```

    - Recreate 0222's `photographer_fence` storage policy with its exact text (`0222:271-277`).
    - Re-run 0287 → 7 `voice_notes%` policies, and the bucket row reads `false | 10485760 | {audio/mp4,audio/webm,audio/ogg}`.
    - **Uploads:**
      - `e1` inserting `C1/a1/<uuid>.m4a` → `rows:1`.
      - Into a C2 folder, a one-level path, or a `.mp3` → `guarded:42501`.
      - `e3`, `e5`, ADM (acting) and `e7` → `guarded:42501`.
    - **Reads:** `e6` and PHO selecting C1 objects → `rows:0`.
    - **Object check inside `voice_note_add`:** no object → `voice_object_missing`; metadata `{"size":1}` → `voice_size`; the right size → ok.
    - **Delete and update:**
      - deleting a referenced path as `e1` → `rows:0`; updating any voice object → `rows:0`;
      - an unreferenced object uploaded by `e1`: deleted by `e2` → `rows:0`, by `e1` → `rows:1`.
    - **Deleted note's object:** select by `e3` → `rows:0`; by `e4` → `rows:1`; by `e1` (the deleter) → `rows:0`.
    - The cross-bucket query from §I returns 0 rows.
    - Finally `drop schema storage cascade`.
14. **Pet deletion survives** (`a3`/`b4`):
    - `e1` adds on `b4`.
    - `_rls_try(e3,'delete from pets where id=a3')` → `rows:1`. This also documents today's gap: reception can delete a pet.
    - The voice rows of `a3` are all still there; `voice_object_free(path)` = false; `rv(e4,'select count(*) from voice_orphans()')` ≥ 1 with `pet_name='ميشو'`.
15. **Re-apply and privileges:**
    - `Q287` (policies | columns | rows | indexes) is identical before and after re-running 0287 (the Q/Z pattern of `run.sh:11007-11012`).
    - Then: `has_table_privilege('authenticated','public.visit_voice_notes', 'insert'|'update'|'delete')` = false; `has_function_privilege('authenticated','public._voice_author()','execute')` = false; `has_table_privilege('authenticated','public.voice_pilot','select')` = false.
16. **Soft rollback and kill switch:**
    - Run `rollback_0287_soft.sql` → `e1` add → 42501, and the list still reads.
    - Re-apply 0287 and re-insert C1 into the pilot → add works.
    - `delete from voice_pilot where clinic_id = C1` → `voice_forbidden`; re-insert.
17. **After `rollback_0222`:** re-applying 0287 succeeds (the fence call is guarded), and `e1` can still add through the `auth_role()` fallback.

### `scripts/voice-test.mjs`

esbuild-bundled like `attach-test.mjs:15-60`; added to both the `lint` and `build` chains in `package.json`.

- **`voiceFormat`:**
  - `isTypeSupported` matrices: Safari → `mp4a.40.2` at 64 kbps; Windows Chrome → AAC; Linux Chrome → webm/opus at 32 kbps; Firefox → webm/opus; none → unavailable.
  - `baseMime`, `ext` and `codecs` for `audio/mp4; codecs="mp4a.40.2"`, `audio/webm;codecs=opus`, `audio/x-m4a`, and `video/webm` → null.
  - `fmtDuration(42000)` = `0:42`; `canPlayHere`.
- **`voiceMedia`:**
  - Fixtures in `scripts/fixtures/voice/`: real WebM/Opus and Ogg/Opus recorded with headless Chrome and Firefox, plus synthetic fMP4 box sequences in Safari's and Chrome's layouts (`mvhd`/`mdhd` duration 0, per-sample `trun` durations, `tfhd`/`trex` defaults).
  - Parsed durations within ±50 ms.
  - `patchWebmDuration` is deterministic (same sha256 twice) and its output parses back to the patched duration.
  - A real iPhone file captured after rollout is added later.
- **Shelf core** (in-memory IndexedDB fake):
  - a put rejecting at seq k → reopen once → memory-only, and the full bytes are still uploadable;
  - seq 0 missing → `noHead`, with bytes kept;
  - reopen-then-continue; the `'local'` label only after the strict commit.
  - `who` gating; `UNCONFIRMED`; the backoff sequence; the pending flag per user, including failed and `recording`.
  - Liveness: Web Lock held → live; free → crashed immediately; no Web Locks → 10 s rule.
  - Order with `void_requested`: add → info → void → purge. Permanent failures are never purged.
- **Uploader error classes:**
  - network/abort → waiting; 401/429/502/`PGRST001` → waiting; RLS 403 → `failed('forbidden')`;
  - 409/`Duplicate` → treated as uploaded; 413 → failed;
  - `voice_object_missing` → `dropOrphan` + one re-upload; `remove()` returning `[]` → no re-upload, `failed('server_file')`.
  - **One attempt at a time:** a trigger during an in-flight attempt starts nothing; the watchdog aborts after 60 s without progress.
- **Sounds:** with a fake `AudioContext`, `playTap()` creates no oscillator while `muteSounds()` holds, and does after release.
- **Demo `voiceApi`:** the same rules as run.sh checks 3–12; a failing store **throws** and never returns `[]`.
- **Wiring checks** (source):
  - `vercel.json` has `media-src 'self' blob: https://*.supabase.co`; the `vite.config.ts` media cache excludes `/voice-notes/`.
  - Voice UI is loaded only through `page(…, ["vnote"])`, from VisitPage, TreatmentPlan and App.tsx.
  - `VoiceChip` is mounted in both `TopBar.tsx` and `Sidebar.tsx`.
  - No `window.confirm` in `src/components/voice/`.
  - No `t(` or `useTranslation` in `src/lib/voice/*` or `src/lib/voiceApi.ts`, which are reachable from boot through VoiceChip's lazy import.
  - No Supabase import under `src/lib/voice/`.
  - The upload sends `x-upsert: false` and `max-age=3600`; `storage.from("voice-notes")` uses a literal (the `images-test.mjs:192-200` scan).
  - The recorder takes a Web Lock and calls `holdUpdates`.
  - TreatmentPlan passes `visitId` and adds no Arabic literal.

### Guard updates

- `fetch-guard.mjs`: `DECISION_LISTS` += `"voiceList"`, `"voiceOrphans"`; `DECISION_SOURCES` += `"src/lib/voiceApi.ts"`; `CRITICAL_SCREENS` += `"src/components/voice/VoiceNotes.tsx"`, `"src/lib/voice/useVoiceVisit.ts"`.
- `need-void-guard.mjs`: `SOURCES` += `["src/lib/voiceApi.ts", /rpcJson(?:<[^>]*>)?\(\s*"([a-z_0-9]+)"/g]`. All voice RPCs go through `rpcJson`; `voice_orphans` is paged with `.range()` outside it.
- `redefine-fingerprint.mjs`: `FEATURE` += `"0287"`; `MANIFEST` += `["audit_kind", 3, "public.audit_kind(text,text,jsonb)", "0271", "0287"]`.
- `activityKinds.ts:98-100`: `visit_voice_notes` → `medical`. `scripts/activity-cases.json`: three cases (INSERT, UPDATE with `__changed.voided_at`, DELETE) → `medical`.

### Live test: `scripts/live/voice.mjs` (+ `"live:voice"` in `package.json`)

The pattern of `scripts/live/backdate.mjs:1-30`: Playwright Chromium against the demo dev server, with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.

1. Record 3 s → the card shows ≈`0:03` and «انرفع ✓», and the demo store has the row.
2. Play → `currentTime` advances; 2× → `playbackRate === 2`.
3. A day voice note → a chip appears in that day's row of الطبلة.
4. `page.reload()` 2 s into a recording → `VoiceChip` shows 1 → `/voice` → «احفظه» → the note appears with ≈2 s.
5. With the network throttled, «حذف» right after stop → «انحذفت — تنرفع للمحذوفات» → the row arrives deleted → restore.
6. Record in the wizard → save the plan → the plan card shows the chip.
7. Fail `IDBObjectStore.put` after 3 chunks → memory-only banner → the upload still completes. A logout attempt while a memory-only clip exists → the leave-gate sheet.
8. Logout during a recording → the clip is saved.
9. CSP on the built output: serve `dist` with the `vercel.json` headers. A `blob:` clip must reach `loadedmetadata` with no `securitypolicyviolation`.

---

## I. Rollout

1. **Database first.** The owner pastes 0287 as-is, then runs:

   ```sql
   select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'voice-notes';   -- false | 10485760 | {audio/mp4,audio/webm,audio/ogg}
   select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'voice_notes%';   -- 7
   select count(*) from pg_policies where schemaname = 'public' and tablename = 'visit_voice_notes';   -- 2
   select count(*) from verify_rls_coverage() v where v."الجدول" in ('visit_voice_notes','voice_pilot');   -- 0
   select coalesce(string_agg(t, ','), '') from verify_photographer_fence() t;   -- ''
   select count(*) from verify_no_self_ref_policies();   -- 0
   select public.audit_kind('visit_voice_notes','INSERT','{}');   -- medical
   select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and permissive = 'PERMISSIVE'
      and coalesce(qual, '') not like '%bucket_id%' and coalesce(with_check, '') not like '%bucket_id%';   -- 0 rows
   ```

   - Also confirm the project-wide Storage upload limit is ≥ 10 MB.
   - A `drift_body` refusal means production's `audit_kind` is not 0271's. Stop and compare.
2. **No pilot step** (owner's decision): 0287's first apply opens recording to every clinic. Confirm: `select clinic_id from public.voice_pilot;` → the all-clinics row.
3. **Frontend only on the owner's explicit word.** The CSP, the service-worker exclusion and the UI go in the same push.
   - The UI hides itself if 0287 is missing (`42P01`/`PGRST205`/`PGRST202`, as `rxApi.ts:57-59`).
   - Count it deployed only after measuring the live site:
     - `curl -sI https://www.doctorvet.vet/ | grep -i content-security-policy` shows `media-src`;
     - `main-*.js` lists the vnote chunk;
     - `store-weight-guard` passes with `main ≤ 355,000` (last measured 351,245, `memory/state.md:52`). The boot additions (VoiceChip, three hot keys, leave hooks, the sounds mute, the signOut gate, the route, `outboxInternals`) are estimated at about 1.2 KB gzipped.
     - If over budget: drop VoiceChip and show the indicator on Dashboard and VisitPage only.
4. **Device checks right after the frontend deploy (the owner's clinic first), on real devices:**
   - **Devices:** iPhone in a Safari tab and as a Home Screen app (17.x, 18.x, 26.x); Android Chrome (tab and installed); Windows Chrome.
   - **Data:**
     - `select mime, codecs, duration_ms, bytes, recorded_at, created_at from visit_voice_notes order by created_at desc limit 10;` — compare with what was said.
     - `select name, owner_id, metadata->>'size', metadata->>'mimetype' from storage.objects where bucket_id = 'voice-notes' order by created_at desc limit 10;` — `owner_id` must be the uploader's uid, with size and mimetype filled.
   - **Scenarios:**
     - cross-device playback (iPhone ↔ Chrome fMP4/WebM);
     - a 2-minute dictation on an iOS 17.x Home Screen app (screen stays on?);
     - an incoming call; airplane mode then reconnect; killing the app mid-recording, then recovery;
     - the silent switch (UI tones silent after recording, clips audible);
     - logout during a recording; delete right after stop.
5. **Kill switch:** `delete from public.voice_pilot;` (recording stops everywhere, listening keeps working).
   **Re-open:** `insert into public.voice_pilot (clinic_id) values ('00000000-0000-0000-0000-000000000000');`
6. **A week later, measure:**
   - `select mime, codecs, count(*), avg(duration_ms) from visit_voice_notes group by 1,2;` — any `opus` rows mean older iPhones use the decode fallback.
   - Orphans:

     ```sql
     select name, created_at from storage.objects o
      where bucket_id = 'voice-notes' and created_at < now() - interval '7 days'
        and not exists (select 1 from public.visit_voice_notes v where v.path = o.name);
     ```

     Delete any from the dashboard; SQL deletion does not remove the file.
7. **Backups:** database backups contain rows but not Storage files (to verify against Supabase's docs). The keep-forever policies are the protection; an optional periodic bucket export is the owner's choice.
8. Update `memory/state.md` (0287, branch, rollout state); add a CLAUDE.md lesson after shipping; put the plan in `docs/voice-notes-plan.md`.

---

## J. Files, and the order to build them

**Add:**
- `supabase/migrations/0287_visit_voice_notes.sql` — §B.
- `supabase/tests/rollback_0287_soft.sql` — empty the pilot, revoke `voice_note_add`, drop the insert policy.
- Flat in `src/lib/`, importing `"./supabase"` (§33):
  - `src/lib/voiceApi.ts` — cloud and demo facade: `voiceList`, `voiceOrphans`, `sign`, `putObject` (XHR), `info`, `canRecord`, `addNote`, `voidNote`, `restore`, `dropOrphan`.
  - `src/lib/demoVoice.ts` — demo twin.
- `src/lib/voice/` — pure or IndexedDB code only, never Supabase:
  - `voiceTypes.ts`;
  - `voiceFormat.ts`;
  - `voiceMedia.ts` (container duration, WebM Duration patch);
  - `voiceShelf.ts` (IndexedDB adapter + state machine + pending flag);
  - `voiceRecorder.ts`;
  - `voiceUploader.ts` (imports `../voiceApi`);
  - `useVoiceVisit.ts`.
- `src/components/voice/VoiceNotes.tsx` — owner of `vnote`: panel, recorder, plan slot, chips, `/voice` page, leave-gate sheet. Companions: `VoicePlayer.tsx`, `VoiceRecorderUi.tsx`.
- `src/components/VoiceChip.tsx` — boot code; hot `outbox.voice*` keys; navigates to `/voice`.
- `public/keepawake.mp4` (~2 KB).
- `scripts/voice-test.mjs`, `scripts/fixtures/voice/*`, `scripts/live/voice.mjs`, `docs/voice-notes-plan.md`.

**Change:**
- `vercel.json:20` (`media-src`); `vite.config.ts:149` (exclude `/voice-notes/`).
- `src/App.tsx`: the `VoiceShelf` page loader with `["vnote"]` and the `<Route path="/voice">` under `Protected` + `ClinicOnly`.
- `src/components/TopBar.tsx:174` and `src/components/Sidebar.tsx:194`: `<VoiceChip />` next to `OutboxChip`.
- `src/contexts/AuthContext.tsx:621-672`: `signOut(opts?: {force?: boolean})` with the leave gate and `settleLeave(2500)` before `finish`, plus the `AuthState` type.
- `src/lib/inflight.ts`: `onLeave`, `settleLeave`, `setLeaveGate`.
- `src/lib/sounds.ts:37-50`: a `muteSounds()` counter; `tone()` returns early while it is held.
- `src/lib/outbox.ts:467`: add `transientReject` to `outboxInternals`. No other change; `whoNow` is already there.
- `src/lib/rpcJson.ts:13-26`: copy the response `status` onto thrown errors (additive for consumptionApi, pnlApi and flockApi).
- `src/pages/VisitPage.tsx`:
  - lazy loaders (`:66-71`); the owner and `voice_can_record` gate; `useVoiceVisit`;
  - the button (`:985`); the recorder plus `dismissible` in the note modal (`:1078-1085`) and the plan modal (`:1064-1075`);
  - the panel (`:1012-1035`); the `voiceOfDay` renderer (`:1356`, `:1430-1432`, `:1518-1520`);
  - the `voiceSlot` (`:1008`); `visitId` passed to TreatmentPlan (`:1075`); print markers (`:693-703`).
- `src/components/TreatmentPlan.tsx`:
  - a `visitId` prop (`:157-175`); the lazy `VoicePlanSlot` (after `:40-42`, rendered at `:873`);
  - voice state in `hasContent` (`:389`); `canSave` blocked while recording (`:390`);
  - the `onChange` line (`:429`); `buildRecord` adds `voice` (`:482`); `done.diagnosis` (`:494`); `busy` reported up for `dismissible`.
- `src/lib/clinicalRecord.ts:16-38`: `voice?: { id: string; ms: number; by?: string }[]` (additive).
- `src/components/ClinicalRecordCard.tsx:43,160-164`: `voiceSlot?: ReactNode`.
- `src/lib/repoDemo.ts:5667`: `loadDemoVoice`.
- `src/pages/ActivityLog.tsx:322-374`: the `visit_voice_notes` case (add, void, restore, delete). `src/lib/activityKinds.ts:98-100`; `scripts/activity-cases.json`.
- `src/i18n/hot-paths.json`, `src/i18n/ar.json`, `src/i18n/en.json`.
- `supabase/tests/run.sh`: `WAVE`, the §H section, the post-rollback lines.
- `scripts/redefine-fingerprint.mjs`, `scripts/fetch-guard.mjs`, `scripts/need-void-guard.mjs`, `package.json` (lint + build + `live:voice`), `memory/state.md`.

**Not changed:** `src/lib/repo.ts` (no `purgePet`) and `src/pages/ClinicRecords.tsx`.

**Order:**
1. 0287, the soft rollback, the run.sh section with the storage stub, `WAVE` and the fingerprint manifest → `PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/run.sh` green.
2. `voiceFormat`, `voiceMedia` with fixtures, and the shelf core → voice-test.
3. `voiceApi`, `demoVoice` and the uploader → demo behaviour tests; the fetch-guard and need-void-guard updates; `rpcJson` status; `outboxInternals.transientReject`.
4. The recorder (Web Locks, wake-lock fallback, IndexedDB mirror), the sounds mute, the inflight leave hooks, and `signOut`.
5. The vnote components, keys and owned entry, the `/voice` route, and `VoiceChip` with its hot keys → the i18n guards and store-weight-guard.
6. Wire VisitPage, TreatmentPlan, `clinicalRecord` and `ClinicalRecordCard`; ActivityLog and the kinds.
7. CSP, the service-worker exclusion, and their static assertions.
8. The live test on demo with the fake microphone.
9. `npm run lint && npm run build`, then run.sh.
10. The owner pastes 0287 → verify → the owner's word → push → measure the live site → device checks (kill switch at hand).

---

## K. Later, if the owner chooses: transcription

- **What it would take:**
  - A Supabase Edge Function `voice-transcribe`, with the provider key as a server secret (never `VITE_`, CLAUDE.md §1).
  - Opt-in per clinic, toggled by the manager.
  - New columns `transcript`, `transcript_status`, `transcript_model`.
  - The text is shown as an editable draft labelled «نص آلي — راجعه»; the audio stays the record.
  - No CSP change, because the function is on `*.supabase.co`.
- **Quality:** the best benchmarked model reaches about 28% word error rate on Iraqi Arabic (Almieyar), and medical terms, often said in English, will do worse. A draft, never a replacement.
- **Cost:** about $9 per 1,000 two-minute notes at the rates quoted earlier; re-check before deciding.
- **Privacy:** patient audio, owner names and phone numbers leave for a third party, and default provider log retention is up to 30 days. This needs the owner's decision and the clinics' consent. Not built.

---

## Decisions (owner, 22/11)

Answered by the owner:
- **Branch:** `claude/saas-project-b2hfi6` reset to `main`; old history at `claude/saas-project-b2hfi6-old`.
- **Who deletes:** the author within 24 h while the visit is open, the manager at any time. Deletion is always recoverable.
- **After a deletion:** only the manager can hear the audio. Staff still see that a note was deleted, by whom and why. The deleter may restore (undo) within 24 h.
- **Maximum length:** 5 minutes per clip, then «سجّل جزء ثاني».
- **Rollout:** all clinics at once, with the kill switch `delete from public.voice_pilot;`.

Defaults the owner did not change (each can be revisited):
- **Who listens:** all clinic staff except the photographer.
- **Who records:** whoever holds «السجلات الطبية» (`editMedical`): vets and managers by default.
- **Pet owners:** no access in v1.
- **Shared devices at logout:** unsent recordings stay on the device until their author signs in there again.
- **Deleted pets:** voice notes stay in a manager-only archive.
- **Retention:** kept forever (≈0.5 MB per minute).
- **After the visit is closed:** no new recordings (like text notes).
- **Transcription:** off; it needs a separate decision (external provider, privacy, cost — §K).

## Existing problems found while checking (not fixed here; worth separate tasks)

- **Any staff member can delete a pet and its whole medical history** through a generic «cannot be undone» dialog, with no permission check and no trash (`ClinicRecords.tsx:286-292,751`; `Sidebar.tsx:101`; `App.tsx:346`; `0014:22-36`).
- **`addNote` has no try/catch and no busy state**, so a double tap writes two notes (`VisitPage.tsx:514-519,1082`).
- **These lists swallow errors through `listOf`** (`repo.ts:181-184`):
  - `listPetNotes` (`:792-794`) and `listMedia` (`:899-902`);
  - `listTreatments` (`:1035-1037`).
- **`withSignedMedia` swallows signing errors** (`repo.ts:529-540`).
- **`primary` is the oldest plan, not the newest** (`VisitPage.tsx:329`).
- **The lab photo taken in the wizard is not linked to the visit** (`TreatmentPlan.tsx:224`).
- **`describeUploadError` says "max 2 MB" and "pick an image" for every bucket** (`errors.ts:208-214`).
- **The plan modal's close guard uses `window.confirm`** (`VisitPage.tsx:1069`).
## ما نزل بالنسخة الأولى وما تأجّل (٢٢/١١)

**بُني ومفحوص** (`voice-test` ٩٢، قسمُ run.sh +٩٨، `live:voice` ٢٦ بمايكٍ مزيَّف بكروميوم حقيقيّ):
- 0287 كاملةً: الجدول، الدلو وسياساتُه السبع، الدوالّ الثلاث، `voice_pilot` مبذورٌ بأوّل تطبيقٍ وحده، `audit_kind` بحارس الانجراف.
- المسجِّل والرفّ والرافع (§C، §D)، والمشغّل بفكّ Opus عبر WebAudio (§E)، ومرآةُ التجريبيّ (§F).
- الواجهة: زرُّ «ملاحظة صوتية» بشريط الزيارة، المسجِّلُ داخل نافذة الملاحظة (ونافذةُ «ملاحظة على يوم» من الطبلة ⇒ نوع `day`)،
  قسمُ «الملاحظات الصوتية (n)» بحال كلّ تسجيل و«المحذوفة»، رقاقاتُ اليوم بخانة الطبلة، صفحةُ `/voice`، وشارةُ `VoiceChip`.
- سياسةُ المحتوى `media-src 'self' blob: https://*.supabase.co`، والعاملُ الخدميّ لا يخبّئ `/voice-notes/`.
- سجلُّ الحركات: سجّل / حذف / رجّع / انمسحت.

**تأجّل لنسخةٍ لاحقة** (لا يمسّ ما نزل):
- خطوةُ التشخيص بمعالج الخطة (`kind = plan`) وشقُّها ببطاقة الخطة (`ClinicalRecord.voice`) — النوعُ محجوزٌ بالجدول.
- علامةُ «🎙 ملاحظة صوتية» بورقة «طباعة الطبلة» (§A7).
- فيديو إبقاء الشاشة مضيئة لآيفون بلا Wake Lock (§C5) — بدله تحذيرٌ «ارفع مدة القفل» حين لا يُمسك القفل.
- ملاحظةُ الإغلاق (`closing`) — محجوزة.

**قراران عند التنفيذ:** الإرجاعُ لصاحب الحذف خلال ٢٤ ساعة ولو انسدّت الزيارة (قرارُ المالك يغلب §A5)؛ وشارةُ الإقلاع نصّان لا ثلاثة
(الأحمرُ بلا نصٍّ خاصّ) — الإقلاعُ ٣٥٤٬١٨٥ من ٣٥٥٬٠٠٠ (+١٬٣٠٦ عن ٣٥٢٬٨٧٩ قبل الميزة، مقيسٌ ببناء الشجرتين).
