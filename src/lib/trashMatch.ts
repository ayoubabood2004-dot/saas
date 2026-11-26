/* ============================================================================
 * «المحذوفةُ لا يلقاها أيُّ باحث» (G21) و«الدمجُ يمسح اسمَ التوأم» (G22) — تدقيقُ المخزن ٢٢/١١، docs/stock-integrity-plan.md §٣ب.
 *
 * مادّةٌ حُذفت (أو طُويت بدمج) تبقى بـ`products_trash`، وكلُّ باحثٍ يقرأ الحيّة وحدها: الماسحُ يقول «مو موجود — أضفه»، والبحثُ «لا نتائج»،
 * والشراءُ يصنع مادّةً جديدة — فتولد توأماً، واسترجاعُها بعده يعدّها مرّتين؛ وبلا استرجاعٍ «رصيده صفر» والعلبُ بالرفّ.
 *
 * هنا الحكمُ وحده (صِرف، بلا شبكةٍ ولا نصوص): يُطابَق المحذوفُ **بالدوالّ نفسِها** التي يطابق بها الباحثُ الحيّ — `carriesCode`
 * للرمز (الأساسيُّ والإضافيّ، مطبَّعاً على الطرفين) و`searchable` للاسم — فما يقول «ما موجود» عن الحيّة يقول «بالمحذوفات» عن الشيء نفسِه.
 * تطبيعٌ ثانٍ هنا كان سيفشل بصمتٍ ويبدو أنه يعمل (§٣ «العربية والأرقام»).
 *
 * والمطويُّ بدمجٍ يُتبع إلى أصله الحيّ (سلسلةٌ: أصلٌ طُوي هو أيضاً)، فيُقال «اندمجت بـ«الأصل»» لا «محذوفة» — واسترجاعُه فكٌّ للدمج لا
 * يطلبه من يبحث عن المادّة. وسلسلةٌ تنتهي بمحذوفٍ (الأصلُ نفسُه حُذف) تُقال عن آخرها: هو ما يُسترجع ليرجع الرصيد.
 * ========================================================================= */
import type { DeletedProduct, Product } from "@/types";
import { carriesCode } from "./productCodes";
import { searchable } from "./utils";

export type TrashHit =
  /** حُذفت ولم تُطوَ — تُسترجع من «المحذوفات» بمعرّفها (`t.id`). */
  | { kind: "deleted"; t: DeletedProduct }
  /** طُويت بدمجٍ في أصلٍ حيّ — رصيدُها وتاريخُها عنده. */
  | { kind: "merged"; t: DeletedProduct; keeper: Product };

/** أقصى طولٍ لسلسلة دمجٍ تُتبع (حمايةٌ من حلقةٍ بصفوفٍ تالفة). */
const CHAIN = 8;

/** يتبع المطويَّ إلى أصله: حيٌّ ⇒ merged، وسلسلةٌ تنتهي بمحذوفٍ غيرِ مطويّ ⇒ deleted عن آخرها، وغيرُ ذلك (أصلٌ غائبٌ عن الاثنين) ⇒ null. */
export function resolveTrash(t: DeletedProduct, trash: readonly DeletedProduct[], live: readonly Product[]): TrashHit | null {
  let cur = t;
  for (let i = 0; i < CHAIN; i++) {
    if (!cur.merged_into) return { kind: "deleted", t: cur };
    const keep = live.find((p) => p.id === cur.merged_into);
    if (keep) return { kind: "merged", t, keeper: keep };
    const next = trash.find((x) => x.id === cur.merged_into);
    if (!next) return null;
    cur = next;
  }
  return null;
}

/** المحذوفُ الذي يحمل الرمزَ (الأساسيَّ أو إضافياً)، الأحدثُ حذفاً أوّلاً — ولا شيءَ إن حملته مادّةٌ حيّة (فليس «مجهولاً»). */
export function trashByCode(trash: readonly DeletedProduct[], live: readonly Product[], code: string | null | undefined): TrashHit | null {
  if (!code || live.some((p) => carriesCode(p, code))) return null;
  for (const t of newestFirst(trash)) {
    if (!carriesCode(t.row, code)) continue;
    const hit = resolveTrash(t, trash, live);
    if (hit) return hit;
  }
  return null;
}

