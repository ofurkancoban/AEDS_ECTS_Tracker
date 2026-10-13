import { STORAGE_KEY, VISITS_KEY } from "./constants";
import type { TrackerState } from "./types";

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
      courses: Array.isArray(p.courses) ? p.courses : [],
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

/** Writes the state, keeping the previous 5 versions in "<key>::backups" (same ring as the classic UI). */
export function saveState(state: TrackerState): void {
  const value = JSON.stringify(state);
  try {
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev !== null && prev !== value) {
      const key = STORAGE_KEY + "::backups";
      let ring: { t: number; value: string }[] = [];
      try {
        ring = JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        ring = [];
      }
      ring.push({ t: Date.now(), value: prev });
      while (ring.length > 5) ring.shift();
      localStorage.setItem(key, JSON.stringify(ring));
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

export function latestAutoBackup(): { t: number; state: Partial<TrackerState> } | null {
  try {
    const ring = JSON.parse(localStorage.getItem(STORAGE_KEY + "::backups") || "[]");
    if (!ring.length) return null;
    const last = ring[ring.length - 1];
    return { t: last.t, state: JSON.parse(last.value) };
  } catch {
    return null;
  }
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
