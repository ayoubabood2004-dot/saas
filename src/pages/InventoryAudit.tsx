import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Barcode, Building2, ClipboardCheck, Copy as CopyIcon, FileSearch, Hourglass, Lock,
  PackageX, Pencil, RotateCw, ScanBarcode, Search, TrendingDown,
} from "lucide-react";
import type { AuditKind, BarcodeAilment, BarcodeHealthRow, InventoryAuditRow } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Skeleton } from "@/components/ui";
import { cn, formatNum, formatQty, matchCode, money, searchable } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { COVER_MAX } from "@/lib/inventoryAudit";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * فحصُ المخزن (0245) — ما وجده جردٌ يدويٌّ لعيادةٍ واحدة، تراه كلُّ عيادةٍ بنفسها.
 *
 * الحسابُ كلُّه بالقاعدة (`report_inventory_audit` و`verify_barcode_health` معاً —
 * هذه تُكمل تلك ولا تكرّرها)، وهذه الشاشةُ تعرض وتقول الطريق ولا تحسب. ولا زرَّ
 * إصلاحٍ جماعيّ ولا دمجٍ تلقائيّ (الخطّ الأحمر الأوّل): كلُّ ملاحظةٍ لها طريقُها
 * الموجود بالتطبيق — نموذجُ المادة، مولّدُ الباركود، الجردُ اليوميّ — والقرارُ لمن
 * يرى العلبة. و«مكرّرٌ محتمل» يُقال «افحص» لا «ادمج».
 *
 * والفشلُ يُقال ولا يُعرض نصفُ فحص: قائمةٌ ناقصة تُصدَّق («ماكو ملاحظات»)، فالنداءان
 * معاً أو لا شيء.
 * ========================================================================= */

const WINDOWS = [30, 90, 180] as const;
type Win = (typeof WINDOWS)[number];
const KEY = "vp_audit_days";
const PAGE = 25;

function readWin(): Win {
  try {
    const v = Number(localStorage.getItem(KEY));
    if ((WINDOWS as readonly number[]).includes(v)) return v as Win;
  } catch { /* swallow-ok: تفضيلُ عرضٍ بالجهاز، وغيابُه = ٩٠ يوماً */ }
  return 90;
}

type Data = { audit: InventoryAuditRow[]; health: BarcodeHealthRow[] };

