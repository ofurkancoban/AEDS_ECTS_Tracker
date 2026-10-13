import type { Course } from "../lib/types";
export function openStuMSSyncModal(
  courses: Course[],
  setCourses: (fn: (prev: Course[]) => Course[]) => void,
  palette: Record<string, string>,
): void;
export function initAssistant(): void;
