/* ============================================================================
 * سلّةٌ مفتوحةٌ ورفعُ أسعار (0226) — قرارٌ صِرفٌ خارج المكوّن ليُفحص.
 *
 * البيعُ لا يقرأ الكتالوج: سعرُ السطر يُنسخ لحظةَ إضافته، والخادمُ يقبل ما يُرسَل.
 * فسلّةٌ بُدئت قبل الرفع (أو مسودّةٌ من أمس) كانت تبيع بالسعر القديم بصمت — والمالكُ
 * طلب «من تاريخ اليوم». هنا: حين تصل قائمةٌ طازجة، كلُّ سطرٍ **لم يُعدَّل سعرُه بيد**
 * يأخذ سعرَ القائمة لوحدته الحالية، وكلُّ الأسعار المحفوظة بالسطر (علبة، مفرد، كيلو)
 * تتجدّد — وإلا فتبديلُ الوحدة بعدها يُرجع السعرَ القديم (أمسكه تدقيقٌ عدائيّ).
 *
 * • المعدَّلُ بيد (`priceManual`) لا يُمسّ — قرارُ الكاشير. والسطرُ القديم بلا العلَم
 *   يُحكم بالمساواة (سعرُه = المحفوظ ⇒ من القائمة).
 * • سطرُ الراجع لا يُمسّ: يُردّ بما يُقرّه الكاشير (السعرُ قبل الرفع افتراضُه).
 * • سطرُ الدواء (med) بلا كتالوج — يُكتب سعرُه بكلّ بيعة.
 * • كلُّ تغييرٍ يُعاد بالاسم والسعرين — للإقرار قبل البيع، لا يمرّ صامتاً.
 * ========================================================================= */

export interface RepriceLine {
  id: string;
  kind: "product" | "service" | "med";
  name: string;
  unit_price: number;
  product_id: string | null;
  ret?: boolean;
  serviceId?: string | null;
  saleUnit?: "box" | "sub";
  boxPrice?: number;
  subPrice?: number | null;
  byWeight?: boolean;
  perKgPrice?: number;
  /** سعرُ الخدمة بالكتالوج لحظةَ إضافتها. */
  listAt?: number;
  /** الكاشيرُ كتب السعرَ بيده — لا يُمسّ. */
  priceManual?: boolean;
}

export interface FreshPrices {
  /** سعرا القائمة الآن (علبة/كيلو، ومفرد) — null إن غاب المنتج عن القائمة. */
  product: (id: string) => { box: number; sub: number | null } | null;
  service: (id: string) => number | null;
}

export interface Repriced { id: string; name: string; from: number; to: number }

/** السعرُ المحفوظ لوحدة السطر الحالية (ما أُخذ من القائمة). */
export function capturedPrice(l: RepriceLine): number | undefined {
  if (l.kind === "service") return l.listAt;
  if (l.byWeight) return l.perKgPrice;
  return l.saleUnit === "sub" ? (l.subPrice ?? undefined) : l.boxPrice;
}

/** عُدِّل بيد؟ العلَمُ إن وُجد، وإلا المساواةُ مع المحفوظ (سطورُ ما قبل العلَم). */
export function isManual(l: RepriceLine): boolean {
  if (l.priceManual !== undefined) return l.priceManual;
  const c = capturedPrice(l);
  return c !== undefined && l.unit_price !== c;
}

export function repriceCart<L extends RepriceLine>(cart: L[], fresh: FreshPrices): { cart: L[]; changed: Repriced[] } {
  const changed: Repriced[] = [];
  let touched = false;
  const next = cart.map((l) => {
    if (l.ret || l.kind === "med") return l;
    if (l.kind === "service") {
      if (!l.serviceId || l.listAt === undefined) return l;
      const now = fresh.service(l.serviceId);
      if (now == null || now === l.listAt) return l;
      const manual = isManual(l);
      touched = true;
      if (!manual) changed.push({ id: l.id, name: l.name, from: l.unit_price, to: now });
      return { ...l, listAt: now, unit_price: manual ? l.unit_price : now };
    }
    if (!l.product_id) return l;
    const f = fresh.product(l.product_id);
    if (!f) return l;
    const manual = isManual(l);
    if (l.byWeight) {
      if (l.perKgPrice === undefined || l.perKgPrice === f.box) return l;
      touched = true;
      if (!manual && l.unit_price !== f.box) changed.push({ id: l.id, name: l.name, from: l.unit_price, to: f.box });
      return { ...l, perKgPrice: f.box, unit_price: manual ? l.unit_price : f.box };
    }
    const boxMoved = l.boxPrice !== undefined && l.boxPrice !== f.box;
    const subMoved = l.subPrice !== undefined && (l.subPrice ?? null) !== f.sub;
    if (!boxMoved && !subMoved) return l;
    touched = true;
    const active = l.saleUnit === "sub" ? f.sub : f.box;
    const next: L = { ...l, boxPrice: l.boxPrice === undefined ? undefined : f.box, subPrice: l.subPrice === undefined ? undefined : f.sub };
    if (!manual && active != null && active !== l.unit_price) {
      changed.push({ id: l.id, name: l.name, from: l.unit_price, to: active });
      next.unit_price = active;
    }
    return next;
  });
  return { cart: touched ? next : cart, changed };
}
