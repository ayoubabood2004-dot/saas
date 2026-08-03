/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Build timestamp injected by vite.config define — the visible version stamp. */
declare const __BUILD_AT__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
