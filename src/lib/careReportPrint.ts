// ============================================================================
// تقرير الحالة للزبون — «شنو صار لحيواني عندكم؟»
//
// ورقةُ خطة العلاج (treatmentSheetPrint) وثيقةٌ **داخلية**: جدولُ جرعاتٍ
// بأسماء أدويةٍ ومقاديرها، يُقرأ بالجولة ويُعلَّق على القفص. وهذا ملفٌ آخر
// تماماً: ورقةٌ **تُسلَّم لصاحب الحيوان** تحكي له بلغةٍ يفهمها ما جرى —
// متى دخل، شنو كانت حالته، كم يوماً استمرت الرعاية، كيف نُفِّذت الجرعات
// ووقتها، شنو كانت المتابعات اليومية، وكيف انتهى الأمر.
//
// ── قاعدةٌ حاكمة: بلا أسماء أدوية ──────────────────────────────────────────
// هذا طلبٌ صريح، وله وجاهته المهنية: الوصفة قرارٌ طبيّ يخصّ الطبيب المعالج،
// وورقةٌ بيد صاحب الحيوان فيها أسماء الأدوية تتحوّل بيوم لوصفةٍ يشتري بها
// من الصيدلية بلا فحص، أو لورقةٍ تُقارَن بعيادةٍ أخرى خارج سياقها. فالتقرير
// يعدّ ويصف ولا يسمّي: «١٨ جرعة دوائية أُعطيت بمواعيدها» لا «أموكسيسيلين».
// ومَن أراد التفصيل الدوائي فمكانه ورقة الخطة الداخلية.
//
// ── ولماذا سردٌ لا جدول ────────────────────────────────────────────────────
// صاحب الحيوان لا يقرأ جدولاً، يقرأ قصّة: «دخل يوم كذا، بقي أربعة أيام،
// أخذ كل جرعاته بوقتها، حرارته تُقاس مرّتين باليوم، وخرج متعافياً». فالنص
// يُبنى جملةً جملةً من البيانات الحقيقية — لا قوالب جاهزة تكذب.
//
// نفس الهوية البصرية للفواتير وورقة الخطة: ترويسة، شعار، علامة مائية، تذييل.
// ============================================================================

import { siteHost } from "@/lib/appUrl";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** إحصاءات الرعاية كما تُحسب بصفحة الطبلة — التقرير يصفها ولا يعيد حسابها. */
export interface CareReportStats {
  /** عدد أيام الرعاية (أيام الخطة الفعلية). */
  days: number;
  /** إجمالي الجرعات المجدولة (أدوية وسوائل) وما نُفّذ منها. */
  doses: number;
  dosesGiven: number;
  /** نسبة الالتزام ٠–١٠٠. */
  adherence: number;
  /** عدد قياسات المتابعة المسجَّلة (حرارة، شهية، إخراج…). */
  observations: number;
  /** أنواع المتابعات التي جرت — أسماءٌ عامة لا قيم («الحرارة»، «الأكل والشهية»). */
  observationKinds: string[];
  /** عدد التحاليل المخبرية التي أُجريت (بلا نتائجها). */
  labs: number;
  /** أسماء العمليات الجراحية إن وُجدت — إجراءٌ يعرفه صاحب الحيوان أصلاً. */
  surgeries: string[];
}

export interface CareReportOptions {
  clinicName: string;
  clinicPhone?: string | null;
  brand?: string;
  logoUrl?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  lang: string;
  pet: { name: string; species: string; sex: string; age: string };
  ownerName?: string | null;
  /** رقم الملف بالعيادة. */
  fileNo?: string | null;
  /** تواريخ مقروءة (مُنسَّقة مسبقاً بلغة الواجهة). */
  openedAt: string;
  endedAt?: string | null;
  printedAt: string;
  /** سبب المراجعة / الحالة — يُذكر عاماً كما سجّله الطبيب. */
  reason?: string | null;
  /** التشخيص كما يُعرض بالطبلة (اختياري — بعض الحالات تبقى تحت الملاحظة). */
  diagnosis?: string | null;
  /** النتيجة: تعافى / تحت العلاج / مزمنة… */
  outcome?: string | null;
  /** خلاصة الطبيب المكتوبة عند إنهاء العلاج. */
  summary?: string | null;
  /** ملاحظاتٌ للمنزل يكتبها الطبيب — تُطبع كما هي إن وُجدت. */
  homeCare?: string | null;
  /** اسم الطبيب المعالج للتوقيع. */
  doctor?: string | null;
  stats: CareReportStats;
}

