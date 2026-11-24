import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { ArchiveRestore, GitMerge } from "lucide-react";
import type { DeletedProduct, Product } from "@/types";
import { Button, useToast } from "@/components/ui";
import { formatDate, formatQty } from "@/lib/utils";
import { repo } from "@/lib/repo";
import { describeDbError } from "@/lib/errors";
import { getActiveClinicId } from "@/lib/clinics";
import { trashByCode, trashByQuery, type TrashHit } from "@/lib/trashMatch";

/* ============================================================================
 * «بالمحذوفات» (G21/G22، تدقيقُ المخزن) — مالكُ النطاق `trsh`. قطعةٌ كسولة: شاشةُ البيع والمخزونُ والشراءُ يستوردونها بـimport().
 *
 * حين يقول باحثٌ «ما موجود» (مسحٌ مجهول، بحثٌ بلا نتائج، مادّةٌ جديدة بنموذجٍ أو بسطر شراء) تُسأل المحذوفاتُ بالمطابقة نفسِها
 * (trashMatch.ts): محذوفةٌ ⇒ «رجّعها» بدل «أضفها» (توأمٌ يُعدّ مرّتين يومَ الاسترجاع)، ومطويّةٌ بدمج ⇒ «اندمجت بـ«الأصل»».
 * **والسؤالُ إضافةٌ لا حكم**: فشلُ القراءة لا يُغيّر الرسالةَ الأصليّة (تبقى «ما موجود» كما كانت) ولا يقول «ماكو محذوفات» — يسكت.
 * ========================================================================= */

const t = (k: string, o?: Record<string, unknown>) => i18n.t(`trsh.${k}`, o ?? {});

/* المحذوفاتُ مرّةً لكلّ دقيقة لكلّ عيادة — المسحُ المجهول والبحثُ حرفاً حرفاً لا يجلبانها كلَّ مرّة. وعددُ الموادّ الحيّة بالمفتاح:
 * حذفٌ أو دمجٌ أو استرجاعٌ من أيّ شاشة يغيّره فتُجلب من جديد (لا حدثَ يُعلن ذلك — المحذوفةُ للتوّ كانت ستُقال «ما موجود» دقيقةً). */
const TTL = 60_000;
let cache: { key: string; at: number; p: Promise<DeletedProduct[]> } | null = null;
export function loadTrash(liveCount?: number): Promise<DeletedProduct[]> {
  const key = `${getActiveClinicId() ?? "default"}:${liveCount ?? ""}`;
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < TTL) return cache.p;
  const p = repo.listDeletedProducts();
  cache = { key, at: now, p };
  p.catch(() => { if (cache?.p === p) cache = null; });
  return p;
}
export function invalidateTrash(): void { cache = null; }

/** الماسحُ: المحذوفُ الذي يحمل الرمز — أو null (لا محذوفَ به، أو حيٌّ يحمله). يرمي فشلَ القراءة: المنادي يُبقي رسالتَه الأصليّة. */
export async function trashForCode(code: string, live: readonly Product[]): Promise<TrashHit | null> {
  return trashByCode(await loadTrash(live.length), live, code);
}

/** جملُ الماسح بلغة الواجهة الآن. */
export const say = {
  scan: (hit: TrashHit, code: string): string => (hit.kind === "deleted"
    ? t("scanDeleted", { code, name: hit.t.row.name })
    : t("scanMerged", { code, name: hit.t.row.name, keeper: hit.keeper.name })),
};

