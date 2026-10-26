/* ============================================================================
 * مدخلُ الموقع بالمتصفّح — يحيي الجزرَ وحدها، ويسجّل زيارةً بلا كوكيز.
 *
 * لا Supabase ولا عاملُ خدمةٍ ولا قاموسُ التطبيق: الصفحةُ وصلت كاملةً من الخادم، وهذا الملفُّ
 * يضيف التفاعلَ فوقها. كلُّ جزيرةٍ تُستورد حين تظهر بالصفحة فقط (`ISLANDS`).
 * ==========================================================================*/
import { createElement, type ComponentType } from "react";
import { hydrateRoot } from "react-dom/client";
import "./site.css";
import { ISLANDS, type IslandName } from "./island";
import { track } from "../lib/track";

for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-island]"))) {
  const name = el.dataset.island as IslandName;
  const load = ISLANDS[name];
  if (!load) continue;
  let props: object = {};
  try { props = JSON.parse(el.dataset.props || "{}"); } catch { /* خصائصُ تالفة — تُرسم بالفارغ */ }
  void load().then((m) => { hydrateRoot(el, createElement(m.default as ComponentType<object>, props)); }).catch(() => { /* تبقى الجزيرةُ HTML ثابتاً يعمل بلا تفاعل */ });
}

track("page_view", undefined, true);

// كلُّ زرِّ «ابدأ» بالموقع يحمل `data-cta` — نقرتُه حدثٌ بالقمع (نفسُ أحداث الصفحة القديمة).
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cta]");
  if (a) track("cta_click", { at: a.dataset.cta });
});
