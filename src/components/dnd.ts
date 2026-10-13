import { useState, type DragEvent } from "react";
import { defaultEctsFor } from "../lib/constants";
import { newCourse } from "../lib/io";
import type { CategoryId, Course } from "../lib/types";
import { useTracker } from "../state";
import { DRAG_COURSE, DRAG_NEW, moveTargets } from "./CourseRow";

/** Drag payload for a catalog course chip from the "open this semester" panel. */
export function startNewCourseDrag(e: DragEvent, label: string, home: CategoryId, semester: string, compulsory: boolean) {
  e.dataTransfer.setData(DRAG_NEW, JSON.stringify({ label, home, sem: semester }));
  e.dataTransfer.setData(`application/x-allow-${home}`, "1");
  if (!compulsory && home !== "thesis" && home !== "specialization") e.dataTransfer.setData("application/x-allow-specialization", "1");
  e.dataTransfer.effectAllowed = "copyMove";
}

/** Drop zone for a category: accepts moves of existing courses and new catalog chips. */
export function useCategoryDrop(category: CategoryId) {
  const { setCourses, courses, toast } = useTracker();
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(`application/x-allow-${category}`);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        if (!over) setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        const raw = e.dataTransfer.getData(DRAG_NEW);
        if (raw) {
          let p: { label: string; home: CategoryId; sem: string } | null = null;
          try {
            p = JSON.parse(raw);
          } catch {
            p = null;
          }
          if (!p || !p.label) return;
          const c = newCourse({ category, name: p.label, ects: defaultEctsFor(p.home || category), semester: p.sem });
          c.homeCategory = p.home || category;
          setCourses((cs) => [...cs, c]);
          toast({ message: `Added ${p.label.split(" - ")[0].toUpperCase()} as planned`, tone: "success" });
          return;
        }
        const id = e.dataTransfer.getData(DRAG_COURSE);
        const target = courses.find((c: Course) => c.id === id);
        if (target && moveTargets(target).includes(category)) {
          setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, category } : c)));
        }
      },
    },
  };
}

/** Drop zone for a semester column: moves an existing course to that semester. */
export function useSemesterDrop(semester: string) {
  const { updateCourse } = useTracker();
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (e.dataTransfer.types.includes(DRAG_NEW)) return;
        e.preventDefault();
        if (!over) setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_COURSE);
        if (!id) return;
        e.preventDefault();
        updateCourse(id, { semester });
      },
    },
  };
}
