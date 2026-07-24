// ============================================================================
// Live staff presence (منو فاتح السستم الآن) — a tiny heartbeat.
//
// While a clinic user has the app open, presence_beat() (migration 0072, a
// security-definer upsert keyed clinic+user) is called once a minute and on
// tab-refocus. إدارة الكادر reads staff_presence and shows who's online NOW
// (last beat within the window) and everyone else's آخر ظهور. A client can
// never forge another user's presence — the server stamps identity itself.
// Demo mode: a local row for the demo user, so the UI behaves identically.
// ============================================================================
import { supabase } from "./supabase";

const BEAT_MS = 60_000;
/** A user counts as "online now" if their last beat is within this window. */
export const ONLINE_WINDOW_MS = 2.5 * 60_000;

export interface PresenceRow {
  clinic_id: string;
  user_id: string;
  name: string | null;
  role: string | null;
  last_seen: string;
}

export const isOnline = (r: PresenceRow): boolean =>
  Date.now() - new Date(r.last_seen).getTime() < ONLINE_WINDOW_MS;

/* ---- Demo fallback: presence for the local (single) user ---- */
const DEMO_KEY = "vp_presence_demo";
function demoBeat(userId: string, name: string | null) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify({ clinic_id: "demo", user_id: userId, name, role: "manager", last_seen: new Date().toISOString() }));
  } catch { /* ignore */ }
}
function demoList(): PresenceRow[] {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? [JSON.parse(raw) as PresenceRow] : [];
  } catch { return []; }
}

/** Start the heartbeat for the signed-in clinic user. Returns a stop function. */
export function startPresenceBeat(userId: string, name?: string | null): () => void {
  const beat = () => {
    if (!supabase) { demoBeat(userId, name ?? null); return; }
    void (async () => {
      try { await supabase.rpc("presence_beat", { p_name: name ?? null }); }
      catch { /* pre-0072 backend — presence simply stays empty */ }
    })();
  };
  beat();
  const timer = window.setInterval(beat, BEAT_MS);
  const onVisible = () => { if (document.visibilityState === "visible") beat(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}

/** Everyone's latest beat for the caller's clinic (RLS-scoped server-side). */
export async function listPresence(): Promise<PresenceRow[]> {
  if (!supabase) return demoList();
  try {
    const { data, error } = await supabase.from("staff_presence").select("*").order("last_seen", { ascending: false });
    if (error || !data) return [];
    return data as PresenceRow[];
  } catch {
    return [];
  }
}
