import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./preferences";

/** Animates a number from its previous value to `value` (instant with reduced motion). */
export function useCountUp(value: number, duration = 700): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const from = useRef(shown);
  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(a + (value - a) * eased);
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}
