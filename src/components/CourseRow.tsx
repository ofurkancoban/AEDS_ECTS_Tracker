import {
  ArrowRightLeft,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock,
  ExternalLink,
  GraduationCap,
  Languages,
  MoreHorizontal,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useState, type DragEvent } from "react";
import { codeOf, offeringPattern, resolveCode, semesterOptionsFor } from "../lib/catalog";
import { CATEGORIES, GRADES, MAX_ATTEMPTS, STATUSES, categoryById } from "../lib/constants";
import { clearRating, difficultyLabel, myRating, submitRating, useRatings } from "../lib/ratings";
import { gradeTone } from "../lib/grades";
import { isFail } from "../lib/stats";
import type { CategoryId, Course } from "../lib/types";
import { useTracker } from "../state";
import { Badge, CategoryDot, CategoryTag, Menu, MenuDivider, MenuItem, MenuLabel, StatusPill, cx } from "./ui";

/** Categories a course may be moved to (same rules as the classic UI's drag and drop). */
export function moveTargets(c: Course): CategoryId[] {
  if (c.homeCategory && c.category !== c.homeCategory) return [c.homeCategory];
  return (["specialization", "further", "additional"] as CategoryId[]).filter((x) => x !== c.category);
}

export function nextStatus(s: Course["status"]): Course["status"] {
  return STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];
}

export const DRAG_COURSE = "text/plain";
export const DRAG_NEW = "application/x-new-course";

export function startCourseDrag(e: DragEvent, c: Course) {
  e.dataTransfer.setData(DRAG_COURSE, c.id);
  moveTargets(c).forEach((m) => e.dataTransfer.setData(`application/x-allow-${m}`, "1"));
  e.dataTransfer.effectAllowed = "move";
}

