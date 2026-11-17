/* ============================================================================
 * المنتجاتُ المربوطة (0277) — تبويبٌ بالمخزن بنطاقه المملوك `pgrp` (النصفُ البارد على سقفه): Inventory.tsx يحمّله بـpage(…, ["pgrp"])
 * ولا يستورده ثابتاً. طلبُ المالك (١٧/١١): قائمةٌ يرى فيها كلَّ مجموعةٍ بأعضائها، ويربط ويفكّ بسهولة، وسعرٌ واحدٌ يتغيّر للكل.
 *
 *  • كلُّ مجموعةٍ بطاقة: سعرُها الواحد فوق، وأعضاؤها معلّقون تحته بخطٍّ واحد — السعرُ للكلّ يُرى قبل الأسماء.
 *  • كلُّ كتابةٍ نداءٌ واحدٌ ذرّيّ (productGroupsApi) بشرط ما تراه الشاشة (`seenOf`): رفضُه يُقال والقائمةُ تُجلب من جديد.
 *  • الفكُّ لا يحذف ولا يغيّر سعراً: المادّةُ تبقى بالمخزن — ولهذا بلا سؤال، و«فكّ المجموعة» كلُّها يُسأل بجملةٍ تقول ما يحدث.
 * ========================================================================= */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Link2, Pencil, Plus, Search, Unlink, X } from "lucide-react";
import type { Company, CompanySection, Product } from "@/types";
import { Button, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Dialog } from "@/components/ui/Dialog";
import { cn, formatDec, formatNum, money, searchable } from "@/lib/utils";
import { codeMatcher } from "@/lib/productCodes";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { usdPriceText } from "@/lib/usdProduct";
import {
  buildGroups, commonPrice, currencyOf, distinctPrices, groupKeyOf, linkBlock, priceInput, pricesOf, seenOf,
  type GroupCurrency, type ProductGroup,
} from "@/lib/productGroups";

const api = () => import("@/lib/productGroupsApi");
const fmtOf = (cur: GroupCurrency | "mixed") => (n: number | null): string => (n == null ? "—" : cur === "USD" ? usdPriceText(n) : money(n));
const SHOWN = 60;

