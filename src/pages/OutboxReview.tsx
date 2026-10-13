import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { outboxReviewList, outboxWaitingOthers, flushOutbox, type OutboxOp } from "@/lib/outbox";
import {
  outboxRejectedList, outboxReviveOne, outboxDiscard, isMine, traceable, traceSpan, type ShelfResult,
} from "@/lib/outboxShelf";
import { repo } from "@/lib/repo";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import type { ReturnLine } from "@/lib/expenseCategoryRules";
import { formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * مراجعةُ ما لم يصل الخادم (outbox.ts، قرارُ المالك ١٣/١٠) — صفحةٌ لا نافذة: نصوصُها (obx)
 * بالنصف البارد، والشارةُ (OutboxChip بالشريط والقائمة الجانبية) تنقل إليها.
 *
 * من ٢٦/٩ إلى ١٣/١٠ كان كلُّ ما فشل شبكياً يُختم «بلا أحد» ويُنقل للرفّ، و«استأنف» لم يُحيِه —
 * والعيادةُ رأته «متعثّرة» فربما أدخلته بيدها بعدها. فلا رفعَ أعمى: كلُّ عمليةٍ بنوعها ووقتها وما
 * بحمولتها، و«ارفعها» أو «احذفها» — للمدير وحده (مالٌ ومخزون). والحذفُ يسأل بالاسم بمكانه (لا
 * نافذةَ متصفّح) ويذهب لأرشيفٍ بالجهاز. وثلاثةُ أقسام:
 *   • بلا ختم: مصدرُها مجهول، ورفعُها يحسبها على العيادة الحاليّة — يُقال.
 *   • رفضتها القاعدة مراراً: سببُها ظاهر، و«أعد المحاولة» أو «احذفها» (كانت تدور بلا مخرج).
 *   • تنتظر حساباً آخر: للعلم وحده — لا تُرفع باسم غير صاحبها.
 * والمرتجعُ يُسأل عنه الخادمُ أوّلاً: مرجعُ إعادته يُمسح بعد ٧ أيام، فإعادتُه تكرّره إن كان وصل
 * وضاع جوابُه — وأثرُه سطورُ «مرتجع» بين حفظه وآخر محاولة (findReturnTrace). و«ارفعها» عليه
 * لا تُفتح قبل الجواب (أو تعذّره) — ولا بأوّل رسم: كانت مفتوحةً لحظةً قبل أن يبدأ السؤال.
 * ==========================================================================*/

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export interface OpSummary {
  kind: string;
  name: string | null;
  amount: number | null;
  /** عددُ المواد (مرتجع). */
  lines: number | null;
  /** كميّةٌ بوحدتها (صرفُ دواجن) — لا «عدد مواد». */
  qty: number | null;
  /** يومُ العملية كما بحمولتها (سحب، صرف، إدخالٌ يومي). */
  day: string | null;
  category: string | null;
  /** موادُّ المرتجع باسمها ومبلغها — لسؤال الخادم عن أثره (matchReturnRows). */
  returnLines: ReturnLine[];
}

/** خلاصةُ العملية مما بحمولتها وحده — لا تخمين. ومدخلٌ ناقصٌ لا يكسر الرسم. */
export function opSummary(op: OutboxOp): OpSummary {
  const base: OpSummary = { kind: op.kind === "rpc" ? op.fn : op.table, name: null, amount: null, lines: null, qty: null, day: null, category: null, returnLines: [] };
  if (op.kind === "rpc") {
    const args = (op.args ?? {}) as Record<string, unknown>;
    const items = Array.isArray(args.p_items) ? (args.p_items as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
    const meta = (args.p_meta && typeof args.p_meta === "object" ? args.p_meta : {}) as Record<string, unknown>;
    if (op.fn === "retail_return") {
      let total = 0;
      const returnLines: ReturnLine[] = [];
      for (const it of items) {
        // نفسُ حساب retail_return: round(|كمية|×|سعر|، ٢) — وما بلا اسمٍ يُكتب بالخادم باسمٍ افتراضيّ فلا يُطابَق.
        const amount = Math.round(Math.abs((num(it.qty) ?? 0) * (num(it.unit_price) ?? 0)) * 100) / 100;
        total += amount;
        const n = str(it.name);
        if (n) returnLines.push({ name: n, amount });
      }
      const names = returnLines.map((l) => l.name);
      return { ...base, name: str(meta.customer_name) ?? (names.length ? names.join(" · ") : null), amount: Math.round(total * 100) / 100, lines: items.length, returnLines };
    }
    return { ...base, name: str(args.p_name) ?? str(meta.name), qty: num(args.p_qty), day: str(args.p_on_date) };
  }
  const r = (op.row ?? {}) as Record<string, unknown>;
  return {
    ...base,
    name: str(r.name) ?? str(r.description),
    amount: num(r.amount),
    day: str(r.spent_at) ?? str(r.on_date),
    category: str(r.category),
  };
}

type Trace = { state: "checking" } | { state: "none" } | { state: "failed" } | { state: "found"; at: string; desc: string };
const isReturn = (op: OutboxOp) => op.kind === "rpc" && op.fn === "retail_return";

export function OutboxReview() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { role } = usePermissions();
  // جهازٌ مقفول (managerOverride) يُبقي دورَ صاحبه ويقفل المناطقَ الحسّاسة — وهذه منها (مالٌ ومخزون).
  const { restricted } = useOverride();
  const manager = role === "manager" && !restricted;
  const read = () => ({ review: outboxReviewList(), rejected: outboxRejectedList(), others: outboxWaitingOthers() });
  const [lists, setLists] = useState(read);
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [traces, setTraces] = useState<Record<string, Trace>>({});
  const refresh = () => { setLists(read()); setAsking(null); };
  /* القوائمُ تتبع التخزين: رفعٌ نجح بالخلفية، أو تبويبٌ آخر عالج عملية. */
  useEffect(() => {
    const on = () => setLists(read());
    window.addEventListener("vp-outbox", on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener("vp-outbox", on); window.removeEventListener("storage", on); };
  }, []);

  const when = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(d);
  };
  const dayOf = (s: string) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
    if (Number.isNaN(d.getTime())) return s;
    return new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "ar-IQ", { dateStyle: "medium" }).format(d);
  };

  /* المرتجعُ: هل وصل الخادمَ قبل أن يضيع جوابُه؟ يُسأل مرّةً لكلٍّ ظهر بأيّ قسم. والجوابُ يُكتب
   * ما دامت الصفحةُ مفتوحة — كان مربوطاً بجولة الأثر فيُرمى عند أوّل ضغطة، ويبقى «نسأل…» أبداً
   * فيُخفي تحذيرَ التكرار. والسؤالُ لا يتكرّر لما سُئل عنه (`asked`). */
  const mounted = useRef(true);
  const asked = useRef(new Set<string>());
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    mounted.current = true;
    for (const op of [...lists.review, ...lists.rejected, ...lists.others]) {
      if (!isReturn(op) || !traceable(op) || asked.current.has(op.id)) continue;
      asked.current.add(op.id);
      setTraces((m) => ({ ...m, [op.id]: { state: "checking" } }));
      void repo.findReturnTrace(traceSpan(op, new Date().toISOString()), opSummary(op).returnLines).then(
        (rows) => { if (mounted.current) setTraces((m) => ({ ...m, [op.id]: rows.length ? { state: "found", at: rows[0].spent_at, desc: rows[0].description ?? "" } : { state: "none" } })); },
        () => { if (mounted.current) setTraces((m) => ({ ...m, [op.id]: { state: "failed" } })); },
      );
    }
  }, [lists]);

  const why = (r: ShelfResult) => (r.ok ? null
    : r.reason === "no_session" ? t("obx.noSession")
    : r.reason === "missing" ? t("obx.missing")
    : r.reason === "other_owner" ? t("obx.otherOwner")
    : t("obx.storage"));
  const send = async (op: OutboxOp) => {
    playTap();
    const r = outboxReviveOne(op.id, op);
    refresh();
    if (!r.ok) { setNote(why(r)); return; }
    setNote(t("obx.sent"));
    await flushOutbox().catch(() => undefined);   // فشلُ الشبكة يُبقيها بالطابور (الشارةُ الصفراء)
    refresh();
  };
  const discard = (op: OutboxOp) => {
    playTap();
    const r = outboxDiscard(op.id, op);
    refresh();
    setNote(r.ok ? t("obx.discarded") : why(r));
  };

  const details = (op: OutboxOp) => {
    const s = opSummary(op);
    return (
      <div className="mt-1 space-y-0.5 text-xs text-ink-muted">
        {s.name && <div className="break-words font-semibold text-ink">{s.name}</div>}
        {s.amount != null && <div className="tabular-nums">{t("obx.amount", { n: formatNum(s.amount) })}</div>}
        {s.lines != null && <div className="tabular-nums">{t("obx.lines", { n: formatNum(s.lines) })}</div>}
        {s.qty != null && <div className="tabular-nums">{t("obx.qty", { n: String(s.qty) })}</div>}
        {s.day && <div className="tabular-nums">{t("obx.day", { d: dayOf(s.day) })}</div>}
        {s.category && <div>{t("obx.category", { c: s.category })}</div>}
      </div>
    );
  };
  const head = (op: OutboxOp) => {
    const s = opSummary(op);
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink">{t(`obx.kind.${s.kind}`, { defaultValue: s.kind })}</span>
        <span className="text-2xs tabular-nums text-ink-subtle">{t("obx.queued", { when: when(op.queued_at) })}</span>
      </div>
    );
  };
  const actions = (op: OutboxOp, sendLabel: string | null) => {
    if (!manager) return null;
    // مرتجعٌ لم يُجب الخادمُ عن أثره بعد (أو لم يُسأل بعد — أوّلُ رسم): لا رفعَ قبل الجواب (قد يكون وصل).
    const st = traces[op.id]?.state;
    const waiting = isReturn(op) && st !== "none" && st !== "found" && st !== "failed";
    const label = opSummary(op).name ?? t(`obx.kind.${opSummary(op).kind}`, { defaultValue: opSummary(op).kind });
    return asking === op.id ? (
      <div className="mt-2 space-y-2 rounded-lg bg-danger-50 p-2 dark:bg-danger-500/10" data-obx-ask>
        <p className="text-xs font-semibold text-danger-700 dark:text-danger-300">{t("obx.discardAsk", { name: label })}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="danger" data-obx-discard-yes onClick={() => discard(op)}>{t("obx.discardYes")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { playTap(); setAsking(null); }}>{t("obx.keep")}</Button>
        </div>
      </div>
    ) : (
      <div className="mt-2 flex flex-wrap gap-2">
        {sendLabel && <Button size="sm" variant="primary" data-obx-send disabled={waiting} onClick={() => { void send(op); }}>{sendLabel}</Button>}
        <Button size="sm" variant="ghost" data-obx-discard onClick={() => { playTap(); setAsking(op.id); }}>{t("obx.discard")}</Button>
      </div>
    );
  };
  const traceLine = (op: OutboxOp) => {
    const tr = traces[op.id];
    if (!tr) return null;
    if (tr.state === "found") {
      return <p className="mt-2 rounded-lg bg-warn-50 px-2 py-1.5 text-xs font-semibold text-warn-700 dark:bg-warn-500/10 dark:text-warn-200" data-obx-trace="found">{t("obx.traceFound", { when: when(tr.at), desc: tr.desc })}</p>;
    }
    const key = tr.state === "checking" ? "obx.traceChecking" : tr.state === "none" ? "obx.traceNone" : "obx.traceFailed";
    return <p className="mt-2 text-2xs text-ink-subtle" data-obx-trace={tr.state}>{t(key)}</p>;
  };

  const empty = !lists.review.length && !lists.rejected.length && !lists.others.length;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6" data-outbox-review>
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted hover:text-ink" aria-label={t("obx.back")}>
          <ArrowRight size={18} className="ltr:rotate-180" />
        </button>
        <h1 className="text-lg font-bold text-ink">{t("obx.title")}</h1>
      </div>
      <div className="space-y-4">
        {note && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs font-semibold text-ink" data-obx-note>{note}</p>}
        {!manager && !empty && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-muted" data-obx-manager-only>{t("obx.managerOnly")}</p>}
        {empty && <p className="py-6 text-center text-sm text-ink-subtle" data-obx-empty>{t("obx.empty")}</p>}

        {lists.review.length > 0 && (
          <section className="space-y-2" data-obx-section="review">
            <h2 className="text-sm font-bold text-ink">{t("obx.reviewTitle")}</h2>
            <p className="text-xs text-ink-muted">{t("obx.intro")}</p>
            <ul className="space-y-2">
              {lists.review.map((op) => {
                /* ثلاثُ حالات: بلا ختم (مصدرُها مجهول — تُرفع على العيادة الحاليّة)، ومتقادمةٌ للداخل
                 * (يُقال لماذا وُقفت)، ومتقادمةٌ لحسابٍ آخر — «ارفعها» كانت تُعرض عليها فتُركن باسمه. */
                const other = !!op.who && !isMine(op);
                return (
                  <li key={op.id} className="rounded-xl border border-line bg-surface-1 p-3" data-obx-item={op.id}>
                    {head(op)}
                    {details(op)}
                    <p className="mt-1 text-2xs text-ink-subtle" data-obx-why>{t(!op.who ? "obx.originUnknown" : other ? "obx.otherOwner" : "obx.staleNote")}</p>
                    {traceLine(op)}
                    {actions(op, other ? null : t("obx.send"))}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {lists.rejected.length > 0 && (
          <section className="space-y-2" data-obx-section="rejected">
            <h2 className="text-sm font-bold text-ink">{t("obx.rejectedTitle")}</h2>
            <p className="text-xs text-ink-muted">{t("obx.rejectedIntro")}</p>
            <ul className="space-y-2">
              {lists.rejected.map((op) => (
                <li key={op.id} className="rounded-xl border border-danger-200 bg-surface-1 p-3 dark:border-danger-500/30" data-obx-item={op.id}>
                  {head(op)}
                  {details(op)}
                  {op.last_error && <p className="mt-1 break-words text-2xs text-danger-700 dark:text-danger-300" data-obx-error>{t("obx.lastError", { e: op.last_error })}</p>}
                  {traceLine(op)}
                  {/* مختومةٌ بحسابٍ آخر: «أعد المحاولة» كانت تركنها باسمه وتقول «ترتفع هسه» — لها الحذفُ وحده. */}
                  {!isMine(op) && <p className="mt-1 text-2xs text-ink-subtle" data-obx-other-owner>{t("obx.otherOwner")}</p>}
                  {actions(op, isMine(op) ? t("obx.retry") : null)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {lists.others.length > 0 && (
          <section className="space-y-2" data-obx-section="others">
            <h2 className="text-sm font-bold text-ink">{t("obx.othersTitle")}</h2>
            <p className="text-xs text-ink-muted">{t("obx.othersIntro", { n: formatNum(lists.others.length) })}</p>
            <ul className="space-y-2">
              {lists.others.map((op) => (
                <li key={op.id} className="rounded-xl border border-line bg-surface-2/40 p-3" data-obx-item={op.id}>
                  {head(op)}
                  {details(op)}
                  {traceLine(op)}
                  {actions(op, null)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
