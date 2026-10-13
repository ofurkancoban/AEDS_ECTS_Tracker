import {
  AlarmClock,
  ArrowRight,
  Award,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  Clock3,
  DatabaseBackup,
  Flag,
  PartyPopper,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { GradeHistogram, ProgressRing, SemesterChart } from "../components/Charts";
import { OpenPanel } from "../components/OpenPanel";
import { useCategoryDrop } from "../components/dnd";
import { Bar, Button, CategoryDot, SectionTitle, cx } from "../components/ui";
import { labelForCode } from "../lib/catalog";
import { LECTURE_WEEKS, MAX_ECTS_PER_SEMESTER, TOTAL_REQUIRED } from "../lib/constants";
import { lastChanceCourses, notOfferedAnymore } from "../lib/planning";
import { compareSemesters, planningSemester } from "../lib/semesters";
import { isFail } from "../lib/stats";
import type { CategoryStats } from "../lib/stats";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useTracker } from "../state";

export function Overview({ onBackup, onImport }: { onBackup: () => void; onImport: () => void }) {
  const { stats, state, courses, catalog, patch, setView, dismissBackupReminder, openAdd, setStudipOpen } = useTracker();
  const fresh = courses.length === 0;
  const small = useMediaQuery("(max-width: 639px)");
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

  // Completed (passed, counted) credits per semester, for the bars under the GPA line.
  const semesterBars = useMemo(() => {
    const by = new Map<string, number>();
    courses.forEach((c) => {
      if (c.hypothetical || c.status !== "completed" || isFail(c) || c.category === "additional" || c.semester === "Unscheduled") return;
      by.set(c.semester, (by.get(c.semester) || 0) + c.ects);
    });
    return [...by.entries()].map(([semester, ects]) => ({ semester, ects })).sort((a, b) => compareSemesters(a.semester, b.semester));
  }, [courses]);

  if (fresh)
    return (
      <div className="grid grid-cols-1 gap-5">
        <Welcome onSync={() => setStudipOpen(true)} onImport={onImport} onAdd={() => openAdd()} />
        <OpenPanel />
      </div>
    );

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* Hero */}
      <section className="card relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr]">
          <div className="mx-auto">
            <ProgressRing total={TOTAL_REQUIRED} completed={stats.completed} inProgress={stats.inProgress} planned={stats.planned} size={small ? 168 : 220} stroke={small ? 15 : 18} />
          </div>
          <div className="min-w-0">
            <div className="eyebrow mb-1">Master's progress</div>
            <h2 className="font-serif text-display leading-tight font-semibold tracking-tight sm:text-display-lg">
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
              <span className="text-title-sm text-muted"> ECTS</span>
            </>
          }
          foot={termEcts ? `about ${Math.round(termHours)} h per week` : "Nothing scheduled yet"}
          warn={termEcts > MAX_ECTS_PER_SEMESTER}
        />
        <Kpi
          icon={<CalendarClock size={17} />}
          label={stats.daysLeft !== null && stats.daysLeft < 0 ? "Graduation date passed" : "Graduation"}
          value={
            stats.daysLeft !== null ? (
              <>
                <span className="num">{Math.abs(stats.daysLeft)}</span>
                <span className="text-title-sm text-muted">{stats.daysLeft === 1 || stats.daysLeft === -1 ? " day" : " days"}{stats.daysLeft < 0 ? " ago" : ""}</span>
              </>
            ) : (
              "-"
            )
          }
          warn={stats.daysLeft !== null && stats.daysLeft < 0}
          foot={
            <input
              type="date"
              value={state.graduationDate}
              onChange={(e) => patch({ graduationDate: e.target.value })}
              className="w-full bg-transparent text-meta text-muted outline-none"
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
          <SectionTitle eyebrow="Performance" title="Credits and GPA by semester" />
          {semesterBars.length ? (
            <SemesterChart bars={semesterBars} gpa={stats.semesterGpa} target={target >= 1 && target <= 4 ? target : undefined} />
          ) : (
            <p className="py-8 text-center text-body-sm text-muted">Completed courses will show up here per semester.</p>
          )}
        </div>
        <div className="card p-5 lg:col-span-2">
          <SectionTitle eyebrow="Distribution" title="Grades" />
          <GradeHistogram buckets={stats.gradeBuckets} />
        </div>
      </section>

      {stats.compulsoryDone.length > 0 && (
        <div className="flex items-center gap-2 px-1 text-meta text-muted">
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
      <div className="flex items-center gap-2 text-meta text-muted">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: hatch ? `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 4px)` : color, border: hatch ? `1px solid ${color}` : undefined }}
        />
        {label}
      </div>
      <div className="num mt-0.5 text-display-sm font-semibold">
        {value}
        <span className="ml-1 text-meta font-normal text-muted">ECTS</span>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, foot, warn }: { icon: ReactNode; label: string; value: ReactNode; foot?: ReactNode; warn?: boolean }) {
  return (
    <div className={cx("card flex flex-col p-4", warn && "!border-warn/60")}>
      <div className="flex items-center gap-2 text-muted">
        <span className={cx("flex h-7 w-7 items-center justify-center rounded-lg", warn ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>{icon}</span>
        <span className="truncate text-meta font-medium">{label}</span>
      </div>
      <div className="num mt-3 text-display leading-none font-semibold tracking-tight">{value}</div>
      {foot && <div className="mt-2 text-meta leading-snug text-muted">{foot}</div>}
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

const SEVERITY: AlertItem["tone"][] = ["danger", "warn", "muted", "accent"];

/** All alerts in one panel, most severe first; the first two show, the rest on demand. */
function Alerts({ items }: { items: (AlertItem | false | null | undefined)[] }) {
  const [expanded, setExpanded] = useState(false);
  const list = items.filter((x): x is AlertItem => !!x).sort((a, b) => SEVERITY.indexOf(a.tone) - SEVERITY.indexOf(b.tone));
  if (!list.length) return null;
  const tones = {
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    muted: "bg-ink/5 text-muted",
    accent: "bg-accent-soft text-accent",
  };
  const dot = { warn: "bg-warn", danger: "bg-danger", muted: "bg-faint", accent: "bg-accent" };
  const counts = SEVERITY.map((t) => [t, list.filter((a) => a.tone === t).length] as const).filter(([, n]) => n > 0);
  const onlyGood = list.every((a) => a.tone === "accent");
  const shown = expanded ? list : list.slice(0, 2);
  return (
    <section className="card overflow-hidden" aria-label={onlyGood ? "Updates" : "Needs attention"}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h2 className="font-serif text-title-sm font-semibold">{onlyGood ? "Updates" : "Needs attention"}</h2>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {counts.map(([t, n]) => (
            <span key={t} className="inline-flex items-center gap-1 text-caption text-muted">
              <span className={cx("h-2 w-2 rounded-full", dot[t])} />
              <span className="num">{n}</span>
            </span>
          ))}
        </span>
        {list.length > 2 && (
          <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="ml-auto inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-accent hover:underline">
            {expanded ? "Show less" : `Show all ${list.length}`}
            <ChevronDown size={14} className={cx("transition", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      <ul className="divide-y divide-line">
        {shown.map((a) => (
          <li key={a.key} className="rise flex items-center gap-3 py-2.5 pr-2.5 pl-4">
            <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", tones[a.tone])}>{a.icon}</span>
            <div className="min-w-0 flex-1 text-body-sm leading-snug">{a.text}</div>
            {a.action}
            {a.onDismiss && (
              <button onClick={a.onDismiss} aria-label="Dismiss" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-faint hover:bg-ink/5 hover:text-ink">
                <X size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** First visit: three ways to get courses in, instead of an empty dashboard. */
function Welcome({ onSync, onImport, onAdd }: { onSync: () => void; onImport: () => void; onAdd: () => void }) {
  const steps = [
    { icon: <RefreshCw size={18} />, title: "Sync from StudIP", body: "Copy your StuMS grades page and paste it. Finished modules and grades come in by module code.", cta: "Start sync", run: onSync, primary: true },
    { icon: <Upload size={18} />, title: "Import a file", body: "Load a CSV file, for example one exported from this tracker or saved from Excel.", cta: "Choose file", run: onImport },
    { icon: <Plus size={18} />, title: "Add courses yourself", body: "Search the module catalog by code, title or lecturer.", cta: "Add a course", run: onAdd },
  ];
  return (
    <section className="card relative overflow-hidden p-5 sm:p-7" aria-labelledby="welcome-title">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_220px]">
        <div>
          <div className="eyebrow mb-1">Welcome</div>
          <h2 id="welcome-title" className="font-serif text-display font-semibold tracking-tight">
            Let's map out your master's
          </h2>
          <p className="mt-2 max-w-xl text-body-sm text-muted">
            Track all 120 ECTS, your GPA and what's left to graduate. Everything stays in this browser. Pick how to start:
          </p>
        </div>
        <WelcomeArt />
      </div>
      <ol className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((st, i) => (
          <li key={st.title} className="flex flex-col rounded-2xl border border-line bg-panel-2 p-4">
            <div className="flex items-center gap-2">
              <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-caption font-bold text-accent">{i + 1}</span>
              <span className="text-accent">{st.icon}</span>
            </div>
            <h3 className="mt-3 font-semibold">{st.title}</h3>
            <p className="mt-1 flex-1 text-meta text-muted">{st.body}</p>
            <Button size="sm" variant={st.primary ? "primary" : "outline"} className="mt-3 self-start" onClick={st.run}>
              {st.cta}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WelcomeArt() {
  return (
    <svg viewBox="0 0 220 150" className="mx-auto hidden w-full max-w-[220px] md:block" aria-hidden="true">
      <rect x="18" y="26" width="150" height="104" rx="16" fill="var(--panel-2)" stroke="var(--line)" />
      <rect x="44" y="12" width="150" height="104" rx="16" fill="var(--panel)" stroke="var(--line-strong)" />
      <circle cx="88" cy="64" r="26" fill="none" stroke="var(--line)" strokeWidth="9" />
      <path d="M88 38a26 26 0 0 1 24 36" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" />
      <path d="M112 74a26 26 0 0 1-9 9" fill="none" stroke="var(--warn)" strokeWidth="9" strokeLinecap="round" />
      <rect x="128" y="44" width="48" height="7" rx="3.5" fill="var(--ink)" opacity="0.8" />
      <rect x="128" y="58" width="34" height="7" rx="3.5" fill="var(--ink)" opacity="0.25" />
      <rect x="128" y="76" width="44" height="10" rx="5" fill="var(--accent-soft)" />
      <path d="M176 112l14-8 14 8-14 8z" fill="var(--ink)" />
      <path d="M182 116v8c4 3 12 3 16 0v-8" fill="none" stroke="var(--ink)" strokeWidth="3" />
      <path d="M204 112v12" stroke="var(--warn)" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
        {cat.gpa && <span className="num whitespace-nowrap rounded-md bg-ink/5 px-1.5 py-0.5 text-caption font-semibold text-muted">⌀ {cat.gpa}</span>}
      </div>
      {req > 0 ? (
        <>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="num text-display leading-none font-semibold">{cat.completed}</span>
            <span className="num text-body-sm text-muted">/ {req} ECTS</span>
            {cat.remaining > 0 && <span className="ml-auto text-meta text-warn">{cat.remaining} unplanned</span>}
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
        <div className="mt-3 text-body-sm text-muted">
          <span className="num text-display-sm font-semibold text-ink">{cat.completed + cat.inProgress + cat.planned}</span> ECTS tracked
          {cat.excludedFromTotal ? ", not counted toward 120" : ""}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-meta text-muted">
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
