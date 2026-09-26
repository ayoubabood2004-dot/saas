import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ClipboardCheck, Hourglass, Lock, PackageSearch, RotateCw, Search, TrendingDown, X } from "lucide-react";
import type { CountReason, Product, StockCount as CountRow, StockLossRow } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Dialog, Segmented, Skeleton, useToast } from "@/components/ui";
import { cn, formatNum, formatQty, money, normalizeCode, searchable } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { getCountDailyN, setCountDailyN } from "@/lib/settings";
import { pickToday, reasonsFor, diffValue, deadStock, abcClasses, countable, WITHDRAWAL_REASONS, type CountPick, type CountState } from "@/lib/countPick";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * الجردُ الدوريّ — م٦ (docs/inventory-vnext-plan.md، هجرة 0216).
 *
 * ثلاثُ شاشاتٍ بصفحةٍ واحدة:
 *   • **عدّ اليوم**: N مادةً مختارةً بـ`countPick.ts` (الغالي المتحرّك، الأقدمُ عدّاً،
 *     المشكوك) مع بحثٍ لإضافة غيرها. رصيدُ النظام **لا يُعرض قبل العدّ** — العادُّ
 *     الذي يرى الرقمَ يميل له. بعد الكتابة يظهر الفرقُ ويُطلب سببُه.
 *   • **بانتظار الموافقة**: الفرقُ لا يمسّ الرصيد حتى يوافق المدير (قرارُ المالك).
 *     الموافقةُ تقول قبل التنفيذ كم يُسجَّل سحباً «من المخزن» وبأيّ سبب.
 *   • **وين راحت الفلوس**: الخسائرُ بأسبابها (من `report_stock_losses`)، والراكدُ
 *     ٩٠ يوماً، وABC.
 * ========================================================================= */

type Tab = "today" | "pending" | "report";
type Range = "month" | "last" | "d90";
interface Line { counted: string; reason: CountReason | null; note: string }

const DAYS = 90;

/** رفضُ الجرد برمزه (`count_reason`…): الخادمُ يسمّي المادةَ بـhint عربيّ فيُعرض كما هو
 *  بالعربية، والمرآةُ التجريبيةُ رمزٌ وحده — فيُترجم هنا من نطاق الصفحة. */
function countError(e: unknown, t: TFunction, lang: string): string {
  const code = /^count_(\w+)$/.exec(e instanceof Error ? e.message : "")?.[1];
  const hint = (e as { hint?: string } | null)?.hint;
  if (code && (!hint || !lang.startsWith("ar")) && i18next.exists(`cnt.err.${code}`)) return t(`cnt.err.${code}`);
  return describeDbError(e, t);
}

function rangeOf(r: Range, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear(), m = now.getMonth();
  if (r === "month") return { from: new Date(y, m, 1).toISOString(), to: new Date(y, m + 1, 1).toISOString() };
  if (r === "last") return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
  return { from: new Date(now.getTime() - 90 * 86_400_000).toISOString(), to: new Date(now.getTime() + 60_000).toISOString() };
}

