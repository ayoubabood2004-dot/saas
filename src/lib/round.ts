import i18n from "@/i18n";
import type { Pet, TreatmentEntry } from "@/types";
import { taskStatus, minutesLate } from "./treatmentSchedule";
import { toMin } from "./flowsheet";
import { cageSortKey } from "./cageOrder";
import {
  matchMonograph, doseFor, isBannedFor, allergyHit, FREQ_LABEL,
  type DoseAlert,
} from "./vetFormulary";

/* ============================================================================
 * round — «وضع الجولة»: بطاقةٌ واحدة بالشاشة، بترتيب المشي بين الأقفاص.
 *
 * ── لماذا وضعٌ مستقلٌّ عن الشبكة ──────────────────────────────────────────
 * ورقة العلاج **خريطة**: تريك اليوم كلّه دفعةً واحدة، وهذا ما يصلح للمراجعة.
 * لكن الطبيب بالجولة واقفٌ عند القفص وبيده حقنة، فيقرأ خانةً صغيرة بتقاطع
 * محورين — اسم الدواء أفقياً والساعة عمودياً. وذلك ليس بطئاً بقدر ما هو
 * **قلّة ثقة**: الخانات متجاورة، والجدول يقصّ اسم الدواء وجرعته.
 *
 * فالجولة **طريقٌ لا خريطة**: مهمّةٌ واحدة بملء الشاشة، باسمها وجرعتها
 * وطريقها كاملةً، وبزرٍّ واحدٍ كبير. والشبكة لا تُحذف — يُدخَل لهذا الوضع
 * ويُخرَج منه، وكل ما سُجِّل يظهر عليها.
 *
 * ── الترتيب: قدماك لا حدّة الحالة ────────────────────────────────────────
 * تُرتَّب المهام بترتيب **مشي الطبيب**: الغرفة ثم القفص كما رسمهما بيده في
 * غرفة الأقفاص (`cageSortKey`)، ثم الوقت داخل القفص الواحد. فيدخل الغرفة
 * مرّةً واحدة ويُنهي ما فيها. والترتيب بالحدّة كان سيجعله يقطع الممرّ ذهاباً
 * وإياباً بين قفصين.
 *
 * ── ماذا يدخل الجولة ─────────────────────────────────────────────────────
 * المتأخّر والمستحقّ **الآن** فقط. الجرعة التي موعدها بعد ثلاث ساعات ليست
 * جولةً بل تذكير، وإدخالها يغري بإعطاءٍ مبكّر — وهو خطأٌ دوائي لا اختصار.
 * ==========================================================================*/

export interface RoundStop {
  entry: TreatmentEntry;
  pet: Pet | undefined;
  cage: string | null;
  /** كم تأخّرت بالدقائق — صفرٌ للمستحقّ الآن. */
  lateMins: number;
}

/** ما قرّره الطبيب في محطّةٍ واحدة. `null` = لم يمرّ عليها بعد. */
export type RoundOutcome = "given" | "missed" | "skipped";

/**
 * يبني محطّات الجولة مرتّبةً بترتيب المشي.
 *
 * الوقت وسيطٌ لا يُقرأ، فالجولة تُختبر عند أي لحظةٍ من اليوم.
 */
export function buildRound(
  entries: TreatmentEntry[],
  petOf: (id: string) => Pet | undefined,
  cageOf: (id: string) => string | null,
  todayISO: string,
  nowHHMM: string,
): RoundStop[] {
  return entries
    .filter((e) => e.day === todayISO && !e.administered_at)
    .filter((e) => {
      const s = taskStatus(e, todayISO, nowHHMM);
      return s === "overdue" || s === "due";
    })
    .map((entry) => ({
      entry,
      pet: petOf(entry.pet_id),
      cage: cageOf(entry.pet_id),
      lateMins: minutesLate(entry, todayISO, nowHHMM),
    }))
    .sort((a, b) =>
      cageSortKey(a.cage).localeCompare(cageSortKey(b.cage)) ||
      (a.pet?.name ?? "").localeCompare(b.pet?.name ?? "", "ar") ||
      toMin(a.entry.time) - toMin(b.entry.time));
}

