// The interactive first-run tour. A spotlight glides from element to element,
// a hand-drawn arrow points from the step card to what it explains, and
// "Try it" steps wait for the student to actually do the thing (open the
// palette, add a course, switch a view) before moving on. Every step can be
// skipped, and nothing it does is saved except the courses the student adds.
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronUp,
  CircleHelp,
  Compass,
  Database,
  Hand,
  LayoutDashboard,
  Library,
  ListChecks,
  MessageCircle,
  MousePointer2,
  PartyPopper,
  Plus,
  Route,
  Search,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { prefersReducedMotion } from "../lib/preferences";
import { arrowPath, coversScreen, markTourDone, pad, placeCard, visiblePart, type Box } from "../lib/tour";
import { useTracker, type View } from "../state";
import { cx } from "./ui";

/** What a step can look at to decide what to show and whether its task is done. */
export interface TourCtx {
  view: View;
  courses: number;
  whatIf: boolean;
  phone: boolean;
  addOpen: boolean;
  assistantOpen: boolean;
  /** Values when the step started, so "add a course" means one more than then. */
  start: { courses: number };
}

export interface TourStep {
  id: string;
  /** data-tour names, tried in order; the first one visible on screen is lit. None: a centred card. */
  target?: string[];
  /** Switch to this view before the step shows. */
  view?: View;
  icon: ReactNode;
  title: string;
  body: (c: TourCtx) => ReactNode;
  /** A "Try it" task. Next stays available as "Skip this step". */
  task?: { hint: (c: TourCtx) => string; done: (c: TourCtx) => boolean; desktopOnly?: boolean };
  /** Left out when this is true when the step comes up. */
  skip?: (c: TourCtx) => boolean;
  /** Keyboard or touch tip under the text. */
  tip?: (c: TourCtx) => string | null;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-ink">{children}</b>;

export const STEPS: TourStep[] = [
  {
    id: "welcome",
    icon: <Compass size={20} />,
    title: "Welcome to your AEDS Credit Tracker",
    body: () => (
      <>
        <p>In about two minutes you'll see how to get your courses in, read your progress, plan the semesters ahead and ask the AI assistant.</p>
        <p className="mt-2">
          Steps marked <B>Try it</B> wait for you to do the thing yourself. You can skip any step, and leave the tour at any time.
        </p>
      </>
    ),
    tip: (c) => (c.phone ? null : "Use ← and → to move between steps, Esc to leave."),
  },
  {
    id: "nav",
    target: ["nav"],
    view: "overview",
    icon: <LayoutDashboard size={20} />,
    title: "Six views, one plan",
    body: () => (
      <ul className="grid gap-1">
        <li>
          <B>Overview</B>: your progress at a glance
        </li>
        <li>
          <B>Courses</B>: everything you took and planned, by requirement
        </li>
        <li>
          <B>Timeline</B>: semester by semester, drag to reschedule
        </li>
        <li>
          <B>Planner</B>: what to take next and how to finish
        </li>
        <li>
          <B>Catalog</B>: every AEDS module with filters
        </li>
        <li>
          <B>Checklist</B>: graduation requirements, ticked off
        </li>
      </ul>
    ),
    tip: (c) => (c.phone ? "Timeline, Catalog and Checklist are under More." : "Press 1 to 6 to jump between views."),
  },
  {
    id: "add",
    target: ["add"],
    icon: <Plus size={20} />,
    title: "Every course starts here",
    body: () => <p>Add courses from the full AEDS module catalog: completed ones with their grade, the ones you're taking now, and the ones you plan for later semesters.</p>,
    task: { hint: (c) => (c.phone ? "Tap the + button" : "Click Add course"), done: (c) => c.addOpen },
    tip: (c) => (c.phone ? null : `Shortcut: ${isMac ? "⌘" : "Ctrl"} K, from anywhere.`),
  },
  {
    id: "palette",
    target: ["palette"],
    icon: <Search size={20} />,
    title: "Find a module and add it",
    body: () => (
      <>
        <p>
          Type a code like <B>wir821</B>, part of a title or a lecturer's name. Pick the module, then set its status: <B>Completed</B> with a grade, <B>In progress</B>, or{" "}
          <B>Planned</B> for a future semester.
        </p>
        <p className="mt-2">Only exploring? Skip this step; nothing is added.</p>
      </>
    ),
    task: { hint: () => "Add one course", done: (c) => c.courses > c.start.courses },
    skip: (c) => !c.addOpen,
  },
  {
    id: "data",
    target: ["data"],
    icon: <Database size={20} />,
    title: "Already have grades? Bring them in",
    body: () => (
      <ul className="grid gap-1">
        <li>
          <B>Sync from StudIP</B>: paste your StuMS grades page, finished modules and grades come in by code
        </li>
        <li>
          <B>Import CSV</B> or restore a <B>JSON backup</B>
        </li>
        <li>
          <B>Automatic file backup</B> keeps a file on your computer up to date
        </li>
        <li>
          <B>Share via QR code</B> moves your plan to your phone, <B>Print</B> makes a PDF for advising
        </li>
      </ul>
    ),
    tip: () => "Your data stays in this browser, so back up now and then.",
  },
  {
    id: "hero",
    target: ["hero", "welcome"],
    view: "overview",
    icon: <Sparkles size={20} />,
    title: "Your progress toward 120 ECTS",
    body: (c) =>
      c.courses ? (
        <>
          <p>
            The ring fills as you go: <span className="font-semibold text-accent">completed</span>, <span className="font-semibold text-warn">in progress</span> and{" "}
            <B>planned</B> credits. The headline climbs a stage every three modules.
          </p>
          <p className="mt-2">Below it you see what is not in your plan yet, with a shortcut to plan it.</p>
        </>
      ) : (
        <p>Once you have courses, this space becomes your progress ring and headline. Until then it offers three ways to start: StudIP sync, a file, or adding courses yourself.</p>
      ),
  },
  {
    id: "kpis",
    target: ["kpis"],
    view: "overview",
    icon: <BookOpen size={20} />,
    title: "The numbers that matter",
    body: () => <p>Your GPA, the average you still need for your target grade, and this semester's load in ECTS and weekly hours. Set a target grade and the tracker works out the rest.</p>,
    skip: (c) => c.courses === 0,
  },
  {
    id: "categories",
    target: ["categories"],
    view: "overview",
    icon: <ListChecks size={20} />,
    title: "Where your credits go",
    body: () => (
      <p>
        Each requirement has its own minimum. Credits beyond a minimum don't count toward the 120; a <B>+N over</B> badge tells you, and suggests a course you could move to a
        category that still has room.
      </p>
    ),
    skip: (c) => c.courses === 0,
  },
  {
    id: "undo",
    target: ["undo"],
    icon: <Undo2 size={20} />,
    title: "Changed your mind?",
    body: () => <p>Undo and Redo reverse any change: an added course, a new grade, a move between semesters.</p>,
    tip: (c) => (c.phone ? null : `${isMac ? "⌘" : "Ctrl"} Z to undo, ${isMac ? "⌘" : "Ctrl"} Shift Z to redo.`),
  },
  {
    id: "whatif",
    target: ["whatif"],
    icon: <Sparkles size={20} />,
    title: "What-if mode",
    body: () => (
      <p>
        Wondering what a grade would do to your GPA? With What-if on, courses you add are only simulated: they show a <B>projected GPA</B> but never touch your real credits.
      </p>
    ),
    task: { hint: () => "Switch What-if on", done: (c) => c.whatIf },
    tip: () => "The tour switches it back off on the next step.",
  },
  {
    id: "courses-nav",
    target: ["nav-courses"],
    icon: <Library size={20} />,
    title: "All your courses",
    body: () => <p>The Courses view lists everything by requirement.</p>,
    task: { hint: (c) => (c.phone ? "Tap Courses" : "Open Courses"), done: (c) => c.view === "courses" },
  },
  {
    id: "courses",
    target: ["view"],
    view: "courses",
    icon: <Library size={20} />,
    title: "Edit, grade and move",
    body: () => (
      <ul className="grid gap-1">
        <li>
          {"Tap a course to change its status, semester or grade"}
        </li>
        <li>
          <B>Drag</B> a course onto another category to count it there
        </li>
        <li>The coloured badge shows the grade at a glance</li>
      </ul>
    ),
  },
  {
    id: "timeline-nav",
    target: ["nav-timeline", "nav-more"],
    icon: <CalendarDays size={20} />,
    title: "Semester by semester",
    body: (c) => <p>The Timeline lays your courses out in semesters.{c.phone ? " On a phone it is under More; the tour opens it for you." : ""}</p>,
    task: { hint: () => "Open Timeline", done: (c) => c.view === "timeline", desktopOnly: true },
  },
  {
    id: "timeline",
    target: ["view"],
    view: "timeline",
    icon: <CalendarDays size={20} />,
    title: "Drag to reschedule",
    body: () => (
      <p>
        One column per semester, with its ECTS and weekly hours. <B>Drag a card</B> to another semester; the tracker warns you when a module doesn't run then or a semester
        goes over 30 ECTS.
      </p>
    ),
  },
  {
    id: "planner",
    target: ["view"],
    view: "planner",
    icon: <Route size={20} />,
    title: "Plan what comes next",
    body: () => (
      <p>
        The Planner suggests <B>Options A and B</B> for next semester from the modules that actually run then, maps your path to graduation, and balances heavy semesters. One
        click adds a suggestion to your plan.
      </p>
    ),
  },
  {
    id: "catalog",
    target: ["view"],
    view: "catalog",
    icon: <Search size={20} />,
    title: "Browse every module",
    body: () => <p>Filter by category, language and term, see when a module ran before and how hard students found it, and add it straight to your plan.</p>,
  },
  {
    id: "checklist",
    target: ["view"],
    view: "checklist",
    icon: <ListChecks size={20} />,
    title: "Ready to graduate?",
    body: () => <p>The Checklist ticks off every requirement: credits per category, compulsory modules and the thesis. When everything is green, you're done.</p>,
  },
  {
    id: "assistant",
    target: ["assistant"],
    view: "overview",
    icon: <MessageCircle size={20} />,
    title: "Ask the AEDS AI Assistant",
    body: () => <p>Questions about retakes, deadlines or the thesis? The assistant answers from the official programme documents and shows its sources.</p>,
    task: { hint: (c) => (c.phone ? "Tap the chat bubble" : "Open the chat"), done: (c) => c.assistantOpen },
  },
  {
    id: "assistant-context",
    target: ["assistant-context"],
    icon: <MessageCircle size={20} />,
    title: "Answers that know your plan",
    body: () => (
      <ul className="grid gap-1">
        <li>
          Tick <B>Consider my course list</B> and it plans with your real progress
        </li>
        <li>
          <B>Module codes</B> in answers open a card: add the module or find it in the Catalog
        </li>
        <li>
          <B>Stop</B> ends a long answer, and follow-up questions are one tap away
        </li>
      </ul>
    ),
    skip: (c) => !c.assistantOpen,
  },
  {
    id: "help",
    target: ["help", "nav-more"],
    icon: <CircleHelp size={20} />,
    title: "Help is always here",
    body: () => (
      <p>
        <B>How it works</B> explains the rules and lets you replay this tour. <B>What's new</B> lists changes, and <B>Appearance</B> has six colour palettes and dark mode.
      </p>
    ),
  },
  {
    id: "done",
    view: "overview",
    icon: <PartyPopper size={20} />,
    title: "You're all set",
    body: (c) => (
      <p>
        {c.courses
          ? "Keep your courses up to date after each semester and the tracker keeps your plan honest."
          : "Start by syncing from StudIP or adding your first course. Everything you saw is waiting for your data."}
      </p>
    ),
  },
];

const PAD = 8;
type Rect = Box | null;

/** First visible element for the step's targets, measured in viewport coordinates. */
function measure(names: string[] | undefined): Rect {
  if (!names) return null;
  for (const n of names) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${n}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return { x: r.x, y: r.y, w: r.width, h: r.height };
    }
  }
  return null;
}

