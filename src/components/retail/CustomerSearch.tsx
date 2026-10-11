/* ============================================================================
 * بحثُ الزبون **بخانتَي الاسم والهاتف نفسَيهما** بشاشة البيع (قرارُ المالك: لا سطرَ بحثٍ
 * جديد — «اكو مكان مخصّص لكتابة اسم الزبون ورقمه، خلّيه بنفس المكان»).
 *
 * كلُّ خانةٍ تبحث بنصّها (كان الهاتفُ يغلب الاسمَ دائماً)، والجوابُ من الخادم
 * (`findCustomers` ← customer_search، 0232): كلُّ التاريخ، وأصحابُ الحيوانات، والرقمُ
 * بمفتاح دولة العيادة. ومنفصلٌ عن بحث المنتجات والباركود تماماً.
 *
 * ثلاثُ قواعد تمنع أن يصير البحثُ ضرراً:
 *  • **الأحدثُ وحده يكتب** (`latestOnly`): جوابٌ بطيءٌ لنصٍّ قديم لا يمحو جوابَ الجديد،
 *    ومسحُ الخانة يُسقط ما بالطريق.
 *  • **الفشلُ يُقال** («ما كدرنا نبحث — أعد المحاولة») ولا يصير «زبون جديد»: قائمةٌ فارغةٌ
 *    عن خطأٍ تجعل الكاشير يكتب زبوناً موجوداً من جديد.
 *  • **Enter لا يختار إلا صفّاً أُشير إليه** (سهمٌ أو مرور) بعد آخر تغييرٍ بالنص — ومسحةُ
 *    الماسح تغيّر النصّ، فـEnter آخرها لا يختار زبوناً. (والمسحةُ نفسُها تُشال من الخانة
 *    بشاشة البيع: `stripScanTail`.)
 * ==========================================================================*/
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PawPrint, Plus, RotateCcw } from "lucide-react";
import type { CustomerHit, CustomerPet } from "@/types";
import { repo } from "@/lib/repo";
import { getDialCode } from "@/lib/settings";
import { readCustomerQuery } from "@/lib/customerKey";
import { latestOnly } from "@/lib/saleCustomer";
import { cn, formatNum } from "@/lib/utils";

export type CustField = "name" | "phone";
type Status = "idle" | "short" | "loading" | "ok" | "error";
interface State { field: CustField | null; open: boolean; status: Status; rows: CustomerHit[]; total: number | null; hi: number }
const CLOSED: State = { field: null, open: false, status: "idle", rows: [], total: null, hi: -1 };

export interface CustomerSearch extends State {
  /** نصٌّ جديد بخانة: يُقرأ بقاعدة الخادم نفسِها، ويُرسل بعد ٢٥٠ms إن كان يستحقّ. */
  type: (field: CustField, value: string) => void;
  /** تركيزٌ على خانةٍ بحثت قبل قليل يُعيد نتائجَها — والتركيزُ الفارغ لا يفتح شيئاً. */
  focus: (field: CustField) => void;
  blur: () => void;
  /** مسحةٌ هبطت بالخانة: لا بحثَ ينتظر ولا جوابَ يُكتب، والقائمةُ تُغلق. */
  cancel: () => void;
  retry: () => void;
  move: (delta: 1 | -1) => void;
  hover: (i: number) => void;
  close: () => void;
  /** الصفُّ المُشار إليه — وإلا null (Enter بلا إشارة لا يختار شيئاً). */
  highlighted: () => CustomerHit | null;
}