const WA_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true" style="flex:0 0 auto"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
const FB_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>`;
const IG_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="crig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".45" stop-color="#fa7e1e"/><stop offset=".7" stop-color="#d62976"/><stop offset="1" stop-color="#962fbf"/></linearGradient></defs><path fill="url(#crig)" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.86 5.86 0 0 0-2.12 1.38A5.86 5.86 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.12.66.66 1.33 1.07 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0z"/><path fill="url(#crig)" d="M12 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84M12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/><circle fill="url(#crig)" cx="18.41" cy="5.59" r="1.44"/></svg>`;
const PAW = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#1266d8" aria-hidden="true" style="flex:0 0 auto"><circle cx="6.5" cy="9.5" r="2.3"/><circle cx="10.5" cy="6" r="2.3"/><circle cx="15" cy="6.5" r="2.3"/><circle cx="18.2" cy="10.5" r="2.1"/><path d="M12.2 12.4c2.6 0 4.8 2 4.8 4.3 0 1.7-1.3 2.9-3 2.9-.9 0-1.4-.3-1.8-.3s-.9.3-1.8.3c-1.7 0-3-1.2-3-2.9 0-2.3 2.2-4.3 4.8-4.3z"/></svg>`;
const NOTE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b4ea3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:0 0 auto"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>`;

/** أرقام عربية-هندية اختيارياً؟ لا — الأرقام الغربية هي لغة الأرقام بكل النظام. */
const n = (v: number) => String(Math.max(0, Math.round(v)));

/** «٤ أيام» / «يوم واحد» / «يومان» — عربيةٌ صحيحة لا "4 يوم". */
function daysWord(d: number): string {
  if (d <= 0) return "";
  if (d === 1) return "يوماً واحداً";
  if (d === 2) return "يومين";
  if (d <= 10) return `${n(d)} أيام`;
  return `${n(d)} يوماً`;
}

function timesWord(c: number, one: string, two: string, few: string, many: string): string {
  if (c === 1) return one;
  if (c === 2) return two;
  if (c <= 10) return `${n(c)} ${few}`;
  return `${n(c)} ${many}`;
}

/**
 * السرد — يُبنى من الأرقام الحقيقية جملةً جملة. لا جملة تُكتب بلا سندٍ من
 * البيانات: صفرُ متابعاتٍ لا يُنتج «تابعناه باستمرار».
 */
