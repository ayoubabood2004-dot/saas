// ============================================================================
// Live «طلبات الحجز» counter — ONE shared poller behind however many badges are
// on screen (sidebar item, top-bar bell). When the count RISES, the clinic gets
// a sound + a browser notification, so an owner booking never lands silently
// again. Components subscribe via useBookingRequestCount(); actions that change
// a request call bumpBookingRequests() so every badge refreshes instantly.
// ============================================================================
import { useSyncExternalStore } from "react";
import { repo } from "./repo";
import { playScan } from "./sounds";

const POLL_MS = 45000;

let count = 0;
let prev = -1; // first tick never notifies — only genuine increases do
const subs = new Set<() => void>();
let timer: number | undefined;

async function tick() {
  try {
    const list = await repo.listBookingRequests();
    if (prev >= 0 && list.length > prev) {
      playScan();
      notify(list.length - prev);
    }
    prev = list.length;
    if (list.length !== count) {
      count = list.length;
      subs.forEach((f) => f());
    }
  } catch { /* transient — keep the last known count */ }
}

function notify(fresh: number) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification("doctorVet — طلب حجز جديد 🐾", {
      body: fresh === 1 ? "وصل طلب حجز جديد من زبون — افتح الاستقبال للتأكيد." : `وصلت ${fresh} طلبات حجز جديدة — افتح الاستقبال للتأكيد.`,
      icon: "/favicon.svg",
      tag: "vp-booking-requests", // collapse repeats into one notification
    });
    n.onclick = () => { try { window.focus(); window.location.href = "/reception"; } catch { /* ignore */ } };
  } catch { /* Notification constructor can throw on some platforms — never break the app */ }
}

/** Ask once for browser-notification permission (must run from a user gesture). */
export function requestNotifyPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch { /* ignore */ }
}

/** Force an immediate re-count (call after confirming/rejecting a request). */
export function bumpBookingRequests() {
  void tick();
}

// Stable subscribe identities — an inline closure would make useSyncExternalStore
// resubscribe (and re-tick) on EVERY render.
function subscribeLive(cb: () => void) {
  subs.add(cb);
  if (timer == null) {
    void tick();
    timer = window.setInterval(() => { void tick(); }, POLL_MS);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer != null) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const subscribeOff = () => () => { /* disabled — nothing to clean */ };
const readCount = () => count;
const readZero = () => 0;

/** Live count of pending booking requests; polling runs while ≥1 subscriber. */
export function useBookingRequestCount(enabled = true): number {
  return useSyncExternalStore(enabled ? subscribeLive : subscribeOff, enabled ? readCount : readZero, readZero);
}
