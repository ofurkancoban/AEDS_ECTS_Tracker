import { STORAGE_KEY, VISITS_KEY } from "./constants";
import { sanitizeCourses } from "./sanitize";
import type { Course, TrackerState } from "./types";

export const DEFAULT_STATE: TrackerState = {
  courses: [],
  theme: "light",
  graduationDate: "",
  targetGrade: "",
  lastBackupAt: null,
  installBannerDismissed: false,
  usageCount: 0,
};

export function loadState(): TrackerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const p = JSON.parse(raw);
    return {
      courses: sanitizeCourses(p.courses).courses,
      theme: p.theme === "dark" ? "dark" : "light",
      graduationDate: p.graduationDate || "",
      targetGrade: p.targetGrade || "",
      lastBackupAt: p.lastBackupAt || null,
      installBannerDismissed: !!p.installBannerDismissed,
      usageCount: p.usageCount || 0,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

const BACKUP_KEY = STORAGE_KEY + "::backups";
const BACKUP_LIMIT = 5;
// Edits within this window (typing a note, changing a few grades) share one backup.
const BACKUP_BURST_MS = 2 * 60 * 1000;

interface RingEntry {
  t: number;
  value: string;
}

function readRing(): RingEntry[] {
  try {
    const ring = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
    return Array.isArray(ring) ? ring.filter((e) => e && typeof e.value === "string") : [];
  } catch {
    return [];
  }
}

function coursesOf(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value).courses || []);
  } catch {
    return value;
  }
}

/**
 * Writes the state and keeps up to 5 earlier versions in "<key>::backups"
 * (same ring format as the classic UI). Only versions whose courses differ
 * are kept, and a burst of edits is stored once, so the ring holds
 * meaningfully different snapshots rather than every keystroke or theme switch.
 */
export function saveState(state: TrackerState, now = Date.now()): void {
  const value = JSON.stringify(state);
  try {
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev !== null && prev !== value && coursesOf(prev) !== JSON.stringify(state.courses)) {
      const ring = readRing();
      const newest = ring[ring.length - 1];
      const duplicate = newest && coursesOf(newest.value) === coursesOf(prev);
      const sameBurst = newest && now - newest.t < BACKUP_BURST_MS;
      if (!duplicate && !sameBurst) {
        ring.push({ t: now, value: prev });
        while (ring.length > BACKUP_LIMIT) ring.shift();
        localStorage.setItem(BACKUP_KEY, JSON.stringify(ring));
      }
    }
  } catch {
    /* backups are best-effort */
  }
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch (e) {
    console.error("Failed to save tracker state", e);
  }
}

export interface AutoBackup {
  t: number;
  courses: Course[];
  skipped: number;
}

/** Automatic backups, newest first. */
export function listAutoBackups(): AutoBackup[] {
  return readRing()
    .map((e) => {
      try {
        const { courses, skipped } = sanitizeCourses(JSON.parse(e.value).courses);
        return { t: e.t, courses, skipped };
      } catch {
        return null;
      }
    })
    .filter((b): b is AutoBackup => !!b)
    .reverse();
}

export function latestAutoBackup(): { t: number; state: Partial<TrackerState> } | null {
  const b = listAutoBackups()[0];
  return b ? { t: b.t, state: { courses: b.courses } } : null;
}

export function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

const COUNTER_BASE = "https://abacus.jasoncameron.dev";
const COUNTER_NAMESPACE = "ects-tracker-app-b7f2";

/** Increments the anonymous cross-user open counter (same counter as the classic UI). */
export async function hitGlobalCounter(): Promise<number | null> {
  try {
    const res = await fetch(`${COUNTER_BASE}/hit/${COUNTER_NAMESPACE}/${VISITS_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const n = parseInt(String(data.value), 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