export function useCustomerSearch(): CustomerSearch {
  const [st, setSt] = useState<State>(CLOSED);
  const timer = useRef<number | null>(null);
  const blurTimer = useRef<number | null>(null);
  const seq = useRef(latestOnly()).current;
  const last = useRef<{ field: CustField | null; q: string }>({ field: null, q: "" });
  const stRef = useRef(st);
  stRef.current = st;

  const stop = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    seq.cancel();
  }, [seq]);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    seq.cancel();
  }, [seq]);

  const run = useCallback(async (field: CustField, q: string) => {
    const n = seq.next();
    setSt((s) => ({ ...s, field, open: true, status: "loading", hi: -1 }));
    try {
      const page = await repo.findCustomers(q, { limit: 8 });
      if (!seq.isLatest(n)) return;
      setSt((s) => ({ ...s, status: "ok", rows: page.rows, total: page.total ?? page.rows.length, hi: -1 }));
    } catch (e) {
      if (!seq.isLatest(n)) return;
      console.error("[pos] customer search failed", e);
      setSt((s) => ({ ...s, status: "error", rows: [], total: null, hi: -1 }));
    }
  }, [seq]);

  const type = useCallback((field: CustField, value: string) => {
    stop();
    last.current = { field, q: value };
    const rq = readCustomerQuery(value, getDialCode());
    if (rq.mode === "list") { setSt({ ...CLOSED, field }); return; }
    if (rq.mode === "short") { setSt({ ...CLOSED, field, open: true, status: "short" }); return; }
    setSt((s) => ({ field, open: true, status: "loading", rows: s.field === field ? s.rows : [], total: s.field === field ? s.total : null, hi: -1 }));
    timer.current = window.setTimeout(() => { timer.current = null; void run(field, value); }, 250);
  }, [run, stop]);

  /* الانتقالُ للخانة الأخرى يُغلق قائمةَ الأولى ويُسقط بحثَها المنتظر — كان مؤقّتُ الإغلاق يُلغى
   * بالتركيز الجديد فتبقى قائمةُ الاسم مفتوحةً تحت خانة الهاتف. */
  const focus = useCallback((field: CustField) => {
    if (blurTimer.current) { window.clearTimeout(blurTimer.current); blurTimer.current = null; }
    const s = stRef.current;
    if (s.field !== field) {
      stop();
      setSt((p) => ({ ...p, open: false, hi: -1, status: p.status === "loading" ? "idle" : p.status }));
      return;
    }
    if (s.status === "ok" || s.status === "error" || s.status === "short") setSt((p) => ({ ...p, open: true }));
  }, [stop]);
  /* مغادرةُ الخانة: بعد ١٥٠ms (الضغطُ على صفٍّ لا يُفقد التركيزَ أصلاً) تُغلق القائمة ويسقط ما
   * ينتظر — فلا يفتحها جوابٌ متأخّرٌ والكاشيرُ بخانةٍ أخرى. */
  const blur = useCallback(() => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      stop();
      setSt((s) => ({ ...s, open: false, hi: -1, status: s.status === "loading" ? "idle" : s.status }));
    }, 150);
  }, [stop]);
  const cancel = useCallback(() => { stop(); setSt(CLOSED); }, [stop]);
  const retry = useCallback(() => {
    const { field, q } = last.current;
    if (field) { stop(); void run(field, q); }
  }, [run, stop]);
  const move = useCallback((delta: 1 | -1) => {
    setSt((s) => {
      if (!s.open || s.status !== "ok" || s.rows.length === 0) return s;
      const n = s.rows.length;
      return { ...s, hi: s.hi < 0 ? (delta > 0 ? 0 : n - 1) : (s.hi + delta + n) % n };
    });
  }, []);
  const hover = useCallback((i: number) => setSt((s) => (s.hi === i ? s : { ...s, hi: i })), []);
  const close = useCallback(() => setSt((s) => ({ ...s, open: false, hi: -1 })), []);
  const highlighted = useCallback(() => {
    const s = stRef.current;
    return s.open && s.status === "ok" && s.hi >= 0 ? s.rows[s.hi] ?? null : null;
  }, []);

  return { ...st, type, focus, blur, cancel, retry, move, hover, close, highlighted };
}