export function CourseRow({ course, showCategory = false, compact = false }: { course: Course; showCategory?: boolean; compact?: boolean }) {
  const { updateCourse, removeCourse, stats, catalog, whatIf, setMoveTarget } = useTracker();
  const ratings = useRatings();
  const [open, setOpen] = useState(false);
  const code = resolveCode(course.name, catalog) || codeOf(course.name);
  const attempt = stats.attempts.get(course.id);
  const failed = isFail(course);
  const compulsory = !!code && catalog.compulsory.includes(code);
  const dash = course.name.indexOf(" - ");
  const title = dash > 0 && code ? course.name.slice(dash + 3) : course.name;
  const difficulty = code ? difficultyLabel(ratings[code]) : null;
  const moved = course.homeCategory && course.homeCategory !== course.category;
  const tone = course.status === "completed" ? gradeTone(course.grade) : null;

  return (
    <div
      draggable={!course.hypothetical}
      onDragStart={(e) => startCourseDrag(e, course)}
      className={cx(
        "group rounded-2xl border bg-panel transition",
        open ? "border-line-strong shadow-[var(--shadow)]" : "border-transparent hover:border-line",
        course.hypothetical && "border-dashed !border-warn/60 bg-warn-soft/40",
      )}
    >
      <div className={cx("density-row flex items-center gap-3", compact ? "px-3 py-2" : "px-3.5 py-2.5")}>
        {/* A div, not a <button>: Chrome won't start a drag from inside a button. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-expanded={open}
        >
          <span
            className={cx(
              "num flex h-9 w-9 shrink-0 flex-col items-center justify-center gap-px rounded-xl text-center text-micro leading-none font-bold uppercase",
              !tone && (course.status === "in-progress" ? "bg-warn-soft text-warn" : course.status === "completed" ? "bg-accent-soft text-accent" : "bg-ink/5 text-muted"),
            )}
            style={tone ? { background: tone.soft, color: tone.color } : undefined}
            title={tone ? `Grade ${course.grade}` : undefined}
          >
            {/* "wir821" as two centred lines, letters over digits. */}
            {(/^([a-z]+)(\d+)$/.exec(code || "")?.slice(1) || [(code || "·").slice(0, 7)]).map((part, i) => (
              <span key={i}>{part}</span>
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-body font-medium">{title}</span>
              {course.hypothetical && (
                <Badge tone="warn">
                  <Sparkles size={10} /> what-if
                </Badge>
              )}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
              {showCategory && <CategoryTag id={course.category} />}
              <span>{course.semester}</span>
              <span className="text-faint">·</span>
              <span className="num">{course.ects} ECTS</span>
              {compulsory && <Badge tone="accent">compulsory</Badge>}
              {moved && <Badge title={`Catalog category: ${categoryById(course.homeCategory!).name}`}>moved</Badge>}
              {attempt && attempt > 1 && (
                <Badge tone={attempt >= MAX_ATTEMPTS ? "danger" : "warn"}>
                  attempt {attempt}/{MAX_ATTEMPTS}
                </Badge>
              )}
              {failed && <Badge tone="danger">failed</Badge>}
            </span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {course.status === "completed" && (
            <select
              value={course.grade}
              onChange={(e) => updateCourse(course.id, { grade: e.target.value })}
              className={cx("field num h-8 !rounded-lg !py-0 !pl-2.5 !text-body-sm font-semibold", !course.grade && "!border-warn/60 text-warn")}
              style={tone ? { color: tone.color } : undefined}
              aria-label="Grade"
            >
              <option value="">grade</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          <span className="hidden sm:inline-flex">
            <StatusPill status={course.status} onClick={() => updateCourse(course.id, { status: nextStatus(course.status) })} />
          </span>
          <Menu
            width="w-64"
            trigger={(_, toggle) => (
              <button
                onClick={toggle}
                aria-label="Course actions"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted opacity-70 transition hover:bg-ink/5 hover:text-ink group-hover:opacity-100"
              >
                <MoreHorizontal size={17} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Status</MenuLabel>
                {STATUSES.map((s) => (
                  <MenuItem
                    key={s}
                    onClick={() => {
                      updateCourse(course.id, { status: s });
                      close();
                    }}
                  >
                    <span className={course.status === s ? "font-semibold text-accent" : ""}>
                      {s === "in-progress" ? "In progress" : s[0].toUpperCase() + s.slice(1)}
                    </span>
                  </MenuItem>
                ))}
                <MenuDivider />
                <MenuItem
                  icon={<CalendarDays size={15} />}
                  onClick={() => {
                    close();
                    setMoveTarget(course);
                  }}
                >
                  Move to semester
                </MenuItem>
                {moveTargets(course).length > 0 && (
                  <>
                    <MenuDivider />
                    <MenuLabel>Count towards</MenuLabel>
                    {moveTargets(course).map((t) => (
                      <MenuItem
                        key={t}
                        icon={<ArrowRightLeft size={15} />}
                        onClick={() => {
                          updateCourse(course.id, { category: t });
                          close();
                        }}
                      >
                        {categoryById(t).name}
                      </MenuItem>
                    ))}
                  </>
                )}
                <MenuDivider />
                <MenuItem
                  danger
                  icon={<Trash2 size={15} />}
                  onClick={() => {
                    close();
                    removeCourse(course.id);
                  }}
                >
                  Remove course
                </MenuItem>
              </>
            )}
          </Menu>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle details"
            className="hidden h-8 w-6 cursor-pointer items-center justify-center text-faint hover:text-ink sm:flex"
          >
            <ChevronDown size={16} className={cx("transition", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && <CourseDetails course={course} code={code} difficulty={difficulty} whatIf={whatIf} />}
    </div>
  );
}

function CourseDetails({ course, code, difficulty, whatIf }: { course: Course; code: string | null; difficulty: string | null; whatIf: boolean }) {
  const { updateCourse, catalog } = useTracker();
  const semesters = semesterOptionsFor(course.name, catalog);
  const options = semesters.includes(course.semester) ? semesters : [course.semester, ...semesters];
  const pattern = offeringPattern(code, catalog);
  const workload = course.workloadHours || course.ects * 30;

  return (
    <div className="rise border-t border-line px-4 pt-3 pb-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Semester</span>
          <select className="field" value={course.semester} onChange={(e) => updateCourse(course.id, { semester: e.target.value })}>
            {options.map((s) => (
              <option key={s}>{s}</option>
            ))}
            {!options.includes("Unscheduled") && <option>Unscheduled</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">ECTS</span>
          <input
            type="number"
            min={1}
            max={30}
            className="field num"
            value={course.ects}
            onChange={(e) => updateCourse(course.id, { ects: Math.max(0, parseFloat(e.target.value) || 0) })}
          />
        </label>
        <label className="flex flex-col gap-1 sm:hidden">
          <span className="eyebrow">Status</span>
          <select className="field" value={course.status} onChange={(e) => updateCourse(course.id, { status: e.target.value as Course["status"] })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "in-progress" ? "In progress" : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Category</span>
          <select
            className="field"
            value={course.category}
            onChange={(e) => updateCourse(course.id, { category: e.target.value as CategoryId })}
          >
            {CATEGORIES.filter((c) => c.id === course.category || moveTargets(course).includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {(whatIf || course.hypothetical) && (
          <label className="flex items-center gap-2 self-end pb-2 text-body-sm">
            <input
              type="checkbox"
              checked={!!course.hypothetical}
              onChange={(e) => updateCourse(course.id, { hypothetical: e.target.checked })}
              className="accent-[var(--warn)]"
            />
            What-if only
          </label>
        )}
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
        {course.professor && <Info icon={<User size={14} />} label="Lecturer" value={course.professor} />}
        {course.examType && <Info icon={<GraduationCap size={14} />} label="Exam" value={course.examType} />}
        {course.language && <Info icon={<Languages size={14} />} label="Language" value={course.language} />}
        <Info
          icon={<Clock size={14} />}
          label="Workload"
          value={`${workload} h total${course.contactHours ? `, ${course.contactHours} h contact` : ""}`}
        />
        {pattern && (
          <Info
            icon={<BookOpen size={14} />}
            label="Offered"
            value={`${pattern.pattern === "both" ? "Winter and summer" : pattern.pattern === "WiSe" ? "Winter only" : "Summer only"} · last ${pattern.last}`}
          />
        )}
        {difficulty && <Info icon={<Sparkles size={14} />} label="Difficulty" value={difficulty} />}
      </div>

      {course.skills && (
        <details className="mt-3 text-body-sm">
          <summary className="cursor-pointer text-muted hover:text-ink">Learning outcomes</summary>
          <p className="mt-2 leading-relaxed text-muted">{course.skills}</p>
        </details>
      )}

      <label className="mt-3 flex flex-col gap-1">
        <span className="eyebrow">Notes</span>
        <textarea
          rows={2}
          className="field resize-y"
          placeholder="Exam date, group, anything worth remembering"
          value={course.notes || ""}
          onChange={(e) => updateCourse(course.id, { notes: e.target.value })}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {code && course.status === "completed" && !course.hypothetical ? <DifficultyRater code={code} /> : <span />}
        {course.studipLink && (
          <a
            href={course.studipLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-accent hover:underline"
          >
            Module description <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-faint">{icon}</span>
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
}

function DifficultyRater({ code }: { code: string }) {
  const [mine, setMine] = useState(() => myRating(code));
  const [hover, setHover] = useState(0);
  const shown = hover || mine;
  return (
    <div className="flex items-center gap-2 text-meta text-muted" title="Anonymous, shared with other students using this app">
      <span>How hard was it?</span>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            aria-label={`Rate difficulty ${n} of 5`}
            onMouseEnter={() => setHover(n)}
            onClick={() => {
              if (n === mine) {
                clearRating(code, mine);
                setMine(0);
              } else {
                submitRating(code, n, mine);
                setMine(n);
              }
            }}
            className={cx(
              "h-3.5 w-3.5 cursor-pointer rounded-full border transition",
              n <= shown ? "border-warn bg-warn" : "border-line-strong bg-transparent hover:border-warn",
            )}
          />
        ))}
      </div>
      {mine > 0 && <span className="text-faint">click again to clear</span>}
    </div>
  );
}

export function CategoryHeaderDot({ id }: { id: CategoryId }) {
  return <CategoryDot id={id} size={10} />;
}
