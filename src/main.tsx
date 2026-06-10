import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./components/ui";
import "./i18n";
import "./index.css";

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