function sameBox(a: Rect, b: Rect) {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}

export default function Tour({ onClose }: { onClose: () => void }) {
  const tracker = useTracker();
  const { view, setView, courses, whatIf, setWhatIf, addOpen, closeAdd, openAdd } = tracker;
  const realCourses = courses.filter((c) => !c.hypothetical).length;
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const phone = vp.w < 640;
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [startCourses, setStartCourses] = useState(realCourses);
  const [target, setTarget] = useState<Rect>(null);
  // Starts at the width it will have, so the first placement is already right.
  const [cardSize, setCardSize] = useState(() => ({ w: window.innerWidth < 640 ? window.innerWidth - 32 : 340, h: 260 }));
  const [folded, setFolded] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [justDone, setJustDone] = useState(false);
  const justDoneRef = useRef(false);
  justDoneRef.current = justDone;
  const whatIfAtStart = useRef(whatIf);
  const cardRef = useRef<HTMLDivElement>(null);
  const dir = useRef<1 | -1>(1);

  const ctx: TourCtx = useMemo(
    () => ({ view, courses: realCourses, whatIf, phone, addOpen, assistantOpen, start: { courses: startCourses } }),
    [view, realCourses, whatIf, phone, addOpen, assistantOpen, startCourses],
  );
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const step = STEPS[index];
  const task = step.task && !(step.task.desktopOnly && phone) ? step.task : null;
  const taskDone = !!task && task.done(ctx);
  const isLast = index === STEPS.length - 1;

  // ---- leaving -----------------------------------------------------------
  const finish = useCallback(() => {
    markTourDone();
    if (!whatIfAtStart.current) setWhatIf(false);
    onClose();
  }, [onClose, setWhatIf]);

  // ---- moving between steps ----------------------------------------------
  const go = useCallback(
    (to: number) => {
      dir.current = to >= index ? 1 : -1;
      let i = to;
      // Steps that don't apply right now are passed over in the direction of travel.
      while (i > 0 && i < STEPS.length - 1 && STEPS[i].skip?.(ctxRef.current)) i += dir.current;
      if (i < 0) i = 0;
      if (i >= STEPS.length) return finish();
      // The palette is only part of its own steps.
      if (ctxRef.current.addOpen && !["add", "palette"].includes(STEPS[i].id)) closeAdd();
      // Leaving the chat steps: close the panel so it doesn't cover the next ones.
      if (ctxRef.current.assistantOpen && !["assistant", "assistant-context"].includes(STEPS[i].id))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      // What-if was only switched on to try it: off again once that step is behind us.
      if (STEPS[index].id === "whatif" && !whatIfAtStart.current && ctxRef.current.whatIf) setWhatIf(false);
      setStartCourses(ctxRef.current.courses);
      setJustDone(false);
      setIndex(i);
    },
    [index, closeAdd, finish, setWhatIf],
  );
  const next = () => (isLast ? finish() : go(index + 1));
  const back = () => index > 0 && go(index - 1);

  // Switch view for the step, and bring its target into view.
  useEffect(() => {
    if (step.view && step.view !== ctxRef.current.view) setView(step.view);
    const t = window.setTimeout(() => {
      if (step.target?.includes("view")) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      else {
        for (const n of step.target || []) {
          const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${n}"]`)].find((e) => e.getBoundingClientRect().width > 0);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
            break;
          }
        }
      }
    }, 60);
    return () => window.clearTimeout(t);
    // Only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // A finished task: a moment of praise, then on to the next step.
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (task && taskDone && !justDone) setJustDone(true);
  }, [task, taskDone, justDone]);
  useEffect(() => {
    if (!justDone) return;
    const t = window.setTimeout(() => goRef.current(index + 1), 1100);
    return () => window.clearTimeout(t);
  }, [justDone, index]);

  // Follow the target (it may move with scrolling, animation or layout) and the window size.
  useEffect(() => {
    let frame = 0;
    // undefined: nothing measured yet for this step, so the first result always lands.
    let last: Rect | undefined;
    const tick = () => {
      const m = measure(step.target);
      // A finished task often removes its target (the palette closes): keep the light where it was.
      if (!m && last && justDoneRef.current) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (last === undefined || !sameBox(m, last)) {
        last = m;
        setTarget(m);
      }
      setAssistantOpen(!!document.querySelector('[data-tour="assistant-panel"]'));
      frame = requestAnimationFrame(tick);
    };
    tick();
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [step]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    // offsetWidth/Height ignore the entry animation's scale, unlike getBoundingClientRect.
    const r = { width: el.offsetWidth, height: el.offsetHeight };
    if (Math.abs(r.width - cardSize.w) > 1 || Math.abs(r.height - cardSize.h) > 1) setCardSize({ w: r.width, h: r.height });
  });

  // Focus the card for reading steps; a task step leaves focus where the student works.
  useEffect(() => {
    if (!task) cardRef.current?.focus({ preventScroll: true });
  }, [index, task]);

  const lit = target ? pad(visiblePart(target, vp), PAD) : null;
  // Only a "Try it" step folds: the student needs the whole screen to do it. A reading step keeps its text.
  const fold = phone && !!task && !taskDone && !!lit && coversScreen(lit, vp);
  const showFolded = fold && folded;
  // Folded by default whenever a step lights (nearly) the whole phone screen.
  useEffect(() => setFolded(fold), [fold, index]);

  const place = placeCard(lit, cardSize, vp, phone);
  const cardBox: Box = { x: place.x, y: place.y, w: cardSize.w, h: cardSize.h };
  const arrow = lit && !showFolded ? arrowPath(cardBox, lit) : null;
  // A task step lets clicks through to its target; elsewhere the page is paused.
  const holeOpen = !!task;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      finish();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  };

  const blocked = () => setNudge((n) => n + 1);
  const progress = ((index + 1) / STEPS.length) * 100;
  const hand = task && lit && !taskDone && !showFolded;

  return createPortal(
    <div className="tour no-print" data-testid="tour">
      {/* Dim everything but the spotlight; the shadow of one box does both. */}
      <div
        className={cx("tour-spot", !lit && "tour-spot-none")}
        style={lit ? { left: lit.x, top: lit.y, width: lit.w, height: lit.h } : { left: vp.w / 2, top: vp.h / 2, width: 0, height: 0 }}
        aria-hidden="true"
      >
        {lit && <span key={`ring-${index}`} className="tour-ring" />}
      </div>

      {/* Click blockers around the hole (and over it, unless the step wants a click there). */}
      {lit ? (
        <>
          <div className="tour-block" style={{ left: 0, top: 0, width: vp.w, height: Math.max(0, lit.y) }} onClick={blocked} />
          <div className="tour-block" style={{ left: 0, top: lit.y + lit.h, width: vp.w, height: Math.max(0, vp.h - lit.y - lit.h) }} onClick={blocked} />
          <div className="tour-block" style={{ left: 0, top: lit.y, width: Math.max(0, lit.x), height: lit.h }} onClick={blocked} />
          <div className="tour-block" style={{ left: lit.x + lit.w, top: lit.y, width: Math.max(0, vp.w - lit.x - lit.w), height: lit.h }} onClick={blocked} />
          {!holeOpen && <div className="tour-block" style={{ left: lit.x, top: lit.y, width: lit.w, height: lit.h }} onClick={blocked} />}
        </>
      ) : (
        <div className="tour-block" style={{ inset: 0 }} onClick={blocked} />
      )}

      {/* The arrow, drawn on from the card to the target. */}
      {arrow && (
        <svg className="tour-arrow-layer" width={vp.w} height={vp.h} aria-hidden="true">
          <defs>
            <marker id="tour-head" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <path d="M1 1.5 L10 6 L1 10.5" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          <path key={`arrow-${index}`} className="tour-arrow" d={arrow.d} pathLength={1} markerEnd="url(#tour-head)" />
        </svg>
      )}

      {/* A pointing hand that taps the target on "Try it" steps. */}
      {hand && lit && (
        <span key={`hand-${index}`} className="tour-hand" style={{ left: lit.x + lit.w / 2, top: lit.y + lit.h / 2 }} aria-hidden="true">
          <MousePointer2 size={26} fill="var(--panel)" />
        </span>
      )}

      {step.id === "done" && <Confetti />}

      {showFolded ? (
        <button
          key={`fold-${index}`}
          ref={cardRef as unknown as React.RefObject<HTMLButtonElement>}
          onClick={() => setFolded(false)}
          className="tour-card tour-fold"
          aria-label={`Show tour step ${index + 1}: ${step.title}`}
        >
          <span className="tour-icon h-8 w-8">{task && !taskDone ? <Hand size={16} /> : step.icon}</span>
          <span className="min-w-0 text-left">
            <span className="block text-caption text-muted">
              Step {index + 1} of {STEPS.length}
            </span>
            <span className="block truncate text-body-sm font-semibold">{task && !taskDone ? task.hint(ctx) : step.title}</span>
          </span>
          <ChevronUp size={16} className="shrink-0 text-muted" />
        </button>
      ) : (
        <div
          key={`card-${index}-${nudge}`}
          ref={cardRef}
          role="dialog"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          tabIndex={-1}
          onKeyDown={onKey}
          className={cx("tour-card", dir.current > 0 ? "tour-in-next" : "tour-in-back", nudge > 0 && "tour-nudge")}
          style={{ left: place.x, top: place.y, width: phone ? vp.w - 32 : 340 }}
        >
          <div className="h-1 overflow-hidden rounded-full bg-ink/[0.07]">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 flex items-start gap-3">
            <span className="tour-icon h-10 w-10">{step.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-caption font-medium text-muted" aria-live="polite">
                Step {index + 1} of {STEPS.length}
              </div>
              <h2 id="tour-title" className="font-serif text-title leading-snug font-semibold tracking-tight">
                {step.title}
              </h2>
            </div>
            {fold && (
              <button onClick={() => setFolded(true)} aria-label="Fold the tour card" className="cursor-pointer rounded-lg p-1 text-faint hover:text-ink">
                <ChevronUp size={17} className="rotate-180" />
              </button>
            )}
            <button onClick={finish} aria-label="Close the tour" className="cursor-pointer rounded-lg p-1 text-faint hover:text-ink">
              <X size={17} />
            </button>
          </div>

          <div id="tour-body" className="tour-body mt-2 text-body-sm leading-relaxed text-muted">
            {step.body(ctx)}
          </div>

          {task && (
            <div className={cx("tour-task mt-3", taskDone && "tour-task-done")} role="status">
              <span className="tour-task-icon">{taskDone ? <Check size={15} strokeWidth={3} /> : <Hand size={15} />}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-micro font-bold tracking-wide uppercase">{taskDone ? "Nicely done" : "Try it"}</span>
                <span className="block text-body-sm font-medium">{task.hint(ctx)}</span>
              </span>
            </div>
          )}

          {step.tip?.(ctx) && <p className="mt-3 text-caption text-faint">{step.tip(ctx)}</p>}

          <div className="mt-4 flex items-center gap-2">
            {index === 0 ? (
              <button onClick={finish} className="cursor-pointer rounded-lg px-2 py-1.5 text-body-sm text-muted hover:text-ink">
                Not now
              </button>
            ) : (
              <button onClick={back} aria-label="Previous step" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-line text-muted hover:text-ink">
                <ArrowLeft size={16} />
              </button>
            )}
            {index > 0 && !isLast && (
              <button onClick={finish} className="cursor-pointer rounded-lg px-2 py-1.5 text-body-sm text-muted hover:text-ink">
                End tour
              </button>
            )}
            <span className="flex-1" />
            {isLast && !ctx.courses && (
              <button
                onClick={() => {
                  finish();
                  openAdd();
                }}
                className="h-9 cursor-pointer rounded-xl border border-line px-3 text-body-sm font-medium hover:border-accent hover:text-accent"
              >
                Add a course
              </button>
            )}
            <button
              onClick={next}
              className={cx(
                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-4 text-body-sm font-semibold transition active:scale-95",
                task && !taskDone ? "border border-line text-muted hover:text-ink" : "bg-accent text-white shadow-[0_6px_16px_-8px_var(--accent)] dark:text-paper",
              )}
            >
              {index === 0 ? "Start the tour" : isLast ? "Finish" : task && !taskDone ? "Skip this step" : "Next"}
              {!isLast && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

const CONFETTI = ["var(--accent)", "var(--warn)", "var(--cat-empirical)", "var(--cat-datascience)", "var(--cat-specialization)"];

function Confetti() {
  if (prefersReducedMotion()) return null;
  return (
    <div aria-hidden="true">
      {Array.from({ length: 48 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI[i % CONFETTI.length],
            borderRadius: i % 3 === 0 ? "50%" : undefined,
            zIndex: 9960,
            ["--delay" as string]: `${((i * 13) % 50) / 100}s`,
            ["--dur" as string]: `${2 + ((i * 7) % 12) / 10}s`,
            ["--drift" as string]: `${((i * 29) % 160) - 80}px`,
            ["--spin" as string]: `${360 + ((i * 53) % 540)}deg`,
          }}
        />
      ))}
    </div>
  );
}
