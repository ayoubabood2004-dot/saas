// ============================================================================
// تركيبُ ورقة الحالة من نموذج الملخّص — صِرفٌ (يفحصه case-summary-test بـ`t` مزيَّف): كلُّ كلمةٍ من نطاق csht،
// والمطفأُ بخيارات النافذة لا يُرسم (أسماءُ الأدوية، سجلُّ الجرعات، اللقاحات، الزيارات، الملاحظات، المختبر).
// ============================================================================
import type { TFunction } from "i18next";
import { formatDate, formatNum, formatTime } from "./utils";
import { PAST_MISS_REASON } from "./backdate";
import type { CaseModel } from "./caseSummary";
import type { CaseSheet, Paper, SheetBlock } from "./caseSheetPrint";
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

/** الورقةُ من النموذج — كلُّ كلمةٍ من نطاق csht، والمحذوفُ بالخيارات لا يُرسم. */
export function composeSheet(a: {
  t: TFunction; lang: string; pet: Pet; model: CaseModel; scope: "stay" | "all"; paper: Paper;
  showDrugs: boolean; showDoseLog: boolean; parts: { vaccines: boolean; visits: boolean; notes: boolean; labs: boolean };
  tips: string[]; doctorNote: string; clinic: CaseSheet["clinic"]; doctor: string | null; today: string; autoPrint: boolean;
}): CaseSheet {
  const { t, lang, pet, model: m } = a;
  const d = (iso: string | null | undefined) => (iso ? formatDate(iso, lang, true) : "");
  const dt = (iso: string | null | undefined) => (iso ? `${formatDate(iso, lang, true)} ${formatTime(iso, lang)}` : "");
  const stay = a.scope === "stay" ? m.stays[0] ?? null : m.current;
  const lastW = m.weight.last?.weight_kg ?? pet.current_weight_kg ?? null;
  const blocks: SheetBlock[] = [];

  blocks.push({ kind: "grid", title: t("csht.pet"), cells: [
    [t("csht.petName"), pet.name], [t("csht.species"), t(`pet.species.${pet.species}`, pet.species)],
    [t("csht.breed"), pet.breed ?? ""], [t("csht.sex"), t(`pet.sex.${pet.sex}`, pet.sex)],
    [t("csht.age"), ageOf(pet.dob, t, a.today)], [t("csht.weight"), lastW != null ? t("csht.kg", { n: formatNum(lastW) }) : ""],
    ...(pet.color ? [[t("csht.color"), pet.color] as [string, string]] : []),
    ...(pet.microchip_id ? [[t("csht.microchip"), pet.microchip_id] as [string, string]] : []),
  ] });
  blocks.push({ kind: "grid", title: t("csht.owner"), cells: [
    [t("csht.ownerName"), pet.owner_name ?? ""], [t("csht.phone"), pet.owner_phone ?? ""],
    [t("csht.area"), [pet.owner_governorate, pet.owner_area].filter(Boolean).join(" — ")],
  ] });
  if (stay) {
    blocks.push({ kind: "grid", title: t("csht.stay"), cells: [
      [t("csht.kind"), t(`csht.kinds.${stay.kind}`)], [t("csht.admitted"), stay.inAt ? dt(stay.inAt) : d(stay.inDay)],
      [t("csht.discharged"), stay.outDay ? (stay.outAt ? dt(stay.outAt) : d(stay.outDay)) : t("csht.stillIn")],
      [t("csht.days"), formatNum(stay.days)], [t("csht.cage"), stay.cage ?? ""],
      ...(stay.reason ? [[t("csht.reason"), stay.reason] as [string, string]] : []),
      ...(stay.outcome ? [[t("csht.outcome"), t(`csht.outcomes.${stay.outcome}`)] as [string, string]] : []),
    ] });
  }
  if (m.diagnoses.length) blocks.push({ kind: "text", title: t("csht.diagnoses"), text: m.diagnoses.join(" · ") });

  const tt = m.totals;
  if (tt.doses > 0 || stay) {
    blocks.push({ kind: "stats", items: [
      ...(tt.doses > 0 ? [[t("csht.givenOf", { given: formatNum(tt.given), total: formatNum(tt.doses) }), t("csht.stDoses")] as [string, string]] : []),
      ...(tt.meds > 0 ? [[formatNum(tt.meds), t("csht.stMeds")] as [string, string]] : []),
      ...(stay ? [[formatNum(stay.days), t("csht.stDays")] as [string, string]] : []),
      ...(tt.missed > 0 ? [[formatNum(tt.missed), t("csht.stMissed")] as [string, string]] : []),
    ] });
  }
  if (m.meds.length) {
    if (a.showDrugs) {
      blocks.push({ kind: "table", title: t("csht.treatments"),
        head: [t("csht.med"), t("csht.route"), t("csht.dose"), t("csht.doses"), t("csht.period"), t("csht.status")],
        rows: m.meds.map((x) => [
          x.name, x.route ? t(`flow.route.${x.route}`, x.route) : "", x.amounts.join(" / "),
          t("csht.givenOf", { given: formatNum(x.given), total: formatNum(x.total) }),
          x.firstDay === x.lastDay ? d(x.firstDay) : `${d(x.firstDay)} — ${d(x.lastDay)}`,
          [x.missed ? t("csht.missedN", { n: formatNum(x.missed) }) : "", x.overdue ? t("csht.overdueN", { n: formatNum(x.overdue) }) : "",
            x.pending ? t("csht.pendingN", { n: formatNum(x.pending) }) : ""].filter(Boolean).join(" · "),
        ]) });
      if (a.showDoseLog && m.doses.length) {
        blocks.push({ kind: "table", title: t("csht.doseLog"),
          head: [t("csht.day"), t("csht.time"), t("csht.med"), t("csht.dose"), t("csht.state"), t("csht.givenAt")],
          rows: m.doses.map((x) => [
            d(x.day), x.time, x.name, x.amount,
            // «ما انطت» تقولها الحالةُ نفسُها — علامةُ السجلّ السابق لا تُكرَّر بجانبها، وسببٌ غيرُها يُكتب.
            x.state === "missed" && x.missedReason && x.missedReason.trim() !== PAST_MISS_REASON ? `${t(`csht.states.${x.state}`)} (${x.missedReason})` : t(`csht.states.${x.state}`),
            x.at ? formatTime(x.at, lang) : "",
          ]) });
      }
    } else {
      blocks.push({ kind: "text", title: t("csht.treatments"), text: t("csht.dosesHidden", { given: formatNum(tt.given), total: formatNum(tt.doses) }) });
    }
  }
  if (a.parts.vaccines) {
    if (m.vaccines.given.length) {
      blocks.push({ kind: "table", title: t("csht.vaccines"), head: [t("csht.vaccine"), t("csht.doseNo"), t("csht.date")],
        rows: m.vaccines.given.map((v) => [v.name, v.dose_number ? (v.doses_total ? `${v.dose_number}/${v.doses_total}` : String(v.dose_number)) : "", d(v.administered_at)]) });
    }
    const next = [...m.vaccines.overdue, ...m.vaccines.due];
    if (next.length) {
      // عمودُ «متأخّر» حين يوجد متأخّرٌ وحده — عمودٌ فارغٌ بكلّ سطر يشوّش الورقة.
      const late = m.vaccines.overdue.length > 0;
      blocks.push({ kind: "table", title: t("csht.nextVaccines"), head: [t("csht.vaccine"), t("csht.dueOn"), ...(late ? [t("csht.status")] : [])],
        rows: next.map((v) => [v.name, d(v.due_date), ...(late ? [m.vaccines.overdue.includes(v) ? t("csht.overdueTag") : ""] : [])]) });
    }
  }
  if (a.parts.visits && (m.visits.length || m.soap.length)) {
    blocks.push({ kind: "table", title: t("csht.visits"), head: [t("csht.date"), t("csht.visitReason"), t("csht.visitResult")],
      rows: [
        ...m.visits.map((v) => [d(v.opened_at), v.reason ?? "", [v.outcome, v.summary].filter(Boolean).join(" — ")]),
        ...m.soap.map((v) => [d(v.visit_date), v.subjective ?? "", v.assessment ?? ""]),
      ] });
  }
  if (a.parts.notes && m.notes.length) {
    blocks.push({ kind: "list", title: t("csht.notes"), items: m.notes.map((n) =>
      [d(n.at), n.author ? `(${n.author})` : "", n.diagnoses.join(" · "), n.text.length > 400 ? `${n.text.slice(0, 400)}…` : n.text].filter(Boolean).join(" ")) });
  }
  if (a.parts.labs && m.labs.length) {
    blocks.push({ kind: "list", title: t("csht.labs"), items: m.labs.map((l) => `${d(l.taken_at)} — ${l.panel_label}`) });
  }
  if (a.doctorNote.trim()) blocks.push({ kind: "text", title: t("csht.doctorNoteTitle"), text: a.doctorNote.trim() });
  const tips = a.tips.map((x) => x.trim()).filter(Boolean);
  if (tips.length) blocks.push({ kind: "list", title: t("csht.tipsTitle"), items: tips });

  const title = a.scope === "stay" ? t("csht.titleStay") : t("csht.titleAll");
  return {
    lang, dir: lang.startsWith("ar") ? "rtl" : "ltr", paper: a.paper, title, docTitle: `${title} — ${pet.name}`,
    clinic: a.clinic,
    meta: [[t("csht.printedAt"), formatDate(new Date().toISOString(), lang, true)], ...(pet.serial ? [[t("csht.fileNo"), pet.serial] as [string, string]] : [])],
    blocks,
    signatures: [{ label: t("csht.sigClinic"), value: a.doctor ?? "" }, { label: t("csht.sigOwner"), value: pet.owner_name ?? "" }],
    footer: t("csht.footer"),
    autoPrint: a.autoPrint,
  };
}
