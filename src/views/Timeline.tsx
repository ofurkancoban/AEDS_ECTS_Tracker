import { CalendarDays, ChevronsLeft, ChevronsRight, Clock3, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { startCourseDrag } from "../components/CourseRow";
import { useSemesterDrop } from "../components/dnd";
import { CategoryDot, Empty, StatusPill, cx } from "../components/ui";
import { LECTURE_WEEKS, MAX_ECTS_PER_SEMESTER } from "../lib/constants";
import { gradeTone } from "../lib/grades";
import { layoutKey, useFlash, useFlip } from "../lib/motion";
import { PAST_COLLAPSED_KEY } from "../lib/preferences";
import { allSemesters, compareSemesters, currentSemester, planningSemester } from "../lib/semesters";
import { readFlag, writeFlag } from "../lib/storage";
import type { Course } from "../lib/types";
import { useTracker } from "../state";

const columnId = (s: string) => "sem-" + s.replace(/[^a-z0-9]/gi, "");

/** Semester-by-semester board; drag a card to reschedule it. */
export function Timeline() {
  const { courses, stats } = useTracker();
  const cur = currentSemester();
  const plan = planningSemester();
  const [pastCollapsed, setPastCollapsed] = useState(() => readFlag(PAST_COLLAPSED_KEY) === "1");
  const scroller = useRef<HTMLDivElement>(null);
  // The board itself, not the scroller: positions inside it don't change when it scrolls.
  const board = useRef<HTMLDivElement>(null);
  useFlip(board, [layoutKey(courses)]);

  const columns = useMemo(() => {
    const set = new Set<string>(courses.map((c) => c.semester));
    set.add(cur);
    set.add(plan);
    const ds = allSemesters();
    const next = ds[ds.indexOf(plan) + 1];
    if (next) set.add(next);
    return [...set].sort(compareSemesters);
  }, [courses, cur, plan]);

  const past = columns.filter((s) => s !== "Unscheduled" && compareSemesters(s, cur) < 0);
  const visible = pastCollapsed ? columns.filter((s) => !past.includes(s)) : columns;
  const gpaBy = new Map(stats.semesterGpa.map((s) => [s.semester, s.avg]));
  const ectsOf = (s: string) => courses.filter((c) => c.semester === s && !c.hypothetical).reduce((a, c) => a + c.ects, 0);

  const togglePast = () => {
    writeFlag(PAST_COLLAPSED_KEY, pastCollapsed ? "0" : "1");
    setPastCollapsed(!pastCollapsed);
  };

  const jump = (s: string) => {
    if (pastCollapsed && past.includes(s)) {
      writeFlag(PAST_COLLAPSED_KEY, "0");
      setPastCollapsed(false);
      window.setTimeout(() => jump(s), 50);
      return;
    }
    document.getElementById(columnId(s))?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  if (!courses.length)
    return (
      <Empty icon={<CalendarDays size={22} />} title="Your timeline is empty">
        Courses you add appear here, one column per semester. Drag cards between columns to reschedule.
      </Empty>
    );

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* Semester strip: jump to a column, see each term's load at a glance. */}
      <nav aria-label="Semesters" className="scrollbar-none -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        {past.length > 0 && (
          <button
            onClick={togglePast}
            aria-pressed={pastCollapsed}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-line bg-panel px-3 text-meta font-medium text-muted hover:text-ink"
          >
            {pastCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
            {pastCollapsed ? `Show ${past.length} past` : "Hide past"}
          </button>
        )}
        {columns.map((s) => {
          const e = ectsOf(s);
          return (
            <button
              key={s}
              onClick={() => jump(s)}
              className={cx(
                "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-meta transition",
                s === cur ? "border-accent bg-accent text-white dark:text-paper" : "border-line bg-panel hover:border-line-strong",
                pastCollapsed && past.includes(s) && "border-dashed text-muted",
              )}
            >
              <span className="font-semibold">{s}</span>
              {s !== "Unscheduled" && (
                <span className={cx("num", s === cur ? "" : e > MAX_ECTS_PER_SEMESTER ? "text-warn" : "text-muted")}>{e}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div ref={scroller} className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <div ref={board} className="stagger flex min-w-max snap-x snap-mandatory gap-3 sm:snap-none">
          {visible.map((s) => (
            <div key={s} className="flex gap-3">
              {s === cur && (
                <div className="flex w-3 shrink-0 flex-col items-center" aria-hidden="true">
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-micro font-bold tracking-wide text-white uppercase [writing-mode:vertical-rl] dark:text-paper">
                    today
                  </span>
                  <span className="mt-1 w-0.5 flex-1 rounded-full bg-accent/40" />
                </div>
              )}
              <Column
                semester={s}
                courses={courses.filter((c) => c.semester === s)}
                isCurrent={s === cur}
                isPlanning={s === plan && plan !== cur}
                past={past.includes(s)}
                gpa={gpaBy.get(s)}
              />
            </div>
          ))}
        </div>
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
  const tone = gpa !== undefined ? gradeTone(gpa) : null;
  return (
    <section
      id={columnId(semester)}
      aria-label={semester}
      {...drop.props}
      className={cx(
        "flex w-[78vw] max-w-[300px] shrink-0 snap-start scroll-ml-4 flex-col rounded-3xl border p-2 transition sm:w-[280px]",
        isCurrent ? "border-accent/50 bg-accent-soft/40" : "border-line bg-panel/60",
        drop.over && "drop-target",
      )}
    >
      <header className="px-2.5 pt-2 pb-3">
        <div className="flex items-center gap-2">
          <h3 className={cx("font-serif text-title font-semibold", past && "text-muted")}>{semester}</h3>
          {isCurrent && <span className="rounded-full bg-accent px-2 py-0.5 text-micro font-semibold text-white dark:text-paper">now</span>}
          {isPlanning && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-micro font-semibold text-warn">planning</span>}
          {gpa !== undefined && (
            <span className="num ml-auto rounded-md px-1.5 py-0.5 text-meta font-semibold" style={tone ? { color: tone.color, background: tone.soft } : undefined}>
              ⌀ {gpa.toFixed(2)}
            </span>
          )}
        </div>
        {semester !== "Unscheduled" && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-caption text-muted">
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
      <div className="density-gap grid min-h-24 content-start gap-1.5">
        {courses.map((c) => (
          <Card key={c.id} course={c} />
        ))}
        {!courses.length && <div className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-meta text-faint">Drop a course here</div>}
      </div>
    </section>
  );
}

function Card({ course }: { course: Course }) {
  const { updateCourse, setMoveTarget } = useTracker();
  const [code, ...rest] = course.name.split(" - ");
  const title = rest.length ? rest.join(" - ") : course.name;
  const tone = course.status === "completed" ? gradeTone(course.grade) : null;
  const flash = useFlash(course.id, `${course.status}|${course.grade}|${course.semester}|${course.category}|${course.ects}`);
  return (
    <div
      draggable={!course.hypothetical}
      onDragStart={(e) => startCourseDrag(e, course)}
      onClick={() => setMoveTarget(course)}
      data-flip-id={course.id}
      title="Tap to move or edit. Drag (or long-press on touch) to another semester."
      className={cx(
        "density-card relative cursor-grab overflow-hidden rounded-2xl border bg-panel p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:border-line-strong active:cursor-grabbing",
        course.hypothetical ? "border-dashed border-warn/60" : "border-line",
        flash && "flash",
      )}
    >
      {/* Grade strip: the colour scale at a glance. */}
      {tone && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: tone.color }} />}
      <div className="flex items-center gap-1.5 text-caption text-muted">
        <CategoryDot id={course.category} />
        <span className="num font-semibold">{rest.length ? code : ""}</span>
        <span className="num ml-auto">{course.ects} ECTS</span>
      </div>
      {/* The title is the card's keyboard entry point (the card itself handles taps). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMoveTarget(course);
        }}
        aria-label={`Move or edit ${course.name}`}
        className="mt-1 line-clamp-2 block w-full cursor-pointer rounded-md text-left text-body-sm leading-snug font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {title}
      </button>
      <div className="mt-2 flex items-center justify-between">
        <span onClick={(e) => e.stopPropagation()}>
          <StatusPill
            status={course.status}
            onClick={() =>
              updateCourse(course.id, { status: course.status === "planned" ? "in-progress" : course.status === "in-progress" ? "completed" : "planned" })
            }
          />
        </span>
        {tone && (
          <span className="num rounded-md px-1.5 py-0.5 text-body-sm font-semibold" style={{ color: tone.color, background: tone.soft }}>
            {course.grade}
          </span>
        )}
      </div>
    </div>
  );
}
