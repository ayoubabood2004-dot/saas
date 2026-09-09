/**
 * سقفُ سطر السلّة والزيادةُ عليه — حسابٌ صرف، خارج المكوّن ليُفحص.
 *
 * السببُ أن هذا الحساب كان بداخل `SaleBuilder` فما رآه فحصٌ قطّ، وفيه ضررٌ
 * مقيس: مسحةٌ مفردة على سطرٍ **عند سقف رصيده** كانت تقصّ بصمت (الكميةُ لا
 * تتغيّر) ثم تُصدر نغمةَ نجاح ووميضَ سطر — فالكاشير يعدّ بالبيبات، وكلُّها
 * نجاح، والفاتورةُ ناقصة. الرصيدُ ٥ والرفُّ عليه ٧: قطعتان بلا قيدٍ وفرقُ
 * الجرد يُتَّهم به أمينُ المخزن. التحذيرُ كان مشروطاً بـ`n > 1` وحدها.
 *
 * فالقاعدة هنا: **ما أُضيف فعلاً** يُحسب مرّةً واحدة، ومنه تُشتقّ الرسالةُ
 * والنغمة. `added === 0` مع `clamped` تعني «كلُّ المتوفّر بالسلّة أصلاً».
 */

/** ما يحتاجه حسابُ السقف من سطر السلّة — بنيةٌ لا صنف، فأيُّ سطرٍ يوافقها. */
export type CapLine = {
  /** سطرُ راجع: الزبون يرجّع ما اشتراه، والرصيدُ الحاليّ لا يقيّده. */
  ret?: boolean;
  /** رصيدُ المنتج بالعلب (كسريٌّ مقبول)؛ `null` = بلا سقف (خدمة/دواء). */
  stock?: number | null;
  /** يُباع بالوزن: الرصيدُ والكميةُ كسريّان بالكيلو — لا تقريبَ للأسفل. */
  byWeight?: boolean;
  saleUnit?: "box" | "sub";
  unitsPerBox?: number | null;
};

/** أقصى كميةٍ لسطرٍ بوحدته الحالية، مشتقّةً من رصيده بالعلب. */
export function unitCap(l: CapLine): number {
  if (l.ret) return Infinity;
  if (l.stock == null) return Infinity;
  if (l.byWeight) return l.stock;
  if (l.saleUnit === "sub" && l.unitsPerBox && l.unitsPerBox > 0) return Math.floor(l.stock * l.unitsPerBox);
  return Math.floor(l.stock);
}

/** نتيجةُ محاولةِ زيادةِ سطرٍ بمقدار `n`. */
export type CapAdd = {
  /** الكميةُ بعد الزيادة — ما يُكتب بالسلّة. */
  next: number;
  /** ما أُضيف فعلاً؛ صفرٌ يعني أن لا شيء تغيّر. */
  added: number;
  /** طُلب أكثرُ من السقف — يُقال بالصوت والنصّ مهما كان `added`. */
  clamped: boolean;
};

/**
 * زيادةُ `n` على كميةٍ حالية بحدود `cap`.
 * سطرٌ جديد: `current = 0` و`n ≥ 1` ⇒ واحدةٌ على الأقلّ ما دام السقفُ يسمح.
 */
export function capAdd(current: number, n: number, cap: number): CapAdd {
  const want = current + n;
  const next = Number.isFinite(cap) ? Math.min(want, cap) : want;
  const added = Math.max(0, next - current);
  return { next: Math.max(current, next), added, clamped: Number.isFinite(cap) && want > cap };
}

/* ── رصيدُ الصفر: حكمٌ لا يصدر عن لقطةٍ بائتة ─────────────────────────────
 * شاشةُ البيع تُحمّل قائمتَها مرّةً عند الفتح ولا تُحدَّث إلا بعد بيعةٍ مكتملة.
 * فمديرٌ رصّد شراءً ظهراً من جهازه: كلُّ مسحةٍ بالكاشير تُرفض «رصيده صفر»
 * والمخزنُ يقول موجود — تضاربٌ يعلّم العيادةَ ألّا تصدّق الشاشة، فتعيد إدخال
 * بضاعةٍ موجودة (وهذا بالضبط بابُ التوائم). فالحكمُ يُراجَع على الخادم قبل أن
 * يصير نهائياً، و«ما وصلنا الخادم» تُقال غيرَ «رصيدك صفر».
 */

/** ما يحتاجه حكمُ الرصيد من صفّ المنتج. */
export type StockRow = {
  stock?: number | null;
  pooled?: boolean | null;
  sold_by_weight?: boolean | null;
  has_sub_unit?: boolean | null;
  units_per_box?: number | null;
};

/**
 * «لا رصيد» لغرض منع البيع. المجمَّع (pooled) والموزون لا يُمنعان: الأول رصيدُه
 * بالقسم لا بالصفّ، والثاني كسريٌّ بطبعه. ووضعُ الراجع لا يقيّده رصيدٌ أصلاً.
 */
export function outOfStock(p: StockRow, retMode = false): boolean {
  if (retMode || p.pooled || p.sold_by_weight) return false;
  const stock = p.stock ?? 0;
  if (p.has_sub_unit && p.units_per_box) return stock * p.units_per_box < 1;
  return stock <= 0;
}

/** ماذا نفعل بمسحةٍ حكمُها المحلّيّ «رصيده صفر»، بعد سؤال الخادم. */
export type ZeroStockVerdict =
  /** الخادمُ يقول عنده رصيد ⇒ يُباع بالصفّ الطازج لا بالبائت. */
  | "sell-fresh"
  /** سألنا وأجاب: صفرٌ مؤكَّد ⇒ «زيد رصيده من المخزن». */
  | "refuse-confirmed"
  /** ما وصلنا الخادم ⇒ «صفرٌ بآخر تحديثٍ عندنا» — لا تُعد إدخاله. */
  | "refuse-stale";

export function zeroStockVerdict(fresh: StockRow | undefined | null, asked: boolean, retMode = false): ZeroStockVerdict {
  if (fresh && !outOfStock(fresh, retMode)) return "sell-fresh";
  return asked ? "refuse-confirmed" : "refuse-stale";
}
