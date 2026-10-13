// Lets other parts of the app (the assistant's module chips) open the
// Catalog on one module: the request waits here until the Catalog view
// mounts, or reaches an already open Catalog through an event.
import { useEffect } from "react";

const EVENT = "catalog-focus";
let pending: string | null = null;

export function focusCatalog(code: string) {
  pending = code;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The module asked for, once; null when there is none. */
export function takeCatalogFocus(): string | null {
  const code = pending;
  pending = null;
  return code;
}

export function useCatalogFocus(onFocus: (code: string) => void) {
  useEffect(() => {
    const handler = () => {
      const code = takeCatalogFocus();
      if (code) onFocus(code);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [onFocus]);
}
