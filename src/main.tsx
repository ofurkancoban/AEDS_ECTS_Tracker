import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles.css";

import { createRoot } from "react-dom/client";
import App from "./App";
import { loadCatalog } from "./lib/catalog";
import { initAssistant } from "./widgets/legacyWidgets";

// Apply the saved theme before first paint to avoid a light flash.
try {
  const saved = JSON.parse(localStorage.getItem("ects-tracker-state") || "{}");
  if (saved.theme === "dark") document.documentElement.classList.add("dark");
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(<App />);

loadCatalog();

try {
  initAssistant();
} catch (e) {
  console.error("AEDS Assistant failed to start", e);
}