export function StockCount() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { can, role } = usePermissions();
  const { restricted } = useOverride();
  const isManager = role === "manager";
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<{ products: Product[]; sold: Map<string, number>; state: Map<string, CountState>; pending: CountRow[] } | "loading" | "error">("loading");
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState(getCountDailyN);

  const load = useCallback(async () => {
    setData("loading");
    try {
      const [products, sold, state, pending] = await Promise.all([
        repo.listProducts(), repo.productSalesRate(DAYS), repo.stockCountState(), repo.listStockCounts({ pending: true }),
      ]);
      setData({ products, sold, state, pending });
    } catch { setData("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ready = typeof data === "object" ? data : null;
  const pendingIds = useMemo(() => new Set((ready?.pending ?? []).map((c) => c.product_id ?? "")), [ready]);
  const picks = useMemo<CountPick[]>(() => (ready ? pickToday(ready.products, ready.sold, ready.state, n, new Date(), pendingIds) : []), [ready, n, pendingIds]);
  const byId = useMemo(() => new Map((ready?.products ?? []).map((p) => [p.id, p])), [ready]);
  const shown = useMemo(() => {
    const ids = new Set(picks.map((p) => p.product.id));
    return [...picks.map((p) => ({ product: p.product, pick: p as CountPick | null })),
      ...extra.filter((id) => !ids.has(id) && byId.has(id)).map((id) => ({ product: byId.get(id)!, pick: null }))];
  }, [picks, extra, byId]);

  const results = useMemo(() => {
    const s = searchable(q.trim()), hasCode = normalizeCode(q) !== "";
    if (!ready || s.length < 2) return [];
    // الطرفان من نفس الدالّة (CLAUDE.md): الباركودُ الممسوح والمخزَّن كلاهما يمرّ بـnormalizeCode.
    return ready.products.filter((p) => countable(p) && !pendingIds.has(p.id)
      && (searchable(p.name).includes(s) || (hasCode && [p.barcode, ...(p.alt_codes ?? [])].some((a) => normalizeCode(a) === normalizeCode(q)))))
      .slice(0, 8);
  }, [q, ready, pendingIds]);

  if (!can("manageInventory")) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("cnt.noAccess", "الجرد لمن عنده صلاحية إدارة المخزن. راجع مدير العيادة.")}</p>
      </div>
    );
  }

  const lineOf = (id: string): Line => lines[id] ?? { counted: "", reason: null, note: "" };
  const setLine = (id: string, patch: Partial<Line>) => setLines((m) => ({ ...m, [id]: { ...lineOf(id), ...patch } }));
  const entered = shown.filter(({ product }) => lineOf(product.id).counted.trim() !== "");

  const submit = async () => {
    const payload = [];
    for (const { product } of entered) {
      const l = lineOf(product.id);
      const counted = Number(l.counted);
      if (!Number.isFinite(counted) || counted < 0) { playWarning(); toast.error(t("cnt.badQty", { name: product.name, defaultValue: "«{{name}}»: العدد لازم يكون صفر أو أكثر" })); return; }
      const diff = counted - (Number(product.stock) || 0);
      if (diff !== 0 && (!l.reason || !reasonsFor(diff).includes(l.reason))) {
        playWarning(); toast.error(t("cnt.needReason", { name: product.name, defaultValue: "«{{name}}» بيها فرق — اختر السبب" })); return;
      }
      payload.push({ product_id: product.id, counted, reason: diff === 0 ? null : l.reason, note: l.note.trim() || null });
    }
    if (!payload.length) return;
    setBusy(true);
    try {
      const r = await repo.submitStockCount(payload);
      playSuccess();
      toast.success(t("cnt.saved", { m: formatNum(r.matched), p: formatNum(r.pending), defaultValue: "انسجل العدّ: {{m}} مطابقة، و{{p}} بيها فرق تنتظر موافقة المدير" }));
      setLines({}); setExtra([]); setQ("");
      await load();
    } catch (e) {
      playWarning(); toast.error(countError(e, t, i18n.language));
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/inventory" className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted hover:text-ink" aria-label={t("cnt.back", "رجوع للمخزون")}>
          <ArrowRight size={18} className="ltr:rotate-180" />
        </Link>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ClipboardCheck size={24} /></span>
        <div className="me-auto min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("cnt.title", "الجرد اليومي")}</h1>
          <p className="text-sm text-ink-subtle">{t("cnt.sub", "عدّ كم مادة كل يوم — والفرق ما يتغيّر بالرصيد إلا بموافقة المدير")}</p>
        </div>
      </div>

      <Segmented<Tab> layoutId="cnt-tab" value={tab} onChange={(v) => { playTap(); setTab(v); }} className="mb-4"
        options={[
          { value: "today", label: t("cnt.tabToday", "عدّ اليوم"), icon: <ClipboardCheck size={14} /> },
          { value: "pending", label: t("cnt.tabPending", { n: formatNum(ready?.pending.length ?? 0), defaultValue: "تنتظر موافقة ({{n}})" }), icon: <Hourglass size={14} /> },
          { value: "report", label: t("cnt.tabReport", "وين راحت الفلوس"), icon: <TrendingDown size={14} /> },
        ]} />

      {data === "loading" ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
      ) : data === "error" ? (
        <div className="card space-y-3 p-8 text-center">
          <p className="text-sm text-ink-muted">{t("cnt.loadFailed", "ما كدرنا نجيب بيانات الجرد — المشكلة بالاتصال ولا شي ضاع.")}</p>
          <Button leftIcon={<RotateCw size={16} />} onClick={() => { playTap(); void load(); }}>{t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : tab === "today" ? (
        <div className="space-y-3" data-count-today>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
            <span>{t("cnt.todayHint", "هاي المواد مختارة لك اليوم: الغالية الي تنباع هواية، والي صارلها مدة ما انعدّت، والي طلع بيها فرق قبل. عدّها بالرف واكتب العدد.")}</span>
            {isManager && (
              <label className="ms-auto flex items-center gap-1 font-semibold">
                {t("cnt.perDay", "مواد باليوم")}
                <select className="input h-8 w-20 py-0 text-sm" value={n} data-count-n
                  onChange={(e) => { const v = Number(e.target.value); setN(v); setCountDailyN(v); }}>
                  {[3, 5, 10, 15, 20, 30].map((v) => <option key={v} value={v}>{formatNum(v)}</option>)}
                </select>
              </label>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="card p-6 text-center text-sm text-ink-subtle" data-count-empty>{t("cnt.nothingToday", "ماكو مواد مقترحة اليوم — كلها انعدّت بوقتها. تكدر تضيف مادة بالبحث.")}</p>
          ) : (
            <ul className="space-y-2">
              {shown.map(({ product: p, pick }) => {
                const l = lineOf(p.id);
                const has = l.counted.trim() !== "" && Number.isFinite(Number(l.counted));
                const sys = Number(p.stock) || 0;
                const diff = has ? Number(l.counted) - sys : 0;
                const opts = reasonsFor(diff);
                return (
                  <li key={p.id} className={cn("card p-3", has && diff !== 0 && "border-warn-300 dark:border-warn-500/40")} data-count-line>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {(pick?.why ?? []).map((w) => (
                            <span key={w} className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">
                              {w === "stale" ? t("cnt.why.stale", { d: formatNum(pick?.daysSince ?? 0), defaultValue: "صارلها {{d}} يوم ما انعدّت" }) : t(`cnt.why.${w}`)}
                            </span>
                          ))}
                          {!pick && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">{t("cnt.why.added", "أضفتها بالبحث")}</span>}
                        </div>
                      </div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
                        {t("cnt.counted", "لقيت")}
                        <input type="number" inputMode="decimal" min={0} step="any" className="input h-10 w-24 text-center tabular-nums" data-count-input
                          value={l.counted} onChange={(e) => setLine(p.id, { counted: e.target.value })} />
                      </label>
                    </div>
                    {has && (
                      diff === 0 ? (
                        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-success-700 dark:text-success-300"><Check size={14} /> {t("cnt.match", "مطابق للنظام")}</p>
                      ) : (
                        <div className="mt-2 space-y-2 rounded-xl bg-warn-50/70 p-2.5 dark:bg-warn-500/10" data-count-diff>
                          <p className="text-xs font-bold text-warn-800 dark:text-warn-200">
                            {t("cnt.diffLine", { sys: formatQty(sys), diff: `${diff > 0 ? "+" : "−"}${formatQty(Math.abs(diff))}`, defaultValue: "النظام يگول {{sys}} — الفرق {{diff}}" })}
                            {!restricted && p.purchase_price > 0 && <> · {money(Math.abs(diffValue(sys, Number(l.counted), p.purchase_price)))}</>}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {opts.map((r) => (
                              <button key={r} type="button" aria-pressed={l.reason === r} data-count-reason={r}
                                onClick={() => { playTap(); setLine(p.id, { reason: r }); }}
                                className={cn("rounded-full px-3 py-1 text-xs font-bold transition",
                                  l.reason === r ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted hover:text-ink")}>
                                {t(`cnt.reason.${r}`)}
                              </button>
                            ))}
                          </div>
                          <input className="input h-9 text-sm" maxLength={200} placeholder={t("cnt.notePh", "ملاحظة (اختياري): شنو صار؟")}
                            value={l.note} onChange={(e) => setLine(p.id, { note: e.target.value })} />
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="card p-3">
            <label className="flex items-center gap-2">
              <Search size={16} className="text-ink-subtle" />
              <input className="input h-10 flex-1" value={q} onChange={(e) => setQ(e.target.value)} data-count-search
                placeholder={t("cnt.searchPh", "تريد تعدّ مادة ثانية؟ ابحث بالاسم أو امسح الباركود")} />
            </label>
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-line/60">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center gap-2 py-2 text-start text-sm hover:text-brand-700" data-count-add
                      onClick={() => { playTap(); setExtra((x) => (x.includes(p.id) ? x : [...x, p.id])); setQ(""); }}>
                      <PackageSearch size={14} className="text-ink-subtle" /> {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Button size="lg" loading={busy} disabled={entered.length === 0} leftIcon={<Check size={18} />} onClick={() => void submit()} data-count-submit>
              {t("cnt.submit", { n: formatNum(entered.length), defaultValue: "سجّل العدّ ({{n}})" })}
            </Button>
          </div>
        </div>
      ) : tab === "pending" ? (
        <PendingTab rows={ready!.pending} isManager={isManager} restricted={restricted} onChanged={load} />
      ) : (
        <ReportTab products={ready!.products} sold={ready!.sold} restricted={restricted} />
      )}
    </div>
  );
}

function PendingTab({ rows, isManager, restricted, onChanged }: { rows: CountRow[]; isManager: boolean; restricted: boolean; onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked(new Set(rows.map((r) => r.id))); }, [rows]);

  const chosen = rows.filter((r) => picked.has(r.id));
  const byReason = useMemo(() => {
    const m = new Map<CountReason, { value: number; items: string[] }>();
    for (const r of chosen) {
      if (!r.reason || !WITHDRAWAL_REASONS.includes(r.reason) || r.counted_qty >= r.system_qty) continue;
      const g = m.get(r.reason) ?? { value: 0, items: [] };
      g.value += diffValue(r.system_qty, r.counted_qty, r.unit_cost);
      g.items.push(`${r.product_name} ×${formatQty(r.system_qty - r.counted_qty)}`);
      m.set(r.reason, g);
    }
    return m;
  }, [chosen]);
  const withdrawTotal = [...byReason.values()].reduce((s, g) => s + g.value, 0);
  const corrections = chosen.filter((r) => r.reason === "entry_error" || r.reason === "found").length;

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      const r = await repo.decideStockCounts(chosen.map((c) => c.id), approve);
      playSuccess();
      toast.success(approve
        ? t("cnt.approved", { n: formatNum(r.approved), v: money(r.withdrawals.reduce((s, w) => s + w.amount, 0)), defaultValue: "انعتمد {{n}} — وانسجل سحب من المخزن بقيمة {{v}}" })
        : t("cnt.rejected", { n: formatNum(r.rejected), defaultValue: "انرفض {{n}} — الرصيد ما تغيّر" }));
      setConfirm(null);
      await onChanged();
    } catch (e) {
      playWarning(); toast.error(countError(e, t, i18n.language));
    } finally { setBusy(false); }
  };

  if (!rows.length) return <p className="card p-6 text-center text-sm text-ink-subtle" data-pending-empty>{t("cnt.noPending", "ماكو فروق تنتظر موافقة.")}</p>;

  return (
    <div className="space-y-3" data-pending>
      {!isManager && (
        <p className="rounded-xl bg-surface-2 p-3 text-xs font-semibold text-ink-muted">{t("cnt.managerOnly", "الموافقة للمدير وحده — الرصيد ما يتغيّر لحد ما يوافق. (افتح وضع المدير إذا إنت المدير)")}</p>
      )}
      <ul className="space-y-2">
        {rows.map((r) => {
          const diff = r.counted_qty - r.system_qty;
          return (
            <li key={r.id} className="card flex items-start gap-3 p-3" data-pending-row>
              {isManager && (
                <input type="checkbox" className="mt-1 h-4 w-4" checked={picked.has(r.id)} aria-label={r.product_name}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{r.product_name}</p>
                <p className="text-xs text-ink-muted tabular-nums">
                  {t("cnt.pendingLine", { sys: formatQty(r.system_qty), got: formatQty(r.counted_qty), diff: `${diff > 0 ? "+" : "−"}${formatQty(Math.abs(diff))}`, defaultValue: "النظام {{sys}} ← لقينا {{got}} ({{diff}})" })}
                  {!restricted && r.unit_cost > 0 && <> · {money(Math.abs(diffValue(r.system_qty, r.counted_qty, r.unit_cost)))}</>}
                </p>
                <p className="text-2xs text-ink-subtle">
                  {r.reason ? t(`cnt.reason.${r.reason}`) : ""}
                  {r.note ? ` · ${r.note}` : ""}
                  {" · "}{t("cnt.by", { who: r.counted_by_name || t("cnt.someone", "موظف"), defaultValue: "عدّها {{who}}" })}
                  {" · "}<span dir="ltr">{new Date(r.counted_at).toLocaleString()}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {isManager && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={!chosen.length} leftIcon={<X size={16} />} onClick={() => { playTap(); setConfirm("reject"); }} data-pending-reject>
            {t("cnt.reject", { n: formatNum(chosen.length), defaultValue: "ارفض المختار ({{n}})" })}
          </Button>
          <Button disabled={!chosen.length} leftIcon={<Check size={16} />} onClick={() => { playTap(); setConfirm("approve"); }} data-pending-approve>
            {t("cnt.approve", { n: formatNum(chosen.length), defaultValue: "وافق على المختار ({{n}})" })}
          </Button>
        </div>
      )}
      <Dialog open={confirm !== null} onClose={() => !busy && setConfirm(null)}
        title={confirm === "approve" ? t("cnt.confirmApproveTitle", "تأكيد الموافقة") : t("cnt.confirmRejectTitle", "تأكيد الرفض")}
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>{t("common.cancel", "إلغاء")}</Button>
          <Button loading={busy} variant={confirm === "reject" ? "danger" : "primary"} onClick={() => void decide(confirm === "approve")} data-pending-go>
            {confirm === "approve" ? t("cnt.approveGo", "وافق وسجّل") : t("cnt.rejectGo", "ارفض")}
          </Button>
        </div>}>
        {confirm === "approve" ? (
          <div className="space-y-3 text-sm" data-confirm-approve>
            <p>{t("cnt.confirmApprove", { n: formatNum(chosen.length), defaultValue: "راح يتصحّح رصيد {{n}} مادة بالفرق الي انعدّ (مو بالرقم — الي انباع بعد العدّ يبقى مبيوع)." })}</p>
            {withdrawTotal > 0 ? (
              <div className="rounded-xl bg-warn-50/70 p-3 dark:bg-warn-500/10">
                <p className="font-bold text-warn-800 dark:text-warn-200">{t("cnt.willWithdraw", { v: money(withdrawTotal), defaultValue: "وينسجل سحب من المخزن اليوم بقيمة {{v}} (بسعر الشراء، ما يطلع من القاصة):" })}</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {[...byReason.entries()].map(([reason, g]) => (
                    <li key={reason}><b>{t(`cnt.reason.${reason}`)}</b> — {money(g.value)}: {g.items.join("، ")}</li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-xs text-ink-subtle">{t("cnt.noWithdraw", "ما راح ينسجل سحب — الفروق المختارة تصحيح رصيد بس.")}</p>}
            {corrections > 0 && <p className="text-xs text-ink-subtle">{t("cnt.corrections", { n: formatNum(corrections), defaultValue: "و{{n}} تصحيح (خطأ إدخال / زيادة) بلا سحب." })}</p>}
          </div>
        ) : (
          <p className="text-sm">{t("cnt.confirmReject", { n: formatNum(chosen.length), defaultValue: "راح ينرفض {{n}} عدّ والرصيد يبقى مثل ما هو. العادّ يكدر يعدّها مرة ثانية." })}</p>
        )}
      </Dialog>
    </div>
  );
}

function ReportTab({ products, sold, restricted }: { products: Product[]; sold: Map<string, number>; restricted: boolean }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("month");
  const [res, setRes] = useState<{ losses: StockLossRow[]; lines: CountRow[] } | "loading" | "error">("loading");
  const load = useCallback(async () => {
    setRes("loading");
    try {
      const r = rangeOf(range);
      const [losses, lines] = await Promise.all([repo.reportStockLosses(r.from, r.to), repo.listStockCounts(r)]);
      setRes({ losses, lines });
    } catch { setRes("error"); }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const dead = useMemo(() => deadStock(products, sold), [products, sold]);
  const deadValue = dead.reduce((s, d) => s + d.value, 0);
  const abc = useMemo(() => {
    const cls = abcClasses(products.filter(countable), sold);
    const out = { A: 0, B: 0, C: 0 };
    for (const c of cls.values()) out[c]++;
    return out;
  }, [products, sold]);

  if (restricted) return <p className="card p-6 text-center text-sm text-ink-subtle">{t("cnt.restricted", "المبالغ مقفولة على هذا الجهاز — افتح وضع المدير.")}</p>;

  const lossOf = (r: CountReason) => (typeof res === "object" ? res.losses.find((x) => x.reason === r) : undefined);
  const lossTotal = WITHDRAWAL_REASONS.reduce((s, r) => s + (lossOf(r)?.value ?? 0), 0);

  return (
    <div className="space-y-4" data-report>
      <Segmented<Range> layoutId="cnt-range" size="sm" value={range} onChange={(v) => { playTap(); setRange(v); }}
        options={[
          { value: "month", label: t("cnt.rangeMonth", "هذا الشهر") },
          { value: "last", label: t("cnt.rangeLast", "الشهر الماضي") },
          { value: "d90", label: t("cnt.range90", "آخر ٩٠ يوم") },
        ]} />
      {res === "loading" ? <Skeleton className="h-32 w-full rounded-2xl" />
        : res === "error" ? (
          <div className="card space-y-3 p-6 text-center">
            <p className="text-sm text-ink-muted">{t("cnt.reportFailed", "ما كدرنا نجيب الخسائر — ما نعرض رقم ناقص.")}</p>
            <Button size="sm" variant="secondary" leftIcon={<RotateCw size={14} />} onClick={() => void load()}>{t("common.retry", "أعد المحاولة")}</Button>
          </div>
        ) : (
          <>
            <section className="card p-4" data-report-losses>
              <p className="text-xs font-semibold text-ink-muted">{t("cnt.lossTotal", "خسائر المخزن (سحب من المخزن)")}</p>
              <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-warn-800 dark:text-warn-200">{money(lossTotal)}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {WITHDRAWAL_REASONS.map((r) => (
                  <div key={r} className="rounded-xl bg-surface-2 p-3">
                    <p className="text-2xs font-semibold text-ink-muted">{t(`cnt.reason.${r}`)}</p>
                    <p className="font-display text-lg font-extrabold tabular-nums text-ink">{money(lossOf(r)?.value ?? 0)}</p>
                    <p className="text-2xs text-ink-subtle">{t("cnt.lines", { n: formatNum(lossOf(r)?.lines ?? 0), defaultValue: "{{n}} سطر" })}</p>
                  </div>
                ))}
              </div>
              {(lossOf("entry_error") || lossOf("found")) && (
                <p className="mt-3 text-xs text-ink-subtle">
                  {t("cnt.correctionsSum", { e: formatNum(lossOf("entry_error")?.lines ?? 0), f: formatNum(lossOf("found")?.lines ?? 0), defaultValue: "وتصحيحات بلا سحب: {{e}} خطأ إدخال، و{{f}} زيادة لقيناها." })}
                </p>
              )}
              {res.lines.length > 0 && (
                <ul className="mt-3 divide-y divide-line/60 text-xs">
                  {res.lines.map((c) => (
                    <li key={c.id} className="flex flex-wrap gap-2 py-1.5">
                      <span className="font-bold text-ink">{c.product_name}</span>
                      <span className="text-ink-muted">{c.reason ? t(`cnt.reason.${c.reason}`) : ""} {`${(c.applied_delta ?? 0) > 0 ? "+" : "−"}${formatQty(Math.abs(c.applied_delta ?? 0))}`}</span>
                      {c.unit_cost > 0 && <span className="tabular-nums text-ink-muted">{money(Math.abs((c.applied_delta ?? 0) * c.unit_cost))}</span>}
                      <span className="ms-auto text-ink-subtle">{t("cnt.approvedBy", { who: c.decided_by_name || t("cnt.someone", "موظف"), defaultValue: "وافق {{who}}" })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

      <section className="card p-4" data-report-dead>
        <p className="text-xs font-semibold text-ink-muted">{t("cnt.deadTitle", "فلوس واگفة: مواد ما انباعت ٩٠ يوم")}</p>
        <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-ink">{money(deadValue)}</p>
        <p className="text-2xs text-ink-subtle">{t("cnt.deadCount", { n: formatNum(dead.length), defaultValue: "{{n}} مادة — بسعر الشراء" })}</p>
        {dead.length > 0 && (
          <ul className="mt-2 divide-y divide-line/60 text-xs">
            {dead.slice(0, 15).map((d) => (
              <li key={d.product.id} className="flex gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{d.product.name}</span>
                <span className="tabular-nums text-ink-muted">{formatQty(Number(d.product.stock) || 0)}</span>
                <span className="w-24 text-end tabular-nums text-ink">{money(d.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4" data-report-abc>
        <p className="text-xs font-semibold text-ink-muted">{t("cnt.abcTitle", "وين فلوسك بالمخزن (حسب مبيع ٩٠ يوم)")}</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {(["A", "B", "C"] as const).map((c) => (
            <div key={c} className="rounded-xl bg-surface-2 p-3">
              <p className="font-display text-xl font-extrabold tabular-nums text-ink">{formatNum(abc[c])}</p>
              <p className="text-2xs text-ink-subtle">{t(`cnt.abc.${c}`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