/** «متأخّرة ٣ ساعات» · «مستحقّة الآن» — الحالة بالحروف لا باللون وحده. */
export function lateText(mins: number): string {
  if (mins <= 0) return i18n.t("round.dueNow", "مستحقّة الآن");
  if (mins < 60) return i18n.t("round.lateMin", { n: mins, defaultValue: "متأخّرة {{n}} دقيقة" });
  const h = Math.floor(mins / 60);
  if (h < 24) return i18n.t("round.lateHour", { n: h, defaultValue: "متأخّرة {{n}} ساعة" });
  return i18n.t("round.lateDay", { n: Math.floor(h / 24), defaultValue: "متأخّرة {{n}} يوم" });
}

/**
 * تنبيهات السلامة لهذه المحطّة — **قبل الضغط لا بعده**.
 *
 * ── ما يُفحص وما لا يُفحص، وحدود ما نعرف ─────────────────────────────────
 * الدليل الدوائي (`vetFormulary`) يحمل محرّك أمانٍ كاملاً، لكن جزءاً منه
 * يحتاج **الجرعة بملغم/كغ** — وأمر الورقة يخزّن الكمية نصّاً حرّاً كتبه
 * الطبيب («٠٫٨٤ مل»). فاشتقاق ملغم/كغ منه تخمين، وإعلان «جرعة زائدة» بناءً
 * على تخمينٍ أسوأ من السكوت: تحذيرٌ يكذب مرّةً يُتجاهَل بعدها دائماً.
 *
 * فلا يُعلَن إلا ما يُعرَف يقيناً من **الدواء والنوع والملف** وحدها:
 *   • ممنوعٌ لهذا النوع — أعلى قواعد المحرّك قيمةً، ولا يحتاج جرعة.
 *   • حساسيةٌ مسجّلة بالملف — بالدواء نفسه أو بصنفه كلّه.
 * ويُعرَض معهما **السقف الموثَّق للنوع** خبراً لا حكماً: رقمٌ يقارنه الطبيب
 * بما بيده، بلا أن ندّعي أننا حسبناه له.
 */
export function alertsFor(entry: TreatmentEntry, pet: Pet | undefined): DoseAlert[] {
  const drug = matchMonograph(entry.medication || "");
  if (!drug || !pet) return [];
  const out: DoseAlert[] = [];

  const banned = isBannedFor(drug, pet.species);
  if (banned) {
    out.push({
      id: "banned", tone: "critical", blocking: true,
      title: i18n.t("round.aBanned", { d: drug.ar, defaultValue: "ممنوع منعاً باتاً لهذا النوع — {{d}}" }),
      detail: banned,
    });
    return out;                       // لا شيء بعد المنع يستحقّ القراءة
  }

  for (const a of pet.allergies ?? []) {
    const hit = allergyHit(drug, a);
    if (hit) {
      out.push({
        id: `allergy-${a}`, tone: "critical", blocking: true,
        title: i18n.t("round.aAllergy", { d: drug.ar, defaultValue: "حساسية مسجّلة — لا تعطِه {{d}}" }),
        detail: hit,
      });
      return out;
    }
  }

  const win = doseFor(drug, pet.species);
  if (win?.hardMax) {
    out.push({
      id: "ceiling", tone: "warn",
      title: i18n.t("round.aCeiling", { n: win.hardMax, defaultValue: "سقفٌ صارم لهذا النوع — {{n}} ملغم/كغ" }),
      detail: win.hardMaxReason,
    });
  } else if (win) {
    out.push({
      id: "window", tone: "info",
      title: i18n.t("round.aWindow", { min: win.min, max: win.max, f: FREQ_LABEL[win.freq], defaultValue: "المدى الموثَّق: {{min}}–{{max}} ملغم/كغ · {{f}}" }),
    });
  }
  return out;
}

/** حصيلة الجولة — تُعرض بآخرها. */
export const tally = (out: (RoundOutcome | null)[]) => ({
  given: out.filter((o) => o === "given").length,
  missed: out.filter((o) => o === "missed").length,
  skipped: out.filter((o) => o === "skipped").length,
});
