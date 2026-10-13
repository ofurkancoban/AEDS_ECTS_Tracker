import { ArrowRightLeft, CalendarDays } from "lucide-react";
import { semesterOptionsFor } from "../lib/catalog";
import { GRADES, MAX_ECTS_PER_SEMESTER, STATUSES, STATUS_LABEL, categoryById } from "../lib/constants";
import { compareSemesters, currentSemester } from "../lib/semesters";
import { useTracker } from "../state";
import { moveTargets } from "./CourseRow";
import { Modal, cx } from "./ui";

/** Quick actions for one course: semester, status, grade and category, all by tapping. */
export function MoveSheet() {
  const { moveTarget, setMoveTarget, courses, updateCourse, catalog } = useTracker();
  const course = moveTarget ? courses.find((c) => c.id === moveTarget.id) || null : null;
  const close = () => setMoveTarget(null);
  if (!course) return null;

  const options = semesterOptionsFor(course.name, catalog);
  const semesters = (options.includes(course.semester) ? options : [course.semester, ...options]).slice().sort(compareSemesters);
  const cur = currentSemester();
  const load = (s: string) => courses.filter((c) => c.semester === s && !c.hypothetical && c.id !== course.id).reduce((a, c) => a + c.ects, 0);
  const [code, ...rest] = course.name.split(" - ");

  return (
    <Modal open onClose={close} title={rest.length ? rest.join(" - ") : course.name} subtitle={rest.length ? code.toUpperCase() : undefined} width="max-w-lg">
      <div className="grid gap-5">
        <section>
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <CalendarDays size={12} /> Semester
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...semesters, "Unscheduled"].filter((s, i, a) => a.indexOf(s) === i).map((s) => {
              const after = load(s) + course.ects;
              return (
                <button
                  key={s}
                  onClick={() => {
                    updateCourse(course.id, { semester: s });
                    close();
                  }}
                  className={cx(
                    "flex cursor-pointer flex-col items-start rounded-xl border px-3 py-2 text-left transition",
                    course.semester === s ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-body-sm font-semibold">
                    {s}
                    {s === cur && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Current semester" />}
                  </span>
                  {s !== "Unscheduled" && (
                    <span className={cx("num text-caption", after > MAX_ECTS_PER_SEMESTER ? "text-warn" : "text-muted")}>{after} ECTS after</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="eyebrow mb-2">Status</div>
          <div className="flex rounded-xl border border-line p-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => updateCourse(course.id, { status: s })}
                className={cx(
                  "h-9 flex-1 cursor-pointer rounded-lg text-body-sm font-medium transition",
                  course.status === s ? "bg-ink text-paper" : "text-muted hover:text-ink",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </section>

        {course.status === "completed" && (
          <section>
            <div className="eyebrow mb-2">Grade</div>
            <div className="flex flex-wrap gap-1.5">
              {GRADES.map((g) => (
                <button
                  key={g}
                  onClick={() => updateCourse(course.id, { grade: course.grade === g ? "" : g })}
                  className={cx(
                    "num h-9 w-12 cursor-pointer rounded-lg border text-body-sm font-semibold transition",
                    course.grade === g ? (g === "5.0" ? "border-danger bg-danger text-white" : "border-accent bg-accent text-white dark:text-paper") : "border-line",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </section>
        )}

        {moveTargets(course).length > 0 && (
          <section>
            <div className="eyebrow mb-2 flex items-center gap-1.5">
              <ArrowRightLeft size={12} /> Count towards
            </div>
            <div className="flex flex-wrap gap-2">
              {[course.category, ...moveTargets(course)].map((id) => (
                <button
                  key={id}
                  onClick={() => updateCourse(course.id, { category: id })}
                  className={cx(
                    "h-9 cursor-pointer rounded-xl border px-3 text-body-sm font-medium",
                    course.category === id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted",
                  )}
                >
                  {categoryById(id).name}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
