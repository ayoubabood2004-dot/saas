/* ============================================================================
 * neon.ts — لوحة ألوان «منشأة الليل» للعرض ثلاثي الأبعاد.
 *
 * نفس دلالات حالات opsStatus لكن بأسلوب نيون على ثيم داكن: السيان للفندقة
 * والمتاح، البرتقالي للعلاج، الماجنتا للفندقة العلاجية — حتى تبقى لغة اللون
 * واحدة بين الخريطة المسطّحة والمشهد المجسّم.
 * ==========================================================================*/

/** حالة القفص بالمشهد — «free» تُشتق محلياً، والبقية نفس OpStatus. */
export type CageStatus3D = "free" | "care" | "careBoarding" | "boarding";

export const NEON: Record<CageStatus3D, string> = {
  free: "#1f89ab",         // سيان هادئ — متاح (مرئي، بلا صخب المشغول)
  care: "#fb923c",         // برتقالي — علاج
  careBoarding: "#f43f5e", // ماجنتا — فندقة علاجية
  boarding: "#22d3ee",     // سيان ساطع — فندقة
};

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

export interface CageSpec {
  code: string;
  status: CageStatus3D;
}

/** عيّنة المرحلة الأولى: ٦ أقفاص بصفّين، بحالات مختلطة لاستعراض الإضاءة. */
export const SAMPLE_CAGES: CageSpec[] = [
  { code: "101", status: "boarding" },
  { code: "102", status: "care" },
  { code: "103", status: "free" },
  { code: "104", status: "careBoarding" },
  { code: "105", status: "free" },
  { code: "106", status: "boarding" },
];
