// Colour palettes for the Appearance setting. The tokens themselves live in
// styles.css (Emerald, the default) and palettes.css (the rest); these
// swatches only drive the picker.

export interface Palette {
  id: string;
  name: string;
  description: string;
  light: { paper: string; panel: string; ink: string; accent: string; warn: string };
  dark: { paper: string; panel: string; ink: string; accent: string; warn: string };
}

export const PALETTES: Palette[] = [
  {
    id: "emerald",
    name: "Emerald",
    description: "Fresh emerald with orange",
    light: { paper: "#f6f8f7", panel: "#ffffff", ink: "#0f1a17", accent: "#04704f", warn: "#c2410c" },
    dark: { paper: "#0a0f0d", panel: "#111815", ink: "#e6efeb", accent: "#34d399", warn: "#fb923c" },
  },
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
    id: "midnight",
    name: "Midnight Teal",
    description: "Deep teal with burnt orange",
    light: { paper: "#f3f6f6", panel: "#ffffff", ink: "#142127", accent: "#0f5e63", warn: "#a14a19" },
    dark: { paper: "#0c1416", panel: "#131d20", ink: "#e5eeee", accent: "#4fc1c0", warn: "#f0a067" },
  },
  {
    id: "uniblue",
    name: "Uni Blue",
    description: "University blue with amber",
    light: { paper: "#f3f5f8", panel: "#ffffff", ink: "#14213a", accent: "#1f4e8c", warn: "#9c5216" },
    dark: { paper: "#0d131d", panel: "#141b27", ink: "#e6ebf2", accent: "#7aa7ec", warn: "#eda15f" },
  },
  {
    id: "sage",
    name: "Sage & Clay",
    description: "Soft sage with clay",
    light: { paper: "#f5f4ef", panel: "#ffffff", ink: "#232a24", accent: "#4a6b58", warn: "#93512f" },
    dark: { paper: "#121512", panel: "#1a1e1a", ink: "#e9ebe4", accent: "#93bfa3", warn: "#e79b78" },
  },
];

export const PALETTE_KEY = "ects-tracker-palette";
/** Used when nothing was chosen; its tokens are the base ones, so it needs no attribute. */
export const DEFAULT_PALETTE = "emerald";

export function loadPalette(): string {
  try {
    const id = localStorage.getItem(PALETTE_KEY) || DEFAULT_PALETTE;
    return PALETTES.some((p) => p.id === id) ? id : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function applyPalette(id: string): void {
  const root = document.documentElement;
  if (id === DEFAULT_PALETTE) root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", id);
}
