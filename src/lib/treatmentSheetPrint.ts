// ============================================================================
// Treatment sheet print — a polished, on-brand "ورقة خطة العلاج" that mirrors the
// clinic's paper form (owner-liability undertaking, compact animal + diagnosis
// info, the pet photo, and the daily treatment table) while wearing the SAME
// visual identity as the printed invoices: brand eyebrow, clinic name, WhatsApp
// phone, social handles, centered logo, faint logo watermark and website footer.
// Self-contained HTML opened in a print window — no external assets.
// ============================================================================

import { siteHost } from "@/lib/appUrl";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export interface SheetTreatmentRow { dayTime: string; treatment: string; doctor: string; notes: string }

export interface TreatmentSheetOptions {
  clinicName: string;
  clinicPhone?: string | null;
  /** Platform brand shown as an eyebrow above the clinic name (default "doctorVet"). */
  brand?: string;
  logoUrl?: string | null;
  /** Social handles printed under the clinic phone. */
  facebook?: string | null;
  instagram?: string | null;
  lang: string;
  /** Animal header fields. */
  pet: { name: string; species: string; sex: string; age: string };
  date: string;
  /** Brief diagnosis block (blank strings render as a fillable dotted line, like the paper). */
  vaccinated?: string;      // ملقح أم لا
  priorDiseases?: string;   // الأمراض السابقة
  priorVisits?: string;     // المراجعات السابقة
  clinicalTreatments?: string; // العلاجات السريرية
  diagnosis?: string;       // التشخيص
  rows: SheetTreatmentRow[];
}

const UNDERTAKING =
  "أنا الموقّع أدناه صاحب الحيوان المذكورة معلوماته، أتعهّد بأنني قد قمت بعلاج الحيوان العائد لي على مسؤوليتي الخاصة، ولا أُحمّل العيادة أيّ مسؤولية قانونية أو غيرها في حال حدوث أي مضاعفات أو موت للحيوان.";

// Colored brand marks, inlined so they print without any external asset.
const WA_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true" style="flex:0 0 auto"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
const FB_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>`;
const IG_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="tsig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".45" stop-color="#fa7e1e"/><stop offset=".7" stop-color="#d62976"/><stop offset="1" stop-color="#962fbf"/></linearGradient></defs><path fill="url(#tsig)" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.86 5.86 0 0 0-2.12 1.38A5.86 5.86 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.12.66.66 1.33 1.07 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0z"/><path fill="url(#tsig)" d="M12 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84M12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/><circle fill="url(#tsig)" cx="18.41" cy="5.59" r="1.44"/></svg>`;
const SHIELD = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1266d8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:0 0 auto"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

/** A labelled diagnosis line — value, or a dotted underline when empty (blank form). */
const dxField = (label: string, value?: string, highlight = false) =>
  `<div class="dxf"><span class="dxl">${esc(label)}</span><span class="dxv${value ? (highlight ? " hi" : " has") : ""}">${value ? esc(value) : ""}</span></div>`;

