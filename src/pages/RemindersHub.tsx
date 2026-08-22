import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  BellRing, Syringe, Bug, Slice, CalendarDays, Cake, AlarmClock, Search,
  MessageCircle, Plus, AlertTriangle, CheckCircle2, Sun, CalendarClock,
  Send, UserCheck, UserX, Undo2,
} from "lucide-react";
import { getCached, setCached } from "@/lib/swrCache";
import { waVariants, pickVariantIndex, renderWaTemplate, type WaPool } from "@/lib/waTemplates";
import type { CampaignPrefill, ReminderType } from "@/lib/reminders";
import type { Pet, Vaccination, Surgery, Appointment, Reminder, EventCategory, MedicalVisit, WhatsAppMessage } from "@/types";
import { repo } from "@/lib/repo";
import { PetAvatar } from "@/components/PetAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/Modal";
import { Button, useToast, Skeleton } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { getClinicName } from "@/lib/settings";
import { playTap, playSuccess } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";

/* ============================================================================
 * مركز التذكيرات (التذكيرات) — قسم ضمن حملات الواتساب.
 * القاعدة الذهبية: لا يسقط أي تذكير مهما بَعُد موعده. القوائم القديمة كانت
 * تعرض نافذة ٧ أيام فقط فيختفي كل لقاح موعده أبعد — هنا يُجمع كل شيء:
 * لقاحات وديدان مجدولة (كل المواعيد)، متابعات العمليات (شيل خيوط)، مواعيد
 * الحجز، التذكيرات اليدوية، وأعياد الميلاد — مبوّبة زمنياً (متأخر ← لاحقاً)
 * مع بحث وفلاتر وإرسال واتساب مباشر لكل سطر.
 * ==========================================================================*/

type Kind = "vaccine" | "deworming" | "surgery" | "appointment" | "manual" | "birthday";
type TimeFilter = "all" | "overdue" | "today" | "week" | "month";

/* ── دورة حياة التذكير ──────────────────────────────────────────────────────
 * active  : لم يُرسَل بعد — هنا وحدها يصحّ الأحمر والعدّ «متأخر».
 * sent    : أُرسلت الرسالة — خرج من الأحمر وينتظر أثر صاحبه.
 * arrived : جاء صاحبه — يُستدلّ عليه من السستم نفسه لا من ضغطة زر:
 *           اللقاح أُعطي، أو الحيوان زار العيادة بعد موعد المتابعة، أو
 *           الحجز اكتمل. (وللدكتور تثبيته يدوياً حين يعرف ما لا يعرفه السستم.)
 * missed  : أُرسلت ومضت مهلة السماح بعد الموعد ولم يظهر أثر — «ما جاء».
 * الأولوية عند التعارض: تثبيت الدكتور اليدوي > استدلال السستم > حالة الإرسال.
 * ------------------------------------------------------------------------ */
type LifeStatus = "active" | "sent" | "arrived" | "missed";
/** أيام السماح بعد الموعد قبل أن يُعدّ صاحب التذكير «ما جاء». */
const GRACE_DAYS = 3;
/** نافذة مطابقة سجل الواتساب بالموعد — رسالة لنفس الحيوان ونفس النوع ضمنها تُعدّ إرسالاً له. */
const LOG_MATCH_DAYS = 21;
/** أقدم ما يُعرض بقسمَي «جاؤوا/ما جاؤوا» — التاريخ الأبعد صار أرشيفاً لا شغلاً. */
const OUTCOME_KEEP_DAYS = 120;

const POOL_OF: Record<Kind, WaPool> = {
  vaccine: "rem.vaccine", deworming: "rem.deworming", surgery: "rem.surgery",
  appointment: "rem.appointment", manual: "rem.manual", birthday: "rem.birthday",
};

interface Row {
  id: string;
  kind: Kind;
  /** ISO date (yyyy-mm-dd) of the due moment. */
  date: string;
  time?: string | null;
  petId?: string | null;
  petName: string;
  ownerName: string;
  phone: string;
  detail: string;
  /** أيام من اليوم: سالب = متأخر، 0 = اليوم. */
  inDays: number;
  /** إشارة وصولٍ من السستم نفسه (تاريخ الإعطاء/الزيارة/إتمام الحجز). */
  autoArrivedAt?: string | null;
  /** إشارة غيابٍ من السستم (حجز مُلغى/لم يحضر). */
  autoMissed?: boolean;
  /** المرجع الحقيقي للتذكير اليدوي — يلزم زرّ «تم». */
  manualId?: string | null;
}

/** صف مُقيَّم: الصف + حالته بدورة الحياة + متى أُرسل. */
interface Judged { row: Row; st: LifeStatus; sentAt: string | null }

const DEWORM_RE = /deworm|ديدان|دود/i;

