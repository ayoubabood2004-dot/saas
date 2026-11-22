// ============================================================================
// تركيبُ ورقة الحالة من نموذج الملخّص — صِرفٌ (يفحصه case-summary-test بـ`t` مزيَّف): كلُّ كلمةٍ من نطاق csht،
// والمطفأُ بخيارات النافذة لا يُرسم (أسماءُ الأدوية، سجلُّ الجرعات، يومياتُ الإقامة، اللقاحات، الزيارات، الملاحظات،
// المختبر). ولكلّ قسمٍ وسطرٍ وخانةٍ مفتاحٌ ثابت (معرّفُ الجرعة، يومُ الإقامة، اسمُ الدواء…) — تعديلُ الطبيب يتبع مفتاحَه
// لا موضعَه، فإطفاءُ قسمٍ لا يزحلق تعديلاً على سطرٍ غيره (caseSheetPrint.mapTexts).
// ============================================================================
import type { TFunction } from "i18next";
import { formatDate, formatNum, formatTime } from "./utils";
import { PAST_MISS_REASON } from "./backdate";
import { markCourseComplete, type CaseModel, type DayEntry, type DoseState } from "./caseSummary";
import type { LogEvent } from "./stayLog";
import type { CaseSheet, Field, Paper, SheetBlock, SheetEdit, Spot, Tone } from "./caseSheetPrint";
import { mapTexts } from "./caseSheetPrint";
import type { Pet } from "@/types";

export function ageOf(dob: string | null | undefined, t: TFunction, today: string): string {
  if (!dob) return "";
  const [y1, m1, d1] = dob.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  if (!y1 || !y2) return "";
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  const y = Math.floor(months / 12), m = months % 12;
  return y && m ? t("csht.ageYM", { y: formatNum(y), m: formatNum(m) }) : y ? t("csht.ageY", { n: formatNum(y) }) : t("csht.ageM", { n: formatNum(m) });
}

const f = (key: string, label: string, value: string): Field => ({ key, label, value });
/** لونُ حالة الجرعة بسجلّ الجرعات: انطت خضراء، وما انطت حمراء، ومتأخّرةٌ صفراء، واليومُ زرقاء، والقادمةُ بلا لون. */
const TONE: Record<DoseState, Tone | undefined> = { given: "ok", missed: "bad", overdue: "warn", due: "info", upcoming: undefined };

/** ما تُظهره اليومياتُ — خياراتُ النافذة نفسُها: «أخفِ أسماء الأدوية» يعدّ الجرعاتَ بلا أسمائها، والقسمُ المطفأ
 *  (لقاحات، زيارات، ملاحظات، تحاليل) لا يرجع من باب اليوميات. */
export interface DayShow { names: boolean; vaccines: boolean; visits: boolean; notes: boolean; labs: boolean }