/** القائمةُ تحت خانتَي الزبون — بعرضهما، وتلفّ تحت لوحة المفاتيح على الهاتف. */
export function CustomerDropdown({ cs, onPick }: { cs: CustomerSearch; onPick: (h: CustomerHit) => void }) {
  const { t } = useTranslation();
  if (!cs.open || cs.status === "idle") return null;
  const keep = (e: React.MouseEvent) => e.preventDefault(); // التركيزُ يبقى بالخانة
  return (
    <div data-custdrop className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-2xl border border-line bg-surface-1 shadow-raised">
      {cs.status === "short" && (
        <p className="px-3 py-3 text-xs text-ink-subtle">{t("cust.short", "اكتب حرفين من الاسم أو ٣ أرقام")}</p>
      )}
      {cs.status === "loading" && cs.rows.length === 0 && (
        <div className="space-y-2 p-3" aria-busy="true" aria-label={t("common.loading", "جارٍ التحميل…")}>
          {[0, 1].map((k) => (
            <div key={k} className="flex items-center gap-3">
              <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
              <span className="h-3 flex-1 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      )}
      {cs.status === "error" && (
        <div data-custerr className="flex items-center gap-2 px-3 py-3 text-xs font-semibold text-danger-700 dark:text-danger-200">
          <span className="min-w-0 flex-1">{t("cust.error", "ما كدرنا نبحث عن الزبون — الشبكة؟")}</span>
          <button type="button" onMouseDown={keep} onClick={cs.retry}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line bg-surface-1 px-2.5 py-1.5 font-bold text-ink transition hover:bg-surface-2">
            <RotateCcw size={13} /> {t("common.retry", "إعادة المحاولة")}
          </button>
        </div>
      )}
      {cs.status === "ok" && cs.rows.length === 0 && (
        <p data-custnew className="px-3 py-3 text-xs text-ink-subtle">{t("cust.new", "زبون جديد — ينحفظ مع البيع")}</p>
      )}
      {(cs.status === "ok" || cs.status === "loading") && cs.rows.length > 0 && (
        <div className={cn(cs.status === "loading" && "opacity-60")}>
          {cs.rows.map((h, i) => (
            <button
              key={h.key} type="button" data-custhit={h.key}
              onMouseDown={keep} onMouseEnter={() => cs.hover(i)} onClick={() => onPick(h)}
              className={cn("flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-start transition", i === cs.hi ? "bg-surface-2" : "hover:bg-surface-2")}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {[...(h.name ?? h.phone ?? "?").trim()][0] ?? "?"}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                  <span className="block truncate text-sm font-bold text-ink">{h.name ?? t("retail.walkIn", "عميل نقدي")}</span>
                  {h.phone
                    ? <bdi dir="ltr" className="block truncate text-xs tabular-nums text-ink-subtle">{h.phone}</bdi>
                    : <span className="block text-xs text-ink-subtle">{t("cust.noPhone", "بلا رقم")}</span>}
                </span>
                {h.petsAlive > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    <PawPrint size={11} /> {t("cust.pets", { n: formatNum(h.petsAlive), defaultValue: "عنده {{n}} حيوان" })}
                  </span>
                )}
                {h.purchases >= 2 && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-success-50 px-2 py-0.5 text-2xs font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300">
                    {t("cust.regular", "زبون دائم")}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      {cs.status === "ok" && cs.total != null && cs.total > cs.rows.length && (
        <p className="border-t border-line px-3 py-2 text-2xs text-ink-subtle">
          {t("cust.more", { n: formatNum(cs.rows.length), total: formatNum(cs.total), defaultValue: "معروض {{n}} من {{total}} — كمّل الكتابة" })}
        </p>
      )}
    </div>
  );
}

/** «أضف حيوانه» — اختياريّ: حيواناتُ الزبون المختار الأحياء تُعرض ولا يُلصق منها شيءٌ تلقائياً. */
export function CustomerPetsStrip({ hit, attached, onAttach }: { hit: CustomerHit; attached: ReadonlySet<string>; onAttach: (p: CustomerPet) => void }) {
  const { t } = useTranslation();
  const alive = hit.pets.filter((p) => !p.deceased && !attached.has(p.id));
  if (alive.length === 0) return null;
  return (
    <div data-custpets className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
      <span className="shrink-0 text-2xs font-bold text-ink-muted">{t("cust.addPet", "أضف حيوانه:")}</span>
      {alive.map((p) => (
        <button
          key={p.id} type="button" data-custpet={p.id} onClick={() => onAttach(p)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-brand-400/70 px-2.5 py-1 text-xs font-bold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/15"
        >
          <PawPrint size={11} /> {p.name} <Plus size={11} />
        </button>
      ))}
    </div>
  );
}
