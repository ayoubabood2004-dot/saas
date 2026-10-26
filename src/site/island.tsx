/* ============================================================================
 * الجُزُر — الصفحةُ HTML ثابتٌ مولَّدٌ ساعةَ البناء، والتفاعلُ بقطعٍ صغيرةٍ وحدَها.
 *
 * الزائرُ على هاتفٍ عراقيٍّ رخيص وشبكةٍ ضعيفة يقرأ الصفحةَ كاملةً من أوّل بايت، ولا ينتظر
 * جافاسكربت ليرى نصّاً. وما يتحرّك (القائمة، محوِّلُ الدولة، مفتاحُ الشهريّ/السنويّ، الحاسبة)
 * جزيرةٌ تُرسم بالخادم بـ`renderToString` وتُحيا بالمتصفّح بـ`hydrateRoot` بنفس الخصائص.
 *
 * لماذا `renderToString` للجزيرة وحدها لا للصفحة: الصفحةُ تُرسم بـ`renderToStaticMarkup` (بلا
 * علامات React) — والإحياءُ يحتاج علاماتِ الفصل بين النصوص المتجاورة التي يضعها `renderToString`
 * وحده. فالجزيرةُ تُرسم بالطريقة التي يتوقّعها الإحياء، والباقي HTML صرفٌ لا يمسّه أحد.
 * ==========================================================================*/
import { createElement, type ComponentType } from "react";

/** قائمةُ الجزر — الاسمُ بالـHTML ⇒ المكوّن. تُستورد كسولاً بالمتصفّح فلا ينزل إلا ما بالصفحة. */
export const ISLANDS = {
  SiteNav: () => import("./islands/SiteNav"),
  EditionSwitcher: () => import("./islands/EditionSwitcher"),
  SuggestBar: () => import("./islands/SuggestBar"),
  PricingTable: () => import("./islands/PricingTable"),
  TourTabs: () => import("./islands/TourTabs"),
  RoiCalc: () => import("./islands/RoiCalc"),
  PriceFrom: () => import("./islands/PriceFrom"),
} as const;
export type IslandName = keyof typeof ISLANDS;

/** يُضبط من `entry-server` فقط — المتصفّحُ لا يرسم جزيرةً بهذا المسار. */
let serverRender: ((c: ComponentType<any>, props: object) => string) | null = null;
const serverComponents: Partial<Record<IslandName, ComponentType<any>>> = {};
export function setIslandRenderer(r: typeof serverRender, comps: Partial<Record<IslandName, ComponentType<any>>>) {
  serverRender = r;
  Object.assign(serverComponents, comps);
}

/** جزيرةٌ بالصفحة: بالخادم تُرسم وتُختم بخصائصها؛ والمتصفّحُ يحييها (`main.tsx`). */
export function Island<P extends object>({ name, props, as = "div", className }: { name: IslandName; props: P; as?: "div" | "span"; className?: string }) {
  const Comp = serverComponents[name];
  const html = serverRender && Comp ? serverRender(Comp, props) : "";
  return createElement(as, {
    "data-island": name,
    "data-props": JSON.stringify(props),
    className,
    dangerouslySetInnerHTML: { __html: html },
  });
}
