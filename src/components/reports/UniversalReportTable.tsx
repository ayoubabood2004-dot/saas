import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, ArrowUpDown, ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, formatNum, dateLocale } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { exportReportXlsx } from "@/lib/excelExport";
import { repo } from "@/lib/repo";

/* ============================================================================
 * UniversalReportTable — the clinic's "Enterprise Report Engine".
 *
 * One component dictates how ANY report looks in two worlds:
 *  • On screen: a sleek dark-mode data table (sticky header, hover, sorting,
 *    pagination) with summary cards and a "طباعة التقرير" button.
 *  • On paper: a portal-mounted, minimalist WHITE-LABEL document — clinic
 *    letterhead, a clean breathable grid, and elegant boxed summary metrics.
 *    Global @media print (index.css) hides the app (#root) and reveals the
 *    portal, so long tables paginate naturally across pages.
 *
 * Reusable: pass columns + data + summaryMetrics; the Transaction Log is the
 * first use-case. Western numerals throughout; RTL-aware alignment.
 * ==========================================================================*/

export type ReportAlign = "start" | "end" | "center";

export interface ReportColumn<T> {
  key: string;
  header: string;
  /** Screen cell (may include colored/styled nodes). */
  cell: (row: T) => ReactNode;
  /** Plain value for the clean print document (falls back to `cell`). */
  printCell?: (row: T) => ReactNode;
  /** Logical alignment — with dir=rtl, "start"=right, "end"=left (numbers). */
  align?: ReportAlign;
  /** When set, the header becomes a sort toggle for this key. */
  sortKey?: string;
  /** Raw value for the Excel export (numbers stay summable). Falls back to printCell/cell. */
  excelValue?: (row: T) => string | number;
  /** Export this column as a real Excel number with `numFmt` (default "#,##0"). */
  numeric?: boolean;
  numFmt?: string;
}

export interface SummaryMetric { label: string; value: string }

interface Props<T> {
  title: string;
  clinicName?: string;
  /** Subtitle under the title (screen + print letterhead), rendered VERBATIM —
   *  include your own prefix (e.g. "الفترة: …" or "المريض: …"). */
  dateRangeLabel?: string;
  /** Label for the print button (default "طباعة التقرير"). */
  printButtonLabel?: string;
  /** Granular columns — drive the print document, Excel export, and sorting. */
  columns: ReportColumn<T>[];
  /** Optional composite columns for the on-screen table only (data stacking for tablets).
   *  Falls back to `columns`. Print & Excel always use the granular `columns`. */
  screenColumns?: ReportColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  summaryMetrics?: SummaryMetric[];
  /** Screen-only content rendered above the toolbar (e.g. a trend chart). */
  chart?: ReactNode;
  /** Screen-only controls rendered just above the table (search, export…). */
  toolbar?: ReactNode;
  emptyText?: string;
  pageSize?: number;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  isRowMuted?: (row: T) => boolean;
  /** Base file name for the Excel export (".xlsx" appended). */
  exportFileName?: string;
  /** Render only the export/print action buttons + the print portal — no title,
   *  summary, chart, toolbar or on-screen table. Lets a host view (e.g. the interactive
   *  timeline workspace) keep the A4 print + Excel export without the summary grid. */
  printOnly?: boolean;
  /** Render ONLY the on-screen data table (no header, buttons, summary, chart, toolbar
   *  or print portal) — for hosts that supply their own chrome and just want the dense grid. */
  tableOnly?: boolean;
}

const alignClass = (a?: ReportAlign) => (a === "end" ? "text-end" : a === "center" ? "text-center" : "text-start");

