// ============================================================================
// عداد «طلبات المتجر» الحي — نفس هندسة عداد طلبات الحجز (bookingRequests):
// مجس مشترك واحد مهما تعددت الشارات، وصوت + إشعار متصفح لما يرتفع العدد —
// حتى طلب زبون من الستور ما يمر بصمت أبداً والعيادة منشغلة بصفحة ثانية.
// ============================================================================
import { useSyncExternalStore } from "react";
import { repo } from "./repo";
import { playScan } from "./sounds";

const POLL_MS = 45000;

let count = 0;
let prev = -1; // أول قراءة لا تنبّه — الزيادات الحقيقية فقط
const subs = new Set<() => void>();
let timer: number | undefined;

async function tick() {
  try {
    const list = await repo.listStoreOrders(100);
    const fresh = list.filter((o) => o.status === "new").length;
    if (prev >= 0 && fresh > prev) {
      playScan();
      notify(fresh - prev);
    }
    prev = fresh;
    if (fresh !== count) {
      count = fresh;
      subs.forEach((f) => f());
    }
  } catch { /* عابر — نحتفظ بآخر عدد معروف */ }
}

function notify(fresh: number) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification("doctorVet — طلب جديد من المتجر 🛍️", {
      body: fresh === 1 ? "وصل طلب جديد من متجرك — افتحه للقبول أو الرفض." : `وصلت ${fresh} طلبات جديدة من متجرك.`,
      icon: "/favicon.svg",
      tag: "vp-store-orders",
    });
    n.onclick = () => { try { window.focus(); window.location.href = "/store"; } catch { /* ignore */ } };
  } catch { /* بعض المنصات ترمي من Notification — لا نكسر التطبيق أبداً */ }
}

/** إعادة عدّ فورية (تُستدعى بعد قبول/رفض طلب). */
export function bumpStoreOrders() {
  void tick();
}

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
const subscribeOff = () => () => { /* معطّل */ };
const readCount = () => count;
const readZero = () => 0;

/** عدد الطلبات الجديدة (يعمل المجس ما دام في مشترك واحد على الأقل). */
export function useStoreOrderCount(enabled = true): number {
  return useSyncExternalStore(enabled ? subscribeLive : subscribeOff, enabled ? readCount : readZero, readZero);
}
