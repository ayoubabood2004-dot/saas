/* ============================================================================
 * cageLayout — **حقيقةٌ واحدةٌ لغرف الأقفاص**، تُقرأ وتُكتب من هنا وحدَه.
 *
 * ── ما حصل، مقيساً لا مخمَّناً ──────────────────────────────────────────
 * عيادةٌ ترتّب غرفَها وأقفاصَها على حاسبة، وتفتح النظامَ على حاسبةٍ ثانية
 * فتجد «كلَّ الأقفاص بغرفةٍ وحدة وبترتيبٍ عشوائيّ». والأسوأ أنّ الحاسبةَ
 * الثانية **تكتب** ذلك فوق ترتيب الأولى.
 *
 * السبب أنّ التخطيط كان يعيش بمكانين غيرِ متكافئين:
 *   • الهندسةُ كلُّها (مواضعُ الغرف وأبعادُها وأبوابُها، وخليّةُ كلِّ قفصٍ
 *     ولونُه واتجاهُه وطابقُه) بـ`localStorage` تحت مفتاحٍ **بلا اسم عيادة**
 *     — فلا تصل جهازاً ثانياً أبداً، وتختلط بين عيادتين على جهازٍ واحد.
 *   • والسحابةُ لا تحمل إلا قائمةً مسطّحة: أسماءَ الغرف ورموزَ أقفاصها.
 * فجهازٌ جديدٌ لا يجد محلّياً شيئاً ⇒ يبذر ستّةَ أقفاصٍ وهمية (١٠١–١٠٦ بغرفة
 * «غرفة الإقامة») ⇒ ثم «يتبنّى» رموزَ العيادة الحقيقية فيكدّسها بغرفةٍ
 * اسمُها «غير مصنّفة» ⇒ ثم **يرفع ذلك للسحابة** فيمحو ترتيبَ الأولى.
 *
 * البصمةُ بالقاعدة تقول القصّةَ نفسَها: سبعُ عياداتٍ لها تخطيط، أربعٌ منها
 * فيها غرفةُ «غير مصنّفة» — وواحدةٌ فيها **ثلاث** غرفٍ بهذا الاسم، أي ثلاثةُ
 * أجهزةٍ فعلت هذا ثلاثَ مرّات. وكلُّها تبدأ بـ«غرفة الإقامة» ١٠١–١٠٦: بذرةُ
 * الشِفرة نفسُها، هبطت بعياداتٍ حقيقية.
 *
 * ── ما تفعله هذه الوحدة ────────────────────────────────────────────────
 * تجعل **السحابةَ هي التخطيطَ كلَّه**: شكلٌ واحدٌ يحمل الهندسةَ ورموزَ
 * الأقفاص معاً، فما يُرسم على حاسبةٍ هو حرفياً ما يُقرأ على الأخرى.
 *
 *   v1 (القديم): [{ id, name, cages: string[] }]           ← يُقرأ ويُرقّى
 *   v2 (الجديد): { v:2, rev, rooms:[Room], cages:[Cage] }  ← يُقرأ ويُكتب
 *
 * **والترقيةُ لا تحرّك قفصاً واحداً**: تُشتقّ الهندسةُ من ترتيب المصفوفة
 * القديمة (الغرفُ يساراً فيميناً، والأقفاصُ صفّاً صفّاً) بحيث يُرجع فرزُ
 * اللوحة `(z, x, level)` **نفسَ الترتيب الذي كان**. تخطيطٌ قديمٌ يُفتح فيبدو
 * كما تركته العيادة، لا كما يسهل على الشِفرة.
 *
 * ── والمنظرُ المسطّحُ مشتقٌّ لا مخزَّن ──────────────────────────────────
 * ورقةُ الجولة (`cageOrder.ts`) كانت تفرز بترتيب **مصفوفة السحابة**، واللوحةُ
 * تفرز بـ`x` الهندسيّ — فترتيبان يفترقان كلّما أُنشئت غرفةٌ خارج الترتيب.
 * `flatRooms()` هنا تشتقّ المسطّحَ من الهندسة بنفس قاعدة اللوحة، فما يمشيه
 * الطبيبُ على الورقة هو ما يراه على الشاشة.
 * ==========================================================================*/

export type DoorSide = "front" | "back" | "left" | "right";

export interface LayoutRoom {
  id: string;
  name: string;
  x: number; z: number;
  w: number; d: number;
  door?: { side: DoorSide; at: number };
}

export interface LayoutCage {
  code: string;
  x: number; z: number;
  color?: string;
  facing?: 0 | 1 | 2 | 3;
  level?: 0 | 1;
}

