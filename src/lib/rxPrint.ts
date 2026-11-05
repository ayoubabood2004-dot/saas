/* ============================================================================
 * راجيتةُ العيادة (0261) — بانيها: مستندُ HTML واحدٌ تعرضه المعاينةُ (iframe) وتطبعه نافذةُ الطباعة حرفاً بحرف.
 *
 * وحدةٌ صِرفة بلا نصوص: العناوينُ (Date، Patient's name…) وكلُّ ما يُكتب يصلها جاهزاً من المستدعي، وكلُّه يُهرَّب
 * (document.write يجري بأصل التطبيق — نصُّ طبيبٍ فيه `<script>` لا يصير شِفرة). والأرقامُ تُحصر، والألوانُ تُفحص،
 * والروابطُ لا تمرّ إلا https/data:image/blob.
 *
 * الورقة: A5 (أو A4) بحجمها الحقيقيّ، و`@page` بلا هوامش. قالبٌ مرسوم (ترويسةٌ بثلاث خانات: الشعارُ واسمُ العيادة،
 * الدكاترةُ بالوسط، شعارُ الدائرة) أو صورةُ راجيتة العيادة خلفيةً وخاناتٌ فوقها بمواضعها. العناوينُ المطبوعة بلون
 * الحبر الواحد (كما تطبعها المطبعة)، والمكتوبُ — خاناتُ المريض والوصفة — بحبر القلم الأزرق الغامق.
 *
 * والوصفةُ لا تُقصّ بصمت (قائمةٌ ناقصة أخطرُ من خطأ ظاهر): سكربتُ الترتيب يصغّر الخطَّ حتى حدّه، ثم يكمل بصفحةٍ
 * ثانية بنفس الترويسة، ويقسم السطرَ الطويل عند كلمة. وما لا ينقسم (كلمةٌ أطولُ من الصفحة) يُعلَّم `data-overflow`
 * فتقوله الشاشةُ قبل الطباعة. السكربتُ نفسُه بالمعاينة والطباعة؛ والطباعةُ الآليةُ بنافذة الطباعة وحدها.
 * ========================================================================= */
import { RX_PAPER, type RxFields, type RxLabels, type RxPadConfig } from "./rxLayout";

export interface RxDocInput {
  cfg: RxPadConfig;
  clinic: {
    /** اسمُ العيادة على الورقة (التصميمُ أو اسمُ العيادة بالإعدادات). */
    title: string;
    subtitle: string;
    logoUrl: string | null;
    emblemUrl: string | null;
    bgUrl: string | null;
    /** سطرُ الدوام جاهزاً ("" = لا يُطبع). */
    hours: string;
    socials: { kind: "fb" | "ig"; handle: string }[];
  };
  fields: RxFields;
  /** التاريخُ كما يُطبع (DD/MM/YYYY). */
  dateText: string;
  body: string;
  /** الدكتورُ الموقِّع ("" = بلا اسم تحت التوقيع). */
  doctor: string;
  labels: RxLabels;
  /** عنوانُ نافذة الطباعة. */
  docTitle: string;
}

const INK = "#19213a";
const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** رقمٌ للأنماط: محصورٌ ومنتهٍ دائماً (NaN بنمطٍ يُسقط القاعدةَ كلَّها بصمت). */
const n = (v: unknown, min: number, max: number, dflt: number): string => {
  const x = typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
  return String(Number(x.toFixed(3)));
};
const color = (v: unknown, dflt: string): string => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : dflt);
/** رابطُ صورة: https أو data:image أو blob — وغيرُه لا يُكتب (javascript: وأخواتها). */
export function rxSafeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = u.trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(s.replace(/\s+/g, ""))) return s.replace(/\s+/g, "");
  if (/^blob:https?:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return null;
}

const FONT_FAMILY: Record<RxPadConfig["font"], { css: string; stack: string }> = {
  ruqaa: { css: "Aref+Ruqaa:wght@700", stack: `"Aref Ruqaa", "Amiri", serif` },
  naskh: { css: "Amiri:wght@700", stack: `"Amiri", serif` },
  kufi: { css: "Reem+Kufi:wght@600", stack: `"Reem Kufi", "Cairo", sans-serif` },
};

