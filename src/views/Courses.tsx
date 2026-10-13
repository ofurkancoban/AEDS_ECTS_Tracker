import { BookOpenCheck, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CourseRow } from "../components/CourseRow";
import { OpenPanel } from "../components/OpenPanel";
import { useCategoryDrop } from "../components/dnd";
import { Bar, CategoryDot, Empty, cx } from "../components/ui";
import type { CategoryStats } from "../lib/stats";
import type { Status } from "../lib/types";
import { useTracker } from "../state";

type Filter = "all" | Status;

export function Courses() {
  const { stats, courses, openAdd } = useTracker();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = query.trim().toLowerCase();
  const match = (name: string, status: Status) => (!q || name.toLowerCase().includes(q)) && (filter === "all" || filter === status);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: courses.length, planned: 0, "in-progress": 0, completed: 0 };
    courses.forEach((x) => (c[x.status] += 1));
    return c;
  }, [courses]);

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter your courses" className="field h-10 w-full !pl-10" />
        </div>
        <div className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1">
          {(["all", "completed", "in-progress", "planned"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cx(
                "h-8 shrink-0 cursor-pointer rounded-lg px-3 text-meta font-medium transition",
                filter === f ? "bg-ink text-paper" : "text-muted hover:text-ink",
              )}
            >
              {f === "all" ? "All" : f === "in-progress" ? "In progress" : f[0].toUpperCase() + f.slice(1)}
              <span className="num ml-1.5">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {courses.length === 0 && (
        <Empty icon={<BookOpenCheck size={22} />} title="No courses yet">
          Add your first course from the catalog, sync your grades from StudIP via the Data menu, or drag a module from the panel below.
        </Empty>
      )}

      <div className="grid grid-cols-1 gap-4">
        {stats.categories
          .filter((c) => !c.excludedFromTotal || c.items.length || courses.length)
          .map((c) => (
            <CategorySection key={c.id} cat={c} match={match} onAdd={() => openAdd({ category: c.id })} filtering={!!q || filter !== "all"} />
          ))}
      </div>

      <OpenPanel />
    </div>
  );
}

function CategorySection({
  cat,
  match,
  onAdd,
  filtering,
}: {
  cat: CategoryStats;
  match: (name: string, status: Status) => boolean;
  onAdd: () => void;
  filtering: boolean;
}) {
  const drop = useCategoryDrop(cat.id);
  const items = cat.items.filter((c) => match(c.name, c.status));
  if (filtering && !items.length) return null;
  const req = cat.required;
  const pct = (v: number) => (req ? (v / req) * 100 : 0);
  return (
    <section id={`cat-${cat.id}`} {...drop.props} className={cx("card scroll-mt-24 p-2 transition", drop.over && "drop-target")}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pt-2.5 pb-3">
        <div className="flex min-w-0 flex-1 basis-[200px] items-center gap-2.5">
          <CategoryDot id={cat.id} size={11} />
          <h3 className="truncate font-serif text-title font-semibold">{cat.name}</h3>
          {cat.gpa && <span className="num whitespace-nowrap rounded-md bg-ink/5 px-1.5 py-0.5 text-caption font-semibold text-muted">⌀ {cat.gpa}</span>}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {req > 0 ? (
            <div className="flex w-40 flex-col gap-1">
              <div className="num text-right text-meta text-muted">
                <span className="font-semibold text-ink">{cat.completed}</span> / {req} ECTS
              </div>
              <Bar
                height={6}
                segments={[
                  { value: pct(cat.completed), color: `var(--cat-${cat.id})` },
                  { value: pct(cat.inProgress), color: "var(--warn)" },
                  { value: pct(cat.planned), color: "var(--muted)", striped: true },
                ]}
              />
            </div>
          ) : (
            <span className="num text-meta text-muted">{cat.completed + cat.inProgress + cat.planned} ECTS</span>
          )}
          <button
            onClick={onAdd}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-accent-soft text-accent transition hover:brightness-95"
            aria-label={`Add course to ${cat.name}`}
            title={`Add to ${cat.name}`}
          >
            <Plus size={16} />
          </button>
        </div>
      </header>
      {items.length ? (
        <div className="density-gap grid grid-cols-1 gap-0.5">
          {items.map((c) => (
            <CourseRow key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <div className="mx-1 mb-1 rounded-xl border border-dashed border-line px-4 py-4 text-center text-meta text-faint">
          {cat.id === "specialization"
            ? "Drop an elective here, or add one. Economics, empirical and data science electives can count here too."
            : cat.id === "further" || cat.id === "additional"
              ? "Drag a course here to count it separately."
              : "No courses yet."}
        </div>
      )}
    </section>
  );
}
