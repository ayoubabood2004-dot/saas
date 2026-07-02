// Styled .xlsx export for the reports engine. Uses xlsx-js-style (the SheetJS fork
// that supports cell styling) and is loaded via dynamic import, so the ~900 KB library
// is code-split into its own chunk and only fetched when an admin actually exports —
// the main bundle stays lean. Produces an accountant-grade, RTL, Arabic workbook.

export interface XlsxColumn {
  header: string;
  /** Render this column's cells as real Excel numbers (summable), not text. */
  numeric?: boolean;
  /** Excel number format for numeric columns (default "#,##0"). */
  numFmt?: string;
}

export interface XlsxReport {
  fileName: string;
  title: string;
  clinicName?: string;
  dateRange?: string;
  columns: XlsxColumn[];
  rows: (string | number)[][];
  summary?: { label: string; value: string | number }[];
}

const BORDER_SOFT = { style: "thin", color: { rgb: "E2E8F0" } };
const BORDER_HEAD = { style: "thin", color: { rgb: "CBD5E1" } };

export async function exportReportXlsx(r: XlsxReport): Promise<void> {
  const mod: any = await import("xlsx-js-style");
  const XLSX: any = mod.default ?? mod;

  const ncol = Math.max(1, r.columns.length);
  const lastCol = ncol - 1;

  // ---- Sheet content as an array-of-arrays (title, date, spacer, header, data…) ----
  const aoa: (string | number)[][] = [];
  const master = `${r.clinicName ? r.clinicName + " · " : ""}doctorVet — ${r.title}`;
  aoa.push([master]);
  aoa.push([r.dateRange ?? ""]); // subtitle line, rendered verbatim (caller includes its prefix)
  aoa.push([]); // spacer
  const headRow = aoa.length;             // 0-based row of the column headers
  aoa.push(r.columns.map((c) => c.header));
  const dataStart = aoa.length;
  for (const row of r.rows) aoa.push(row);

  let summaryStart = -1;
  if (r.summary?.length) {
    aoa.push([]); // spacer
    summaryStart = aoa.length;
    for (const m of r.summary) aoa.push([m.label, m.value]);
  }

  const ws: any = XLSX.utils.aoa_to_sheet(aoa);
  const at = (row: number, col: number) => ws[XLSX.utils.encode_cell({ r: row, c: col })];

  // ---- Right-to-left sheet ----
  ws["!views"] = [{ RTL: true }];

  // ---- Merge the master + date-range rows across every column ----
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];

  // ---- Letterhead styles ----
  const mCell = at(0, 0);
  if (mCell) mCell.s = { font: { bold: true, sz: 16, color: { rgb: "0F172A" } }, alignment: { horizontal: "center", vertical: "center", readingOrder: 2 } };
  const dCell = at(1, 0);
  if (dCell) dCell.s = { font: { sz: 11, color: { rgb: "64748B" } }, alignment: { horizontal: "center", readingOrder: 2 } };

  // ---- Header row: bold, light-gray fill, borders, centered ----
  for (let c = 0; c < ncol; c++) {
    const cell = at(headRow, c);
    if (cell) cell.s = {
      font: { bold: true, sz: 11, color: { rgb: "111827" } },
      fill: { patternType: "solid", fgColor: { rgb: "EEF2F7" } },
      alignment: { horizontal: "center", vertical: "center", readingOrder: 2 },
      border: { top: BORDER_HEAD, bottom: BORDER_HEAD, left: BORDER_HEAD, right: BORDER_HEAD },
    };
  }

  // ---- Data cells: numbers stay numeric (summable) + soft bottom border ----
  for (let ri = dataStart; ri < dataStart + r.rows.length; ri++) {
    for (let c = 0; c < ncol; c++) {
      const cell = at(ri, c);
      if (!cell) continue;
      const col = r.columns[c];
      const isNum = !!col?.numeric && typeof cell.v === "number";
      if (isNum) { cell.t = "n"; cell.z = col.numFmt || "#,##0"; }
      cell.s = {
        alignment: { horizontal: isNum ? "left" : "right", vertical: "center", readingOrder: 2 },
        border: { bottom: BORDER_SOFT },
      };
    }
  }

  // ---- Summary block: bold label + value ----
  if (summaryStart >= 0) {
    for (let i = 0; i < r.summary!.length; i++) {
      const lc = at(summaryStart + i, 0);
      if (lc) lc.s = { font: { bold: true, color: { rgb: "64748B" } }, alignment: { horizontal: "right", readingOrder: 2 } };
      const vc = at(summaryStart + i, 1);
      if (vc) vc.s = { font: { bold: true, sz: 12, color: { rgb: "0F172A" } }, alignment: { horizontal: "left", readingOrder: 2 } };
    }
  }

  // ---- Auto column widths from the longest cell in each column ----
  ws["!cols"] = r.columns.map((c, ci) => {
    let max = c.header.length;
    for (const row of r.rows) {
      const v = row[ci];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(46, Math.max(11, max + 3)) };
  });

  // Taller letterhead + header rows.
  ws["!rows"] = [{ hpt: 26 }, { hpt: 18 }];

  const wb: any = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "التقرير");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = r.fileName.endsWith(".xlsx") ? r.fileName : `${r.fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
