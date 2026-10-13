import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { outboxReviewList, outboxWaitingOthers, flushOutbox, type OutboxOp } from "@/lib/outbox";
import {
  outboxRejectedList, outboxReviveOne, outboxDiscard, ownerState, traceable, traceSpan, currentClinic, pendingIds, type ShelfResult,
} from "@/lib/outboxShelf";
import { expectedReturnRows, matchReturnRows, traceBounds, traceVerdict, returnIsDistinctive, type ReturnLine } from "@/lib/returnTrace";
import type { VisibleTable } from "@/lib/repoDemo";
import { repo } from "@/lib/repo";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * مراجعةُ ما لم يصل الخادم (outbox.ts، قرارُ المالك ١٣/١٠) — صفحةٌ لا نافذة: نصوصُها (obx)
 * بالنصف البارد، والشارةُ (OutboxChip بالشريط والقائمة الجانبية) تنقل إليها.
 *
 * من ٦/٩ إلى ١٣/١٠ كان كلُّ ما فشل شبكياً يُختم «بلا أحد» ويُنقل للرفّ، و«استأنف» لم يُحيِه —
 * والعيادةُ رأته «متعثّرة» فربما أدخلته بيدها بعدها. فلا رفعَ أعمى: كلُّ عمليةٍ بنوعها ووقتها وما
 * بحمولتها، و«ارفعها» أو «احذفها» — للمدير وحده (مالٌ ومخزون). والحذفُ يسأل بالاسم بمكانه (لا
 * نافذةَ متصفّح) ويذهب لأرشيفٍ بالجهاز. وثلاثةُ أقسام:
 *   • بلا ختم: مصدرُها مجهول، ورفعُها يحسبها على العيادة الحاليّة — يُقال.
 *   • رفضتها القاعدة مراراً: سببُها ظاهر، و«أعد المحاولة» أو «احذفها» (كانت تدور بلا مخرج).
 *   • تنتظر حساباً آخر: للعلم وحده — لا تُرفع باسم غير صاحبها.
 * والمرتجعُ يُسأل عنه الخادمُ أوّلاً: مرجعُ إعادته يُمسح بعد ٧ أيام، فإعادتُه تكرّره إن كان وصل
 * وضاع جوابُه — وأثرُه سطورُ «مرتجع» بنصّها كاملاً بين حفظه وآخر محاولة (returnTrace.ts). وإدخالُ
 * اليوم يُسأل عن يومه بالخادم: «ارفعها» تدمج، فيُرى قبلها أهو أقدمُ منها أم أُعيد إدخالُه بعدها
 * (كانت لا تدمج فتصير «لا شيء» صامتاً ويُقال «ارتفعت»). و«ارفعها» على الاثنين لا تُفتح قبل الجواب
 * (أو تعذّره) — ولا بأوّل رسم: كانت مفتوحةً لحظةً قبل أن يبدأ السؤال.
 * وما لا تُعرف عيادتُه يُسأل عمّا يشير إليه (دفعة، شركة، منتج، تصنيف): «تُرفع على العيادة الحاليّة»
 * لا يصدق على إدخالِ يومٍ دفعتُه بعيادةٍ أخرى — كان يُكتب صفّاً يتيماً لا تراه العيادتان. فإشارةٌ لا تراها
 * هذه العيادة تقفل «ارفعها» (`refs`).
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
  /** سطورُ «مرتجع» كما كان الخادمُ سيكتبها — لسؤاله عن أثرها (matchReturnRows). */
  returnLines: ReturnLine[];
  /** النافقُ والمستبعدُ بإدخال اليوم. */
  dead: number | null;
  culled: number | null;
}

