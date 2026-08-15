/* ============================================================================
 * neon.ts — لوحة ألوان «منشأة الليل» + نموذج بيانات العرض المجسّم.
 *
 * نفس دلالات حالات opsStatus لكن بأسلوب نيون على ثيم داكن: السيان للفندقة
 * والمتاح، البرتقالي للعلاج، الماجنتا للفندقة العلاجية — حتى تبقى لغة اللون
 * واحدة بين الخريطة المسطّحة والمشهد المجسّم.
 *
 * حالة القفص ليست خاصية مستقلة: القفص «يرث» حالة الراقد داخله، وبلا راقد
 * فهو متاح — نفس منطق الخريطة المسطّحة، وهو ما يجعل السحب صادقاً: نقل
 * الحيوان ينقل حالته ولونه معه تلقائياً.
 * ==========================================================================*/

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
  bg: "#05070f",       // خلفية المشهد (أغمق من surface حتى يبرز النيون)
  floor: "#0a1120",    // بلاطة الأرضية
  gridCell: "#0e2233", // خطوط الشبكة الدقيقة
  gridSection: "#164e63",
  shell: "#131c30",    // هيكل القفص المعدني
  cavity: "#0a1626",   // جوف القفص
  bars: "#b8c9de",     // قضبان الستيل
  ink: "#eaf6ff",      // الأرقام
};

/** خط الأرقام — ملف محلي (Orbitron, رخصة OFL) حتى ما نعتمد على الشبكة أبداً. */
export const DIGIT_FONT = "/fonts/Orbitron-Bold.ttf";

/** الراقد: مريض بحالة تشغيلية — الحالة تسافر معه عند النقل. */
export interface Occupant {
  name: string;
  emoji: string;
  status: Exclude<CageStatus3D, "free">;
}

export interface CageSpec {
  code: string;
  occupant?: Occupant | null;
}

export const statusOfCage = (c: CageSpec): CageStatus3D => c.occupant?.status ?? "free";

export const KIND_AR: Record<Exclude<CageStatus3D, "free">, string> = {
  care: "علاج", careBoarding: "فندقة علاجية", boarding: "فندقة",
};

/** عيّنة المرحلتين ٢+٣: أربعة مرضى وقفصان متاحان لاستعراض السحب. */
export const SAMPLE_CAGES: CageSpec[] = [
  { code: "101", occupant: { name: "بيلا", emoji: "🐱", status: "boarding" } },
  { code: "102", occupant: { name: "لولو", emoji: "🦜", status: "care" } },
  { code: "103", occupant: null },
  { code: "104", occupant: { name: "مشمش", emoji: "🐰", status: "careBoarding" } },
  { code: "105", occupant: null },
  { code: "106", occupant: { name: "روكي", emoji: "🐶", status: "boarding" } },
];
