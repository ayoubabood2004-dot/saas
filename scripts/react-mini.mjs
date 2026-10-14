/* يحزم مكوّناً حقيقيّاً مع `react-mini-host.js` بنسخة React واحدة — `stubs`: { مُحدِّد: نصُّ وحدةٍ بديلة }.
 * الأيقوناتُ (lucide-react) مكوّناتٌ فارغة بأسمائها، وframer-motion وسومٌ عادية، والترجمةُ تُرجع النصَّ
 * الافتراضيّ. (انظر رأس react-mini-host.js.) */
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const T = "(k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k)";
const BASE = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: 'ar' } }); export default {};`,
  i18next: `const i = { t: ${T}, language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;`,
  "framer-motion": `import { createElement } from "react";
    const strip = ({ initial, animate, exit, transition, layout, whileTap, whileHover, ...rest }) => rest;
    export const AnimatePresence = ({ children }) => children;
    export const motion = new Proxy({}, { get: (_t, tag) => (p) => createElement(tag, strip(p)) });`,
  "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n, playDoseGiven = n, playAchievement = n, playError = n;",
};

let iconNames = null;
export async function loadUI(entry, stubs = {}) {
  if (!iconNames) iconNames = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k));
  const map = {
    ...BASE,
    "lucide-react": `const I = () => null; ${iconNames.map((k) => `export const ${k} = I;`).join("\n")}`,
    ...stubs,
  };
  const built = await esbuild.build({
    stdin: { contents: `${entry}\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "ui-stubs",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => (Object.prototype.hasOwnProperty.call(map, a.path) ? { path: a.path, namespace: "ui-stub" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "ui-stub" }, (a) => ({ contents: map[a.path], loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "react-mini-"));
  const file = join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}
