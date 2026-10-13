// Staged rollout: during the preview the new design is served from /next/ and
// the classic UI from the site root; afterwards the new design is the root and
// the classic UI lives at /legacy/. Both share the same saved data.

export function isPreview(pathname = typeof location !== "undefined" ? location.pathname : "/"): boolean {
  return /\/next\/(index\.html)?$/.test(pathname) || pathname.includes("/next/");
}

/** Where the classic UI is from the current page. */
export function classicUrl(pathname?: string): string {
  return isPreview(pathname) ? "../" : "./legacy/";
}
