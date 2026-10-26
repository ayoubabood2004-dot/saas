/* إعدادُ Tailwind للموقع التسويقيّ وحده (٢٥/١٠).
 * منفصلٌ عن إعداد التطبيق بمحتواه: يمسح ملفّات الموقع فقط، فلا يكبر CSS التطبيق
 * (داخل ميزانية الإقلاع) بصنفٍ واحدٍ من الموقع، ولا ينزل للزائر CSS شاشات العيادة.
 * ويرث ألوانَ العلامة من إعداد التطبيق — الزائرُ الذي يسجّل يدخل نفسَ العالم. */
import app from "./tailwind.config.js";

/** @type {import('tailwindcss').Config} */
export default {
  ...app,
  darkMode: "class",
  content: ["./site.html", "./src/site/**/*.{ts,tsx}"],
  theme: {
    ...app.theme,
    container: { center: true, padding: "1.25rem", screens: { "2xl": "1240px" } },
    extend: {
      ...app.theme.extend,
      colors: {
        ...app.theme.extend.colors,
        paper: "#F6F8FB",
        navy: { DEFAULT: "#0F1E35", 2: "#22324D", 3: "#56667E" },
        stamp: { DEFAULT: "#3E2FB3", 50: "#F0EEFC", 100: "#E1DDFA", 600: "#3E2FB3", 700: "#30248C" },
        dose: { DEFAULT: "#0E9F6E", 50: "#E8F7F0", 600: "#0E9F6E", 700: "#0B7D57" },
        due: { DEFAULT: "#EC3A09", 50: "#FFF1EB", 600: "#EC3A09" },
        rule: "#DDE6F1",
      },
      fontFamily: {
        display: ["'Readex Pro'", "'IBM Plex Sans Arabic'", "system-ui", "sans-serif"],
        sans: ["'IBM Plex Sans Arabic'", "'Readex Pro'", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "'SF Mono'", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        ...app.theme.extend.keyframes,
        stamp: { "0%": { opacity: "0", transform: "scale(1.6) rotate(-18deg)" }, "60%": { opacity: "1", transform: "scale(0.94) rotate(-9deg)" }, "100%": { opacity: "1", transform: "scale(1) rotate(-9deg)" } },
        rise: { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        stamp: "stamp 520ms cubic-bezier(.2,.9,.3,1.2) both",
        rise: "rise 600ms ease-out both",
      },
    },
  },
};
