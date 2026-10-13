// Touch support for the app's HTML5 drag and drop. Mobile browsers don't fire
// dragstart/dragover/drop from touch, so a long press on a [draggable] element
// starts a synthetic drag that dispatches those same events, and the existing
// drop zones work unchanged.

const LONG_PRESS_MS = 320;
const MOVE_TOLERANCE = 8;

interface Session {
  source: HTMLElement;
  data: DataTransfer;
  ghost: HTMLElement;
  offsetX: number;
  offsetY: number;
  over: Element | null;
  accepted: boolean;
}

function fire(type: string, target: Element, data: DataTransfer, x: number, y: number, related?: Element | null): boolean {
  const ev = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    dataTransfer: data,
    clientX: x,
    clientY: y,
    relatedTarget: related ?? null,
  });
  return target.dispatchEvent(ev);
}

export function installTouchDrag(): () => void {
  if (typeof window === "undefined" || typeof DataTransfer === "undefined") return () => {};
  try {
    new DataTransfer();
  } catch {
    return () => {};
  }

  let timer: number | undefined;
  let start: { x: number; y: number; el: HTMLElement } | null = null;
  let s: Session | null = null;
  let suppressClick = false;

  const cancelPending = () => {
    window.clearTimeout(timer);
    start = null;
  };

  const begin = () => {
    if (!start) return;
    const { el, x, y } = start;
    start = null;
    const data = new DataTransfer();
    fire("dragstart", el, data, x, y);
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add("touch-drag-ghost");
    ghost.style.width = rect.width + "px";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    document.body.appendChild(ghost);
    el.classList.add("touch-dragging");
    s = { source: el, data, ghost, offsetX: x - rect.left, offsetY: y - rect.top, over: null, accepted: false };
    suppressClick = true;
    navigator.vibrate?.(12);
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || s) return;
    const el = (e.target as Element).closest?.('[draggable="true"]') as HTMLElement | null;
    if (!el) return;
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY, el };
    timer = window.setTimeout(begin, LONG_PRESS_MS);
  };

  const onMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    if (start && !s) {
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > MOVE_TOLERANCE) cancelPending();
      return;
    }
    if (!s) return;
    e.preventDefault();
    s.ghost.style.left = t.clientX - s.offsetX + "px";
    s.ghost.style.top = t.clientY - s.offsetY + "px";
    const under = document.elementFromPoint(t.clientX, t.clientY);
    if (under !== s.over) {
      if (s.over) fire("dragleave", s.over, s.data, t.clientX, t.clientY, under);
      if (under) fire("dragenter", under, s.data, t.clientX, t.clientY, s.over);
      s.over = under;
    }
    // dispatchEvent returns false when a handler called preventDefault, i.e. the target accepts the drop.
    s.accepted = under ? !fire("dragover", under, s.data, t.clientX, t.clientY) : false;
    // Scroll near the screen edges so far-away targets are reachable.
    const edge = 70;
    if (t.clientY < edge) window.scrollBy(0, -12);
    else if (t.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
    const row = under?.closest(".overflow-x-auto");
    if (row) {
      const r = row.getBoundingClientRect();
      if (t.clientX < r.left + edge) row.scrollLeft -= 12;
      else if (t.clientX > r.right - edge) row.scrollLeft += 12;
    }
  };

  const onEnd = (e: TouchEvent) => {
    cancelPending();
    if (!s) return;
    const t = e.changedTouches[0];
    const x = t?.clientX ?? 0;
    const y = t?.clientY ?? 0;
    if (s.over && s.accepted) fire("drop", s.over, s.data, x, y);
    else if (s.over) fire("dragleave", s.over, s.data, x, y, null);
    fire("dragend", s.source, s.data, x, y);
    s.source.classList.remove("touch-dragging");
    s.ghost.remove();
    s = null;
    window.setTimeout(() => (suppressClick = false), 50);
  };

  const onClick = (e: MouseEvent) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onContext = (e: Event) => {
    if (start || s) e.preventDefault();
  };
  // Some mobile browsers start their own native drag on long press; the synthetic one wins.
  const onNativeDrag = (e: DragEvent) => {
    if (e.isTrusted && (start || s)) e.preventDefault();
  };

  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);
  document.addEventListener("touchcancel", onEnd);
  document.addEventListener("click", onClick, true);
  document.addEventListener("contextmenu", onContext);
  document.addEventListener("dragstart", onNativeDrag, true);
  return () => {
    document.removeEventListener("touchstart", onStart);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
    document.removeEventListener("touchcancel", onEnd);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("contextmenu", onContext);
    document.removeEventListener("dragstart", onNativeDrag, true);
  };
}
