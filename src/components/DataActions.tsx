import { Copy, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_IDS, STATUS_LABEL, TOTAL_REQUIRED } from "../lib/constants";
import { coursesFromCsv, coursesToCsv, decodeShare, encodeShare, escapeHtml, shareUrl } from "../lib/io";
import { encodeQR } from "../lib/qr";
import { downloadFile, latestAutoBackup } from "../lib/storage";
import type { Course } from "../lib/types";
import { useTracker } from "../state";
import { Button, Modal } from "./ui";


export interface DataActions {
  exportCsv: () => void;
  exportJson: () => void;
  importCsv: () => void;
  importJson: () => void;
  restoreAuto: () => void;
  syncStudip: () => void;
  share: () => void;
  print: () => void;
  reset: () => void;
  hasAutoBackup: boolean;
  shareState: ShareState | null;
  closeShare: () => void;
  fileInputs: React.ReactNode;
}

interface ShareState {
  payload: string;
  matrix: boolean[][] | null;
  error: string | null;
}

export function useDataActions(): DataActions {
  const { courses, setCourses, patch, stats, toast, confirm, setStudipOpen } = useTracker();
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [shareState, setShareState] = useState<ShareState | null>(null);

  const exportCsv = useCallback(() => downloadFile("ects-transcript.csv", coursesToCsv(courses), "text/csv"), [courses]);

  const exportJson = useCallback(() => {
    downloadFile("ects-tracker-backup.json", JSON.stringify(courses, null, 2), "application/json");
    patch({ lastBackupAt: new Date().toISOString() });
    toast({ message: "Backup downloaded", tone: "success" });
  }, [courses, patch, toast]);

  const readFile = (input: HTMLInputElement, cb: (text: string) => void) => {
    const f = input.files && input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => cb(String(r.result || ""));
    r.readAsText(f);
    input.value = "";
  };

  const onCsv = (e: React.ChangeEvent<HTMLInputElement>) =>
    readFile(e.target, (text) => {
      try {
        const { courses: list, skipped } = coursesFromCsv(text);
        if (!list.length) {
          toast({
            message: `No valid rows found. The CSV needs a header with category, name, ects (category one of: ${CATEGORY_IDS.join(", ")}).`,
            tone: "warn",
          });
          return;
        }
        setCourses((cs) => [...cs, ...list]);
        toast({ message: `Imported ${list.length} course(s)${skipped ? `, skipped ${skipped} invalid row(s)` : ""}.`, tone: "success" });
      } catch {
        toast({ message: "Could not read this file as CSV.", tone: "warn" });
      }
    });

  const onJson = (e: React.ChangeEvent<HTMLInputElement>) =>
    readFile(e.target, async (text) => {
      try {
        const data = JSON.parse(text);
        const list: Course[] | null = Array.isArray(data) ? data : Array.isArray(data?.courses) ? data.courses : null;
        if (!list) {
          toast({ message: "This file does not look like a valid backup.", tone: "warn" });
          return;
        }
        const ok =
          !courses.length ||
          (await confirm({
            title: "Restore this backup?",
            body: `Your current ${courses.length} course(s) will be replaced by the ${list.length} course(s) in the file.`,
            confirmLabel: "Replace",
          }));
        if (ok) {
          setCourses(() => list);
          toast({ message: `Restored ${list.length} course(s).`, tone: "success" });
        }
      } catch {
        toast({ message: "Could not read this file as JSON.", tone: "warn" });
      }
    });

  const auto = useMemo(() => latestAutoBackup(), [courses]);

  const restoreAuto = useCallback(async () => {
    const b = latestAutoBackup();
    if (!b || !Array.isArray(b.state.courses)) {
      toast({ message: "No automatic backup available yet.", tone: "warn" });
      return;
    }
    const ok = await confirm({
      title: "Restore the automatic backup?",
      body: `Saved ${new Date(b.t).toLocaleString()}, with ${b.state.courses.length} course(s). Your current list will be replaced.`,
      confirmLabel: "Restore",
    });
    if (ok) {
      setCourses(() => b.state.courses as Course[]);
      toast({ message: "Automatic backup restored.", tone: "success" });
    }
  }, [confirm, setCourses, toast]);

  const syncStudip = useCallback(() => setStudipOpen(true), [setStudipOpen]);

  const share = useCallback(() => {
    const real = courses.filter((c) => !c.hypothetical);
    const payload = encodeShare(real);
    const link = shareUrl(payload) || payload;
    const qr = encodeQR(link);
    const bytes = new TextEncoder().encode(link).length;
    setShareState({
      payload: link,
      matrix: qr ? qr.matrix : null,
      error: qr ? null : `Too much data for a QR code (${bytes} bytes, max 271). Use the link below or CSV/JSON export instead.`,
    });
  }, [courses]);

  const print = useCallback(() => {
    const w = window.open("", "_blank");
    if (!w) {
      toast({ message: "Please allow popups for this site, then try Print again.", tone: "warn" });
      return;
    }
    const sections = stats.categories
      .map((cat) => {
        const rows = cat.items
          .map(
            (c) =>
              `<tr><td>${escapeHtml(c.name)}</td><td>${c.ects}</td><td>${escapeHtml(c.semester)}</td><td>${STATUS_LABEL[c.status]}</td><td>${
                c.status === "completed" ? escapeHtml(c.grade || "") : ""
              }</td></tr>`,
          )
          .join("");
        return `<h2>${escapeHtml(cat.name)} (${cat.completed}/${cat.required} ECTS)</h2><table><thead><tr><th>Course</th><th>ECTS</th><th>Semester</th><th>Status</th><th>Grade</th></tr></thead><tbody>${
          rows || '<tr><td colspan="5">No courses added</td></tr>'
        }</tbody></table>`;
      })
      .join("");
    w.document.open();
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Applied Economics and Data Science Credit Tracker</title>
<style>body{font-family:Georgia,serif;color:#1C2333;padding:24px}h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;margin-top:24px;margin-bottom:6px;border-bottom:1px solid #ccc;padding-bottom:4px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #ddd;text-align:left;padding:4px 6px}.summary{font-size:13px;margin-top:4px;color:#444}</style>
</head><body><h1>Applied Economics and Data Science Credit Tracker</h1><div class="summary">Total: ${stats.completed + stats.inProgress} / ${TOTAL_REQUIRED} ECTS accounted for${
      stats.gpa ? `, GPA ${stats.gpa}` : ""
    }</div>${sections}</body></html>`);
    w.document.close();
    w.focus();
    window.setTimeout(() => w.print(), 300);
  }, [stats, toast]);

  const reset = useCallback(async () => {
    const ok = await confirm({
      title: "Reset the tracker?",
      body: "All courses will be deleted. Download a backup first if you might need them. The last few versions stay restorable from the automatic backup.",
      confirmLabel: "Delete everything",
      danger: true,
    });
    if (ok) {
      setCourses(() => []);
      toast({ message: "Tracker reset." });
    }
  }, [confirm, setCourses, toast]);

  const fileInputs = (
    <>
      <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={onCsv} />
      <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={onJson} />
    </>
  );

  return {
    exportCsv,
    exportJson,
    importCsv: () => csvRef.current?.click(),
    importJson: () => jsonRef.current?.click(),
    restoreAuto,
    syncStudip,
    share,
    print,
    reset,
    hasAutoBackup: !!auto,
    shareState,
    closeShare: () => setShareState(null),
    fileInputs,
  };
}

export function ShareModal({ share, onClose }: { share: ShareState | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!share?.matrix || !canvasRef.current) return;
    const m = share.matrix;
    const quiet = 3;
    const scale = Math.max(4, Math.floor(260 / (m.length + quiet * 2)));
    const size = (m.length + quiet * 2) * scale;
    const cv = canvasRef.current;
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#1C2333";
    m.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale)));
  }, [share]);
  return (
    <Modal
      open={!!share}
      onClose={onClose}
      title="Share your plan"
      subtitle="Scan on another device to import the same course list. Grades and statuses are included."
      width="max-w-md"
    >
      {share?.matrix ? (
        <div className="flex justify-center rounded-2xl border border-line bg-white p-4">
          <canvas ref={canvasRef} className="h-auto w-full max-w-[260px] [image-rendering:pixelated]" />
        </div>
      ) : (
        <div className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">{share?.error}</div>
      )}
      <div className="mt-4 flex items-center gap-2">
        <input readOnly value={share?.payload || ""} className="field num min-w-0 flex-1 !text-[12px]" onFocus={(e) => e.target.select()} />
        <Button
          variant="soft"
          onClick={() => {
            navigator.clipboard?.writeText(share?.payload || "").then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Modal>
  );
}

/** Handles "#qrimport=" links (same format as the classic UI). */
export function useQrImport() {
  const { setCourses, confirm, toast } = useTracker();
  useEffect(() => {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#qrimport=")) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    let list: Course[] = [];
    try {
      list = decodeShare(decodeURIComponent(hash.slice(10)));
    } catch {
      return;
    }
    if (!list.length) return;
    confirm({
      title: "Import shared courses?",
      body: `Import ${list.length} course(s) from this shared link? They will be added to your current list.`,
      confirmLabel: "Import",
    }).then((ok) => {
      if (ok) {
        setCourses((cs) => [...cs, ...list]);
        toast({ message: `Imported ${list.length} course(s).`, tone: "success" });
      }
    });
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const HOW_IT_WORKS = [
  {
    title: "What this is",
    body: "A private, browser-only progress tracker for the AEDS (Applied Economics and Data Science) master's programme at the University of Oldenburg. There is no account and no server: everything you enter is stored locally in this browser, on this device.",
  },
  {
    title: "Categories and ECTS",
    body: `Courses are grouped into ${CATEGORIES.filter((c) => c.required > 0)
      .map((c) => c.name)
      .join(", ")}, each with a required ECTS target that counts toward your ${TOTAL_REQUIRED} ECTS total. Further modules and Additional courses are tracked too, but don't count toward that total.`,
  },
  {
    title: "Course status",
    body: "Each course is Planned, In progress, or Completed. Once you mark a course Completed and enter a grade, it feeds into your overall and per-category GPA automatically.",
  },
  {
    title: "Adding and planning",
    body: "Press Add course (or Ctrl/Cmd + K) to search the catalog, or drag a course from \"Open this semester\" into a category. The Planner suggests next-semester options and a full path to graduation. What-if mode lets you simulate courses and grades without touching your real progress.",
  },
  {
    title: "Loading real data",
    body: "Import a CSV or JSON backup, or use Data → Sync from StudIP to paste your StuMS achievements page. Grades are matched to your existing courses (or missing ones are added from the catalog) by module code.",
  },
  {
    title: "Backups",
    body: "Export a CSV or JSON backup anytime from the Data menu. The app also keeps automatic local backups you can restore from if something goes wrong.",
  },
  {
    title: "AEDS Assistant",
    body: "The chat bubble in the corner answers questions about the programme. Turning on its \"Consider my course list\" toggle lets it tailor answers (like which courses to take next semester) to what you've actually completed. This is sent only while the toggle is on, and only to answer your question.",
  },
  {
    title: "Privacy",
    body: "Nothing is uploaded automatically. Your course data stays in this browser unless you export it yourself or opt in to share it with the assistant.",
  },
];

export function HowItWorksModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How ECTS Tracker works" width="max-w-xl" footer={<Button variant="primary" onClick={onClose}>Got it</Button>}>
      <div className="grid gap-4">
        {HOW_IT_WORKS.map((s, i) => (
          <div key={s.title} className="flex gap-3">
            <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{i + 1}</span>
            <div>
              <div className="font-semibold">{s.title}</div>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export interface ChangelogEntry {
  version: string;
  items: string[];
}

export function useChangelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    fetch("./CHANGELOG.json")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list) => {
        if (!Array.isArray(list) || !list.length) return;
        setEntries(list);
        let seen: string | null = null;
        try {
          seen = localStorage.getItem("changelog_seen");
        } catch {
          /* ignore */
        }
        setUnseen(seen !== list[0].version);
      });
  }, []);
  const markSeen = useCallback(() => {
    if (entries[0])
      try {
        localStorage.setItem("changelog_seen", entries[0].version);
      } catch {
        /* ignore */
      }
    setUnseen(false);
  }, [entries]);
  return { entries, unseen, markSeen };
}

export function ChangelogModal({ open, onClose, entries }: { open: boolean; onClose: () => void; entries: ChangelogEntry[] }) {
  return (
    <Modal open={open} onClose={onClose} title="What's new" width="max-w-xl" footer={<Button variant="primary" onClick={onClose}>Got it</Button>}>
      <div className="relative grid gap-6 border-l border-line pl-5">
        {entries.slice(0, 8).map((e, i) => (
          <div key={e.version} className="relative">
            <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-panel ${i === 0 ? "bg-accent" : "bg-line-strong"}`} />
            <div className="num text-[12px] font-semibold text-muted">{e.version}</div>
            <ul className="mt-1.5 grid gap-1.5 text-[13.5px] leading-relaxed">
              {e.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
