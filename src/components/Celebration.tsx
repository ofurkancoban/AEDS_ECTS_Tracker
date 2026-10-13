import { PartyPopper } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CELEBRATED_KEY, prefersReducedMotion } from "../lib/preferences";
import { readFlag, writeFlag } from "../lib/storage";
import { useTracker } from "../state";

const COLORS = ["var(--accent)", "var(--warn)", "var(--cat-empirical)", "var(--cat-datascience)", "var(--cat-specialization)"];

/** A one-time confetti burst the moment every graduation requirement is met. */
export function Celebration() {
  const { stats, toast } = useTracker();
  const [show, setShow] = useState(false);
  const was = useRef(stats.graduationReady);

  useEffect(() => {
    const becameReady = stats.graduationReady && !was.current;
    was.current = stats.graduationReady;
    if (!becameReady || readFlag(CELEBRATED_KEY) === "1") return;
    writeFlag(CELEBRATED_KEY, "1");
    toast({ message: "Every requirement is met. Congratulations!", tone: "success" });
    if (prefersReducedMotion()) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 4000);
    return () => window.clearTimeout(t);
  }, [stats.graduationReady, toast]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        color: COLORS[i % COLORS.length],
        delay: `${((i * 13) % 50) / 100}s`,
        dur: `${2.2 + ((i * 7) % 12) / 10}s`,
        drift: `${((i * 29) % 160) - 80}px`,
        spin: `${360 + ((i * 53) % 540)}deg`,
        round: i % 3 === 0,
      })),
    [],
  );

  if (!show) return null;
  return createPortal(
    <div aria-hidden="true" data-testid="celebration">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: p.left,
            background: p.color,
            borderRadius: p.round ? "50%" : undefined,
            ["--delay" as string]: p.delay,
            ["--dur" as string]: p.dur,
            ["--drift" as string]: p.drift,
            ["--spin" as string]: p.spin,
          }}
        />
      ))}
      <div className="pop fixed top-[18vh] left-1/2 z-[9951] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-ink px-5 py-3 font-serif text-title font-semibold text-paper shadow-[var(--shadow-lg)]">
        <PartyPopper size={20} /> Ready to graduate
      </div>
    </div>,
    document.body,
  );
}