/* أيقوناتٌ صغيرةٌ بخطّ الحبر — تُرسم بلون الطباعة، ولا خطوطَ أيقوناتٍ تُنزَّل. */
const ICON = {
  pin: `<path d="M12 21s-6.5-6.1-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  phone: `<path d="M6.6 3.5h2.6l1.4 4-2 1.3a12 12 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>`,
  fb: `<path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V9a.5.5 0 0 1 .5-.5z"/>`,
  ig: `<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6"/>`,
};
const icon = (k: keyof typeof ICON) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const CHECK = `<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 6.5"/></svg>`;

/** أسطرُ الوصفة: كلُّ سطرٍ عنصرٌ باتّجاهه (الدواءُ الإنكليزيّ يسار والتعليمةُ العربية يمين)، والفارغُ يحفظ مكانه. */
function bodyLines(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  return lines.map((l) => (l.trim() ? `<div class="ln" dir="auto">${esc(l)}</div>` : `<div class="ln">&nbsp;</div>`)).join("");
}

/* ── سكربتُ الترتيب (بالمعاينة والطباعة) ─────────────────────────────────────
 * بعد تحميل الخطوط: يصغّر خطَّ الوصفة حتى حدّه الأدنى، ثمّ ينقل الأسطرَ الفائضة لصفحةٍ مستنسخة (الترويسةُ وخاناتُ
 * المريض والعلامةُ المائية معها)، ويقسم السطرَ الأطولَ من الصفحة عند كلمة. يختم <html> بـdata-pages/data-ready،
 * وdata-overflow لما لم ينقسم، ويطلق «rx-ready». */
const LAYOUT_JS = `(function(){var done=false;
function L(p){return p.querySelector('.rx-lines');}
function over(b){return b.scrollHeight>b.clientHeight+1;}
function split(el,b){var t=el.textContent||'';var parts=t.split(/(\\s+)/);if(parts.length<2)return null;var lo=1,hi=parts.length-1,best=0;
while(lo<=hi){var mid=(lo+hi)>>1;el.textContent=parts.slice(0,mid).join('');if(over(b))hi=mid-1;else{best=mid;lo=mid+1;}}
if(best===0){el.textContent=t;return null;}el.textContent=parts.slice(0,best).join('');var rest=el.cloneNode(false);rest.textContent=parts.slice(best).join('').replace(/^\\s+/,'');return rest.textContent?rest:null;}
function fire(){try{window.dispatchEvent(new Event('rx-ready'));}catch(e){}}
function run(){if(done)return;done=true;var root=document.documentElement;var first=document.querySelector('.page');var b=first&&L(first);
if(!b){root.setAttribute('data-pages','1');root.setAttribute('data-ready','1');fire();return;}
var max=parseFloat(b.getAttribute('data-max'))||12,min=parseFloat(b.getAttribute('data-min'))||9,fs=max;b.style.fontSize=fs+'pt';
while(over(b)&&fs>min){fs=Math.max(min,fs-0.5);b.style.fontSize=fs+'pt';}
var page=first,guard=0,overflow=false;
while(over(b)&&guard++<30){var clone=page.cloneNode(true);var nb=L(clone);nb.innerHTML='';page.parentNode.insertBefore(clone,page.nextSibling);
while(over(b)&&b.children.length>1)nb.insertBefore(b.lastElementChild,nb.firstChild);
if(over(b)){var rest=split(b.lastElementChild,b);if(rest)nb.insertBefore(rest,nb.firstChild);else{overflow=true;}}
if(!nb.children.length){clone.parentNode.removeChild(clone);break;}
if(overflow)break;page=clone;b=nb;}
if(over(b))overflow=true;
var pages=document.querySelectorAll('.page');if(pages.length>1)for(var i=0;i<pages.length;i++){var pn=pages[i].querySelector('.pno');if(pn)pn.textContent=(i+1)+' / '+pages.length;}
root.setAttribute('data-pages',String(pages.length));if(overflow)root.setAttribute('data-overflow','1');root.setAttribute('data-ready','1');fire();}
function go(){if(document.fonts&&document.fonts.ready)document.fonts.ready.then(run,run);else run();}
if(document.readyState==='complete')go();else window.addEventListener('load',go);setTimeout(run,4000);})();`;

