import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  BellRing, Syringe, Bug, Slice, CalendarDays, Cake, AlarmClock, Search,
  MessageCircle, Plus, AlertTriangle, CheckCircle2, Sun, CalendarClock,
} from "lucide-react";
import { getCached, setCached } from "@/lib/swrCache";
import type { Pet, Vaccination, Surgery, Appointment, Reminder, EventCategory } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/Modal";
import { Button, useToast, Skeleton } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { getDialCode, getClinicName } from "@/lib/settings";
import { waNumber } from "@/lib/phone";
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
}

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
  const dial = getDialCode();

  const [pets, setPets] = useState<Pet[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [manual, setManual] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [timeF, setTimeF] = useState<TimeFilter>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  // «أُرسلت» محفوظة بالجهاز: المعرف ← تاريخ الاستحقاق الذي أُرسلت له، فتنمسح
  // العلامة تلقائياً عندما يتجدد الموعد (تذكير متكرر أو جرعة جديدة).
  const [sentMap, setSentMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("vp_rem_sent") || "{}") as Record<string, string>; } catch { return {}; }
  });
  const saveSent = (m: Record<string, string>) => {
    setSentMap(m);
    try { localStorage.setItem("vp_rem_sent", JSON.stringify(m)); } catch { /* ignore */ }
  };
  const isSent = (r: Row) => sentMap[r.id] === r.date;
  const unmarkSent = (r: Row) => {
    const m = { ...sentMap };
    delete m[r.id];
    saveSent(m);
    toast.success(t("rem.resendReady", "أُلغيت العلامة — تقدر ترسل التذكير من جديد"));
  };

  const remKey = `remhub_${user?.clinic_id ?? user?.id ?? ""}`;
  const load = async () => {
    try {
      const p = await repo.listAllPets(user?.clinic_id ?? user?.id);
      const ids = p.map((x) => x.id);
      const from = isoDay(startOfToday());
      const to = isoDay(new Date(Date.now() + 60 * 86400000));
      const [vax, srg, appts, rems] = await Promise.all([
        repo.listAllVaccinations(ids),
        repo.listAllSurgeries().catch(() => [] as Surgery[]),
        repo.listAppointmentsInRange(from, to).catch(() => [] as Appointment[]),
        repo.listReminders().catch(() => [] as Reminder[]),
      ]);
      setCached(remKey, { p, vax, srg, appts, rems });
      setPets(p); setVaccinations(vax); setSurgeries(srg); setAppointments(appts); setManual(rems);
    } catch { /* empty state covers it */ }
    finally { setLoading(false); }
  };
  useEffect(() => {
    // فوري من الكاش + تحديث خفي
    const c = getCached<{ p: Pet[]; vax: Vaccination[]; srg: Surgery[]; appts: Appointment[]; rems: Reminder[] }>(remKey);
    if (c) { setPets(c.p); setVaccinations(c.vax); setSurgeries(c.srg); setAppointments(c.appts); setManual(c.rems); setLoading(false); }
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
    for (const v of vaccinations) {
      if (v.status === "administered" || !v.due_date) continue;
      const pet = petById.get(v.pet_id);
      if (!pet) continue;
      const inDays = daysFromToday(v.due_date);
      if (inDays === null) continue;
      push({
        id: `vax-${v.id}`, kind: DEWORM_RE.test(v.name) ? "deworming" : "vaccine",
        date: v.due_date.slice(0, 10), petId: pet.id, petName: pet.name,
        ownerName: pet.owner_name ?? "", phone: (pet.owner_phone ?? "").trim(),
        detail: v.name, inDays,
      });
    }

    // 🔪 متابعات العمليات (شيل خيوط / مراجعة) — تبقى حتى لو تأخرت.
    for (const s of surgeries) {
      if (!s.followup_on) continue;
      const inDays = daysFromToday(s.followup_on);
      if (inDays === null || inDays < -60) continue;
      const bits = petBits(s.pet_id);
      if (!bits.petName) continue;
      push({
        id: `srg-${s.id}`, kind: "surgery", date: s.followup_on.slice(0, 10),
        petId: s.pet_id, ...bits,
        detail: `متابعة: ${s.name.split("(")[0].trim()}`, inDays,
      });
    }

    // 📅 مواعيد الحجز القادمة (المؤكدة والمطلوبة).
    for (const a of appointments) {
      if (a.status !== "requested" && a.status !== "confirmed") continue;
      const inDays = daysFromToday(a.scheduled_at);
      if (inDays === null || inDays < 0) continue;
      const bits = petBits(a.pet_id);
      const at = new Date(a.scheduled_at);
      push({
        id: `apt-${a.id}`, kind: "appointment", date: a.scheduled_at.slice(0, 10),
        time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
        petId: a.pet_id, ...bits,
        detail: `${SERVICE_LABELS[a.service] ?? a.service}${a.doctor_name ? ` · ${a.doctor_name}` : ""}`, inDays,
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
        id: `rem-${r.id}`, kind: "manual", date: due, time: r.time || null,
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
  }, [vaccinations, surgeries, appointments, manual, pets, petById]);

  const kpis = useMemo(() => ({
    overdue: allRows.filter((r) => r.inDays < 0).length,
    today: allRows.filter((r) => r.inDays === 0).length,
    week: allRows.filter((r) => r.inDays >= 0 && r.inDays <= 7).length,
    total: allRows.length,
  }), [allRows]);

  const ql = q.trim().toLowerCase();
  const shown = allRows
    .filter((r) => (kind === "all" ? true : r.kind === kind))
    .filter((r) => timeF === "all" ? true
      : timeF === "overdue" ? r.inDays < 0
        : timeF === "today" ? r.inDays === 0
          : timeF === "week" ? r.inDays >= 0 && r.inDays <= 7
            : r.inDays >= 0 && r.inDays <= 30)
    .filter((r) => !ql || r.petName.toLowerCase().includes(ql) || r.ownerName.toLowerCase().includes(ql) || r.phone.includes(ql) || r.detail.toLowerCase().includes(ql));

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

  /** رسالة واتساب جاهزة حسب نوع التذكير. */
  const sendWA = (r: Row) => {
    const num = waNumber(r.phone, dial);
    if (!num) return;
    const clinic = getClinicName() || "عيادتنا";
    const dateTxt = formatDate(r.date, i18n.language);
    const msg =
      r.kind === "vaccine" ? `مرحباً ${r.ownerName || ""} 🌟\nنذكّركم بموعد لقاح «${r.detail}» لـ${r.petName} بتاريخ ${dateTxt}.\nبانتظاركم — ${clinic} 🐾`
        : r.kind === "deworming" ? `مرحباً ${r.ownerName || ""} 🌟\nحان موعد جرعة الديدان (${r.detail}) لـ${r.petName} بتاريخ ${dateTxt}.\nبانتظاركم — ${clinic} 🐾`
          : r.kind === "surgery" ? `مرحباً ${r.ownerName || ""} 🌟\nنذكّركم بموعد ${r.detail} لـ${r.petName} بتاريخ ${dateTxt}.\nسلامة ${r.petName} تهمّنا — ${clinic} 🐾`
            : r.kind === "appointment" ? `مرحباً ${r.ownerName || ""} 🌟\nنذكّركم بموعد ${r.petName} (${r.detail}) بتاريخ ${dateTxt}${r.time ? ` الساعة ${r.time}` : ""}.\nبانتظاركم — ${clinic} 🐾`
              : r.kind === "birthday" ? `مرحباً ${r.ownerName || ""} 🎂\nكل عام و${r.petName} بألف خير! ${r.detail}\nمع أطيب التمنيات — ${clinic} 🐾`
                : `مرحباً ${r.ownerName || ""} 🌟\nتذكير من ${clinic}: ${r.detail} — ${dateTxt}.\n🐾`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
    playTap();
    saveSent({ ...sentMap, [r.id]: r.date });
    void repo.logWhatsApp({ pet_id: r.petId ?? null, owner_name: r.ownerName || null, owner_phone: r.phone || null, reminder_type: r.kind }).catch(() => {});
  };

  const KIND_CHIPS: { id: Kind | "all"; label: string; icon: typeof Syringe }[] = [
    { id: "all", label: "الكل", icon: BellRing },
    { id: "vaccine", label: "لقاحات", icon: Syringe },
    { id: "deworming", label: "ديدان", icon: Bug },
    { id: "surgery", label: "متابعات العمليات", icon: Slice },
    { id: "appointment", label: "مواعيد", icon: CalendarDays },
    { id: "manual", label: "تذكيرات يدوية", icon: AlarmClock },
    { id: "birthday", label: "أعياد ميلاد", icon: Cake },
  ];
  /** شريط الملخص = هو نفسه فلتر الوقت: أربع خانات كبيرة تُضغط. */
  const SEGMENTS: { id: TimeFilter; label: string; value: number; icon: typeof Sun; activeCls: string; valueCls: string }[] = [
    { id: "overdue", label: "متأخرة", value: kpis.overdue, icon: AlertTriangle, activeCls: "bg-danger-50 dark:bg-danger-500/15", valueCls: kpis.overdue ? "text-danger-600 dark:text-danger-400" : "text-ink" },
    { id: "today", label: "اليوم", value: kpis.today, icon: Sun, activeCls: "bg-warn-50 dark:bg-warn-500/15", valueCls: kpis.today ? "text-warn-600 dark:text-warn-400" : "text-ink" },
    { id: "week", label: "هذا الأسبوع", value: kpis.week, icon: CalendarDays, activeCls: "bg-brand-50 dark:bg-brand-500/15", valueCls: "text-ink" },
    { id: "all", label: "الكل", value: kpis.total, icon: BellRing, activeCls: "bg-brand-50 dark:bg-brand-500/15", valueCls: "text-ink" },
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

      {/* شريط الملخص — أرقام كبيرة تُضغط للتصفية (يجمع الإحصاء والفلترة بصفٍّ واحد) */}
      <div className="card mb-4 grid grid-cols-4 overflow-hidden p-0">
        {SEGMENTS.map((s, i) => {
          const SIcon = s.icon;
          const active = timeF === s.id;
          return (
            <button key={s.id} onClick={() => { playTap(); setTimeF(s.id); }}
              className={cn("flex flex-col items-center gap-0.5 py-3.5 transition", i > 0 && "border-s border-line", active ? s.activeCls : "hover:bg-surface-2/60")}>
              <span className={cn("flex items-center gap-1.5 text-2xs font-bold", active ? "text-ink" : "text-ink-subtle")}><SIcon size={13} /> {s.label}</span>
              <span className={cn("text-2xl font-extrabold tabular-nums", s.valueCls)}>{s.value}</span>
            </button>
          );
        })}
      </div>

      {/* صف واحد: نوع التذكير + بحث */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {KIND_CHIPS.map((c) => {
          const Icon = c.icon;
          const active = kind === c.id;
          return (
            <button key={c.id} onClick={() => { playTap(); setKind(c.id); }}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition", active ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              <Icon size={13} /> {c.label}
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
                  const done = isSent(r);
                  const openFile = () => { if (r.petId) { playTap(); navigate(`/pet/${r.petId}`); } };
                  return (
                    <motion.div key={r.id} variants={staggerItem}
                      onClick={openFile}
                      className={cn(
                        "flex items-center gap-3 px-3.5 py-3 transition",
                        i > 0 && "border-t border-line",
                        r.petId && "cursor-pointer hover:bg-surface-2/50",
                        r.inDays < 0 && "bg-danger-50/40 dark:bg-danger-500/5",
                      )}>
                      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", M.tile)} title={M.label}><MIcon size={18} /></span>
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
                      {r.phone && (done ? (
                        /* أُرسلت ✓ — والضغط عليها يلغيها إذا الرسالة ما وصلت، فيرجع زر الإرسال */
                        <button onClick={(e) => { e.stopPropagation(); playTap(); unmarkSent(r); }}
                          title={t("rem.sentToggle", "أُرسلت ✓ — اضغط إذا ما وصلت الرسالة لتعيد إرسالها")}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success-500 text-white shadow-soft transition hover:bg-success-600">
                          <CheckCircle2 size={17} />
                        </button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); sendWA(r); }} title={t("rem.sendWA", "إرسال تذكير واتساب")}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#25D366]/10 text-[#128C4A] transition hover:bg-[#25D366]/25 dark:text-[#4ade80]">
                          <MessageCircle size={17} />
                        </button>
                      ))}
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
