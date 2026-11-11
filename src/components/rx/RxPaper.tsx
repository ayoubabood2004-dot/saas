/* ============================================================================
 * الورقةُ نفسُها على الشاشة: مستندُ الطباعة (rxPrint) بإطارٍ بحجمه الحقيقيّ، مصغَّراً ليملأ عرضَ مكانه — فما يُرى
 * هو ما يُطبع، بخطوطه وترتيبه وصفحاته.
 *
 * وحدةٌ بلا نصوص (العنوانُ من المستدعي) يستعملها المحرّرُ والمصمِّم. والإطارُ لا يُلمس (pointer-events: none):
 * المصمِّمُ يضع فوقه طبقتَه (children) بإحداثيات الصفحة الأولى نفسِها — نسبٌ مئوية من يسارها وأعلاها.
 * والمستندُ يُعاد رسمُه بعد هدوء الكتابة (ربعُ ثانية) لا مع كلّ حرف: الإطارُ يعيد تحميلَ خطوطه كلَّ مرّة.
 *
 * والترتيبُ يُقرأ **كلَّ مرّة** يُعاد (ترتيبٌ مؤقّت ثم النهائيّ بعد الخطوط والصور) لا أوّلَ مرّةٍ وحدها، ويُقال معه **أيُّ
 * مستندٍ قِيس** (`html`): المستدعي يحكم على المستند الحاليّ بقياسه هو، لا بقياس ما قبله (ربعُ الثانية بعد كلّ حرف).
 * والقياسُ يصل **برسالةٍ من الإطار** (`{rxLayout}`، مصدرُها نافذةُ إطارنا) لا بحدث تحميله: صورةٌ معلَّقة تحجب التحميل، وكان
 * المستمعُ يُركَّب فيه — فلا فائضَ يُقال ولا عددَ صفحات، وكلُّ طباعةٍ تنتظر حكمَ نافذتها.
 * ========================================================================= */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { RX_PAPER, type RxPaperSize } from "@/lib/rxLayout";
import "./rxPad.css";

const PX_PER_MM = 96 / 25.4;
export interface RxLayoutInfo {
  pages: number;
  overflow: boolean;
  /** بعد تحميل الخطوط والصور (أو مهلتها) — المؤقّتُ قد يتغيّر. */
  final: boolean;
  /** نهائيٌّ رأى كلَّ ما ستراه نافذةُ الطباعة: الصورُ كلُّها وصلت سليمة، والخطوطُ طُبّقت بلا فشل. نهائيٌّ قسريٌّ وصورةٌ معلَّقة، أو
   *  صورةٌ فشلت هنا وتصل للنافذة بطلبها، ليس كذلك — قياسُه بلا الشعار، والنافذةُ تطبعه به. */
  whole: boolean;
  /** المستندُ الذي قِيس (كما مُرِّر بـ`html`). */
  html: string;
}

/** عرضُ الورقة حتى تسعها الشاشةُ طولاً (النافذةُ ٩٢vh ناقصَ رأسها وشريطها) — ورقةٌ أطولُ من مكانها تُدفع تحت الرأس. */
export const RX_FIT: CSSProperties = { maxWidth: "min(34rem, calc((92vh - 15rem) * 0.705))", marginInline: "auto" };
/** وأكثرُ من صفحة: تتمرّر داخل مكانها. */
export const RX_FIT_SCROLL: CSSProperties = { maxHeight: "calc(92vh - 14rem)", overflowY: "auto" };

export function RxPaper({ html, paper, title, onLayout, children, className, style }: {
  html: string;
  paper: RxPaperSize;
  title: string;
  onLayout?: (info: RxLayoutInfo) => void;
  /** طبقةٌ فوق الصفحة الأولى (مقابضُ المصمِّم). */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(html);
  const [pages, setPages] = useState(1);
  const layoutCb = useRef(onLayout);
  layoutCb.current = onLayout;
  /* كلُّ مستندٍ بالإطار يحمل رقمَه (data-rxseq) — فالقياسُ يُنسب لمستنده ولو تبدّل الإطارُ بينهما. */
  const seq = useRef({ n: 0, byN: new Map<number, string>() });
  const tagged = useMemo(() => {
    const m = seq.current;
    m.n += 1;
    m.byN.set(m.n, shown);
    if (m.byN.size > 8) m.byN.delete(m.byN.keys().next().value as number);
    return shown.replace(/^<!doctype html><html /i, (h) => `${h}data-rxseq="${m.n}" `);
  }, [shown]);

  const pw = RX_PAPER[paper].w * PX_PER_MM;
  const ph = RX_PAPER[paper].h * PX_PER_MM;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (html === shown) return;
    const id = window.setTimeout(() => setShown(html), 250);
    return () => window.clearTimeout(id);
  }, [html, shown]);

  /* بعد كلّ ترتيبٍ داخل الإطار: عددُ الصفحات وما فاض، ونهائيٌّ أم مؤقّت — رسالةُ سكربت الترتيب برقم مستندها. ورقمٌ أقدمُ مما
     قُرئ لا يُقرأ (رسالةُ مستندٍ سبق التبديل). والمستمعُ يُركَّب قبل أن يبدأ الإطار (useLayoutEffect) فلا تفوته أوّلُ رسالة. */
  const last = useRef(0);
  useLayoutEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = (e.data as { rxLayout?: { seq?: unknown; pages?: unknown; overflow?: unknown; final?: unknown; whole?: unknown } } | null)?.rxLayout;
      if (!d) return;
      const k = Number(d.seq);
      const src = seq.current.byN.get(k);
      if (src === undefined || k < last.current) return;
      last.current = k;
      const n = Math.max(1, Number(d.pages) || 1);
      setPages(n);
      layoutCb.current?.({ pages: n, overflow: d.overflow === true, final: d.final === true, whole: d.whole === true, html: src });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const scale = width > 0 ? width / pw : 0;
  const totalH = ph * pages;
  return (
    <div ref={box} className={className} style={style} dir="ltr">
      <div className="rxp-sheet relative overflow-hidden rounded-sm bg-white" style={{ height: scale ? totalH * scale : undefined, aspectRatio: scale ? undefined : `${pw} / ${ph}` }}>
        <iframe
          ref={frame}
          title={title}
          srcDoc={tagged}
          tabIndex={-1}
          sandbox="allow-same-origin allow-scripts"
          className="rxp-frame pointer-events-none absolute left-0 top-0"
          style={{ width: pw, height: totalH, transform: `scale(${scale || 0.0001})` }}
        />
        {children && scale > 0 && (
          <div className="absolute left-0 top-0" style={{ width: pw * scale, height: ph * scale }}>{children}</div>
        )}
      </div>
    </div>
  );
}
