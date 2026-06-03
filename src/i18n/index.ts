import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ar from "./ar.json";

export const LANGS = ["en", "ar"] as const;
export type Lang = (typeof LANGS)[number];

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem("vp_lang");
    if (stored === "en" || stored === "ar") return stored;
  } catch {
    /* ignore */
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function applyDir(lang: Lang) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
}

export function setLang(lang: Lang) {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem("vp_lang", lang);
  } catch {
    /* ignore */
  }
  applyDir(lang);
}

applyDir(initialLang());

export default i18n;