export function InventoryAudit() {
  const { t } = useTranslation();
  const { role, can } = usePermissions();
  const { restricted, stockLocked } = useOverride();
  /* الدورُ كالدالّة (مدير/طبيب)، والإذنُ كالمخزن نفسِه: طبيبٌ سحب منه المديرُ manageInventory لا يدخلها برابط. */
  const allowed = (role === "manager" || role === "veterinarian") && can("manageInventory");
  const [win, setWin] = useState<Win>(readWin);
  const [data, setData] = useState<Data | "loading" | { error: string }>("loading");
  const [q, setQ] = useState("");

  /* آخرُ طلبٍ وحده يكتب: ٣٠ ثم ١٨٠ بسرعة، والأبطأُ الأقدمُ كان يكتب فوق الأحدث تحت زرّه. */
  const seq = useRef(0);
  useEffect(() => () => { seq.current++; }, []);
  const load = useCallback(async (days: Win) => {
    const my = ++seq.current;
    setData("loading");
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    try {
      const [audit, health] = await Promise.all([repo.inventoryAudit(from.toISOString(), to.toISOString()), repo.barcodeHealth()]);
      if (my !== seq.current) return;
      setData({ audit, health });
    } catch (e) {
      if (my !== seq.current) return;
      playWarning();
      setData({ error: describeDbError(e, t) });
    }
  }, [t]);
  useEffect(() => { if (allowed) void load(win); }, [allowed, load, win]);

  const pickWin = (w: Win) => {
    playTap(); setWin(w);
    try { localStorage.setItem(KEY, String(w)); } catch { /* swallow-ok: تفضيلُ عرض */ }
  };

  const ready = typeof data === "object" && "audit" in data ? data : null;
  const match = useMemo(() => {
    const s = searchable(q.trim());
    const c = matchCode(q);
    if (!s && !c) return () => true;
    return (name: string, code: string | null | undefined) => (!!s && searchable(name).includes(s)) || (!!c && matchCode(code).includes(c));
  }, [q]);
  const byKind = useMemo(() => {
    const m = new Map<AuditKind, InventoryAuditRow[]>();
    for (const r of ready?.audit ?? []) {
      if (!match(r.product_name, r.code)) continue;
      const a = m.get(r.kind);
      if (a) a.push(r); else m.set(r.kind, [r]);
    }
    return m;
  }, [ready, match]);
  const health = useMemo(() => (ready?.health ?? []).filter((r) => match(r.product_name, r.code)), [ready, match]);
  const rows = (k: AuditKind) => byKind.get(k) ?? [];

  if (!allowed) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("audit.noAccess", "فحص المخزن للمدير والطبيب. راجع مدير العيادة.")}</p>
      </div>
    );
  }

  const valueOf = (list: InventoryAuditRow[]) => list.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const idle = [...rows("never_sold"), ...rows("stopped"), ...rows("slow")];
  const sections: { id: string; icon: typeof Barcode; label: string; n: number; value?: number }[] = [
    { id: "codes", icon: Barcode, label: t("audit.sCodes", "الباركود"), n: rows("no_code").length + rows("hand_code").length + health.length },
    { id: "dups", icon: CopyIcon, label: t("audit.sDups", "مكرّر محتمل"), n: groupsOf(rows("dup_twin")).length + groupsOf(rows("dup_name")).length },
    { id: "impossible", icon: AlertTriangle, label: t("audit.sImpossible", "كميات مستحيلة"), n: rows("impossible").length, value: valueOf(rows("impossible")) },
    { id: "idle", icon: Hourglass, label: t("audit.sIdle", "راكد"), n: idle.length, value: valueOf(idle) },
    { id: "zero", icon: PackageX, label: t("audit.sZero", "رصيده صفر وينباع"), n: rows("zero_sold").length },
    { id: "companies", icon: Building2, label: t("audit.sCompanies", "الشركات"), n: rows("no_company").length + groupsOf(rows("prefix_split")).length },
  ];
  const open = (id: string) => { playTap(); document.getElementById(`audit-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const total = sections.reduce((s, x) => s + x.n, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/inventory" className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted hover:text-ink" aria-label={t("audit.back", "رجوع للمخزون")}>
          <ArrowRight size={18} className="ltr:rotate-180" />
        </Link>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><FileSearch size={24} /></span>
        <div className="me-auto min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("audit.title", "فحص المخزن")}</h1>
          <p className="text-sm text-ink-subtle">{t("audit.sub", "وين الخلل بمخزنك — قراءة فقط، ما نغيّر شي، والتصليح بيدك مادة مادة.")}</p>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3" data-audit-window>
        <span className="text-xs font-bold text-ink-muted">{t("audit.windowLabel", "معدّل البيع من آخر:")}</span>
        {WINDOWS.map((w) => (
          <button key={w} type="button" aria-pressed={win === w} data-audit-days={w} onClick={() => pickWin(w)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-bold transition",
              win === w ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
            {t("audit.days", { n: formatNum(w), defaultValue: "{{n}} يوم" })}
          </button>
        ))}
        <span className="ms-auto text-2xs text-ink-subtle">{t("audit.windowHint", "الراكد والكميات المستحيلة تنحسب بهذا المعدّل.")}</span>
      </div>

      {data === "loading" ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
      ) : "error" in data ? (
        <div className="card space-y-3 p-8 text-center" data-audit-failed>
          <p className="text-sm font-bold text-danger-700 dark:text-danger-300">{data.error}</p>
          <p className="text-xs text-ink-subtle">{t("audit.failed", "ما وصلت النتيجة — وما نعرض «سليم» عن فشل. الفحص قراءة فقط، فما تغيّر شي.")}</p>
          <Button leftIcon={<RotateCw size={16} />} onClick={() => { playTap(); void load(win); }}>{t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3" data-audit-cards>
            {sections.map((s) => (
              <button key={s.id} type="button" data-audit-card={s.id} onClick={() => open(s.id)}
                className={cn("card flex flex-col items-start gap-1 p-3 text-start transition hover:border-line-strong", s.n === 0 && "opacity-70")}>
                <span className={cn("flex items-center gap-1.5 text-2xs font-bold", s.n ? "text-warn-700 dark:text-warn-300" : "text-success-700 dark:text-success-300")}>
                  <s.icon size={14} /> {s.label}
                </span>
                <span className="font-display text-2xl font-extrabold tabular-nums text-ink">{formatNum(s.n)}</span>
                {s.value !== undefined && s.value > 0 && !restricted && <span className="text-2xs font-semibold tabular-nums text-ink-subtle">{money(s.value)}</span>}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="card flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
              <Search size={16} className="text-ink-subtle" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} data-audit-search
                onChange={(e) => setQ(e.target.value)} placeholder={t("audit.searchPh", "ابحث بالاسم أو الباركود")} />
            </label>
          </div>
          <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-2xs leading-relaxed text-ink-muted" data-audit-nobulk>
            {t("audit.noBulk", "ما نصلّح بالجملة ولا ندمج وحدنا: بياناتك تبقى مثل ما دخّلتها. كل ملاحظة تحتها طريق تصليحها بالتطبيق — وأنت تقرر.")}
            {stockLocked && <span className="mt-1 block font-bold text-warn-700 dark:text-warn-300">{t("audit.locked", "الجهاز مقفول على وضع المدير — فتح المواد للتعديل يحتاج رمز المدير.")}</span>}
          </p>

          {total === 0 && q.trim() === "" && (
            <p className="card mb-4 p-6 text-center text-sm font-bold text-success-700 dark:text-success-300" data-audit-clean>
              {t("audit.clean", "ماكو ملاحظات — مخزنك مرتّب بكل الفحوص ✓")}
            </p>
          )}

          <Section id="codes" icon={ScanBarcode} title={t("audit.sCodes", "الباركود")}>
            <Check kind="no_code" rows={rows("no_code")} title={t("audit.noCode", "بلا باركود")}
              why={t("audit.noCodeWhy", "ما تنمسح — تنباع بالبحث بالاسم بس، وأول ما تجي علبتها تنضاف مرة ثانية كمادة جديدة.")}
              fix={t("audit.noCodeFix", "افتح المادة وامسح باركود العلبة بخانة الباركود. وإذا العلبة ما عليها باركود (فرط، ألعاب) ولّد واحد من «مولد الباركود» واطبعه.")}
              actions={<ToLink to="/inventory?view=barcodes" icon={ScanBarcode} label={t("audit.toGenerator", "مولد الباركود")} hide={stockLocked} />}
              canOpen={!stockLocked} restricted={restricted} />
            <Check kind="hand_code" rows={rows("hand_code")} title={t("audit.handCode", "رمز مكتوب باليد")}
              why={t("audit.handCodeWhy", "رقم رف أو رمز مكتوب بالإيد مو باركود المصنع — يوم تنمسح العلبة يگول «ما ينعرف» والمادة موجودة، وهذا أول مصدر للتوائم.")}
              fix={t("audit.handCodeFix", "افتح المادة وامسح باركود العلبة بخانة الباركود — الرمز القديم يبقى رمز إضافي فما يضيع رقم الرف.")}
              chip={(r) => handWhy(t, r.why)} canOpen={!stockLocked} restricted={restricted} />
            <HealthChecks rows={health} />
          </Section>

          <Section id="dups" icon={CopyIcon} title={t("audit.sDups", "مكرّر محتمل")}>
            <GroupCheck kind="dup_twin" rows={rows("dup_twin")} title={t("audit.dupTwin", "رقم رف وباركود مصنع بنفس الاسم")}
              why={t("audit.dupTwinWhy", "نفس الاسم: وحدة بلا باركود أو برقم رف، ووحدة بباركود المصنع — الغالب نفس المادة دخلت مرتين، ورصيدها مقسوم على صفّين.")}
              fix={t("audit.dupTwinFix", "افحص العلبة. إذا نفسها: افتح صف «الرف» ← «دمج بمنتج ثاني» ← اختر صف المصنع؛ الرصيد ينجمع ورقم الرف يصير رمز إضافي. وإذا مو نفسها: ميّز الاسم.")}
              chip={(r) => (r.why === "shelf" ? t("audit.roleShelf", "رف") : r.why === "factory" ? t("audit.roleFactory", "مصنع") : null)}
              canOpen={!stockLocked} restricted={restricted} />
            <GroupCheck kind="dup_name" rows={rows("dup_name")} title={t("audit.dupName", "نفس الاسم برموز مختلفة")}
              why={t("audit.dupNameWhy", "ممكن نكهات أو أحجام مختلفة بنفس الاسم — وممكن نفس المادة مرتين. بشاشة البيع يبينون نفس الشي.")}
              fix={t("audit.dupNameFix", "افحص العلبة: إذا نفسها افتح وحدة منهم ← «دمج بمنتج ثاني». وإذا مختلفة، زيد بالاسم شنو يفرّقها (النكهة، الحجم).")}
              canOpen={!stockLocked} restricted={restricted} />
          </Section>

          <Section id="impossible" icon={AlertTriangle} title={t("audit.sImpossible", "كميات مستحيلة")}>
            <Check kind="impossible" rows={rows("impossible")} title={t("audit.impossible", "رصيد ما ينباع بسنة")}
              why={t("audit.impossibleWhy", "رصيد يحتاج أكثر من سنة حتى ينباع بمعدّل بيعك، وقيمته كبيرة على مخزنك — أو عدد وحدات انكتب علب. هذا يضخّم قيمة المخزن كلها.")}
              fix={t("audit.impossibleFix", "عدّ المادة بالرف من «الجرد اليومي» واكتب العدد الصحيح، وسبب الفرق «خطأ إدخال» — مو «عجز»، العجز يسجّل سحب فلوس.")}
              actions={<ToLink to="/inventory/count" icon={ClipboardCheck} label={t("audit.toCount", "الجرد اليومي")} />}
              detail={(r) => impossibleDetail(t, r)} canOpen={!stockLocked} restricted={restricted} showValue />
          </Section>

          <Section id="idle" icon={Hourglass} title={t("audit.sIdle", "راكد")}>
            <Check kind="never_sold" rows={rows("never_sold")} title={t("audit.neverSold", "ما انباعت أبداً")}
              why={t("audit.neverSoldWhy", "عليها رصيد وما انباعت ولا مرة من دخلت (أكثر من ٣٠ يوم).")}
              fix={t("audit.idleFix", "رجّعها للشركة، أو نزّل سعرها، أو اطلب أقل المرة الجاية. وإذا الرصيد نفسه غلط صحّحه من «الجرد اليومي».")}
              detail={(r) => t("audit.ageDays", { n: formatNum(r.days ?? 0), defaultValue: "دخلت قبل {{n}} يوم" })}
              canOpen={!stockLocked} restricted={restricted} showValue />
            <Check kind="stopped" rows={rows("stopped")} title={t("audit.stopped", "وقف بيعها")}
              why={t("audit.stoppedWhy", "انباعت قبل، بس آخر بيع صار قبل أكثر من ٣٠ يوم والرصيد باقي.")}
              fix={t("audit.idleFix", "رجّعها للشركة، أو نزّل سعرها، أو اطلب أقل المرة الجاية. وإذا الرصيد نفسه غلط صحّحه من «الجرد اليومي».")}
              detail={(r) => t("audit.sinceDays", { n: formatNum(r.days ?? 0), defaultValue: "آخر بيع قبل {{n}} يوم" })}
              canOpen={!stockLocked} restricted={restricted} showValue />
            <Check kind="slow" rows={rows("slow")} title={t("audit.slow", "بطيئة")}
              why={t("audit.slowWhy", "تنباع، بس رصيدها يكفي أكثر من ١٨٠ يوم بمعدّل البيع الحالي.")}
              fix={t("audit.idleFix", "رجّعها للشركة، أو نزّل سعرها، أو اطلب أقل المرة الجاية. وإذا الرصيد نفسه غلط صحّحه من «الجرد اليومي».")}
              detail={(r) => coverText(t, r.days)}
              canOpen={!stockLocked} restricted={restricted} showValue />
          </Section>

          <Section id="zero" icon={TrendingDown} title={t("audit.sZero", "رصيده صفر وينباع")}>
            <Check kind="zero_sold" rows={rows("zero_sold")} title={t("audit.zeroSold", "رصيدها صفر وانباعت بآخر ٣٠ يوم")}
              why={t("audit.zeroSoldWhy", "خلصت وهي تنطلب — أو موجودة بالرف ورصيدها بالنظام غلط، فتبين «خالصة» بشاشة البيع.")}
              fix={t("audit.zeroSoldFix", "إذا موجودة بالرف: عدّها بـ«الجرد اليومي». وإذا وصلت بضاعة: سجّل فاتورة الشراء حتى يصير رصيدها صح. وإذا خلصت فعلاً: اطلبها.")}
              actions={<ToLink to="/inventory/count" icon={ClipboardCheck} label={t("audit.toCount", "الجرد اليومي")} />}
              detail={(r) => t("audit.soldRecent", { n: formatQty(r.qty ?? 0), d: formatNum(r.days ?? 0), defaultValue: "انباع {{n}} — آخر بيع قبل {{d}} يوم" })}
              canOpen={!stockLocked} restricted={restricted} />
          </Section>

          <Section id="companies" icon={Building2} title={t("audit.sCompanies", "الشركات")}>
            <Check kind="no_company" rows={rows("no_company")} title={t("audit.noCompany", "بلا شركة")}
              why={t("audit.noCompanyWhy", "تطلع تحت «بدون شركة» باقتراح الطلبية وبقائمة الإرجاع للمندوب — فما تنحسب على شركتها.")}
              fix={t("audit.noCompanyFix", "افتح المادة واختر شركتها. «مقترحة» يعني مواد ثانية بنفس أول ٧ أرقام من باركود المصنع كلها بهالشركة — تأكد قبل لا تختار.")}
              chip={(r) => (r.why === "hint" && r.company_name ? t("audit.suggested", { c: r.company_name, defaultValue: "مقترحة: {{c}}" }) : null)}
              canOpen={!stockLocked} restricted={restricted} />
            <GroupCheck kind="prefix_split" rows={rows("prefix_split")} title={t("audit.prefixSplit", "بادئة مصنع على أكثر من شركة")}
              why={t("audit.prefixSplitWhy", "أول ٧ أرقام من الباركود (رقم المصنع) نفسها، والمواد موزّعة على شركات مختلفة — الغالب وحدة منهم شركتها غلط.")}
              fix={t("audit.prefixSplitFix", "افتح المادة اللي شركتها تختلف عن أخواتها وصحّحها. وإذا نفس المصنع يجيك فعلاً من موزّعين، خليها.")}
              chip={(r) => r.company_name ?? null} canOpen={!stockLocked} restricted={restricted} groupLabel={(g) => t("audit.prefix", { p: g, defaultValue: "بادئة {{p}}" })} />
          </Section>
        </>
      )}
    </div>
  );
}

/* ---- أجزاء العرض ---------------------------------------------------------- */

type TFn = ReturnType<typeof useTranslation>["t"];

function handWhy(t: TFn, why: string | null): string | null {
  const m: Record<string, string> = {
    short: t("audit.hShort", "قصير — رقم رف"),
    length: t("audit.hLength", "طوله مو طول باركود"),
    check: t("audit.hCheck", "رقم التحقق غلط"),
    pattern: t("audit.hPattern", "أرقام متسلسلة أو مكرّرة"),
    internal: t("audit.hInternal", "رمز داخلي مو من مولّدك"),
    ean8_prefix: t("audit.hEan8", "أول ٨ أرقام من باركود مادة ثانية"),
  };
  return why ? m[why] ?? null : null;
}

/** الكفاية: لا بيع بالمدّة، أو أيامٌ — وسقفُها (مئةُ سنة) يُقال كما هو لا رقماً يوهم بالدقّة. */
function coverText(t: TFn, days: number | null): string {
  if (days == null) return t("audit.noSaleWindow", "صافي بيعها بالمدة صفر");
  if (days >= COVER_MAX) return t("audit.coverCentury", "تكفي أكثر من مئة سنة");
  return t("audit.coverDays", { n: formatNum(days), defaultValue: "تكفي {{n}} يوم" });
}

function impossibleDetail(t: TFn, r: InventoryAuditRow): string {
  const cover = coverText(t, r.days);
  return r.why === "units"
    ? `${t("audit.unitsShape", { n: formatQty(r.qty ?? 0), defaultValue: "الرصيد + المبيع = {{n}} بالضبط مضاعف لعدد الوحدات بالعلبة — الأرجح عدد وحدات انكتب علب" })} · ${cover}`
    : cover;
}

/** مجموعاتٌ بمفتاحها (`grp`) بترتيب أوّل ظهور. */
function groupsOf(rows: InventoryAuditRow[]): [string, InventoryAuditRow[]][] {
  const m = new Map<string, InventoryAuditRow[]>();
  for (const r of rows) {
    const k = r.grp ?? r.product_id;
    const a = m.get(k);
    if (a) a.push(r); else m.set(k, [r]);
  }
  return [...m.entries()];
}

function Section({ id, icon: Icon, title, children }: { id: string; icon: typeof Barcode; title: string; children: ReactNode }) {
  return (
    <section id={`audit-${id}`} className="mb-5 scroll-mt-4" data-audit-section={id}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink"><Icon size={16} className="text-brand-600" /> {title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ToLink({ to, icon: Icon, label, hide }: { to: string; icon: typeof Barcode; label: string; hide?: boolean }) {
  if (hide) return null;
  return (
    <Link to={to} onClick={() => playTap()} className="btn-secondary gap-1.5 px-3.5 py-1.5 text-xs">
      <Icon size={14} /> {label}
    </Link>
  );
}

function OpenLink({ id, show }: { id: string; show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Link to={`/inventory?edit=${encodeURIComponent(id)}`} onClick={() => playTap()} data-audit-open
      aria-label={t("audit.open", "افتح المادة")} title={t("audit.open", "افتح المادة")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600">
      <Pencil size={14} />
    </Link>
  );
}

function Shell({ kind, title, n, why, fix, actions, children }: {
  kind: string; title: string; n: number; why: string; fix: string; actions?: ReactNode; children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (n === 0) {
    return (
      <div className="card flex items-center gap-2 px-3 py-2.5 text-xs" data-audit-check={kind} data-audit-n="0">
        <span className="min-w-0 flex-1 font-bold text-ink-muted">{title}</span>
        <span className="font-bold text-success-700 dark:text-success-300">{t("audit.none", "ماكو ✓")}</span>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden" data-audit-check={kind} data-audit-n={n}>
      <button type="button" onClick={() => { playTap(); setOpen((o) => !o); }} aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-start transition hover:bg-surface-2/60">
        <AlertTriangle size={15} className="shrink-0 text-warn-600 dark:text-warn-300" />
        <span className="min-w-0 flex-1 text-sm font-extrabold text-ink">{title}</span>
        <span className="rounded-full bg-warn-50 px-2.5 py-0.5 text-xs font-extrabold tabular-nums text-warn-800 dark:bg-warn-500/15 dark:text-warn-200">{formatNum(n)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2.5">
          <p className="text-xs leading-relaxed text-ink-muted">{why}</p>
          <p className="rounded-lg bg-brand-50 px-2.5 py-2 text-xs font-semibold leading-relaxed text-brand-800 dark:bg-brand-500/10 dark:text-brand-200" data-audit-fix>
            <span className="font-extrabold">{t("audit.fixLabel", "التصليح:")}</span> {fix}
          </p>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

function Row({ r, chip, detail, canOpen, restricted, showValue }: {
  r: InventoryAuditRow; chip?: string | null; detail?: string | null; canOpen: boolean; restricted: boolean; showValue?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5" data-audit-row>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-xs font-bold text-ink">{r.product_name}</p>
        <p className="truncate text-2xs text-ink-subtle">
          {r.code ? <span className="font-mono" dir="ltr">{r.code}</span> : t("audit.noCodeShort", "بلا باركود")}
          {" · "}{t("audit.stock", { n: formatQty(r.stock), defaultValue: "الرصيد {{n}}" })}
          {showValue && !restricted && r.value > 0 && <> · {money(r.value)}</>}
          {detail && <> · {detail}</>}
        </p>
      </div>
      {chip && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-bold text-ink-muted">{chip}</span>}
      <OpenLink id={r.product_id} show={canOpen} />
    </li>
  );
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const { t } = useTranslation();
  if (shown >= total) return null;
  return (
    <Button size="sm" variant="ghost" onClick={() => { playTap(); onMore(); }}>
      {t("audit.more", { n: formatNum(total - shown), defaultValue: "اعرض الباقي ({{n}})" })}
    </Button>
  );
}

function Check({ kind, rows, title, why, fix, actions, chip, detail, canOpen, restricted, showValue }: {
  kind: AuditKind; rows: InventoryAuditRow[]; title: string; why: string; fix: string; actions?: ReactNode;
  chip?: (r: InventoryAuditRow) => string | null; detail?: (r: InventoryAuditRow) => string | null;
  canOpen: boolean; restricted: boolean; showValue?: boolean;
}) {
  const [limit, setLimit] = useState(PAGE);
  const sorted = useMemo(() => [...rows].sort((a, b) => (showValue ? b.value - a.value : 0) || a.product_name.localeCompare(b.product_name)), [rows, showValue]);
  return (
    <Shell kind={kind} title={title} n={rows.length} why={why} fix={fix} actions={actions}>
      <ul className="divide-y divide-line/60">
        {sorted.slice(0, limit).map((r) => (
          <Row key={r.product_id} r={r} chip={chip?.(r)} detail={detail?.(r)} canOpen={canOpen} restricted={restricted} showValue={showValue} />
        ))}
      </ul>
      <More shown={limit} total={sorted.length} onMore={() => setLimit((n) => n + PAGE * 4)} />
    </Shell>
  );
}

function GroupCheck({ kind, rows, title, why, fix, chip, canOpen, restricted, groupLabel }: {
  kind: AuditKind; rows: InventoryAuditRow[]; title: string; why: string; fix: string;
  chip?: (r: InventoryAuditRow) => string | null; canOpen: boolean; restricted: boolean; groupLabel?: (g: string) => string;
}) {
  const [limit, setLimit] = useState(PAGE);
  const groups = useMemo(() => groupsOf(rows), [rows]);
  return (
    <Shell kind={kind} title={title} n={groups.length} why={why} fix={fix}>
      <div className="space-y-2">
        {groups.slice(0, limit).map(([g, list]) => (
          <div key={g} className="rounded-xl border border-line px-2.5 py-1" data-audit-group>
            {groupLabel && <p className="pt-1 font-mono text-2xs font-bold text-ink-subtle" dir="ltr">{groupLabel(g)}</p>}
            <ul className="divide-y divide-line/60">
              {list.map((r) => <Row key={r.product_id} r={r} chip={chip?.(r)} canOpen={canOpen} restricted={restricted} />)}
            </ul>
          </div>
        ))}
      </div>
      <More shown={limit} total={groups.length} onMore={() => setLimit((n) => n + PAGE * 4)} />
    </Shell>
  );
}

/** أنواعُ 0168 بنصوص بطاقتها نفسِها (`barcodeHealth.*`) — نفسُ الكلام بالمكانين. */
function HealthChecks({ rows }: { rows: BarcodeHealthRow[] }) {
  const { t } = useTranslation();
  const kinds: BarcodeAilment[] = ["twin", "alt_owned", "empty", "arabic", "excel"];
  const title: Record<BarcodeAilment, string> = {
    twin: t("barcodeHealth.twin", "رمز واحد على أكثر من منتج"),
    alt_owned: t("barcodeHealth.altOwned", "رمز إضافي صاحبه منتج ثاني"),
    empty: t("barcodeHealth.empty", "رمز يبيّن موجود وهو فاضي"),
    arabic: t("barcodeHealth.arabic", "باركود بأحرف عربية"),
    excel: t("barcodeHealth.excel", "باركود شوّهه إكسل"),
  };
  const fix: Record<BarcodeAilment, string> = {
    twin: t("barcodeHealth.twinFix", "المسحة تبيع واحد منهم بلا قاعدة. ادمج المنتجين من المخزون، أو غيّر رمز واحد منهم."),
    alt_owned: t("barcodeHealth.altOwnedFix", "الرمز إضافي هنا وأساسي عند منتج ثاني — المسحة تروح لصاحبه الأصلي. شيله من الرموز الإضافية أو ادمج المنتجين."),
    empty: t("barcodeHealth.emptyFix", "كله مسافات أو محارف اتجاه خفية — ما يطابق ولا مسحة. افتح المنتج وامسح باركود العلبة من جديد."),
    arabic: t("barcodeHealth.arabicFix", "الكيبورد كان عربي وقت المسح. بدّل لغة الكيبورد إنكليزي وامسح العلبة من جديد."),
    excel: t("barcodeHealth.excelFix", "الرقم الأصلي ما ينسترجع من هذا الشكل. امسح العلبة من جديد — وبإكسل خلّي عمود الباركود «نص» قبل اللصق."),
  };
  const { stockLocked } = useOverride();
  const why = t("audit.healthWhy", "من فحص صحة الباركودات بمولد الباركود.");
  return (
    <>
      {kinds.map((k) => {
        const list = rows.filter((r) => r.kind === k);
        return list.length === 0 ? null
          : <HealthCheck key={k} kind={k} list={list} title={title[k]} why={why} fix={fix[k]} canOpen={!stockLocked} />;
      })}
    </>
  );
}

/** نوعٌ واحد من 0168 — بعدّاد «اعرض الباقي» خاصٍّ به لا مشتركٍ بين الخمسة. */
function HealthCheck({ kind, list, title, why, fix, canOpen }: {
  kind: BarcodeAilment; list: BarcodeHealthRow[]; title: string; why: string; fix: string; canOpen: boolean;
}) {
  const [limit, setLimit] = useState(PAGE);
  return (
    <Shell kind={`bc_${kind}`} title={title} n={list.length} why={why} fix={fix}>
      <ul className="divide-y divide-line/60">
        {list.slice(0, limit).map((r, i) => (
          <li key={`${r.product_id}-${r.code}-${i}`} className="flex flex-wrap items-center gap-x-2 py-1.5" data-audit-row>
            <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">{r.product_name}</span>
            <span className="font-mono text-2xs text-ink-subtle" dir="ltr">{r.code}</span>
            <OpenLink id={r.product_id} show={canOpen} />
          </li>
        ))}
      </ul>
      <More shown={limit} total={list.length} onMore={() => setLimit((n) => n + PAGE * 4)} />
    </Shell>
  );
}
