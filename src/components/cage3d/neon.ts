/* ============================================================================
 * neon.ts — لوحة ألوان «المنشأة الليلية الدافئة» + نموذج بيانات العرض المجسّم.
 *
 * نفس دلالات حالات opsStatus لكن بأسلوب نيون: السيان للفندقة والمتاح،
 * البرتقالي للعلاج، الماجنتا للفندقة العلاجية — لغة اللون واحدة بين الخريطة
 * المسطّحة والمشهد المجسّم.
 *
 * حالة القفص ليست خاصية مستقلة: القفص «يرث» حالة الراقد داخله، وبلا راقد
 * فهو متاح — نفس منطق الخريطة المسطّحة، فنقل الحيوان ينقل حالته ولونه معه.
 * ==========================================================================*/
import type { Species } from "@/types";

/** حالة القفص بالمشهد — «free» تُشتق من غياب الراقد، والبقية نفس OpStatus. */
export type CageStatus3D = "free" | "care" | "careBoarding" | "boarding";

export const NEON: Record<CageStatus3D, string> = {
  free: "#1f89ab",         // سيان هادئ — متاح (مرئي، بلا صخب المشغول)
  care: "#fb923c",         // برتقالي — علاج
  careBoarding: "#f43f5e", // ماجنتا — فندقة علاجية
  boarding: "#22d3ee",     // سيان ساطع — فندقة
};

/** أحمر «غير مسموح» — الإفلات فوق قفص مشغول. */
export const DANGER = "#ef4444";
/** أبيض-سيان «ساخن» — هدف الإفلات الصالح تحت المؤشر. */
export const HOT = "#d9fbff";

export const NIGHT = {
  bg: "#0a0910",        // خلفية المشهد — ليل دافئ
  wall: "#241b13",      // جدران خشبية داكنة
  wallEdge: "#22d3ee",  // شريط النيون على حافة الجدران
  shell: "#2b3444",     // معدن الإطار المصقول
  plinth: "#1a2230",    // القاعدة
  plate: "#232f3f",     // لوحة الرقم المعدنية
  plateInk: "#a8bccf",  // الرقم «المحفور»
  cushion: "#c9b394",   // فرشة الرقود
  cushionSeam: "#b39d7d",
  bars: "#b8c9de",      // قضبان الستيل
  ink: "#eaf6ff",       // النصوص الفاتحة
  glassPanel: "#0e1a2ecc", // زجاج لوحات الواجهة (DOM)
};

/** خط الأرقام — ملف محلي (Orbitron, رخصة OFL) حتى ما نعتمد على الشبكة أبداً. */
export const DIGIT_FONT = "/fonts/Orbitron-Bold.ttf";

/** الراقد: مريض بحالة تشغيلية — الحالة والصورة والأيام تسافر معه عند النقل. */
export interface Occupant {
  name: string;
  species: Species;
  emoji: string; // احتياط لما تفشل صورة النوع (بلا شبكة)
  status: Exclude<CageStatus3D, "free">;
  days: number;  // «اليوم N» من الرقود
}

export interface CageSpec {
  code: string;
  occupant?: Occupant | null;
}

export const statusOfCage = (c: CageSpec): CageStatus3D => c.occupant?.status ?? "free";

export const KIND_AR: Record<Exclude<CageStatus3D, "free">, string> = {
  care: "علاج", careBoarding: "فندقة علاجية", boarding: "فندقة",
};

export const SPECIES_AR: Partial<Record<Species, string>> = {
  cat: "قطة", dog: "كلب", bird: "طائر", rabbit: "أرنب",
};

/** عيّنة العرض: أربعة مرضى وقفصان متاحان لاستعراض السحب واللوحات. */
export const SAMPLE_CAGES: CageSpec[] = [
  { code: "101", occupant: { name: "بيلا", species: "cat", emoji: "🐱", status: "boarding", days: 3 } },
  { code: "102", occupant: { name: "لولو", species: "bird", emoji: "🦜", status: "care", days: 1 } },
  { code: "103", occupant: null },
  { code: "104", occupant: { name: "مشمش", species: "rabbit", emoji: "🐰", status: "careBoarding", days: 2 } },
  { code: "105", occupant: null },
  { code: "106", occupant: { name: "روكي", species: "dog", emoji: "🐶", status: "boarding", days: 5 } },
];
