import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Read a Vite env var as a clean string. Vite exposes only `VITE_`-prefixed
 * vars on `import.meta.env` (NOT `process.env`). We also trim whitespace and
 * strip accidental wrapping quotes — a very common dashboard copy-paste mistake
 * (e.g. pasting "https://x.supabase.co" *including* the quotes).
 */
function readEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

/**
 * Turn whatever was provided into a valid http(s) URL, or "" if impossible.
 * - Adds a missing scheme ("x.supabase.co" -> "https://x.supabase.co").
 * - Drops a trailing slash (supabase-js builds paths off the bare origin).
 * - Returns "" for anything that can't be parsed, so we never feed an invalid
 *   value into createClient() (which throws "Invalid supabaseUrl" and blanks the page).
 */
function resolveSupabaseUrl(raw: string): string {
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

const rawUrl = readEnv(import.meta.env.VITE_SUPABASE_URL);
const anonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
const url = resolveSupabaseUrl(rawUrl);

export const isSupabaseConfigured = Boolean(url && anonKey);

// A value was provided but couldn't be parsed — warn loudly instead of crashing.
if (rawUrl && !url) {
  console.warn(
    `[supabase] VITE_SUPABASE_URL is set but is not a valid URL: "${rawUrl}". ` +
      "Expected something like https://YOUR-PROJECT.supabase.co (no quotes/spaces). " +
      "Falling back to demo mode.",
  );
}
if (url && !anonKey) {
  console.warn("[supabase] VITE_SUPABASE_URL is set but VITE_SUPABASE_ANON_KEY is missing. Falling back to demo mode.");
}

/**
 * When the env vars are missing or malformed we run in local DEMO mode
 * (browser storage), so the app NEVER white-screens — it just works offline.
 * Once both vars are valid, this becomes a real Supabase client.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
