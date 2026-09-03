import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  History, Search, PawPrint, Receipt, Pill, Syringe, Stethoscope, Package,
  Users, Trash2, NotebookPen, Building2, CalendarDays,
  BellRing, Lock, Clock, KeyRound, ArrowLeft, LucideIcon, RotateCcw, Loader2,
  ChevronDown, ChevronUp, ChevronRight, Truck, Wallet, ShoppingBag, Printer, FileDown, Store, HandCoins,
} from "lucide-react";
import type { ActivityRow, ActivitySummaryRow, ActivityActor } from "@/types";
import { repo } from "@/lib/repo";
import { listStaff } from "@/lib/staff";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { Button, Skeleton } from "@/components/ui";
import { cn, money, formatNum, formatDec, dateLocale } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { ACTIVITY_GROUPS, KIND_GROUP, NOISY_KINDS, type ActivityGroup, type ActivityKind } from "@/lib/activityKinds";

/* ============================================================================
 * مركزُ الحركات (0152) — مدير العيادة يسأل «شنو صار» بالنوع والوقت.
 *
 * القاعدةُ تصنّف كلَّ سطرٍ إلى نوعٍ (بيع، مرتجع، إضافة منتج، تغيير مخزون،
 * حذف…) وتجمع بالنوع واليوم/الساعة وتقلّب الصفحات بمؤشّر. الشاشةُ **تعرض**
 * فقط: رسمٌ شريطيّ للمدّة، رقاقاتُ أنواعٍ بعدّادات تفلتر بضغطة، فلترُ موظف،
 * بحثٌ بالخادم، و«المزيد» بلا تنزيل السجلّ كلّه. مختصرُ كل سطر (لا الصفُّ
 * كلُّه) يكفي لتسميته و«كان ← صار».
 *
 * Retention (0129): money & stock trails live a year, everything else 90 days.
 * ==========================================================================*/

type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "lastMonth" | "custom";
const PAGE = 50;
const DAY = 86400000;

const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const presetRange = (p: Preset): { from: Date; to: Date } => {
  const now = new Date();
  const today = dayStart(now);
  const tomorrow = new Date(today.getTime() + DAY);
  if (p === "yesterday") return { from: new Date(today.getTime() - DAY), to: today };
  if (p === "7d") return { from: new Date(today.getTime() - 6 * DAY), to: tomorrow };
  if (p === "30d") return { from: new Date(today.getTime() - 29 * DAY), to: tomorrow };
  // الشهرُ الجاري ينتهي عند الغد لا عند أوّل الشهر القادم — أعمدةٌ لأيامٍ لم تأتِ بعد ليست خبراً.
  if (p === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: first, to: new Date(Math.min(next.getTime(), tomorrow.getTime())) };
  }
  if (p === "lastMonth") return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
  return { from: today, to: tomorrow };
};
/** datetime-local ⇄ Date بلا تحويل منطقة. */
const toLocalInput = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
/** `type=date` ⇄ Date — يومٌ محليّ بلا انزلاقِ منطقةٍ زمنية. */
const toDateInput = (d: Date) => toLocalInput(d).slice(0, 10);
const fromDateInput = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/* ── «كان ← صار» ─────────────────────────────────────────────────────────── */
const CHANGE_NOISE = new Set(["updated_at", "created_at", "id", "clinic_id"]);
interface FieldChange { key: string; from: unknown; to: unknown }
function changesOf(brief: Record<string, unknown> | null | undefined): FieldChange[] {
  const c = brief?.["__changed"];
  if (!c || typeof c !== "object" || Array.isArray(c)) return [];
  const out: FieldChange[] = [];
  for (const [key, v] of Object.entries(c as Record<string, unknown>)) {
    if (CHANGE_NOISE.has(key) || !Array.isArray(v) || v.length !== 2) continue;
    out.push({ key, from: v[0], to: v[1] });
  }
  return out;
}

const KIND_LABEL: Record<string, { key: string; def: string }> = {
  treatment: { key: "act.kindCare", def: "رعاية طبية" },
  boarding: { key: "act.kindBoarding", def: "فندقة" },
  treatment_boarding: { key: "act.kindCareBoarding", def: "فندقة علاجية" },
};
const MEDIA_LABEL: Record<string, { key: string; def: string }> = {
  lab: { key: "rpt.media.lab", def: "تحاليل مخبرية" },
  xray: { key: "rpt.media.xray", def: "أشعة سينية" },
  ultrasound: { key: "rpt.media.ultrasound", def: "سونار / تصوير" },
};

