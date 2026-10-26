/* بناءُ المتصفّح للموقع التسويقيّ (٢٦/١٠) — منفصلٌ عن بناء التطبيق عمداً.
 *
 * كان `site.html` مدخلاً ثالثاً بـ`vite.config.ts`، فصار الموقعُ والتطبيقُ رسماً واحداً تتقاسم فيه
 * Rollup الوحداتِ المشتركة: تبدّل تقطيعُ حزم التطبيق وزاد إقلاعُه (`main.html`) ٨٧٢ بايتاً فوق
 * ميزانيّته، فسقط بناءُ Vercel (تدقيقٌ عدائيّ). الآن: التطبيقُ يُبنى كما كان، ثم هذا بعده بنفس
 * `dist` (بلا تفريغ) وبمجلّد حزمٍ خاصّ `site-assets/` — فلا يدخل الموقعُ تخزينَ العامل الخدميّ ولا
 * يمسّ قسمةَ القاموس. و`site-manifest.json` خريطةُ الاستيراد التي يمشيها `site-guard --built`
 * ليحسب وزنَ أوّل صفحةٍ بجُزُرها لا بما يعلنه المستندُ وحده. */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* مكتباتُ التطبيق الثقيلة لا تدخل الموقع — يُحكم بمسار الوحدة ساعةَ البناء: الاسمُ لا ينجو من التصغير
 * (لا «framer-motion» ولا «PostgrestClient» بحزمتيهما المصغَّرتين)، فبحثُ النصّ بالناتج كان يمرّ دائماً. */
const BANNED = /node_modules[\\/](framer-motion|motion-dom|motion-utils|@supabase|recharts)[\\/]/;
function noAppLibs(): Plugin {
  return {
    name: "site-no-app-libs",
    generateBundle(_o, bundle) {
      const hits: string[] = [];
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of Object.keys(chunk.modules)) if (BANNED.test(id)) hits.push(`${chunk.fileName} ← ${id.split(/node_modules[\\/]/).pop()}`);
      }
      if (hits.length) this.error(`مكتبةٌ من التطبيق دخلت الموقع:\n  ${hits.slice(0, 8).join("\n  ")}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), noAppLibs()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    assetsDir: "site-assets",
    manifest: "site-manifest.json",
    rollupOptions: { input: { site: path.resolve(__dirname, "site.html") } },
  },
});