/** سطرُ يومٍ من الإقامة: ما صار فيه بالترتيب، كلُّ حدثٍ بكلمته من csht، مفصولةً بـ« · ». */
export function dayText(x: DayEntry, t: TFunction, lang: string, show: DayShow): string {
  const time = (at: string | null) => (at ? formatTime(at, lang) : "");
  const list = (v: unknown) => (Array.isArray(v) ? (v as [string, number][]).map(([n, c]) => (c > 1 ? `${n} ×${formatNum(c)}` : n)).join(" · ") : "");
  const one = (e: LogEvent): string => {
    const d = e.data;
    const cage = typeof d.toCage === "string" && d.toCage ? d.toCage : "";
    switch (e.kind) {
      case "in": return [e.at ? t("csht.ev.inAt", { time: time(e.at) }) : t("csht.ev.in"), cage ? t("csht.ev.cage", { cage }) : ""].filter(Boolean).join(" · ");
      case "out": return e.at ? t("csht.ev.outAt", { time: time(e.at) }) : t("csht.ev.out");
      case "transfer": return typeof d.to === "string" && d.to ? t("csht.ev.transfer", { kind: t(`csht.kinds.${d.to}`) }) : t("csht.ev.transferAny");
      case "cage": return cage ? t("csht.ev.cage", { cage }) : "";
      case "visitOpen": return show.visits ? t("csht.ev.visit") : "";
      case "visitClose": return show.visits ? t("csht.ev.visitEnd") : "";
      case "plan": return !show.notes ? "" : Array.isArray(d.dx) && d.dx.length ? t("csht.ev.plan", { dx: (d.dx as string[]).join(" · ") }) : t("csht.ev.planAny");
      // الجرعاتُ تأتي من النموذج (أدناه) — هذان لا يصلان؛ يبقيان كي لا يُسكت نوعٌ جديد من stayLog.
      case "doses": case "dosesMissed": return "";
      case "vaccine": return show.vaccines ? t("csht.ev.vaccine", { name: String(d.name ?? "") }) : "";
      case "lab": return show.labs ? t("csht.ev.lab", { name: String(d.name ?? "") }) : "";
      case "weight": return t("csht.ev.weight", { kg: formatNum(Number(d.kg)) });
      case "note": return show.notes ? t("csht.ev.note", { text: String(d.text ?? "") }) : "";
    }
  };
  const count = (l: [string, number][]) => formatNum(l.reduce((n, [, c]) => n + c, 0));
  const doses = show.names ? [
    x.given.length ? t("csht.ev.doses", { list: list(x.given) }) : "",
    x.missed.length ? t("csht.ev.missed", { list: list(x.missed) }) : "",
    x.overdue.length ? t("csht.ev.overdue", { list: list(x.overdue) }) : "",
  ] : [
    x.given.length ? t("csht.ev.dosesN", { n: count(x.given) }) : "",
    x.missed.length ? t("csht.ev.missedN", { n: count(x.missed) }) : "",
    x.overdue.length ? t("csht.ev.overdueN", { n: count(x.overdue) }) : "",
  ];
  const care = x.care.map((c) => `${t("csht.ev.care", { label: t(`csht.care.${c.type}`), done: formatNum(c.done), total: formatNum(c.total) })}${c.values.length ? ` (${c.values.join(" · ")})` : ""}`);
  return [...x.events.map(one), ...doses, ...care].filter(Boolean).join(" · ");
}

