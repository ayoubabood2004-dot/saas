import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type TFunction } from "i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Barcode, Building2, ClipboardCheck, Copy as CopyIcon, FileSpreadsheet, Hourglass, Lock,
  Pencil, Printer, RotateCw, ScanBarcode, Search, TrendingDown,
} from "lucide-react";
import type { Company, CompanySection, Product } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Skeleton, useToast } from "@/components/ui";
import { cn, formatNum, formatQty, matchCode, money, searchable } from "@/lib/utils";
import { describeDbError, withTimeout } from "@/lib/errors";
import { getClinicName } from "@/lib/settings";
import type { AuditMarks } from "@/lib/stocktake";
import { auditMarks, auditMarksFailed, MARKS_DAYS } from "@/lib/auditMarks";
import { buildStockReportHTML, openPrintWindow, writePrintWindow } from "@/lib/stockReportPrint";
import { buildAuditModel, buildAuditReportHTML, countOf, groupsOf, SECTION_TONE, summarize, valueOf, type AuditData, type AuditTotals, type ReportCheck, type ReportRow, type ReportSection, type Tone } from "@/lib/auditReport";
import { exportStocktakeXlsx } from "@/lib/stockReportXlsx";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * فحصُ المخزن (0245) — ما وجده جردٌ يدويٌّ لعيادةٍ واحدة، تراه كلُّ عيادةٍ بنفسها.
 *
 * الحسابُ كلُّه بالقاعدة (`report_inventory_audit_json` و`verify_barcode_health` معاً —
 * هذه تُكمل تلك ولا تكرّرها)، وهذه الوحدةُ تعرض وتقول الطريق ولا تحسب. ولا زرَّ إصلاحٍ
 * جماعيّ ولا دمجٍ تلقائيّ (الخطّ الأحمر الأوّل): كلُّ ملاحظةٍ لها طريقُها الموجود بالتطبيق.
 *
 * **مثبَّتٌ داخل الجرد** (طلبُ المالك): `InventoryAuditView` تبويبٌ بـ«الجرد اليومي»، و
 * `StockReportButtons` أزرارُ «طباعة تقرير جرد» و«تصدير جرد إكسل» بعلامات الفحص على كلّ سطر.
 * وهذا الملفُّ مالكُ نطاق `audit` (hot-paths.json): الملفّان يحمّلانه بـpage(…, ["audit"])،
 * فالنصوصُ تُترجم هنا وتصل المخرجَين **بيانات** (`AuditMarks`) — لا عربيةَ صلبةً هناك.
 *
 * نموذجٌ واحد (`buildModel`) يرسم الشاشةَ ويطبع الورقة: نصٌّ يُكتب مرّتين يفترق يوماً.
 * والفشلُ يُقال ولا يُعرض نصفُ فحص: النداءان معاً أو لا شيء.
 * ========================================================================= */

const WINDOWS = [30, 90, 180] as const;
type Win = (typeof WINDOWS)[number];
const KEY = "vp_audit_days";
const PAGE = 25;
/** مهلةُ الفحص: طلبٌ عالقٌ على نتٍّ متوقّف كان يترك الهياكلَ للأبد بلا «أعد المحاولة». */
const AUDIT_TIMEOUT = 20_000;
/** الكتلُ المفتوحة تعيش ما عاشت الصفحة (لا تخزين): «افتح المادة» ثم الرجوع كان يطويها كلَّها،
 *  فمن يصلّح عشرَ مواد من كتلةٍ واحدة يفتحها ويبحث عن مكانه عشرَ مرّات. */
const openBlocks = new Set<string>();

function readWin(): Win {
  try {
    const v = Number(localStorage.getItem(KEY));
    if ((WINDOWS as readonly number[]).includes(v)) return v as Win;
  } catch { /* swallow-ok: تفضيلُ عرضٍ بالجهاز، وغيابُه = ٩٠ يوماً */ }
  return 90;
}

type Data = AuditData;
type Icon = typeof Barcode;