const KIND_META: Record<Kind, { icon: typeof Syringe; label: string; tile: string }> = {
  vaccine: { icon: Syringe, label: "لقاح", tile: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" },
  deworming: { icon: Bug, label: "ديدان", tile: "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300" },
  surgery: { icon: Slice, label: "متابعة عملية", tile: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
  appointment: { icon: CalendarDays, label: "موعد", tile: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" },
  manual: { icon: AlarmClock, label: "تذكير", tile: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300" },
  birthday: { icon: Cake, label: "عيد ميلاد", tile: "bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300" },
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  recheck: "مراجعة", medication: "دواء", vaccine: "لقاح", grooming: "العناية", reminder: "تذكير",
} as Record<EventCategory, string>;

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysFromToday = (iso: string): number | null => {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday().getTime()) / 86400000);
};

/** «متأخر ٣ أيام» / «اليوم» / «غداً» / «بعد ٥ أيام» — عربي بأرقام غربية. */
const relLabel = (inDays: number): string =>
  inDays < 0 ? `متأخر ${Math.abs(inDays)} ${Math.abs(inDays) === 1 ? "يوم" : "أيام"}`
    : inDays === 0 ? "اليوم"
      : inDays === 1 ? "غداً"
        : `بعد ${inDays} ${inDays === 1 ? "يوم" : inDays <= 10 ? "أيام" : "يوماً"}`;

/** التكرار: أقرب استحقاق قادم لتذكير يدوي (يومي/أسبوعي/شهري). */
const nextOccurrence = (r: Reminder): string | null => {
  const base = daysFromToday(r.date);
  if (base === null) return null;
  if (!r.recurring || r.recurring === "none") return r.date;
  if (base >= 0) return r.date; // لم يحن أول استحقاق بعد
  const today = startOfToday();
  if (r.recurring === "daily") return isoDay(today);
  if (r.recurring === "weekly") {
    const target = new Date(r.date + "T00:00:00").getDay();
    const diff = (target - today.getDay() + 7) % 7;
    const d = new Date(today); d.setDate(d.getDate() + diff);
    return isoDay(d);
  }
  // monthly — نفس اليوم من الشهر الحالي أو التالي
  const dom = new Date(r.date + "T00:00:00").getDate();
  const cand = new Date(today.getFullYear(), today.getMonth(), dom);
  if (cand.getTime() < today.getTime()) cand.setMonth(cand.getMonth() + 1);
  return isoDay(cand);
};

const SERVICE_LABELS: Record<string, string> = {
  consultation: "معاينة", vaccination: "تلقيح", surgery: "عملية", telehealth: "استشارة عن بعد", home: "زيارة منزلية",
};

export function RemindersHub() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // Synchronous cache seed — effects run AFTER paint, so seeding there flashes
  // one skeleton frame on every revisit (the "loading intro" the doctor sees).
  type Seed = { p: Pet[]; vax: Vaccination[]; srg: Surgery[]; appts: Appointment[]; rems: Reminder[]; vis?: MedicalVisit[]; log?: WhatsAppMessage[] };
  const seed = getCached<Seed>(`remhub_${user?.clinic_id ?? user?.id ?? ""}`);
  const [pets, setPets] = useState<Pet[]>(seed?.p ?? []);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>(seed?.vax ?? []);
  const [surgeries, setSurgeries] = useState<Surgery[]>(seed?.srg ?? []);
  const [appointments, setAppointments] = useState<Appointment[]>(seed?.appts ?? []);
  const [manual, setManual] = useState<Reminder[]>(seed?.rems ?? []);
  const [visits, setVisits] = useState<MedicalVisit[]>(seed?.vis ?? []);
  const [waLog, setWaLog] = useState<WhatsAppMessage[]>(seed?.log ?? []);
  const [loading, setLoading] = useState(!seed);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [timeF, setTimeF] = useState<TimeFilter>("all");
  const [view, setView] = useState<LifeStatus>("active");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  /* لا حوار هنا بعد اليوم. «ذكّر» يفتح **صفحة الحملات** حاملاً معه الزبون
   * والنصّ مصاغاً — فالمعاينة والتحرير وتبديل النسخة والإرسال كلها تجري
   * بمكانٍ واحد بُني لها، بدل نافذةٍ صغيرة تكرّرها ناقصةً. */
  // «أُرسلت» محفوظة بالجهاز: المعرف ← تاريخ الاستحقاق الذي أُرسلت له، فتنمسح
  // العلامة تلقائياً عندما يتجدد الموعد (تذكير متكرر أو جرعة جديدة).
  const [sentMap, setSentMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("vp_rem_sent") || "{}") as Record<string, string>; } catch { return {}; }
  });
  const saveSent = (m: Record<string, string>) => {
    setSentMap(m);
    try { localStorage.setItem("vp_rem_sent", JSON.stringify(m)); } catch { /* ignore */ }
  };
  /** تثبيت الدكتور اليدوي: id ← { الحالة، تاريخ الاستحقاق الذي تخصّه }.
   *  مربوطة بتاريخ الاستحقاق عمداً: يتجدد الموعد فيسقط التثبيت القديم وحده. */
  const [outcomeMap, setOutcomeMap] = useState<Record<string, { s: "arrived" | "missed"; d: string }>>(() => {
    try { return JSON.parse(localStorage.getItem("vp_rem_outcome") || "{}") as Record<string, { s: "arrived" | "missed"; d: string }>; } catch { return {}; }
  });
  const saveOutcome = (m: Record<string, { s: "arrived" | "missed"; d: string }>) => {
    setOutcomeMap(m);
    try { localStorage.setItem("vp_rem_outcome", JSON.stringify(m)); } catch { /* ignore */ }
  };
  const setOutcome = (r: Row, st: "arrived" | "missed" | null) => {
    playTap();
    const m = { ...outcomeMap };
    if (st === null) delete m[r.id]; else m[r.id] = { s: st, d: r.date };
    saveOutcome(m);
    // التذكير اليدوي «تمّ» فعلاً — يُطفأ بالمخزن أيضاً حتى لا يعود على جهاز آخر.
    if (st === "arrived" && r.manualId) void repo.updateReminder(r.manualId, { enabled: false }).catch(() => { /* التثبيت المحلي يكفي */ });
  };


  const remKey = `remhub_${user?.clinic_id ?? user?.id ?? ""}`;
  const load = async () => {
    try {
      const p = await repo.listAllPets(user?.clinic_id ?? user?.id);
      const ids = p.map((x) => x.id);
      // النطاق يرجع 60 يوماً للوراء أيضاً: الحكم على «جاء/ما جاء» يحتاج الماضي القريب.
      const from = isoDay(new Date(Date.now() - 60 * 86400000));
      const to = isoDay(new Date(Date.now() + 60 * 86400000));
      const [vax, srg, appts, rems, vis, log] = await Promise.all([
        repo.listAllVaccinations(ids),
        repo.listAllSurgeries().catch(() => [] as Surgery[]),
        repo.listAppointmentsInRange(from, to).catch(() => [] as Appointment[]),
        repo.listReminders().catch(() => [] as Reminder[]),
        // الزيارات دليل الوصول لمتابعات العمليات؛ والسجل يجعل «أُرسلت» مشتركة بين الأجهزة.
        repo.listAllVisits(ids).catch(() => [] as MedicalVisit[]),
        repo.listWhatsAppLog().catch(() => [] as WhatsAppMessage[]),
      ]);
      setCached(remKey, { p, vax, srg, appts, rems, vis, log });
      setPets(p); setVaccinations(vax); setSurgeries(srg); setAppointments(appts); setManual(rems); setVisits(vis); setWaLog(log);
    } catch { /* empty state covers it */ }
    finally { setLoading(false); }
  };
  useEffect(() => {
    // فوري من الكاش + تحديث خفي
    const c = getCached<Seed>(remKey);
    if (c) { setPets(c.p); setVaccinations(c.vax); setSurgeries(c.srg); setAppointments(c.appts); setManual(c.rems); setVisits(c.vis ?? []); setWaLog(c.log ?? []); setLoading(false); }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.clinic_id, user?.id]);

  const petById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);

  /** كل التذكيرات موحّدة — بلا أي نافذة تقصّ البعيد. */
  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = [];
    const push = (r: Row | null) => { if (r) rows.push(r); };
    const petBits = (petId?: string | null) => {
      const pet = petId ? petById.get(petId) : undefined;
      return { petName: pet?.name ?? "", ownerName: pet?.owner_name ?? "", phone: (pet?.owner_phone ?? "").trim() };
    };

    // 💉 اللقاحات والديدان المجدولة — كل موعد مهما بَعُد، والمتأخر يبقى ظاهراً.
    // والمُعطى منها لا يُهمَل بعد اليوم: إعطاء الجرعة هو **دليل السستم** أن
    // صاحب التذكير جاء فعلاً — فيدخل الصف بدلالة وصولٍ تلقائية.
    for (const v of vaccinations) {
      if (!v.due_date) continue;
      const pet = petById.get(v.pet_id);
      if (!pet) continue;
      const inDays = daysFromToday(v.due_date);
      if (inDays === null) continue;
      const given = v.status === "administered";
      if (given && inDays < -OUTCOME_KEEP_DAYS) continue; // أرشيف قديم
      push({
        id: `vax-${v.id}`, kind: DEWORM_RE.test(v.name) ? "deworming" : "vaccine",
        date: v.due_date.slice(0, 10), petId: pet.id, petName: pet.name,
        ownerName: pet.owner_name ?? "", phone: (pet.owner_phone ?? "").trim(),
        detail: v.name, inDays,
        autoArrivedAt: given ? (v.administered_at ?? v.due_date).slice(0, 10) : null,
      });
    }

    // 🔪 متابعات العمليات (شيل خيوط / مراجعة) — تبقى حتى لو تأخرت.
    // دليل الوصول هنا: أي زيارة سُجّلت للحيوان بيوم المتابعة أو بعده —
    // فالحضور يُسجَّل زيارةً بالسستم، والسستم يشهد بنفسه.
    for (const s of surgeries) {
      if (!s.followup_on) continue;
      const inDays = daysFromToday(s.followup_on);
      if (inDays === null || inDays < -OUTCOME_KEEP_DAYS) continue;
      const bits = petBits(s.pet_id);
      if (!bits.petName) continue;
      const fday = s.followup_on.slice(0, 10);
      const visitAfter = visits.find((v) => v.pet_id === s.pet_id && v.visit_date.slice(0, 10) >= fday);
      push({
        id: `srg-${s.id}`, kind: "surgery", date: fday,
        petId: s.pet_id, ...bits,
        detail: `متابعة: ${s.name.split("(")[0].trim()}`, inDays,
        autoArrivedAt: visitAfter ? visitAfter.visit_date.slice(0, 10) : null,
      });
    }

    // 📅 مواعيد الحجز — والحكم من حالة الحجز نفسها: اكتمل/دخل = جاء،
    // «لم يحضر» أو أُلغي = ما جاء؛ والقادم المفتوح يبقى تذكيراً حياً.
    for (const a of appointments) {
      const inDays = daysFromToday(a.scheduled_at);
      if (inDays === null) continue;
      const open = a.status === "requested" || a.status === "confirmed";
      if (open && inDays < 0) continue;            // حجز فات بلا حسم — لوحة الاستقبال شأنها
      if (!open && inDays >= 0) continue;          // مُلغى قادم — لا يُذكَّر به
      const came = a.status === "done" || a.status === "checked_in" || a.status === "in_room";
      const bits = petBits(a.pet_id);
      const at = new Date(a.scheduled_at);
      push({
        id: `apt-${a.id}`, kind: "appointment", date: a.scheduled_at.slice(0, 10),
        time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
        petId: a.pet_id, ...bits,
        detail: `${SERVICE_LABELS[a.service] ?? a.service}${a.doctor_name ? ` · ${a.doctor_name}` : ""}`, inDays,
        autoArrivedAt: came ? a.scheduled_at.slice(0, 10) : null,
        autoMissed: a.status === "no_show" || a.status === "cancelled",
      });
    }

    // ⏰ التذكيرات اليدوية — مع حساب أقرب استحقاق للتكرار.
    for (const r of manual) {
      if (!r.enabled) continue;
      const due = nextOccurrence(r);
      if (!due) continue;
      const inDays = daysFromToday(due);
      if (inDays === null || inDays < -90) continue;
      const bits = petBits(r.pet_id);
      push({
        id: `rem-${r.id}`, manualId: r.id, kind: "manual", date: due, time: r.time || null,
        petId: r.pet_id ?? null, petName: bits.petName || r.pet_name || "",
        ownerName: bits.ownerName, phone: bits.phone,
        detail: `${r.title}${r.recurring && r.recurring !== "none" ? ` · ${r.recurring === "daily" ? "يومي" : r.recurring === "weekly" ? "أسبوعي" : "شهري"}` : ""} (${CATEGORY_LABELS[r.category] ?? r.category})`,
        inDays,
      });
    }

    // 🎂 أعياد الميلاد خلال ٣٠ يوماً.
    const today = startOfToday();
    for (const p of pets) {
      if (!p.dob) continue;
      const birth = new Date(p.dob);
      if (Number.isNaN(birth.getTime())) continue;
      let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
      if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
      const inDays = Math.round((next.getTime() - today.getTime()) / 86400000);
      if (inDays > 30) continue;
      push({
        id: `bday-${p.id}`, kind: "birthday", date: isoDay(next), petId: p.id, petName: p.name,
        ownerName: p.owner_name ?? "", phone: (p.owner_phone ?? "").trim(),
        detail: `يكمل ${Math.max(1, today.getFullYear() - birth.getFullYear() + (inDays > 0 && next.getFullYear() > today.getFullYear() ? 1 : 0))} سنة 🎉`, inDays,
      });
    }

    return rows.sort((a, b) => (a.inDays - b.inDays) || a.petName.localeCompare(b.petName));
  }, [vaccinations, surgeries, appointments, manual, pets, petById, visits]);

  /** «أُرسلت» عابرة للأجهزة: العلامة المحلية أو سجل الواتساب المخزَّن —
   *  رسالة لنفس الحيوان بنفس النوع ضمن نافذة الموعد تُحسب إرسالاً له. */
  const sentInfoOf = useMemo(() => {
    const byPetKind = new Map<string, string[]>();
    for (const w of waLog) {
      if (!w.pet_id || !w.reminder_type) continue;
      const k = `${w.pet_id}|${w.reminder_type}`;
      const arr = byPetKind.get(k) ?? [];
      arr.push(w.sent_at.slice(0, 10));
      byPetKind.set(k, arr);
    }
    // السجل لا يعرف أي تذكيرٍ بعينه خصّته الرسالة — يعرف الحيوان والنوع فقط.
    // فإن كان للحيوان **أكثر من تذكير واحد** من نفس النوع، صار الاستدلال
    // التباساً: رسالة «لقاح السعار» كانت تُعلّم اللقاح الرباعي مُرسلاً معها.
    // نقصر المطابقة على الحالة غير الملتبسة (تذكير واحد للنوع)، والبقية
    // تعتمد العلامة المحلية الدقيقة المسجّلة لحظة الإرسال.
    const rowCount = new Map<string, number>();
    for (const r of allRows) {
      if (!r.petId) continue;
      const k = `${r.petId}|${r.kind}`;
      rowCount.set(k, (rowCount.get(k) ?? 0) + 1);
    }
    return (r: Row): string | null => {
      if (sentMap[r.id] === r.date) return sentMap[`${r.id}#at`] ?? r.date;
      if (!r.petId) return null;
      if ((rowCount.get(`${r.petId}|${r.kind}`) ?? 0) > 1) return null;
      const days = byPetKind.get(`${r.petId}|${r.kind}`) ?? [];
      const lo = isoDay(new Date(new Date(r.date + "T00:00:00").getTime() - LOG_MATCH_DAYS * 86400000));
      const hi = isoDay(new Date(new Date(r.date + "T00:00:00").getTime() + LOG_MATCH_DAYS * 86400000));
      const hit = days.filter((d) => d >= lo && d <= hi).sort();
      return hit.length ? hit[hit.length - 1] : null;
    };
  }, [waLog, sentMap, allRows]);

  /** الحكم النهائي لكل صف — تثبيت الدكتور أولاً، ثم شهادة السستم، ثم الإرسال. */
  const judged = useMemo<Judged[]>(() => allRows.map((r) => {
    const sentAt = sentInfoOf(r);
    const ov = outcomeMap[r.id];
    if (ov && ov.d === r.date) return { row: r, st: ov.s, sentAt };
    if (r.autoArrivedAt) return { row: r, st: "arrived", sentAt };
    if (r.autoMissed) return { row: r, st: "missed", sentAt };
    // أعياد الميلاد لا «حضور» لها — تُرسل التهنئة وتبقى مُرسلة وكفى.
    // مهلة السماح تُعدّ من **يوم الإرسال** لا من الموعد: تذكيرٌ متأخر أُرسل
    // اليوم يعطي صاحبه أيام السماح كاملةً ليجيء، لا يُحكم عليه بالغياب فوراً.
    const sentAgo = sentAt ? (daysFromToday(sentAt) ?? 0) : 0;
    if (sentAt && r.kind !== "birthday" && r.inDays < -GRACE_DAYS && sentAgo <= -GRACE_DAYS) return { row: r, st: "missed", sentAt };
    if (sentAt) return { row: r, st: "sent", sentAt };
    return { row: r, st: "active", sentAt: null };
  }), [allRows, sentInfoOf, outcomeMap]);

  const byStatus = useMemo(() => ({
    active: judged.filter((j) => j.st === "active"),
    sent: judged.filter((j) => j.st === "sent"),
    arrived: judged.filter((j) => j.st === "arrived"),
    missed: judged.filter((j) => j.st === "missed"),
  }), [judged]);

  const activeRows = useMemo(() => byStatus.active.map((j) => j.row), [byStatus]);

  // الأرقام الحمر من «قيد المتابعة» وحدها: ما أُرسل خرج من العدّ — هذا هو
  // الإصلاح الذي طُلب: الرسالة انبعثت فلا يبقى التذكير أحمر يصرخ «متأخر».
  const kpis = useMemo(() => ({
    overdue: activeRows.filter((r) => r.inDays < 0).length,
    today: activeRows.filter((r) => r.inDays === 0).length,
    week: activeRows.filter((r) => r.inDays >= 0 && r.inDays <= 7).length,
    total: activeRows.length,
  }), [activeRows]);

  /** عدّاد لكل نوع — يظهر على چيبات الفلترة فيعرف الدكتور وين الشغل بلمحة. */
  const viewRows = useMemo(() => byStatus[view], [byStatus, view]);
  const kindCounts = useMemo(() => {
    const m: Partial<Record<Kind, number>> = {};
    for (const j of viewRows) m[j.row.kind] = (m[j.row.kind] ?? 0) + 1;
    return m;
  }, [viewRows]);

  /** إنجاز التواصل: من المستحق اليوم/المتأخر وله هاتف — كم واحد انبعثله فعلاً؟ */
  const contact = useMemo(() => {
    const pool = judged.filter((j) => (j.st === "active" || j.st === "sent") && j.row.inDays <= 0 && j.row.phone);
    return { due: pool.length, sent: pool.filter((j) => j.st === "sent").length };
  }, [judged]);

  const ql = q.trim().toLowerCase();
  const shownJ = viewRows
    .filter((j) => (kind === "all" ? true : j.row.kind === kind))
    .filter((j) => view !== "active" || (timeF === "all" ? true
      : timeF === "overdue" ? j.row.inDays < 0
        : timeF === "today" ? j.row.inDays === 0
          : timeF === "week" ? j.row.inDays >= 0 && j.row.inDays <= 7
            : j.row.inDays >= 0 && j.row.inDays <= 30))
    .filter((j) => !ql || j.row.petName.toLowerCase().includes(ql) || j.row.ownerName.toLowerCase().includes(ql) || j.row.phone.includes(ql) || j.row.detail.toLowerCase().includes(ql));
  // الأقسام المحسومة تُقرأ من الأحدث للأقدم — آخر ما جرى أولاً.
  const shown = view === "active" ? shownJ.map((j) => j.row) : [];
  const flatJ = view === "active" ? [] : shownJ.slice().sort((x, y) => y.row.date.localeCompare(x.row.date));

  /** تبويب زمني: متأخر ← اليوم ← غداً ← هذا الأسبوع ← هذا الشهر ← لاحقاً. */
  const buckets = useMemo(() => {
    const def: { key: string; label: string; icon: typeof Sun; tone: string; rows: Row[] }[] = [
      { key: "overdue", label: "متأخرة — تحتاج انتباهاً الآن", icon: AlertTriangle, tone: "text-danger-600 dark:text-danger-400", rows: [] },
      { key: "today", label: "اليوم", icon: Sun, tone: "text-warn-600 dark:text-warn-400", rows: [] },
      { key: "tomorrow", label: "غداً", icon: CalendarClock, tone: "text-brand-600 dark:text-brand-300", rows: [] },
      { key: "week", label: "هذا الأسبوع", icon: CalendarDays, tone: "text-ink-muted", rows: [] },
      { key: "month", label: "هذا الشهر", icon: CalendarDays, tone: "text-ink-muted", rows: [] },
      { key: "later", label: "لاحقاً", icon: CalendarDays, tone: "text-ink-subtle", rows: [] },
    ];
    for (const r of shown) {
      const b = r.inDays < 0 ? 0 : r.inDays === 0 ? 1 : r.inDays === 1 ? 2 : r.inDays <= 7 ? 3 : r.inDays <= 30 ? 4 : 5;
      def[b].rows.push(r);
    }
    return def.filter((b) => b.rows.length > 0);
  }, [shown]);

  /**
   * «ذكّر» → صفحة الحملات، بالزبون محدَّداً والنصّ مصاغاً.
   *
   * النصّ يُصاغ هنا لا هناك: التذكير وحده يعرف أي لقاحٍ بعينه وأي تاريخ وأي
   * ساعة — والحملات تعرف الجمهور والإرسال. فيُسلَّم الجاهز ويُكمَّل هناك.
   * والنسخة تُنتقى شبه عشوائياً من عشر صياغات ببذرةٍ ثابتة لليوم، ويقلّبها
   * زرّ النرد بصفحة الحملات.
   */
  const openInCampaigns = (r: Row) => {
    playTap();
    const variants = waVariants(POOL_OF[r.kind]);
    const idx = pickVariantIndex(`${r.id}|${r.date}`, Math.max(1, variants.length));
    const message = renderWaTemplate(variants[idx] ?? "", {
      owner: r.ownerName || "",
      pet: r.petName || "",
      clinic: getClinicName() || t("app.name", "doctorVet"),
      detail: r.detail,
      date: formatDate(r.date, i18n.language),
      time: r.time ? ` ${t("rem.atHour", "الساعة")} ${r.time}` : "",
    });
    const reminderType: ReminderType = r.kind === "birthday" ? "birthday" : r.kind === "deworming" ? "deworming" : "vaccine";
    const prefill: CampaignPrefill = {
      targetPetId: r.petId ?? "", targetPetName: r.petName, targetOwnerName: r.ownerName,
      reminderType, message, reminderRowId: r.id, reminderDate: r.date, reminderKind: r.kind,
    };
    navigate("/campaigns", { state: prefill });
  };

  /* الرجوع من الحملات بعد إرسالٍ فعلي: تُعلَّم «أُرسلت» فينتقل التذكير من
   * الأحمر إلى قسمه. الحملات تكتب العلامة بمخزن الجهاز قبل أن تعيدنا. */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("vp_rem_justsent");
      if (!raw) return;
      sessionStorage.removeItem("vp_rem_justsent");
      const { id, date } = JSON.parse(raw) as { id: string; date: string };
      if (!id || !date) return;
      saveSent({ ...sentMap, [id]: date, [`${id}#at`]: isoDay(new Date()) });
      playSuccess();
      toast.success(t("rem.sentMoved", "أُرسلت — انتقل التذكير إلى قسم «أُرسلت»"));
    } catch { /* بلا مخزن جلسة — العلامة تأتي من سجل الواتساب بالتحميل التالي */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const KIND_CHIPS: { id: Kind | "all"; label: string; icon: typeof Syringe }[] = [
    { id: "all", label: "الكل", icon: BellRing },
    { id: "vaccine", label: "لقاحات", icon: Syringe },
    { id: "deworming", label: "ديدان", icon: Bug },
    { id: "surgery", label: "متابعات العمليات", icon: Slice },
    { id: "appointment", label: "مواعيد", icon: CalendarDays },
    { id: "manual", label: "تذكيرات يدوية", icon: AlarmClock },
    { id: "birthday", label: "أعياد ميلاد", icon: Cake },
  ];
  /** بطاقات الملخص المدرّجة = هي نفسها فلتر الوقت (ضغطة تصفّي). */
  const SEGMENTS: { id: TimeFilter; label: string; value: number; icon: typeof Sun; wrap: string; bubble: string }[] = [
    { id: "overdue", label: "متأخرة", value: kpis.overdue, icon: AlertTriangle, wrap: "from-danger-50 to-rose-50 dark:from-danger-500/10 dark:to-danger-500/5", bubble: "bg-danger-500" },
    { id: "today", label: "اليوم", value: kpis.today, icon: Sun, wrap: "from-warn-50 to-amber-50 dark:from-warn-500/10 dark:to-warn-500/5", bubble: "bg-warn-500" },
    { id: "week", label: "هذا الأسبوع", value: kpis.week, icon: CalendarDays, wrap: "from-brand-50 to-sky-50 dark:from-brand-500/10 dark:to-sky-500/5", bubble: "bg-brand-600" },
    { id: "all", label: "الكل", value: kpis.total, icon: BellRing, wrap: "from-sky-50 to-brand-50 dark:from-sky-500/10 dark:to-brand-500/5", bubble: "bg-sky-500" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><BellRing size={24} /></span>
        <div className="me-auto">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("rem.title", "التذكيرات")}</h1>
          <p className="text-sm text-ink-subtle">{t("rem.subtitle", "لقاحات ومتابعات ومواعيد — كلها هنا، ولا شيء يفوت.")}</p>
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setAdding(true); }}>{t("rem.add", "إضافة تذكير")}</Button>
      </div>

      {/* شريط دورة الحياة: متابعة ← أُرسلت ← جاؤوا / ما جاؤوا.
          هذا هو «التناغم» المطلوب: التذكير يتنقل بين الأقسام من أدلة السستم
          نفسه (لقاح أُعطي، زيارة سُجّلت، حجز اكتمل) لا من ضغطات يدوية. */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-1 p-1 [scrollbar-width:none]" data-remtabs role="tablist">
        {([
          { id: "active", label: t("rem.tabActive", "قيد المتابعة"), icon: BellRing, n: byStatus.active.length, tone: "" },
          { id: "sent", label: t("rem.tabSent", "أُرسلت"), icon: Send, n: byStatus.sent.length, tone: "text-[#128C4A] dark:text-[#4ade80]" },
          { id: "arrived", label: t("rem.tabArrived", "جاؤوا"), icon: UserCheck, n: byStatus.arrived.length, tone: "text-success-600 dark:text-success-400" },
          { id: "missed", label: t("rem.tabMissed", "ما جاؤوا"), icon: UserX, n: byStatus.missed.length, tone: "text-danger-600 dark:text-danger-400" },
        ] as { id: LifeStatus; label: string; icon: typeof Send; n: number; tone: string }[]).map((tb) => {
          const TIcon = tb.icon;
          const active = view === tb.id;
          return (
            <button key={tb.id} role="tab" aria-selected={active} data-remtab={tb.id}
              onClick={() => { playTap(); setView(tb.id); setKind("all"); }}
              className={cn("inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition",
                active ? "bg-brand-600 text-white shadow-soft" : cn("text-ink-muted hover:bg-surface-2 hover:text-ink", tb.tone))}>
              <TIcon size={14} /> {tb.label}
              <span className={cn("grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-2xs font-extrabold tabular-nums", active ? "bg-white/25" : "bg-surface-2")}>{tb.n}</span>
            </button>
          );
        })}
      </div>

      {view === "active" && (<>
      {/* بطاقات الملخص المدرّجة — ضغطة وحدة = تصفية (إحصاء وفلترة بنفس المكان) */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SEGMENTS.map((s) => {
          const SIcon = s.icon;
          const active = timeF === s.id;
          return (
            <motion.button
              key={s.id} variants={staggerItem}
              onClick={() => { playTap(); setTimeF(s.id); }}
              className={cn(
                "relative overflow-hidden rounded-3xl border bg-gradient-to-br p-4 text-start transition hover:-translate-y-0.5 hover:shadow-raised",
                s.wrap,
                active ? "border-brand-400 ring-2 ring-brand-400/60 shadow-raised" : "border-line",
              )}
            >
              <span className={cn("mb-2 grid h-9 w-9 place-items-center rounded-xl text-white shadow-soft", s.bubble)}><SIcon size={17} /></span>
              <p className="font-display text-3xl font-extrabold leading-none tracking-tighter2 text-ink tabular-nums">{s.value}</p>
              <p className="mt-1 text-xs font-semibold text-ink-muted">{s.label}</p>
              {active && <span className="absolute end-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white"><CheckCircle2 size={13} /></span>}
            </motion.button>
          );
        })}
      </motion.div>

      {/* إنجاز التواصل اليومي — شريط تقدم يشجّع ويوضح المتبقي بلمحة */}
      {contact.due > 0 && (
        <div className="card mb-4 flex items-center gap-3 p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#25D366]/15 text-[#128C4A] dark:text-[#4ade80]"><MessageCircle size={17} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-ink">
                {contact.sent >= contact.due
                  ? t("rem.contactDone", "تواصلت مع الكل — يومك مغطى 🎉")
                  : t("rem.contactProgress", { sent: contact.sent, due: contact.due, defaultValue: "تواصلت مع {{sent}} من {{due}} مستحقين اليوم" })}
              </p>
              <span className="shrink-0 text-xs font-extrabold text-ink-muted tabular-nums">{Math.round((contact.sent / contact.due) * 100)}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn("h-full rounded-full transition-all duration-500", contact.sent >= contact.due ? "bg-success-500" : "bg-[#25D366]")}
                style={{ width: `${Math.min(100, Math.round((contact.sent / contact.due) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      </>)}

      {/* صف واحد: نوع التذكير + بحث */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {KIND_CHIPS.map((c) => {
          const Icon = c.icon;
          const active = kind === c.id;
          const n = c.id === "all" ? kpis.total : (kindCounts[c.id] ?? 0);
          if (c.id !== "all" && n === 0) return null; // ما نعرض نوع فارغ — أقل ضوضاء
          return (
            <button key={c.id} onClick={() => { playTap(); setKind(c.id); }}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition", active ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              <Icon size={13} /> {c.label}
              <span className={cn("grid h-4.5 min-w-4 place-items-center rounded-full px-1 text-2xs font-extrabold tabular-nums", active ? "bg-white/25" : "bg-surface-1 text-ink-subtle")}>{n}</span>
            </button>
          );
        })}
        <div className="relative ms-auto min-w-[170px] flex-1 sm:max-w-56">
          <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input h-9 py-0 ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rem.search", "ابحث بالحيوان أو المالك أو الهاتف…")} />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : view !== "active" ? (
        flatJ.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 p-12 text-center" data-remempty={view}>
            <span className={cn("grid h-14 w-14 place-items-center rounded-2xl",
              view === "missed" ? "bg-danger-50 text-danger-500 dark:bg-danger-500/15" : "bg-success-50 text-success-500 dark:bg-success-500/15")}>
              {view === "sent" ? <Send size={26} /> : view === "arrived" ? <UserCheck size={26} /> : <UserX size={26} />}
            </span>
            <p className="font-bold text-ink">
              {view === "sent" ? t("rem.emptySent", "لا رسائل بانتظار الرد — كل ما أُرسل حُسم")
                : view === "arrived" ? t("rem.emptyArrived", "بعدُ ما وصل أحد — أول قادمٍ يظهر هنا تلقائياً")
                  : t("rem.emptyMissed", "لا متخلفين 🎉 — كل من ذُكِّر جاء أو ما زال بالانتظار")}
            </p>
            <p className="text-sm text-ink-subtle">
              {view === "arrived"
                ? t("rem.arrivedHint", "اللقاح المُعطى، والزيارة المسجَّلة بعد المتابعة، والحجز المكتمل — كلها تنقل التذكير هنا من نفسها.")
                : t("rem.lifecycleHint", "التذكير يتنقّل بين الأقسام تلقائياً من واقع السستم — والدكتور يقدر يثبّت الحالة بيده متى ما عرف أكثر.")}
            </p>
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-soft" data-remflat={view}>
            {flatJ.map((j, i) => {
              const r = j.row;
              const M = KIND_META[r.kind];
              const MIcon = M.icon;
              const pet = r.petId ? petById.get(r.petId) : undefined;
              const ov = outcomeMap[r.id];
              const manualOv = !!ov && ov.d === r.date;
              return (
                <motion.div key={r.id} variants={staggerItem}
                  onClick={() => { if (r.petId) { playTap(); navigate(`/pet/${r.petId}`); } }}
                  className={cn("group flex flex-wrap items-center gap-3 border-s-4 px-3.5 py-3 transition sm:flex-nowrap",
                    view === "arrived" ? "border-s-success-500" : view === "missed" ? "border-s-danger-500" : "border-s-[#25D366]",
                    i > 0 && "border-t border-t-line", r.petId && "cursor-pointer hover:bg-surface-2/50")}>
                  {pet ? (
                    <span className="relative shrink-0">
                      <PetAvatar pet={pet} size={40} photoFallback />
                      <span className={cn("absolute -bottom-1 -end-1 grid h-5 w-5 place-items-center rounded-full border-2 border-surface-1", M.tile)} title={M.label}><MIcon size={11} /></span>
                    </span>
                  ) : (
                    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", M.tile)} title={M.label}><MIcon size={18} /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {r.kind !== "manual" && r.petName
                        ? <>{r.petName} <span className="font-semibold text-ink-muted">— {r.detail}</span></>
                        : r.detail}
                    </p>
                    <p className="truncate text-2xs text-ink-subtle">
                      {r.ownerName && <>{r.ownerName} · </>}
                      {formatDate(r.date, i18n.language)}
                      {view === "sent" && j.sentAt && <> · {t("rem.sentOn", "أُرسل")} {formatDate(j.sentAt, i18n.language)}</>}
                      {view === "arrived" && <> · {manualOv ? t("rem.byDoctor", "ثبّتها الدكتور") : r.autoArrivedAt ? `${t("rem.cameOn", "جاء")} ${formatDate(r.autoArrivedAt, i18n.language)}` : t("rem.came", "جاء")}</>}
                      {view === "missed" && <> · {manualOv ? t("rem.byDoctor", "ثبّتها الدكتور") : t("rem.graceOver", "مضت مهلة السماح بلا أثر")}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {view === "sent" && (<>
                      <button onClick={(e) => { e.stopPropagation(); setOutcome(r, "arrived"); }} data-remcame={r.id}
                        title={t("rem.markCame", "جاء صاحبه — انقله لقسم «جاؤوا»")}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-success-50 px-2 text-2xs font-bold text-success-700 transition hover:bg-success-100 dark:bg-success-500/15 dark:text-success-300">
                        <UserCheck size={14} /> {t("rem.cameBtn", "جاء")}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setOutcome(r, "missed"); }} data-remmiss={r.id}
                        title={t("rem.markMissed", "ما جاء — انقله لقسم «ما جاؤوا»")}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-danger-50 px-2 text-2xs font-bold text-danger-700 transition hover:bg-danger-100 dark:bg-danger-500/15 dark:text-danger-300">
                        <UserX size={14} /> {t("rem.missBtn", "ما جاء")}
                      </button>
                      {r.phone && (
                        <button onClick={(e) => { e.stopPropagation(); openInCampaigns(r); }}
                          title={t("rem.resend", "إعادة الإرسال")}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface-2 px-2 text-2xs font-bold text-ink-muted transition hover:text-ink">
                          <MessageCircle size={14} />
                        </button>
                      )}
                    </>)}
                    {view === "missed" && (<>
                      {r.phone && (
                        <button onClick={(e) => { e.stopPropagation(); openInCampaigns(r); }} data-remresend={r.id}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#25D366] px-2.5 text-2xs font-bold text-white shadow-soft transition hover:bg-[#1fb959]">
                          <MessageCircle size={14} /> {t("rem.remindAgain", "ذكّر مجدداً")}
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setOutcome(r, "arrived"); }}
                        title={t("rem.markCame", "جاء صاحبه — انقله لقسم «جاؤوا»")}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-success-50 px-2 text-2xs font-bold text-success-700 transition hover:bg-success-100 dark:bg-success-500/15 dark:text-success-300">
                        <UserCheck size={14} /> {t("rem.cameBtn", "جاء")}
                      </button>
                    </>)}
                    {manualOv && (
                      <button onClick={(e) => { e.stopPropagation(); setOutcome(r, null); }}
                        title={t("rem.undoOutcome", "تراجع عن التثبيت اليدوي")}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface-2 px-2 text-2xs font-bold text-ink-muted transition hover:text-ink">
                        <Undo2 size={14} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )
      ) : buckets.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-success-50 text-success-500 dark:bg-success-500/15"><CheckCircle2 size={26} /></span>
          <p className="font-bold text-ink">{allRows.length === 0 ? t("rem.emptyAll", "لا توجد تذكيرات — كل شيء تحت السيطرة") : t("rem.emptyFilter", "لا نتائج مطابقة لهذه التصفية")}</p>
          <p className="text-sm text-ink-subtle">{t("rem.emptyHint", "اللقاحات المجدولة ومتابعات العمليات والمواعيد تظهر هنا تلقائياً.")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {buckets.map((b) => (
            <section key={b.key}>
              {/* عنوان هادئ: نقطة ملوّنة + اسم المرحلة + العدد */}
              <h2 className="mb-1.5 flex items-center gap-2 px-1 text-xs font-extrabold text-ink-muted">
                <span className={cn("h-2 w-2 rounded-full",
                  b.key === "overdue" ? "bg-danger-500" : b.key === "today" ? "bg-warn-500" : b.key === "tomorrow" ? "bg-brand-500" : "bg-ink-subtle/40")} />
                {b.key === "overdue" ? "متأخرة" : b.label}
                <span className="text-2xs font-bold text-ink-subtle tabular-nums">{b.rows.length}</span>
              </h2>
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-soft">
                {b.rows.map((r, i) => {
                  const M = KIND_META[r.kind];
                  const MIcon = M.icon;
                  const pet = r.petId ? petById.get(r.petId) : undefined;
                  const openFile = () => { if (r.petId) { playTap(); navigate(`/pet/${r.petId}`); } };
                  return (
                    <motion.div key={r.id} variants={staggerItem}
                      onClick={openFile}
                      className={cn(
                        "group flex items-center gap-3 border-s-4 px-3.5 py-3 transition",
                        // حافة ملونة حسب الاستعجال: أحمر متأخر · برتقالي اليوم · شفاف لاحقاً
                        r.inDays < 0 ? "border-s-danger-500 bg-danger-50/40 dark:bg-danger-500/5" : r.inDays === 0 ? "border-s-warn-400" : "border-s-transparent",
                        i > 0 && "border-t border-t-line",
                        r.petId && "cursor-pointer hover:bg-surface-2/50",
                      )}>
                      {/* صورة الحيوان مع شارة النوع — يعرف الدكتور منو وشنو بلمحة */}
                      {pet ? (
                        <span className="relative shrink-0">
                          <span className="rounded-full ring-2 ring-transparent transition group-hover:ring-brand-200 dark:group-hover:ring-brand-500/40">
                            <PetAvatar pet={pet} size={40} photoFallback />
                          </span>
                          <span className={cn("absolute -bottom-1 -end-1 grid h-5 w-5 place-items-center rounded-full border-2 border-surface-1", M.tile)} title={M.label}>
                            <MIcon size={11} />
                          </span>
                        </span>
                      ) : (
                        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", M.tile)} title={M.label}><MIcon size={18} /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">
                          {/* التذكير اليدوي عنوانه يكفي (قد يتضمن اسم الحيوان أصلاً) */}
                          {r.kind !== "manual" && r.petName
                            ? <>{r.petName} <span className="font-semibold text-ink-muted">— {r.detail}</span></>
                            : r.detail}
                        </p>
                        <p className="truncate text-2xs text-ink-subtle">
                          {r.ownerName && <>{r.ownerName} · </>}
                          {r.phone ? <span className="font-mono" dir="ltr">{r.phone}</span> : "بلا هاتف"}
                          {" · "}{formatDate(r.date, i18n.language)}{r.time ? ` · ${r.time}` : ""}
                        </p>
                      </div>
                      <span className={cn("chip shrink-0 text-2xs font-extrabold tabular-nums",
                        r.inDays < 0 ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300"
                          : r.inDays === 0 ? "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"
                            : "bg-surface-2 text-ink-muted")}>
                        {relLabel(r.inDays)}
                      </span>
                      {r.phone && (
                        /* يفتح معاينةً قابلة للتحرير — لا قفز أعمى للواتساب بعد اليوم */
                        <button onClick={(e) => { e.stopPropagation(); openInCampaigns(r); }} title={t("rem.sendWA", "إرسال تذكير واتساب")}
                          data-remsend={r.id}
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#25D366] px-2.5 text-xs font-bold text-white shadow-soft transition hover:bg-[#1fb959]">
                          <MessageCircle size={16} /> <span className="hidden sm:inline">{t("rem.sendShort", "ذكّر")}</span>
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            </section>
          ))}
        </div>
      )}

      <AddReminderModal open={adding} pets={pets} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); playSuccess(); toast.success(t("rem.added", "أُضيف التذكير")); void load(); }} />

    </div>
  );
}

/** إضافة تذكير يدوي سريع — عنوان، تصنيف، تاريخ/وقت، حيوان اختياري، تكرار. */
function AddReminderModal({ open, pets, onClose, onSaved }: { open: boolean; pets: Pet[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<EventCategory>("recheck");
  const [date, setDate] = useState(isoDay(new Date(Date.now() + 86400000)));
  const [time, setTime] = useState("09:00");
  const [petId, setPetId] = useState("");
  const [recurring, setRecurring] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTitle(""); setCategory("recheck"); setDate(isoDay(new Date(Date.now() + 86400000))); setTime("09:00"); setPetId(""); setRecurring("none"); }
  }, [open]);

  const save = async () => {
    if (busy) return;
    if (!title.trim()) { toast.error(t("rem.needTitle", "اكتب عنوان التذكير")); return; }
    setBusy(true);
    try {
      const pet = pets.find((p) => p.id === petId);
      await repo.addReminder({
        owner_id: null, pet_id: pet?.id ?? null, pet_name: pet?.name,
        category, title: title.trim(), date, time, recurring, enabled: true,
      });
      onSaved();
    } catch (e) {
      toast.error(t("rem.addFailed", "تعذّرت إضافة التذكير"), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("rem.add", "إضافة تذكير")}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("rem.fTitle", "العنوان")}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("rem.fTitlePh", "مثال: اتصال بمختبر التحاليل")} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t("rem.fCat", "التصنيف")}</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
              {(Object.keys(CATEGORY_LABELS) as EventCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t("rem.fPet", "الحيوان (اختياري)")}</label>
            <select className="input" value={petId} onChange={(e) => setPetId(e.target.value)}>
              <option value="">—</option>
              {pets.map((p) => <option key={p.id} value={p.id}>{p.name}{p.owner_name ? ` · ${p.owner_name}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t("rem.fDate", "التاريخ")}</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("rem.fTime", "الوقت")}</label>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">{t("rem.fRec", "التكرار")}</label>
          <div className="flex gap-1.5">
            {([["none", "بلا"], ["daily", "يومي"], ["weekly", "أسبوعي"], ["monthly", "شهري"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => { playTap(); setRecurring(v); }}
                className={cn("flex-1 rounded-xl px-2 py-2 text-xs font-bold transition", recurring === v ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" size="lg" loading={busy} leftIcon={<Plus size={16} />} onClick={save}>{t("rem.saveBtn", "حفظ التذكير")}</Button>
      </div>
    </Modal>
  );
}
