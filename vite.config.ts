import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
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
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/storage/"),
            handler: "CacheFirst",
            options: { cacheName: "media-cache", expiration: { maxEntries: 200 } },
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
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
          i18n: ["i18next", "react-i18next"],
        },
      },
    },
  },
  server: { port: 5173, host: true },
});