/** صفٌّ معروض وفحصٌ وقسم — أنواعُ auditReport.ts، والقسمُ هنا بأيقونته. */
type VRow = ReportRow;
type CheckM = ReportCheck;
type SectionM = ReportSection & { icon: Icon };

/* العدُّ والقيمةُ والمجموعاتُ من auditReport.ts — الشاشةُ والتقريرُ المطبوع يعدّان بالدالّة نفسِها. */

/** إجماليّاتُ المخزن للتقرير المطبوع: مخزنُ العيادة (لا مخزنُ الحقل — كالفحص)، والقيمةُ بالشراء. */
function totalsOf(products: Product[]): AuditTotals {
  const own = products.filter((p) => !p.farm_id);
  return {
    products: own.length,
    value: own.reduce((s, p) => s + Math.max(Number(p.stock) || 0, 0) * Math.max(Number(p.purchase_price) || 0, 0), 0),
  };
}

const TONE_TEXT: Record<Tone, string> = {
  bad: "text-danger-700 dark:text-danger-300", warn: "text-warn-700 dark:text-warn-300",
  info: "text-brand-700 dark:text-brand-300", ok: "text-success-700 dark:text-success-300",
};
const TONE_EDGE: Record<Tone, string> = {
  bad: "border-s-danger-500", warn: "border-s-warn-500", info: "border-s-brand-500", ok: "border-s-success-500",
};

const SECTION_ICON: Record<string, Icon> = { codes: ScanBarcode, dups: CopyIcon, impossible: AlertTriangle, idle: Hourglass, zero: TrendingDown, companies: Building2 };
const ACTION_ICON: Record<"scan" | "count", Icon> = { scan: ScanBarcode, count: ClipboardCheck };
/** النموذجُ من auditReport.ts (الشاشةُ والورقةُ والحزمةُ من الدالّة نفسِها) — والأيقونةُ هنا وحدها. */
function buildModel(t: TFunction, data: Data, keep: (name: string, code: string | null | undefined) => boolean): SectionM[] {
  return buildAuditModel(t, data, keep).map((s) => ({ ...s, icon: SECTION_ICON[s.id] ?? AlertTriangle }));
}

/** الفحصُ للمدير والطبيب كالدالّة، وبإذن المخزن كالمخزن نفسِه. */
function useAuditAllowed(): boolean {
  const { role, can } = usePermissions();
  return (role === "manager" || role === "veterinarian") && can("manageInventory");
}

/* ── الشاشة ───────────────────────────────────────────────────────────────── */

/** `embedded`: داخل «الجرد اليومي» — بلا رأس صفحةٍ ولا رجوع، والباقي حرفاً كما هو. */
/** `newTabLinks`: بالجرد عدٌّ مكتوبٌ لم يُرسل — روابطُ الفحص الخارجة تنفتح بتبويبٍ جديد، فلا تُغلق
 *  صفحةُ الجرد ويضيع ما كُتب (حالةُ الصفحة وحدها تحمله). و«الجرد اليومي» من هنا يقلب التبويبَ نفسه. */
