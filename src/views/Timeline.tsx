import { CalendarDays, Clock3, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { startCourseDrag } from "../components/CourseRow";
import { useSemesterDrop } from "../components/dnd";
import { CategoryDot, Empty, StatusPill, cx } from "../components/ui";
import { LECTURE_WEEKS, MAX_ECTS_PER_SEMESTER } from "../lib/constants";
import { isFail } from "../lib/stats";
import { allSemesters, compareSemesters, currentSemester, planningSemester } from "../lib/semesters";
import type { Course } from "../lib/types";
import { useTracker } from "../state";

/** Semester-by-semester board; drag a card to reschedule it. */
export function Timeline() {
  const { courses, stats } = useTracker();
  const cur = currentSemester();
  const plan = planningSemester();

  const columns = useMemo(() => {
    const set = new Set<string>(courses.map((c) => c.semester));
    set.add(cur);
    set.add(plan);
    const ds = allSemesters();
    const next = ds[ds.indexOf(plan) + 1];
    if (next) set.add(next);
    return [...set].sort(compareSemesters);
  }, [courses, cur, plan]);

  const gpaBy = new Map(stats.semesterGpa.map((s) => [s.semester, s.avg]));

  if (!courses.length)
    return (
      <Empty icon={<CalendarDays size={22} />} title="Your timeline is empty">
        Courses you add appear here, one column per semester. Drag cards between columns to reschedule.
      </Empty>
    );

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
      <div className="flex min-w-max snap-x snap-mandatory gap-3 sm:snap-none">
        {columns.map((s) => (
          <Column
            key={s}
            semester={s}
            courses={courses.filter((c) => c.semester === s)}
            isCurrent={s === cur}
            isPlanning={s === plan && plan !== cur}
            past={compareSemesters(s, cur) < 0}
            gpa={gpaBy.get(s)}
          />
        ))}
      </div>
    </div>
  );
}

function Column({
  semester,
  courses,
  isCurrent,
  isPlanning,
  past,
  gpa,
}: {
  semester: string;
  courses: Course[];
  isCurrent: boolean;
  isPlanning: boolean;
  past: boolean;
  gpa?: number;
}) {
  const drop = useSemesterDrop(semester);
  const real = courses.filter((c) => !c.hypothetical);
  const ects = real.reduce((a, c) => a + c.ects, 0);
  const hours = real.reduce((a, c) => a + (c.workloadHours || c.ects * 30), 0) / LECTURE_WEEKS;
  const over = ects > MAX_ECTS_PER_SEMESTER;
  return (
    <section
      {...drop.props}
      className={cx(
        "flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-3xl border p-2 transition sm:w-[280px]",
        isCurrent ? "border-accent/50 bg-accent-soft/40" : "border-line bg-panel/60",
        drop.over && "drop-target",
      )}
    >
      <header className="px-2.5 pt-2 pb-3">
        <div className="flex items-center gap-2">
          <h3 className={cx("font-serif text-[17px] font-semibold", past && !isCurrent && "text-muted")}>{semester}</h3>
          {isCurrent && <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-white dark:text-paper">now</span>}
          {isPlanning && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10.5px] font-semibold text-warn">planning</span>}
          {gpa !== undefined && <span className="num ml-auto text-[12px] font-semibold text-muted">⌀ {gpa.toFixed(2)}</span>}
        </div>
        {semester !== "Unscheduled" && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted">
              <span className={cx("num", over && "font-semibold text-warn")}>
                {over && <TriangleAlert size={11} className="mr-1 inline" />}
                {ects} / {MAX_ECTS_PER_SEMESTER} ECTS
              </span>
              {ects > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Clock3 size={11} /> {Math.round(hours)} h/wk
                </span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${Math.min(100, (ects / MAX_ECTS_PER_SEMESTER) * 100)}%`, background: over ? "var(--warn)" : "var(--accent)" }}
              />
            </div>
          </div>
        )}
      </header>
      <div className="grid min-h-24 content-start gap-1.5">
        {courses.map((c) => (
          <Card key={c.id} course={c} />
        ))}
        {!courses.length && <div className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">Drop a course here</div>}
      </div>
    </section>
  );
}

function Card({ course }: { course: Course }) {
  const { updateCourse, setMoveTarget } = useTracker();
  const [code, ...rest] = course.name.split(" - ");
  const title = rest.length ? rest.join(" - ") : course.name;
  const failed = isFail(course);
  return (
    <div
      draggable={!course.hypothetical}
      onDragStart={(e) => startCourseDrag(e, course)}
      onClick={() => setMoveTarget(course)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setMoveTarget(course)}
      title="Tap to move or edit. Drag (or long-press on touch) to another semester."
      className={cx(
        "cursor-grab rounded-2xl border bg-panel p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:border-line-strong active:cursor-grabbing",
        course.hypothetical ? "border-dashed border-warn/60" : "border-line",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <CategoryDot id={course.category} />
        <span className="num font-semibold">{rest.length ? code : ""}</span>
        <span className="num ml-auto">{course.ects} ECTS</span>
      </div>
      <div className="mt-1 line-clamp-2 text-[13.5px] leading-snug font-medium">{title}</div>
      <div className="mt-2 flex items-center justify-between">
        <span onClick={(e) => e.stopPropagation()}>
        <StatusPill
          status={course.status}
          onClick={() =>
            updateCourse(course.id, { status: course.status === "planned" ? "in-progress" : course.status === "in-progress" ? "completed" : "planned" })
          }
        />
        </span>
        {course.status === "completed" && course.grade && (
          <span className={cx("num text-[13px] font-semibold", failed ? "text-danger" : "text-accent")}>{course.grade}</span>
        )}
      </div>
    </div>
  );
}
