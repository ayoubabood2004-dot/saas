import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";


/**
 * أنماطُ صفحة الزائر تُحقن بالمستند (ت١١).
 *
 * ── القياس الذي فرضها ────────────────────────────────────────────────────
 * الرفُّ صار مرسوماً بالـHTML من الحافة، ومع ذلك لم يتغيّر ما يراه الزبون
 * (٣٬٣٥٣ms مقابل ٣٬٣٤٣ على 3G). السبب: **ورقةُ الأنماط تحجب الرسم**. الرفُّ
 * موجودٌ بالمستند من أوّل ٣٠٠ms، والمتصفّحُ لا يرسم حرفاً حتى تصل الورقة —
 * وهي طلبٌ آخرُ بذهابٍ وإياب، يزاحمه أربعةٌ وعشرون ملفَّ جافاسكربت.
 *
 * فحقنُها بالمستند يلغي الحجبَ من جذره: يصل المستندُ ومعه أنماطُه، فيُرسم
 * الرفُّ بأوّل رسمة. والكلفةُ ٢٥ كيلو مضغوطة تُعاد بكلّ فتحة بدل أن تُخبَّأ —
 * مقبولةٌ لأن **صفحةَ الزبون هي زيارتُه كلُّها**: لا تنقّلَ بين صفحاتٍ تشترك
 * بالورقة، والمستندُ نفسُه مخبوءٌ بالحافة خمسَ دقائق.
 *
 * ولا تُحقن بـ`index.html`: تطبيقُ العيادة عشراتُ الشاشات بجلسةٍ طويلة،
 * فالورقةُ المخبَّأة مرّةً أرخصُ له من إعادتها بكلّ مستند.
 */
function storeEntry() {
  const supa = (process.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  return {
    name: "store-entry",
    enforce: "post" as const,
    generateBundle(_opts: unknown, bundle: Record<string, { type: string; fileName: string; source?: unknown }>) {
      const html = bundle["store.html"];
      if (!html || typeof html.source !== "string") return;
      let out = html.source;
      /* وصلٌ مسبقٌ بالقاعدة: نداءُ الكتلوج التالي وصورُ المواد تبدأ بلا انتظار
       * DNS وTLS — ذهابٌ وإيابٌ كاملٌ يوفَّر على شبكةٍ ضعيفة. */
      if (supa) {
        out = out.replace("</head>", `  <link rel="preconnect" href="${supa}" crossorigin />\n    <link rel="dns-prefetch" href="${supa}" />\n  </head>`);
      }
      for (const [, asset] of Object.entries(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".css")) continue;
        const tag = new RegExp(`\\s*<link[^>]+href="/${asset.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`, "g");
        if (!tag.test(out)) continue;
        out = out.replace(tag, "").replace("</head>", `  <style>${String(asset.source)}</style>\n  </head>`);
      }
      html.source = out;
    },
  };
}

/**
 * القاموسُ الباردُ وحدةٌ غيرُ وحدةِ الحارّ (م٠·١).
 *
 * `i18n/index.ts` يستورد الحارَّ بالاسم من `ar.json`، و`i18n/arCold.ts` الباردَ
 * بالاسم من الملفّ نفسِه. وRollup يقسم **بالوحدة لا بالاسم**: وحدةٌ يستوردها
 * الإقلاعُ تبقى بالإقلاع بكلّ ما يُستعمل منها — فخرجت حزمةُ arCold ١٫٥ كيلو
 * إشاراتٍ إلى الإقلاع، والنصوصُ فيه كما كانت (مقيسٌ: `main.html` ٤٢٠٬٥٧٨ قبل
 * هذا وبعد الانقسام سواء). فاستيرادُ `arCold.ts` وحدَه يُحلّ إلى `ar.json?cold`:
 * وحدةٌ ثانيةٌ من الملفّ نفسِه، يهزّها Rollup على أسمائها هي، فتذهب نصوصُها مع
 * حزمتها. tsc وesbuild يريان استيراداً عاديّاً فلا يتغيّر لهما شيء.
 *
 * يعتمد على `json.stringify` مطفأً (الافتراض): بتشغيله يصير الملفُّ كتلةً واحدة
 * بلا أسماءٍ تُهزّ. وكلا الأمرين يمسكه `i18n-split-guard --post-build` بالبايت.
 */
function arColdSplit() {
  const cold = path.resolve(__dirname, "src/i18n/arCold.ts");
  const json = path.resolve(__dirname, "src/i18n/ar.json");
  let hits = 0;
  return {
    name: "ar-cold-split",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (source !== "./ar.json" || !importer || path.resolve(importer.split("?")[0]) !== cold) return null;
      hits++;
      return `${json}?cold`;
    },
    generateBundle(this: { error: (m: string) => never }) {
      if (!hits) this.error("ar-cold-split: arCold.ts لم يستورد ./ar.json — القاموسُ الباردُ رجع للإقلاع؟");
    },
  };
}

export default defineConfig({
  // Visible build stamp (الإصدار) — lets anyone verify WHICH deploy their
  // device is actually running when debugging stale caches.
  define: { __BUILD_AT__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    arColdSplit(),
    react(),
    storeEntry(),
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
    /* خريطةُ الحزم (`dist/.vite/manifest.json`) — الحقيقةُ الوحيدة عن «أيّ ملفٍّ
     * يُحمَّل مع الإقلاع وأيٌّ كسول». يقرؤها `i18n-split-guard` ليثبت أن القشرةَ
     * لا تقرأ نطاقاً بارداً. لا سرَّ فيها: أسماءُ حزمٍ عامّةٍ أصلاً، وworkbox لا
     * يُدرج ملفاتِ json بالتثبيت المسبق. */
    manifest: true,
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
