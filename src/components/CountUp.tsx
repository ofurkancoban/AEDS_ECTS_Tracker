import { useCountUp } from "../lib/useCountUp";

/** A number that counts up to its value (and glides when it changes). */
export function CountUp({ value, decimals = 0, duration = 700 }: { value: number; decimals?: number; duration?: number }) {
  const shown = useCountUp(value, duration, decimals);
  return <>{decimals ? shown.toFixed(decimals) : shown}</>;
}
