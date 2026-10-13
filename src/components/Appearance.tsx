import { Check, Moon, Rows3, Rows4, Sun } from "lucide-react";
import { useRef } from "react";
import { PALETTES, type Palette } from "../lib/palettes";
import { useTracker } from "../state";
import { Modal, SlidingPill, cx } from "./ui";

export function AppearanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, patch, palette, setPalette, density, setDensity } = useTracker();
  const mode = state.theme;
  const modeGroup = useRef<HTMLDivElement>(null);
  const densityGroup = useRef<HTMLDivElement>(null);
  return (
    <Modal open={open} onClose={onClose} title="Appearance" subtitle="Saved on this device. Your course data is not affected." width="max-w-2xl">
      <div className="eyebrow mb-2">Mode</div>
      <div ref={modeGroup} className="relative mb-5 flex w-full rounded-xl border border-line p-1">
        <SlidingPill group={modeGroup} active={mode} className="rounded-lg bg-ink" />
        {(["light", "dark"] as const).map((m) => (
          <button
            key={m}
            onClick={() => patch({ theme: m })}
            data-active={mode === m}
            className={cx(
              "relative inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg text-body-sm font-medium transition-colors",
              mode === m ? "text-paper" : "text-muted hover:text-ink",
            )}
          >
            {m === "light" ? <Sun size={15} /> : <Moon size={15} />}
            {m === "light" ? "Light" : "Dark"}
          </button>
        ))}
      </div>

      <div className="eyebrow mb-2">Density</div>
      <div ref={densityGroup} className="relative mb-5 flex w-full rounded-xl border border-line p-1" role="radiogroup" aria-label="Density">
        <SlidingPill group={densityGroup} active={density} className="rounded-lg bg-ink" />
        {(["comfortable", "compact"] as const).map((d) => (
          <button
            key={d}
            role="radio"
            aria-checked={density === d}
            onClick={() => setDensity(d)}
            data-active={density === d}
            className={cx(
              "relative inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg text-body-sm font-medium transition-colors",
              density === d ? "text-paper" : "text-muted hover:text-ink",
            )}
          >
            {d === "comfortable" ? <Rows3 size={15} /> : <Rows4 size={15} />}
            {d === "comfortable" ? "Comfortable" : "Compact"}
          </button>
        ))}
      </div>

      <div className="eyebrow mb-2">Colour palette</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PALETTES.map((p) => (
          <PaletteCard key={p.id} p={p} mode={mode} selected={palette === p.id} onSelect={() => setPalette(p.id)} />
        ))}
      </div>
    </Modal>
  );
}

/** A miniature of the dashboard drawn in the palette's own colours. */
function PaletteCard({ p, mode, selected, onSelect }: { p: Palette; mode: "light" | "dark"; selected: boolean; onSelect: () => void }) {
  const c = p[mode];
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        "group cursor-pointer overflow-hidden rounded-2xl border-2 text-left transition",
        selected ? "border-accent shadow-[var(--shadow)]" : "border-line hover:border-line-strong",
      )}
    >
      <div className="relative p-2.5" style={{ background: c.paper }}>
        <div className="flex gap-1.5">
          <div className="w-5 rounded-md" style={{ background: c.panel, opacity: 0.9 }} />
          <div className="flex-1 rounded-lg p-2" style={{ background: c.panel }}>
            <div className="flex items-center gap-2">
              <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0 -rotate-90">
                <circle cx="13" cy="13" r="10" fill="none" stroke={c.ink} strokeOpacity="0.12" strokeWidth="4" />
                <circle cx="13" cy="13" r="10" fill="none" stroke={c.accent} strokeWidth="4" strokeDasharray="38 63" strokeLinecap="round" />
                <circle cx="13" cy="13" r="10" fill="none" stroke={c.warn} strokeWidth="4" strokeDasharray="7 63" strokeDashoffset="-40" strokeLinecap="round" />
              </svg>
              <div className="flex-1 space-y-1">
                <div className="h-1.5 w-4/5 rounded-full" style={{ background: c.ink, opacity: 0.85 }} />
                <div className="h-1.5 w-1/2 rounded-full" style={{ background: c.ink, opacity: 0.3 }} />
              </div>
            </div>
            <div className="mt-2 flex gap-1">
              <div className="h-3 flex-1 rounded" style={{ background: c.accent }} />
              <div className="h-3 w-5 rounded" style={{ background: c.warn }} />
            </div>
          </div>
        </div>
        {selected && (
          <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white dark:text-paper">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="border-t border-line bg-panel px-3 py-2">
        <div className="text-body-sm font-semibold">{p.name}</div>
        <div className="truncate text-caption text-muted">{p.description}</div>
      </div>
    </button>
  );
}