/**
 * ما يطابقه بحثٌ بالاسم أو الرمز من المحذوفات — بمطابقة البحث الحيّ نفسِها (`searchable(name).includes(q)`، أو الرمز). `exact`:
 * الاسمُ كلُّه (نموذجُ الإضافة وسطرُ الشراء: «هذه هي نفسُها؟») لا جزؤه. والنتيجةُ بلا تكرار (مطويّان في أصلٍ واحد ⇒ سطرٌ لكلٍّ منهما
 * بالاسم الذي بُحث به) ومقصوصةٌ بـ`max` — والقصُّ يُقال بالعدد (`more`)، لا سقفٌ صامت.
 */
export function trashByQuery(trash: readonly DeletedProduct[], live: readonly Product[], query: string,
  opts: { exact?: boolean; max?: number } = {}): { hits: TrashHit[]; more: number } {
  const qKey = searchable(query.trim());
  if (!qKey) return { hits: [], more: 0 };
  const hits: TrashHit[] = [];
  const seen = new Set<string>();
  for (const t of newestFirst(trash)) {
    const rowKey = searchable(t.row?.name ?? "");
    const byName = opts.exact ? rowKey === qKey : rowKey.includes(qKey);
    if (!byName && !carriesCode(t.row, query)) continue;
    // اسمٌ تحمله مادّةٌ حيّة بالاسم نفسِه ليس «ما نلكاها» — هي موجودة (نموذجُ الإضافة يقولها بحارس التوائم).
    if (opts.exact && live.some((p) => searchable(p.name) === rowKey)) continue;
    const hit = resolveTrash(t, trash, live);
    if (!hit) continue;
    const key = hit.kind === "merged" ? `m:${t.id}` : `d:${hit.t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(hit);
  }
  const max = opts.max ?? 5;
  return { hits: hits.slice(0, max), more: Math.max(0, hits.length - max) };
}

/**
 * قبل الاسترجاع (مراجعة ٢٦/١١): مادّةٌ حيّة تحمل رمزَ المحذوفة أو اسمَها نفسَه — غالباً أُدخلت من جديد أثناء غيابها. الاسترجاعُ يرجّع
 * رصيدَ المحذوفة **بجانبها** (الرمزُ يبقى للحيّة)، فإن كانت نفسَ العلب صار ضعفاً — يُقال بالاسمين والرقمين قبل الضغط. `except`: أصلُ
 * المدموجة (فكُّ الدمج يأخذ رصيدَها منه، وهو يحمل رموزَها) — ليس توأماً. بالمطابقة نفسِها: `carriesCode` و`searchable`.
 */
export function liveTwinsOf(t: DeletedProduct, live: readonly Product[], except: string | null = null): Product[] {
  const nameKey = searchable(t.row?.name ?? "");
  const codes = [t.row?.barcode, ...(t.row?.alt_codes ?? [])].filter((c): c is string => !!c);
  return live.filter((p) => p.id !== t.id && p.id !== except && (
    (nameKey.length >= 2 && searchable(p.name) === nameKey)
    || codes.some((c) => carriesCode(p, c))));
}

function newestFirst(trash: readonly DeletedProduct[]): DeletedProduct[] {
  return [...trash].filter((t) => t && t.row).sort((a, b) => String(b.deleted_at ?? "").localeCompare(String(a.deleted_at ?? "")) || a.id.localeCompare(b.id));
}

/** اسمُ مادّةٍ داخل جملةٍ عربية معزولاً اتجاهياً (FSI…PDI): اسمٌ لاتينيٌّ بأقواس («Frontline Plus (Dog, single pipette)»)
 *  كان يُرسم مقلوبَ الأقواس ومقطوعاً بين الجملتين — العزلُ يرسمه كتلةً واحدة. للعرض وحده، لا للمطابقة. */
export const isoName = (s: string | null | undefined): string => `\u2068${String(s ?? "")}\u2069`;
