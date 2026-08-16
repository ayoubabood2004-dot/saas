import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./components/ui";
import i18next from "i18next";
import "./i18n";
import "./index.css";
import { emitGlobalToast } from "./lib/globalToast";
import { pruneStaleStorage } from "./lib/demoStore";
import { installDigitNormalizer } from "./lib/digits";
import { applyFontScale, applyCrispMode } from "./lib/fontScale";
import { recoverFromStaleShell } from "./lib/appUpdate";

// Western numerals everywhere: typing or pasting Arabic-Indic digits into ANY
// input converts them to 0-9 on the fly — no data is ever lost to a digit-shape
// mismatch.
installDigitNormalizer();

// Reclaim localStorage on every boot: old-version demo databases (with embedded
// base64 media) pile up and can exhaust the ~5 MB quota, after which writes throw
// and the UI appears to hang. Clearing them keeps storage bounded across upgrades.
pruneStaleStorage();

// Apply the device's chosen UI font scale (حجم الخط) before first paint — the
// local prefs mirror answers synchronously, so there's no size flash. Re-applied
// after the clinic config hydrates in case the enable flag changed remotely.
applyFontScale();
// وضع الوضوح للشاشات الضعيفة — تفضيل هذا الجهاز، يُطبَّق قبل أول رسم.
applyCrispMode();
// الملاءمة التلقائية تتبع تغيّر حجم النافذة (تكبير/استعادة) عندما لا يوجد اختيار محفوظ.
{
  let t: number | undefined;
  window.addEventListener("resize", () => {
    window.clearTimeout(t);
    t = window.setTimeout(applyFontScale, 250);
  });
}

// Safety net: surface otherwise-silent async failures (e.g. a database write that
// hit a backend error and wasn't caught at the call site) as a toast instead of
// failing invisibly. Throttled so a burst of rejections shows a single message,
// and benign cancellations are ignored.
let lastNetToast = 0;
window.addEventListener("unhandledrejection", (e) => {
  const reason = e?.reason as { message?: string; name?: string } | undefined;
  const msg = reason?.message || String(reason ?? "");
  if (/abort|cancel/i.test(msg) || reason?.name === "AbortError") return;
  // اشتراك منتهٍ: رفض مقصود لا عطل — رسالة تشرح السبب بدل «صار خطأ ما».
  if (reason?.name === "ReadOnlyError" || msg === "READ_ONLY") {
    emitGlobalToast({
      tone: "warn",
      title: i18next.t("errors.readOnlyTitle", { defaultValue: "الاشتراك منتهٍ — قراءة فقط" }) as string,
      description: i18next.t("errors.readOnly", { defaultValue: "الإضافة والتعديل متوقفان حتى تجديد الاشتراك. بياناتك كلها محفوظة وتقدر تشوفها وتطبعها." }) as string,
    });
    return;
  }
  const now = Date.now();
  if (now - lastNetToast < 3000) return;
  lastNetToast = now;
  emitGlobalToast({
    tone: "error",
    title: i18next.t("errors.async", { defaultValue: "Something went wrong" }) as string,
    description: i18next.t("errors.tryAgain", { defaultValue: "Please try again." }) as string,
  });
});

// Keep long-lived installs fresh. The default registration only checks for a
// new build on a full page load — but on tablets the app runs as a standalone
// PWA that iOS *resumes* (never reloads), so a clinic could sit on an old
// bundle for days. Ask the service worker to re-check whenever the app comes
// back to the foreground, plus a slow background timer; in autoUpdate mode an
// updated worker activates immediately and the page reloads itself onto the
// new version.
{
  const registration = registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (!r) return;
      const check = () => { r.update().catch(() => { /* offline — next resume retries */ }); };
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      setInterval(check, 20 * 60 * 1000);
    },
  });
  void registration;
}

// After a new deploy, a device still holding the previous build asks for hashed
// chunk URLs that no longer exist on the server. Reloading alone does NOT fix it
// on an installed PWA: the service worker keeps serving the same cached shell,
// so the same dead URLs are requested again (measured: a stuck spinner for 12s+
// before the worker happened to update). Clear the shell caches, drop the
// worker, then reload — main.tsx re-registers it immediately after boot, so
// offline support returns on its own. Guarded to one attempt per 30s.
window.addEventListener("vite:preloadError", () => { void recoverFromStaleShell(); });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
