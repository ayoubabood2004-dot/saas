import type { SVGProps } from "react";
import type { TreatmentEntry } from "@/types";
import { scaleFor } from "@/lib/observations";

/* ============================================================================
 * CareIcon — أيقونات الرعاية المرسومة (بدل الإيموجي).
 *
 * الإيموجي شكلها من تطبيق دردشة لا من نظامٍ طبّي، وكل جهازٍ يرسمها بخطّه
 * (آيفون غير أندرويد غير ويندوز)، ولا تقبل التلوين بدرجة الحالة. هذه مجموعةٌ
 * واحدة بأسلوبٍ واحد — خطّ سميك (stroke 2.6) وحشوةٌ خفيفة (fill 14٪) —
 * تُلوَّن بـ currentColor فتلبس أخضرَ الدرجة الجيدة وأحمرَ الحرجة تلقائياً،
 * وتكبر بلا تبكسل لأنها SVG.
 *
 * التفاصيل مقصودة: ميزان الحرارة معه نبضة، كيس السوائل معه حجرةُ تنقيطٍ
 * وقطرة، صينية الرمل معها حبيباتٌ ومغرفة — الرمز يشرح فعله بلا كلمة.
 * ==========================================================================*/

export type CareKind =
  | "vitals" | "feed" | "elim" | "urine" | "fluid"
  | "nurse" | "lab" | "drug" | "mentation" | "protocol";

/** نوعُ أيقونة صفٍّ من الطبلة — بسُلَّمه المعياري أولاً ثم بنوع مهمّته. */
export function careKindOf(t: TreatmentEntry): CareKind {
  const s = scaleFor(t);
  if (s) {
    if (s.id === "temp") return "vitals";
    if (s.id === "mentation") return "mentation";
    if (s.id === "appetite") return "feed";
    if (s.id === "stool") return "elim";
    if (s.id === "urine") return "urine";
    if (s.id === "fluids") return "fluid";
  }
  switch (t.task_type) {
    case "vitals": return "vitals";
    case "feed": return "feed";
    case "elim": return "elim";
    case "fluid": return "fluid";
    case "lab": return "lab";
    case "drug": return "drug";
    default: return "nurse";
  }
}