export interface CageLayout {
  rooms: LayoutRoom[];
  cages: LayoutCage[];
  /** نسخةُ السحابة التي بُني عليها هذا التخطيط — ٠ يعني «ما قُرئ من سحابة». */
  rev: number;
  /** الشكلُ الذي وصل: 1 = قديمٌ مسطّحٌ رُقّي، 2 = كامل. */
  from: 1 | 2 | 0;
}

/** المنظرُ المسطّح الذي تقرأه ورقةُ الجولة وخريطةُ 2D. */
export interface CageRoom { id: string; name: string; cages: string[] }

export const EMPTY_LAYOUT: CageLayout = { rooms: [], cages: [], rev: 0, from: 0 };

const num = (v: unknown, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};
const int = (v: unknown, dflt: number): number => Math.round(num(v, dflt));
const str = (v: unknown): string => String(v ?? "").trim();

/** عرضُ الغرفة المشتقّ عند الترقية: صفٌّ من ستّةٍ كحدٍّ أقصى — ومنه تُحسب
 *  خليّةُ كلّ قفصٍ بحيث يُعيد فرزُ اللوحة ترتيبَ المصفوفة القديمة بالضبط. */
const UPGRADE_W = 6;

export function upgradeWidth(n: number): number {
  return Math.max(1, Math.min(UPGRADE_W, n));
}

/* ------------------------------- القراءة -------------------------------- */

function parseRoom(r: Record<string, unknown>): LayoutRoom | null {
  const id = str(r.id), name = str(r.name);
  if (!id || !name) return null;
  const room: LayoutRoom = {
    id, name,
    x: int(r.x, 0), z: int(r.z, 0),
    w: Math.max(1, int(r.w, 1)), d: Math.max(1, int(r.d, 1)),
  };
  const door = r.door as Record<string, unknown> | undefined;
  const side = str(door?.side);
  if (side === "front" || side === "back" || side === "left" || side === "right") {
    room.door = { side, at: Math.max(0, int(door?.at, 0)) };
  }
  return room;
}

function parseCage(c: Record<string, unknown>): LayoutCage | null {
  const code = str(c.code);
  if (!code) return null;
  const cage: LayoutCage = { code, x: int(c.x, 0), z: int(c.z, 0) };
  const color = str(c.color);
  if (color) cage.color = color;
  const facing = int(c.facing, 0);
  if (facing === 1 || facing === 2 || facing === 3) cage.facing = facing;
  if (int(c.level, 0) === 1) cage.level = 1;
  return cage;
}

/** ترقيةُ الشكل القديم: الغرفُ يساراً فيميناً بفجوةِ خليّةٍ، وأقفاصُ كلِّ
 *  غرفةٍ صفّاً صفّاً بترتيب مصفوفتها — فلا يتحرّك قفصٌ عن موضعه بالقائمة. */
export function upgradeV1(rooms: CageRoom[]): { rooms: LayoutRoom[]; cages: LayoutCage[] } {
  const out: LayoutRoom[] = [];
  const cages: LayoutCage[] = [];
  const seen = new Set<string>();
  let x = 0;
  for (const r of rooms) {
    const codes = r.cages.filter((c) => {
      const k = c.trim().toLowerCase();
      if (!k || seen.has(k)) return false;   // رمزٌ مكرّرٌ بين غرفتين يبقى بأولاهما
      seen.add(k);
      return true;
    });
    const w = upgradeWidth(codes.length || 1);
    const d = Math.max(1, Math.ceil((codes.length || 1) / w));
    out.push({ id: r.id, name: r.name, x, z: 0, w, d });
    codes.forEach((code, i) => {
      cages.push({ code: code.trim(), x: x + (i % w), z: Math.floor(i / w) });
    });
    x += w + 1;                              // فجوةُ خليّةٍ بين غرفةٍ وأختها
  }
  return { rooms: out, cages };
}

/**
 * يقرأ عمودَ `clinic_prefs.cage_layout` بأيّ شكلٍ وصل.
 *
 * وكلُّ فشلٍ يُرجع تخطيطاً **فارغاً** لا بذرةً: شاشةٌ فارغةٌ تقول «ما مرسوم
 * شيء» يصلّحها المستخدم بضغطة؛ أمّا بذرةٌ وهميّةٌ فتُصدَّق وتُكتب فوق الحقيقة
 * — وهذا هو العطبُ الذي جئنا نصلحه.
 */