/** الورقةُ من النموذج — كلُّ كلمةٍ من نطاق csht، والمحذوفُ بالخيارات لا يُرسم. */
export function composeSheet(a: {
  t: TFunction; lang: string; pet: Pet; model: CaseModel; scope: "stay" | "all"; paper: Paper;
  showDrugs: boolean; showDoseLog: boolean; showDays?: boolean; parts: { vaccines: boolean; visits: boolean; notes: boolean; labs: boolean };
  tips: string[]; doctorNote: string; clinic: CaseSheet["clinic"]; doctor: string | null; today: string; autoPrint: boolean;
  /** «العلاج مكتمل»: تصريحُ الطبيب أنه أعطى كلَّ الجرع ولو ما خُتمت بالنظام (markCourseComplete) — يُحفظ تصريحاً مع التقرير. */
  courseComplete?: boolean;
}): CaseSheet {
  const { t, lang, pet } = a;
  const complete = !!a.courseComplete && a.model.meds.length > 0;
  const m = complete ? markCourseComplete(a.model) : a.model;
  const d = (iso: string | null | undefined) => (iso ? formatDate(iso, lang, true) : "");
  const dt = (iso: string | null | undefined) => (iso ? `${formatDate(iso, lang, true)} ${formatTime(iso, lang)}` : "");
  const stay = a.scope === "stay" ? m.stays[0] ?? null : m.current;
  const lastW = m.weight.last?.weight_kg ?? pet.current_weight_kg ?? null;
  const blocks: SheetBlock[] = [];

  blocks.push({ key: "pet", kind: "grid", title: t("csht.pet"), cells: [
    f("name", t("csht.petName"), pet.name), f("species", t("csht.species"), t(`pet.species.${pet.species}`, pet.species)),
    f("breed", t("csht.breed"), pet.breed ?? ""), f("sex", t("csht.sex"), t(`pet.sex.${pet.sex}`, pet.sex)),
    f("age", t("csht.age"), ageOf(pet.dob, t, a.today)), f("weight", t("csht.weight"), lastW != null ? t("csht.kg", { n: formatNum(lastW) }) : ""),
    ...(pet.color ? [f("color", t("csht.color"), pet.color)] : []),
    ...(pet.microchip_id ? [f("chip", t("csht.microchip"), pet.microchip_id)] : []),
  ] });
  blocks.push({ key: "owner", kind: "grid", title: t("csht.owner"), cells: [
    f("name", t("csht.ownerName"), pet.owner_name ?? ""), f("phone", t("csht.phone"), pet.owner_phone ?? ""),
    f("area", t("csht.area"), [pet.owner_governorate, pet.owner_area].filter(Boolean).join(" — ")),
  ] });
  if (stay) {
    blocks.push({ key: "stay", kind: "grid", title: t("csht.stay"), cells: [
      f("kind", t("csht.kind"), t(`csht.kinds.${stay.kind}`)), f("in", t("csht.admitted"), stay.inAt ? dt(stay.inAt) : d(stay.inDay)),
      f("out", t("csht.discharged"), stay.outDay ? (stay.outAt ? dt(stay.outAt) : d(stay.outDay)) : t("csht.stillIn")),
      f("days", t("csht.days"), formatNum(stay.days)), f("cage", t("csht.cage"), stay.cage ?? ""),
      ...(stay.reason ? [f("reason", t("csht.reason"), stay.reason)] : []),
      ...(stay.outcome ? [f("outcome", t("csht.outcome"), t(`csht.outcomes.${stay.outcome}`))] : []),
    ] });
  }
  if (m.diagnoses.length) blocks.push({ key: "diag", kind: "text", title: t("csht.diagnoses"), text: m.diagnoses.join(" · ") });

  const tt = m.totals;
  if (tt.doses > 0 || stay) {
    blocks.push({ key: "stats", kind: "stats", items: [
      ...(tt.doses > 0 ? [{ key: "doses", value: t("csht.givenOf", { given: formatNum(tt.given), total: formatNum(tt.doses) }), label: t("csht.stDoses") }] : []),
      ...(tt.meds > 0 ? [{ key: "meds", value: formatNum(tt.meds), label: t("csht.stMeds") }] : []),
      ...(stay ? [{ key: "days", value: formatNum(stay.days), label: t("csht.stDays") }] : []),
      ...(tt.missed > 0 ? [{ key: "missed", value: formatNum(tt.missed), label: t("csht.stMissed") }] : []),
    ] });
  }
  if (a.showDays !== false && m.days.length) {
    blocks.push({ key: "days", kind: "table", title: t("csht.daysTitle"), head: [t("csht.day"), t("csht.dayWhat")],
      rows: m.days.map((x) => ({ key: x.day, cells: [d(x.day), dayText(x, t, lang, { names: a.showDrugs, ...a.parts })] })).filter((r) => r.cells[1]) });
  }
  if (m.meds.length) {
    if (a.showDrugs) {
      blocks.push({ key: "meds", kind: "table", title: t("csht.treatments"),
        head: [t("csht.med"), t("csht.route"), t("csht.dose"), t("csht.doses"), t("csht.period"), t("csht.status")],
        rows: m.meds.map((x) => ({ key: x.key, cells: [
          x.name, x.route ? t(`flow.route.${x.route}`, x.route) : "", x.amounts.join(" / "),
          t("csht.givenOf", { given: formatNum(x.given), total: formatNum(x.total) }),
          x.firstDay === x.lastDay ? d(x.firstDay) : `${d(x.firstDay)} — ${d(x.lastDay)}`,
          [x.missed ? t("csht.missedN", { n: formatNum(x.missed) }) : "", x.overdue ? t("csht.overdueN", { n: formatNum(x.overdue) }) : "",
            x.pending ? t("csht.pendingN", { n: formatNum(x.pending) }) : ""].filter(Boolean).join(" · ") || (x.total > 0 && x.given === x.total ? t("csht.courseDone") : ""),
        ], ...(x.total > 0 && x.given === x.total ? { tone: "ok" as const } : {}) })), statusCol: 5 });
      if (a.showDoseLog && m.doses.length) {
        blocks.push({ key: "doses", kind: "table", title: t("csht.doseLog"), statusCol: 4,
          head: [t("csht.day"), t("csht.time"), t("csht.med"), t("csht.dose"), t("csht.state"), t("csht.givenAt")],
          rows: m.doses.map((x) => ({ key: x.id, ...(TONE[x.state] ? { tone: TONE[x.state] } : {}), cells: [
            d(x.day), x.time, x.name, x.amount,
            // «ما انطت» تقولها الحالةُ نفسُها — علامةُ السجلّ السابق لا تُكرَّر بجانبها، وسببٌ غيرُها يُكتب.
            x.state === "missed" && x.missedReason && x.missedReason.trim() !== PAST_MISS_REASON ? `${t(`csht.states.${x.state}`)} (${x.missedReason})` : t(`csht.states.${x.state}`),
            x.at ? formatTime(x.at, lang) : "",
          ] })) });
      }
    } else {
      // أسماءُ الأدوية مخفيّة: العددُ كما سُجّل — أو بالتصريح «أخذ كلَّ جرعات العلاج اللازمة كاملةً».
      blocks.push({ key: "meds", kind: "text", title: t("csht.treatments"), text: complete
        ? t("csht.dosesAllGiven", { total: formatNum(tt.doses) })
        : t("csht.dosesHidden", { given: formatNum(tt.given), total: formatNum(tt.doses) }) });
    }
  }
  if (a.parts.vaccines) {
    if (m.vaccines.given.length) {
      blocks.push({ key: "vax", kind: "table", title: t("csht.vaccines"), head: [t("csht.vaccine"), t("csht.doseNo"), t("csht.date")],
        rows: m.vaccines.given.map((v) => ({ key: v.id, cells: [v.name, v.dose_number ? (v.doses_total ? `${v.dose_number}/${v.doses_total}` : String(v.dose_number)) : "", d(v.administered_at)] })) });
    }
    const next = [...m.vaccines.overdue, ...m.vaccines.due];
    if (next.length) {
      // عمودُ «متأخّر» حين يوجد متأخّرٌ وحده — عمودٌ فارغٌ بكلّ سطر يشوّش الورقة.
      const late = m.vaccines.overdue.length > 0;
      blocks.push({ key: "vaxNext", kind: "table", title: t("csht.nextVaccines"), head: [t("csht.vaccine"), t("csht.dueOn"), ...(late ? [t("csht.status")] : [])],
        rows: next.map((v) => ({ key: v.id, cells: [v.name, d(v.due_date), ...(late ? [m.vaccines.overdue.includes(v) ? t("csht.overdueTag") : ""] : [])] })) });
    }
  }
  if (a.parts.visits && (m.visits.length || m.soap.length)) {
    blocks.push({ key: "visits", kind: "table", title: t("csht.visits"), head: [t("csht.date"), t("csht.visitReason"), t("csht.visitResult")],
      rows: [
        ...m.visits.map((v) => ({ key: `c:${v.id}`, cells: [d(v.opened_at), v.reason ?? "", [v.outcome, v.summary].filter(Boolean).join(" — ")] })),
        ...m.soap.map((v) => ({ key: `s:${v.id}`, cells: [d(v.visit_date), v.subjective ?? "", v.assessment ?? ""] })),
      ] });
  }
  if (a.parts.notes && m.notes.length) {
    blocks.push({ key: "notes", kind: "list", title: t("csht.notes"), items: m.notes.map((n) => ({ key: n.id, text:
      [d(n.at), n.author ? `(${n.author})` : "", n.diagnoses.join(" · "), n.text.length > 400 ? `${n.text.slice(0, 400)}…` : n.text].filter(Boolean).join(" ") })) });
  }
  if (a.parts.labs && m.labs.length) {
    blocks.push({ key: "labs", kind: "list", title: t("csht.labs"), items: m.labs.map((l) => ({ key: l.id, text: `${d(l.taken_at)} — ${l.panel_label}` })) });
  }
  if (a.doctorNote.trim()) blocks.push({ key: "note", kind: "text", title: t("csht.doctorNoteTitle"), text: a.doctorNote.trim(), fixed: true });
  const tips = a.tips.map((x) => x.trim()).filter(Boolean);
  if (tips.length) blocks.push({ key: "tips", kind: "list", title: t("csht.tipsTitle"), items: tips.map((text, i) => ({ key: String(i), text })), fixed: true });

  // ورقةُ إقامةٍ تُسمّى بنوعها: فندقةٌ «تقرير الفندقة»، وفندقةٌ علاجية باسمها، والعلاجُ «تقرير الحالة والعلاج».
  const title = a.scope !== "stay" ? t("csht.titleAll")
    : stay?.kind === "boarding" ? t("csht.titleBoarding")
      : stay?.kind === "treatment_boarding" ? t("csht.titleCareBoarding") : t("csht.titleStay");
  return {
    v: 1, lang, dir: lang.startsWith("ar") ? "rtl" : "ltr", paper: a.paper, title, docTitle: `${title} — ${pet.name}`,
    clinic: a.clinic,
    meta: [f("printed", t("csht.printedAt"), formatDate(new Date().toISOString(), lang, true)), ...(pet.serial ? [f("file", t("csht.fileNo"), pet.serial)] : [])],
    blocks,
    signatures: [f("clinic", t("csht.sigClinic"), a.doctor ?? ""), f("owner", t("csht.sigOwner"), pet.owner_name ?? "")],
    footer: t("csht.footer"),
    ...(complete ? { claims: { complete: true } } : {}),
    autoPrint: a.autoPrint,
  };
}

