import { CloudAlert, CloudCheck, CloudUpload, FileJson, HardDriveDownload, RefreshCw, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EmptyListGuard,
  canShareFiles,
  fileBackupSupported,
  forgetHandle,
  lastWrite,
  loadHandle,
  permissionOf,
  pickFile,
  requestPermission,
  saveHandle,
  writeBackup,
  type BackupHandle,
} from "../lib/fileBackup";
import type { Course } from "../lib/types";
import { useTracker } from "../state";
import { Button, Modal, cx } from "./ui";

export type FileBackupStatus = "unsupported" | "off" | "needs-permission" | "active" | "error";

export interface FileBackup {
  status: FileBackupStatus;
  fileName: string | null;
  lastAt: number | null;
  error: string | null;
  enable: () => Promise<void>;
  resume: () => Promise<void>;
  disable: () => Promise<void>;
  backupNow: () => Promise<void>;
}

/** Wait this long after the last edit before writing, so a burst of edits is one write. */
export const WRITE_DELAY_MS = 2500;

export function useFileBackup(): FileBackup {
  const { courses, patch, confirm, toast } = useTracker();
  const supported = fileBackupSupported();
  const [status, setStatus] = useState<FileBackupStatus>(supported ? "off" : "unsupported");
  const [handle, setHandle] = useState<BackupHandle | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(lastWrite);
  const [error, setError] = useState<string | null>(null);
  const written = useRef<string | null>(null);
  const coursesRef = useRef(courses);
  coursesRef.current = courses;

  // Restore the chosen file from a previous visit.
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    loadHandle().then(async (h) => {
      if (!alive || !h) return;
      setHandle(h);
      setStatus((await permissionOf(h)) === "granted" ? "active" : "needs-permission");
    });
    return () => {
      alive = false;
    };
  }, [supported]);

  const write = useCallback(
    async (h: BackupHandle, list: Course[], allowEmpty = false) => {
      const json = JSON.stringify(list);
      try {
        const at = await writeBackup(h, list, { allowEmpty });
        written.current = json;
        setLastAt(at);
        setError(null);
        setStatus("active");
        patch({ lastBackupAt: new Date(at).toISOString() });
      } catch (e) {
        if (e instanceof EmptyListGuard) {
          const ok = await confirm({
            title: "Empty the backup file too?",
            body: `Your course list is now empty, but the backup file still has ${e.existing} course(s). Keep the file as it is unless you really want to start over.`,
            confirmLabel: "Empty the file",
            danger: true,
          });
          if (ok) await write(h, list, true);
          else written.current = json; // don't ask again for the same empty list
          return;
        }
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("needs-permission");
          setError("The browser needs your permission again to update the backup file.");
        } else if (name === "NotFoundError") {
          setStatus("error");
          setError("The backup file was moved or deleted. Choose it again.");
        } else {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Could not write the backup file.");
        }
      }
    },
    [confirm, patch],
  );

  // Write a few seconds after the last change, only when something changed.
  useEffect(() => {
    if (status !== "active" || !handle) return;
    if (JSON.stringify(courses) === written.current) return;
    const t = window.setTimeout(() => write(handle, coursesRef.current), WRITE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [courses, status, handle, write]);

  const enable = useCallback(async () => {
    try {
      const h = await pickFile();
      if (!h) return;
      await saveHandle(h);
      setHandle(h);
      await write(h, coursesRef.current);
      toast({ message: `Automatic backup on: ${h.name}`, tone: "success" });
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not open the file.");
    }
  }, [toast, write]);

  const resume = useCallback(async () => {
    if (!handle) return;
    if (await requestPermission(handle)) await write(handle, coursesRef.current);
    else setError("Permission was not granted. The backup file is not being updated.");
  }, [handle, write]);

  const disable = useCallback(async () => {
    await forgetHandle();
    setHandle(null);
    setLastAt(null);
    setError(null);
    written.current = null;
    setStatus("off");
    toast({ message: "Automatic file backup turned off. The file itself is kept." });
  }, [toast]);

  const backupNow = useCallback(async () => {
    if (handle) await write(handle, coursesRef.current);
  }, [handle, write]);

  return { status, fileName: handle?.name ?? null, lastAt, error, enable, resume, disable, backupNow };
}

export function relativeTime(t: number | null, now = Date.now()): string {
  if (!t) return "never";
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** Small status pill for the top bar; hidden while the feature is off. */
export function FileBackupIndicator({ backup, onOpen }: { backup: FileBackup; onOpen: () => void }) {
  const now = useNow();
  if (backup.status === "off" || backup.status === "unsupported") return null;
  if (backup.status === "needs-permission")
    return (
      <button
        onClick={backup.resume}
        className="hidden h-9 cursor-pointer items-center gap-1.5 rounded-full border border-warn/50 bg-warn-soft px-3 text-meta font-medium text-warn md:inline-flex"
      >
        <CloudUpload size={15} /> Resume file backup
      </button>
    );
  const ok = backup.status === "active";
  return (
    <button
      onClick={onOpen}
      title={backup.fileName ? `Backing up to ${backup.fileName}` : undefined}
      className={cx(
        "hidden h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-meta md:inline-flex",
        ok ? "text-muted hover:bg-ink/5 hover:text-ink" : "border border-warn/50 bg-warn-soft font-medium text-warn",
      )}
    >
      {ok ? <CloudCheck size={15} className="text-accent" /> : <CloudAlert size={15} />}
      {ok ? `Backed up · ${relativeTime(backup.lastAt, now)}` : "File backup problem"}
    </button>
  );
}

export function FileBackupModal({
  open,
  onClose,
  backup,
  onDownload,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  backup: FileBackup;
  onDownload: () => void;
  onShare: () => void;
}) {
  const now = useNow();
  const share = canShareFiles();
  return (
    <Modal open={open} onClose={onClose} title="Automatic file backup" subtitle="A copy of your courses in a file you choose, updated after every change." width="max-w-lg">
      {backup.status === "unsupported" ? (
        <div className="grid gap-4 text-body-sm">
          <p className="text-muted">
            This browser can't write to a file on its own (it works in Chrome and Edge on a computer). You can still keep a backup in one step:
          </p>
          <div className="flex flex-wrap gap-2">
            {share && (
              <Button variant="primary" onClick={onShare}>
                <Share2 size={15} /> Save to Files / iCloud
              </Button>
            )}
            <Button variant={share ? "outline" : "primary"} onClick={onDownload}>
              <HardDriveDownload size={15} /> Download backup
            </Button>
          </div>
          <p className="text-caption text-muted">You'll get a reminder if your last backup is more than a week old.</p>
        </div>
      ) : backup.status === "off" ? (
        <div className="grid gap-4 text-body-sm">
          <ol className="grid gap-2 text-muted">
            <li>1. Choose where to save the file. A folder synced by iCloud Drive, OneDrive or Dropbox also keeps a copy in the cloud.</li>
            <li>2. From then on the file is updated a few seconds after each change. Nothing is uploaded by this app.</li>
            <li>3. To restore, use Data → Restore JSON backup and pick that file.</li>
          </ol>
          <div>
            <Button variant="primary" onClick={backup.enable}>
              <FileJson size={15} /> Choose backup file…
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 text-body-sm">
          <div
            role="status"
            className={cx("flex items-start gap-3 rounded-xl px-3 py-2.5", backup.status === "active" ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn")}
          >
            {backup.status === "active" ? <CloudCheck size={18} className="mt-0.5 shrink-0" /> : <CloudAlert size={18} className="mt-0.5 shrink-0" />}
            <div>
              <div className="font-semibold">
                {backup.status === "active" ? "On" : backup.status === "needs-permission" ? "Paused: permission needed" : "Not working"}
                {backup.fileName ? ` · ${backup.fileName}` : ""}
              </div>
              <div className="text-meta">{backup.error || `Last written ${relativeTime(backup.lastAt, now)}.`}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {backup.status === "needs-permission" && (
              <Button variant="primary" onClick={backup.resume}>
                <CloudUpload size={15} /> Allow and resume
              </Button>
            )}
            {backup.status === "active" && (
              <Button variant="soft" onClick={backup.backupNow}>
                <RefreshCw size={15} /> Back up now
              </Button>
            )}
            <Button onClick={backup.enable}>
              <FileJson size={15} /> {backup.status === "error" ? "Choose the file again" : "Use another file"}
            </Button>
            <Button variant="ghost" onClick={backup.disable}>
              Turn off
            </Button>
          </div>
          <p className="text-caption text-muted">An empty course list never silently replaces a backup that still has courses.</p>
        </div>
      )}
    </Modal>
  );
}
