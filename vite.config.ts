import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  // Visible build stamp (الإصدار) — lets anyone verify WHICH deploy their
  // device is actually running when debugging stale caches.
  define: { __BUILD_AT__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "doctorVet — Veterinary Care System",
        short_name: "doctorVet",
        description: "Universal pet digital passport and clinic management.",
        theme_color: "#1266d8",
        background_color: "#eef6ff",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        /* الخدمة العاملة تلتقط كل تنقّل وترجّع index.html من الذاكرة — وهذا
         * صحيح لمسارات التطبيق، وكارثة لنقاط النهاية الخادمية: نداء ويبهوك
         * واتساب كان يُخدَم من الذاكرة فلا يصل السيرفر إطلاقاً، فيبدو كأن
         * النقطة غير موجودة بينما هي شغّالة. ميتا نفسها لا تتأثّر (لا خدمة
         * عاملة عند الخوادم)، لكن أي اختبار من المتصفّح كان يكذب. */
        /* و`/s/` و`/t/` خرجت معها (ت١١): لهما **مستندٌ آخر** (`store.html`)
         * لا يعرف تطبيقَ العيادة. ولولا استثناؤهما لأرجعت الخدمةُ العاملة
         * `index.html` من الذاكرة لكلّ زائرٍ عاد — فيدفع الـ٤٦٣ كيلو الي
         * خرجنا منها، ويُلغى المدخلُ الثاني بصمتٍ عند من زار مرّتين. */
        navigateFallbackDenylist: [/^\/wa-webhook/, /^\/api\//, /^\/s\//, /^\/t\//],
        // محرك OCR (~10MB) ومشهد الأقفاص المجسّم (three.js ~1MB) يُحمَّلان عند
        // الطلب فقط — إدراجهما بالتثبيت المسبق يخلي تنصيب الـPWA ينزّل أضعاف
        // حجم التطبيق على موبايل ببيانات محدودة.
        globIgnores: ["**/tesseract/**", "**/Cage3DDemo-*.js"],
        runtimeCaching: [
          {
            // Cache Supabase storage objects (patient photos) only. Bounded by a
            // 1-day max age + a hard purge on logout (AuthContext.signOut), so a
            // previous clinic's images can't linger on a shared/kiosk device.
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/"),
            handler: "CacheFirst",
            options: {
              cacheName: "media-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 86400, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      /* مدخلان (ت١١): تطبيقُ العيادة، وصفحةُ الزائر. الفصلُ هنا لا بتقسيمٍ
       * كسول — `index.html` تُحمّل `main.tsx` أياً كان المسار، وهي تستورد
       * `App` وكلَّ شيء. */
      input: {
        main: path.resolve(__dirname, "index.html"),
        store: path.resolve(__dirname, "store.html"),
      },
      output: {
        /* التسميةُ بدالّةٍ لا بكائن: الكائنُ يسمّي وحداتٍ بأسمائها، ولا يمسك
         * **ما تجرّه** — و`react/jsx-runtime` كان يهبط داخل حزمة `framer-motion`
         * لأنها أوّلُ من طالبَه، فصار كلُّ ملفِّ JSX بالمشروع يستورد من
         * `motion-*.js`. ومعناه أن صفحةَ الزائر التي لا حركةَ مكتبيّةً فيها
         * أصلاً كانت تنزّل ٤٢ كيلو مضغوطة لتقرأ `jsx()`. الدالّةُ تفحص المسار
         * فيصير الانتماءُ حاسماً لا مصادفةَ ترتيب. */
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          const at = (p: string) => id.includes(`node_modules/${p}`);
          // React ومشتقّاتُه أوّلاً — ومنها jsx-runtime صراحةً.
          if (at("react/") || at("react-dom/") || at("react-router") || at("scheduler/")) return "react-vendor";
          if (at("framer-motion") || at("motion-dom") || at("motion-utils")) return "motion";
          if (at("recharts") || at("d3-") || at("victory-vendor")) return "charts";
          if (at("@supabase/")) return "supabase";
          if (at("i18next") || at("react-i18next")) return "i18n";
          // clsx و tailwind-merge يستعملهما cn() **و**recharts معاً. وبلا
          // فصلهما يهبطان داخل حزمة الرسوم (لأنها أول من طالبهما)، فتصير
          // نقطة الدخول تستورد منها — أي أن ٤٣٤KB من مكتبة رسوم تُعلَن
          // modulepreload على **كل** صفحة، ومنها صفحة الهبوط التي لا ترسم
          // مخططاً واحداً.
          if (at("clsx") || at("tailwind-merge")) return "utils";
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, host: true },
});