export function buildNarrative(o: CareReportOptions): string[] {
  const s = o.stats;
  const name = o.pet.name;
  const out: string[] = [];

  // ١) الاستقبال والحالة
  const opening = o.reason?.trim()
    ? `استقبلنا ${name} في عيادتنا بتاريخ ${o.openedAt}، وكانت المراجعة بسبب ${o.reason.trim()}.`
    : `استقبلنا ${name} في عيادتنا بتاريخ ${o.openedAt} لإجراء الفحص السريري اللازم.`;
  const dx = o.diagnosis?.trim() ? ` وبعد الفحص السريري وُضعت خطة علاجية مناسبة لحالته.` : ` وبعد الفحص السريري وُضعت خطة رعاية مناسبة لحالته.`;
  out.push(opening + dx);

  // ٢) مسار الرعاية — المدة والجرعات والالتزام (بلا أي اسم دواء)
  if (s.doses > 0) {
    const dur = s.days > 0 ? `استمرت الرعاية ${daysWord(s.days)}، ` : "";
    const doses = `تضمّنت الخطة ${timesWord(s.doses, "جرعة علاجية واحدة", "جرعتين علاجيتين", "جرعات علاجية", "جرعة علاجية")}`;
    const given = s.dosesGiven >= s.doses
      ? `، أُعطيت جميعها في مواعيدها المحدّدة تحت إشراف الطاقم الطبي.`
      : s.dosesGiven > 0
        ? `، نُفّذ منها ${n(s.dosesGiven)} في مواعيدها المحدّدة تحت إشراف الطاقم الطبي${s.doses - s.dosesGiven > 0 ? `، ويتبقّى ${n(s.doses - s.dosesGiven)} ضمن الخطة.` : "."}`
        : `، وهي مجدولة ضمن خطة العلاج.`;
    out.push(dur + doses + given);
  } else if (s.days > 0) {
    out.push(`استمرت متابعة ${name} في العيادة ${daysWord(s.days)} تحت إشراف الطاقم الطبي.`);
  }

  // ٣) المتابعة اليومية — هذا ما يطمئن صاحب الحيوان فعلاً
  if (s.observations > 0) {
    const kinds = s.observationKinds.slice(0, 4).join("، ");
    out.push(
      `وخلال فترة الرعاية جرى تسجيل ${timesWord(s.observations, "قياس متابعة واحد", "قياسَي متابعة", "قياسات متابعة", "قياس متابعة")} لحالته العامة`
      + (kinds ? ` شملت ${kinds}` : "")
      + `، لمراقبة استجابته أولاً بأول وتعديل الخطة عند الحاجة.`,
    );
  }

  // ٤) الإجراءات: تحاليل وعمليات — تُذكر كإجراءات لا كنتائج
  const extras: string[] = [];
  if (s.labs > 0) extras.push(`إجراء ${timesWord(s.labs, "تحليل مختبري واحد", "تحليلين مختبريين", "تحاليل مختبرية", "تحليلاً مختبرياً")}`);
  if (s.surgeries.length) extras.push(`إجراء ${s.surgeries.length === 1 ? "عملية" : "عمليات"} ${s.surgeries.join("، ")}`);
  if (extras.length) out.push(`كما تضمّنت الرعاية ${extras.join("، و")} ضمن متطلبات الحالة.`);

  // ٥) الخاتمة — النتيجة وخلاصة الطبيب
  if (o.summary?.trim()) {
    out.push(o.summary.trim());
  } else if (o.outcome?.trim()) {
    out.push(`وبحمد الله انتهت فترة الرعاية والحالة ${o.outcome.trim()}.`);
  } else {
    out.push(`ولا يزال ${name} تحت متابعة العيادة، ونوصي بالالتزام بمواعيد المراجعة لضمان اكتمال التحسّن.`);
  }

  return out;
}

const HOME_TIPS = [
  "التزم بمواعيد المراجعة التي حدّدها الطبيب، حتى لو بدا الحيوان بحالة جيدة.",
  "وفّر له مكاناً هادئاً ودافئاً ونظيفاً للراحة، وقلّل الحركة والإجهاد قدر الإمكان.",
  "راقب الأكل والشرب والإخراج يومياً، وسجّل أي تغيّر مفاجئ.",
  "لا تعطِ أي دواء من نفسك ولا تغيّر ما وصفه الطبيب قبل الرجوع للعيادة.",
  "راجعنا فوراً عند ملاحظة خمول شديد، امتناع عن الأكل، قيء أو إسهال متكرر، أو صعوبة بالتنفس.",
];

