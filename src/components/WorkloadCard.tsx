import { ArrowRight, Clock3, FileText, PencilLine, Scale, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { MAX_ECTS_PER_SEMESTER } from "../lib/constants";
import { EXAM_HEAVY, balanceSuggestions, semesterLoads, type MoveSuggestion } from "../lib/workload";
import { useTracker } from "../state";
import { Button, SectionTitle, cx } from "./ui";

const REASON: Record<MoveSuggestion["reason"], string> = {
  overloaded: `more than ${MAX_ECTS_PER_SEMESTER} ECTS`,
  "exam-heavy": `${EXAM_HEAVY}+ end-of-term exams`,
  uneven: "much heavier than your other semesters",
};

/** Credits, hours and exams per upcoming semester, with one-click rebalancing. */
export function WorkloadCard() {
  const { courses, catalog, updateCourse, toast } = useTracker();
  const loads = useMemo(() => semesterLoads(courses, catalog), [courses, catalog]);
  const suggestions = useMemo(() => balanceSuggestions(courses, catalog), [courses, catalog]);
  if (!loads.length) return null;
  const maxEcts = Math.max(MAX_ECTS_PER_SEMESTER, ...loads.map((l) => l.ects));

  const apply = (s: MoveSuggestion) => {
    updateCourse(s.course.id, { semester: s.to });
    toast({ message: `Moved ${s.course.name.split(" - ")[0].toUpperCase()} to ${s.to}`, tone: "success" });
  };

  return (
    <section className="card p-5" aria-labelledby="workload-title">
      <SectionTitle eyebrow="Balance" title={<span id="workload-title">Workload by semester</span>} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loads.map((l) => (
          <div
            key={l.semester}
            className={cx("rounded-2xl border p-3", l.overloaded || l.examHeavy ? "border-warn/50 bg-warn-soft/40" : "border-line bg-panel-2")}
            data-testid={`load-${l.semester}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-serif text-title-sm font-semibold">{l.semester}</span>
              {(l.overloaded || l.examHeavy) && <TriangleAlert size={14} className="text-warn" aria-label="Heavy semester" />}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={cx("num text-display-sm font-semibold", l.overloaded && "text-warn")}>{l.ects}</span>
              <span className="num text-meta text-muted">/ {MAX_ECTS_PER_SEMESTER} ECTS</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${(l.ects / maxEcts) * 100}%`, background: l.overloaded ? "var(--warn)" : "var(--accent)" }} />
            </div>
            <div className="mt-2.5 grid gap-1 text-meta text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 size={12} /> about {Math.round(l.hoursPerWeek)} h per lecture week
              </span>
              <span className={cx("inline-flex items-center gap-1.5", l.examHeavy && "font-medium text-warn")}>
                <PencilLine size={12} /> {l.exams} end-of-term exam{l.exams === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileText size={12} /> {l.coursework} with coursework
              </span>
            </div>
          </div>
        ))}
      </div>

      {suggestions.length > 0 ? (
        <ul className="mt-4 grid grid-cols-1 gap-2">
          {suggestions.map((s) => (
            <li key={s.course.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-body-sm">
              <Scale size={16} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                {s.from} has {REASON[s.reason]}. Move <b>{s.course.name}</b> to {s.to}:{" "}
                <span className="num text-muted">
                  {s.from} {s.fromEctsAfter} ECTS, {s.to} {s.toEctsAfter} ECTS
                </span>
              </span>
              <Button size="sm" variant="soft" onClick={() => apply(s)}>
                Move to {s.to} <ArrowRight size={14} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-meta text-muted">Your upcoming semesters look balanced.</p>
      )}
      <p className="mt-3 text-caption text-faint">
        Exam counts are read from each module's assessment description and may be approximate. Suggestions only use semesters a module has run in (or
        is predicted to), never move compulsory or running courses, and can be undone.
      </p>
    </section>
  );
}
