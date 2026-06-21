import type { Species, Sex } from "@/types";

/* ============================================================================
 * Legal consent forms (Operation / Anesthesia / Treatment & Estimated Cost).
 * Builds a self-contained, print-ready A4 HTML document modelled on official
 * veterinary consent papers: a clinic letterhead, a centred title, a two-column
 * Owner / Patient data block, the formal legal body, and a signature area.
 * Bilingual (ar / en) — the printed language is chosen independently of the UI.
 * Mirrors the invoicePrint.ts approach so print fidelity is guaranteed.
 * ==========================================================================*/

export type ConsentFormType = "surgery" | "anesthesia" | "treatment";

export interface ConsentClinic { name: string; phone?: string | null; city?: string | null; license?: string | null }
export interface ConsentOwner { name?: string | null; phone?: string | null; address?: string | null }
export interface ConsentPatient {
  name?: string | null;
  serial?: string | null;
  species?: Species | null;
  breed?: string | null;
  sex?: Sex | null;
  dob?: string | null;
  color?: string | null;
}

export interface ConsentOptions {
  form: ConsentFormType;
  lang: string; // "ar" | "en" | ...
  clinic: ConsentClinic;
  vetName?: string | null;
  owner: ConsentOwner;
  patient: ConsentPatient;
  /** Optional estimated cost shown on the treatment form (e.g. "150,000 IQD"). */
  estimate?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const BLANK = "—";

const SPECIES_LABEL: Record<"ar" | "en", Record<Species, string>> = {
  ar: { dog: "كلب", cat: "قطة", horse: "حصان", cow: "بقرة", bird: "طائر", rabbit: "أرنب", other: "أخرى" },
  en: { dog: "Dog", cat: "Cat", horse: "Horse", cow: "Cow", bird: "Bird", rabbit: "Rabbit", other: "Other" },
};
const SEX_LABEL: Record<"ar" | "en", Record<Sex, string>> = {
  ar: { male: "ذكر", female: "أنثى", unknown: "غير محدد" },
  en: { male: "Male", female: "Female", unknown: "Unknown" },
};

/** Exact age in years / months / days from a date of birth. */
function ageYMD(dob?: string | null): { y: number; m: number; d: number } | null {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  const n = new Date();
  let y = n.getFullYear() - b.getFullYear();
  let m = n.getMonth() - b.getMonth();
  let d = n.getDate() - b.getDate();
  if (d < 0) { m -= 1; d += new Date(n.getFullYear(), n.getMonth(), 0).getDate(); }
  if (m < 0) { y -= 1; m += 12; }
  if (y < 0) return null;
  return { y, m, d };
}

function ageLabel(dob: string | null | undefined, ar: boolean): string {
  const a = ageYMD(dob);
  if (!a) return BLANK;
  return ar
    ? `${a.y} سنة، ${a.m} شهر، ${a.d} يوم`
    : `${a.y} yr, ${a.m} mo, ${a.d} d`;
}

/** UI-facing label for the form type (used by the picker too). */
export function consentFormLabel(form: ConsentFormType, lang: string): string {
  const ar = lang.startsWith("ar");
  return {
    surgery: ar ? "إقرار تداخل جراحي" : "Surgical Consent",
    anesthesia: ar ? "إقرار تخدير" : "Anesthesia Consent",
    treatment: ar ? "إقرار علاج وتكاليف" : "Treatment & Cost Consent",
  }[form];
}

interface Strings {
  title: string;
  owner: string;
  patient: string;
  fName: string; fPhone: string; fAddress: string; fNo: string; fSpecies: string; fBreed: string; fSex: string; fAge: string; fColor: string;
  body: string[];
  estimate: string;
  vetLine: string;
  ownerSign: string;
  date: string;
}

function strings(opts: ConsentOptions): Strings {
  const ar = opts.lang.startsWith("ar");
  const clinic = opts.clinic.name;
  const patient = opts.patient.name?.trim() || (ar ? "الحيوان المذكور" : "the patient");
  const vet = opts.vetName?.trim() || (ar ? "الطبيب البيطري المعالج" : "the attending veterinarian");

  const labels = {
    owner: ar ? "بيانات صاحب الحيوان" : "Owner Details",
    patient: ar ? "بيانات الحيوان" : "Patient Details",
    fName: ar ? "الاسم" : "Name",
    fPhone: ar ? "الهاتف" : "Phone",
    fAddress: ar ? "العنوان" : "Address",
    fNo: ar ? "الرقم" : "No.",
    fSpecies: ar ? "النوع" : "Species",
    fBreed: ar ? "السلالة" : "Breed",
    fSex: ar ? "الجنس" : "Sex",
    fAge: ar ? "العمر" : "Age",
    fColor: ar ? "اللون" : "Color",
    estimate: ar ? "التكلفة التقديرية" : "Estimated cost",
    ownerSign: ar ? "اسم وتوقيع صاحب الحيوان" : "Owner name & signature",
    date: ar ? "التاريخ" : "Date",
  };

  if (opts.form === "surgery") {
    return {
      ...labels,
      title: ar ? "إقرار وموافقة على إجراء تداخل جراحي" : "SURGICAL PROCEDURE CONSENT FORM",
      vetLine: ar
        ? `يُجري التداخل الجراحي الطبيب البيطري: ${vet}.`
        : `The surgical procedure is performed by the veterinarian: ${vet}.`,
      body: ar
        ? [
            `أنا الموقّع أدناه، بصفتي مالك الحيوان «${patient}» الذي أحضرته إلى «${clinic}»، أوافق طوعاً واختياراً على إجراء التداخل الجراحي اللازم له.`,
            `لقد شرح لي الطبيب البيطري كافة تفاصيل العملية، ومخاطرها، ومضاعفاتها المحتملة، والبدائل المتاحة، ونسبة نجاحها، وقد أتيحت لي فرصة طرح الأسئلة وأُجيب عنها بشكلٍ وافٍ.`,
            `أدرك تماماً أن الطب البيطري ليس علماً مضموناً وأنه لا توجد أي ضمانات مطلقة لنتيجة العملية، وأوافق على إجراء أي تدخّل طبي أو تخديري طارئ يراه الطبيب ضرورياً أثناء العملية لإنقاذ حياة الحيوان أو الحفاظ على سلامته.`,
            `أقرّ بأنني قرأت هذا النموذج وفهمت مضمونه بالكامل، وأوقّع عليه بكامل إرادتي الحرّة.`,
          ]
        : [
            `I, the undersigned, as the owner of the patient "${patient}" brought to "${clinic}", voluntarily consent to the necessary surgical procedure being performed on the animal.`,
            `The veterinarian has fully explained the details of the operation, its risks, possible complications, available alternatives and likelihood of success. I have had the opportunity to ask questions and they have been answered to my satisfaction.`,
            `I understand that veterinary medicine is not an exact science and that no absolute guarantees can be given regarding the outcome. I consent to any emergency medical or anesthetic intervention the veterinarian deems necessary during the procedure to save the animal's life or preserve its wellbeing.`,
            `I confirm that I have read and fully understood this form and sign it of my own free will.`,
          ],
    };
  }

  if (opts.form === "anesthesia") {
    return {
      ...labels,
      title: ar ? "إقرار وموافقة على التخدير" : "ANESTHESIA CONSENT FORM",
      vetLine: ar
        ? `يُطبّق التخدير ويُشرف عليه الطبيب البيطري: ${vet}.`
        : `Anesthesia is administered and supervised by the veterinarian: ${vet}.`,
      body: ar
        ? [
            `أُقرّ أنا الموقّع أدناه بموافقتي على إخضاع حيواني «${patient}» للتخدير (العام و/أو الموضعي) في «${clinic}» لإجراء الفحوصات و/أو التداخلات الطبية اللازمة.`,
            `لقد أبلغني الطبيب البيطري بكافة المخاطر المرتبطة بالتخدير، بما في ذلك احتمال حدوث مضاعفات خطيرة أو الوفاة، وشُرحت لي الخيارات المتاحة وإيجابيات وسلبيات كل منها.`,
            `إذا تبيّن أثناء التخدير وجود خطر على حياة الحيوان أو أن تطبيقاً آخر سيكون في مصلحته، فإنني أوافق على أن يتخذ الطبيب البيطري ما يراه مناسباً من إجراءات التخدير والتدخّلات المرتبطة بها.`,
            `لقد أتيحت لي الفرصة الكافية لطرح الأسئلة وأُجيب عنها، وأتحمّل المسؤولية الكاملة عن هذا القرار وأوقّع بكامل إرادتي.`,
          ]
        : [
            `I, the undersigned, consent to my animal "${patient}" receiving anesthesia (general and/or local) at "${clinic}" for the necessary examinations and/or medical interventions.`,
            `The veterinarian has informed me of all risks associated with anesthesia, including the possibility of serious complications or death, and has explained the available options with their pros and cons.`,
            `If, during anesthesia, a danger to the animal's life is identified or another procedure is judged to be in its interest, I consent to the veterinarian taking the anesthetic measures and related interventions deemed appropriate.`,
            `I have had ample opportunity to ask questions, which have been answered, and I assume full responsibility for this decision and sign of my own free will.`,
          ],
    };
  }

  // treatment & estimated cost
  return {
    ...labels,
    title: ar ? "إقرار العلاج وطلب التكلفة التقديرية" : "TREATMENT CONSENT & ESTIMATED COST FORM",
    vetLine: ar
      ? `يتولّى العلاج الطبيب البيطري: ${vet}.`
      : `Treatment is provided by the veterinarian: ${vet}.`,
    body: ar
      ? [
          `أنا الموقّع أدناه، مالك الحيوان «${patient}» أو من يمثّله، أوافق على خطة العلاج المقترحة في «${clinic}» بعد أن شُرح لي التشخيص وطريقة العلاج المتوقعة والمآل (الإنذار الطبي).`,
          `أدرك أن الطب البيطري ليس علماً مضموناً وأنه لم تُقدَّم لي أي ضمانة للشفاء التام، وأن نتائج العلاج قد تختلف من حالة لأخرى.`,
          `أتعهّد بدفع كامل التكاليف المترتبة على الفحوصات والأدوية والإقامة والإجراءات وأي خدمات أخرى تُقدَّم للحيوان، سواء المذكورة مسبقاً أو التي تستجدّ خلال فترة العلاج.`,
          `أقرّ بأنني قرأت هذا النموذج وفهمته بالكامل وأوقّع عليه طوعاً.`,
        ]
      : [
          `I, the undersigned, owner of the patient "${patient}" or their representative, consent to the proposed treatment plan at "${clinic}" after the diagnosis, expected course of treatment and prognosis have been explained to me.`,
          `I understand that veterinary medicine is not an exact science, that no guarantee of complete recovery has been given, and that treatment outcomes may vary from case to case.`,
          `I undertake to pay all costs incurred for examinations, medications, hospitalization, procedures and any other services provided to the animal — whether estimated in advance or newly arising during the course of treatment.`,
          `I confirm that I have read and fully understood this form and sign it voluntarily.`,
        ],
  };
}

/** U+200E LEFT-TO-RIGHT MARK — a strong-LTR character. Baked into the text it forces
 *  the trailing neutral/weak chars (the "+", digits) to lay out LTR even when a renderer
 *  ignores CSS / dir. Built from a code point so the source stays ASCII (no invisibles). */
const LRM = String.fromCharCode(0x200e);

/** Sanitize a phone string: strip stray bidi control marks, normalize spacing, and
 *  collapse an accidentally duplicated leading country code ("+964 +964 770" /
 *  "964964770" -> "+964 770"). Conservative — only a repeat of the leading group. */
function cleanPhone(raw?: string | null): string {
  const stripBidi = new RegExp("[\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]", "g");
  const s = String(raw ?? "").replace(stripBidi, "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const plus = s.startsWith("+");
  const body = (plus ? s.slice(1) : s).trim().replace(/^(\d{1,4})[\s+]*\1\b/, "$1").trim();
  return (plus ? "+" : "") + body;
}

/** Force a numeric/symbolic value (phone, ID) to render strictly left-to-right inside an
 *  RTL (Arabic) document — belt and suspenders so the "+" never flips: an explicit LTR
 *  span with `unicode-bidi: isolate`, PLUS a leading LRM baked into the text itself. */
function ltrValue(value: string): string {
  return `<span dir="ltr" style="direction:ltr;unicode-bidi:isolate;display:inline-block;white-space:nowrap">${LRM}${esc(value)}</span>`;
}

function row(label: string, value: string, ltr = false): string {
  const v = ltr && value !== BLANK ? ltrValue(value) : esc(value);
  return `<tr><td class="k">${esc(label)}</td><td class="c">:</td><td class="v">${v}</td></tr>`;
}

/** Build a fully self-contained, printable consent-form HTML document. */
export function buildConsentHTML(opts: ConsentOptions): string {
  const ar = opts.lang.startsWith("ar");
  const dir = ar ? "rtl" : "ltr";
  const s = strings(opts);
  const langKey: "ar" | "en" = ar ? "ar" : "en";

  const sp = opts.patient.species ? SPECIES_LABEL[langKey][opts.patient.species] : BLANK;
  const sex = opts.patient.sex ? SEX_LABEL[langKey][opts.patient.sex] : BLANK;
  const age = ageLabel(opts.patient.dob, ar);
  const todayStr = new Date().toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB", { year: "numeric", month: "long", day: "numeric" });

  const ownerRows = [
    row(s.fName, opts.owner.name?.trim() || BLANK),
    row(s.fPhone, cleanPhone(opts.owner.phone) || BLANK, true),
    row(s.fAddress, opts.owner.address?.trim() || BLANK),
  ].join("");

  const patientRows = [
    row(s.fName, opts.patient.name?.trim() || BLANK),
    row(s.fNo, opts.patient.serial?.trim() || BLANK, true),
    row(s.fSpecies, sp),
    row(s.fBreed, opts.patient.breed?.trim() || BLANK),
    row(s.fSex, sex),
    row(s.fAge, age),
    row(s.fColor, opts.patient.color?.trim() || BLANK),
  ].join("");

  const bodyParas = s.body.map((p) => `<p>${esc(p)}</p>`).join("");
  const contact = [
    opts.clinic.city ? esc(opts.clinic.city) : "",
    opts.clinic.phone ? ltrValue(cleanPhone(opts.clinic.phone)) : "",
    opts.clinic.license ? `${ar ? "ترخيص" : "Lic."} ${esc(opts.clinic.license)}` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const estimateBlock = opts.form === "treatment"
    ? `<div class="estimate"><span class="el">${esc(s.estimate)}</span><span class="eline">${opts.estimate ? esc(opts.estimate) : ""}</span></div>`
    : "";

  const css = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: ${ar ? "'Sakkal Majalla','Traditional Arabic','Times New Roman',serif" : "'Times New Roman', Georgia, serif"}; color: #111; font-size: 13.5px; line-height: 1.65; }
    .sheet { max-width: 760px; margin: 0 auto; padding: 4px; }
    .head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 6px; }
    .brand { font-size: 10px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #1266d8; }
    .clinic { font-size: 22px; font-weight: 700; letter-spacing: .2px; margin-top: 2px; }
    .contact { font-size: 11px; color: #444; margin-top: 3px; }
    .title { text-align: center; font-size: 18px; font-weight: 700; letter-spacing: 1px; margin: 18px 0 16px; text-decoration: underline; text-underline-offset: 6px; }
    .cols { display: flex; gap: 26px; margin-bottom: 16px; }
    .col { flex: 1; min-width: 0; }
    .col h4 { margin: 0 0 4px; font-size: 13px; font-weight: 700; border-bottom: 1px solid #bbb; padding-bottom: 3px; }
    table.data { width: 100%; border-collapse: collapse; }
    table.data td { padding: 2px 0; vertical-align: top; font-size: 13px; }
    table.data td.k { width: 92px; color: #333; white-space: nowrap; }
    table.data td.c { width: 10px; color: #333; }
    table.data td.v { font-weight: 700; padding-inline-start: 8px; word-break: break-word; }
    .body { margin: 6px 0 14px; text-align: justify; }
    .body p { margin: 0 0 9px; }
    .vet { margin: 10px 0 4px; font-weight: 700; }
    .estimate { display: flex; align-items: flex-end; gap: 10px; margin: 14px 0; }
    .estimate .el { font-weight: 700; white-space: nowrap; }
    .estimate .eline { flex: 1; border-bottom: 1px dotted #555; min-height: 20px; font-weight: 700; }
    .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 46px; }
    .sign .box { flex: 1; }
    .sign .lbl { font-weight: 700; font-size: 12.5px; margin-bottom: 30px; }
    .sign .line { border-top: 1px solid #111; padding-top: 4px; font-size: 12px; color: #333; }
    .sign .name { font-weight: 700; color: #111; }
    @page { size: A4; margin: 16mm 16mm 14mm; }
    @media print { .sheet { max-width: none; } }
  `;

  const body = `
    <div class="sheet">
      <div class="head">
        <div class="brand">doctorVet</div>
        <div class="clinic">${esc(opts.clinic.name)}</div>
        ${contact ? `<div class="contact">${contact}</div>` : ""}
      </div>

      <div class="title">${esc(s.title)}</div>

      <div class="cols">
        <div class="col">
          <h4>${esc(s.owner)}</h4>
          <table class="data">${ownerRows}</table>
        </div>
        <div class="col">
          <h4>${esc(s.patient)}</h4>
          <table class="data">${patientRows}</table>
        </div>
      </div>

      <div class="body">
        ${bodyParas}
        <div class="vet">${esc(s.vetLine)}</div>
        ${estimateBlock}
      </div>

      <div class="sign">
        <div class="box">
          <div class="lbl">${esc(s.ownerSign)}</div>
          <div class="line"><span class="name">${esc(opts.owner.name?.trim() || "")}</span></div>
        </div>
        <div class="box">
          <div class="lbl">${esc(s.date)}</div>
          <div class="line">${esc(todayStr)}</div>
        </div>
      </div>
    </div>
  `;

  return `<!doctype html><html lang="${esc(opts.lang)}" dir="${dir}"><head><meta charset="utf-8"/>
    <title>${esc(s.title)}</title>
    <style>${css}</style></head>
    <body>${body}</body></html>`;
}

/** Open the consent form in a fresh window and trigger the print dialog. */
export function openConsentPrint(opts: ConsentOptions): boolean {
  // The auto-print/close logic is injected as an inline script INSIDE the document
  // (so it fires reliably regardless of document.write timing). It is added only on
  // the print path — buildConsentHTML stays script-free for the live preview iframe.
  const script = `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},150);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});<\/script>`;
  const html = buildConsentHTML(opts).replace("</body></html>", `${script}</body></html>`);
  const w = window.open("", "_blank", "width=820,height=940");
  if (!w) return false; // popup blocked
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