export function buildCareReportHTML(o: CareReportOptions): string {
  const dir = o.lang.startsWith("ar") ? "rtl" : "ltr";
  const brand = esc(o.brand || "doctorVet");
  const WEBSITE = siteHost();
  const logo = o.logoUrl ? esc(String(o.logoUrl)) : "";
  const fb = (o.facebook || "").trim();
  const ig = (o.instagram || "").trim();
  const s = o.stats;

  const phoneHTML = o.clinicPhone
    ? `<div class="wa">${WA_ICON}<span dir="ltr" style="unicode-bidi:isolate;direction:ltr">${esc(o.clinicPhone)}</span></div>`
    : "";
  const socials = (fb || ig)
    ? `<div class="socials">${fb ? `<span class="s">${FB_ICON}<span dir="ltr">${esc(fb)}</span></span>` : ""}${ig ? `<span class="s">${IG_ICON}<span dir="ltr">${esc(ig)}</span></span>` : ""}</div>`
    : "";

  const cell = (label: string, value: string) =>
    `<div class="af"><span class="al">${esc(label)}</span><span class="av">${esc(value) || "—"}</span></div>`;

  const stat = (value: string, label: string) =>
    `<div class="st"><div class="sv">${esc(value)}</div><div class="sl">${esc(label)}</div></div>`;

  const paragraphs = buildNarrative(o).map((p) => `<p>${esc(p)}</p>`).join("");
  const tips = HOME_TIPS.map((x) => `<li>${esc(x)}</li>`).join("");

  // بطاقات الأرقام: الالتزام أولاً — هو جوهر ما يريد صاحب الحيوان أن يطمئن له.
  const statCards = [
    s.days > 0 ? stat(`${n(s.days)}`, "أيام الرعاية") : "",
    s.doses > 0 ? stat(`${n(s.dosesGiven)} / ${n(s.doses)}`, "الجرعات المنفَّذة") : "",
    s.doses > 0 ? stat(`${n(s.adherence)}%`, "الالتزام بالمواعيد") : "",
    s.observations > 0 ? stat(`${n(s.observations)}`, "قياسات المتابعة") : "",
  ].filter(Boolean).join("");

  const css = `
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
    body{font-family:'Segoe UI',system-ui,-apple-system,'Tahoma',sans-serif;color:#0b1220;position:relative}
    .sheet{width:210mm;min-height:297mm;margin:0 auto;padding:13mm 12mm 16mm;position:relative;z-index:1;display:flex;flex-direction:column;gap:11px}
    .watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:0;pointer-events:none;overflow:hidden}
    .watermark img{width:78%;max-width:150mm;filter:grayscale(100%);opacity:.05;transform:scale(1.6)}

    .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;border-bottom:3px solid #1266d8;padding-bottom:11px}
    .party{min-width:0}.party.end{text-align:end}
    .brand{font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#1266d8;margin-bottom:2px}
    .clinic{font-size:20px;font-weight:800;letter-spacing:-.2px;line-height:1.15}
    .wa{display:flex;align-items:center;gap:5px;color:#475569;font-size:11px;font-weight:600;margin-top:4px}
    .party.end .wa{justify-content:flex-end}
    .socials{margin-top:4px;display:flex;flex-direction:column;gap:2px;font-size:10px;color:#64748b}
    .socials .s{display:inline-flex;align-items:center;gap:5px}
    .logo-mid{text-align:center}.logo-mid img{max-height:80px;max-width:150px;object-fit:contain}
    .logo-mid .ph{font-size:20px;font-weight:800;color:#1266d8}
    .doc-title{font-size:22px;font-weight:800;color:#1266d8;letter-spacing:.3px}
    .doc-sub{font-size:11px;color:#475569;margin-top:3px}.doc-sub b{color:#0b1220}

    .greet{background:#eff5ff;border:1px solid #cfe0fb;border-radius:10px;padding:10px 13px;font-size:12.5px;font-weight:700;color:#1e3a5f;display:flex;align-items:center;gap:8px}

    .animal{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:#e2e8f0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
    .af{background:#f8fafc;padding:7px 9px;min-width:0;display:flex;flex-direction:column;gap:2px}
    .al{font-size:9px;font-weight:800;letter-spacing:.3px;color:#94a3b8}
    .av{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:9px}
    .st{border:1px solid #cfe0fb;background:#f5f9ff;border-radius:10px;padding:10px 8px;text-align:center}
    .sv{font-size:21px;font-weight:800;color:#0b4ea3;line-height:1.1}
    .sl{font-size:10px;font-weight:700;color:#64748b;margin-top:3px}

    .sec-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;margin:4px 0 -3px}
    .sec-title .bar{display:inline-block;width:4px;height:15px;border-radius:2px;background:#1266d8}
    .body-text{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px}
    .body-text p{margin:0 0 9px;font-size:12.5px;line-height:2;color:#16233a;text-align:justify}
    .body-text p:last-child{margin-bottom:0}

    .tips{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px 14px}
    .tips ul{margin:0;padding-inline-start:18px}
    .tips li{font-size:11.5px;line-height:1.95;color:#334155;font-weight:600}

    .note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 13px;font-size:11.5px;line-height:1.9;color:#7c5b12;font-weight:600}

    .sign{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:6px}
    .sg{border-top:1px dashed #94a3b8;padding-top:7px;font-size:11px;font-weight:700;color:#475569}
    .sg .v{font-size:12.5px;font-weight:800;color:#0b1220;margin-top:2px}

    .foot{margin-top:auto;padding-top:9px;border-top:1px solid #e2e8f0;font-size:9.5px;font-weight:600;line-height:1.65;color:#64748b}
    .page-foot{position:absolute;bottom:8mm;inset-inline-start:12mm;font-size:10px;letter-spacing:.5px;color:#94a3b8;direction:ltr;z-index:1}
    .page-num{position:absolute;bottom:8mm;inset-inline-end:12mm;font-size:10px;letter-spacing:.5px;color:#94a3b8;direction:ltr;z-index:1}

    @media print{
      html,body{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
      .watermark{display:flex !important}
      .watermark img{opacity:.05 !important;filter:grayscale(100%) !important}
    }
    @page{size:A4;margin:0}
  `;

  return `<!doctype html><html lang="${esc(o.lang)}" dir="${dir}"><head><meta charset="utf-8"/>
  <title>${esc("تقرير الحالة")} — ${esc(o.pet.name)}</title><style>${css}</style></head>
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
          <div class="doc-title">تقرير الحالة</div>
          <div class="doc-sub">تاريخ التقرير: <b>${esc(o.printedAt)}</b></div>
          ${o.fileNo ? `<div class="doc-sub">رقم الملف: <b>${esc(o.fileNo)}</b></div>` : ""}
        </div>
      </div>

      <div class="greet">${PAW}<span>${esc(o.ownerName?.trim() ? `السيد/ة ${o.ownerName.trim()} المحترم/ة — فيما يلي تقرير عن حالة ${o.pet.name} ومسار رعايته في عيادتنا.` : `تقرير عن حالة ${o.pet.name} ومسار رعايته في عيادتنا.`)}</span></div>

      <div class="animal">
        ${cell("اسم الحيوان", o.pet.name)}
        ${cell("النوع", o.pet.species)}
        ${cell("الجنس", o.pet.sex)}
        ${cell("العمر", o.pet.age)}
        ${cell("تاريخ الاستقبال", o.openedAt)}
      </div>

      ${statCards ? `<div class="stats">${statCards}</div>` : ""}

      <div class="sec-title"><span class="bar"></span> ملخّص الحالة والرعاية</div>
      <div class="body-text">${paragraphs}</div>

      ${o.homeCare?.trim() ? `<div class="sec-title"><span class="bar"></span> توصيات خاصة من الطبيب</div><div class="note">${esc(o.homeCare.trim())}</div>` : ""}

      <div class="sec-title"><span class="bar"></span> إرشادات العناية في المنزل</div>
      <div class="tips"><ul>${tips}</ul></div>

      <div class="sign">
        <div class="sg">الطبيب المعالج<div class="v">${esc(o.doctor || "—")}</div></div>
        <div class="sg">ختم العيادة والتوقيع<div class="v">&nbsp;</div></div>
      </div>

      <div class="foot">
        ${NOTE} هذا التقرير ملخّصٌ عن مسار الرعاية داخل العيادة ويُسلَّم لصاحب الحيوان بناءً على طلبه. التفاصيل الدوائية الكاملة محفوظة في السجل الطبي الداخلي للحيوان، ويمكن مراجعة الطبيب المعالج بشأن أي استفسار.
      </div>
    </div>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},150);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>
  </body></html>`;
}

/** يفتح التقرير بنافذة طباعة جديدة. يُرجع false إذا منعها حاجب النوافذ. */
export function openCareReport(o: CareReportOptions): boolean {
  const html = buildCareReportHTML(o);
  const w = window.open("", "_blank", "width=880,height=1000");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
