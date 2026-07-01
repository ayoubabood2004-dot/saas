import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatNum } from "@/lib/utils";

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
}

export interface SummaryMetric { label: string; value: string }

interface Props<T> {
  title: string;
  clinicName?: string;
  dateRangeLabel?: string;
  columns: ReportColumn<T>[];
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
}

const alignClass = (a?: ReportAlign) => (a === "end" ? "text-end" : a === "center" ? "text-center" : "text-start");

export function UniversalReportTable<T>({
  title, clinicName, dateRangeLabel, columns, data, rowKey,
  summaryMetrics = [], chart, toolbar, emptyText = "لا توجد بيانات لعرضها.",
  pageSize = 25, sort, onSort, isRowMuted,
}: Props<T>) {
  const [page, setPage] = useState(0);
  const [printing, setPrinting] = useState(false);

  // A new data reference (filter/sort/date change) resets to the first page.
  useEffect(() => { setPage(0); }, [data]);

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = data.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // Mount the print document just-in-time, print, then tear it down (keeps the
  // heavy full-data table out of the live DOM until it's actually needed).
  useEffect(() => {
    if (!printing) return;
    const t = window.setTimeout(() => window.print(), 80);
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    return () => { window.clearTimeout(t); window.removeEventListener("afterprint", done); };
  }, [printing]);

  const issued = useMemo(() => new Date().toLocaleDateString("ar-EG-u-nu-latn", { day: "2-digit", month: "long", year: "numeric" }), []);
  const clinic = (clinicName || "").trim() || "العيادة البيطرية";

  return (
    <div className="space-y-4">
      {/* Header — title, range, print */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <h3 className="font-display text-lg font-extrabold text-ink">{title}</h3>
          {dateRangeLabel && <p className="text-2xs text-ink-subtle">الفترة: {dateRangeLabel}</p>}
        </div>
        <button
          onClick={() => setPrinting(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700"
        >
          <Printer size={16} /> طباعة التقرير
        </button>
      </div>

      {/* Summary cards (screen) */}
      {summaryMetrics.length > 0 && (
        <div className={cn("grid grid-cols-2 gap-3", summaryMetrics.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          {summaryMetrics.map((m, i) => (
            <div key={i} className="card p-4">
              <p className="text-2xs font-semibold text-ink-subtle">{m.label}</p>
              <p className="mt-0.5 font-display text-lg font-extrabold tabular-nums text-ink">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {chart}
      {toolbar}

      {/* Screen data table */}
      {data.length === 0 ? (
        <div className="card grid place-items-center p-12 text-center text-ink-subtle">{emptyText}</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={cn("whitespace-nowrap border-b border-line px-3 py-2.5 text-2xs font-bold text-ink-muted", alignClass(c.align))}>
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
                  <tr key={rowKey(row)} className={cn("border-b border-line/60 transition hover:bg-surface-2/60", isRowMuted?.(row) && "opacity-60")}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn("whitespace-nowrap px-3 py-2.5", alignClass(c.align))}>{c.cell(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-ink-subtle">
              <span>عرض {formatNum(safePage * pageSize + 1)}–{formatNum(Math.min(data.length, (safePage + 1) * pageSize))} من {formatNum(data.length)}</span>
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
              {dateRangeLabel && <div className="rp-range">الفترة: {dateRangeLabel}</div>}
              <div className="rp-meta">تاريخ الإصدار: {issued} · صادر عن نظام doctorVet</div>
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

            <footer className="rp-foot">عدد السجلات: {formatNum(data.length)} · تم إنشاء هذا التقرير بواسطة نظام doctorVet — {issued}</footer>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
