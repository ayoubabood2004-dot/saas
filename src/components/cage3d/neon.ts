/* ============================================================================
 * neon.ts — لوحة ألوان «المنشأة الليلية الدافئة» + نموذج بيانات العرض المجسّم.
 *
 * لغة اللون هنا لونان اثنان: أحمر «فاضٍ» وأزرق «ممتلئ». القرار الذي يُتَّخذ
 * من آخر الممر واحد، فاللون يخدمه وحده — وتفاصيل الإقامة تُقرأ من البطاقة.
 *
 * حالة القفص ليست خاصية مستقلة: القفص «يرث» حالة الراقد داخله، وبلا راقد
 * فهو متاح — نفس منطق الخريطة المسطّحة، فنقل الحيوان ينقل حالته ولونه معه.
 * ==========================================================================*/
import type { Species } from "@/types";

/** حالة القفص بالمشهد — «free» تُشتق من غياب الراقد، والبقية نفس OpStatus. */
export type CageStatus3D = "free" | "care" | "careBoarding" | "boarding";

/* لونان لا أكثر — القرار الذي يتخذه الطبيب من آخر الممر واحد: «وين فاضي؟».
 * أحمر = فاضٍ، أزرق = ممتلئ. نوع الإقامة (علاج/فندقة) يبقى نصاً بالبطاقة، لا
 * لوناً ثالثاً: أربعة ألوان كانت تجعل المشهد لوحةً تُقرأ بجهد بدل خريطة تُلمح.
 * الأبيض حالة تفاعلٍ عابرة (هدف الإفلات)، والكهرماني نبضة تنبيه لا هوية. */
export const FREE = "#ef4444";      // أحمر — فاضٍ
export const OCCUPIED = "#3b82f6";  // أزرق — ممتلئ

export const NEON: Record<CageStatus3D, string> = {
  free: FREE,
  care: OCCUPIED,
  careBoarding: OCCUPIED,
  boarding: OCCUPIED,
};

/** «غير مسموح» — الإفلات فوق قفص مشغول. رماديٌّ مطفأ لا أحمر: الأحمر صار
 *  هوية «فاضٍ»، ولونٌ واحد بمعنيين هو أسوأ من لا لون. */
export const DANGER = "#64748b";
/** أبيض-سيان «ساخن» — هدف الإفلات الصالح تحت المؤشر. */
export const HOT = "#d9fbff";

export const NIGHT = {
  bg: "#0a0910",        // خلفية المشهد — ليل دافئ
  wall: "#241b13",      // جدران خشبية داكنة
  wallEdge: "#33506b",  // شريط حافة الجدران — رمادي أزرق محايد لا يزاحم الحالة
  shell: "#2b3444",     // معدن الإطار المصقول
  plinth: "#1a2230",    // القاعدة
  plate: "#ccdaea",     // وجه لافتة الباب — معدنٌ فاتح كلافتات العيادات
  plateInk: "#0d1822",  // الرقم المحفور — حبرٌ داكن على وجهٍ فاتح: أعلى تباينٍ ممكن
                        // بغرفةٍ ليلية، وهي طريقة اللافتات الحقيقية نفسها
  cushion: "#c9b394",   // فرشة الرقود
  cushionSeam: "#b39d7d",
  bars: "#b8c9de",      // قضبان الستيل
  ink: "#eaf6ff",       // النصوص الفاتحة
  glassPanel: "#0e1a2ecc", // زجاج لوحات الواجهة (DOM)
};

/** خط الأرقام — ملف محلي (Orbitron, رخصة OFL) حتى ما نعتمد على الشبكة أبداً. */
export const DIGIT_FONT = "/fonts/Orbitron-Bold.ttf";

/** الراقد كما يراه المشهد — مشتق من رقود حقيقي نشط بـopsStore (نفس مصدر
 *  التقويم الرئيسي): النقل يعدّل admission.cage فيتسجّل برحلة الحيوان. */
export interface Occupant {
  admId: string;
  petId: string;
  name: string;
  speciesAr: string;
  photoUrl: string | null; // صورة المريض المرفوعة أو صورة نوعه
  emoji: string;           // احتياط أخير بلا شبكة
  status: Exclude<CageStatus3D, "free">;
  days: number;
  /** موعد جرعته حان (علاجيّات فقط): القفص يومض كهرماني حتى تُعطى. */
  doseDue?: boolean;
}

/** كهرماني «جرعة مستحقّة» — وميض القفص الذي حان موعد علاج ساكنه. */
export const DOSE = "#f59e0b";

/** مقياس لوحات DOM داخل المشهد (drei Html distanceFactor): تكبير الكاميرا
 *  يكبّر اللوحات ويصغّرها مع المشهد نفسه — فلا تتكدّس الأسماء فوق بعضها
 *  عند الإبعاد. scale = zoom × DF ⇒ حجم طبيعي عند zoom ≈ 46. */
export const DF = 1 / 46;

export interface CageSpec {
  code: string;
  occupant?: Occupant | null;
}

export const statusOfCage = (c: CageSpec): CageStatus3D => c.occupant?.status ?? "free";

export const KIND_AR: Record<Exclude<CageStatus3D, "free">, string> = {
  care: "علاج", careBoarding: "فندقة علاجية", boarding: "فندقة",
};

export const SPECIES_AR: Partial<Record<Species, string>> = {
  cat: "قطة", dog: "كلب", bird: "طائر", rabbit: "أرنب", horse: "حصان", cow: "بقرة", other: "حيوان",
};

export const SPECIES_EMOJI: Partial<Record<Species, string>> = {
  cat: "🐱", dog: "🐶", bird: "🦜", rabbit: "🐰", horse: "🐴", cow: "🐮",
};