/** أيقونةُ كلّ نوع ولونُه — النوعُ يُحدَّد بالخادم، والشكلُ هنا. */
const KIND_ICON: Record<ActivityKind, { icon: LucideIcon; tone: string }> = {
  sale: { icon: Receipt, tone: "success" }, refund: { icon: Receipt, tone: "danger" }, payment: { icon: HandCoins, tone: "success" },
  sale_edit: { icon: Receipt, tone: "muted" }, sale_delete: { icon: Trash2, tone: "danger" }, sale_line: { icon: Receipt, tone: "muted" },
  print: { icon: Printer, tone: "muted" }, export: { icon: FileDown, tone: "muted" },
  product_add: { icon: Package, tone: "brand" }, product_edit: { icon: Package, tone: "muted" }, stock: { icon: Package, tone: "warn" },
  product_delete: { icon: Trash2, tone: "danger" }, inventory: { icon: Building2, tone: "muted" }, purchase: { icon: ShoppingBag, tone: "brand" },
  supplier_pay: { icon: Wallet, tone: "success" }, expense: { icon: Wallet, tone: "warn" }, delivery: { icon: Truck, tone: "muted" },
  pet: { icon: PawPrint, tone: "brand" }, case: { icon: Stethoscope, tone: "brand" }, dose: { icon: Pill, tone: "brand" }, vaccine: { icon: Syringe, tone: "success" },
  medical: { icon: NotebookPen, tone: "muted" }, booking: { icon: CalendarDays, tone: "muted" }, message: { icon: BellRing, tone: "success" }, store: { icon: Store, tone: "brand" },
  team: { icon: Users, tone: "muted" }, payroll: { icon: Wallet, tone: "muted" }, settings: { icon: Building2, tone: "muted" }, login: { icon: KeyRound, tone: "muted" },
  override: { icon: KeyRound, tone: "warn" }, other: { icon: History, tone: "muted" },
};
const GROUP_BAR: Record<ActivityGroup, string> = { sales: "bg-success-500", stock: "bg-brand-500", care: "bg-warn-500", team: "bg-ink-subtle" };

const toneCls = (tone: string) =>
  tone === "success" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"
    : tone === "danger" ? "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300"
      : tone === "warn" ? "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"
        : tone === "brand" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
          : "bg-surface-2 text-ink-muted";

