import { AlertTriangle, ArrowLeft, Check, CornerDownLeft, Info, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addablePool,
  allowedSemesters,
  catalogCourse,
  codeOf,
  defaultSemesterFor,
  offeringPattern,
  resolveCode,
  semesterOptionsFor,
} from "../lib/catalog";
import { CATEGORIES, GRADES, MAX_ATTEMPTS, PRIOR_KNOWLEDGE, STATUSES, STATUS_LABEL, defaultEctsFor } from "../lib/constants";
import { newCourse } from "../lib/io";
import { difficultyLabel, useRatings } from "../lib/ratings";
import { allSemesters, planningSemester } from "../lib/semesters";
import type { CategoryId, Status } from "../lib/types";
import { useTracker } from "../state";
import { Badge, Button, CategoryDot, CategoryTag, cx, useInertBackground } from "./ui";

interface Entry {
  label: string;
  code: string | null;
  title: string;
  category: CategoryId;
  ects: number;
}

export function AddCourseDialog() {
  const { addOpen, closeAdd, addPreset } = useTracker();
  if (!addOpen) return null;
  return createPortal(<Palette key={JSON.stringify(addPreset)} onClose={closeAdd} />, document.body);
}

function Palette({ onClose }: { onClose: () => void }) {
  const { catalog, courses, addPreset } = useTracker();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategoryId | "all">(addPreset?.category || "all");
  const [picked, setPicked] = useState<Entry | null>(() => {
    if (!addPreset?.name) return null;
    const code = codeOf(addPreset.name);
    const c = catalogCourse(code, catalog);
    return {
      label: addPreset.name,
      code,
      title: c?.name || addPreset.name,
      category: addPreset.category || c?.category || "specialization",
      ects: c?.ects || 6,
    };
  });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const plan = planningSemester();
  useInertBackground(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const taken = useMemo(() => {
    const s = new Set<string>();
    courses.forEach((c) => {
      if (c.hypothetical) return;
      const rc = resolveCode(c.name, catalog) || codeOf(c.name);
      if (rc) s.add(rc);
    });
    return s;
  }, [courses, catalog]);

  const entries = useMemo<Entry[]>(() => {
    const seen = new Set<string>();
    const out: Entry[] = [];
    const pushPool = (id: CategoryId) =>
      addablePool(id, catalog).forEach((label) => {
        if (seen.has(label)) return;
        seen.add(label);
        // resolveCode also finds codes without digits (the thesis module "mam").
        const code = codeOf(label) || resolveCode(label, catalog);
        const c = catalogCourse(code, catalog);
        out.push({ label, code, title: c?.name || label.replace(/^[a-z]+\d+\s*-\s*/i, ""), category: c?.category || id, ects: c?.ects || defaultEctsFor(id) });
      });
    (["economics", "empirical", "datascience", "specialization", "further", "thesis"] as CategoryId[]).forEach(pushPool);
    return out;
  }, [catalog]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const pool = filter === "all" ? entries : entries.filter((e) => addablePool(filter, catalog).includes(e.label));
    if (!q) return pool;
    const words = q.split(/\s+/);
    return pool
      .map((e) => {
        const hay = `${e.label} ${catalogCourse(e.code, catalog)?.professor || ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const score = (e.code === q ? 0 : e.code?.startsWith(q) ? 1 : e.title.toLowerCase().startsWith(q) ? 2 : 3) * 1000 + e.label.length;
        return { e, score };
      })
      .filter((x): x is { e: Entry; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.e);
  }, [entries, filter, q, catalog]);

  useEffect(() => setActive(0), [q, filter]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const custom = q.length > 2 && !results.some((r) => r.label.toLowerCase() === q);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const max = results.length + (custom ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(max - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < results.length) setPicked(results[active]);
      else if (custom) pickCustom();
    }
  };

  const pickCustom = () =>
    setPicked({
      label: query.trim(),
      code: null,
      title: query.trim(),
      category: filter === "all" ? "additional" : filter,
      ects: filter === "thesis" ? 30 : 6,
    });

  return (
    <div className="fade fixed inset-0 z-[9800] flex items-start justify-center bg-[#14120e]/50 backdrop-blur-[2px] sm:p-6 sm:pt-[10vh]" onMouseDown={onClose}>
      <div
        className="pop flex h-full w-full max-w-2xl flex-col overflow-hidden border-line bg-panel shadow-[var(--shadow-lg)] sm:h-auto sm:max-h-[78vh] sm:rounded-3xl sm:border"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add a course"
      >
        {picked ? (
          <Configure entry={picked} onBack={() => setPicked(null)} onDone={onClose} taken={taken} />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-5 pt-[calc(14px+env(safe-area-inset-top))] pb-3.5 sm:pt-4">
              <Search size={18} className="text-faint" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search by code, title or lecturer…"
                className="h-8 min-w-0 flex-1 bg-transparent text-title-sm outline-none placeholder:text-faint"
              />
              <button onClick={onClose} className="cursor-pointer rounded-lg border border-line px-2 py-0.5 text-caption text-muted hover:text-ink">
                Esc
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
              {(["all", ...CATEGORIES.map((c) => c.id)] as const).map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    setFilter(id);
                    inputRef.current?.focus();
                  }}
                  className={cx(
                    "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-meta font-medium transition",
                    filter === id ? "bg-ink text-paper" : "text-muted hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  {id !== "all" && <CategoryDot id={id} />}
                  {id === "all" ? "All" : CATEGORIES.find((c) => c.id === id)!.name}
                </button>
              ))}
            </div>
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
              {results.map((e, i) => {
                const isTaken = !!e.code && taken.has(e.code);
                const openNow = !!e.code && !!catalog.offered[e.code]?.includes(plan);
                const compulsory = !!e.code && catalog.compulsory.includes(e.code);
                return (
                  <button
                    key={e.label}
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => setPicked(e)}
                    className={cx(
                      "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                      active === i ? "bg-accent-soft" : "hover:bg-ink/5",
                    )}
                  >
                    <span className="num w-14 shrink-0 text-meta font-semibold text-muted">{e.code || "·"}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate text-body", isTaken && "text-muted")}>{e.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <CategoryTag id={e.category} />
                        {compulsory && <Badge tone="accent">compulsory</Badge>}
                        {openNow && <Badge tone="warn">open {plan}</Badge>}
                        {isTaken && (
                          <Badge>
                            <Check size={10} /> added
                          </Badge>
                        )}
                      </span>
                    </span>
                    <span className="num shrink-0 text-meta text-muted">{e.ects} ECTS</span>
                    {active === i && <CornerDownLeft size={14} className="hidden shrink-0 text-accent sm:block" />}
                  </button>
                );
              })}
              {custom && (
                <button
                  data-idx={results.length}
                  onMouseMove={() => setActive(results.length)}
                  onClick={pickCustom}
                  className={cx(
                    "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                    active === results.length ? "bg-accent-soft" : "hover:bg-ink/5",
                  )}
                >
                  <span className="flex h-7 w-14 shrink-0 items-center text-accent">
                    <Plus size={16} />
                  </span>
                  <span className="text-body">
                    Add “<span className="font-semibold">{query.trim()}</span>” as a custom course
                  </span>
                </button>
              )}
              {!results.length && !custom && <div className="px-4 py-10 text-center text-body-sm text-muted">Type to search the AEDS catalog.</div>}
            </div>
            <div className="hidden items-center gap-4 border-t border-line bg-panel-2 px-5 py-2 text-caption text-faint sm:flex">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc close</span>
              <span className="ml-auto">{results.length} modules</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Configure({ entry, onBack, onDone, taken }: { entry: Entry; onBack: () => void; onDone: () => void; taken: Set<string> }) {
  const { catalog, courses, setCourses, whatIf, toast, addPreset } = useTracker();
  const ratings = useRatings();
  const allowedCats = useMemo(() => {
    if (!entry.code) return CATEGORIES.map((c) => c.id);
    return CATEGORIES.filter((c) => addablePool(c.id, catalog).includes(entry.label)).map((c) => c.id);
  }, [entry, catalog]);
  const [category, setCategory] = useState<CategoryId>(
    allowedCats.includes(entry.category) ? entry.category : allowedCats[0] || "additional",
  );
  const semOptions = entry.code ? semesterOptionsFor(entry.label, catalog) : allSemesters();
  const [semester, setSemester] = useState(addPreset?.semester || (entry.code ? defaultSemesterFor(entry.label, catalog) : planningSemester()));
  const [ects, setEcts] = useState(String(entry.ects || defaultEctsFor(category)));
  const [status, setStatus] = useState<Status>(whatIf ? "completed" : "planned");
  const [grade, setGrade] = useState("");
  const [hypothetical, setHypothetical] = useState(whatIf);

  const sameName = courses.filter((c) => !c.hypothetical && c.name.trim().toLowerCase() === entry.label.trim().toLowerCase()).length;
  const maxed = !hypothetical && sameName >= MAX_ATTEMPTS;
  const allowed = allowedSemesters(entry.code, catalog);
  const notOffered = !!allowed && semester !== "Unscheduled" && !allowed.includes(semester);
  const pattern = offeringPattern(entry.code, catalog);
  const prior = entry.code ? PRIOR_KNOWLEDGE[entry.code] : null;
  const difficulty = entry.code ? difficultyLabel(ratings[entry.code]) : null;
  const info = catalogCourse(entry.code, catalog);
  const ectsNum = parseFloat(ects);
  const invalid = !ectsNum || ectsNum <= 0 || maxed || notOffered;

  const submit = () => {
    if (invalid) return;
    const c = newCourse({
      category,
      name: entry.label,
      ects: ectsNum,
      semester: semester || "Unscheduled",
      status,
      grade: status === "completed" ? grade : "",
      hypothetical,
    });
    setCourses((cs) => [...cs, c]);
    toast({ message: `Added ${entry.code ? entry.code.toUpperCase() : entry.title} to ${CATEGORIES.find((x) => x.id === category)!.name}`, tone: "success" });
    onDone();
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3 sm:pt-3">
        <button onClick={onBack} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-ink/5 hover:text-ink" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="num text-caption font-semibold text-muted">{entry.code ? entry.code.toUpperCase() : "Custom course"}</div>
          <div className="truncate font-serif text-title font-semibold">{entry.title}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {(info?.professor || pattern || difficulty) && (
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-meta text-muted">
            {info?.professor && <span>{info.professor}</span>}
            {pattern && <span>{pattern.pattern === "both" ? "Every semester" : pattern.pattern === "WiSe" ? "Winter term only" : "Summer term only"}</span>}
            {info?.examType && <span>{info.examType}</span>}
            {difficulty && (
              <span className="inline-flex items-center gap-1">
                <Sparkles size={12} /> Difficulty {difficulty}
              </span>
            )}
          </div>
        )}

        <div className="eyebrow mb-2">Counts towards</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {allowedCats.map((id) => {
            const c = CATEGORIES.find((x) => x.id === id)!;
            return (
              <button
                key={id}
                onClick={() => setCategory(id)}
                className={cx(
                  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-body-sm font-medium transition",
                  category === id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <CategoryDot id={id} />
                {c.name}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Semester</span>
            <select className={cx("field", notOffered && "!border-danger")} value={semester} onChange={(e) => setSemester(e.target.value)}>
              {semOptions.map((s) => (
                <option key={s}>{s}</option>
              ))}
              <option>Unscheduled</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">ECTS</span>
            <input className="field num" type="number" min={1} max={30} value={ects} onChange={(e) => setEcts(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Status</span>
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {status === "completed" && (
          <div className="mt-4">
            <div className="eyebrow mb-2">Grade</div>
            <div className="flex flex-wrap gap-1.5">
              {GRADES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGrade(grade === g ? "" : g)}
                  className={cx(
                    "num h-9 w-12 cursor-pointer rounded-lg border text-body-sm font-semibold transition",
                    grade === g
                      ? g === "5.0"
                        ? "border-danger bg-danger text-white"
                        : "border-accent bg-accent text-white dark:text-paper"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        {whatIf && (
          <label className="mt-4 flex items-center gap-2 text-body-sm">
            <input type="checkbox" checked={hypothetical} onChange={(e) => setHypothetical(e.target.checked)} className="accent-[var(--warn)]" />
            What-if course (not saved to your real record, used for the projected GPA)
          </label>
        )}

        <div className="mt-4 space-y-2">
          {notOffered && (
            <Note tone="danger" icon={<AlertTriangle size={14} />}>
              Not offered in {semester} according to Stud.IP. Available: {allowed!.join(", ")}.
            </Note>
          )}
          {maxed && (
            <Note tone="danger" icon={<AlertTriangle size={14} />}>
              Maximum of {MAX_ATTEMPTS} attempts already reached for this course. It cannot be added again.
            </Note>
          )}
          {!maxed && sameName > 0 && (
            <Note tone="warn" icon={<Info size={14} />}>
              {sameName + 1 === MAX_ATTEMPTS
                ? `This will be attempt ${sameName + 1} of ${MAX_ATTEMPTS}, the final allowed attempt.`
                : `This will be attempt ${sameName + 1} of ${MAX_ATTEMPTS}.`}
            </Note>
          )}
          {!sameName && entry.code && taken.has(entry.code) && (
            <Note tone="warn" icon={<Info size={14} />}>
              You already have this course added. Saving will add it again (useful if retaking it).
            </Note>
          )}
          {prior && (
            <Note tone="muted" icon={<Info size={14} />}>
              {prior}
            </Note>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line bg-panel-2 px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={submit} disabled={invalid}>
          <Plus size={16} /> Add course
        </Button>
      </div>
    </>
  );
}

function Note({ tone, icon, children }: { tone: "warn" | "danger" | "muted"; icon: React.ReactNode; children: React.ReactNode }) {
  const t = { warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", muted: "bg-ink/5 text-muted" }[tone];
  return (
    <div className={cx("flex items-start gap-2 rounded-xl px-3 py-2 text-meta", t)}>
      <span className="mt-0.5">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
