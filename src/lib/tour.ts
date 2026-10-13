// The guided tour: when to offer it, how to start it from anywhere, and the
// geometry that places its card and arrow next to a highlighted element.
// Pure functions here so the layout rules can be tested without a browser.
import { readFlag, writeFlag } from "./storage";

export const TOUR_KEY = "ects-tour";
const START_EVENT = "ects-tour-start";

export const tourDone = () => readFlag(TOUR_KEY) === "done";
export const markTourDone = () => writeFlag(TOUR_KEY, "done");

/**
 * Offered on its own only to someone who has never opened the tracker
 * before: no courses, no tour yet and no "What's new" seen (anyone who has
 * seen one has used the app already).
 */
export function shouldInviteToTour(courseCount: number): boolean {
  let seenChangelog = false;
  try {
    seenChangelog = localStorage.getItem("changelog_seen") !== null;
  } catch {
    /* storage blocked: treat as a returning visitor, never nag */
    return false;
  }
  return courseCount === 0 && !seenChangelog && readFlag(TOUR_KEY) === null;
}

export function startTour() {
  window.dispatchEvent(new CustomEvent(START_EVENT));
}

export function onStartTour(fn: () => void): () => void {
  window.addEventListener(START_EVENT, fn);
  return () => window.removeEventListener(START_EVENT, fn);
}

// ---- geometry ---------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = "top" | "bottom" | "left" | "right";

/** Space kept between the card and the highlighted element, for the arrow. */
export const GAP = 56;
const MARGIN = 16;

export const pad = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.max(lo, v)));

/**
 * Where the step card goes. With no target it is centred. On a phone it docks
 * to the top or bottom edge, away from the target. Otherwise the first side
 * with room wins, in the order below, right, above, left, and the card is
 * aligned with the target but kept on screen.
 */
export function placeCard(target: Box | null, card: { w: number; h: number }, vp: { w: number; h: number }, phone: boolean): { x: number; y: number; side: Side | null } {
  if (!target) return { x: (vp.w - card.w) / 2, y: Math.max(MARGIN, (vp.h - card.h) / 2), side: null };
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  if (phone) {
    const x = (vp.w - card.w) / 2;
    // Target in the lower half: card at the top, arrow pointing down to it.
    return cy > vp.h / 2 ? { x, y: MARGIN + 8, side: "top" } : { x, y: vp.h - card.h - MARGIN - 72, side: "bottom" };
  }
  const room = {
    bottom: vp.h - (target.y + target.h) - GAP - MARGIN >= card.h,
    right: vp.w - (target.x + target.w) - GAP - MARGIN >= card.w,
    top: target.y - GAP - MARGIN >= card.h,
    left: target.x - GAP - MARGIN >= card.w,
  };
  const alignX = clamp(cx - card.w / 2, MARGIN, vp.w - card.w - MARGIN);
  const alignY = clamp(cy - card.h / 2, MARGIN, vp.h - card.h - MARGIN);
  if (room.bottom) return { x: alignX, y: target.y + target.h + GAP, side: "bottom" };
  if (room.right) return { x: target.x + target.w + GAP, y: alignY, side: "right" };
  if (room.top) return { x: alignX, y: target.y - GAP - card.h, side: "top" };
  if (room.left) return { x: target.x - GAP - card.w, y: alignY, side: "left" };
  // Nothing fits (a large target such as a whole view): the bottom-right corner.
  return { x: Math.max(MARGIN, vp.w - card.w - MARGIN), y: Math.max(MARGIN, vp.h - card.h - MARGIN), side: null };
}

/**
 * A curved arrow from the card's edge to the target's nearest edge, as an
 * SVG path, plus its end point. The curve bends sideways a little so it reads
 * as hand-drawn rather than as a ruler line.
 */
export function arrowPath(card: Box, target: Box): { d: string; end: { x: number; y: number } } | null {
  const tc = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  let start: { x: number; y: number };
  let end: { x: number; y: number };
  const vertical = card.y >= target.y + target.h || card.y + card.h <= target.y;
  if (vertical) {
    const below = card.y >= target.y + target.h;
    const x = clamp(tc.x, card.x + 28, card.x + card.w - 28);
    start = { x, y: below ? card.y - 6 : card.y + card.h + 6 };
    end = { x: clamp(x, target.x + 10, target.x + target.w - 10), y: below ? target.y + target.h + 8 : target.y - 8 };
  } else {
    const right = card.x >= target.x + target.w;
    if (!right && card.x + card.w > target.x) return null; // overlapping: no room for an arrow
    const y = clamp(tc.y, card.y + 24, card.y + card.h - 24);
    start = { x: right ? card.x - 6 : card.x + card.w + 6, y };
    end = { x: right ? target.x + target.w + 8 : target.x - 8, y: clamp(y, target.y + 8, target.y + target.h - 8) };
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 12) return null;
  // Control point: the midpoint pushed sideways by a fifth of the length.
  const bend = len * 0.22;
  const mx = (start.x + end.x) / 2 - (dy / len) * bend;
  const my = (start.y + end.y) / 2 + (dx / len) * bend;
  const r = (n: number) => Math.round(n * 10) / 10;
  return { d: `M ${r(start.x)} ${r(start.y)} Q ${r(mx)} ${r(my)} ${r(end.x)} ${r(end.y)}`, end };
}

/** The part of a box inside the viewport (a long view is only lit where it shows). */
export function visiblePart(b: Box, vp: { w: number; h: number }): Box {
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  return { x, y, w: Math.max(0, Math.min(vp.w, b.x + b.w) - x), h: Math.max(0, Math.min(vp.h, b.y + b.h) - y) };
}

/** On a phone, a target this large leaves no room for the card: show it folded. */
export const coversScreen = (b: Box, vp: { w: number; h: number }) => b.w * b.h > vp.w * vp.h * 0.6;

/** True when the box is at least partly inside the viewport. */
export const onScreen = (b: Box, vp: { w: number; h: number }) => b.w > 0 && b.h > 0 && b.y + b.h > 0 && b.y < vp.h && b.x + b.w > 0 && b.x < vp.w;
