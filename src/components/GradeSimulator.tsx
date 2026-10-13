import { Calculator, RotateCcw, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GRADES } from "../lib/constants";
import { gradeAtOrBetter, nearestGrade, pendingCourses, projectGpa, unplannedEcts } from "../lib/gradeSim";
import { useTracker } from "../state";
import { Button, CategoryTag, SectionTitle, cx } from "./ui";

const PASSING = GRADES.filter((g) => parseFloat(g) <= 4);

/** What-if for grades: pick a grade per open course and see the final GPA. Nothing is saved. */
export function GradeSimulator() {
  const { courses, stats, state } = useTracker();
  const pending = useMemo(() => pendingCourses(courses), [courses]);
  const input = useMemo(() => ({ gradePoints: stats.gradePoints, gradedEcts: stats.gradedEcts, pending }), [stats, pending]);
  const rest = unplannedEcts(input);
  const target = parseFloat(state.targetGrade) || null;
  const baseline = stats.gpa ? nearestGrade(parseFloat(stats.gpa)) : 2.0;

  const [grades, setGrades] = useState<Record<string, number>>({});
  const [restAvg, setRestAvg] = useState(baseline);

  // New open courses start at the current GPA so the projection stays neutral.
  useEffect(() => {
    setGrades((g) => {
      const next: Record<string, number> = {};
      pending.forEach((c) => (next[c.id] = g[c.id] ?? baseline));
      return next;
    });
  }, [pending, baseline]);

  const projected = projectGpa(input, grades, restAvg);
  const fill = (v: number) => {
    setGrades(Object.fromEntries(pending.map((c) => [c.id, v])));
    setRestAvg(v);
  };
  const needed = stats.requiredAverage;

  if (!pending.length && !rest) return null;

  return (
    <section className="card p-5">
      <SectionTitle
        eyebrow="What-if for grades"
        title="Grade simulator"
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {needed !== null && needed >= 1 && needed <= 4 && (
              <Button size="sm" variant="soft" onClick={() => fill(gradeAtOrBetter(needed))} title="Fill every open course with the grade that reaches your target">
                <Target size={14} /> Reach target
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => fill(baseline)}>
              <RotateCcw size={14} /> Reset
            </Button>
          </div>
        }
      />
      <p className="mb-4 text-body-sm text-muted">Pick the grade you expect for each open course. Nothing here changes your saved data.</p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_260px]">
        <div className="grid grid-cols-1 gap-1.5">
          {pending.map((c) => {
            const [code, ...restName] = c.name.split(" - ");
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm">{restName.length ? restName.join(" - ") : c.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
                    <CategoryTag id={c.category} />
                    <span className="num">{restName.length ? code : ""}</span>
                    <span className="num">{c.ects} ECTS</span>
                  </span>
                </span>
                <select
                  className="field num h-8 !rounded-lg !py-0 !pl-2.5 !text-body-sm font-semibold"
                  value={String(grades[c.id] ?? baseline)}
                  onChange={(e) => setGrades({ ...grades, [c.id]: parseFloat(e.target.value) })}
                  aria-label={`Expected grade for ${c.name}`}
                >
                  {PASSING.map((g) => (
                    <option key={g} value={String(parseFloat(g))}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {rest > 0 && (
            <div className="rounded-xl border border-dashed border-line-strong px-3 py-2.5">
              <div className="flex items-center justify-between text-body-sm">
                <span>
                  Not planned yet <span className="num text-muted">({rest} ECTS)</span>
                </span>
                <span className="num font-semibold">{restAvg.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1}
                max={4}
                step={0.1}
                value={restAvg}
                onChange={(e) => setRestAvg(parseFloat(e.target.value))}
                className="mt-2 w-full accent-[var(--accent)]"
                aria-label="Average grade for credits not planned yet"
              />
            </div>
          )}
        </div>

        <aside className="flex h-fit flex-col items-center rounded-2xl bg-panel-2 p-5 text-center lg:sticky lg:top-24">
          <Calculator size={18} className="text-muted" />
          <div className="eyebrow mt-2">Projected final GPA</div>
          <div
            className={cx(
              "num mt-1 text-hero leading-none font-semibold tracking-tight",
              target && projected ? (projected <= target + 1e-9 ? "text-accent" : "text-warn") : "",
            )}
          >
            {projected ? (Math.round(projected * 100) / 100).toFixed(2) : "-"}
          </div>
          <div className="mt-3 grid w-full gap-1 text-meta text-muted">
            <div className="flex justify-between">
              <span>Current GPA</span>
              <span className="num">{stats.gpa || "-"}</span>
            </div>
            {target && (
              <div className="flex justify-between">
                <span>Target</span>
                <span className="num">{target.toFixed(2)}</span>
              </div>
            )}
            {target && projected && (
              <div className={cx("mt-1 rounded-lg px-2 py-1 font-medium", projected <= target + 1e-9 ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn")}>
                {projected <= target + 1e-9 ? "Target reached" : `${(projected - target).toFixed(2)} above target`}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