export function ActivityLog() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { restricted } = useOverride(); // جهازٌ مقفل بلا جلسة مدير → اليوم فقط

  const [preset, setPreset] = useState<Preset>("today");
  const [custom, setCustom] = useState<{ from: Date; to: Date }>(() => presetRange("today"));
  const range = useMemo(() => (restricted ? presetRange("today") : preset === "custom" ? custom : presetRange(preset)), [preset, custom, restricted]);
  const from = range.from.toISOString(), to = range.to.toISOString();
  const bucket: "day" | "hour" = range.to.getTime() - range.from.getTime() > 36 * 3600000 ? "day" : "hour";

  const [kinds, setKinds] = useState<Set<string>>(() => new Set());
  const [actor, setActor] = useState<string>("");
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  useEffect(() => { const id = setTimeout(() => setQDeb(q.trim()), 300); return () => clearTimeout(id); }, [q]);

  const [summary, setSummary] = useState<ActivitySummaryRow[] | null>(null);
  const [actors, setActors] = useState<ActivityActor[]>([]);
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [staffById, setStaffById] = useState<Map<string, string>>(() => new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const reqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    void repo.purgeAuditLog().catch(() => {});
    listStaff().then((s) => { if (alive) setStaffById(new Map(s.map((x) => [x.id, x.name]))); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  /** الأنواعُ المرسَلة للخادم: اختيارُ الطبيب، وإلا الكلُّ عدا الضجيج. */
  const kindsParam = useMemo(() => {
    if (kinds.size > 0) return [...kinds];
    return ACTIVITY_GROUPS.flatMap((g) => g.kinds).filter((k) => !NOISY_KINDS.includes(k));
  }, [kinds]);

  // الملخّصُ والموظفون: بالمدّة وحدها (الفلاترُ الأخرى تخصّ القائمة).
  useEffect(() => {
    let alive = true;
    setSummary(null);
    Promise.all([repo.activitySummary(from, to, bucket), repo.activityActors(from, to)])
      .then(([s, a]) => { if (alive) { setSummary(s); setActors(a); } })
      .catch(() => { if (alive) { setSummary([]); setActors([]); } });
    return () => { alive = false; };
  }, [from, to, bucket, tick]);

  // القائمة: صفحةٌ أولى بكل تغييرٍ بالفلاتر.
  useEffect(() => {
    const my = ++reqRef.current;
    setRows(null); setFailed(false); setExpanded(new Set());
    repo.activityPage({ from, to, kinds: kindsParam, actor: actor || null, q: qDeb || null, limit: PAGE })
      .then((r) => { if (my !== reqRef.current) return; setRows(r); setHasMore(r.length >= PAGE); })
      .catch(() => { if (my !== reqRef.current) return; setRows([]); setFailed(true); });
  }, [from, to, kindsParam, actor, qDeb, tick]);

  const loadMore = async () => {
    if (!rows || rows.length === 0 || more) return;
    const last = rows[rows.length - 1];
    const my = reqRef.current;
    setMore(true);
    try {
      const page = await repo.activityPage({ from, to, kinds: kindsParam, actor: actor || null, q: qDeb || null, limit: PAGE,
        before: last.created_at, beforeSrc: last.src, beforeId: typeof last.id === "number" ? last.id : null });
      if (my !== reqRef.current) return;
      const seen = new Set(rows.map((r) => `${r.src}${r.id}`));
      setRows([...rows, ...page.filter((r) => !seen.has(`${r.src}${r.id}`))]);
      setHasMore(page.length >= PAGE);
    } catch { setFailed(true); } finally { setMore(false); }
  };

  /* ── الأرقام من الملخّص ── */
  const counts = useMemo(() => {
    const byKind = new Map<string, number>();
    const byBucket = new Map<string, { total: number; groups: Record<ActivityGroup, number> }>();
    for (const r of summary ?? []) {
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + r.n);
      const g = KIND_GROUP[r.kind as ActivityKind] ?? "team";
      const b = byBucket.get(r.bucket) ?? { total: 0, groups: { sales: 0, stock: 0, care: 0, team: 0 } };
      b.total += r.n; b.groups[g] += r.n; byBucket.set(r.bucket, b);
    }
    const total = [...byKind.entries()].filter(([k]) => kindsParam.includes(k)).reduce((s, [, n]) => s + n, 0);
    return { byKind, buckets: [...byBucket.entries()].sort(([a], [b]) => a.localeCompare(b)), total };
  }, [summary, kindsParam]);

  /** أعمدةُ الرسم: كلُّ يومٍ/ساعةٍ بالمدّة حتى الفارغ — الفراغُ خبرٌ أيضاً. */
  const bars = useMemo(() => {
    const out: { at: Date; total: number; groups: Record<ActivityGroup, number> }[] = [];
    const step = bucket === "day" ? DAY : 3600000;
    const byKey = new Map(counts.buckets.map(([k, v]) => [new Date(k).getTime(), v]));
    for (let ms = range.from.getTime(); ms < range.to.getTime() && out.length < 240; ms += step) {
      const v = byKey.get(ms);
      out.push({ at: new Date(ms), total: v?.total ?? 0, groups: v?.groups ?? { sales: 0, stock: 0, care: 0, team: 0 } });
    }
    return out;
  }, [counts.buckets, range, bucket]);
  const barMax = Math.max(1, ...bars.map((b) => b.total));

  const drill = (at: Date) => {
    playTap();
    const step = bucket === "day" ? DAY : 3600000;
    setCustom({ from: at, to: new Date(at.getTime() + step) });
    setPreset("custom");
  };

  /* ── التنقّل بالتاريخ ────────────────────────────────────────────────────
   * سهمٌ ينقل النافذةَ بطولها هي: يومٌ يمشي يوماً، وأسبوعٌ أسبوعاً، وساعةٌ
   * مكبّرةٌ ساعةً. والنقلُ **بالأيام** لا بالمللي ثانية حين تكون النافذةُ أياماً
   * كاملة — وإلا انزلق حدُّ اليوم ساعةً عند تغيّر التوقيت الصيفي. */
  const shiftBy = (dir: 1 | -1) => {
    playTap();
    const f = range.from;
    // نافذةُ شهرٍ تمشي **شهراً** لا بطولها: «هذا الشهر» يوم الثالث طولُه ثلاثةُ
    // أيام، فنقلُه بطوله يرجع بثلاثة أيام لا إلى آب — وهو ما لا يقصده أحد.
    const monthWindow = f.getDate() === 1 && f.getHours() === 0 && f.getMinutes() === 0
      && range.to > f && range.to <= new Date(f.getFullYear(), f.getMonth() + 1, 1);
    if (monthWindow) {
      const from = new Date(f.getFullYear(), f.getMonth() + dir, 1);
      const end = new Date(f.getFullYear(), f.getMonth() + dir + 1, 1);
      const tomorrow = new Date(dayStart(new Date()).getTime() + DAY);
      setCustom({ from, to: new Date(Math.min(end.getTime(), tomorrow.getTime())) });
      setPreset("custom");
      return;
    }
    const len = range.to.getTime() - range.from.getTime();
    const days = Math.round(len / DAY);
    const from = new Date(f), to = new Date(range.to);
    if (days >= 1 && Math.abs(len - days * DAY) < 1000) {
      from.setDate(from.getDate() + dir * days);
      to.setDate(to.getDate() + dir * days);
    } else {
      from.setTime(from.getTime() + dir * len);
      to.setTime(to.getTime() + dir * len);
    }
    setCustom({ from, to });
    setPreset("custom");
  };
  /** لا تقدّمَ إلى الغد: النافذةُ التي تتجاوز الآن لا تحمل خبراً. */
  const canForward = range.to.getTime() <= Date.now();
  /** اذهب ليومٍ بعينه — اليومُ كلُّه من نصف ليله إلى نصف الليل التالي. */
  const jumpToDay = (s: string) => {
    const d = fromDateInput(s);
    if (!d) return;
    playTap();
    setCustom({ from: d, to: new Date(d.getTime() + DAY) });
    setPreset("custom");
  };
  /** عنوانُ النافذة الحالية: «الأحد ٣٠ آب»، أو «٣٠ آب – ٥ أيلول»، أو يومٌ بساعاته. */
  const rangeLabel = (): string => {
    const lastMs = range.to.getTime() - 1;
    const toIncl = new Date(lastMs);
    const dOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
    if (range.from.toDateString() === toIncl.toDateString()) {
      const dayTxt = range.from.toLocaleDateString(dateLocale(), { weekday: "long", ...dOpts });
      const wholeDay = range.from.getHours() === 0 && range.from.getMinutes() === 0 && range.to.getTime() - range.from.getTime() >= DAY - 1000;
      if (wholeDay) return dayTxt;
      const hr = (d: Date) => d.toLocaleTimeString(dateLocale(), { hour: "numeric", hour12: true });
      return `${dayTxt} · ${hr(range.from)} – ${hr(range.to)}`;
    }
    return `${range.from.toLocaleDateString(dateLocale(), dOpts)} – ${toIncl.toLocaleDateString(dateLocale(), { ...dOpts, year: toIncl.getFullYear() === range.from.getFullYear() ? undefined : "numeric" })}`;
  };
  const toggleKind = (k: string) => {
    playTap();
    setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  };

  /** قيمةٌ خامّ → نصٌّ قصير. */
  const val = useMemo(() => (v: unknown): string => {
    if (v === null || v === undefined) return t("act.chEmpty", "فارغ");
    if (typeof v === "boolean") return v ? t("act.chYes", "نعم") : t("act.chNo", "لا");
    if (typeof v === "number") return formatDec(v);
    const sv = String(v);
    if (/^\[large:\d+\]$/.test(sv)) return t("act.chBig", "محتوى كبير");
    return sv.length > 28 ? sv.slice(0, 28) + "…" : sv;
  }, [t]);

  /** (entity, action, brief) → جملةٌ تُقرأ. نفسُ الجمل السابقة؛ المصدرُ مختصرٌ لا صفٌّ كامل. */
  const render = useMemo(() => (r: ActivityRow): string => {
    const d = (r.brief ?? {}) as Record<string, unknown>;
    const s = (k: string) => { const v = d[k]; return typeof v === "string" && v.trim() ? v.trim() : ""; };
    const del = r.action === "DELETE";
    const pn = () => s("pet_name") || t("act.aPet", "حيوان");
    switch (r.entity) {
      case "pets":
        return del ? t("act.petDel", { name: s("name"), defaultValue: "حذف الحيوان {{name}} نهائياً" })
          : r.action === "INSERT" ? t("act.petAdd", { name: s("name"), defaultValue: "أضاف حيواناً جديداً: {{name}}" })
            : t("act.petUpd", { name: s("name"), defaultValue: "عدّل بيانات الحيوان {{name}}" });
      case "admissions": {
        const kind = KIND_LABEL[s("kind")] ?? KIND_LABEL.treatment;
        if (r.action === "INSERT") return t("act.admAdd", { pet: pn(), kind: t(kind.key, kind.def), defaultValue: "أدخل {{pet}} إلى العيادة — {{kind}}" });
        const outcome = s("outcome");
        if (outcome === "deceased") return t("act.admDeceased", { pet: pn(), defaultValue: "سجّل خروج {{pet}} — متوفى" });
        if (outcome === "recovered") return t("act.admRecovered", { pet: pn(), defaultValue: "سجّل خروج {{pet}} — عايش / تعافى" });
        if (s("status") === "discharged") return t("act.admDischarge", { pet: pn(), defaultValue: "أخرج الحالة — {{pet}}" });
        return t("act.admUpd", { pet: pn(), defaultValue: "حدّث حالة {{pet}} (نقل / تعديل)" });
      }
      case "clinic_visits":
        return r.action === "INSERT" ? t("act.caseOpen", { pet: pn(), defaultValue: "فتح حالة — {{pet}}" })
          : s("status") === "closed" || d["closed_at"] ? t("act.caseClose", { pet: pn(), defaultValue: "أغلق حالة — {{pet}}" })
            : t("act.caseUpd", { pet: pn(), defaultValue: "حدّث حالة — {{pet}}" });
      case "treatment_entries": {
        const med = s("medication"); const amount = s("amount");
        if (r.action === "INSERT") return t("act.doseAdd", { med, amount, pet: pn(), defaultValue: "أضاف دواء: {{med}} ({{amount}}) لـ {{pet}}" });
        if (del) return t("act.doseDel", { med, defaultValue: "حذف جرعة دواء: {{med}}" });
        return d["administered_at"] ? t("act.doseGiven", { med, pet: pn(), defaultValue: "أعطى جرعة {{med}} لـ {{pet}}" }) : t("act.doseUpd", { med, defaultValue: "عدّل جرعة الدواء {{med}}" });
      }
      case "vaccinations":
        return r.action === "UPDATE" ? t("act.vacUpd", { name: s("vaccine") || s("name"), defaultValue: "حدّث لقاح {{name}}" })
          : t("act.vacAdd", { name: s("vaccine") || s("name"), pet: pn(), defaultValue: "سجّل لقاح {{name}} لـ {{pet}}" });
      case "medical_visits": return t("act.visitAdd", { pet: pn(), doctor: s("doctor_name"), defaultValue: "أضاف استشارة لـ {{pet}} — {{doctor}}" });
      case "pet_notes": return t("act.noteAdd", { pet: pn(), defaultValue: "أضاف ملاحظة سريرية لـ {{pet}}" });
      case "media_items": {
        const kind = MEDIA_LABEL[s("kind")];
        return t("act.mediaAdd", { kind: kind ? t(kind.key, kind.def) : t("act.mediaFile", "ملف / صورة"), pet: pn(), defaultValue: "رفع {{kind}} لـ {{pet}}" });
      }
      case "weight_logs": return t("act.weightAdd", { pet: pn(), kg: formatNum(Number(d["weight_kg"]) || 0), defaultValue: "سجّل وزن {{pet}}: {{kg}} كغم" });
      case "lab_results": return t("act.labAdd", { name: s("test") || s("test_name") || s("name"), pet: pn(), defaultValue: "تحليل {{name}} — {{pet}}" });
      case "invoices": {
        const total = money(Number(d["total"]) || 0);
        const client = s("customer_name") || t("rpt.walkIn", "عميل نقدي");
        if (r.kind === "sale") return t("act.invAdd", { total, client, defaultValue: "أنشأ فاتورة بمبلغ {{total}} — {{client}}" });
        if (r.kind === "sale_delete") return t("act.invDel", { total, client, defaultValue: "حذف فاتورة {{total}} ({{client}}) نهائياً" });
        if (r.kind === "refund") return t("act.invRefund", { total, client, defaultValue: "أرجع فاتورة {{total}} — {{client}}" });
        if (r.kind === "payment") return t("act.invPay", { total, client, defaultValue: "سدّد دين — {{client}} ({{total}})" });
        return t("act.invUpd", { total, client, defaultValue: "حدّث فاتورة {{client}} ({{total}}) — تسديد / تعديل" });
      }
      case "products": {
        const name = s("name");
        if (r.action === "INSERT") return t("act.prodAdd", { name, defaultValue: "أضاف منتجاً: {{name}}" });
        if (del) return t("act.prodDel", { name, defaultValue: "حذف المنتج: {{name}}" });
        return t("act.prodUpd", { name, stock: formatNum(Number(d["stock"]) || 0), defaultValue: "عدّل المنتج {{name}} (المخزون: {{stock}})" });
      }
      case "branches": return t("act.branchAdd", { name: s("name"), defaultValue: "فرع: {{name}} (إضافة / تعديل)" });
      case "reminders": return t("act.reminderAdd", { title: s("title") || s("text"), defaultValue: "تذكير: {{title}}" });
      case "appointments": return t("act.apptAdd", { pet: pn(), defaultValue: "موعد لـ {{pet}} (حجز / تعديل)" });
      case "staff":
        return del ? t("act.staffDel", { name: s("name"), defaultValue: "أزال الموظف {{name}}" })
          : r.action === "INSERT" ? t("act.staffAdd", { name: s("name"), defaultValue: "أضاف موظفاً: {{name}}" })
            : t("act.staffUpd", { name: s("name"), defaultValue: "عدّل بيانات / صلاحيات الموظف {{name}}" });
      case "memberships": case "invites": return t("act.accessChange", "تغيير في وصول الكادر (دعوة / عضوية)");
      case "invoice_items": {
        const qty = formatNum(Number(d["qty"]) || 0);
        return t("act.itemSold", { name: s("name"), qty, total: money(Number(d["line_total"]) || 0), defaultValue: "باع: {{name}} ×{{qty}} — {{total}}" });
      }
      case "purchases": return t("act.purchaseAdd", { name: s("company_name") || s("name"), total: money(Number(d["total"]) || 0), defaultValue: "فاتورة شراء — {{name}} ({{total}})" });
      case "purchase_items": return t("act.purchaseItem", { name: s("name"), qty: formatNum(Number(d["qty"]) || 0), defaultValue: "استلم: {{name}} ×{{qty}}" });
      case "purchase_payments": return t("act.supplierPay", { amount: money(Number(d["amount"]) || 0), defaultValue: "دفع لمورّد {{amount}}" });
      case "expenses": return t("act.expenseAdd", { amount: money(Number(d["amount"]) || 0), name: s("category") || s("note") || s("name"), defaultValue: "مصروف {{amount}} — {{name}}" });
      case "delivery_orders": return t("act.deliveryUpd", { status: s("status"), name: s("customer_name"), defaultValue: "توصيل — {{name}} ({{status}})" });
      case "couriers": return t("act.courierUpd", { name: s("name"), defaultValue: "سائق / شركة توصيل: {{name}}" });
      case "courier_settlements": return t("act.courierSettle", { amount: money(Number(d["amount"]) || 0), defaultValue: "تحصيل من التوصيل {{amount}}" });
      case "wa_messages": return t("act.waSend", { name: s("owner_name") || t("rpt.clientFallback", "عميل"), kind: s("reminder_type"), defaultValue: "أرسل رسالة واتساب — {{name}} ({{kind}})" });
      case "clinics": return t("act.clinicUpd", "عدّل بيانات / إعدادات العيادة");
      case "login": return t("act.login", "سجّل دخول إلى النظام");
      case "client": {
        const ev = s("event");
        if (ev === "invoice.print") return t("act.invPrint", { ref: s("ref"), format: s("format") === "thermal" ? t("act.printThermal", "إيصال حراري") : "A4", defaultValue: "طبع الفاتورة {{ref}} ({{format}})" });
        if (ev === "invoice.preprint") return t("act.invPreprint", { total: s("total"), defaultValue: "طبع فاتورة أولية (قبل البيع) بمبلغ {{total}}" });
        if (ev === "report.excel") return t("act.reportExcel", { title: s("title"), defaultValue: "صدّر تقرير Excel — {{title}}" });
        if (ev === "report.print") return t("act.reportPrint", { title: s("title"), defaultValue: "طبع تقرير — {{title}}" });
        if (ev === "report.csv") return t("act.reportCsv", "صدّر ملف CSV من التقارير");
        if (ev === "consent.print") return t("act.consentPrint", { pet: s("pet"), defaultValue: "طبع نموذج إقرار — {{pet}}" });
        if (ev === "override.unlock") return t("act.ovUnlock", "فتح وضع المدير بالرمز السري");
        if (ev === "override.fail") return t("act.ovFail", "أدخل رمزاً خاطئاً لوضع المدير");
        if (ev === "override.lock") return t("act.ovLock", "أقفل وضع المدير");
        if (ev === "override.devlock") return t("act.ovDevLock", "قفل هذا الجهاز بواجهة الاستقبال");
        if (ev === "override.devunlock") return t("act.ovDevUnlock", "ألغى قفل واجهة الاستقبال لهذا الجهاز");
        return ev || "client";
      }
      default:
        if (r.entity.startsWith("clinic_")) return t("act.settingsChange", { name: s("name") || s("label") || r.entity.replace("clinic_", ""), defaultValue: "تعديل في إعدادات العيادة: {{name}}" });
        // نوعٌ معروف بلا جملةٍ خاصة: اسمُ النوع + ما يسمّي الصفّ.
        return `${t(`act.kinds.${r.kind}`, r.kind)}${s("name") || s("title") ? ` — ${s("name") || s("title")}` : ""}`;
    }
  }, [t]);

  const actorOf = (r: ActivityRow): string => {
    if (r.actor_name) return r.actor_name;
    if (r.actor && user && r.actor === user.id) return user.full_name || t("act.manager", "مدير العيادة");
    const d = r.brief as Record<string, unknown> | null;
    const sid = d?.["staff_id"];
    if (typeof sid === "string" && staffById.get(sid)) return staffById.get(sid)!;
    const doc = d?.["doctor_name"] ?? d?.["doctor"];
    if (typeof doc === "string" && doc.trim()) return doc.trim();
    return r.actor ? t("act.manager", "مدير العيادة") : t("act.system", "النظام");
  };

  const groups = useMemo(() => {
    const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
    const today = dayKey(Date.now()), yest = dayKey(Date.now() - DAY);
    const out: { label: string; items: ActivityRow[] }[] = [];
    for (const r of rows ?? []) {
      const ms = new Date(r.created_at).getTime();
      const k = dayKey(ms);
      const label = k === today ? t("act.today", "اليوم") : k === yest ? t("act.yesterday", "أمس")
        : new Date(ms).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" });
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(r); else out.push({ label, items: [r] });
    }
    return out;
  }, [rows, t]);

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit", hour12: true });
  const barLabel = (d: Date) => bucket === "day"
    ? d.toLocaleDateString(dateLocale(), { day: "numeric", month: "numeric" })
    : d.toLocaleTimeString(dateLocale(), { hour: "numeric", hour12: true });

  if (!can("manageSettings")) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("act.noAccess", "سجل الحركات متاح لمدير العيادة فقط.")}</p>
      </div>
    );
  }

  const PRESETS: { id: Preset; label: string }[] = [
    { id: "today", label: t("act.rangeToday", "Today") }, { id: "yesterday", label: t("act.rangeYesterday", "Yesterday") },
    { id: "7d", label: t("act.range7d", "7 days") }, { id: "30d", label: t("act.range30d", "30 days") },
    { id: "month", label: t("act.rangeMonth", "This month") }, { id: "lastMonth", label: t("act.rangeLastMonth", "Last month") },
    { id: "custom", label: t("act.rangeCustom", "Custom") },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><History size={24} /></span>
        <div className="me-auto">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("act.title", "سجل الحركات")}</h1>
          <p className="text-sm text-ink-subtle">{t("act.subtitle", "كل حركة صارت في العيادة — مَن قام بها ومتى.")}</p>
        </div>
        <span className="chip bg-warn-50 text-2xs font-semibold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">
          <Clock size={12} className="me-1 inline" /> {t("act.retention", "حركات المال والمخزون تبقى سنة كاملة — وباقي الحركات ٩٠ يوماً، ثم تُحذف تلقائياً")}
        </span>
      </div>

      {/* ── المدّة ── */}
      <div className="mb-3 space-y-2.5 rounded-2xl border border-line bg-surface-1 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.filter((p) => !restricted || p.id === "today").map((p) => (
            <button key={p.id} data-actrange={p.id} onClick={() => { playTap(); setPreset(p.id); if (p.id === "custom") setCustom(presetRange("today")); }}
              className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition", preset === p.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              {p.label}
            </button>
          ))}
          <span className="ms-auto text-2xs text-ink-subtle">{summary ? t("act.total", { n: formatNum(counts.total), defaultValue: "{{n}} actions" }) : <Loader2 size={12} className="animate-spin" />}</span>
        </div>
        {/* ── شريطُ التاريخ: سهمٌ للخلف، عنوانُ النافذة، سهمٌ للأمام، وقفزةٌ ليومٍ بعينه ── */}
        {!restricted && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-1.5">
            <button type="button" data-actprev onClick={() => shiftBy(-1)} title={t("act.prevPeriod", "Previous period")} aria-label={t("act.prevPeriod", "Previous period")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-1 text-ink-muted transition hover:text-ink">
              <ChevronRight size={17} className="ltr:rotate-180" />
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-sm font-extrabold text-ink" data-actlabel>{rangeLabel()}</span>
            <button type="button" data-actnext disabled={!canForward} onClick={() => shiftBy(1)} title={t("act.nextPeriod", "Next period")} aria-label={t("act.nextPeriod", "Next period")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-1 text-ink-muted transition hover:text-ink disabled:opacity-40">
              <ChevronRight size={17} className="rtl:rotate-180" />
            </button>
            <label className="flex items-center gap-1.5 text-2xs font-bold text-ink-muted">
              <CalendarDays size={14} /> {t("act.jumpTo", "Go to date")}
              <input type="date" className="input h-9 w-auto py-0 text-xs" value={toDateInput(range.from)} max={toDateInput(new Date())} data-actjump
                onChange={(e) => jumpToDay(e.target.value)} />
            </label>
          </div>
        )}
        {preset === "custom" && !restricted && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-ink-muted">{t("act.from", "From")}
              <input type="datetime-local" className="input h-9 w-auto py-0 text-xs" value={toLocalInput(custom.from)} data-actfrom
                onChange={(e) => { const d = new Date(e.target.value); if (!Number.isNaN(d.getTime())) setCustom((c) => ({ ...c, from: d })); }} />
            </label>
            <label className="flex items-center gap-1.5 text-ink-muted">{t("act.to", "To")}
              <input type="datetime-local" className="input h-9 w-auto py-0 text-xs" value={toLocalInput(custom.to)} data-actto
                onChange={(e) => { const d = new Date(e.target.value); if (!Number.isNaN(d.getTime())) setCustom((c) => ({ ...c, to: d })); }} />
            </label>
            <button type="button" className="text-2xs font-bold text-brand-600" onClick={() => { playTap(); setPreset("today"); }} data-actbacktoday>
              {t("act.backToToday", "Back to today")}
            </button>
          </div>
        )}

        {/* ── الرسم: عمودٌ لكل يوم/ساعة، مكدَّسٌ بالمجموعة ── */}
        <div>
          <div className="mb-1 flex items-center justify-between text-2xs text-ink-subtle">
            <span>{bucket === "day" ? t("act.perDay", "By day") : t("act.perHour", "By hour")}</span>
            <span>{t("act.drillHint", "Tap a bar to zoom into it")}</span>
          </div>
          <div className="flex h-24 items-end gap-px overflow-x-auto rounded-xl bg-surface-2 px-1 pt-2" data-actchart>
            {summary === null ? <Skeleton className="h-full w-full rounded-lg" /> : bars.map((b) => (
              <button key={b.at.toISOString()} type="button" onClick={() => drill(b.at)} data-actbar={b.at.toISOString()}
                title={`${barLabel(b.at)} · ${formatNum(b.total)}`}
                className="group flex h-full min-w-[14px] flex-1 flex-col justify-end rounded-t-sm transition hover:bg-brand-50/60 dark:hover:bg-brand-500/10">
                <span className="flex flex-col-reverse" style={{ height: `${Math.round((b.total / barMax) * 78)}%` }}>
                  {ACTIVITY_GROUPS.map((g) => b.groups[g.id] > 0 && (
                    <span key={g.id} className={cn("w-full", GROUP_BAR[g.id])} style={{ flexGrow: b.groups[g.id] }} />
                  ))}
                </span>
                <span className="block truncate text-center text-[9px] leading-4 text-ink-subtle">{bars.length <= 31 || b.at.getHours() === 0 ? barLabel(b.at) : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── الأنواع بعدّاداتها ── */}
      <div className="mb-3 space-y-2 rounded-2xl border border-line bg-surface-1 p-3" data-actkinds>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink-muted">{t("act.typesTitle", "What happened")}</span>
          {kinds.size > 0 && <button className="text-2xs font-bold text-brand-600" onClick={() => { playTap(); setKinds(new Set()); }}>{t("act.catAll", "الكل")}</button>}
        </div>
        {ACTIVITY_GROUPS.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center gap-1.5">
            <span className={cn("me-1 inline-block h-2.5 w-2.5 rounded-full", GROUP_BAR[g.id])} />
            <span className="me-1 w-24 text-2xs font-bold text-ink-subtle">{t(`act.groups.${g.id}`, g.id)}</span>
            {g.kinds.map((k) => {
              const n = counts.byKind.get(k) ?? 0;
              const on = kinds.has(k);
              if (n === 0 && !on) return null;
              return (
                <button key={k} type="button" data-actkind={k} onClick={() => toggleKind(k)}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition",
                    on ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink", NOISY_KINDS.includes(k) && !on && "opacity-60")}>
                  {t(`act.kinds.${k}`, k)} <span className="tabular-nums opacity-80">{formatNum(n)}</span>
                </button>
              );
            })}
          </div>
        ))}
        {(counts.byKind.get("sale_line") ?? 0) > 0 && !kinds.has("sale_line") && (
          <p className="text-2xs text-ink-subtle">{t("act.noiseHidden", "Invoice lines are hidden by default")}</p>
        )}
      </div>

      {/* ── الموظف + البحث ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("act.searchPh", "ابحث بالحركة أو اسم الموظف أو الحيوان…")} data-actsearch />
        </div>
        <select className="input h-11 w-auto min-w-[160px]" value={actor} onChange={(e) => { playTap(); setActor(e.target.value); }} data-actactor>
          <option value="">{t("act.allStaff", "All staff")}</option>
          {actors.map((a) => <option key={a.actor} value={a.actor}>{a.name} ({formatNum(a.n)})</option>)}
        </select>
      </div>

      {/* ── القائمة ── */}
      {failed ? (
        <div className="card space-y-3 p-8 text-center">
          <p className="text-sm text-ink-subtle">{t("act.loadFailed", "Could not load the activity — try again.")}</p>
          <Button variant="secondary" leftIcon={<RotateCcw size={15} />} onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry", "Retry")}</Button>
        </div>
      ) : rows === null ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-line bg-surface-1 px-6 py-16 text-center">
          <History size={30} className="mb-2 text-ink-subtle/40" />
          <p className="text-sm text-ink-subtle">{counts.total === 0 && kinds.size === 0 && !qDeb && !actor ? t("act.empty", "لا توجد حركات مسجّلة بعد — كل عملية جديدة ستظهر هنا فوراً.") : t("act.noMatch", "لا توجد حركات مطابقة لبحثك.")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-ink-subtle"><CalendarDays size={13} /> {g.label}</h2>
              <div className="space-y-1.5">
                {g.items.map((r) => {
                  const meta = KIND_ICON[r.kind as ActivityKind] ?? KIND_ICON.other;
                  const Icon = meta.icon;
                  const ch = changesOf(r.brief);
                  const key = `${r.src}${r.id}`;
                  const open = expanded.has(key);
                  const shownCh = open ? ch : ch.slice(0, 3);
                  return (
                    <div key={key} data-actrow={r.kind} className="flex items-start gap-3 rounded-2xl border border-line bg-surface-1 p-3">
                      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneCls(meta.tone))}><Icon size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold leading-snug text-ink">
                          <span className={cn("chip text-2xs font-bold", toneCls(meta.tone))}>{t(`act.kinds.${r.kind}`, r.kind)}</span>
                          {render(r)}
                        </p>
                        {ch.length > 0 && (
                          <p className="mt-1 flex flex-wrap items-center gap-1">
                            {shownCh.map((c) => (
                              <span key={c.key} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted">
                                <b className="font-semibold text-ink-subtle">{t(`act.f.${c.key}`, { defaultValue: c.key })}</b>
                                <span className="tabular-nums line-through opacity-60">{val(c.from)}</span>
                                <ArrowLeft size={9} className="shrink-0 rtl:rotate-180" />
                                <span className="tabular-nums font-semibold text-ink">{val(c.to)}</span>
                              </span>
                            ))}
                            {ch.length > 3 && (
                              <button type="button" className="inline-flex items-center gap-0.5 text-[10px] font-bold text-brand-600"
                                onClick={() => { playTap(); setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }); }}>
                                {open ? <><ChevronUp size={10} /> {t("act.hideChanges", "Hide changes")}</> : <><ChevronDown size={10} /> {t("act.chMore", { n: formatNum(ch.length - 3), defaultValue: "و{{n}} غيرها" })}</>}
                              </button>
                            )}
                          </p>
                        )}
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
                          <span className="inline-flex items-center gap-1 font-semibold text-ink-muted"><Users size={11} /> {actorOf(r)}</span>
                          <span>·</span>
                          <span dir="ltr">{timeOf(r.created_at)}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {hasMore && (
            <Button variant="secondary" className="w-full" loading={more} onClick={() => { playTap(); void loadMore(); }} data-actmore>
              {t("act.loadMore", "Load more")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
