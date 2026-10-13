// Credits beyond a category's requirement don't count toward the 120 ECTS.
// For each over-full category this finds one course that could be moved to a
// category that still has room (the same moves the drag and drop allows).
import type { Catalog } from "./catalog";
import { codeOf, resolveCode } from "./catalog";
import type { Stats } from "./stats";
import { isFail } from "./stats";
import type { CategoryId, Course } from "./types";

export interface OverflowNote {
  category: CategoryId;
  overflow: number;
  move: { course: Course; to: CategoryId } | null;
}

/** Same rule as the course menu: moved courses can only go home; others to Specialization, Further or Additional. */
export function allowedMoves(c: Course): CategoryId[] {
  if (c.homeCategory && c.category !== c.homeCategory) return [c.homeCategory];
  return (["specialization", "further", "additional"] as CategoryId[]).filter((x) => x !== c.category);
}

const ORDER: Record<Course["status"], number> = { completed: 0, "in-progress": 1, planned: 2 };

export function overflowNotes(courses: Course[], stats: Stats, catalog: Catalog): OverflowNote[] {
  const room = new Map(stats.categories.filter((c) => !c.excludedFromTotal).map((c) => [c.id, c.remaining]));
  return stats.categories
    .filter((c) => !c.excludedFromTotal && c.overflow > 0)
    .map((cat) => {
      const candidates = courses
        .filter((c) => c.category === cat.id && !c.hypothetical && !isFail(c))
        .filter((c) => {
          const code = resolveCode(c.name, catalog) || codeOf(c.name);
          return !(code && catalog.compulsory.includes(code)) && c.category !== "thesis";
        })
        // A course that fits the overflow exactly first, completed before planned.
        .sort((a, b) => Number(a.ects !== cat.overflow) - Number(b.ects !== cat.overflow) || ORDER[a.status] - ORDER[b.status]);
      for (const c of candidates) {
        const to = allowedMoves(c).find((t) => (room.get(t) ?? 0) >= c.ects);
        if (to) return { category: cat.id, overflow: cat.overflow, move: { course: c, to } };
      }
      return { category: cat.id, overflow: cat.overflow, move: null };
    });
}