export function InventoryAuditView({ embedded = false, newTabLinks = false }: { embedded?: boolean; newTabLinks?: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { restricted, stockLocked } = useOverride();
  const allowed = useAuditAllowed();
  const [win, setWin] = useState<Win>(readWin);
  const [data, setData] = useState<Data | "loading" | { error: string }>("loading");
  const [q, setQ] = useState("");
  const [printing, setPrinting] = useState(false);
  /* تطبيقُ الشاشة الرئيسية بآيفون يفتح التبويبَ الجديد بعرض سفاري **بلا جلسته** (تخزينٌ منفصل) — فالرابطُ
   * يصل شاشةَ الدخول. هناك تُطفأ روابطُ الفتح ما دام عدٌّ معلَّقاً، ويُقال «سجّله أول». */
  const iosApp = typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const links: "same" | "new" | "off" = !newTabLinks ? "same" : iosApp ? "off" : "new";

  /* آخرُ طلبٍ وحده يكتب: ٣٠ ثم ١٨٠ بسرعة، والأبطأُ الأقدمُ كان يكتب فوق الأحدث تحت زرّه. */
  const seq = useRef(0);
  useEffect(() => () => { seq.current++; }, []);
  /* `t` بمرجعٍ لا باعتماد الجلب (src/i18n/index.ts): وصولُ نطاقٍ كسول يبدّل `t` فيُعاد الجلبُ مرّتين. */
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const load = useCallback(async (days: Win) => {
    const my = ++seq.current;
    setData("loading");
    try {
      /* الأيامُ وحدها — النافذةُ تنتهي بساعة الخادم (0245). وبمهلة: الفشلُ يُقال ويُعاد. */
      const [audit, health] = await withTimeout(Promise.all([repo.inventoryAudit(days), repo.barcodeHealth()]), AUDIT_TIMEOUT);
      if (my !== seq.current) return;
      setData({ audit, health });
    } catch (e) {
      if (my !== seq.current) return;
      playWarning();
      setData({ error: describeDbError(e, tRef.current) });
    }
  }, []);
  useEffect(() => { if (allowed) void load(win); }, [allowed, load, win]);

  /* الضغطُ على المدّة المختارة نفسِها يعيد الجلب — كان لا يفعل شيئاً فوق هياكلَ عالقة. */
  const pickWin = (w: Win) => {
    playTap();
    if (w === win) { void load(w); return; }
    setWin(w);
    try { localStorage.setItem(KEY, String(w)); } catch { /* swallow-ok: تفضيلُ عرض */ }
  };

  const ready = typeof data === "object" && "audit" in data ? data : null;
  const match = useMemo(() => {
    const s = searchable(q.trim());
    const c = matchCode(q);
    if (!s && !c) return () => true;
    return (name: string, code: string | null | undefined) => (!!s && searchable(name).includes(s)) || (!!c && matchCode(code).includes(c));
  }, [q]);
  const model = useMemo(() => (ready ? buildModel(t, ready, match) : null), [t, ready, match]);
  /* الملخّصُ من الفحص كاملاً (لا ما يُرى بالبحث) — نفسُ ما يطبعه التقرير، بلا نسبٍ من إجماليّات المخزن. */
  const summary = useMemo(() => (ready ? summarize(t, buildModel(t, ready, () => true), null, restricted) : null), [t, ready, restricted]);

  if (!allowed) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("audit.noAccess", "فحص المخزن للمدير والطبيب. راجع مدير العيادة.")}</p>
      </div>
    );
  }

  /* التقريرُ كاملاً لا ما يُرى بالبحث. والنافذةُ بلحظة الضغطة (بعد انتظار الشبكة يحجبها المتصفّح)،
   * ثم إجماليّاتُ المخزن للغلاف — وفشلُها يُسقط بطاقتيها لا التقرير. */
  const print = async () => {
    if (!ready || printing) return;
    playTap();
    const w = openPrintWindow();
    if (!w) { playWarning(); toast.error(t("audit.printBlocked", "المتصفّح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة وأعد المحاولة.")); return; }
    writePrintWindow(w, `<!doctype html><meta charset="utf-8"><p style="font:16px sans-serif;padding:24px">${esc(t("common.loading", "جارٍ التحميل…"))}</p>`);
    setPrinting(true);
    try {
      let totals: AuditTotals | null = null;
      try { totals = totalsOf(await withTimeout(repo.listProducts(), 15000)); } catch { /* swallow-ok: الغلافُ بلا بطاقتي «المواد» و«القيمة» — الفحصُ نفسُه وصل */ }
      writePrintWindow(w, buildAuditReportHTML({
        t, lang: i18n.language, clinic: getClinicName() || "doctorVet", days: win, restricted,
        sections: buildModel(t, ready, () => true), totals,
      }));
    } catch (e) {
      // بناءُ الورقة أو كتابتُها فشل: النافذةُ لا تبقى على «جارٍ التحميل» والزرُّ لا يبقى يدور
      console.error(e);
      try { w.close(); } catch { /* swallow-ok: نافذةٌ أغلقها المستخدم */ }
      playWarning();
      toast.error(t("audit.rp.printFail", "ما طلع التقرير — أعد المحاولة."));
    } finally {
      setPrinting(false);
    }
  };

  const sections = model ?? [];
  const cards = sections.map((s) => ({
    id: s.id, icon: s.icon, label: s.title,
    n: s.checks.reduce((n, c) => n + countOf(c), 0),
    value: s.money ? valueOf(s.checks.flatMap((c) => c.rows)) : undefined,
  }));
  const open = (id: string) => { playTap(); document.getElementById(`audit-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const total = cards.reduce((s, x) => s + x.n, 0);

  return (
    <div className={embedded ? "" : "mx-auto max-w-5xl px-4 py-6"} data-audit-view={embedded ? "embedded" : "page"}>
      {!embedded && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ClipboardCheck size={24} /></span>
          <div className="me-auto min-w-0">
            <h1 className="font-display text-2xl font-extrabold text-ink">{t("audit.title", "فحص المخزن")}</h1>
            <p className="text-sm text-ink-subtle">{t("audit.sub", "وين الخلل بمخزنك — قراءة فقط، ما نغيّر شي، والتصليح بيدك مادة مادة.")}</p>
          </div>
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3" data-audit-window>
        <span className="text-xs font-bold text-ink-muted">{t("audit.windowLabel", "معدّل البيع من آخر:")}</span>
        {WINDOWS.map((w) => (
          <button key={w} type="button" aria-pressed={win === w} data-audit-days={w} onClick={() => pickWin(w)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-bold transition",
              win === w ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
            {t("audit.days", { n: formatNum(w), defaultValue: "{{n}} يوم" })}
          </button>
        ))}
        <span className="text-2xs text-ink-subtle">{t("audit.windowHint", "الراكد والكميات المستحيلة تنحسب بهذا المعدّل — والمادة الأحدث منه بمعدّل أيامها هي.")}</span>
        <Button size="sm" variant="secondary" className="ms-auto" leftIcon={<Printer size={14} />} disabled={!ready} loading={printing} onClick={() => void print()} data-audit-print>
          {t("audit.rp.printFull", "اطبع التقرير الكامل (PDF)")}
        </Button>
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
          {summary && (summary.findings.length > 0 || summary.steps.length > 1) && q.trim() === "" && (
            <div className="card mb-4 space-y-3 p-4" data-audit-summary>
              {summary.findings.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-sm font-extrabold text-ink">{t("audit.rp.findings", "أهم ما لگيناه")}</h2>
                  <ol className="list-decimal space-y-1 ps-5 text-xs leading-relaxed text-ink-muted" data-audit-findings>
                    {summary.findings.map((f, i) => <li key={i}>{f}</li>)}
                  </ol>
                </div>
              )}
              <div>
                <h2 className="mb-1.5 text-sm font-extrabold text-ink">{t("audit.rp.startTitle", "ابدأ من هنا: ترتيب التصليح")}</h2>
                <ol className="grid gap-1.5 sm:grid-cols-2" data-audit-steps>
                  {summary.steps.map((s, i) => (
                    <li key={s.key}>
                      <button type="button" disabled={!s.anchor} onClick={() => s.anchor && open(s.anchor)} data-audit-step={s.key}
                        className={cn("flex w-full items-start gap-2 rounded-xl border border-line border-s-4 bg-surface-1 px-3 py-2 text-start transition enabled:hover:bg-surface-2", TONE_EDGE[s.tone])}>
                        <span className="mt-0.5 text-2xs font-extrabold tabular-nums text-ink-subtle">{formatNum(i + 1)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-extrabold text-ink">{s.title}</span>
                          <span className="block text-2xs leading-relaxed text-ink-muted">{s.desc}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3" data-audit-cards>
            {cards.map((s) => (
              <button key={s.id} type="button" data-audit-card={s.id} onClick={() => open(s.id)}
                className={cn("card flex flex-col items-start gap-1 border-s-4 p-3 text-start transition hover:border-line-strong", s.n ? TONE_EDGE[SECTION_TONE[s.id] ?? "warn"] : "border-s-success-500 opacity-70")}>
                <span className={cn("flex items-center gap-1.5 text-2xs font-bold", s.n ? TONE_TEXT[SECTION_TONE[s.id] ?? "warn"] : TONE_TEXT.ok)}>
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
            {links === "new" && <span className="mt-1 block font-bold text-brand-700 dark:text-brand-300" data-audit-keepcounts>{t("audit.keepCounts", "عندك عدّ ما انسجل بعد — روابط الفحص تنفتح بتبويب جديد حتى ما يضيع.")}</span>}
            {links === "off" && <span className="mt-1 block font-bold text-warn-700 dark:text-warn-300" data-audit-savefirst>{t("audit.saveFirst", "عندك عدّ ما انسجل بعد — سجّله أول، وبعدين تفتح المواد من هنا.")}</span>}
          </p>

          {total === 0 && q.trim() === "" && (
            <p className="card mb-4 p-6 text-center text-sm font-bold text-success-700 dark:text-success-300" data-audit-clean>
              {t("audit.clean", "ماكو ملاحظات — مخزنك مرتّب بكل الفحوص ✓")}
            </p>
          )}

          {sections.map((s) => (
            <section key={s.id} id={`audit-${s.id}`} className="mb-5 scroll-mt-4" data-audit-section={s.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink"><s.icon size={16} className="text-brand-600" /> {s.title}</h2>
              <div className="space-y-2">
                {s.checks.map((c) => (
                  /* أنواعُ 0168 لا تُعرض فارغة (كبطاقتها)، وأنواعُ 0245 تقول «ماكو ✓». */
                  c.key.startsWith("bc_") && c.rows.length === 0 ? null
                    : <CheckBlock key={c.key} c={c} canOpen={!stockLocked && links !== "off"} restricted={restricted} newTab={links === "new"} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function OpenLink({ id, show, newTab }: { id: string; show: boolean; newTab: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Link to={`/inventory?edit=${encodeURIComponent(id)}`} onClick={() => playTap()} data-audit-open
      {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
      aria-label={t("audit.open", "افتح المادة")} title={t("audit.open", "افتح المادة")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600">
      <Pencil size={14} />
    </Link>
  );
}

function Row({ r, canOpen, restricted, showValue, newTab }: { r: VRow; canOpen: boolean; restricted: boolean; showValue: boolean; newTab: boolean }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5" data-audit-row>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-xs font-bold text-ink">{r.name}</p>
        <p className="truncate text-2xs text-ink-subtle">
          {r.code ? <span className="font-mono" dir="ltr">{r.code}</span> : t("audit.noCodeShort", "بلا باركود")}
          {r.stock !== null && <>{" · "}{t("audit.stock", { n: formatQty(r.stock), defaultValue: "الرصيد {{n}}" })}</>}
          {showValue && !restricted && r.value > 0 && <> · {money(r.value)}</>}
          {r.detail && <> · {r.detail}</>}
        </p>
      </div>
      {r.chip && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-bold text-ink-muted">{r.chip}</span>}
      <OpenLink id={r.id} show={canOpen} newTab={newTab} />
    </li>
  );
}

function CheckBlock({ c, canOpen, restricted, newTab }: { c: CheckM; canOpen: boolean; restricted: boolean; newTab: boolean }) {
  const { t } = useTranslation();
  const [open, setOpenState] = useState(() => openBlocks.has(c.key));
  const setOpen = (f: (o: boolean) => boolean) => setOpenState((o) => {
    const v = f(o);
    if (v) openBlocks.add(c.key); else openBlocks.delete(c.key);
    return v;
  });
  const [limit, setLimit] = useState(PAGE);
  const n = countOf(c);
  const sorted = c.rows;
  const groups = useMemo(() => (c.grouped ? groupsOf(sorted) : []), [c.grouped, sorted]);
  if (n === 0) {
    return (
      <div className="card flex items-center gap-2 px-3 py-2.5 text-xs" data-audit-check={c.key} data-audit-n="0">
        <span className="min-w-0 flex-1 font-bold text-ink-muted">{c.title}</span>
        <span className="font-bold text-success-700 dark:text-success-300">{t("audit.none", "ماكو ✓")}</span>
      </div>
    );
  }
  const total = c.grouped ? groups.length : sorted.length;
  return (
    <div className="card overflow-hidden" data-audit-check={c.key} data-audit-n={n}>
      <button type="button" onClick={() => { playTap(); setOpen((o) => !o); }} aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-start transition hover:bg-surface-2/60">
        <AlertTriangle size={15} className="shrink-0 text-warn-600 dark:text-warn-300" />
        <span className="min-w-0 flex-1 text-sm font-extrabold text-ink">{c.title}</span>
        <span className="rounded-full bg-warn-50 px-2.5 py-0.5 text-xs font-extrabold tabular-nums text-warn-800 dark:bg-warn-500/15 dark:text-warn-200">{formatNum(n)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2.5">
          <p className="text-xs leading-relaxed text-ink-muted">{c.why}</p>
          <p className="rounded-lg bg-brand-50 px-2.5 py-2 text-xs font-semibold leading-relaxed text-brand-800 dark:bg-brand-500/10 dark:text-brand-200" data-audit-fix>
            <span className="font-extrabold">{t("audit.fixLabel", "التصليح:")}</span> {c.fix}
          </p>
          {c.action && !(c.action.hideWhenLocked && !canOpen) && (
            <div className="flex flex-wrap gap-2">
              {/* «الجرد اليومي» نفسُ الصفحة (يقلب التبويب) فلا تبويبَ جديد له. */}
              <Link to={c.action.to} onClick={() => playTap()} className="btn-secondary gap-1.5 px-3.5 py-1.5 text-xs"
                {...(newTab && !c.action.to.startsWith("/inventory/count") ? { target: "_blank", rel: "noopener" } : {})}>
                {(() => { const A = ACTION_ICON[c.action.icon]; return <A size={14} />; })()} {c.action.label}
              </Link>
            </div>
          )}
          {c.grouped ? (
            <div className="space-y-2">
              {groups.slice(0, limit).map(([g, list]) => (
                <div key={g} className="rounded-xl border border-line px-2.5 py-1" data-audit-group>
                  {c.groupLabel && <p className="pt-1 font-mono text-2xs font-bold text-ink-subtle" dir="ltr">{c.groupLabel(g)}</p>}
                  <ul className="divide-y divide-line/60">
                    {list.map((r) => <Row key={r.id} r={r} canOpen={canOpen} restricted={restricted} showValue={c.showValue} newTab={newTab} />)}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-line/60">
              {sorted.slice(0, limit).map((r, i) => <Row key={`${r.id}-${i}`} r={r} canOpen={canOpen} restricted={restricted} showValue={c.showValue} newTab={newTab} />)}
            </ul>
          )}
          {total > limit && (
            <Button size="sm" variant="ghost" onClick={() => { playTap(); setLimit((x) => x + PAGE * 4); }}>
              {t("audit.more", { n: formatNum(total - limit), defaultValue: "اعرض الباقي ({{n}})" })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── الورقة المطبوعة ─────────────────────────────────────────────────────── */

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ── أزرارُ تقرير الجرد بعلامات الفحص ─────────────────────────────────────── */

/**
 * «طباعة تقرير جرد» و«تصدير جرد إكسل» — بعلامة فحصٍ لكلّ سطرٍ وسطرِ ملخّصٍ بالأعلى.
 * تُحمَّل بـpage(…, ["audit"]) من المخزن والجرد. والقوائمُ تُمرَّر إن كانت بيد الشاشة وإلا
 * تُجلب عند الضغط. ومن لا يرى الفحصَ (دورُه أو إذنُه) يأخذ الورقةَ كما كانت حرفاً — بلا
 * سطرٍ يقول «ما وصل» عن فحصٍ ليس له.
 */
export function StockReportButtons({ products, companies, sections }: {
  products?: Product[]; companies?: Company[]; sections?: CompanySection[];
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const allowed = useAuditAllowed();
  const [busy, setBusy] = useState<"print" | "xlsx" | null>(null);

  const lists = async () => {
    const [p, c, s] = await withTimeout(Promise.all([
      products ?? repo.listProducts(), companies ?? repo.listCompanies(), sections ?? repo.listCompanySections(),
    ]), 15000);
    return { p, c, s };
  };
  /* فشلُ الفحص لا يمنع الورقة (الجردُ لا ينتظر)، لكنه يُقال بسطرها الأعلى — ورقةٌ بلا علاماتٍ
   * تُقرأ «نظيفة». */
  const marks = async (): Promise<AuditMarks | undefined> => {
    if (!allowed) return undefined;
    try {
      /* بمهلة: فحصٌ معلَّقٌ على نتٍّ متوقّف كان يحبس الورقةَ على «جارٍ التحميل» — والورقةُ لا تنتظره
       * (المهلةُ فشلٌ يُقال بسطرها كأيّ فشل). */
      const [audit, health] = await withTimeout(Promise.all([repo.inventoryAudit(MARKS_DAYS), repo.barcodeHealth()]), AUDIT_TIMEOUT);
      return auditMarks(t, audit, health);
    } catch {
      return auditMarksFailed(t);
    }
  };

  const print = async () => {
    if (busy) return;
    playTap();
    /* النافذةُ بلحظة الضغطة: بعد انتظار الشبكة يحجبها المتصفّح. */
    const w = openPrintWindow();
    if (!w) { playWarning(); toast.error(t("audit.printBlocked", "المتصفّح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة وأعد المحاولة.")); return; }
    writePrintWindow(w, `<!doctype html><meta charset="utf-8"><p style="font:16px sans-serif;padding:24px">${esc(t("common.loading", "جارٍ التحميل…"))}</p>`);
    setBusy("print");
    try {
      const [{ p, c, s }, m] = await Promise.all([lists(), marks()]);
      writePrintWindow(w, buildStockReportHTML(p, c, s, m));
    } catch (e) {
      w.close();
      playWarning();
      toast.error(t("audit.reportFailed", "ما كدرنا نجيب المخزون للتقرير — أعد المحاولة."), describeDbError(e, t));
    } finally { setBusy(null); }
  };

  const xlsx = async () => {
    if (busy) return;
    playTap();
    setBusy("xlsx");
    try {
      const [{ p, c, s }, m] = await Promise.all([lists(), marks()]);
      const name = await exportStocktakeXlsx(p, c, s, m);
      playSuccess();
      toast.success(t("pos.stockXlsxDone", { name, defaultValue: "نُزّل {{name}}" }));
    } catch (e) {
      playWarning();
      toast.error(t("pos.stockXlsxFail", "تعذّر تصدير ملف الجرد"), describeDbError(e, t));
    } finally { setBusy(null); }
  };

  return (
    <>
      <Button variant="secondary" loading={busy === "print"} leftIcon={<Printer size={16} />} onClick={() => void print()} data-stockprint>
        {t("pos.stockReport", "طباعة تقرير جرد")}
      </Button>
      <Button data-xlsxbtn variant="secondary" loading={busy === "xlsx"} leftIcon={<FileSpreadsheet size={16} />} onClick={() => void xlsx()}>
        {t("pos.stockXlsx", "تصدير جرد إكسل")}
      </Button>
    </>
  );
}
