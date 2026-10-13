import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { migrateCourseNames, useCatalog } from "./lib/catalog";
import { computeStats, type Stats } from "./lib/stats";
import { PALETTE_KEY, applyPalette, loadPalette } from "./lib/palettes";
import { loadState, readFlag, saveState, writeFlag } from "./lib/storage";
import type { Catalog } from "./lib/catalog";
import type { Course, TrackerState } from "./lib/types";

export type View = "overview" | "courses" | "timeline" | "planner" | "catalog" | "checklist";

export interface Toast {
  id: number;
  message: string;
  tone?: "default" | "warn" | "success";
  action?: { label: string; run: () => void };
}

export interface ConfirmRequest {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface TrackerCtx {
  state: TrackerState;
  catalog: Catalog;
  stats: Stats;
  courses: Course[];
  setCourses: (fn: (prev: Course[]) => Course[]) => void;
  patch: (p: Partial<TrackerState>) => void;
  updateCourse: (id: string, p: Partial<Course>) => void;
  removeCourse: (id: string) => void;
  undo: () => void;
  redo: () => void;
  undoCount: number;
  redoCount: number;
  studipOpen: boolean;
  setStudipOpen: (v: boolean) => void;
  moveTarget: Course | null;
  setMoveTarget: (c: Course | null) => void;
  whatIf: boolean;
  setWhatIf: (v: boolean) => void;
  palette: string;
  setPalette: (id: string) => void;
  view: View;
  setView: (v: View) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  confirm: (r: Omit<ConfirmRequest, "resolve">) => Promise<boolean>;
  confirmRequest: ConfirmRequest | null;
  addOpen: boolean;
  openAdd: (preset?: AddPreset) => void;
  closeAdd: () => void;
  addPreset: AddPreset | null;
  backupReminderDismissed: boolean;
  dismissBackupReminder: () => void;
}

export interface AddPreset {
  category?: Course["category"];
  name?: string;
  semester?: string;
}

const Ctx = createContext<TrackerCtx | null>(null);

export function useTracker(): TrackerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTracker outside provider");
  return c;
}

const UNDO_LIMIT = 30;
// Edits closer together than this (e.g. typing a note) undo as one step.
const COALESCE_MS = 800;
const VIEW_KEY = "ects-tracker-view";

export function TrackerProvider({ children }: { children: ReactNode }) {
  const catalog = useCatalog();
  const [state, setState] = useState<TrackerState>(() => {
    const s = loadState();
    return { ...s, usageCount: (s.usageCount || 0) + 1 };
  });
  const [whatIf, setWhatIfRaw] = useState(false);
  const [palette, setPaletteRaw] = useState(loadPalette);
  const [view, setViewRaw] = useState<View>(() => (readFlag(VIEW_KEY) as View) || "overview");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addPreset, setAddPreset] = useState<AddPreset | null>(null);
  const [backupReminderDismissed, setBackupReminderDismissed] = useState(false);
  const undoStack = useRef<Course[][]>([]);
  const redoStack = useRef<Course[][]>([]);
  const lastRecord = useRef(0);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [studipOpen, setStudipOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Course | null>(null);
  const toastId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Debounced persistence, same key and shape as the classic UI.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveState(state), 300);
  }, [state]);

  // Follow catalog renames once the live catalog arrives.
  useEffect(() => {
    if (catalog.source !== "fetched") return;
    setState((s) => {
      const next = migrateCourseNames(s.courses, catalog);
      return next.some((c, i) => c !== s.courses[i]) ? { ...s, courses: next } : s;
    });
  }, [catalog]);

  // Theme (light/dark) is part of the shared state; the palette is a separate,
  // new-UI-only setting so the classic UI's saved format stays untouched.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
    applyPalette(palette);
    const meta = document.querySelector('meta[name="theme-color"]');
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
    if (meta && paper) meta.setAttribute("content", paper);
  }, [state.theme, palette]);

  const setPalette = useCallback((id: string) => {
    setPaletteRaw(id);
    writeFlag(PALETTE_KEY, id);
  }, []);

  const syncCounts = () => {
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
  };

  // Every user edit goes through here, so all of them can be undone.
  const setCourses = useCallback((fn: (prev: Course[]) => Course[]) => {
    const now = Date.now();
    if (now - lastRecord.current > COALESCE_MS) {
      undoStack.current.push(stateRef.current.courses);
      if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    }
    lastRecord.current = now;
    redoStack.current = [];
    syncCounts();
    setState((s) => ({ ...s, courses: fn(s.courses) }));
  }, []);

  const patch = useCallback((p: Partial<TrackerState>) => setState((s) => ({ ...s, ...p })), []);

  const updateCourse = useCallback(
    (id: string, p: Partial<Course>) => setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c))),
    [setCourses],
  );

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.action ? 7000 : 3500);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(stateRef.current.courses);
    lastRecord.current = 0;
    syncCounts();
    setState((s) => ({ ...s, courses: prev }));
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(stateRef.current.courses);
    lastRecord.current = 0;
    syncCounts();
    setState((s) => ({ ...s, courses: next }));
  }, []);

  const removeCourse = useCallback(
    (id: string) => {
      const target = stateRef.current.courses.find((c) => c.id === id);
      if (!target) return;
      lastRecord.current = 0;
      setCourses((cs) => cs.filter((c) => c.id !== id));
      lastRecord.current = 0;
      toast({ message: `Removed ${target.name}`, action: { label: "Undo", run: undo } });
    },
    [setCourses, toast, undo],
  );

  const setWhatIf = useCallback(
    (v: boolean) => {
      setWhatIfRaw(v);
      if (!v) setCourses((cs) => (cs.some((c) => c.hypothetical) ? cs.filter((c) => !c.hypothetical) : cs));
    },
    [setCourses],
  );

  const setView = useCallback((v: View) => {
    setViewRaw(v);
    writeFlag(VIEW_KEY, v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const confirm = useCallback(
    (r: Omit<ConfirmRequest, "resolve">) =>
      new Promise<boolean>((resolve) =>
        setConfirmRequest({
          ...r,
          resolve: (ok) => {
            setConfirmRequest(null);
            resolve(ok);
          },
        }),
      ),
    [],
  );

  const openAdd = useCallback((preset?: AddPreset) => {
    setAddPreset(preset || null);
    setAddOpen(true);
  }, []);
  const closeAdd = useCallback(() => setAddOpen(false), []);

  const stats = useMemo(
    () =>
      computeStats(state.courses, catalog, {
        targetGrade: state.targetGrade,
        graduationDate: state.graduationDate,
        lastBackupAt: state.lastBackupAt,
        backupReminderDismissed,
      }),
    [state.courses, state.targetGrade, state.graduationDate, state.lastBackupAt, catalog, backupReminderDismissed],
  );

  const value: TrackerCtx = {
    state,
    catalog,
    stats,
    courses: state.courses,
    setCourses,
    patch,
    updateCourse,
    removeCourse,
    undo,
    redo,
    undoCount,
    redoCount,
    studipOpen,
    setStudipOpen,
    moveTarget,
    setMoveTarget,
    whatIf,
    setWhatIf,
    palette,
    setPalette,
    view,
    setView,
    toasts,
    toast,
    dismissToast,
    confirm,
    confirmRequest,
    addOpen,
    openAdd,
    closeAdd,
    addPreset,
    backupReminderDismissed,
    dismissBackupReminder: () => setBackupReminderDismissed(true),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