/** خلاصةُ العملية مما بحمولتها وحده — لا تخمين. ومدخلٌ ناقصٌ لا يكسر الرسم. */
export function opSummary(op: OutboxOp): OpSummary {
  const base: OpSummary = { kind: op.kind === "rpc" ? op.fn : op.table, name: null, amount: null, lines: null, qty: null, day: null, category: null, returnLines: [], dead: null, culled: null };
  if (op.kind === "rpc") {
    const args = (op.args ?? {}) as Record<string, unknown>;
    const items = Array.isArray(args.p_items) ? (args.p_items as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
    const meta = (args.p_meta && typeof args.p_meta === "object" ? args.p_meta : {}) as Record<string, unknown>;
    if (op.fn === "retail_return") {
      const returnLines = expectedReturnRows(args);
      const total = returnLines.reduce((t, l) => t + l.amount, 0);
      const names = items.map((it) => str(it.name)).filter((n): n is string => !!n);
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
    dead: op.table === "poultry_daily" ? num(r.dead) : null,
    culled: op.table === "poultry_daily" ? num(r.culled) : null,
  };
}

/** `found`: أثرٌ مميِّزٌ قريبٌ من إرسالٍ فعليّ (وصل — الأسلمُ الحذف)؛ `similar`: مثلُه موجود — يُقارَن بالعين
 *  (مرتجعُ زبونٍ عابرٍ نصُّه نصُّ كلِّ مرتجعٍ مثله — traceVerdict). */
type Trace = { state: "checking" } | { state: "none" } | { state: "failed" } | { state: "found" | "similar"; at: string; desc: string; ids: string[] };
/** سطرُ خادمٍ واحد يطابق عمليتين هنا؟ واحدةٌ منهما وحدها هي — حذفُ الاثنتين يُسقط مرتجعاً حقيقيّاً. */
export function sharesServerRow(traces: Record<string, Trace>, id: string): boolean {
  const tr = traces[id];
  if (tr?.state !== "found" && tr?.state !== "similar") return false;
  return Object.entries(traces).some(([k, o]) => k !== id && (o.state === "found" || o.state === "similar") && o.ids.some((x) => tr.ids.includes(x)));
}
/** ما تشير إليه العمليةُ من صفوف عيادتها — يُسأل عنه قبل رفع ما لا تُعرف عيادتُه. */
export function refsOf(op: OutboxOp): { table: VisibleTable; ids: string[] }[] {
  const id = (v: unknown) => (typeof v === "string" && v ? [v] : []);
  const out: { table: VisibleTable; ids: string[] }[] = [];
  const add = (table: VisibleTable, ids: string[]) => { if (ids.length) out.push({ table, ids: [...new Set(ids)] }); };
  if (op.kind === "rpc") {
    const a = (op.args ?? {}) as Record<string, unknown>;
    if (op.fn === "poultry_consume") { add("poultry_cycles", id(a.p_cycle)); add("products", id(a.p_product)); }
    else add("products", (Array.isArray(a.p_items) ? a.p_items : []).flatMap((it) => id((it as Record<string, unknown> | null)?.product_id)));
    return out;
  }
  const r = (op.row ?? {}) as Record<string, unknown>;
  if (op.table === "poultry_daily") add("poultry_cycles", id(r.cycle_id));
  if (op.table === "company_sections") add("companies", id(r.company_id));
  if (op.table === "products") { add("companies", id(r.company_id)); add("company_sections", id(r.section_id)); add("poultry_farms", id(r.farm_id)); }
  if (op.table === "expenses") add("expense_categories", id(r.category_id));
  return out;
}
/** `pending`: يشير لما بالطابور أو الرفّ نفسِه (شركةٌ أو قسمٌ لم يُرفع بعد) — يُرفع ذاك أوّلاً، لا «من عيادةٍ أخرى». */
type Refs = { state: "checking" | "ok" | "foreign" | "pending" | "failed" };
/** ما يلزم قبل رفع ما لا تُعرف عيادتُه: لا شيء، أو رفعُ أبيه الذي بالقائمة أوّلاً، أو سؤالُ الخادم. */
export function refsGate(want: { ids: string[] }[], pend: Set<string>): "none" | "pending" | "ask" {
  if (!want.length) return "none";
  return want.some((w) => w.ids.some((id) => pend.has(id))) ? "pending" : "ask";
}
/** يومُ الخادم لإدخالٍ يوميّ: غائب، أو أقدمُ من هذا الإدخال، أو أحدث (أُعيد إدخالُه بعده). */
type DayCheck = { state: "checking" } | { state: "failed" } | { state: "none" }
  | { state: "older" | "newer"; at: string; dead: number | null; culled: number | null };
const isReturn = (op: OutboxOp) => op.kind === "rpc" && op.fn === "retail_return";
const isDay = (op: OutboxOp) => op.kind === "insert" && op.table === "poultry_daily";
/** لا يُرفع قبل جواب الخادم عنه: أثرُ المرتجع، أو يومُ الإدخال اليوميّ. */
const needsCheck = (op: OutboxOp) => isReturn(op) || isDay(op);

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
  const [days, setDays] = useState<Record<string, DayCheck>>({});
  const [refs, setRefs] = useState<Record<string, Refs>>({});
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
   * فيُخفي تحذيرَ التكرار. والسؤالُ لا يتكرّر لما سُئل عنه (`asked`).
   * وكلُّ جوابٍ **مفتاحُه العمليةُ والعيادةُ التي فُحص فيها** (`key`): عيادةٌ تبدّلت والصفحةُ مفتوحة
   * تجعل الأجوبةَ القديمة غائبة فيُعاد السؤال و«ارفعها» مقفولة — كانت تُحفظ بالعملية وحدها، فيُرفع
   * بعيادةٍ جديدة ما فُحص بغيرها. و«ارفعها» تمرّر العيادةَ التي رُسمت بها (outboxReviveOne). */
  const here = currentClinic();
  const key = (op: OutboxOp) => `${op.id}|${here}`;
  const mounted = useRef(true);
  const asked = useRef(new Set<string>());
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    mounted.current = true;
    const pend = pendingIds();
    for (const op of [...lists.review, ...lists.rejected, ...lists.others]) {
      const k = key(op);
      if (!traceable(op)) continue;
      // لا تُعرف عيادتُها: كلُّ ما تشير إليه لازم تراه هذه العيادة، وإلا فليست لها.
      const want = ownerState(op) === "unknown" ? refsOf(op) : [];
      const gate = refsGate(want, pend);
      if (gate === "pending") {
        // أبوها بالقائمة نفسِها لم يُرفع بعد: يُرفع ذاك أوّلاً — ويُعاد السؤالُ مع كلّ تغيّرٍ بالقوائم.
        setRefs((m) => (m[k]?.state === "pending" ? m : { ...m, [k]: { state: "pending" } }));
      } else if (gate === "ask" && !asked.current.has(`r:${k}`)) {
        asked.current.add(`r:${k}`);
        setRefs((m) => ({ ...m, [k]: { state: "checking" } }));
        void Promise.all(want.map((w) => repo.countVisible(w.table, w.ids).then((n) => n === w.ids.length))).then(
          (ok) => { if (mounted.current) setRefs((m) => ({ ...m, [k]: { state: ok.every(Boolean) ? "ok" : "foreign" } })); },
          () => { if (mounted.current) setRefs((m) => ({ ...m, [k]: { state: "failed" } })); },
        );
      }
      if (!needsCheck(op) || asked.current.has(`c:${k}`)) continue;
      asked.current.add(`c:${k}`);
      if (isReturn(op)) {
        setTraces((m) => ({ ...m, [k]: { state: "checking" } }));
        const span = traceSpan(op, new Date().toISOString());
        const b = traceBounds(span);
        const done = (tr: Trace) => { if (mounted.current) setTraces((m) => ({ ...m, [k]: tr })); };
        if (!b) { done({ state: "failed" }); continue; }
        void repo.listReturnRows(b.from, b.to).then((all) => {
          const rows = matchReturnRows(all, span, opSummary(op).returnLines);
          const moments = [op.queued_at, ...(op.attempts ?? []), ...(op.reviewed_at ? [op.reviewed_at] : [])];
          done(rows.length
            ? { state: traceVerdict(rows, returnIsDistinctive(op.kind === "rpc" ? op.args : {}), moments), at: rows[0].spent_at, desc: rows[0].description ?? "", ids: rows.map((r) => r.id) }
            : { state: "none" });
        }, () => done({ state: "failed" }));
        continue;
      }
      // إدخالُ اليوم: يومُه بالخادم — مقارنةً بوقت كتابته (updated_at بالحمولة).
      const row = (op.kind === "insert" ? op.row : {}) as Record<string, unknown>;
      const cycle = str(row.cycle_id), on = str(row.on_date), mine = Date.parse(String(row.updated_at ?? op.queued_at));
      const done = (d: DayCheck) => { if (mounted.current) setDays((m) => ({ ...m, [k]: d })); };
      if (!cycle || !on) { done({ state: "failed" }); continue; }
      setDays((m) => ({ ...m, [k]: { state: "checking" } }));
      void repo.listPoultryDaily(cycle).then((list) => {
        const srv = list.find((d) => d.on_date === on);
        if (!srv) { done({ state: "none" }); return; }
        const at = srv.updated_at ?? srv.created_at;
        // وقتٌ لا يُقرأ يُعامَل «أحدث»: الأسلمُ ألّا يُدهس ما بالخادم بلا مقارنة.
        done({ state: Date.parse(at) < mine ? "older" : "newer", at, dead: srv.dead ?? null, culled: srv.culled ?? null });
      }, () => done({ state: "failed" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, here]);

  const why = (r: ShelfResult) => (r.ok ? null
    : r.reason === "no_session" ? t("obx.noSession")
    : r.reason === "missing" ? t("obx.missing")
    : r.reason === "other_owner" ? t("obx.otherOwner")
    : r.reason === "unconfirmed" ? t("obx.unconfirmed")
    : t("obx.storage"));
  const send = async (op: OutboxOp) => {
    playTap();
    const r = outboxReviveOne(op.id, op, here);
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
        {s.dead != null && <div className="tabular-nums">{t("obx.deadCulled", { d: formatNum(s.dead), c: formatNum(s.culled ?? 0) })}</div>}
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
    // لم يُجب الخادمُ بعد (أو لم يُسأل بعد — أوّلُ رسم): لا رفعَ قبل الجواب (قد يكون وصل، أو أُعيد إدخالُه).
    const st = (isReturn(op) ? traces[key(op)] : days[key(op)])?.state;
    // وما لا تُعرف عيادتُه: لا رفعَ حتى يثبت أن ما يشير إليه بهذه العيادة (لا بأوّل رسم ولا بتعذّر السؤال).
    const foreignRisk = ownerState(op) === "unknown" && refsOf(op).length > 0 && refs[key(op)]?.state !== "ok";
    const waiting = (needsCheck(op) && (!st || st === "checking")) || foreignRisk;
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
  const warn = "mt-2 rounded-lg bg-warn-50 px-2 py-1.5 text-xs font-semibold text-warn-700 dark:bg-warn-500/10 dark:text-warn-200";
  const traceLine = (op: OutboxOp) => {
    const tr = traces[key(op)];
    if (!tr) return dayLine(op);
    if (tr.state === "found" || tr.state === "similar") {
      const shared = sharesServerRow(traces, key(op));
      return (
        <div data-obx-trace={tr.state}>
          <p className={warn}>{t(tr.state === "found" ? "obx.traceFound" : "obx.traceSimilar", { when: when(tr.at), desc: tr.desc })}</p>
          {shared && <p className="mt-1 text-2xs font-semibold text-danger-700 dark:text-danger-300" data-obx-trace-shared>{t("obx.traceShared")}</p>}
        </div>
      );
    }
    const msg = tr.state === "checking" ? "obx.traceChecking" : tr.state === "none" ? "obx.traceNone" : "obx.traceFailed";
    return <p className="mt-2 text-2xs text-ink-subtle" data-obx-trace={tr.state}>{t(msg)}</p>;
  };
  const refsLine = (op: OutboxOp) => {
    const r = refs[key(op)];
    if (!r || r.state === "ok") return null;
    if (r.state === "pending") return <p className={warn} data-obx-refs="pending">{t("obx.refsPending")}</p>;
    if (r.state === "foreign") return <p className="mt-2 rounded-lg bg-danger-50 px-2 py-1.5 text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-obx-refs="foreign">{t("obx.refsForeign")}</p>;
    return <p className="mt-2 text-2xs text-ink-subtle" data-obx-refs={r.state}>{t(r.state === "checking" ? "obx.refsChecking" : "obx.refsFailed")}</p>;
  };
  const dayLine = (op: OutboxOp) => {
    const d = days[key(op)];
    if (!d) return null;
    if (d.state === "older" || d.state === "newer") {
      const vals = t("obx.deadCulled", { d: formatNum(d.dead ?? 0), c: formatNum(d.culled ?? 0) });
      return <p className={d.state === "newer" ? warn : "mt-2 text-xs text-ink-muted"} data-obx-day={d.state}>{t(d.state === "newer" ? "obx.dayNewer" : "obx.dayOlder", { when: when(d.at), vals })}</p>;
    }
    const msg = d.state === "checking" ? "obx.dayChecking" : d.state === "none" ? "obx.dayNone" : "obx.dayFailed";
    return <p className="mt-2 text-2xs text-ink-subtle" data-obx-day={d.state}>{t(msg)}</p>;
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
                /* أربعُ حالات: بلا ختم (نسخةٌ أقدم)، أو بلا عيادةٍ مؤكَّدة — تُرفع على العيادة الحاليّة؛
                 * ومتقادمةٌ للداخل (يُقال لماذا وُقفت)؛ ولحسابٍ آخر — «ارفعها» كانت تُعرض عليها فتُركن باسمه. */
                const owner = ownerState(op);
                const other = owner === "other";
                const why = owner === "unknown" ? (op.who ? "obx.clinicUnknown" : "obx.originUnknown") : other ? "obx.otherOwner" : "obx.staleNote";
                return (
                  <li key={op.id} className="rounded-xl border border-line bg-surface-1 p-3" data-obx-item={op.id}>
                    {head(op)}
                    {details(op)}
                    <p className="mt-1 text-2xs text-ink-subtle" data-obx-why>{t(why)}</p>
                    {refsLine(op)}
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
                  {refsLine(op)}
                  {traceLine(op)}
                  {/* مختومةٌ بحسابٍ آخر: «أعد المحاولة» كانت تركنها باسمه وتقول «ترتفع هسه» — لها الحذفُ وحده. */}
                  {ownerState(op) !== "mine" && <p className="mt-1 text-2xs text-ink-subtle" data-obx-other-owner>{t("obx.otherOwner")}</p>}
                  {actions(op, ownerState(op) === "mine" ? t("obx.retry") : null)}
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
                  {refsLine(op)}
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
