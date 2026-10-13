// Automatic backup to a file the student picks once (File System Access API,
// desktop Chrome/Edge). The file handle is kept in IndexedDB; the app never
// learns the path, it can only write to that one file. The file holds the
// same JSON as "Download JSON backup", so "Restore JSON backup" reads it.
import type { Course } from "./types";

export const SUGGESTED_NAME = "ects-tracker-backup.json";
const DB = "ects-tracker";
const STORE = "handles";
const KEY = "backup-file";
export const LAST_WRITE_KEY = "ects-tracker-filebackup-at";

type Permission = "granted" | "denied" | "prompt";

/** The subset of FileSystemFileHandle used here (also what tests fake). */
export interface BackupHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  queryPermission?(opts: { mode: "readwrite" }): Promise<Permission>;
  requestPermission?(opts: { mode: "readwrite" }): Promise<Permission>;
}

interface PickerWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<BackupHandle>;
}

export function fileBackupSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showSaveFilePicker === "function";
}

// ---- handle storage (IndexedDB; in-memory where it isn't available) ---------

let memory: BackupHandle | null = null;

function idb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await idb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined); // e.g. a handle that can't be stored: keep it in memory only
    }
  });
}

export async function loadHandle(): Promise<BackupHandle | null> {
  const stored = (await tx<BackupHandle>("readonly", (s) => s.get(KEY))) || null;
  return stored || memory;
}

export async function saveHandle(h: BackupHandle): Promise<void> {
  memory = h;
  await tx("readwrite", (s) => s.put(h, KEY));
}

export async function forgetHandle(): Promise<void> {
  memory = null;
  await tx("readwrite", (s) => s.delete(KEY));
  try {
    localStorage.removeItem(LAST_WRITE_KEY);
  } catch {
    /* ignore */
  }
}

// ---- permissions -------------------------------------------------------------

export async function permissionOf(h: BackupHandle): Promise<Permission> {
  if (!h.queryPermission) return "granted";
  try {
    return await h.queryPermission({ mode: "readwrite" });
  } catch {
    return "prompt";
  }
}

/** Must run inside a click handler: browsers only show the prompt after a user gesture. */
export async function requestPermission(h: BackupHandle): Promise<boolean> {
  if (!h.requestPermission) return true;
  try {
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

// ---- picking and writing --------------------------------------------------

/** Opens the browser's save dialog; null if the student cancels. */
export async function pickFile(): Promise<BackupHandle | null> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) return null;
  try {
    return await picker({
      suggestedName: SUGGESTED_NAME,
      types: [{ description: "ECTS Tracker backup", accept: { "application/json": [".json"] } }],
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

/** Thrown instead of replacing a backup that still has courses with an empty list. */
export class EmptyListGuard extends Error {
  constructor(public existing: number) {
    super(`The backup file still has ${existing} course(s); not replacing it with an empty list.`);
    this.name = "EmptyListGuard";
  }
}

async function coursesInFile(h: BackupHandle): Promise<number> {
  try {
    const text = await (await h.getFile()).text();
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : Array.isArray(data?.courses) ? data.courses : [];
    return list.length;
  } catch {
    return 0; // new, empty or unreadable file
  }
}

/**
 * Writes the course list. The browser only swaps the file in on close(), so
 * an interrupted write leaves the previous backup intact.
 */
export async function writeBackup(h: BackupHandle, courses: Course[], opts: { allowEmpty?: boolean } = {}): Promise<number> {
  if (!courses.length && !opts.allowEmpty) {
    const existing = await coursesInFile(h);
    if (existing > 0) throw new EmptyListGuard(existing);
  }
  const w = await h.createWritable();
  try {
    await w.write(JSON.stringify(courses, null, 2));
    await w.close();
  } catch (e) {
    await w.abort?.().catch(() => {});
    throw e;
  }
  const now = Date.now();
  try {
    localStorage.setItem(LAST_WRITE_KEY, String(now));
  } catch {
    /* ignore */
  }
  return now;
}

export function lastWrite(): number | null {
  try {
    const v = parseInt(localStorage.getItem(LAST_WRITE_KEY) || "", 10);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// ---- one-tap backup where automatic writing isn't available (iPhone, Safari) ----

export function canShareFiles(): boolean {
  try {
    const f = new File(["[]"], SUGGESTED_NAME, { type: "application/json" });
    return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

/** Opens the share sheet with the backup file (on iPhone: "Save to Files" puts it in iCloud Drive). */
export async function shareBackup(courses: Course[]): Promise<"shared" | "cancelled"> {
  const file = new File([JSON.stringify(courses, null, 2)], SUGGESTED_NAME, { type: "application/json" });
  try {
    await navigator.share({ files: [file], title: "ECTS Tracker backup" });
    return "shared";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    throw e;
  }
}
