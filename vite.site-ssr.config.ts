/* بناءُ الرسم بالخادم للموقع التسويقيّ (٢٥/١٠) — منفصلٌ عن إعداد التطبيق عمداً: بلا PWA ولا قسمة
 * القاموس ولا مدخلَي التطبيق. يُخرج `dist-site-ssr/entry-server.js` يناديه `scripts/site-prerender.mjs`. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    ssr: "src/site/entry-server.tsx",
    outDir: "dist-site-ssr",
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: { output: { format: "esm", entryFileNames: "entry-server.js" } },
  },
});
