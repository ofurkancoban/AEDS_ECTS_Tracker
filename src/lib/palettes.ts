// Colour palettes for the Appearance setting. The tokens themselves live in
// styles.css (Classic) and palettes.css (the rest); these swatches only drive
// the picker.

export interface Palette {
  id: string;
  name: string;
  description: string;
  light: { paper: string; panel: string; ink: string; accent: string; warn: string };
  dark: { paper: string; panel: string; ink: string; accent: string; warn: string };
}

export const PALETTES: Palette[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Teal and rust on warm paper",
    light: { paper: "#f6f3ec", panel: "#ffffff", ink: "#1c2333", accent: "#2f6f6d", warn: "#9d5727" },
    dark: { paper: "#13161d", panel: "#1b1f28", ink: "#ece8dc", accent: "#5ab6b2", warn: "#e29a5d" },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Harbour blue with copper",
    light: { paper: "#f2f5f9", panel: "#ffffff", ink: "#13233a", accent: "#2457a6", warn: "#a15425" },
    dark: { paper: "#0e141e", panel: "#151d29", ink: "#e6ecf3", accent: "#6ea2f0", warn: "#e8995e" },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Moss green with ochre",
    light: { paper: "#f3f4ee", panel: "#ffffff", ink: "#1e2a22", accent: "#3f6b3a", warn: "#925c22" },
    dark: { paper: "#111611", panel: "#192019", ink: "#e7ebe2", accent: "#8cc07f", warn: "#e0a160" },
  },
  {
    id: "plum",
    name: "Plum",
    description: "Aubergine with rosewood",
    light: { paper: "#f7f3f4", panel: "#ffffff", ink: "#2a1f2d", accent: "#7a3e6e", warn: "#9d5727" },
    dark: { paper: "#161118", panel: "#1f1822", ink: "#efe6ee", accent: "#d08cc2", warn: "#e29a5d" },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Terracotta with sand",
    light: { paper: "#faf5ef", panel: "#ffffff", ink: "#2b201a", accent: "#aa4929", warn: "#916010" },
    dark: { paper: "#191310", panel: "#221a16", ink: "#f2e9e1", accent: "#f08a62", warn: "#e3b054" },
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Neutral greys with indigo",
    light: { paper: "#f4f4f3", panel: "#ffffff", ink: "#18181b", accent: "#4f46e5", warn: "#bc3f0b" },
    dark: { paper: "#0d0d10", panel: "#16161a", ink: "#ededef", accent: "#8b85ff", warn: "#f59e5b" },
  },
];

export const PALETTE_KEY = "ects-tracker-palette";

export function loadPalette(): string {
  try {
    const id = localStorage.getItem(PALETTE_KEY) || "classic";
    return PALETTES.some((p) => p.id === id) ? id : "classic";
  } catch {
    return "classic";
  }
}

export function applyPalette(id: string): void {
  const root = document.documentElement;
  if (id === "classic") root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", id);
}
