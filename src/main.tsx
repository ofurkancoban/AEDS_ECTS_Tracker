import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles.css";

import { createRoot } from "react-dom/client";
import App from "./App";
import { loadCatalog } from "./lib/catalog";
import { installTouchDrag } from "./lib/touchDrag";

// Apply the saved theme before first paint to avoid a light flash.
try {
  const saved = JSON.parse(localStorage.getItem("ects-tracker-state") || "{}");
  if (saved.theme === "dark") document.documentElement.classList.add("dark");
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(<App />);

loadCatalog();

installTouchDrag();

// Offline support: cache the app shell and data files (production builds only).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
