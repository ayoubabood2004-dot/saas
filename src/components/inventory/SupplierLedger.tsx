import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Building2, Search, ChevronDown, Wallet, HandCoins, ShoppingBag, CalendarClock,
  UserRound, Phone, AlertTriangle, Copy, Check, BookOpen, PackageCheck,
} from "lucide-react";
import type { Purchase, Company, PaymentMethod } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { cn, money, formatDate } from "@/lib/utils";
import { withTimeout, describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { PurchaseDetailModal } from "./Purchases";
import ledgerSQL from "../../../supabase/migrations/0076_supplier_ledger.sql?raw";

/** دين فاتورة واحدة — قديمة بلا amount_paid تُعتبر مدفوعة كاملة. */
const dueOf = (p: Purchase) => Math.max(0, p.total - (p.amount_paid ?? p.total));

const statusTone = (s?: string): "success" | "warn" | "danger" => (s === "paid" ? "success" : s === "partial" ? "warn" : "danger");

type CompanyGroup = {
  key: string;
  name: string;
  note: string | null;
  invoices: Purchase[];
  total: number;
  paid: number;
  due: number;
  lastAt: string;
  /** آخر مورّد/مندوب معروف لهذه الشركة (من أحدث فاتورة تحمل اسماً). */
  supplier: string | null;
  supplierPhone: string | null;
  /** طابع أحدث فاتورة أخذنا منها اسم المورّد — فواتير نفس اليوم تُفصل بوقت الإنشاء. */
  supplierAt: string;
};

type Filter = "all" | "debt" | "settled";

/* ============================================================================
 * دفتر الفواتير والديون (سجل المورّدين) — كل الشراء من الشركات في مكان واحد:
 * شكد اشتريت من كل شركة، شكد سدّدت، شكد باقي عليك، مع فواتيرها وبضاعتها
 * واسم المورّد، وتسديد الدين فاتورةً أو دفعةً واحدة على مستوى الشركة.
 * ========================================================================== */
export function SupplierLedgerTab({ companies, clinicId }: { companies: Company[]; clinicId?: string }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [settleGroup, setSettleGroup] = useState<CompanyGroup | null>(null);
  // null = لم يُفحص بعد · false = ترحيل 0076 ناقص (التسديد واسم المورّد معطَّلان)
  const [ledgerOk, setLedgerOk] = useState<boolean | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const mounted = useRef(true);

  const load = async () => {
    try {
      const rows = await withTimeout(repo.listPurchases(clinicId), 15000);
      if (mounted.current) setPurchases(rows);
    } catch { /* keep prior list */ }
    finally { if (mounted.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    void repo.supportsSupplierLedger().then((ok) => { if (mounted.current) setLedgerOk(ok); }).catch(() => {});
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noteOf = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.note ?? null]));
    return (id?: string | null) => (id ? m.get(id) ?? null : null);
  }, [companies]);

  /** فواتير كل شركة سويّة — بالمعرف، وإلا بالاسم (فاتورة بلا شركة → «بدون شركة»). */
  const groups = useMemo<CompanyGroup[]>(() => {
    const m = new Map<string, CompanyGroup>();
    for (const p of purchases) {
      const key = p.company_id ?? (p.company_name?.trim() ? `n:${p.company_name.trim().toLowerCase()}` : "none");
      let g = m.get(key);
      if (!g) {
        g = {
          key,
          name: p.company_name?.trim() || t("purchase.noCompany", "بدون شركة"),
          note: noteOf(p.company_id),
          invoices: [], total: 0, paid: 0, due: 0, lastAt: "", supplier: null, supplierPhone: null, supplierAt: "",
        };
        m.set(key, g);
      }
      g.invoices.push(p);
      g.total += p.total;
      g.paid += p.amount_paid ?? p.total;
      g.due += dueOf(p);
      if ((p.purchased_at || "") > g.lastAt) g.lastAt = p.purchased_at || "";
      // اسم المورّد من أحدث فاتورة يحمله (نفس اليوم؟ الأحدث إنشاءً يفوز).
      const at = `${p.purchased_at || ""}|${p.created_at || ""}`;
      if (p.supplier_name && at > g.supplierAt) { g.supplier = p.supplier_name; g.supplierPhone = p.supplier_phone ?? null; g.supplierAt = at; }
    }
    return [...m.values()].sort((a, b) => (b.due - a.due) || b.lastAt.localeCompare(a.lastAt));
  }, [purchases, noteOf, t]);

  const totals = useMemo(() => ({
    total: groups.reduce((s, g) => s + g.total, 0),
    paid: groups.reduce((s, g) => s + g.paid, 0),
    due: groups.reduce((s, g) => s + g.due, 0),
    debtors: groups.filter((g) => g.due > 0).length,
  }), [groups]);

  const ql = q.trim().toLowerCase();
  const shown = groups
    .filter((g) => (filter === "debt" ? g.due > 0 : filter === "settled" ? g.due <= 0 : true))
    .filter((g) => !ql || g.name.toLowerCase().includes(ql) || (g.supplier ?? "").toLowerCase().includes(ql) || g.invoices.some((p) => (p.reference ?? "").toLowerCase().includes(ql) || (p.supplier_name ?? "").toLowerCase().includes(ql)));

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(ledgerSQL);
      toast.success(t("pos.sqlCopied", "انتسخ الأمر — الصقه في SQL Editor واضغط Run"));
    } catch {
      toast.error(t("pos.copyFailed", "تعذّر النسخ — ظلّل النص وانسخه يدوياً"));
    }
  };

  const recheck = async () => {
    if (checkBusy) return;
    setCheckBusy(true);
    try {
      const ok = await repo.supportsSupplierLedger();
      setLedgerOk(ok);
      if (ok) { playSuccess(); toast.success(t("purchase.ledgerOnNow", "تم التفعيل — التسديد وسجل الدفعات واسم المورّد شغّالة الآن")); }
      else { playWarning(); toast.error(t("purchase.ledgerStillOff", "الترحيل ما زال ناقصاً"), t("pos.groupsStillOffHint", "نفّذ الأمر في Supabase → SQL Editor ثم اضغط «افحص وأصلح» مرة أخرى")); }
    } finally {
      setCheckBusy(false);
    }
  };

  const toggle = (key: string) => setOpenKeys((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  return (
    <div className="space-y-4">
      {/* ترحيل 0076 غير منفَّذ — الديون تُعرض، لكن التسديد واسم المورّد يحتاجانه */}
      {ledgerOk === false && (
        <div className="card border-2 border-warn-300 bg-warn-50/60 p-4 dark:border-warn-500/40 dark:bg-warn-500/10">
          <div className="flex flex-wrap items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-300"><AlertTriangle size={20} /></span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-bold text-ink">{t("purchase.ledgerOffTitle", "دفتر الديون يحتاج تفعيلاً على قاعدة بياناتك")}</p>
              <p className="text-sm leading-relaxed text-ink-muted">{t("purchase.ledgerOffBody", "عرض الديون شغّال، لكن تسديد الدفعات وسجلّها واسم المورّد على الفاتورة تحتاج ترحيلاً واحداً. اضغط «نسخ الأمر» ونفّذه مرة واحدة في Supabase ← SQL Editor ← Run، ثم اضغط «إعادة الفحص».")}</p>
            </div>
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-col sm:justify-start">
              <Button size="sm" variant="secondary" leftIcon={<Copy size={14} />} onClick={() => { playTap(); void copySql(); }}>{t("pos.copySql", "نسخ الأمر")}</Button>
              <Button size="sm" loading={checkBusy} leftIcon={<Check size={14} />} onClick={() => { playTap(); void recheck(); }}>{t("purchase.recheck", "إعادة الفحص")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* خلاصة الدفتر */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <LedgerKpi icon={ShoppingBag} tone="brand" label={t("purchase.kpiTotal", "إجمالي المشتريات")} value={money(totals.total)} />
        <LedgerKpi icon={HandCoins} tone="success" label={t("purchase.kpiPaid", "المسدَّد للشركات")} value={money(totals.paid)} />
        <LedgerKpi icon={Wallet} tone={totals.due > 0 ? "danger" : "success"} label={t("purchase.kpiDue", "الديون المتبقّية")} value={money(totals.due)} />
        <LedgerKpi icon={Building2} tone={totals.debtors > 0 ? "warn" : "success"} label={t("purchase.kpiDebtors", "شركات عليها دين")} value={String(totals.debtors)} />
      </div>

      {/* بحث + تصفية */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("purchase.ledgerSearch", "ابحث بالشركة أو المورّد أو رقم الفاتورة…")} />
        </div>
        <div className="inline-flex rounded-2xl bg-surface-2 p-1">
          {([["all", t("purchase.fAll", "الكل")], ["debt", t("purchase.fDebt", "عليها دين")], ["settled", t("purchase.fSettled", "مسدَّدة")]] as [Filter, string][]).map(([f, label]) => (
            <button key={f} onClick={() => { playTap(); setFilter(f); }} className={cn("rounded-xl px-3 py-1.5 text-xs font-bold transition", filter === f ? "bg-surface-1 text-ink shadow-soft" : "text-ink-muted hover:text-ink")}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15"><BookOpen size={26} /></span>
          <p className="text-ink-subtle">{purchases.length === 0 ? t("purchase.ledgerEmpty", "الدفتر فارغ — أول فاتورة شراء تسجّلها تظهر هنا مع دين شركتها.") : t("purchase.noMatch", "لا توجد فاتورة مطابقة.")}</p>
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2.5">
          {shown.map((g) => {
            const open = openKeys.has(g.key);
            return (
              <motion.div key={g.key} variants={staggerItem} className="card overflow-hidden">
                {/* رأس الشركة — الاسم والمعلومات والأرقام الثلاثة */}
                <button onClick={() => { playTap(); toggle(g.key); }} className="flex w-full flex-wrap items-center gap-3 p-4 text-start transition hover:bg-surface-2/50">
                  <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-soft", g.due > 0 ? "bg-danger-500" : "bg-brand-grad")}><Building2 size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-ink">{g.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-subtle">
                      <span>{t("purchase.invCount", { n: g.invoices.length, defaultValue: "{{n}} فاتورة" })}</span>
                      {g.lastAt && <span className="flex items-center gap-1"><CalendarClock size={11} /> {formatDate(g.lastAt, i18n.language)}</span>}
                      {g.supplier && <span className="flex items-center gap-1"><UserRound size={11} /> {g.supplier}</span>}
                      {g.supplierPhone && <span className="flex items-center gap-1 font-mono" dir="ltr"><Phone size={11} /> {g.supplierPhone}</span>}
                      {g.note && <span className="truncate">{g.note}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden text-end sm:block">
                      <p className="text-2xs text-ink-subtle">{t("purchase.grandTotal", "الإجمالي")}</p>
                      <p className="text-sm font-bold text-ink tabular-nums">{money(g.total)}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-2xs text-ink-subtle">{t("purchase.due", "المتبقّي")}</p>
                      <p className={cn("text-base font-extrabold tabular-nums", g.due > 0 ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-400")}>{g.due > 0 ? money(g.due) : "✓"}</p>
                    </div>
                    <ChevronDown size={17} className={cn("shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
                  </div>
                </button>

                {open && (
                  <div className="border-t border-line bg-surface-2/30 p-3">
                    {g.due > 0 && ledgerOk && (
                      <Button size="sm" className="mb-2.5 w-full sm:w-auto" leftIcon={<HandCoins size={15} />} onClick={() => { playTap(); setSettleGroup(g); }}>
                        {t("purchase.settleCompany", { v: money(g.due), defaultValue: "تسديد دين الشركة ({{v}})" })}
                      </Button>
                    )}
                    <div className="space-y-1.5">
                      {g.invoices.map((p) => {
                        const d = dueOf(p);
                        return (
                          <button key={p.id} onClick={() => { playTap(); setViewing(p); }} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-1 p-3 text-start shadow-soft transition hover:shadow-raised">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><ShoppingBag size={15} /></span>
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-ink">
                                {formatDate(p.purchased_at, i18n.language)}
                                {p.reference && <span className="chip bg-surface-2 font-mono text-2xs text-ink-muted">#{p.reference}</span>}
                                {p.supplier_name && <span className="flex items-center gap-1 font-normal text-ink-subtle"><UserRound size={10} /> {p.supplier_name}</span>}
                              </p>
                              <p className="flex items-center gap-1 text-2xs text-ink-subtle"><PackageCheck size={10} /> {t("purchase.units", { n: p.item_count, defaultValue: "{{n}} قطعة" })} · {t("purchase.tapForGoods", "اضغط لعرض البضاعة والتسديد")}</p>
                            </div>
                            <div className="text-end">
                              <p className="text-xs font-bold text-ink tabular-nums">{money(p.total)}</p>
                              {d > 0
                                ? <p className="text-2xs font-bold text-danger-600 tabular-nums dark:text-danger-400">{t("purchase.dueShort", { v: money(d), defaultValue: "عليه {{v}}" })}</p>
                                : <Badge tone={statusTone(p.status)}>{t(`purchase.status.${p.status ?? "paid"}`, p.status ?? "paid")}</Badge>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <PurchaseDetailModal purchase={viewing} onClose={() => setViewing(null)} onChanged={() => void load()} />
      <CompanySettleModal group={settleGroup} onClose={() => setSettleGroup(null)} onSettled={() => { setSettleGroup(null); void load(); }} />
    </div>
  );
}

function LedgerKpi({ icon: Icon, tone, label, value }: { icon: typeof Wallet; tone: "brand" | "success" | "warn" | "danger"; label: string; value: string }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300",
    warn: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300",
    danger: "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300",
  } as const;
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}><Icon size={19} /></span>
      <div className="min-w-0">
        <p className="truncate text-2xs font-semibold text-ink-subtle">{label}</p>
        <p className="truncate text-base font-extrabold text-ink tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/* ============================================================================
 * تسديد دين شركة كاملة بدفعة واحدة — المبلغ يُوزَّع على فواتيرها الآجلة من
 * الأقدم للأحدث (كل فاتورة تُسدَّد على حدة فيبقى سجلّها دقيقاً).
 * ========================================================================== */
function CompanySettleModal({ group, onClose, onSettled }: { group: CompanyGroup | null; onClose: () => void; onSettled: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (group) { setAmount(String(group.due)); setMethod("cash"); setNote(""); }
  }, [group]);

  if (!group) return null;
  const amtNum = Math.min(Math.max(Number(amount) || 0, 0), group.due);
  // الفواتير الآجلة من الأقدم للأحدث — نسدّد بالترتيب.
  const unpaid = group.invoices.filter((p) => dueOf(p) > 0).sort((a, b) => (a.purchased_at || "").localeCompare(b.purchased_at || ""));

  const settle = async () => {
    if (busy) return;
    if (amtNum <= 0) { toast.error(t("purchase.settleAmount", "أدخل مبلغاً أكبر من صفر")); return; }
    setBusy(true);
    let remaining = amtNum;
    let settled = 0;
    let count = 0;
    try {
      for (const p of unpaid) {
        if (remaining <= 0) break;
        const part = Math.min(remaining, dueOf(p));
        if (part <= 0) continue;
        await repo.settlePurchase(p.id, part, method, note.trim() || null);
        remaining = Math.round((remaining - part) * 100) / 100;
        settled = Math.round((settled + part) * 100) / 100;
        count++;
      }
      playSuccess();
      toast.success(t("purchase.companySettled", { v: money(settled), n: count, defaultValue: "سُدِّد {{v}} على {{n}} فاتورة" }));
      onSettled();
    } catch (e) {
      playWarning();
      // فشل جزئي: ما انسدّ انسدّ فعلاً — أعد التحميل ليعكس الدفتر الواقع.
      if (settled > 0) toast.error(t("purchase.companySettledPart", { v: money(settled), defaultValue: "سُدِّد {{v}} ثم توقّف — راجع المتبقّي وأعد المحاولة" }), e instanceof Error ? e.message : undefined);
      else toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
      onSettled();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!group} onClose={onClose} title={t("purchase.settleCompanyTitle", { name: group.name, defaultValue: "تسديد دين — {{name}}" })}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-danger-50 p-3.5 text-sm dark:bg-danger-500/10">
          <span className="font-semibold text-ink">{t("purchase.dueNow", "الدين الحالي")}</span>
          <span className="text-lg font-extrabold text-danger-600 tabular-nums dark:text-danger-400">{money(group.due)}</span>
        </div>
        <div>
          <label className="label">{t("purchase.settleAmountLbl", "المبلغ")}</label>
          <input type="number" inputMode="numeric" min="0" step="1" className="input text-lg font-bold tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <p className="mt-1 text-2xs text-ink-subtle">{t("purchase.settleSpread", "يُوزَّع تلقائياً على الفواتير الآجلة من الأقدم للأحدث")}</p>
        </div>
        <div>
          <label className="label">{t("purchase.payMethod", "طريقة الدفع")}</label>
          <div className="flex gap-1.5">
            {(["cash", "card", "transfer"] as PaymentMethod[]).map((m) => (
              <button key={m} onClick={() => { playTap(); setMethod(m); }} className={cn("flex-1 rounded-xl px-2 py-2 text-xs font-bold transition", method === m ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>{t(`pay.${m}`, m)}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">{t("purchase.notes", "ملاحظات")}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("purchase.settleNotePh", "مثال: تسليم نقدي للمندوب أبو علي")} />
        </div>
        <Button className="w-full" size="lg" loading={busy} leftIcon={<HandCoins size={17} />} onClick={settle}>
          {t("purchase.settleDoAmount", { v: money(amtNum), defaultValue: "سدّد {{v}}" })}
        </Button>
      </div>
    </Modal>
  );
}