const PRINT_JS = `(function(){var p=false;function go(){if(p)return;p=true;setTimeout(function(){window.focus();window.print();},150);}
if(document.documentElement.getAttribute('data-ready'))go();else window.addEventListener('rx-ready',go);setTimeout(go,7000);
window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},250);});})();`;

/**
 * المستندُ كاملاً. `print`: يضيف الطباعةَ الآلية (نافذةُ الطباعة وحدها — المعاينةُ لا تطبع نفسها).
 * `calibrate`: صفحةُ المعايرة لصورة الراجيتة — الخاناتُ بإطاراتٍ متقطّعة بلا الصورة، تُطبع فوق الراجيتة المطبوعة.
 */
export function buildRxHTML(d: RxDocInput, opts: { print?: boolean; calibrate?: boolean } = {}): string {
  const { cfg, clinic, labels } = d;
  const paper = RX_PAPER[cfg.paper] ?? RX_PAPER.a5;
  const k = cfg.paper === "a4" ? 1.3 : 1;
  const accent = color(cfg.accent, "#1f5f55");
  const dir = cfg.lang === "ar" ? "rtl" : "ltr";
  const font = FONT_FAMILY[cfg.font] ?? FONT_FAMILY.ruqaa;
  const logo = rxSafeUrl(clinic.logoUrl);
  const emblem = rxSafeUrl(clinic.emblemUrl);
  const bg = rxSafeUrl(clinic.bgUrl);
  const image = cfg.mode === "image";
  const calibrate = !!opts.calibrate;
  const printBg = image && cfg.bgPrint && !calibrate;
  const pt = (v: number) => `${n(v * k, 4, 60, 10)}pt`;
  const fontsHref = `https://fonts.googleapis.com/css2?family=${font.css}&family=Cairo:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,600;1,700&display=swap`;

  const css = `
@page{size:${paper.w}mm ${paper.h}mm;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
html{background:#dfe2e6}
body{font-family:"Cairo","IBM Plex Sans Arabic",system-ui,sans-serif;color:${INK}}
.page{position:relative;width:${paper.w}mm;height:${paper.h}mm;overflow:hidden;background:#fff;margin:0 auto 6mm;box-shadow:0 2px 14px rgba(20,24,33,.16);break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto;margin-bottom:0}
html[data-preview] {background:#fff}
html[data-preview] .page{margin:0;box-shadow:none}
html[data-preview] .page+.page{border-top:1px dashed #b9bec7}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none;border:0!important}}
.ic{width:1em;height:1em;flex:none;fill:none;stroke:${accent};stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.14em}
.ln{min-height:1.55em;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;unicode-bidi:plaintext}
.pno{font-size:${pt(7)};color:${accent};opacity:.8;font-variant-numeric:tabular-nums}
/* ── القالب ── */
.tp{display:flex;flex-direction:column;height:100%;padding:${n(7 * k, 4, 14, 7)}mm ${n(8 * k, 4, 16, 8)}mm ${n(6 * k, 3, 12, 6)}mm}
.wm{position:absolute;left:50%;top:${n(cfg.wm.y, 15, 85, 58)}%;width:${n(cfg.wm.size, 15, 95, 55)}%;transform:translate(-50%,-50%);opacity:${n(cfg.wm.opacity / 100, 0.02, 0.3, 0.08)};${cfg.wm.gray ? "filter:grayscale(1);" : ""}pointer-events:none;z-index:0}
.wm img{display:block;width:100%;height:auto}
.tp>*{position:relative;z-index:1}
.hd{display:grid;grid-template-columns:1fr 1.15fr 1fr;align-items:center;gap:${n(3 * k, 1, 8, 3)}mm;direction:ltr}
.hd>div{direction:${dir};min-width:0}
.cell-l{justify-self:start;text-align:left}.cell-r{justify-self:end;text-align:right}.cell-c{text-align:center}
.brand{display:flex;flex-direction:column;align-items:center;gap:.6mm;text-align:center;max-width:100%}
.brand img{max-height:${n(17 * k, 8, 30, 17)}mm;max-width:${n(30 * k, 14, 50, 30)}mm;object-fit:contain}
.ttl{font-family:${font.stack};font-size:${pt(cfg.font === "ruqaa" ? 17 : 16)};line-height:1.25;color:${accent};direction:rtl;unicode-bidi:plaintext;overflow-wrap:anywhere}
.sub{font-size:${pt(6.6)};letter-spacing:.14em;text-transform:uppercase;color:${accent};opacity:.85;unicode-bidi:plaintext}
.docs{display:grid;gap:${n(2.2 * k, 1, 5, 2.2)}mm;justify-items:center}
.docs.two{grid-template-columns:1fr 1fr;column-gap:${n(3 * k, 1, 6, 3)}mm}
.doc{text-align:center}
.dn{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:${pt(11)};line-height:1.15;color:${INK};unicode-bidi:plaintext}
.dl{font-size:${pt(6.4)};line-height:1.35;color:${accent};opacity:.9;white-space:pre-line;unicode-bidi:plaintext;margin-top:.4mm}
.emb{display:grid;place-items:center}
.emb img{width:${n(19 * k, 10, 32, 19)}mm;height:${n(19 * k, 10, 32, 19)}mm;object-fit:contain;border-radius:50%}
.rule{margin:${n(3 * k, 1, 6, 3)}mm 0 ${n(1.6 * k, 0.5, 4, 1.6)}mm;height:${n(2.2 * k, 1, 4, 2.2)}px;border-top:${n(1.8 * k, 1, 3, 1.8)}px solid ${accent};border-bottom:.7px solid ${accent}}
.ct{display:flex;flex-wrap:wrap;justify-content:center;gap:.8mm ${n(4 * k, 2, 8, 4)}mm;font-size:${pt(7.2)};color:${accent}}
.ct span{display:inline-flex;align-items:center;gap:1mm;white-space:nowrap}
.ct b{font-weight:600}
.ct bdi{color:${INK};font-weight:600}
.pt{margin-top:${n(4 * k, 2, 8, 4)}mm;display:grid;gap:${n(2.6 * k, 1.5, 5, 2.6)}mm;font-size:${pt(8.4)}}
.row{display:flex;align-items:flex-end;gap:${n(4 * k, 2, 8, 4)}mm}
.tks{display:flex;gap:${n(3.6 * k, 2, 7, 3.6)}mm;align-items:center;flex:none}
.tk{display:inline-flex;align-items:center;gap:1.2mm;color:${accent};font-weight:600}
.bx{position:relative;display:inline-block;width:${n(3.2 * k, 2.4, 5, 3.2)}mm;height:${n(3.2 * k, 2.4, 5, 3.2)}mm;border:.8px solid ${accent};border-radius:.6mm}
.bx .ck{position:absolute;inset:-28%;width:156%;height:156%}
.ck{fill:none;stroke:${INK};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.fl{display:flex;align-items:flex-end;gap:1.4mm;min-width:0;flex:1}
.fl>b{color:${accent};font-weight:600;white-space:nowrap}
.fl .v{flex:1;min-width:0;border-bottom:.8px dotted ${accent};padding:0 1mm .3mm;font-size:${pt(10.2)};font-weight:600;line-height:1.25;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext;min-height:1.3em}
.f2{flex:2}
.rxa{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;margin-top:${n(3.5 * k, 2, 7, 3.5)}mm}
.rxm{font-family:"Cormorant Garamond",Georgia,serif;font-style:italic;font-weight:700;color:${accent};font-size:${pt(30)};line-height:.9;direction:ltr;align-self:${dir === "rtl" ? "flex-end" : "flex-start"};margin-bottom:${n(1.5 * k, 0.5, 4, 1.5)}mm}
.rxm i{font-size:.62em;font-style:italic;margin-inline-start:-.08em;vertical-align:-.18em}
.rx-lines{flex:1 1 auto;min-height:0;overflow:hidden;padding:0 ${n(3 * k, 1, 6, 3)}mm;color:${INK}}
.sg{display:flex;justify-content:flex-end;margin-top:${n(2 * k, 1, 5, 2)}mm}
.sgb{width:${n(46 * k, 30, 70, 46)}mm;text-align:center}
.sgl{font-size:${pt(7)};color:${accent};font-weight:600;text-align:start}
.sgline{margin-top:${n(7 * k, 4, 12, 7)}mm;border-top:.8px solid ${accent}}
.sgn{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:${pt(10)};margin-top:.8mm;unicode-bidi:plaintext}
.ft{display:flex;align-items:center;justify-content:space-between;gap:3mm;margin-top:${n(2.5 * k, 1, 5, 2.5)}mm;padding-top:1.4mm;border-top:.6px solid ${accent};font-size:${pt(7)};color:${accent};min-height:${n(4 * k, 2, 8, 4)}mm}
.ft .so{display:inline-flex;gap:${n(3.5 * k, 2, 7, 3.5)}mm;flex-wrap:wrap}
.ft .so span{display:inline-flex;align-items:center;gap:1mm}
/* ── صورةُ راجيتة العيادة ── */
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:${cfg.bgFit === "contain" ? "contain" : "fill"};z-index:0}
.ov{position:absolute;inset:0;z-index:1;font-size:${n(cfg.fontPt, 8, 18, 12)}pt}
.sl{position:absolute;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;line-height:1.2;color:${INK};unicode-bidi:plaintext}
.tkm{position:absolute;width:1.25em;height:1.25em;transform:translate(-50%,-50%)}
.tkm .ck{width:100%;height:100%}
.box{position:absolute;display:flex;flex-direction:column}
.box .rx-lines{padding:0}
${printBg ? "" : image ? "@media print{.bg{display:none}}" : ""}
${image && !printBg ? `@media print{.ov{transform:translate(${n(cfg.nudge.x, -15, 15, 0)}mm,${n(cfg.nudge.y, -15, 15, 0)}mm)}}` : ""}
.cal .sl,.cal .box{outline:1px dashed ${accent};outline-offset:1px}
.cal .tkm{outline:1px dashed ${accent}}
.cal .bg{display:none}
`;

  const f = d.fields;
  const value = (s: string) => `<span class="v">${esc(s) || "&nbsp;"}</span>`;
  let pageInner: string;
  const maxPt = image ? cfg.fontPt : 12.5 * k;
  const minPt = image ? Math.max(8, cfg.fontPt - 3) : 9.5 * k;
  const linesBox = `<div class="rx-lines" data-max="${n(maxPt, 6, 30, 12)}" data-min="${n(minPt, 6, 24, 9)}">${bodyLines(d.body)}</div>`;

  if (!image) {
    const brand = cfg.showLogo || clinic.title || clinic.subtitle
      ? `<div class="brand">${cfg.showLogo && logo ? `<img src="${esc(logo)}" alt="">` : ""}${clinic.title ? `<div class="ttl">${esc(clinic.title)}</div>` : ""}${clinic.subtitle ? `<div class="sub">${esc(clinic.subtitle)}</div>` : ""}</div>`
      : "";
    const docs = cfg.doctors.length
      ? `<div class="docs${cfg.doctors.length > 2 ? " two" : ""}">${cfg.doctors.map((x) => `<div class="doc"><div class="dn">${esc(x.name)}</div>${x.lines ? `<div class="dl">${esc(x.lines)}</div>` : ""}</div>`).join("")}</div>`
      : "";
    const emb = emblem ? `<div class="emb"><img src="${esc(emblem)}" alt=""></div>` : "";
    const left = cfg.logoSide === "left" ? brand : emb;
    const right = cfg.logoSide === "left" ? emb : brand;
    const contact = [
      cfg.address ? `<span>${icon("pin")}${esc(cfg.address)}</span>` : "",
      clinic.hours ? `<span>${icon("clock")}<b>${esc(labels.hours)}:</b> <bdi dir="ltr">${esc(clinic.hours)}</bdi></span>` : "",
      cfg.phones.length ? `<span>${icon("phone")}<b>${esc(labels.tel)}:</b> <bdi dir="ltr">${cfg.phones.map(esc).join("  /  ")}</bdi></span>` : "",
    ].filter(Boolean).join("");
    const ticks = (["canine", "feline", "exotic"] as const).map((kk) => `<span class="tk"><i class="bx">${f.kind === kk ? CHECK : ""}</i>${esc(labels[kk])}</span>`).join("");
    const third = cfg.owner || cfg.weight
      ? `<div class="row">${cfg.owner ? `<span class="fl f2"><b>${esc(labels.owner)}:</b>${value(f.owner)}</span>` : ""}${cfg.weight ? `<span class="fl"><b>${esc(labels.weight)}:</b>${value(f.weight)}</span>` : ""}</div>`
      : "";
    const wmSrc = cfg.wm.src === "logo" ? logo : cfg.wm.src === "emblem" ? emblem : null;
    const socials = cfg.socials ? clinic.socials.filter((s) => s.handle).map((s) => `<span>${icon(s.kind)}<bdi dir="ltr">${esc(s.handle)}</bdi></span>`).join("") : "";
    const sign = cfg.signature || d.doctor
      ? `<div class="sg"><div class="sgb">${cfg.signature ? `<div class="sgl">${esc(labels.signature)}</div><div class="sgline"></div>` : ""}${d.doctor ? `<div class="sgn">${esc(d.doctor)}</div>` : ""}</div></div>`
      : "";
    pageInner = `${wmSrc ? `<div class="wm"><img src="${esc(wmSrc)}" alt=""></div>` : ""}
<div class="tp">
  ${brand || docs || emb ? `<header class="hd"><div class="cell-l">${left}</div><div class="cell-c">${docs}</div><div class="cell-r">${right}</div></header>` : ""}
  <div class="rule"></div>
  ${contact ? `<div class="ct">${contact}</div>` : ""}
  <div class="pt">
    <div class="row"><span class="tks">${ticks}</span><span class="fl"><b>${esc(labels.date)}:</b>${value(d.dateText)}</span></div>
    <div class="row"><span class="fl f2"><b>${esc(labels.name)}:</b>${value(f.name)}</span><span class="fl"><b>${esc(labels.age)}:</b>${value(f.age)}</span></div>
    ${third}
  </div>
  <div class="rxa"><div class="rxm">R<i>x</i></div>${linesBox}</div>
  ${sign}
  <footer class="ft"><span class="so">${socials}</span><span class="pno"></span></footer>
</div>`;
  } else {
    const slot = (key: "date" | "name" | "age" | "owner" | "weight" | "doctor", text: string) => {
      const s = cfg.slots[key];
      if (!s.on) return "";
      return `<div class="sl" data-slot="${key}" style="left:${n(s.x, 0, 100, 0)}%;top:${n(s.y, 0, 100, 0)}%;width:${n(s.w, 1, 100, 20)}%">${esc(text) || "&nbsp;"}</div>`;
    };
    const tick = (["canine", "feline", "exotic"] as const)
      .filter((kk) => cfg.ticks[kk].on && (f.kind === kk || calibrate))
      .map((kk) => `<div class="tkm" data-tick="${kk}" style="left:${n(cfg.ticks[kk].x, 0, 100, 0)}%;top:${n(cfg.ticks[kk].y, 0, 100, 0)}%">${CHECK}</div>`).join("");
    const b = cfg.body;
    pageInner = `${bg ? `<img class="bg" src="${esc(bg)}" alt="">` : ""}
<div class="ov">
  ${slot("date", d.dateText)}${slot("name", f.name)}${slot("age", f.age)}${slot("owner", f.owner)}${slot("weight", f.weight)}${slot("doctor", d.doctor)}
  ${tick}
  <div class="box" style="left:${n(b.x, 0, 100, 8)}%;top:${n(b.y, 0, 100, 38)}%;width:${n(b.w, 1, 100, 84)}%;height:${n(b.h, 1, 100, 48)}%">${linesBox}</div>
</div>`;
  }

  const scripts = `<script>${LAYOUT_JS}<\/script>${opts.print ? `<script>${PRINT_JS}<\/script>` : ""}`;
  return `<!doctype html><html lang="${cfg.lang}" dir="${dir}"${opts.print ? "" : " data-preview"}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.docTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontsHref}" rel="stylesheet">
<style>${css}</style></head>
<body><div class="page${calibrate ? " cal" : ""}">${pageInner}</div>${scripts}</body></html>`;
}

/**
 * نافذةُ الطباعة — **تُنادى داخل الضغطة قبل أيّ await** (سفاري يمنع نافذةً بعد انتهاء الضغطة بصمت، درسُ الواتساب).
 * بلا noopener: المقبضُ لازمٌ للكتابة، وnoopener يرجع null فُتحت أو مُنعت. يرجع false إن مُنعت.
 */
export function openRxPrint(html: string): boolean {
  const w = window.open("", "_blank", "width=760,height=980");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