export function parseLayout(raw: string | null | undefined, rev = 0): CageLayout {
  if (!raw) return { ...EMPTY_LAYOUT, rev };
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return { ...EMPTY_LAYOUT, rev }; }

  if (Array.isArray(j)) {
    const v1 = j
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => ({
        id: str(r.id), name: str(r.name),
        cages: Array.isArray(r.cages) ? r.cages.map((c) => str(c)).filter(Boolean) : [],
      }))
      .filter((r) => r.id && r.name);
    if (!v1.length) return { ...EMPTY_LAYOUT, rev };
    const { rooms, cages } = upgradeV1(v1);
    return { rooms, cages, rev, from: 1 };
  }

  if (j && typeof j === "object") {
    const o = j as Record<string, unknown>;
    const rooms = (Array.isArray(o.rooms) ? o.rooms : [])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map(parseRoom).filter((r): r is LayoutRoom => !!r);
    const seen = new Set<string>();
    const cages = (Array.isArray(o.cages) ? o.cages : [])
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map(parseCage).filter((c): c is LayoutCage => !!c)
      .filter((c) => {
        const k = c.code.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    if (!rooms.length && !cages.length) return { ...EMPTY_LAYOUT, rev };
    return { rooms, cages, rev: int(o.rev, rev), from: 2 };
  }
  return { ...EMPTY_LAYOUT, rev };
}

/* ------------------------------- الكتابة -------------------------------- */

/** نصُّ JSON الذي يُكتب بالعمود. مفاتيحُ ثابتةُ الترتيب حتى تصحّ المقارنةُ
 *  النصّية بين ما على الشاشة وما بالسحابة («زرّ تحقّق»). */
export function serializeLayout(l: Pick<CageLayout, "rooms" | "cages">): string {
  return JSON.stringify({
    v: 2,
    rooms: l.rooms.map((r) => ({
      id: r.id, name: r.name, x: r.x, z: r.z, w: r.w, d: r.d,
      ...(r.door ? { door: { side: r.door.side, at: r.door.at } } : {}),
    })),
    cages: l.cages.map((c) => ({
      code: c.code, x: c.x, z: c.z,
      ...(c.color ? { color: c.color } : {}),
      ...(c.facing ? { facing: c.facing } : {}),
      ...(c.level ? { level: c.level } : {}),
    })),
  });
}

/** توقيعُ تخطيطٍ للمقارنة — مستقلٌّ عن `rev` ووقتِ الحفظ. */
export const layoutFingerprint = (l: Pick<CageLayout, "rooms" | "cages">): string => serializeLayout(l);

/* ------------------------- المنظرُ المسطّح المشتقّ ------------------------- */

/** قاعدةُ ترتيب اللوحة: صفّاً صفّاً، ثم يساراً فيميناً، والأرضيُّ قبل العلويّ. */
export const cageOrderCmp = (a: LayoutCage, b: LayoutCage): number =>
  (a.z - b.z) || (a.x - b.x) || ((a.level ?? 0) - (b.level ?? 0));

export const roomsInLayoutOrder = (rooms: LayoutRoom[]): LayoutRoom[] =>
  [...rooms].sort((a, b) => (a.x - b.x) || (a.z - b.z));

export const cagesOfRoom = (l: Pick<CageLayout, "cages">, r: LayoutRoom): LayoutCage[] =>
  l.cages
    .filter((c) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d)
    .sort(cageOrderCmp);

/** المنظرُ المسطّح — **مشتقٌّ من الهندسة**، فاللوحةُ وورقةُ الجولة ترتيبُهما
 *  واحد. (كانا يفترقان: هذه تفرز بـ`x` وتلك بترتيب المصفوفة المخزَّنة.) */
/* ---------------------------------------------------------------------------
 * المقارنة: «أيُّ الترتيبَين الصحيح؟»
 *
 * سألها المالك حرفياً: عيادةٌ صار عندها ترتيبان مختلفان، شلون تعرف الصحيح؟
 * وكانت الشاشةُ تقول **العددَ وحدَه** («٣ غرف · ١٢ قفص» مقابل «٣ غرف · ١٢
 * قفص») — ورقمان متساويان عن ترتيبَين مختلفَين لا يفرّقان شيئاً. فالقرارُ
 * يحتاج ما يُرى: أيُّ غرفةٍ هنا وليست هناك، وأيُّ قفصٍ انتقل من غرفةٍ لغرفة،
 * وأيُّ رمزٍ موجودٌ بنسخةٍ وغائبٌ عن الأخرى.
 *
 * والمطابقةُ **بالاسم لا بالمعرّف**: جهازان رتّبا مستقلَّين يعطيان «الفندقة»
 * معرّفَين مختلفين، وهي عند العيادة غرفةٌ واحدة. والاسمُ يُطبَّع كما تُطبَّع
 * أسماءُ الشركات (`groupKey` هناك) — مسافةٌ زائدةٌ أو «ة/ه» لا تصنع غرفتين.
 * ------------------------------------------------------------------------ */

/** مفتاحُ مطابقةِ اسم الغرفة — تطبيعٌ خفيفٌ يكفي للمقارنة البصرية. */
const roomKey = (name: string): string =>
  String(name ?? "")
    .replace(/[\u200B-\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627").replace(/\u0629/g, "\u0647").replace(/\u0649/g, "\u064A")
    .replace(/\s+/g, "").toLowerCase();

export interface LayoutDiffRoom {
  name: string;
  /** أقفاصُ هذه الغرفة بالنسخة الأولى — `null` يعني أن الغرفةَ غيرُ موجودةٍ فيها. */
  mine: string[] | null;
  theirs: string[] | null;
  /** تختلف الغرفتان فعلاً (وجوداً أو محتوى). */
  differs: boolean;
}

export interface LayoutDiff {
  identical: boolean;
  rooms: LayoutDiffRoom[];
  /** رموزٌ بالأولى وليست بالثانية، والعكس. */
  onlyMine: string[];
  onlyTheirs: string[];
  /** رمزٌ موجودٌ بالنسختين لكنّ غرفتَه اختلفت — أخطرُ فرقٍ يُقرأ بلمحة. */
  moved: Array<{ code: string; from: string; to: string }>;
}

/**
 * يقارن تخطيطَين ويقول **ما الفرق** لا كم العدد.
 * `mine` = ما على الشاشة، `theirs` = نسخةُ السحابة (أو نسخةٌ من السجلّ).
 */
export function compareLayouts(
  mine: Pick<CageLayout, "rooms" | "cages">,
  theirs: Pick<CageLayout, "rooms" | "cages">,
): LayoutDiff {
  const a = flatRooms(mine), b = flatRooms(theirs);
  const byKey = (rs: CageRoom[]) => {
    const m = new Map<string, CageRoom>();
    for (const r of rs) {
      const k = roomKey(r.name);
      const prev = m.get(k);
      // غرفتان بنفس الاسم بنسخةٍ واحدة: تُضمّان للمقارنة كما تراهما العين.
      if (prev) m.set(k, { ...prev, cages: [...prev.cages, ...r.cages] });
      else m.set(k, r);
    }
    return m;
  };
  const ma = byKey(a), mb = byKey(b);
  const order: string[] = [];
  for (const r of a) if (!order.includes(roomKey(r.name))) order.push(roomKey(r.name));
  for (const r of b) if (!order.includes(roomKey(r.name))) order.push(roomKey(r.name));

  const rooms: LayoutDiffRoom[] = order.map((k) => {
    const ra = ma.get(k), rb = mb.get(k);
    const differs = !ra || !rb || ra.cages.join("\u0000") !== rb.cages.join("\u0000");
    return { name: ra?.name ?? rb?.name ?? "", mine: ra ? ra.cages : null, theirs: rb ? rb.cages : null, differs };
  });

  const roomOf = (rs: CageRoom[]) => {
    const m = new Map<string, string>();
    for (const r of rs) for (const c of r.cages) if (!m.has(c)) m.set(c, r.name);
    return m;
  };
  const oa = roomOf(a), ob = roomOf(b);
  const onlyMine = [...oa.keys()].filter((c) => !ob.has(c));
  const onlyTheirs = [...ob.keys()].filter((c) => !oa.has(c));
  const moved = [...oa.entries()]
    .filter(([c, r]) => ob.has(c) && roomKey(ob.get(c) as string) !== roomKey(r))
    .map(([code, from]) => ({ code, from, to: ob.get(code) as string }));

  return {
    identical: rooms.every((r) => !r.differs) && !onlyMine.length && !onlyTheirs.length && !moved.length,
    rooms, onlyMine, onlyTheirs, moved,
  };
}

export function flatRooms(l: Pick<CageLayout, "rooms" | "cages">): CageRoom[] {
  return roomsInLayoutOrder(l.rooms).map((r) => ({
    id: r.id, name: r.name,
    cages: cagesOfRoom(l, r).map((c) => c.code),
  }));
}

/** رموزٌ يعرفها النظامُ (رقودٌ نشط) وليست مرسومةً بالتخطيط.
 *
 *  **تُعرض ولا تُكتب.** كان «التبنّي» يكدّسها بغرفةٍ جديدةٍ اسمُها «غير مصنّفة»
 *  ويرفعها للسحابة — فتولد غرفةٌ بكلّ جهازٍ يفتح الشاشة (رأينا ثلاثاً بعيادة
 *  واحدة). الآن تُحسب عند العرض وحدَه، والعيادةُ تضمّها لغرفةٍ بقرارها. */
export function orphanCodes(l: Pick<CageLayout, "cages">, known: Iterable<string>): string[] {
  const drawn = new Set(l.cages.map((c) => c.code.trim().toLowerCase()));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of known) {
    const code = String(raw ?? "").trim();
    const k = code.toLowerCase();
    if (!code || drawn.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(code);
  }
  return out;
}
