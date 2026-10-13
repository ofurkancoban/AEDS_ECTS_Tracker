import { CalendarRange, ChevronDown, GripVertical, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { allowedSemesters } from "../lib/catalog";
import { openInSemester } from "../lib/planning";
import { allSemesters, currentSemester, planningSemester } from "../lib/semesters";
import { readFlag, writeFlag } from "../lib/storage";
import { useTracker } from "../state";
import { startNewCourseDrag } from "./dnd";
import { CategoryDot, cx } from "./ui";

/** Catalog modules running in a chosen semester that aren't on the student's list yet. */
export function OpenPanel() {
  const { courses, catalog, openAdd } = useTracker();
  const [collapsed, setCollapsed] = useState(() => readFlag("openPanelCollapsed") === "1");
  const [semester, setSemester] = useState(planningSemester());
  const options = useMemo(() => {
    const ds = allSemesters();
    const ci = ds.indexOf(currentSemester());
    const known = new Set<string>();
    Object.values(catalog.offered).forEach((l) => l.forEach((s) => known.add(s)));
    const codes = Object.keys(catalog.offered);
    // Upcoming terms the catalog predicts too, so students can look ahead.
    ds.slice(ci, ci + 3).forEach((s) => {
      if (codes.some((c) => allowedSemesters(c, catalog)?.includes(s))) known.add(s);
    });
    return ds.filter((s) => known.has(s) && ds.indexOf(s) >= ci - 2);
  }, [catalog]);
  const groups = useMemo(() => openInSemester(courses, semester, catalog), [courses, semester, catalog]);
  const total = groups.reduce((a, g) => a + g.open.length, 0);

  const toggle = () => {
    writeFlag("openPanelCollapsed", collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button onClick={toggle} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warn-soft text-warn">
            <CalendarRange size={18} />
          </span>
          <span className="min-w-0">
            <span className="block font-serif text-[17px] font-semibold">Open this semester</span>
            <span className="block text-[12.5px] text-muted">
              {total} module{total === 1 ? "" : "s"} you haven't added yet · drag one into a category or tap to add
            </span>
          </span>
          <ChevronDown size={18} className={cx("ml-auto shrink-0 text-faint transition", !collapsed && "rotate-180")} />
        </button>
        <select className="field h-9 !py-0 !text-[13px]" value={semester} onChange={(e) => setSemester(e.target.value)} aria-label="Semester">
          {(options.includes(semester) ? options : [semester, ...options]).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {!collapsed && (
        <div className="rise grid grid-cols-1 gap-4 border-t border-line px-5 py-4">
          {groups.length === 0 && <div className="text-[13.5px] text-muted">Nothing left to add for {semester}.</div>}
          {groups.map((g) => (
            <div key={g.id}>
              <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-muted">
                <CategoryDot id={g.id} /> {g.name}
              </div>
              <div className="flex flex-wrap gap-2">
                {g.open.map((o) => {
                  const [code, ...rest] = o.label.split(" - ");
                  return (
                    <button
                      key={o.label}
                      draggable
                      onDragStart={(e) => startNewCourseDrag(e, o.label, g.id, semester, o.compulsory)}
                      onClick={() => openAdd({ name: o.label, category: g.id, semester })}
                      title={o.compulsory ? `Compulsory: drag to ${g.name} only` : `Drag to ${g.name} or Specialization`}
                      className={cx(
                        "group/chip inline-flex max-w-full cursor-grab items-center gap-2 rounded-xl border bg-panel py-1.5 pr-2 pl-1.5 text-left text-[12.5px] transition hover:-translate-y-px hover:shadow-[var(--shadow)] active:cursor-grabbing",
                        o.compulsory ? "border-accent/40" : "border-line",
                      )}
                    >
                      <GripVertical size={13} className="shrink-0 text-faint" />
                      <span className="num shrink-0 font-semibold text-muted">{code}</span>
                      <span className="min-w-0 truncate">{rest.join(" - ")}</span>
                      {o.compulsory && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Compulsory" />}
                      <Plus size={13} className="shrink-0 text-faint group-hover/chip:text-accent" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
