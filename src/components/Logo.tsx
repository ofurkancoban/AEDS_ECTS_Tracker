// The mark: a progress ring three quarters full around a check, on the
// palette's accent colour. Drawn inline so it follows palette and mode.
const PATHS = (fg: string) => `
  <circle cx="32" cy="32" r="17" fill="none" stroke="${fg}" stroke-opacity="0.32" stroke-width="5"/>
  <path d="M32 15a17 17 0 1 1-17 17" fill="none" stroke="${fg}" stroke-width="5" stroke-linecap="round"/>
  <path d="M24.5 32.5l5.2 5.2 10-11" fill="none" stroke="${fg}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;

export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="AEDS Credit Tracker">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <g className="text-white dark:text-paper" dangerouslySetInnerHTML={{ __html: PATHS("currentColor") }} />
    </svg>
  );
}

/** Redraws the browser-tab icon in the current palette; call after the palette and mode are applied. */
export function updateFavicon(): void {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue("--accent").trim() || "#2f6f6d";
  const dark = document.documentElement.classList.contains("dark");
  const fg = dark ? cs.getPropertyValue("--paper").trim() || "#13161d" : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${accent}"/>${PATHS(fg)}</svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-dynamic]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.dataset.dynamic = "1";
    document.head.appendChild(link);
  }
  link.href = "data:image/svg+xml," + encodeURIComponent(svg);
}
