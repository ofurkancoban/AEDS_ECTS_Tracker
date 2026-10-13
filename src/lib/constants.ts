import type { Category, CategoryId, Status } from "./types";

export const CATEGORIES: Category[] = [
  { id: "economics", name: "Economics", short: "ECON", required: 36 },
  { id: "empirical", name: "Empirical Methods", short: "EMP", required: 18 },
  { id: "datascience", name: "Data Science", short: "DS", required: 18 },
  { id: "specialization", name: "Specialization", short: "SPEC", required: 18 },
  { id: "thesis", name: "Thesis", short: "THESIS", required: 30 },
  { id: "further", name: "Further modules", short: "FURTHER", required: 0 },
  { id: "additional", name: "Additional", short: "EXTRA", required: 0, excludedFromTotal: true },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export const TOTAL_REQUIRED = CATEGORIES.filter((c) => !c.excludedFromTotal).reduce((a, c) => a + c.required, 0);

export function categoryById(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

export const STATUSES: Status[] = ["planned", "in-progress", "completed"];

export const STATUS_LABEL: Record<Status, string> = {
  planned: "Planned",
  "in-progress": "In progress",
  completed: "Completed",
};

export const GRADES = ["1.0", "1.3", "1.7", "2.0", "2.3", "2.7", "3.0", "3.3", "3.7", "4.0", "5.0"];

export const MAX_ATTEMPTS = 3;
export const MAX_ECTS_PER_SEMESTER = 30;
export const LECTURE_WEEKS = 14;
export const BACKUP_REMINDER_DAYS = 7;

export const STORAGE_KEY = "ects-tracker-state";
export const VISITS_KEY = "ects-tracker-global-visits";

export function defaultEctsFor(category: CategoryId): number {
  return category === "thesis" ? 30 : 6;
}

// Hand-written hints shown when adding a course; keyed by module code so a
// catalog rename doesn't silently drop them.
export const PRIOR_KNOWLEDGE: Record<string, string> = {
  wir890: "Recommended prior knowledge: Microeconomics",
  wir893: "Recommended prior knowledge: Econometrics, Economic Growth",
  wir892: "Recommended prior knowledge: Microeconomics",
  wir760: "Recommended prior knowledge: Intermediate microeconomics",
  inf536: "Useful prior knowledge: Linear Algebra, Stochastics",
  inf530: "Prerequisite: Basic computer science knowledge",
  inf535: "Prerequisite: Basics of statistics",
  inf040: "Prerequisite: Basics of databases, Python programming and statistics",
  wir921: "Helpful: basic knowledge of business, management and supply chain concepts",
};
