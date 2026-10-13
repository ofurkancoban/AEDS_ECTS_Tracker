import {
  ArchiveRestore,
  CalendarDays,
  CircleHelp,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Gift,
  LayoutDashboard,
  Library,
  ListChecks,
  Menu as MenuIcon,
  Moon,
  Redo2,
  Search,
  Palette,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Route,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { AddCourseDialog } from "./components/AddCourse";
import { AppearanceModal } from "./components/Appearance";
import { MoveSheet } from "./components/MoveSheet";
import { ChangelogModal, HowItWorksModal, ShareModal, useChangelog, useDataActions, useQrImport } from "./components/DataActions";
import { Button, ConfirmDialog, IconButton, Menu, MenuDivider, MenuItem, MenuLabel, Modal, Toasts, cx } from "./components/ui";
import { TOTAL_REQUIRED } from "./lib/constants";
import { currentSemester } from "./lib/semesters";
import { hitGlobalCounter } from "./lib/storage";
import { TrackerProvider, useTracker, type View } from "./state";
import { Courses } from "./views/Courses";
import { Overview } from "./views/Overview";

const NAV: { id: View; label: string; icon: ReactNode; blurb: string }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={18} />, blurb: "Your progress at a glance" },
  { id: "courses", label: "Courses", icon: <Library size={18} />, blurb: "Everything you've taken and planned, by requirement" },
  { id: "timeline", label: "Timeline", icon: <CalendarDays size={18} />, blurb: "Semester by semester. Drag cards to reschedule" },
  { id: "planner", label: "Planner", icon: <Route size={18} />, blurb: "What to take next, how to finish, and what grades you need" },
  { id: "catalog", label: "Catalog", icon: <Search size={18} />, blurb: "Every AEDS module, with filters, offering history and difficulty" },
  { id: "checklist", label: "Checklist", icon: <ListChecks size={18} />, blurb: "Graduation requirements, ticked off" },
];

// Loaded on demand so they don't weigh on the first paint.
const Assistant = lazy(() => import("./components/Assistant"));
const Timeline = lazy(() => import("./views/Timeline").then((m) => ({ default: m.Timeline })));
const Planner = lazy(() => import("./views/Planner").then((m) => ({ default: m.Planner })));
const Catalog = lazy(() => import("./views/Catalog").then((m) => ({ default: m.Catalog })));
const Checklist = lazy(() => import("./views/Checklist").then((m) => ({ default: m.Checklist })));
const StudipSync = lazy(() => import("./components/StudipSync"));

export default function App() {
  return (
    <TrackerProvider>
      <Shell />
    </TrackerProvider>
  );
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<unknown>;
}