/** مكانُ كلّ نصٍّ مقروءاً — «الحيوان › الاسم»، «سجلّ الجرعات › 20 نوفمبر 2026 › الحالة»، «عنوان الورقة» — لسجلّ ما عدّله
 *  الطبيب. الكلماتُ من الورقة نفسِها ومن csht لما لا كلمةَ له بها (العنوان، العيادة، التذييل). */
export function editLabels(s: CaseSheet, t: TFunction): Map<string, string> {
  const named: Partial<Record<Spot, string>> = { title: t("csht.edTitle"), clinic: t("csht.edClinic"), footer: t("csht.edFooter") };
  const out = new Map<string, string>();
  mapTexts(s, (k, x, spot, crumbs) => {
    const words = crumbs.map((c) => c.trim()).filter(Boolean);
    const label = named[spot] ?? (spot === "heading" ? t("csht.edHeading", { name: words[0] ?? "" }) : words.join(" › "));
    out.set(k, label || k);
    return x;
  });
  return out;
}

/** التعديلاتُ المطبَّقة بأسماء أماكنها (من نصّ النظام — الأسماءُ كما ولّدها النظام لا كما عُدّلت). */
export function labelEdits(applied: readonly SheetEdit[], generated: CaseSheet, t: TFunction): SheetEdit[] {
  const names = editLabels(generated, t);
  return applied.map((e) => ({ ...e, label: names.get(e.k) ?? e.k }));
}