export function ProductGroups({ products, companies, sections, canEdit, focusKey, onChanged }: {
  products: Product[]; companies: Company[]; sections: CompanySection[];
  /** المدير والطبيب بجهازٍ غير مقفول — غيرُهما يرى القائمةَ بلا أزرار. */
  canEdit: boolean;
  /** مجموعةٌ فُتح التبويبُ عليها (شارة «مجموعة» بقائمة المخزن). */
  focusKey?: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [ready, setReady] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [linking, setLinking] = useState<{ target: ProductGroup | null } | null>(null);
  const [pricing, setPricing] = useState<ProductGroup | null>(null);
  const [dissolving, setDissolving] = useState<ProductGroup | null>(null);
  const [sel, setSel] = useState<{ key: string; ids: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api().then((m) => m.productGroupsReady()).then((r) => { if (live) setReady(r); }, () => { if (live) setReady(false); });
    return () => { live = false; };
  }, []);

  const groups = useMemo(() => buildGroups(products), [products]);
  const coName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const secName = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);
  const shown = useMemo(() => {
    const s = searchable(dq.trim());
    if (!s) return groups;
    const byCode = codeMatcher(dq);
    return groups.filter((g) => searchable(g.title).includes(s)
      || g.members.some((m) => searchable(m.name).includes(s) || byCode(m))
      || (g.companyId != null && searchable(coName.get(g.companyId) ?? "").includes(s)));
  }, [groups, dq, coName]);
  const memberCount = useMemo(() => groups.reduce((n, g) => n + g.members.length, 0), [groups]);

  // الشارةُ فتحت التبويبَ على مجموعة: تُرى وتومض مرّة.
  useEffect(() => {
    if (!focusKey) return;
    const el = document.querySelector(`[data-pgrp="${CSS.escape(focusKey)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(focusKey);
    const id = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(id);
  }, [focusKey, groups.length]);

  // ما اختير بمجموعةٍ لم تعد بالقائمة (انفكّت، أو حُدّثت) يُنسى — لا «افصل المحدّد» عن أعضاءٍ لا يُرَون.
  useEffect(() => {
    if (!sel) return;
    const g = groups.find((x) => x.key === sel.key);
    const ids = sel.ids.filter((id) => g?.members.some((m) => m.id === id));
    if (ids.length !== sel.ids.length) setSel(ids.length ? { key: sel.key, ids } : null);
  }, [groups, sel]);

  const can = canEdit && ready === true;
  const failed = (e: unknown) => {
    playWarning();
    toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    void api().then((m) => { if (m.isGroupStale(e)) onChanged(); });
  };

  const unlink = async (g: ProductGroup, ids: string[]) => {
    if (busy || !ids.length) return;
    setBusy(g.key);
    try {
      const r = await (await api()).unlinkProducts(g.key, ids);
      playSuccess();
      toast.success(r.dissolved ? t("pgrp.dissolvedDone", { n: g.members.length }) : t("pgrp.unlinked", { n: r.unlinked }));
      setSel(null);
      setDissolving(null);
      onChanged();
    } catch (e) { failed(e); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3" data-pgrp-tab>
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Link2 size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-ink">{t("pgrp.title")}</p>
          <p className="text-xs leading-relaxed text-ink-muted">{t("pgrp.lead")}</p>
        </div>
        {can && (
          <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setLinking({ target: null }); }} data-pgrp-new>
            {t("pgrp.linkNew")}
          </Button>
        )}
      </div>
      {ready === false && <p className="rounded-xl bg-warn-50 p-2.5 text-xs text-warn-800 dark:bg-warn-500/10 dark:text-warn-200" data-pgrp-notready>{t("pgrp.notReady")}</p>}
      {ready && !canEdit && <p className="rounded-xl bg-surface-2 p-2.5 text-xs text-ink-muted">{t("pgrp.ro")}</p>}

      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-60">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pgrp.search")} aria-label={t("pgrp.search")} />
          </label>
          <span className="text-xs font-semibold text-ink-subtle">{t("pgrp.stats", { g: formatNum(groups.length), n: formatNum(memberCount) })}</span>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="card space-y-3 p-8 text-center">
          <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-muted">{t("pgrp.empty")}</p>
          {can && <Button className="mx-auto" leftIcon={<Link2 size={16} />} onClick={() => { playTap(); setLinking({ target: null }); }}>{t("pgrp.linkNew")}</Button>}
        </div>
      ) : shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-subtle">{t("pgrp.noMatch", { q: dq.trim() })}</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((g) => (
            <GroupCard key={g.key} g={g} can={can} busy={busy === g.key} flash={flash === g.key}
              co={g.companyId ? coName.get(g.companyId) ?? null : null} sec={g.sectionId ? secName.get(g.sectionId) ?? null : null}
              picked={sel?.key === g.key ? sel.ids : []}
              onPick={(id) => setSel((s) => {
                const ids = s?.key === g.key ? s.ids : [];
                const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
                return next.length ? { key: g.key, ids: next } : null;
              })}
              onUnlink={(ids) => void unlink(g, ids)}
              onAdd={() => { playTap(); setLinking({ target: g }); }}
              onPrice={() => { playTap(); setPricing(g); }}
              onDissolve={() => { playTap(); setDissolving(g); }} />
          ))}
        </div>
      )}

      {linking && (
        <LinkSheet target={linking.target} products={products} groups={groups} coName={coName}
          onClose={() => setLinking(null)} onFailed={failed}
          onDone={() => { setLinking(null); onChanged(); }} />
      )}
      {pricing && <PriceSheet g={pricing} onClose={() => setPricing(null)} onFailed={failed} onDone={() => { setPricing(null); onChanged(); }} />}
      <Dialog open={!!dissolving} onClose={() => setDissolving(null)} size="sm"
        title={dissolving ? t("pgrp.dissolveQ", { n: formatNum(dissolving.members.length) }) : ""}
        description={t("pgrp.dissolveHow")}
        footer={dissolving && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setDissolving(null)}>{t("pgrp.keep")}</Button>
            <Button variant="danger" loading={busy === dissolving.key} leftIcon={<Unlink size={16} />} data-pgrp-dissolve-yes
              onClick={() => void unlink(dissolving, dissolving.members.map((m) => m.id))}>{t("pgrp.dissolve")}</Button>
          </div>
        )} />
    </div>
  );
}

/* ── بطاقةُ مجموعة: السعرُ الواحد فوق، والأعضاءُ معلّقون تحته ─────────────────────────────────────────── */
function GroupCard({ g, can, busy, flash, co, sec, picked, onPick, onUnlink, onAdd, onPrice, onDissolve }: {
  g: ProductGroup; can: boolean; busy: boolean; flash: boolean; co: string | null; sec: string | null;
  picked: string[]; onPick: (id: string) => void; onUnlink: (ids: string[]) => void;
  onAdd: () => void; onPrice: () => void; onDissolve: () => void;
}) {
  const { t } = useTranslation();
  const fmt = fmtOf(g.currency);
  const split = g.sellSplit || g.buySplit;
  return (
    <section className={cn("card overflow-hidden p-0 transition", flash && "ring-2 ring-violet-300")} data-pgrp={g.key}>
      <header className="flex items-start gap-3 p-4 pb-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Link2 size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-extrabold text-ink" title={g.title}>{g.title}</h3>
          <p className="flex flex-wrap gap-x-2 text-2xs text-ink-subtle">
            <span className="font-semibold text-violet-700 dark:text-violet-300">{t("pgrp.count", { n: formatNum(g.members.length) })}</span>
            {co && <span>{co}</span>}
            {sec && <span>· {sec}</span>}
            {g.currency === "USD" && <span className="font-semibold">USD</span>}
          </p>
        </div>
        {can && (
          <button type="button" onClick={onDissolve} disabled={busy}
            className="shrink-0 rounded-lg px-2 py-1 text-2xs font-semibold text-ink-subtle transition hover:bg-surface-2 hover:text-danger-600" data-pgrp-dissolve>
            {t("pgrp.dissolve")}
          </button>
        )}
      </header>

      {/* السعرُ الواحد — أو لماذا ليس واحداً */}
      {g.currency === "mixed" ? (
        <div className="mx-4 flex items-start gap-2 rounded-xl bg-warn-50 p-3 text-xs text-warn-800 dark:bg-warn-500/10 dark:text-warn-200" data-pgrp-mixed>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span>{t("pgrp.mixed")}</span>
        </div>
      ) : split ? (
        <div className="mx-4 flex flex-wrap items-center gap-2 rounded-xl bg-warn-50 p-3 dark:bg-warn-500/10" data-pgrp-split>
          <AlertTriangle size={15} className="shrink-0 text-warn-600 dark:text-warn-300" />
          <span className="min-w-0 flex-1 text-xs text-warn-800 dark:text-warn-200">
            <span className="block font-bold">{t("pgrp.split")}</span>
            {t("pgrp.splitHow")}
          </span>
          {can && <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={onPrice}>{t("pgrp.unify")}</Button>}
        </div>
      ) : (
        <div className="mx-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-violet-50/60 p-3 dark:bg-violet-500/10" data-pgrp-price>
          <span>
            <span className="block text-2xs font-semibold text-ink-subtle">{t("pgrp.sell")}</span>
            <span className="text-lg font-extrabold tabular-nums text-ink" dir="ltr">{fmt(g.sell)}</span>
          </span>
          <span>
            <span className="block text-2xs font-semibold text-ink-subtle">{t("pgrp.buy")}</span>
            <span className="text-sm font-bold tabular-nums text-ink-muted" dir="ltr">{fmt(g.buy)}</span>
          </span>
          {can && <Button size="sm" variant="secondary" className="ms-auto" leftIcon={<Pencil size={14} />} onClick={onPrice} data-pgrp-edit-price>{t("pgrp.changePrice")}</Button>}
        </div>
      )}

      {/* الأعضاء — معلّقون بخطٍّ واحد من السعر */}
      <ul className="mx-4 mt-3 border-s-2 border-violet-200 dark:border-violet-500/30">
        {g.members.map((m) => {
          const on = picked.includes(m.id);
          const own = pricesOf(m);
          return (
            <li key={m.id} className="flex items-center gap-2 py-1.5 ps-3" data-pgrp-member={m.id}>
              {can && (
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-600" checked={on} onChange={() => onPick(m.id)}
                  aria-label={t("pgrp.pick", { name: m.name })} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{m.name}</span>
                <span className="flex flex-wrap gap-x-2 text-2xs text-ink-subtle">
                  {m.barcode && <span className="font-mono" dir="ltr">{m.barcode}</span>}
                  <span>{t("pgrp.stockN", { n: formatDec(Number(m.stock) || 0) })}</span>
                  {split && <span className="font-semibold text-warn-700 dark:text-warn-300" dir="ltr">{fmt(own.sell)} / {fmt(own.buy)}</span>}
                </span>
              </span>
              {can && (
                <button type="button" disabled={busy} onClick={() => { playTap(); onUnlink([m.id]); }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-2xs font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                  title={t("pgrp.unlinkHint")} data-pgrp-unlink={m.id}>
                  <Unlink size={13} /> {t("pgrp.unlink")}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {can && (
        <footer className="flex flex-wrap items-center gap-2 p-4 pt-2">
          <Button size="sm" variant="ghost" leftIcon={<Plus size={14} />} onClick={onAdd} disabled={busy} data-pgrp-add>{t("pgrp.addTo")}</Button>
          {picked.length > 0 && (
            <Button size="sm" variant="outline" className="ms-auto" leftIcon={<Unlink size={14} />} loading={busy}
              onClick={() => { playTap(); onUnlink(picked); }} data-pgrp-unlink-sel>
              {t("pgrp.unlinkSel", { n: formatNum(picked.length) })}
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}

/* ── اربط منتجات: مجموعةٌ جديدة، أو إضافةٌ لقائمة ──────────────────────────────────────────────────── */
function LinkSheet({ target, products, groups, coName, onClose, onDone, onFailed }: {
  target: ProductGroup | null; products: Product[]; groups: ProductGroup[]; coName: Map<string, string>;
  onClose: () => void; onDone: () => void; onFailed: (e: unknown) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [picked, setPicked] = useState<string[]>([]);
  const [sellTxt, setSellTxt] = useState<string | null>(null);   // null = لم يُكتب بعد: يتبع الاقتراح
  const [buyTxt, setBuyTxt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const base = useMemo(() => target?.members ?? [], [target]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const chosen = useMemo(() => picked.map((id) => byId.get(id)).filter((p): p is Product => !!p), [picked, byId]);
  const all = useMemo(() => [...base, ...chosen], [base, chosen]);
  const anchor = all[0] ?? null;
  const cur: GroupCurrency = anchor ? currencyOf(anchor) : "IQD";
  const fmt = fmtOf(cur);
  const groupTitleOf = useMemo(() => new Map(groups.flatMap((g) => g.members.map((m) => [m.id, g.title] as const))), [groups]);

  const list = useMemo(() => {
    const s = searchable(dq.trim());
    const byCode = codeMatcher(dq);
    const inBase = new Set(base.map((m) => m.id));
    const rows = products.filter((p) => !inBase.has(p.id) && !p.farm_id && (!s || searchable(p.name).includes(s) || byCode(p)));
    // نفسُ الشركة والصنف أوّلاً (المربوطةُ عادةً من شركةٍ وصنفٍ واحد)، ثمّ نفسُ الشركة، ثمّ الباقي.
    const rank = (p: Product) => (!anchor ? 0 : p.company_id && p.company_id === anchor.company_id ? (p.section_id && p.section_id === anchor.section_id ? 0 : 1) : 2);
    return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ar"));
  }, [products, dq, base, anchor]);

  const sells = all.map((p) => pricesOf(p).sell);
  const buys = all.map((p) => pricesOf(p).buy);
  const sellDefault = target ? target.sell : commonPrice(sells);
  // الشراءُ لا يُوحَّد ضمناً: أسعارُ شراءٍ مختلفة تبقى كلٌّ على سعره (الخانةُ فارغة) حتى يكتب المستخدمُ رقماً.
  const buyDefault = target ? target.buy : distinctPrices(buys).length === 1 && !buys.includes(null) ? buys[0] : null;
  const sellShown = sellTxt ?? (sellDefault == null ? "" : String(sellDefault));
  const buyShown = buyTxt ?? (buyDefault == null ? "" : String(buyDefault));
  const sell = priceInput(sellShown);
  const buy = priceInput(buyShown);
  const diffSells = distinctPrices(sells);
  const diffBuys = distinctPrices(buys);

  const toggle = (p: Product) => {
    playTap();
    setPicked((xs) => (xs.includes(p.id) ? xs.filter((x) => x !== p.id) : [...xs, p.id]));
  };
  const problem = chosen.length === 0 || all.length < 2 ? "two" : sell == null ? "sell" : Number.isNaN(sell) || Number.isNaN(buy) ? "num" : null;

  const submit = async () => {
    setTried(true);
    if (problem || busy || sell == null) { playWarning(); return; }
    setBusy(true);
    try {
      const r = await (await api()).linkProducts(picked, target?.key ?? null, sell, buy, seenOf(all));
      playSuccess();
      toast.success(t("pgrp.linked", { n: formatNum(r.n), price: fmt(sell) }), r.dissolved ? t("pgrp.oldDissolved", { n: formatNum(r.dissolved) }) : undefined);
      onDone();
    } catch (e) { onFailed(e); } finally { setBusy(false); }
  };

  const say = problem === "two" ? t("pgrp.needTwo") : problem === "sell" ? t("pgrp.needSell") : problem === "num" ? t("pgrp.badPrice") : null;
  return (
    <Modal open onClose={onClose} size="wide" title={target ? t("pgrp.addTitle", { name: target.title }) : t("pgrp.linkTitle")}>
      <div className="space-y-3" data-pgrp-sheet>
        <p className="text-xs leading-relaxed text-ink-muted">{t("pgrp.pickHint")}</p>
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pgrp.pickSearch")} aria-label={t("pgrp.pickSearch")} autoFocus data-pgrp-q />
        </label>

        {(base.length > 0 || chosen.length > 0) && (
          <div className="flex flex-wrap gap-1.5" data-pgrp-chosen>
            {base.map((m) => <span key={m.id} className="chip bg-violet-50 text-2xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{m.name}</span>)}
            {chosen.map((m) => (
              <button key={m.id} type="button" onClick={() => toggle(m)} className="chip bg-brand-50 text-2xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                {m.name} <X size={11} />
              </button>
            ))}
          </div>
        )}

        <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto rounded-2xl border border-line" data-pgrp-list>
          {list.slice(0, SHOWN).map((p) => {
            const on = picked.includes(p.id);
            const block = on ? null : linkBlock(p, all);
            const other = groupKeyOf(p.bulk_group) && groupKeyOf(p.bulk_group) !== target?.key ? groupTitleOf.get(p.id) : undefined;
            const same = !!anchor && !!p.company_id && p.company_id === anchor.company_id;
            const pp = pricesOf(p);
            return (
              <li key={p.id}>
                <button type="button" disabled={!!block} onClick={() => toggle(p)} data-pgrp-row={p.id}
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-start transition", on ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-surface-2", block && "opacity-50")}>
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong")}>
                    {on && <Check size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="flex flex-wrap gap-x-2 text-2xs text-ink-subtle">
                      {p.barcode && <span className="font-mono" dir="ltr">{p.barcode}</span>}
                      {p.company_id && <span className={cn(same && "font-semibold text-brand-700 dark:text-brand-200")}>{coName.get(p.company_id)}</span>}
                      {other && <span className="font-semibold text-violet-700 dark:text-violet-300">{t("pgrp.inGroup", { name: other })}</span>}
                      {block && <span className="font-semibold text-warn-700 dark:text-warn-300">{t(block === "currency" ? "pgrp.blockCur" : "pgrp.blockFarm")}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-ink-muted" dir="ltr">{fmtOf(currencyOf(p))(pp.sell)}</span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-4 text-center text-xs text-ink-subtle">{t("pgrp.noMatch", { q: dq.trim() })}</li>}
          {list.length > SHOWN && <li className="p-2 text-center text-2xs text-ink-subtle">{t("pgrp.more", { n: formatNum(list.length - SHOWN) })}</li>}
        </ul>

        <div className="grid gap-3 rounded-2xl border border-line bg-surface-2/40 p-3 sm:grid-cols-2" data-pgrp-prices>
          <label className="block">
            <span className="label">{t("pgrp.unifiedSell")}{cur === "USD" ? " ($)" : ""}</span>
            <input className="input font-semibold tabular-nums" inputMode="decimal" dir="ltr" value={sellShown}
              onChange={(e) => setSellTxt(e.target.value)} data-pgrp-sell />
          </label>
          <label className="block">
            <span className="label">{t("pgrp.unifiedBuy")}{cur === "USD" ? " ($)" : ""}</span>
            <input className="input tabular-nums" inputMode="decimal" dir="ltr" value={buyShown} placeholder={t("pgrp.buyKeepPh")}
              onChange={(e) => setBuyTxt(e.target.value)} data-pgrp-buy />
            <span className="mt-1 block text-2xs text-ink-subtle">{t("pgrp.buyKeep")}</span>
          </label>
          {(diffSells.length > 1 || diffBuys.length > 1) && sell != null && !Number.isNaN(sell) && (
            <p className="text-2xs leading-relaxed text-warn-800 dark:text-warn-200 sm:col-span-2" data-pgrp-diff>
              {diffSells.length > 1 && t("pgrp.pricesNow", { list: diffSells.map((x) => fmt(x)).join(" · "), to: fmt(sell) })}
              {diffSells.length > 1 && diffBuys.length > 1 && buy != null && " "}
              {diffBuys.length > 1 && buy != null && !Number.isNaN(buy) && t("pgrp.buysNow", { list: diffBuys.map((x) => fmt(x)).join(" · "), to: fmt(buy) })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className={cn("text-xs", tried && say ? "font-semibold text-danger-600" : "text-ink-subtle")} data-pgrp-say>
            {tried && say ? say : t("pgrp.chosenN", { n: formatNum(chosen.length) })}
          </span>
          <Button loading={busy} leftIcon={<Link2 size={16} />} onClick={() => void submit()} data-pgrp-submit>
            {target ? t("pgrp.addBtn", { n: formatNum(chosen.length) }) : t("pgrp.linkBtn", { n: formatNum(all.length) })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── سعرُ المجموعة: للكلّ مرّةً واحدة ─────────────────────────────────────────────────────────────── */
function PriceSheet({ g, onClose, onDone, onFailed }: { g: ProductGroup; onClose: () => void; onDone: () => void; onFailed: (e: unknown) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = fmtOf(g.currency);
  const [sellTxt, setSellTxt] = useState(g.sell == null ? "" : String(g.sell));
  const [buyTxt, setBuyTxt] = useState(g.buy == null ? "" : String(g.buy));
  const [busy, setBusy] = useState(false);
  const sell = priceInput(sellTxt);
  const buy = priceInput(buyTxt);
  const bad = Number.isNaN(sell) || Number.isNaN(buy);
  // يُرسل ما تغيّر عمّا يُرى (أو ما يوحّد سعراً مختلفاً) — والفارغُ لا يُمسّ.
  const sendSell = sell != null && !Number.isNaN(sell) && (g.sellSplit || sell !== g.sell) ? sell : null;
  const sendBuy = buy != null && !Number.isNaN(buy) && (g.buySplit || buy !== g.buy) ? buy : null;
  const subs = g.members.some((m) => m.has_sub_unit || (m.packs?.length ?? 0) > 0);

  const submit = async () => {
    if (busy) return;
    if (bad) { playWarning(); return; }
    if (sendSell == null && sendBuy == null) { toast.toast({ tone: "info", title: t("pgrp.noChange") }); onClose(); return; }
    setBusy(true);
    try {
      const r = await (await api()).setGroupPrice(g.key, sendSell, sendBuy, seenOf(g.members));
      playSuccess();
      toast.success(t("pgrp.priceSaved", { n: formatNum(r.n) }));
      onDone();
    } catch (e) { onFailed(e); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} size="md" title={t("pgrp.priceTitle", { name: g.title })} description={t("pgrp.priceHow", { n: formatNum(g.members.length) })}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={busy} disabled={bad} leftIcon={<Check size={16} />} onClick={() => void submit()} data-pgrp-price-save>
            {t("pgrp.applyAll", { n: formatNum(g.members.length) })}
          </Button>
        </div>
      )}>
      <div className="space-y-3" data-pgrp-price-sheet>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t("pgrp.sell")}{g.currency === "USD" ? " ($)" : ""}</span>
            <input className="input font-semibold tabular-nums" inputMode="decimal" dir="ltr" value={sellTxt} autoFocus
              onChange={(e) => setSellTxt(e.target.value)} data-pgrp-price-sell />
          </label>
          <label className="block">
            <span className="label">{t("pgrp.buy")}{g.currency === "USD" ? " ($)" : ""}</span>
            <input className="input tabular-nums" inputMode="decimal" dir="ltr" value={buyTxt} onChange={(e) => setBuyTxt(e.target.value)} data-pgrp-price-buy />
          </label>
        </div>
        {bad && <p className="text-xs font-semibold text-danger-600">{t("pgrp.badPrice")}</p>}
        <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-xl border border-line text-xs">
          {g.members.map((m) => {
            const x = pricesOf(m);
            const ns = sendSell ?? x.sell;
            const nb = sendBuy ?? x.buy;
            return (
              <li key={m.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{m.name}</span>
                <span className="shrink-0 tabular-nums text-ink-muted" dir="ltr">
                  {ns !== x.sell ? <><s className="opacity-60">{fmt(x.sell)}</s> → <b className="text-ink">{fmt(ns)}</b></> : fmt(x.sell)}
                  {" / "}
                  {nb !== x.buy ? <><s className="opacity-60">{fmt(x.buy)}</s> → <b className="text-ink">{fmt(nb)}</b></> : fmt(x.buy)}
                </span>
              </li>
            );
          })}
        </ul>
        {subs && <p className="text-2xs text-ink-subtle">{t("pgrp.subUnitNote")}</p>}
      </div>
    </Dialog>
  );
}
