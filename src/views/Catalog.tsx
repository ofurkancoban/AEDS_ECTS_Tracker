import { Check, ChevronDown, Clock, ExternalLink, GraduationCap, Languages, Plus, Search, SlidersHorizontal, Sparkles, User } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Badge, CategoryDot, CategoryTag, Empty, cx } from "../components/ui";
import { codeOf, offeringPattern, resolveCode, type CatalogCourse } from "../lib/catalog";
import { takeCatalogFocus, useCatalogFocus } from "../lib/catalogFocus";
import { CATEGORIES, PRIOR_KNOWLEDGE } from "../lib/constants";
import { useRatings, type Ratings } from "../lib/ratings";
import { allSemesters, planningSemester } from "../lib/semesters";
import type { CategoryId } from "../lib/types";
import { useTracker } from "../state";

type Sort = "code" | "title" | "easiest" | "hardest" | "recent";
type Offering = "any" | "WiSe" | "SoSe" | "both";

const avg = (r: Ratings, code: string) => (r[code] && r[code].count > 0 ? r[code].sum / r[code].count : null);

export function Catalog() {
  const { catalog, courses, openAdd } = useTracker();
  const ratings = useRatings();
  const plan = planningSemester();
  // Opened from the assistant on one module: search for its code.
  const [q, setQ] = useState(() => takeCatalogFocus() || "");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [language, setLanguage] = useState("any");
  const [offering, setOffering] = useState<Offering>("any");
  const [openNow, setOpenNow] = useState(false);
  const [hideTaken, setHideTaken] = useState(false);
  const [compulsoryOnly, setCompulsoryOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("code");
  const [showFilters, setShowFilters] = useState(false);
  useCatalogFocus(
    useCallback((code: string) => {
      setQ(code);
      setCat("all");
      setLanguage("any");
      setOffering("any");
      setOpenNow(false);
      setHideTaken(false);
      setCompulsoryOnly(false);
    }, []),
  );

  const taken = useMemo(() => {
    const m = new Map<string, string>();
    courses.forEach((c) => {
      if (c.hypothetical) return;
      const rc = resolveCode(c.name, catalog) || codeOf(c.name);
      if (rc) m.set(rc, c.status);
    });
    return m;
  }, [courses, catalog]);

  const languages = useMemo(() => [...new Set(catalog.courses.map((c) => c.language || "English"))].sort(), [catalog]);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const order = allSemesters();
    const lastIdx = (c: CatalogCourse) => {
      const l = catalog.offered[c.code];
      return l && l.length ? order.indexOf(l[l.length - 1]) : -1;
    };
    const out = catalog.courses.filter((c) => {
      if (cat !== "all" && c.category !== cat) return false;
      if (language !== "any" && (c.language || "English") !== language) return false;
      if (offering !== "any" && offeringPattern(c.code, catalog)?.pattern !== offering) return false;
      if (openNow && !catalog.offered[c.code]?.includes(plan)) return false;
      if (hideTaken && taken.has(c.code)) return false;
      if (compulsoryOnly && !c.compulsory) return false;
      if (words.length) {
        const hay = `${c.code} ${c.name} ${c.professor} ${c.examType} ${c.skills}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const by: Record<Sort, (a: CatalogCourse, b: CatalogCourse) => number> = {
      code: (a, b) => a.code.localeCompare(b.code),
      title: (a, b) => a.name.localeCompare(b.name),
      easiest: (a, b) => (avg(ratings, a.code) ?? 9) - (avg(ratings, b.code) ?? 9),
      hardest: (a, b) => (avg(ratings, b.code) ?? -1) - (avg(ratings, a.code) ?? -1),
      recent: (a, b) => lastIdx(b) - lastIdx(a),
    };
    return out.sort(by[sort]);
  }, [catalog, q, cat, language, offering, openNow, hideTaken, compulsoryOnly, sort, ratings, taken, plan]);

  const activeFilters = [language !== "any", offering !== "any", openNow, hideTaken, compulsoryOnly].filter(Boolean).length;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, title, lecturer, exam or learning outcomes" className="field h-10 w-full !pl-10" />
        </div>
        <div className="flex gap-2">
          <select className="field h-10 flex-1 sm:flex-none" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="code">Sort: code</option>
            <option value="title">Sort: title</option>
            <option value="easiest">Sort: easiest first</option>
            <option value="hardest">Sort: hardest first</option>
            <option value="recent">Sort: most recently offered</option>
          </select>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cx(
              "inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-body-sm font-medium transition",
              showFilters || activeFilters ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-ink",
            )}
          >
            <SlidersHorizontal size={15} /> Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...CATEGORIES.filter((c) => c.id !== "additional").map((c) => c.id)] as const).map((id) => (
          <button
            key={id}
            onClick={() => setCat(id)}
            className={cx(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-meta font-medium transition",
              cat === id ? "border-ink bg-ink text-paper" : "border-line bg-panel text-muted hover:text-ink",
            )}
          >
            {id !== "all" && <CategoryDot id={id} />}
            {id === "all" ? "All" : CATEGORIES.find((c) => c.id === id)!.name}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="rise card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Language</span>
            <select className="field" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="any">Any</option>
              {languages.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Usually offered</span>
            <select className="field" value={offering} onChange={(e) => setOffering(e.target.value as Offering)}>
              <option value="any">Any term</option>
              <option value="WiSe">Winter only</option>
              <option value="SoSe">Summer only</option>
              <option value="both">Both terms</option>
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="eyebrow">Show</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-body-sm">
              <Check2 checked={openNow} onChange={setOpenNow}>
                Open in {plan}
              </Check2>
              <Check2 checked={hideTaken} onChange={setHideTaken}>
                Hide modules I already have
              </Check2>
              <Check2 checked={compulsoryOnly} onChange={setCompulsoryOnly}>
                Compulsory only
              </Check2>
            </div>
          </div>
        </div>
      )}

      <div className="text-meta text-muted">
        {list.length} of {catalog.courses.length} modules
      </div>

      {list.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((c) => (
            <ModuleCard key={c.code} c={c} status={taken.get(c.code)} rating={avg(ratings, c.code)} votes={ratings[c.code]?.count || 0} openNow={!!catalog.offered[c.code]?.includes(plan)} plan={plan} onAdd={() => openAdd({ name: c.label, category: c.category })} />
          ))}
        </div>
      ) : (
        <Empty icon={<Search size={22} />} title="No modules match">
          Try fewer filters or a shorter search.
        </Empty>
      )}
    </div>
  );
}

function Check2({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)]" />
      {children}
    </label>
  );
}

function ModuleCard({
  c,
  status,
  rating,
  votes,
  openNow,
  plan,
  onAdd,
}: {
  c: CatalogCourse;
  status?: string;
  rating: number | null;
  votes: number;
  openNow: boolean;
  plan: string;
  onAdd: () => void;
}) {
  const { catalog } = useTracker();
  const [more, setMore] = useState(false);
  const pattern = offeringPattern(c.code, catalog);
  const offered = catalog.offered[c.code] || [];
  const prior = PRIOR_KNOWLEDGE[c.code];
  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="num text-meta font-semibold text-muted">{c.code}</span>
            <CategoryTag id={c.category} />
            {c.compulsory && <Badge tone="accent">compulsory</Badge>}
            {openNow && <Badge tone="warn">open {plan}</Badge>}
            {status && (
              <Badge>
                <Check size={10} /> {status === "in-progress" ? "in progress" : status}
              </Badge>
            )}
          </div>
          <h3 className="mt-1.5 font-serif text-title-sm leading-snug font-semibold">{c.name}</h3>
        </div>
        <button
          onClick={onAdd}
          aria-label={`Add ${c.code}`}
          title="Add to my courses"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent-soft text-accent transition hover:brightness-95"
        >
          <Plus size={17} />
        </button>
      </div>

      <div className="mt-3 grid gap-1.5 text-meta text-muted">
        {c.professor && <Row icon={<User size={13} />}>{c.professor}</Row>}
        <Row icon={<Languages size={13} />}>
          {c.language || "English"} · <span className="num">{c.ects} ECTS</span>
          {c.contactHours ? ` · ${c.contactHours} h contact` : ""}
        </Row>
        {c.examType && <Row icon={<GraduationCap size={13} />}>{c.examType}</Row>}
        {pattern && (
          <Row icon={<Clock size={13} />}>
            {pattern.pattern === "both" ? "Winter and summer" : pattern.pattern === "WiSe" ? "Winter only" : "Summer only"} · last {pattern.last}
          </Row>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Difficulty value={rating} votes={votes} />
        <span className="flex-1" />
        <button onClick={() => setMore((m) => !m)} className="inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-muted hover:text-ink">
          Details <ChevronDown size={14} className={cx("transition", more && "rotate-180")} />
        </button>
      </div>

      {more && (
        <div className="rise mt-3 grid gap-3 border-t border-line pt-3 text-meta">
          {prior && <p className="rounded-lg bg-ink/5 px-2.5 py-1.5 text-muted">{prior}</p>}
          {offered.length > 0 && (
            <div>
              <div className="eyebrow mb-1.5">Offered in</div>
              <div className="flex flex-wrap gap-1">
                {offered.map((s) => (
                  <span key={s} className="num rounded-md bg-ink/5 px-1.5 py-0.5 text-caption text-muted">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {c.skills && <p className="leading-relaxed text-muted">{c.skills}</p>}
          {c.link && (
            <a href={c.link} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 font-medium text-accent hover:underline">
              Module description <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-faint">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function Difficulty({ value, votes }: { value: number | null; votes: number }) {
  if (value === null)
    return (
      <span className="inline-flex items-center gap-1.5 text-meta text-faint">
        <Sparkles size={12} /> No difficulty votes yet
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 text-meta text-muted" title="Anonymous ratings from other students using this app">
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={cx("h-2 w-2 rounded-full", n <= Math.round(value) ? "bg-warn" : "bg-line-strong")} />
        ))}
      </span>
      <span className="num">{value.toFixed(1)}</span>
      <span>
        ({votes} {votes === 1 ? "vote" : "votes"})
      </span>
    </span>
  );
}
