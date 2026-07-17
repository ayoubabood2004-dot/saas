// ============================================================================
// Treatment sheet print — a printable "ورقة خطة العلاج" that mirrors the clinic's
// paper form EXACTLY: the owner-liability undertaking (top + bottom), a compact
// animal-info header, a brief diagnosis block, the pet photo, and the daily
// treatment table (اليوم والساعة | العلاج | الطبيب المعالج | الملاحظات).
// Self-contained HTML opened in a print window — no external assets.
// ============================================================================

const WEBSITE = "doctorvet.vet";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface SheetTreatmentRow { dayTime: string; treatment: string; doctor: string; notes: string }

export interface TreatmentSheetOptions {
  clinicName: string;
  clinicPhone?: string | null;
  logoUrl?: string | null;
  lang: string;
  /** Animal header fields. */
  pet: { name: string; species: string; sex: string; age: string; photoUrl?: string | null };
  date: string;
  /** Brief diagnosis block (blank strings render as an underline, like the paper). */
  vaccinated?: string;      // ملقح أم لا
  priorDiseases?: string;   // الأمراض السابقة
  priorVisits?: string;     // المراجعات السابقة
  clinicalTreatments?: string; // العلاجات السريرية
  diagnosis?: string;       // التشخيص
  rows: SheetTreatmentRow[];
}

const UNDERTAKING =
  "أنا الموقّع أدناه صاحب الحيوان المذكورة معلوماته، أتعهّد بأنني قد قمت بعلاج الحيوان العائد لي على مسؤوليتي الخاصة، ولا أُحمّل العيادة أيّ مسؤولية قانونية أو غيرها في حال حدوث أي مضاعفات أو موت للحيوان.";

/** A labelled line — value, or a dotted underline when empty (matches the blank form). */
const field = (label: string, value?: string) =>
  `<div class="fld"><span class="lbl">${esc(label)}</span><span class="val">${value ? esc(value) : ""}</span></div>`;

export function buildTreatmentSheetHTML(o: TreatmentSheetOptions): string {
  const ar = o.lang === "ar";
  const dir = ar ? "rtl" : "ltr";
  // At least 8 rows like the paper — pad with empty rows so it's usable as a form.
  const minRows = 8;
  const rows = o.rows.slice();
  while (rows.length < minRows) rows.push({ dayTime: "", treatment: "", doctor: "", notes: "" });

  const body = rows
    .map(
      (r) => `<tr>
      <td class="c-day">${esc(r.dayTime)}</td>
      <td class="c-tx">${esc(r.treatment)}</td>
      <td class="c-dr">${esc(r.doctor)}</td>
      <td class="c-nt">${esc(r.notes)}</td>
    </tr>`,
    )
    .join("");

  const photo = o.pet.photoUrl
    ? `<div class="photo"><img src="${o.pet.photoUrl}" alt=""/></div>`
    : `<div class="photo empty"><span>صورة الحيوان</span></div>`;

  const css = `
    *{box-sizing:border-box}
    body{margin:0;font-family:"Segoe UI",Tahoma,system-ui,sans-serif;color:#111;background:#fff}
    .sheet{width:210mm;min-height:297mm;margin:0 auto;padding:14mm 12mm;display:flex;flex-direction:column;gap:8px}
    .undertaking{font-size:12px;font-weight:700;line-height:1.7;text-align:center;border:1.5px solid #111;border-radius:6px;padding:8px 10px}
    .brand{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 0}
    .brand .name{font-size:16px;font-weight:800}
    .brand .muted{font-size:11px;color:#555}
    .brand img{max-height:42px;max-width:120px;object-fit:contain}
    .row{display:flex;gap:8px}
    .info{flex:1;display:flex;flex-direction:column;gap:6px}
    .animal{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;border:1px solid #111;border-radius:6px;padding:8px}
    .fld{display:flex;flex-direction:column;gap:2px;min-width:0}
    .fld .lbl{font-size:10px;font-weight:800;color:#333}
    .fld .val{font-size:13px;font-weight:700;min-height:18px;border-bottom:1px dotted #999;padding-bottom:2px}
    .dx{display:flex;flex-direction:column;gap:5px;border:1px solid #111;border-radius:6px;padding:8px;flex:1}
    .dx .fld{flex-direction:row;align-items:center;gap:6px}
    .dx .fld .lbl{white-space:nowrap}
    .dx .fld .val{flex:1;border-bottom:1px dotted #999}
    .photo{width:46mm;height:40mm;border:1px solid #111;border-radius:6px;overflow:hidden;display:grid;place-items:center}
    .photo img{width:100%;height:100%;object-fit:cover}
    .photo.empty span{font-size:11px;color:#999}
    table{width:100%;border-collapse:collapse;margin-top:2px}
    th,td{border:1px solid #111;padding:6px 8px;font-size:12px;vertical-align:top}
    thead th{background:#f0f0f0;font-weight:800;font-size:12px}
    .c-day{width:20%;font-weight:700}
    .c-tx{width:42%}
    .c-dr{width:18%}
    .c-nt{width:20%}
    tbody td{height:34px}
    .foot{margin-top:auto;font-size:11px;font-weight:700;line-height:1.7;text-align:center;border-top:1px solid #bbb;padding-top:8px}
    .site{text-align:center;font-size:10px;color:#888;margin-top:4px}
    @media print{@page{size:A4;margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  `;

  return `<!doctype html><html lang="${esc(o.lang)}" dir="${dir}"><head><meta charset="utf-8"/>
  <title>${esc("خطة العلاج")} — ${esc(o.pet.name)}</title><style>${css}</style></head>
  <body><div class="sheet">
    <div class="undertaking">${esc(UNDERTAKING)}</div>
    <div class="brand">
      <div><div class="name">${esc(o.clinicName)}</div>${o.clinicPhone ? `<div class="muted">${esc(o.clinicPhone)}</div>` : ""}</div>
      ${o.logoUrl ? `<img src="${o.logoUrl}" alt=""/>` : `<div class="name">🐾 خطة العلاج</div>`}
    </div>
    <div class="animal">
      ${field("اسم الحيوان", o.pet.name)}
      ${field("نوع الحيوان", o.pet.species)}
      ${field("الجنس", o.pet.sex)}
      ${field("العمر", o.pet.age)}
      ${field("التاريخ", o.date)}
    </div>
    <div class="row">
      <div class="dx">
        ${field("ملقّح أم لا", o.vaccinated)}
        ${field("الأمراض السابقة", o.priorDiseases)}
        ${field("المراجعات السابقة", o.priorVisits)}
        ${field("العلاجات السريرية", o.clinicalTreatments)}
        ${field("التشخيص", o.diagnosis)}
      </div>
      ${photo}
    </div>
    <table>
      <thead><tr><th class="c-day">اليوم والساعة</th><th class="c-tx">العلاج</th><th class="c-dr">الطبيب المعالج</th><th class="c-nt">الملاحظات</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="foot">${esc(UNDERTAKING)}</div>
    <div class="site">${WEBSITE}</div>
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
