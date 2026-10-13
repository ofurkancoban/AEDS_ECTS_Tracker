import { CalendarPlus, Check, Flag, GraduationCap, Info, Route, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, CategoryTag, Empty, SectionTitle, cx } from "../components/ui";
import { codeOf, resolveCode } from "../lib/catalog";
import { categoryById, MAX_ECTS_PER_SEMESTER } from "../lib/constants";
import { newCourse } from "../lib/io";
import { graduationPath, nextSemesterPlans, type PlanItem } from "../lib/planning";
import { useTracker } from "../state";

export function Planner() {
  const { courses, stats, catalog, setCourses, toast } = useTracker();
  const next = useMemo(() => nextSemesterPlans(courses, stats, catalog), [courses, stats, catalog]);
  const path = useMemo(() => graduationPath(courses, stats, catalog), [courses, stats, catalog]);
  const [option, setOption] = useState<"A" | "B">("A");

  const taken = useMemo(() => {
    const s = new Set<string>();
    courses.forEach((c) => {
      if (c.hypothetical) return;
      const rc = resolveCode(c.name, catalog) || codeOf(c.name);
      if (rc) s.add(rc);
    });
    return s;
  }, [courses, catalog]);

  const addItems = (items: PlanItem[], semester: string) => {
    const fresh = items.filter((i) => !i.already && !taken.has(codeOf(i.label) || i.label));
    if (!fresh.length) return;
    setCourses((cs) => [
      ...cs,
      ...fresh.map((i) => {
        const c = newCourse({ category: i.category || "specialization", name: i.label, ects: i.ects, semester });
        const home = catalog.byCode.get(codeOf(i.label) || "")?.category;
        if (home) c.homeCategory = home;
        return c;
      }),
    ]);
    toast({ message: `Planned ${fresh.length} course${fresh.length === 1 ? "" : "s"} for ${semester}`, tone: "success" });
  };

  if (stats.graduationReady || (!next && !path))
    return (
      <Empty icon={<GraduationCap size={22} />} title={stats.graduationReady ? "Nothing left to plan" : "No plan available"}>
        {stats.graduationReady
          ? "Every requirement is covered. Enjoy the finish line."
          : "Every ECTS target is already covered by completed, running or planned courses."}
      </Empty>
    );

  const items = next ? (option === "A" ? next.optionA : next.optionB) : [];
  const sum = items.reduce((a, i) => a + i.ects, 0);
  const sameAB = next && next.optionA.map((i) => i.label).join() === next.optionB.map((i) => i.label).join();

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      {next && (
        <section className="card p-5 lg:col-span-2 lg:self-start">
          <SectionTitle
            eyebrow="Next semester"
            title={next.semester}
            action={
              !sameAB && (
                <div className="flex rounded-xl border border-line p-0.5">
                  {(["A", "B"] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => setOption(o)}
                      className={cx(
                        "h-7 cursor-pointer rounded-lg px-3 text-[12.5px] font-semibold transition",
                        option === o ? "bg-ink text-paper" : "text-muted hover:text-ink",
                      )}
                    >
                      Option {o}
                    </button>
                  ))}
                </div>
              )
            }
          />
          <p className="mb-4 text-[13px] leading-relaxed text-muted">
            Up to {MAX_ECTS_PER_SEMESTER} ECTS, missing compulsory modules first, then electives for the categories that still need credits.
            {!sameAB && " Option B picks from the other end of the catalog for variety."}
          </p>
          {items.length ? (
            <PlanList items={items} taken={taken} />
          ) : (
            <p className="text-[13.5px] text-muted">Nothing suitable is offered in {next.semester} for your remaining requirements.</p>
          )}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <span className="num text-[13px] text-muted">
              <span className={cx("font-semibold", sum > MAX_ECTS_PER_SEMESTER ? "text-warn" : "text-ink")}>{sum}</span> ECTS
            </span>
            <Button variant="primary" size="sm" disabled={!items.some((i) => !i.already)} onClick={() => addItems(items, next.semester)}>
              <CalendarPlus size={15} /> Add to my plan
            </Button>
          </div>
        </section>
      )}

      {path && (
        <section className="card p-5 lg:col-span-3">
          <SectionTitle eyebrow="Simulation" title="Your path to graduation" />
          <p className="mb-5 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
            <Route size={15} className="mt-0.5 shrink-0" />
            One possible schedule for everything still unplanned, based on when modules have run before.
            {path.anyPredicted && " Courses marked likely aren't confirmed for that semester yet."}
          </p>
          <ol className="relative grid grid-cols-1 gap-5 border-l-2 border-dashed border-line pl-6">
            {path.terms.map((t, i) => {
              const last = i === path.terms.length - 1 && path.finished;
              const ects = t.items.reduce((a, x) => a + x.ects, 0);
              return (
                <li key={t.semester} className="relative">
                  <span
                    className={cx(
                      "absolute top-0.5 -left-[35px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-panel text-[10px] font-bold",
                      last ? "bg-accent text-white dark:text-paper" : "bg-ink text-paper",
                    )}
                  >
                    {last ? <Flag size={11} /> : i + 1}
                  </span>
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="font-serif text-[16px] font-semibold">{t.semester}</h4>
                    <span className="num text-[12px] text-muted">{ects} ECTS</span>
                    <button
                      onClick={() => addItems(t.items, t.semester)}
                      className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent-soft"
                    >
                      <CalendarPlus size={13} /> Plan
                    </button>
                  </div>
                  <PlanList items={t.items} taken={taken} />
                </li>
              );
            })}
          </ol>
          {!path.finished && (
            <p className="mt-5 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
              <Info size={14} className="mt-0.5 shrink-0" />
              Not every requirement fits within the next {path.terms.length} semesters with the current offering data.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function PlanList({ items, taken }: { items: PlanItem[]; taken: Set<string> }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5">
      {items.map((i) => {
        const [code, ...rest] = i.label.split(" - ");
        const isTaken = i.already || taken.has(codeOf(i.label) || "");
        return (
          <li
            key={i.label}
            className={cx("flex items-center gap-3 rounded-xl border px-3 py-2", isTaken ? "border-transparent bg-ink/[0.03]" : "border-line bg-panel")}
          >
            <span className="num w-12 shrink-0 text-[11.5px] font-semibold text-muted">{rest.length ? code : ""}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px]">{rest.length ? rest.join(" - ") : i.label}</span>
              <span className="mt-0.5 flex flex-wrap gap-1.5">
                {i.category && <CategoryTag id={i.category} />}
                {i.compulsory && <Badge tone="accent">compulsory</Badge>}
                {i.predicted && (
                  <Badge tone="warn" title="Predicted from the usual WiSe/SoSe rhythm">
                    <Wand2 size={10} /> likely
                  </Badge>
                )}
                {i.already && (
                  <Badge>
                    <Check size={10} /> already planned
                  </Badge>
                )}
              </span>
            </span>
            <span className="num shrink-0 text-[12px] text-muted" title={i.category ? categoryById(i.category).name : undefined}>
              {i.ects}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