/** صفُّ محذوفةٍ أو مطويّة: الاسم وحالُها، و«رجّعها» لمن يملكها (المديرُ والطبيب — restore_product)، أو اسمُ الأصل للمطويّة. */
function HitRow({ hit, canRestore, onRestored, onPick }: {
  hit: TrashHit; canRestore: boolean; onRestored: (p: Product) => void; onPick?: (p: Product) => void;
}) {
  const { t: tt, i18n: ii } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    if (hit.kind !== "deleted" || busy) return;
    setBusy(true);
    try {
      const p = await repo.restoreProduct(hit.t.id);
      invalidateTrash();
      toast.success(tt("trsh.restored", { name: p.name }));
      onRestored(p);
    } catch (e) {
      toast.error(describeDbError(e, tt), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };
  if (hit.kind === "merged") {
    return (
      <li data-trashhit="merged" className="flex flex-wrap items-center gap-2 text-xs text-ink">
        <GitMerge size={14} className="shrink-0 text-ink-subtle" />
        <span className="min-w-0 flex-1">{tt("trsh.mergedLine", { name: hit.t.row.name, keeper: hit.keeper.name })}</span>
        {onPick && <Button size="sm" variant="secondary" data-trashpick onClick={() => onPick(hit.keeper)}>{hit.keeper.name}</Button>}
      </li>
    );
  }
  return (
    <li data-trashhit="deleted" className="flex flex-wrap items-center gap-2 text-xs text-ink">
      <ArchiveRestore size={14} className="shrink-0 text-ink-subtle" />
      <span className="min-w-0 flex-1">
        {tt("trsh.deletedLine", { name: hit.t.row.name, date: formatDate(hit.t.deleted_at, ii.language, true) })}
        {Number(hit.t.stock) !== 0 && <> · {tt("trsh.stockThen", { n: formatQty(Number(hit.t.stock)) })}</>}
      </span>
      {canRestore
        ? <Button size="sm" loading={busy} data-trashrestore onClick={() => void restore()}>{tt("trsh.restore")}</Button>
        : <span className="text-2xs text-ink-subtle">{tt("trsh.askManager")}</span>}
    </li>
  );
}

/** تحت «لا نتائج»: ما يطابق البحثَ بالمحذوفات. لا شيءَ يُرسم حتى تصل القائمة، ولا شيءَ عن فشلها (الرسالةُ الأصليّة فوقها تبقى). */
export function TrashSearchHint({ query, products, canRestore, onRestored, onPick }: {
  query: string; products: readonly Product[]; canRestore: boolean; onRestored: (p: Product) => void; onPick?: (p: Product) => void;
}) {
  const { t: tt } = useTranslation();
  const [trash, setTrash] = useState<DeletedProduct[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadTrash(products.length).then((x) => { if (alive) setTrash(x); }, () => { /* swallow-ok: السؤالُ إضافة — «لا نتائج» فوقه تبقى كما كانت */ });
    return () => { alive = false; };
  }, [products.length]);
  if (!trash) return null;
  const { hits, more } = trashByQuery(trash, products, query);
  if (!hits.length) return null;
  return (
    <div data-trashsearch className="mt-3 w-full max-w-md space-y-2 rounded-2xl border border-line bg-surface-1 p-3 text-start">
      <p className="text-xs font-extrabold text-ink">{tt("trsh.title")}</p>
      <ul className="space-y-2">
        {hits.map((h) => <HitRow key={`${h.kind}:${h.t.id}`} hit={h} canRestore={canRestore} onRestored={onRestored} onPick={onPick} />)}
      </ul>
      {more > 0 && <p className="text-2xs text-ink-subtle">{tt("trsh.more", { n: formatQty(more) })}</p>}
    </div>
  );
}

/**
 * مادّةٌ «جديدة» (نموذجُ الإضافة، سطرُ شراء) رمزُها أو اسمُها كلُّه لمحذوفة: «رجّعها بدل ما تضيفها جديدة» — توأمٌ يولد اليومَ يُعدّ مرّتين
 * يومَ تُسترجع. تحذيرٌ لا منع (قد تكون مادّةً أخرى بالاسم نفسِه حقّاً).
 */
export function TrashTwinWarn({ code, name, products, canRestore, onRestored, onPick }: {
  code?: string | null; name?: string | null; products: readonly Product[]; canRestore: boolean;
  onRestored: (p: Product) => void; onPick?: (p: Product) => void;
}) {
  const { t: tt } = useTranslation();
  const [trash, setTrash] = useState<DeletedProduct[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadTrash(products.length).then((x) => { if (alive) setTrash(x); }, () => { /* swallow-ok: تحذيرٌ إضافيّ — بلا قائمةٍ لا تحذير */ });
    return () => { alive = false; };
  }, [products.length]);
  if (!trash) return null;
  const byCode = code ? trashByCode(trash, products, code) : null;
  const hits = byCode ? [byCode] : name ? trashByQuery(trash, products, name, { exact: true, max: 2 }).hits : [];
  if (!hits.length) return null;
  return (
    <div data-trashtwin className="space-y-2 rounded-xl bg-warn-50/70 p-2.5 text-xs dark:bg-warn-500/10">
      <p className="font-bold text-warn-800 dark:text-warn-200">{tt(hits[0].kind === "deleted" ? "trsh.twinDeleted" : "trsh.twinMerged")}</p>
      <ul className="space-y-2">
        {hits.map((h) => <HitRow key={`${h.kind}:${h.t.id}`} hit={h} canRestore={canRestore} onRestored={onRestored} onPick={onPick} />)}
      </ul>
    </div>
  );
}

/** التسخين: قطعةٌ لا ترسم شيئاً — `page(…, ["trsh"])` يجلب النطاقَ معها. */
export default function TrashHintWarm(): null {
  return null;
}
