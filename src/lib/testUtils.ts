// Shared helpers for the unit tests.
import { labelForCode } from "./catalog";
import { newCourse } from "./io";
import type { CategoryId, Course, Status } from "./types";

export function course(code: string, category: CategoryId, semester: string, status: Status, grade = "", extra: Partial<Course> = {}): Course {
  const name = code.includes(" ") ? code : labelForCode(code);
  return newCourse({ category, name, ects: category === "thesis" ? 30 : 6, semester, status, grade, ...extra });
}

export const STATS_OPTS = { targetGrade: "", graduationDate: "", lastBackupAt: null, backupReminderDismissed: false };
