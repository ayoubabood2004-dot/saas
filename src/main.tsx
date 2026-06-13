import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./components/ui";
import i18next from "i18next";
import "./i18n";
import "./index.css";
import { emitGlobalToast } from "./lib/globalToast";
import { pruneStaleStorage } from "./lib/demoStore";

// Reclaim localStorage on every boot: old-version demo databases (with embedded
// base64 media) pile up and can exhaust the ~5 MB quota, after which writes throw
// and the UI appears to hang. Clearing them keeps storage bounded across upgrades.
pruneStaleStorage();

// Safety net: surface otherwise-silent async failures (e.g. a database write that
// hit a backend error and wasn't caught at the call site) as a toast instead of
// failing invisibly. Throttled so a burst of rejections shows a single message,
// and benign cancellations are ignored.
let lastNetToast = 0;
window.addEventListener("unhandledrejection", (e) => {
  const reason = e?.reason as { message?: string; name?: string } | undefined;
  const msg = reason?.message || String(reason ?? "");
  if (/abort|cancel/i.test(msg) || reason?.name === "AbortError") return;
  const now = Date.now();
  if (now - lastNetToast < 3000) return;
  lastNetToast = now;
  emitGlobalToast({
    tone: "error",
    title: i18next.t("errors.async", { defaultValue: "Something went wrong" }) as string,
    description: i18next.t("errors.tryAgain", { defaultValue: "Please try again." }) as string,
  });
});

// After a new deploy, a tab that was opened on the previous build may still
// reference old hashed chunk URLs that no longer exist on the server. Vite fires
// `vite:preloadError` when a dynamic import fails to load — recover by reloading
// once (the fresh index.html points at the new chunk URLs). Throttle to one
// reload per 10s so a genuinely-missing chunk can't cause a reload loop.
window.addEventListener("vite:preloadError", () => {
  const at = "vp_chunk_reload_at";
  const last = Number(sessionStorage.getItem(at) || 0);
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(at, String(Date.now()));
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
