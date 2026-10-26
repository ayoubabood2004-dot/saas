/* سياقُ رسم الصفحة بالخادم: النسخةُ ومحتواها وأسعارُها والمسار — تقرؤه القوالب. */
import { createContext, useContext } from "react";
import type { Edition } from "./editions";
import type { FeatureSlug, PageKind, PricingData, Route, SiteContent } from "./types";

export interface Ctx {
  ed: Edition;
  c: SiteContent;
  route: Route;
  pricing: PricingData;
  year: number;
}
export const SiteCtx = createContext<Ctx | null>(null);
export function useSite(): Ctx {
  const v = useContext(SiteCtx);
  if (!v) throw new Error("SiteCtx missing");
  return v;
}

/** رابطُ صفحةٍ داخل النسخة نفسها. */
export function href(edition: string, kind: PageKind, slug?: FeatureSlug): string {
  const base = `/${edition}`;
  switch (kind) {
    case "home": return base;
    case "feature": return `${base}/features/${slug}`;
    default: return `${base}/${kind}`;
  }
}

/** التسجيلُ بالتطبيق — يحمل الدولةَ فتنضبط العملةُ ومفتاحُ الهاتف من أوّل لحظة (F8/F9). */
export function signupHref(ed: Edition, at: string): string {
  const q = new URLSearchParams({ as: "clinic", new: "1", lang: ed.lang });
  // النسخةُ الإنكليزية بلا بلد: «auto» يخمّن من الجهاز، وإلا «دولة أخرى» — لا العراقُ وديناره لزائرٍ من لندن.
  q.set("country", ed.country ?? "auto");
  q.set("from", at);
  return `/login?${q.toString()}`;
}
export function loginHref(ed: Edition): string {
  return `/login?as=clinic&lang=${ed.lang}`;
}

/** `{{var}}` ⇐ قيمة — نفسُ صيغة i18next، بلا i18next. */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : `{{${k}}}`));
}
