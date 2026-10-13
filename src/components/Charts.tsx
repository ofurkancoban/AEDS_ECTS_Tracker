import { useState } from "react";
import { gradeTone } from "../lib/grades";
import { compareSemesters } from "../lib/semesters";
import { useMounted } from "../lib/motion";
import { useCountUp } from "../lib/useCountUp";

const cx2 = (...c: (string | false)[]) => c.filter(Boolean).join(" ");

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
  // The arcs sweep in from empty the first time the ring shows.
  const ready = useMounted();
  const clamp = (v: number) => (ready ? Math.max(0, Math.min(1, v)) : 0);
  const fc = clamp(completed / total);
  const fi = clamp(inProgress / total) * (1 - fc > 0 ? 1 : 0);
  const fp = clamp(planned / total);
  const seg = (from: number, frac: number) => ({
    strokeDasharray: `${Math.max(0, frac * C - (frac > 0.01 ? 3 : 0))} ${C}`,
    strokeDashoffset: -from * C,
    // A zero-length arc with a round cap would still draw a dot.
    opacity: frac > 0.0005 ? 1 : 0,
  });
  const pct = Math.round(Math.max(0, Math.min(1, completed / total)) * 100);
  const shown = useCountUp(completed);
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
          style={{ ...seg(Math.min(1, fc + fi), Math.min(fp, 1 - fc - fi)), transition: "all .9s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ ...seg(fc, Math.min(fi, 1 - fc)), transition: "all .9s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ ...seg(0, fc), transition: "all .9s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className={cx2("num leading-none font-semibold tracking-tight", size < 200 ? "text-display-lg" : "text-hero")} aria-label={`${completed} ECTS completed`}>
          {shown}
        </div>
        <div className="mt-1 text-body-sm text-muted">
          of <span className="num">{total}</span> ECTS
        </div>
        <div className="mt-2 rounded-full bg-accent-soft px-2.5 py-0.5 text-caption font-semibold text-accent">{pct}% done</div>
      </div>
    </div>
  );
}

// Representative grade per bucket, for the colour scale.
const BUCKET_MID: Record<string, number> = { "1.0 - 1.5": 1.2, "1.6 - 2.0": 1.8, "2.1 - 2.5": 2.3, "2.6 - 3.0": 2.8, "3.1 - 4.0": 3.6, Fail: 5 };

export function GradeHistogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex h-36 items-end gap-2">
      {buckets.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="num text-caption text-muted">{b.count || ""}</div>
          <div className="flex h-24 w-full items-end">
            <div
              className="w-full rounded-t-lg transition-[height] duration-500"
              style={{
                height: `${Math.max(b.count ? 8 : 2, (b.count / max) * 100)}%`,
                background: b.count ? gradeTone(BUCKET_MID[b.label] ?? 2)!.color : "var(--line)",

              }}
            />
          </div>
          <div className="num text-center text-micro leading-tight whitespace-nowrap text-muted">{b.label.replace(" - ", "-")}</div>
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

/**
 * Credits completed per semester (bars) with the semester GPA on top (line,
 * German scale so better grades sit higher). One chart answers "how much did
 * I take on, and how did it go".
 */
export function SemesterChart({
  bars,
  gpa,
  target,
}: {
  bars: { semester: string; ects: number }[];
  gpa: { semester: string; avg: number }[];
  target?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Keep the chronological order given by the inputs (both are sorted).
  const order = [...bars.map((b) => b.semester)];
  gpa.forEach((g) => {
    if (!order.includes(g.semester)) order.push(g.semester);
  });
  const cols = order.sort(compareSemesters);
  const W = 560;
  const H = 190;
  const pad = { l: 34, r: 34, t: 16, b: 28 };
  const maxE = Math.max(30, ...bars.map((b) => b.ects));
  const step = (W - pad.l - pad.r) / Math.max(1, cols.length);
  const cx = (i: number) => pad.l + step * i + step / 2;
  const yE = (e: number) => H - pad.b - (e / maxE) * (H - pad.t - pad.b);
  const vals = gpa.map((g) => g.avg).concat(target ? [target] : []);
  const lo = vals.length ? Math.max(1, Math.floor(Math.min(...vals) * 2) / 2 - 0.25) : 1;
  const hi = vals.length ? Math.min(5, Math.ceil(Math.max(...vals) * 2) / 2 + 0.25) : 4;
  const yG = (v: number) => pad.t + ((v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const pts = gpa.map((g) => ({ i: cols.indexOf(g.semester), ...g })).filter((p) => p.i >= 0);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${cx(p.i)},${yG(p.avg)}`).join(" ");
  const barW = Math.min(36, step * 0.55);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" onMouseLeave={() => setHover(null)} role="img" aria-label="Credits and GPA by semester">
        {[0, maxE / 2, maxE].map((e) => (
          <g key={e}>
            <line x1={pad.l} x2={W - pad.r} y1={yE(e)} y2={yE(e)} stroke="var(--line)" strokeDasharray={e ? "3 4" : undefined} />
            <text x={pad.l - 6} y={yE(e) + 3} textAnchor="end" fontSize="10" fill="var(--faint)" className="num">
              {Math.round(e)}
            </text>
          </g>
        ))}
        {pts.length > 0 &&
          [lo, hi].map((v) => (
            <text key={v} x={W - pad.r + 6} y={yG(v) + 3} fontSize="10" fill="var(--accent)" className="num">
              {v.toFixed(1)}
            </text>
          ))}
        {target ? (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={yG(target)} y2={yG(target)} stroke="var(--warn)" strokeWidth="1.2" strokeDasharray="6 4" />
            <text x={W - pad.r} y={yG(target) - 4} textAnchor="end" fontSize="10" fill="var(--warn)">
              target {target.toFixed(1)}
            </text>
          </g>
        ) : null}
        {cols.map((s, i) => {
          const b = bars.find((x) => x.semester === s);
          return (
            <g key={s} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + step * i} y={pad.t} width={step} height={H - pad.t} fill="transparent" />
              {b && (
                <rect
                  x={cx(i) - barW / 2}
                  y={yE(b.ects)}
                  width={barW}
                  height={H - pad.b - yE(b.ects)}
                  rx="6"
                  fill={b.ects > 30 ? "var(--warn)" : "var(--accent)"}
                  opacity={hover === i ? 0.42 : 0.24}
                />
              )}
              <text x={cx(i)} y={H - 9} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {s}
              </text>
              {hover === i && (
                <text x={cx(i)} y={pad.t - 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)" className="num">
                  {b ? `${b.ects} ECTS` : ""}
                  {pts.find((p) => p.i === i) ? `  ·  ⌀ ${pts.find((p) => p.i === i)!.avg.toFixed(2)}` : ""}
                </text>
              )}
            </g>
          );
        })}
        {pts.length > 1 && <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p) => {
          const tone = gradeTone(p.avg);
          return <circle key={p.semester} cx={cx(p.i)} cy={yG(p.avg)} r={hover === p.i ? 5.5 : 4.2} fill="var(--panel)" stroke={tone?.color || "var(--accent)"} strokeWidth="2.4" />;
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent/30" /> ECTS completed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-accent" /> semester GPA (higher is better)
        </span>
      </figcaption>
    </figure>
  );
}
