import {
  AlarmClock,
  ArrowRight,
  Award,
  CalendarClock,
  CircleAlert,
  Clock3,
  DatabaseBackup,
  Flag,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { GpaTrend, GradeHistogram, ProgressRing } from "../components/Charts";
import { OpenPanel } from "../components/OpenPanel";
import { useCategoryDrop } from "../components/dnd";
import { Bar, Button, CategoryDot, SectionTitle, cx } from "../components/ui";
import { labelForCode } from "../lib/catalog";
import { LECTURE_WEEKS, MAX_ECTS_PER_SEMESTER, TOTAL_REQUIRED } from "../lib/constants";
import { lastChanceCourses, notOfferedAnymore } from "../lib/planning";
import { planningSemester } from "../lib/semesters";
import type { CategoryStats } from "../lib/stats";
import { useTracker } from "../state";

export function Overview({ onBackup }: { onBackup: () => void }) {
  const { stats, state, courses, catalog, patch, setView, dismissBackupReminder } = useTracker();
  const plan = planningSemester();
  const target = parseFloat(state.targetGrade);

  const termCourses = courses.filter((c) => c.semester === plan && !c.hypothetical);
  const termEcts = termCourses.reduce((a, c) => a + c.ects, 0);
  const termHours = termCourses.reduce((a, c) => a + (c.workloadHours || c.ects * 30), 0) / LECTURE_WEEKS;

  const lastChance = useMemo(() => lastChanceCourses(stats, catalog), [stats, catalog]);
  const gone = useMemo(() => notOfferedAnymore(courses, catalog), [courses, catalog]);
  const overloaded = useMemo(() => {
    const by: Record<string, number> = {};
    courses.forEach((c) => {
      if (c.hypothetical || c.semester === "Unscheduled") return;
      by[c.semester] = (by[c.semester] || 0) + c.ects;
    });
    return Object.entries(by).filter(([, v]) => v > MAX_ECTS_PER_SEMESTER);
  }, [courses]);

  const reqAvg = stats.requiredAverage;
  const reqText =
    reqAvg === null ? null : reqAvg < 1 ? "Already on track" : reqAvg > 5 ? "Not achievable" : `Need ${reqAvg.toFixed(2)} avg`;

  const remainingCounted = TOTAL_REQUIRED - stats.completed;

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* Hero */}
      <section className="card relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr]">
          <div className="mx-auto">
            <ProgressRing total={TOTAL_REQUIRED} completed={stats.completed} inProgress={stats.inProgress} planned={stats.planned} />
          </div>
          <div className="min-w-0">
            <div className="eyebrow mb-1">Master's progress</div>
            <h2 className="font-serif text-[28px] leading-tight font-semibold tracking-tight sm:text-[34px]">
              {stats.graduationReady ? (
                <>All requirements met. Time to graduate.</>
              ) : remainingCounted <= 0 ? (
                <>120 ECTS reached, a few loose ends left.</>
              ) : (
                <>
                  <span className="num">{remainingCounted}</span> ECTS to go
                  {stats.remaining > 0 ? (
                    <span className="text-muted">
                      , <span className="num">{stats.remaining}</span> still unplanned
                    </span>
                  ) : (
                    <span className="text-muted">, all of it planned</span>
                  )}
                </>
              )}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Legend color="var(--accent)" label="Completed" value={stats.completed} />
              <Legend color="var(--warn)" label="In progress" value={stats.inProgress} />
              <Legend color="var(--muted)" label="Planned" value={stats.planned} hatch />
              <Legend color="var(--line-strong)" label="Unplanned" value={stats.remaining} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setView("planner")}>
                Plan next semester <ArrowRight size={16} />
              </Button>
              <Button onClick={() => setView("checklist")}>Graduation checklist</Button>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Award size={17} />}
          label="Overall GPA"
          value={stats.gpa || "-"}
          foot={
            stats.projectedGpa ? (
              <span className="text-warn">
                <Sparkles size={11} className="inline" /> projected {stats.projectedGpa}
              </span>
            ) : (
              `${stats.gradedEcts} graded ECTS`
            )
          }
        />
        <Kpi
          icon={<Target size={17} />}
          label="Target GPA"
          value={
            <input
              value={state.targetGrade}
              onChange={(e) => patch({ targetGrade: e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") })}
              placeholder="e.g. 1.7"
              inputMode="decimal"
              className="num w-full bg-transparent outline-none placeholder:text-faint"
              aria-label="Target GPA"
            />
          }
          foot={
            reqText ? (
              <span className={cx(reqAvg! > 5 ? "text-danger" : reqAvg! < 1 ? "text-accent" : "")}>
                {reqText} across the remaining {stats.remainingGradedEcts} ECTS
              </span>
            ) : (
              "Set a goal to see the average you need"
            )
          }
        />
        <Kpi
          icon={<Clock3 size={17} />}
          label={`${plan} load`}
          value={
            <>
              <span className="num">{termEcts}</span>
              <span className="text-[15px] text-muted"> ECTS</span>
            </>
          }
          foot={termEcts ? `about ${Math.round(termHours)} h per week` : "Nothing scheduled yet"}
          warn={termEcts > MAX_ECTS_PER_SEMESTER}
        />
        <Kpi
          icon={<CalendarClock size={17} />}
          label="Graduation"
          value={
            stats.daysLeft !== null ? (
              <>
                <span className="num">{Math.max(0, stats.daysLeft)}</span>
                <span className="text-[15px] text-muted"> days</span>
              </>
            ) : (
              "-"
            )
          }
          foot={
            <input
              type="date"
              value={state.graduationDate}
              onChange={(e) => patch({ graduationDate: e.target.value })}
              className="w-full bg-transparent text-[12px] text-muted outline-none"
              aria-label="Graduation date"
            />
          }
        />
      </section>

      {/* Alerts */}
      <Alerts
        items={[
          stats.needsBackupReminder && {
            key: "backup",
            tone: "warn" as const,
            icon: <DatabaseBackup size={16} />,
            text:
              stats.backupDaysAgo === null
                ? "You haven't downloaded a backup yet. Your data only lives in this browser."
                : `Last backup was ${stats.backupDaysAgo} days ago.`,
            action: (
              <Button size="sm" variant="soft" onClick={onBackup}>
                Download backup
              </Button>
            ),
            onDismiss: dismissBackupReminder,
          },
          ...lastChance.map((l) => ({
            key: "lc-" + l.label,
            tone: "danger" as const,
            icon: <AlarmClock size={16} />,
            text: (
              <>
                <b>{l.label}</b> is compulsory and runs this semester, but usually only in the {l.pattern === "WiSe" ? "winter" : "summer"} term.
              </>
            ),
          })),
          ...gone.map((g) => ({
            key: "gone-" + g.course.id,
            tone: "warn" as const,
            icon: <CircleAlert size={16} />,
            text: (
              <>
                <b>{g.course.name}</b> was last offered in {g.last}. It may not run again.
              </>
            ),
          })),
          ...overloaded.map(([sem, e]) => ({
            key: "ol-" + sem,
            tone: "warn" as const,
            icon: <CircleAlert size={16} />,
            text: (
              <>
                {sem} has <b className="num">{e}</b> ECTS planned, more than the usual {MAX_ECTS_PER_SEMESTER}.
              </>
            ),
          })),
          stats.missingGrades.length > 0 && {
            key: "grades",
            tone: "muted" as const,
            icon: <Flag size={16} />,
            text: `${stats.missingGrades.length} completed course${stats.missingGrades.length === 1 ? " has" : "s have"} no grade yet.`,
            action: (
              <Button size="sm" variant="ghost" onClick={() => setView("courses")}>
                Add grades
              </Button>
            ),
          },
          catalog.newCodes.length > 0 && {
            key: "new",
            tone: "accent" as const,
            icon: <Sparkles size={16} />,
            text: `New in the catalog: ${catalog.newCodes
              .slice(0, 4)
              .map((c) => labelForCode(c, catalog))
              .join(", ")}${catalog.newCodes.length > 4 ? ` and ${catalog.newCodes.length - 4} more` : ""}.`,
          },
          stats.graduationReady && {
            key: "ready",
            tone: "accent" as const,
            icon: <PartyPopper size={16} />,
            text: "Every ECTS target and compulsory module is done. Congratulations!",
          },
        ]}
      />

      {/* Categories */}
      <section>
        <SectionTitle eyebrow="Requirements" title="Where your credits go" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stats.categories
            .filter((c) => !c.excludedFromTotal || c.items.length)
            .map((c) => (
              <CategoryCard key={c.id} cat={c} />
            ))}
        </div>
      </section>

      <OpenPanel />

      {/* Charts */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <SectionTitle eyebrow="Performance" title="GPA by semester" />
          {stats.semesterGpa.length ? (
            <GpaTrend points={stats.semesterGpa} target={target >= 1 && target <= 4 ? target : undefined} />
          ) : (
            <p className="py-8 text-center text-[13.5px] text-muted">Grades will draw a trend line here.</p>
          )}
        </div>
        <div className="card p-5 lg:col-span-2">
          <SectionTitle eyebrow="Distribution" title="Grades" />
          <GradeHistogram buckets={stats.gradeBuckets} />
        </div>
      </section>

      {stats.compulsoryDone.length > 0 && (
        <div className="flex items-center gap-2 px-1 text-[12.5px] text-muted">
          <ShieldCheck size={14} className="text-accent" />
          {stats.compulsoryDone.length} of {catalog.compulsory.length} compulsory modules completed.
        </div>
      )}
    </div>
  );
}

function Legend({ color, label, value, hatch }: { color: string; label: string; value: number; hatch?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: hatch ? `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 4px)` : color, border: hatch ? `1px solid ${color}` : undefined }}
        />
        {label}
      </div>
      <div className="num mt-0.5 text-[20px] font-semibold">
        {value}
        <span className="ml-1 text-[12px] font-normal text-muted">ECTS</span>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, foot, warn }: { icon: ReactNode; label: string; value: ReactNode; foot?: ReactNode; warn?: boolean }) {
  return (
    <div className={cx("card flex flex-col p-4", warn && "!border-warn/60")}>
      <div className="flex items-center gap-2 text-muted">
        <span className={cx("flex h-7 w-7 items-center justify-center rounded-lg", warn ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>{icon}</span>
        <span className="truncate text-[12.5px] font-medium">{label}</span>
      </div>
      <div className="num mt-3 text-[28px] leading-none font-semibold tracking-tight">{value}</div>
      {foot && <div className="mt-2 text-[12px] leading-snug text-muted">{foot}</div>}
    </div>
  );
}

type AlertItem = {
  key: string;
  tone: "warn" | "danger" | "muted" | "accent";
  icon: ReactNode;
  text: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
};

function Alerts({ items }: { items: (AlertItem | false | null | undefined)[] }) {
  const list = items.filter((x): x is AlertItem => !!x);
  if (!list.length) return null;
  const tones = {
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    muted: "bg-ink/5 text-muted",
    accent: "bg-accent-soft text-accent",
  };
  return (
    <section className="grid grid-cols-1 gap-2">
      {list.map((a) => (
        <div key={a.key} className="rise flex items-center gap-3 rounded-2xl border border-line bg-panel py-2.5 pr-2.5 pl-3">
          <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", tones[a.tone])}>{a.icon}</span>
          <div className="min-w-0 flex-1 text-[13.5px] leading-snug">{a.text}</div>
          {a.action}
          {a.onDismiss && (
            <button onClick={a.onDismiss} aria-label="Dismiss" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-faint hover:bg-ink/5 hover:text-ink">
              <X size={15} />
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function CategoryCard({ cat }: { cat: CategoryStats }) {
  const { setView } = useTracker();
  const drop = useCategoryDrop(cat.id);
  const req = cat.required || 0;
  const pct = (v: number) => (req ? (v / req) * 100 : 0);
  const done = req > 0 && cat.completed >= req;
  return (
    <button
      {...drop.props}
      onClick={() => {
        setView("courses");
        window.setTimeout(() => document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      }}
      className={cx(
        "card group cursor-pointer p-4 text-left transition hover:-translate-y-0.5 hover:border-line-strong",
        drop.over && "drop-target",
      )}
    >
      <div className="flex items-center gap-2">
        <CategoryDot id={cat.id} size={10} />
        <span className="flex-1 truncate font-semibold">{cat.name}</span>
        {done && <ShieldCheck size={16} className="text-accent" />}
        {cat.gpa && <span className="num whitespace-nowrap rounded-md bg-ink/5 px-1.5 py-0.5 text-[11.5px] font-semibold text-muted">⌀ {cat.gpa}</span>}
      </div>
      {req > 0 ? (
        <>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="num text-[26px] leading-none font-semibold">{cat.completed}</span>
            <span className="num text-[13px] text-muted">/ {req} ECTS</span>
            {cat.remaining > 0 && <span className="ml-auto text-[12px] text-warn">{cat.remaining} unplanned</span>}
          </div>
          <div className="mt-3">
            <Bar
              segments={[
                { value: pct(cat.completed), color: `var(--cat-${cat.id})` },
                { value: pct(cat.inProgress), color: "var(--warn)" },
                { value: pct(cat.planned), color: "var(--muted)", striped: true },
              ]}
            />
          </div>
        </>
      ) : (
        <div className="mt-3 text-[13px] text-muted">
          <span className="num text-[22px] font-semibold text-ink">{cat.completed + cat.inProgress + cat.planned}</span> ECTS tracked
          {cat.excludedFromTotal ? ", not counted toward 120" : ""}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
        <span>
          {cat.items.length} course{cat.items.length === 1 ? "" : "s"}
        </span>
        {cat.compulsoryCodes.length > 0 && (
          <span>
            compulsory {cat.compulsoryDone}/{cat.compulsoryCodes.length}
          </span>
        )}
      </div>
    </button>
  );
}
