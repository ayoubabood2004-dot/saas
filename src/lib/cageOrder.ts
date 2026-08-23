import { getCageLayout } from "@/lib/settings";

/* ============================================================================
 * cageOrder — «اللوحة تمشي مع قدميك».
 *
 * الطبيب في الجولة يمشي غرفةً غرفة وقفصاً قفصاً. فلماذا تُرتَّب ورقة العلاج
 * حسب حدّة الحالة بينما جسده يتحرّك حسب المكان؟ هذه الوحدة تجعل ترتيب صفوف
 * الورقة **يطابق ترتيب أقفاص الغرفة كما رسمها بيده** في غرفة الأقفاص: يمشي
 * بالممر فتتقدّم الورقة معه بلا قفزٍ ولا بحث.
 *
 * والمصدر هو نفسه لا نسخةٌ ثانية: `clinic_prefs.cage_layout` — الجدول الذي
 * تكتبه غرفة الأقفاص وتقرأه خريطة 2D. فأي إعادة ترتيبٍ هناك تصل الورقة
 * تلقائياً، ولا يوجد ترتيبان يفترقان مع الوقت.
 * ==========================================================================*/

const norm = (c: string | null | undefined): string => (c ?? "").trim().toLowerCase();

/** فهرس: رمز القفص ← { الغرفة، موقعه ضمنها، موقع الغرفة }. يُبنى عند الطلب. */
function index(): Map<string, { room: string; roomIdx: number; cageIdx: number }> {
  const m = new Map<string, { room: string; roomIdx: number; cageIdx: number }>();
  const rooms = getCageLayout();
  rooms.forEach((r, roomIdx) => {
    r.cages.forEach((code, cageIdx) => {
      const k = norm(code);
      if (k && !m.has(k)) m.set(k, { room: r.name || "", roomIdx, cageIdx });
    });
  });
  return m;
}

/** اسم الغرفة التي يقع فيها القفص — أو null لقفصٍ غير مرسوم بالتخطيط. */
export function cageRoomOf(cage: string | null | undefined): string | null {
  const k = norm(cage);
  if (!k) return null;
  return index().get(k)?.room ?? null;
}

/**
 * مفتاح فرزٍ يعيد ترتيب المشي.
 *
 * الشكل `RRR:CCC` بأرقامٍ مبطّنة بالأصفار حتى يصحّ الفرز النصّي: الغرفة
 * الأولى ثم أقفاصها بترتيبها المرسوم، ثم الغرفة الثانية. وما ليس بالتخطيط
 * (زيارة بلا قفص) يذهب لآخر القائمة بمفتاحٍ عالٍ — لا يتقدّم على راقدٍ
 * تنتظره جرعة.
 */
export function cageSortKey(cage: string | null | undefined): string {
  const k = norm(cage);
  const hit = k ? index().get(k) : undefined;
  if (!hit) return "999:999";
  return `${String(hit.roomIdx).padStart(3, "0")}:${String(hit.cageIdx).padStart(3, "0")}`;
}

/** كل الغرف بترتيبها المرسوم — لبناء أشرطة الأقسام بالورقة. */
export function roomsInOrder(): string[] {
  return getCageLayout().map((r) => r.name || "").filter(Boolean);
}
