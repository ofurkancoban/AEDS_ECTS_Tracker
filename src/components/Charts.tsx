import { useState } from "react";

/** Concentric-free stacked ring: completed, in progress, planned out of `total`. */
export function ProgressRing({
  total,
  completed,
  inProgress,
  planned,
  size = 220,
  stroke = 18,
}: {
  total: number;
  completed: number;
  inProgress: number;
  planned: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const fc = clamp(completed / total);
  const fi = clamp(inProgress / total) * (1 - fc > 0 ? 1 : 0);
  const fp = clamp(planned / total);
  const seg = (from: number, frac: number) => ({
    strokeDasharray: `${Math.max(0, frac * C - (frac > 0.01 ? 3 : 0))} ${C}`,
    strokeDashoffset: -from * C,
  });
  const pct = Math.round(fc * 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <pattern id="ring-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="color-mix(in oklab, var(--muted) 18%, transparent)" />
            <rect width="3" height="6" fill="color-mix(in oklab, var(--muted) 40%, transparent)" />
          </pattern>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} opacity={0.6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ring-hatch)"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ ...seg(Math.min(1, fc + fi), Math.min(fp, 1 - fc - fi)), transition: "all .6s ease" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ ...seg(fc, Math.min(fi, 1 - fc)), transition: "all .6s ease" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ ...seg(0, fc), transition: "all .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="num text-[44px] leading-none font-semibold tracking-tight">{completed}</div>
        <div className="mt-1 text-[13px] text-muted">
          of <span className="num">{total}</span> ECTS
        </div>
        <div className="mt-2 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-accent">{pct}% done</div>
      </div>
    </div>
  );
}

export function GradeHistogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex h-36 items-end gap-2">
      {buckets.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="num text-[11px] text-muted">{b.count || ""}</div>
          <div className="flex h-24 w-full items-end">
            <div
              className="w-full rounded-t-lg transition-[height] duration-500"
              style={{
                height: `${Math.max(b.count ? 8 : 2, (b.count / max) * 100)}%`,
                background: b.label === "Fail" ? "var(--danger)" : b.count ? "var(--accent)" : "var(--line)",
                opacity: b.count ? 0.35 + 0.65 * (b.count / max) : 1,
              }}
            />
          </div>
          <div className="num text-center text-[9.5px] leading-tight whitespace-nowrap text-muted">{b.label.replace(" - ", "-")}</div>
        </div>
      ))}
    </div>
  );
}

/** Semester GPA line; German scale, so lower is better and the axis is inverted (1.0 at top). */
export function GpaTrend({ points, target }: { points: { semester: string; avg: number }[]; target?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;
  const W = 520;
  const H = 150;
  const pad = { l: 30, r: 14, t: 14, b: 26 };
  const vals = points.map((p) => p.avg).concat(target ? [target] : []);
  const lo = Math.max(1, Math.floor(Math.min(...vals) * 2) / 2 - 0.25);
  const hi = Math.min(5, Math.ceil(Math.max(...vals) * 2) / 2 + 0.25);
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + ((v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.avg)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="gpa-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="num" fontSize="10" fill="var(--faint)">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      {target ? (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--warn)" strokeWidth="1.2" strokeDasharray="6 4" />
          <text x={W - pad.r} y={y(target) - 4} textAnchor="end" fontSize="10" fill="var(--warn)">
            target {target.toFixed(1)}
          </text>
        </g>
      ) : null}
      {points.length > 1 && <path d={area} fill="url(#gpa-fill)" />}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.semester} onMouseEnter={() => setHover(i)}>
          <rect x={x(i) - 20} y={pad.t} width={40} height={H - pad.t} fill="transparent" />
          <circle cx={x(i)} cy={y(p.avg)} r={hover === i ? 5.5 : 4} fill="var(--panel)" stroke="var(--accent)" strokeWidth="2.2" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {p.semester}
          </text>
          {hover === i && (
            <text x={x(i)} y={y(p.avg) - 10} textAnchor="middle" className="num" fontSize="11" fontWeight="600" fill="var(--ink)">
              {p.avg.toFixed(2)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
