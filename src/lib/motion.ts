// Small, quiet motion helpers. Everything here does nothing when the system
// asks for reduced motion, and nothing in tests or browsers without the APIs.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion } from "./preferences";

// ---- "this course just changed" ---------------------------------------------

const FLASH_MS = 1400;
const fresh = new Map<string, number>();

/**
 * Remembers courses that just appeared, so their row can light up once when
 * it mounts. A bulk import (more than a few at once) is not highlighted.
 */
export function noteNewCourses(prev: { id: string }[], next: { id: string }[]) {
  const before = new Set(prev.map((c) => c.id));
  const added = next.filter((c) => !before.has(c.id));
  if (!added.length || added.length > 3) return;
  const now = Date.now();
  added.forEach((c) => fresh.set(c.id, now));
}

export const isFresh = (id: string) => Date.now() - (fresh.get(id) ?? 0) < FLASH_MS;

/** True for a moment after the row appears as a new course or its `signature` changes. */
export function useFlash(id: string, signature: string): boolean {
  const [on, setOn] = useState(() => isFresh(id) && !prefersReducedMotion());
  const last = useRef(signature);
  useEffect(() => {
    if (last.current === signature) return;
    last.current = signature;
    if (!prefersReducedMotion()) setOn(true);
  }, [signature]);
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setOn(false), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [on, signature]);
  return on;
}

// ---- smooth reordering (FLIP) -------------------------------------------------

/**
 * Children marked data-flip-id glide from where they were to where they are
 * whenever `deps` change, instead of jumping (a course moved, removed, or
 * resorted). Pass deps that change only with the layout (see layoutKey), not
 * with every edit, so typing a grade never sets anything in motion. Positions are taken relative to the container, so scrolling in
 * between doesn't count as movement.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const before = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>("[data-flip-id]");
    // A glide still running would be measured mid-way: settle it first, so
    // positions are always the real ones.
    els.forEach((el) => el.getAnimations?.().forEach((a) => a.id === "flip" && a.cancel()));
    const origin = root.getBoundingClientRect();
    const now = new Map<string, { x: number; y: number }>();
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      now.set(el.dataset.flipId!, { x: r.left - origin.left, y: r.top - origin.top });
    });
    if (!prefersReducedMotion()) {
      els.forEach((el) => {
        const a = before.current.get(el.dataset.flipId!);
        const b = now.get(el.dataset.flipId!)!;
        if (!a || typeof el.animate !== "function") return;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { id: "flip", duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      });
    }
    before.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** What decides where course cards sit: their order, category, semester and status. */
export const layoutKey = (courses: { id: string; category: string; semester: string; status: string; hypothetical?: boolean }[]) =>
  courses.map((c) => `${c.id}:${c.category}:${c.semester}:${c.status}:${c.hypothetical ? 1 : 0}`).join("|");

// ---- a selection highlight that slides ---------------------------------------

export interface PillBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the highlight behind the active item of a group should be: the box of
 * `selector` inside `ref`, re-measured when `key` changes or the group resizes.
 * `animate` turns on only after the first placement, so it never slides in from 0.
 */
export function useSlidingPill(ref: RefObject<HTMLElement | null>, key: unknown, selector = '[data-active="true"]') {
  const [box, setBox] = useState<PillBox | null>(null);
  const [animate, setAnimate] = useState(false);
  const measure = useRef(() => {});
  measure.current = () => {
    const root = ref.current;
    const el = root?.querySelector<HTMLElement>(selector);
    if (!root || !el) return setBox(null);
    const rr = root.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const next = { x: er.left - rr.left + root.scrollLeft, y: er.top - rr.top + root.scrollTop, w: er.width, h: er.height };
    setBox((b) => (b && Math.abs(b.x - next.x) < 0.5 && Math.abs(b.y - next.y) < 0.5 && Math.abs(b.w - next.w) < 0.5 && Math.abs(b.h - next.h) < 0.5 ? b : next));
  };
  useLayoutEffect(() => measure.current(), [key]);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure.current());
    ro.observe(root);
    return () => ro.disconnect();
  }, [ref]);
  useEffect(() => {
    if (!box || animate) return;
    const f = requestAnimationFrame(() => setAnimate(!prefersReducedMotion()));
    return () => cancelAnimationFrame(f);
  }, [box, animate]);
  return { box, animate };
}

/** True once the component has painted, for things that should grow in from zero. */
export function useMounted(): boolean {
  const [ready, setReady] = useState(() => prefersReducedMotion() || typeof requestAnimationFrame === "undefined");
  useEffect(() => {
    if (ready) return;
    // Two frames: the zero state must be painted before the real one, or there is nothing to transition from.
    let f2 = 0;
    const f1 = requestAnimationFrame(() => (f2 = requestAnimationFrame(() => setReady(true))));
    return () => {
      cancelAnimationFrame(f1);
      cancelAnimationFrame(f2);
    };
  }, [ready]);
  return ready;
}