export function buildTreatmentSheetHTML(o: TreatmentSheetOptions): string {
  const ar = o.lang.startsWith("ar");
  const dir = ar ? "rtl" : "ltr";
  const brand = esc(o.brand || "doctorVet");
  const WEBSITE = siteHost();
  const logo = o.logoUrl ? esc(String(o.logoUrl)) : "";
  const fb = (o.facebook || "").trim();
  const ig = (o.instagram || "").trim();

  // Phone reads LTR (+964 …) even inside an RTL document, with the WhatsApp mark.
  const phoneHTML = o.clinicPhone
    ? `<div class="wa">${WA_ICON}<span dir="ltr" style="unicode-bidi:isolate;direction:ltr">${esc(o.clinicPhone)}</span></div>`
    : "";
  const socials = (fb || ig)
    ? `<div class="socials">${fb ? `<span class="s">${FB_ICON}<span dir="ltr">${esc(fb)}</span></span>` : ""}${ig ? `<span class="s">${IG_ICON}<span dir="ltr">${esc(ig)}</span></span>` : ""}</div>`
    : "";

  // At least 8 rows like the paper — pad with empty rows so it stays a usable form.
  const minRows = 8;
  const rows = o.rows.slice();
  while (rows.length < minRows) rows.push({ dayTime: "", treatment: "", doctor: "", notes: "" });

  const bodyRows = rows
    .map(
      (r, i) => `<tr class="${i % 2 ? "alt" : ""}">
      <td class="c-day">${esc(r.dayTime)}</td>
      <td class="c-tx">${esc(r.treatment)}</td>
      <td class="c-dr">${esc(r.doctor)}</td>
      <td class="c-nt">${esc(r.notes)}</td>
    </tr>`,
    )
    .join("");

  const animalCell = (label: string, value: string) =>
    `<div class="af"><span class="al">${esc(label)}</span><span class="av">${esc(value) || "—"}</span></div>`;

  const css = `
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
    body{font-family:'Segoe UI',system-ui,-apple-system,'Tahoma',sans-serif;color:#0b1220;position:relative}
    .sheet{width:210mm;min-height:297mm;margin:0 auto;padding:13mm 12mm 16mm;position:relative;z-index:1;display:flex;flex-direction:column;gap:9px}

    /* Faint centered logo watermark (prints reliably; see invoicePrint). */
    .watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:0;pointer-events:none;overflow:hidden}
    .watermark img{width:78%;max-width:150mm;filter:grayscale(100%);opacity:.06;transform:scale(1.6)}

    /* Brand header */
    .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;border-bottom:3px solid #1266d8;padding-bottom:11px}
    .party{min-width:0}
    .party.end{text-align:end}
    .brand{font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#1266d8;margin-bottom:2px}
    .clinic{font-size:20px;font-weight:800;color:#0b1220;letter-spacing:-.2px;line-height:1.15}
    .wa{display:flex;align-items:center;gap:5px;color:#475569;font-size:11px;font-weight:600;margin-top:4px}
    .party.end .wa{justify-content:flex-end}
    .socials{margin-top:4px;display:flex;flex-direction:column;gap:2px;font-size:10px;color:#64748b}
    .socials .s{display:inline-flex;align-items:center;gap:5px}
    .logo-mid{text-align:center}
    .logo-mid img{max-height:80px;max-width:150px;object-fit:contain}
    .logo-mid .ph{font-size:20px;font-weight:800;color:#1266d8}
    .doc-title{font-size:23px;font-weight:800;color:#1266d8;letter-spacing:.5px}
    .doc-sub{font-size:11px;color:#475569;margin-top:3px}
    .doc-sub b{color:#0b1220}

    /* Owner-liability consent strip */
    .consent{display:flex;align-items:flex-start;gap:8px;background:#eff5ff;border:1px solid #cfe0fb;border-radius:9px;padding:8px 11px;font-size:11px;font-weight:600;line-height:1.65;color:#1e3a5f}

    /* Patient info */
    .animal{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:#e2e8f0;border:1px solid #e2e8f0;border-radius:9px;overflow:hidden}
    .af{background:#f8fafc;padding:7px 9px;min-width:0;display:flex;flex-direction:column;gap:2px}
    .al{font-size:9px;font-weight:800;letter-spacing:.3px;color:#94a3b8;text-transform:uppercase}
    .av{font-size:13px;font-weight:700;color:#0b1220;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dx{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
    .dxf{display:flex;align-items:center;gap:8px}
    .dxl{font-size:11px;font-weight:800;color:#334155;white-space:nowrap;min-width:96px}
    .dxv{flex:1;font-size:12px;font-weight:600;color:#0b1220;min-height:15px;border-bottom:1px dotted #b6c2d1;padding-bottom:2px}
    .dxv.has{border-bottom-color:transparent}
    .dxv.hi{border-bottom:none;color:#0b4ea3;font-weight:800;background:#e7f0fe;border-radius:5px;padding:2px 8px;flex:0 1 auto}

    /* Treatment table */
    .tx-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#0b1220;margin:2px 0 -2px}
    .tx-title .bar{display:inline-block;width:4px;height:14px;border-radius:2px;background:#1266d8}
    table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #cbd5e1;border-radius:9px;overflow:hidden}
    thead th{background:#e7f0fe;color:#0b4ea3;font-weight:800;font-size:11px;letter-spacing:.2px;padding:8px 9px;text-align:start;border-inline-start:1px solid #cfe0fb}
    thead th:first-child{border-inline-start:none}
    tbody td{padding:7px 9px;font-size:11px;vertical-align:top;border-top:1px solid #e2e8f0;border-inline-start:1px solid #eef2f7;color:#0f172a;height:30px}
    tbody td:first-child{border-inline-start:none}
    tbody tr.alt td{background:#f9fbfe}
    .c-day{width:22%;font-weight:700;color:#0b1220}
    .c-tx{width:40%}
    .c-dr{width:19%}
    .c-nt{width:19%}

    /* Footer */
    .foot{margin-top:auto;padding-top:9px;border-top:1px solid #e2e8f0}
    .fine{display:flex;align-items:flex-start;gap:7px;font-size:9.5px;font-weight:600;line-height:1.6;color:#64748b}
    .page-foot{position:absolute;bottom:8mm;inset-inline-start:12mm;font-size:10px;letter-spacing:.5px;color:#94a3b8;direction:ltr;z-index:1}
    .page-num{position:absolute;bottom:8mm;inset-inline-end:12mm;font-size:10px;letter-spacing:.5px;color:#94a3b8;direction:ltr;z-index:1}

    @media print{
      html,body{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
      .watermark{display:flex !important}
      .watermark img{opacity:.06 !important;filter:grayscale(100%) !important}
    }
    @page{size:A4;margin:0}
  `;

  return `<!doctype html><html lang="${esc(o.lang)}" dir="${dir}"><head><meta charset="utf-8"/>
  <title>${esc("خطة العلاج")} — ${esc(o.pet.name)}</title><style>${css}</style></head>
  <body>
    ${logo ? `<div class="watermark"><img src="${logo}" alt=""/></div>` : ""}
    <div class="page-foot">${esc(WEBSITE)}</div>
    <div class="page-num">1 / 1</div>
    <div class="sheet">
      <div class="top">
        <div class="party">
          <div class="brand">${brand}</div>
          <div class="clinic">${esc(o.clinicName)}</div>
          ${phoneHTML}
          ${socials}
        </div>
        ${logo ? `<div class="logo-mid"><img src="${logo}" alt="logo"/></div>` : `<div class="logo-mid"><div class="ph">🐾</div></div>`}
        <div class="party end">
          <div class="doc-title">خطة العلاج</div>
          <div class="doc-sub">التاريخ: <b>${esc(o.date)}</b></div>
        </div>
      </div>

      <div class="consent">${SHIELD}<span>${esc(UNDERTAKING)}</span></div>

      <div class="animal">
        ${animalCell("اسم الحيوان", o.pet.name)}
        ${animalCell("نوع الحيوان", o.pet.species)}
        ${animalCell("الجنس", o.pet.sex)}
        ${animalCell("العمر", o.pet.age)}
        ${animalCell("التاريخ", o.date)}
      </div>

      <div class="dx">
        ${dxField("ملقّح أم لا", o.vaccinated)}
        ${dxField("الأمراض السابقة", o.priorDiseases)}
        ${dxField("المراجعات السابقة", o.priorVisits)}
        ${dxField("العلاجات السريرية", o.clinicalTreatments)}
        ${dxField("التشخيص", o.diagnosis, true)}
      </div>

      <div class="tx-title"><span class="bar"></span> خطة العلاج اليومية</div>
      <table>
        <thead><tr><th class="c-day">اليوم والساعة</th><th class="c-tx">العلاج</th><th class="c-dr">الطبيب المعالج</th><th class="c-nt">الملاحظات</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>

      <div class="foot">
        <div class="fine">${SHIELD}<span>${esc(UNDERTAKING)}</span></div>
      </div>
    </div>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},150);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>
  </body></html>`;
}

/** Open the treatment sheet in a fresh window and trigger printing. Returns false if a pop-up blocker stopped it. */
export function openTreatmentSheet(o: TreatmentSheetOptions): boolean {
  const html = buildTreatmentSheetHTML(o);
  const w = window.open("", "_blank", "width=880,height=1000");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