/** مسارات كل أيقونة داخل viewBox 48×48 — كلها تعتمد currentColor. */
const ART: Record<CareKind, JSX.Element> = {
  vitals: (
    <>
      <path d="M14.5 11a5 5 0 0 1 10 0v17.6a8 8 0 1 1-10 0V11Z" fill="currentColor" fillOpacity=".14" />
      <path d="M14.5 11a5 5 0 0 1 10 0v17.6a8 8 0 1 1-10 0V11Z" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <path d="M19.5 17v14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="19.5" cy="35.4" r="3.7" fill="currentColor" />
      <path d="M29 23h3.6l2.1-5.4L38 28l2-5h3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  feed: (
    <>
      <circle cx="18.5" cy="19" r="3.4" fill="currentColor" fillOpacity=".38" />
      <circle cx="27" cy="17.4" r="2.7" fill="currentColor" fillOpacity=".28" />
      <circle cx="23.4" cy="23.4" r="2.5" fill="currentColor" fillOpacity=".32" />
      <path d="M9 27.5h30l-3 10.2a5.2 5.2 0 0 1-5 3.8H17a5.2 5.2 0 0 1-5-3.8L9 27.5Z" fill="currentColor" fillOpacity=".14" />
      <path d="M9 27.5h30l-3 10.2a5.2 5.2 0 0 1-5 3.8H17a5.2 5.2 0 0 1-5-3.8L9 27.5Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M6.5 27.5h35" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </>
  ),
  elim: (
    <>
      <path d="M8 27h32v8.4a5.6 5.6 0 0 1-5.6 5.6H13.6A5.6 5.6 0 0 1 8 35.4V27Z" fill="currentColor" fillOpacity=".14" />
      <path d="M8 27h32v8.4a5.6 5.6 0 0 1-5.6 5.6H13.6A5.6 5.6 0 0 1 8 35.4V27Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M5.5 27h37" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="15" cy="33.6" r="1.9" fill="currentColor" fillOpacity=".55" />
      <circle cx="22.4" cy="35.6" r="1.6" fill="currentColor" fillOpacity=".45" />
      <circle cx="29.6" cy="33.2" r="1.8" fill="currentColor" fillOpacity=".5" />
      <circle cx="35.4" cy="35.8" r="1.5" fill="currentColor" fillOpacity=".4" />
      <path d="M28 20.5l6.4-6.4a3 3 0 0 1 4.3 4.3L32.3 24.8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M22.6 20.2l7.2-2.4 2.4 7.2-4.8 1.6a4 4 0 0 1-4.8-4.8l0-1.6Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
    </>
  ),
  urine: (
    <>
      <path d="M24 6.5s11.6 13.2 11.6 20.6a11.6 11.6 0 1 1-23.2 0C12.4 19.7 24 6.5 24 6.5Z" fill="currentColor" fillOpacity=".14" />
      <path d="M24 6.5s11.6 13.2 11.6 20.6a11.6 11.6 0 1 1-23.2 0C12.4 19.7 24 6.5 24 6.5Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M18.4 28.4a5.6 5.6 0 0 0 5.6 5.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  fluid: (
    <>
      <path d="M19 5.5h10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 5.5v3.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14.5 9h19v17.5a6 6 0 0 1-6 6h-7a6 6 0 0 1-6-6V9Z" fill="currentColor" fillOpacity=".14" />
      <path d="M14.5 9h19v17.5a6 6 0 0 1-6 6h-7a6 6 0 0 1-6-6V9Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M14.5 19h19v7.5a6 6 0 0 1-6 6h-7a6 6 0 0 1-6-6V19Z" fill="currentColor" fillOpacity=".34" />
      <path d="M24 32.5v4.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="19.6" y="36.4" width="8.8" height="7.2" rx="2.6" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="24" cy="40" r="1.7" fill="currentColor" />
    </>
  ),
  nurse: (
    <g transform="rotate(-45 24 24)">
      <rect x="5.5" y="16.5" width="37" height="15" rx="7.5" fill="currentColor" fillOpacity=".14" />
      <rect x="5.5" y="16.5" width="37" height="15" rx="7.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <rect x="17" y="16.5" width="14" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="21" cy="21" r="1.5" fill="currentColor" fillOpacity=".6" />
      <circle cx="27" cy="21" r="1.5" fill="currentColor" fillOpacity=".6" />
      <circle cx="21" cy="27" r="1.5" fill="currentColor" fillOpacity=".6" />
      <circle cx="27" cy="27" r="1.5" fill="currentColor" fillOpacity=".6" />
    </g>
  ),
  lab: (
    <>
      <path d="M15.5 6.5h17" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M18.5 8h11v25.5a5.5 5.5 0 0 1-11 0V8Z" fill="currentColor" fillOpacity=".14" />
      <path d="M18.5 22.5h11v11a5.5 5.5 0 0 1-11 0v-11Z" fill="currentColor" fillOpacity=".4" />
      <path d="M18.5 8h11v25.5a5.5 5.5 0 0 1-11 0V8Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="22.4" cy="28.6" r="1.7" fill="currentColor" fillOpacity=".55" />
      <circle cx="26.4" cy="32.4" r="1.3" fill="currentColor" fillOpacity=".45" />
      <path d="M33 12.5l6.5 6.5M39.5 12.5L33 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".5" />
    </>
  ),
  drug: (
    <g transform="rotate(-45 24 24)">
      <path d="M13 19.5h20v9H13z" fill="currentColor" fillOpacity=".14" />
      <path d="M13 19.5h20v9H13z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M13 19.5h7v9h-7z" fill="currentColor" fillOpacity=".38" />
      <path d="M8 21.4v5.2M10.6 19.5v9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M33 24h6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M23 19.5v4M27 19.5v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".55" />
    </g>
  ),
  mentation: (
    <>
      <path d="M24 40.5S9.5 31.6 9.5 21.5A7.9 7.9 0 0 1 24 16.8a7.9 7.9 0 0 1 14.5 4.7c0 10.1-14.5 19-14.5 19Z" fill="currentColor" fillOpacity=".14" />
      <path d="M24 40.5S9.5 31.6 9.5 21.5A7.9 7.9 0 0 1 24 16.8a7.9 7.9 0 0 1 14.5 4.7c0 10.1-14.5 19-14.5 19Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M12 25.5h5.4l2.6-5.2 3.6 10.4 2.6-5.2H36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  protocol: (
    <>
      <path d="M13 8.5h16.5L37 16v23.5A4 4 0 0 1 33 43.5H13a4 4 0 0 1-4-4V12.5a4 4 0 0 1 4-4Z" fill="currentColor" fillOpacity=".14" />
      <path d="M13 8.5h16.5L37 16v23.5A4 4 0 0 1 33 43.5H13a4 4 0 0 1-4-4V12.5a4 4 0 0 1 4-4Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M29 8.5V16h8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M15.5 25.5l3.4 3.4 6-6.4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 35.5h15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".6" />
    </>
  ),
};

export function CareIcon({ kind, size = 20, ...rest }: { kind: CareKind; size?: number } & Omit<SVGProps<SVGSVGElement>, "children">) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable="false" {...rest}>
      {ART[kind]}
    </svg>
  );
}