function Shell() {
  const { view, setView, state, patch, whatIf, setWhatIf, openAdd, stats, undo, redo, undoCount, redoCount, courses, studipOpen, setStudipOpen, toast } = useTracker();
  const [assistantReady, setAssistantReady] = useState(false);
  const data = useDataActions();
  const changelog = useChangelog();
  const [howOpen, setHowOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [visits, setVisits] = useState<number | null>(null);
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);
  useQrImport();

  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(() => setAssistantReady(true));
    else window.setTimeout(() => setAssistantReady(true), 800);
  }, []);

  useEffect(() => {
    hitGlobalCounter().then(setVisits);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (changelog.unseen) setLogOpen(true);
  }, [changelog.unseen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || "");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openAdd();
      } else if ((e.metaKey || e.ctrlKey) && !typing && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
        if (!redoCount) return;
        e.preventDefault();
        redo();
        toast({ message: "Redone" });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        if (!undoCount) return;
        e.preventDefault();
        undo();
        toast({ message: "Undone", action: { label: "Redo", run: redo } });
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && /^[1-6]$/.test(e.key) && !document.querySelector('[aria-modal="true"]')) {
        setView(NAV[parseInt(e.key, 10) - 1].id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openAdd, undo, redo, undoCount, redoCount, setView, toast]);

  const isStandalone =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const isMobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 1023px)").matches;
  const showInstall = !isStandalone && isMobile && !state.installBannerDismissed && courses.length > 0;

  const current = NAV.find((n) => n.id === view)!;
  const toggleTheme = () => patch({ theme: state.theme === "dark" ? "light" : "dark" });

  const dataMenu = (
    <Menu
      width="w-72"
      trigger={(open, toggle) => (
        <Button variant="outline" onClick={toggle} className={cx(open && "border-line-strong")}>
          <Database size={16} /> <span className="hidden sm:inline">Data</span>
        </Button>
      )}
    >
      {(close) => {
        const run = (fn: () => void) => () => {
          close();
          fn();
        };
        return (
          <>
            <MenuLabel>Load</MenuLabel>
            <MenuItem icon={<RefreshCw size={16} />} hint="Paste your StuMS achievements page" onClick={run(data.syncStudip)}>
              Sync from StudIP
            </MenuItem>
            <MenuItem icon={<Upload size={16} />} onClick={run(data.importCsv)}>
              Import CSV
            </MenuItem>
            <MenuItem icon={<FileJson size={16} />} onClick={run(data.importJson)}>
              Restore JSON backup
            </MenuItem>
            <MenuItem icon={<ArchiveRestore size={16} />} disabled={!data.hasAutoBackup} onClick={run(data.restoreAuto)}>
              Restore automatic backup
            </MenuItem>
            <MenuDivider />
            <MenuLabel>Save and share</MenuLabel>
            <MenuItem
              icon={<Download size={16} />}
              hint={state.lastBackupAt ? `Last: ${new Date(state.lastBackupAt).toLocaleDateString()}` : "Never backed up"}
              onClick={run(data.exportJson)}
            >
              Download JSON backup
            </MenuItem>
            <MenuItem icon={<FileSpreadsheet size={16} />} onClick={run(data.exportCsv)}>
              Export CSV
            </MenuItem>
            <MenuItem icon={<QrCode size={16} />} hint="Move your plan to another device" onClick={run(data.share)}>
              Share via QR code
            </MenuItem>
            <MenuItem icon={<Printer size={16} />} onClick={run(data.print)}>
              Print
            </MenuItem>
            <MenuDivider />
            <MenuItem danger icon={<Trash2 size={16} />} onClick={run(data.reset)}>
              Reset tracker
            </MenuItem>
          </>
        );
      }}
    </Menu>
  );

  return (
    <div className="min-h-screen lg:pl-[248px]">
      {/* Sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line bg-panel/70 px-4 py-5 backdrop-blur-xl lg:flex">
        <Brand />
        <nav className="mt-8 grid gap-1">
          {NAV.map((n, i) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={cx(
                "group flex h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition",
                view === n.id ? "bg-ink text-paper shadow-[var(--shadow)]" : "text-muted hover:bg-ink/5 hover:text-ink",
              )}
            >
              {n.icon}
              <span className="flex-1 text-left">{n.label}</span>
              <kbd className={cx("num text-[10.5px] opacity-0 transition group-hover:opacity-60", view === n.id && "opacity-50")}>{i + 1}</kbd>
            </button>
          ))}
        </nav>

        <div className="mt-6 rounded-2xl border border-line bg-panel p-3.5">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span>{currentSemester()}</span>
            <span className="num">
              {stats.completed}/{TOTAL_REQUIRED}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${(stats.completed / TOTAL_REQUIRED) * 100}%` }} />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[12px] text-muted">GPA</span>
            <span className="num text-[15px] font-semibold">{stats.gpa || "-"}</span>
          </div>
        </div>

        <WhatIfToggle whatIf={whatIf} setWhatIf={setWhatIf} className="mt-3" />

        <div className="mt-auto grid gap-1 text-[13px]">
          <SideLink icon={<CircleHelp size={16} />} onClick={() => setHowOpen(true)}>
            How it works
          </SideLink>
          <SideLink icon={<Gift size={16} />} onClick={() => setLogOpen(true)} dot={changelog.unseen}>
            What's new
          </SideLink>
          <SideLink icon={<Palette size={16} />} onClick={() => setAppearanceOpen(true)}>
            Appearance
          </SideLink>
          <SideLink icon={state.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} onClick={toggleTheme}>
            {state.theme === "dark" ? "Light mode" : "Dark mode"}
          </SideLink>
        </div>
      </aside>

      {/* Top bar */}
      <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-paper/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="hidden min-w-0 flex-1 lg:block">
            <h1 className="font-serif text-[22px] leading-tight font-semibold tracking-tight">{current.label}</h1>
            <p className="truncate text-[12.5px] text-muted">{current.blurb}</p>
          </div>
          <div className="flex-1 lg:hidden" />
          <div className="flex items-center">
            <IconButton label="Undo (Ctrl/Cmd+Z)" onClick={undo} disabled={!undoCount} className="disabled:pointer-events-none disabled:opacity-30">
              <Undo2 size={17} />
            </IconButton>
            <IconButton label="Redo (Ctrl/Cmd+Shift+Z)" onClick={redo} disabled={!redoCount} className="disabled:pointer-events-none disabled:opacity-30">
              <Redo2 size={17} />
            </IconButton>
          </div>
          {dataMenu}
          <div className="hidden lg:block">
            <Button variant="primary" onClick={() => openAdd()}>
              <Plus size={17} /> Add course
              <kbd className="num ml-1 rounded-md bg-white/15 px-1.5 text-[10.5px] font-medium">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</kbd>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5 pb-[calc(110px+env(safe-area-inset-bottom))] sm:px-6 lg:pt-7 lg:pb-16">
        <div className="mb-4 lg:hidden">
          <h1 className="font-serif text-[26px] font-semibold tracking-tight">{current.label}</h1>
          <p className="text-[13px] text-muted">{current.blurb}</p>
          <WhatIfToggle whatIf={whatIf} setWhatIf={setWhatIf} className="mt-3" />
        </div>

        {whatIf && (
          <div className="rise mb-4 flex items-center gap-2 rounded-2xl border border-dashed border-warn/60 bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
            <Sparkles size={15} />
            <span className="flex-1">
              What-if mode: new courses are simulated and only affect the projected GPA. Turning it off discards them.
            </span>
          </div>
        )}

        {showInstall && (
          <div className="rise mb-4 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-[13px]">
            <Smartphone size={18} className="text-accent" />
            <span className="flex-1">
              {installEvt ? "Install the tracker on your home screen for quick access." : "Add this page to your home screen (Share → Add to Home Screen) for quick access."}
            </span>
            {installEvt && (
              <Button
                size="sm"
                variant="soft"
                onClick={async () => {
                  await installEvt.prompt();
                  setInstallEvt(null);
                  patch({ installBannerDismissed: true });
                }}
              >
                Install
              </Button>
            )}
            <IconButton label="Dismiss" onClick={() => patch({ installBannerDismissed: true })}>
              <X size={16} />
            </IconButton>
          </div>
        )}

        <Suspense fallback={<div className="py-20 text-center text-[13px] text-faint">Loading…</div>}>
        <div key={view} className="rise">
          {view === "overview" && <Overview onBackup={data.exportJson} />}
          {view === "courses" && <Courses />}
          {view === "timeline" && <Timeline />}
          {view === "planner" && <Planner />}
          {view === "catalog" && <Catalog />}
          {view === "checklist" && <Checklist />}
        </div>
        </Suspense>

        <Footer visits={visits} usage={state.usageCount} />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {NAV.slice(0, 2).map((n) => (
            <NavTab key={n.id} item={n} active={view === n.id} onClick={() => setView(n.id)} />
          ))}
          <div className="flex justify-center">
            <button
              onClick={() => openAdd()}
              aria-label="Add course"
              className="-mt-7 flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl bg-accent text-white shadow-[0_10px_24px_-8px_var(--accent)] transition active:scale-95 dark:text-paper"
            >
              <Plus size={24} />
            </button>
          </div>
          <NavTab item={NAV.find((n) => n.id === "planner")!} active={view === "planner"} onClick={() => setView("planner")} />
          <NavTab
            item={{ id: "overview", label: "More", icon: <MenuIcon size={18} />, blurb: "" }}
            active={moreOpen || ["timeline", "catalog", "checklist"].includes(view)}
            onClick={() => setMoreOpen(true)}
          />
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More" width="max-w-md">
        <div className="grid grid-cols-3 gap-2">
          {NAV.filter((n) => ["timeline", "catalog", "checklist"].includes(n.id)).map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setMoreOpen(false);
                setView(n.id);
              }}
              className={cx(
                "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-[13px] font-medium",
                view === n.id ? "border-accent bg-accent-soft text-accent" : "border-line",
              )}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-1 border-t border-line pt-3 text-[14px]">
          <SideLink
            icon={<CircleHelp size={17} />}
            onClick={() => {
              setMoreOpen(false);
              setHowOpen(true);
            }}
          >
            How it works
          </SideLink>
          <SideLink
            icon={<Gift size={17} />}
            dot={changelog.unseen}
            onClick={() => {
              setMoreOpen(false);
              setLogOpen(true);
            }}
          >
            What's new
          </SideLink>
          <SideLink
            icon={<Palette size={17} />}
            onClick={() => {
              setMoreOpen(false);
              setAppearanceOpen(true);
            }}
          >
            Appearance
          </SideLink>
          <SideLink icon={state.theme === "dark" ? <Sun size={17} /> : <Moon size={17} />} onClick={toggleTheme}>
            {state.theme === "dark" ? "Light mode" : "Dark mode"}
          </SideLink>
        </div>
      </Modal>
      <AppearanceModal open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />

      {data.fileInputs}
      <AddCourseDialog />
      <ShareModal share={data.shareState} onClose={data.closeShare} />
      <HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />
      <ChangelogModal
        open={logOpen}
        entries={changelog.entries}
        onClose={() => {
          setLogOpen(false);
          changelog.markSeen();
        }}
      />
      <MoveSheet />
      <ConfirmDialog />
      <Toasts />
      <Suspense fallback={null}>
        {assistantReady && <Assistant />}
        {studipOpen && <StudipSync open onClose={() => setStudipOpen(false)} />}
      </Suspense>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="./favicon-512.png" alt="" className="h-9 w-9 rounded-xl shadow-[var(--shadow)]" />
      <div className="leading-tight">
        <div className="font-serif text-[17px] font-semibold tracking-tight whitespace-nowrap">AEDS Credit Tracker</div>
        {!compact && <div className="text-[11.5px] text-muted">Applied Economics & Data Science</div>}
      </div>
    </div>
  );
}

