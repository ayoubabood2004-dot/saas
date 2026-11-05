/* ============================================================================
 * الورقةُ نفسُها على الشاشة: مستندُ الطباعة (rxPrint) بإطارٍ بحجمه الحقيقيّ، مصغَّراً ليملأ عرضَ مكانه — فما يُرى
 * هو ما يُطبع، بخطوطه وترتيبه وصفحاته.
 *
 * وحدةٌ بلا نصوص (العنوانُ من المستدعي) يستعملها المحرّرُ والمصمِّم. والإطارُ لا يُلمس (pointer-events: none):
 * المصمِّمُ يضع فوقه طبقتَه (children) بإحداثيات الصفحة الأولى نفسِها — نسبٌ مئوية من يسارها وأعلاها.
 * والمستندُ يُعاد رسمُه بعد هدوء الكتابة (ربعُ ثانية) لا مع كلّ حرف: الإطارُ يعيد تحميلَ خطوطه كلَّ مرّة.
 * ========================================================================= */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { RX_PAPER, type RxPaperSize } from "@/lib/rxLayout";
import "./rxPad.css";

const PX_PER_MM = 96 / 25.4;
export interface RxLayoutInfo { pages: number; overflow: boolean }

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

  /* بعد الترتيب داخل الإطار: عددُ الصفحات وما لم ينقسم — من <html data-pages/data-overflow>. */
  const onLoad = () => {
    const w = frame.current?.contentWindow;
    const doc = frame.current?.contentDocument;
    if (!w || !doc) return;
    const read = () => {
      const root = doc.documentElement;
      const n = Math.max(1, Number(root.getAttribute("data-pages")) || 1);
      setPages(n);
      layoutCb.current?.({ pages: n, overflow: root.getAttribute("data-overflow") === "1" });
    };
    if (doc.documentElement.getAttribute("data-ready")) read();
    else w.addEventListener("rx-ready", read, { once: true });
  };

  const scale = width > 0 ? width / pw : 0;
  const totalH = ph * pages;
  return (
    <div ref={box} className={className} style={style} dir="ltr">
      <div className="rxp-sheet relative overflow-hidden rounded-sm bg-white" style={{ height: scale ? totalH * scale : undefined, aspectRatio: scale ? undefined : `${pw} / ${ph}` }}>
        <iframe
          ref={frame}
          title={title}
          srcDoc={shown}
          onLoad={onLoad}
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
