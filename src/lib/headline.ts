// The progress headline climbs with the modules: 15 modules of 6 ECTS, then
// the 30 ECTS thesis. The stage changes every 3 completed modules (18 ECTS)
// up to 90; the headline itself counts all 120 ECTS. Thesis credits and
// credits beyond a category's requirement don't move the stage.
import { TOTAL_REQUIRED } from "./constants";
import type { Stats } from "./stats";

export type Stage = "ready" | "start" | "rhythm" | "progress" | "halfway" | "final" | "thesis" | "done" | "loose-ends";

export const MODULE_ECTS = 90; // 15 modules x 6 ECTS
export const STEP_ECTS = 18; // 3 modules

/** Rungs below the thesis: from this many completed module ECTS on, this lead. */
export const RUNGS: { from: number; stage: Stage; lead: string }[] = [
  { from: 6, stage: "start", lead: "Good start" }, // 1-2 modules
  { from: 18, stage: "rhythm", lead: "Getting going" }, // 3-5
  { from: 36, stage: "progress", lead: "On track" }, // 6-8
  { from: 54, stage: "halfway", lead: "Past halfway" }, // 9-11
  { from: 72, stage: "final", lead: "Final stretch" }, // 12-14
];

export interface Headline {
  stage: Stage;
  /** Lead-in before the numbers, e.g. "Final stretch". Empty when the headline is a full sentence. */
  lead: string;
  /** The full headline as plain text (also used for tests and screen readers). */
  text: string;
  moduleEcts: number;
}

/** Completed credits from modules that count toward the degree (capped per category, thesis excluded). */
export function moduleEcts(stats: Stats): number {
  return stats.categories.filter((c) => !c.excludedFromTotal && c.id !== "thesis").reduce((a, c) => a + c.counted.completed, 0);
}

export function headline(stats: Stats): Headline {
  const mods = moduleEcts(stats);
  const done = stats.completed;
  const of = `${done} / ${TOTAL_REQUIRED} ECTS`;
  const make = (stage: Stage, lead: string, text: string): Headline => ({ stage, lead, text, moduleEcts: mods });
  if (stats.graduationReady) return make("done", "", "Ready to graduate");
  if (done >= TOTAL_REQUIRED) return make("loose-ends", "", `${TOTAL_REQUIRED} ECTS reached`);
  if (mods >= MODULE_ECTS) return make("thesis", "", "Thesis time");
  if (done === 0) return make("ready", "", "Starting out");
  // Completed credits but no module yet (e.g. only the thesis): the first rung.
  const rung = [...RUNGS].reverse().find((r) => mods >= r.from) || RUNGS[0];
  return make(rung.stage, rung.lead, `${rung.lead}: ${of}`);
}
