import { Check, CircleDashed, CircleDot, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { CategoryDot, cx } from "../components/ui";
import { codeOf, labelForCode } from "../lib/catalog";
import { CATEGORIES, TOTAL_REQUIRED } from "../lib/constants";
import { isFail } from "../lib/stats";
import { useTracker } from "../state";

type Mark = "done" | "covered" | "short";

/** Graduation requirements: done (✓), covered by planned/running courses (◐), still short (○). */
export function Checklist() {
  const { stats, catalog, courses } = useTracker();
  const real = courses.filter((c) => !c.hypothetical);

  const ectsMark = (done: number, covered: number, req: number): Mark => (done >= req ? "done" : covered >= req ? "covered" : "short");
  const totalCovered = stats.completed + stats.inProgress + stats.planned;

  const compulsoryMark = (code: string): Mark => {
    if (stats.compulsoryDone.includes(code)) return "done";
    if (real.some((c) => !isFail(c) && codeOf(c.name) === code)) return "covered";
    return "short";
  };

  const marks: Mark[] = [];
  const total: Mark = ectsMark(stats.completed, totalCovered, TOTAL_REQUIRED);
  marks.push(total);

  const counted = stats.categories.filter((c) => !c.excludedFromTotal && c.required > 0);
  counted.forEach((c) => marks.push(ectsMark(c.completed, c.completed + c.inProgress + c.planned, c.required)));
  catalog.compulsory.forEach((code) => marks.push(compulsoryMark(code)));
  const gradesMark: Mark = stats.missingGrades.length ? "short" : "done";
  marks.push(gradesMark);

  const doneCount = marks.filter((m) => m === "done").length;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <div className="grid grid-cols-1 gap-4">
        <Group title="Credits">
          <Row mark={total} label={`${TOTAL_REQUIRED} ECTS in total`} detail={`${stats.completed} completed, ${totalCovered} incl. running and planned`} />
          {counted.map((c) => (
            <Row
              key={c.id}
              mark={ectsMark(c.completed, c.completed + c.inProgress + c.planned, c.required)}
              label={
                <span className="inline-flex items-center gap-2">
                  <CategoryDot id={c.id} /> {c.name}: {c.required} ECTS
                </span>
              }
              detail={`${c.completed} completed${c.inProgress ? `, ${c.inProgress} in progress` : ""}${c.planned ? `, ${c.planned} planned` : ""}`}
            />
          ))}
        </Group>
        <Group title="Compulsory modules">
          {CATEGORIES.map((cat) =>
            (catalog.compulsoryByCategory[cat.id] || []).map((code) => (
              <Row
                key={code}
                mark={compulsoryMark(code)}
                label={labelForCode(code, catalog)}
                detail={
                  <span className="inline-flex items-center gap-1.5">
                    <CategoryDot id={cat.id} /> {cat.name}
                  </span>
                }
              />
            )),
          )}
        </Group>
        <Group title="Records">
          <Row
            mark={gradesMark}
            label="Every completed course has a grade"
            detail={stats.missingGrades.length ? `Missing: ${stats.missingGrades.map((c) => c.name.split(" - ")[0]).join(", ")}` : "All set"}
          />
        </Group>
      </div>

      <aside className="card h-fit p-5 lg:sticky lg:top-24">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <ListChecks size={20} />
          </span>
          <div>
            <div className="eyebrow">Graduation readiness</div>
            <div className="num text-[22px] font-semibold">
              {doneCount} / {marks.length}
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(doneCount / marks.length) * 100}%` }} />
        </div>
        <div className="mt-5 grid gap-2 text-[12.5px] text-muted">
          <Legend mark="done">Done</Legend>
          <Legend mark="covered">Covered by running or planned courses</Legend>
          <Legend mark="short">Still open</Legend>
        </div>
        <p className="mt-5 text-[12px] leading-relaxed text-faint">
          This checklist mirrors the programme rules as the tracker understands them. Always confirm with the examination office before registering your thesis.
        </p>
      </aside>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-2">
      <h3 className="px-3 pt-2.5 pb-2 font-serif text-[17px] font-semibold">{title}</h3>
      <div className="grid grid-cols-1">{children}</div>
    </section>
  );
}

function Icon({ mark }: { mark: Mark }) {
  return (
    <span
      className={cx(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        mark === "done" ? "bg-accent text-white dark:text-paper" : mark === "covered" ? "bg-warn-soft text-warn" : "border border-line-strong text-faint",
      )}
    >
      {mark === "done" ? <Check size={14} strokeWidth={3} /> : mark === "covered" ? <CircleDot size={14} /> : <CircleDashed size={14} />}
    </span>
  );
}

function Row({ mark, label, detail }: { mark: Mark; label: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-ink/[0.025]">
      <Icon mark={mark} />
      <div className="min-w-0 flex-1">
        <div className={cx("text-[14px]", mark === "done" && "text-muted line-through decoration-line-strong")}>{label}</div>
        {detail && <div className="mt-0.5 text-[12px] text-muted">{detail}</div>}
      </div>
    </div>
  );
}

function Legend({ mark, children }: { mark: Mark; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon mark={mark} /> {children}
    </div>
  );
}