export function UniversalReportTable<T>({
  title, clinicName, dateRangeLabel, printButtonLabel, columns, screenColumns, data, rowKey,
  summaryMetrics = [], chart, toolbar, emptyText,
  pageSize = 25, sort, onSort, isRowMuted, exportFileName, printOnly = false, tableOnly = false,
}: Props<T>) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  // The on-screen table may use fewer, composite columns; print/Excel stay granular.
  const screenCols = screenColumns ?? columns;
  const emptyLabel = emptyText ?? t("report.empty");

  // Styled .xlsx export — real numbers stay summable; xlsx-js-style loads on demand.
  const handleExport = async () => {
    if (exporting || data.length === 0) return;
    setExporting(true);
    try {
      const xlCols = columns.map((c) => ({ header: c.header, numeric: !!c.numeric, numFmt: c.numFmt }));
      const xlRows = data.map((row) => columns.map((c) => {
        if (c.excelValue) return c.excelValue(row);
        const v = (c.printCell ?? c.cell)(row);
        return typeof v === "number" || typeof v === "string" ? v : String(v ?? "");
      }));
      await exportReportXlsx({
        fileName: (exportFileName || title || "report").replace(/[\\/:*?"<>|]/g, "-"),
        title, clinicName, dateRange: dateRangeLabel,
        columns: xlCols, rows: xlRows,
        summary: summaryMetrics.map((m) => ({ label: m.label, value: m.value })),
      });
      toast.success(t("report.exported"), "XLSX");
      void repo.logClientEvent("report.excel", { title }); // activity trail
    } catch (e) {
      toast.error(t("report.exportFail"), e instanceof Error ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  // A new data reference (filter/sort/date change) resets to the first page.
  useEffect(() => { setPage(0); }, [data]);

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = data.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // Mount the print document just-in-time, print, then tear it down (keeps the
  // heavy full-data table out of the live DOM until it's actually needed).
  // The body class scopes the "hide the app" print CSS to REPORT prints only, so
  // legacy window.print() flows elsewhere (.print-area cards) keep working.
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("report-printing");
    const t = window.setTimeout(() => window.print(), 80);
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("report-printing");
    };
  }, [printing]);

  const issued = useMemo(() => new Date().toLocaleDateString(i18n.language === "ar" ? dateLocale() : "en-GB", { day: "2-digit", month: "long", year: "numeric" }), [i18n.language]);
  const clinic = (clinicName || "").trim() || t("report.clinicFallback");

  return (
    <div className="space-y-4">
      {/* Header — title, range, print */}
      {!tableOnly && (
        <div className={cn("flex flex-wrap items-center gap-3", printOnly && "justify-end")}>
          {!printOnly && (
            <div className="me-auto">
              <h3 className="font-display text-lg font-extrabold text-ink">{title}</h3>
              {dateRangeLabel && <p className="text-2xs text-ink-subtle">{dateRangeLabel}</p>}
            </div>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || data.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-success-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-success-700 disabled:opacity-50"
          >
            <FileSpreadsheet size={16} /> {exporting ? t("report.exporting") : t("report.exportExcel")}
          </button>
          <button
            onClick={() => { setPrinting(true); void repo.logClientEvent("report.print", { title }); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700"
          >
            <Printer size={16} /> {printButtonLabel ?? t("report.print")}
          </button>
        </div>
      )}

      {/* Summary cards (screen) */}
      {!printOnly && !tableOnly && summaryMetrics.length > 0 && (
        <div className={cn("grid grid-cols-2 gap-3", summaryMetrics.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          {summaryMetrics.map((m, i) => (
            <div key={i} className="card p-4">
              <p className="text-2xs font-semibold text-ink-subtle">{m.label}</p>
              <p className="mt-0.5 font-display text-lg font-extrabold tabular-nums text-ink">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {!printOnly && !tableOnly && chart}
      {!printOnly && !tableOnly && toolbar}

      {/* Screen data table */}
      {printOnly ? null : data.length === 0 ? (
        <div className="card grid place-items-center p-12 text-center text-ink-subtle">{emptyLabel}</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
                <tr>
                  {screenCols.map((c) => (
                    <th key={c.key} className={cn("border-b border-line px-3 py-2.5 text-2xs font-bold text-ink-muted", alignClass(c.align))}>
                      {c.sortKey && onSort ? (
                        <button onClick={() => onSort(c.sortKey!)} className="inline-flex items-center gap-1 transition hover:text-brand-600">
                          {c.header}<ArrowUpDown size={11} className={sort?.key === c.sortKey ? "text-brand-600" : "opacity-40"} />
                        </button>
                      ) : c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={rowKey(row)} className={cn("border-b border-line/60 align-top transition hover:bg-surface-2/60", isRowMuted?.(row) && "opacity-60")}>
                    {screenCols.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2.5", alignClass(c.align))}>{c.cell(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-ink-subtle">
              <span>{t("report.pageOf", { from: formatNum(safePage * pageSize + 1), to: formatNum(Math.min(data.length, (safePage + 1) * pageSize)), total: formatNum(data.length) })}</span>
              <div className="flex items-center gap-1">
                <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-muted transition hover:bg-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
                <span className="px-2 font-semibold text-ink">{formatNum(safePage + 1)} / {formatNum(pageCount)}</span>
                <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-muted transition hover:bg-surface-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Print document — mounted just-in-time, escapes #root via a body portal */}
      {printing && createPortal(
        <div data-report-print dir="rtl">
          <div className="rp-doc">
            <header className="rp-head">
              <div className="rp-clinic">{clinic}</div>
              <div className="rp-title">{title}</div>
              {dateRangeLabel && <div className="rp-range">{dateRangeLabel}</div>}
              <div className="rp-meta">{t("report.issuedAt", { date: issued })}</div>
            </header>

            <table className="rp-table">
              <thead>
                <tr>{columns.map((c) => <th key={c.key} style={{ textAlign: c.align ?? "start" }}>{c.header}</th>)}</tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={rowKey(row)}>
                    {columns.map((c) => <td key={c.key} style={{ textAlign: c.align ?? "start" }}>{(c.printCell ?? c.cell)(row)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>

            {summaryMetrics.length > 0 && (
              <section className="rp-summary">
                {summaryMetrics.map((m, i) => (
                  <div key={i} className="rp-metric">
                    <div className="rp-metric-label">{m.label}</div>
                    <div className="rp-metric-value">{m.value}</div>
                  </div>
                ))}
              </section>
            )}

            <footer className="rp-foot">{t("report.recordCount", { n: formatNum(data.length), date: issued })}</footer>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