function SideLink({ icon, children, onClick, dot }: { icon: ReactNode; children: ReactNode; onClick: () => void; dot?: boolean }) {
  return (
    <button onClick={onClick} className="flex h-9 cursor-pointer items-center gap-3 rounded-xl px-3 text-muted transition hover:bg-ink/5 hover:text-ink">
      {icon}
      <span className="flex-1 text-left">{children}</span>
      {dot && <span className="h-2 w-2 rounded-full bg-warn" />}
    </button>
  );
}

function NavTab({ item, active, onClick }: { item: (typeof NAV)[number]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx("flex h-full cursor-pointer flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition", active ? "text-accent" : "text-muted")}
    >
      <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition", active && "bg-accent-soft")}>{item.icon}</span>
      {item.label}
    </button>
  );
}

function WhatIfToggle({ whatIf, setWhatIf, className }: { whatIf: boolean; setWhatIf: (v: boolean) => void; className?: string }) {
  return (
    <button
      onClick={() => setWhatIf(!whatIf)}
      className={cx(
        "flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-[13px] transition",
        whatIf ? "border-warn/60 bg-warn-soft text-warn" : "border-line bg-panel text-muted hover:text-ink",
        className,
      )}
      role="switch"
      aria-checked={whatIf}
    >
      <Sparkles size={16} />
      <span className="flex-1">
        <span className="block font-medium">What-if mode</span>
        <span className="block text-[11.5px] opacity-80">Simulate courses and grades</span>
      </span>
      <span className={cx("relative h-5 w-9 rounded-full transition", whatIf ? "bg-warn" : "bg-line-strong")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", whatIf ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function Footer({ visits, usage }: { visits: number | null; usage: number }) {
  const { catalog } = useTracker();
  const updated = catalog.lastModified ? new Date(catalog.lastModified) : null;
  return (
    <footer className="no-print mt-12 grid gap-2 border-t border-line pt-6 text-[12px] leading-relaxed text-faint">
      <p>
        Data is saved locally in this browser only. Clearing your browser's cookies or site data will delete it, so back up regularly from the Data menu.
      </p>
      <p>
        Unofficial tool, not affiliated with the University of Oldenburg. Always double-check requirements with the official examination regulations.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {updated && !isNaN(updated.getTime()) && <span>Catalog updated {updated.toLocaleDateString()}</span>}
        <span>You've opened the tracker {usage} time{usage === 1 ? "" : "s"}</span>
        {visits !== null && <span>{visits.toLocaleString()} opens across all students</span>}
        <a href="./legacy/" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
          Classic view
        </a>
      </div>
    </footer>
  );
}
