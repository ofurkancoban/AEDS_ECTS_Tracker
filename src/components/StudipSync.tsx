import { ArrowRight, Bookmark, ClipboardPaste, ExternalLink, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { categoryById } from "../lib/constants";
import { newCourse } from "../lib/io";
import { BOOKMARKLET, STUDIP_URL, STUMS_URL, matchStums, parseStums, pastSemestersFor, type StumsMatch } from "../lib/stums";
import { useTracker } from "../state";
import { Button, CategoryTag, Modal, cx } from "./ui";

export default function StudipSync({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { courses, setCourses, toast } = useTracker();
  const [text, setText] = useState("");
  const [match, setMatch] = useState<StumsMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipUpdate, setSkipUpdate] = useState<Set<string>>(new Set());
  const [skipAdd, setSkipAdd] = useState<Set<string>>(new Set());
  const [semesters, setSemesters] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});

  const reset = () => {
    setText("");
    setMatch(null);
    setError(null);
    setSkipUpdate(new Set());
    setSkipAdd(new Set());
    setSemesters({});
    setManual({});
  };
  const close = () => {
    reset();
    onClose();
  };

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      setError("Could not read the clipboard. Paste manually into the box (Cmd/Ctrl+V).");
    }
  };

  const runMatch = () => {
    setError(null);
    const rows = parseStums(text);
    if (!rows.length) {
      setMatch(null);
      setError(
        'Could not find any finished grades in what you pasted. Make sure you clicked "Expand all" on the StuMS page before copying, and that you selected and copied the achievements table.',
      );
      return;
    }
    // Grades only ever go to real courses, never to what-if ones.
    setMatch(matchStums(rows, courses.filter((c) => !c.hypothetical)));
  };

  const pendingAdds = match ? match.additions.filter((a) => !skipAdd.has(a.row.number)) : [];
  const missingSemester = pendingAdds.filter((a) => !semesters[a.row.number]);
  const updateCount = match ? match.updates.filter((u) => !skipUpdate.has(u.course.id)).length + Object.values(manual).filter(Boolean).length : 0;
  const canApply = !!match && updateCount + pendingAdds.length > 0 && missingSemester.length === 0;

  const apply = () => {
    if (!match || !canApply) return;
    const grades: Record<string, string> = {};
    match.updates.filter((u) => !skipUpdate.has(u.course.id)).forEach((u) => (grades[u.course.id] = u.newGrade));
    match.review.forEach((r) => {
      if (manual[r.number]) grades[manual[r.number]] = r.grade;
    });
    const added = pendingAdds.map((a) =>
      newCourse({
        category: a.category,
        name: a.name,
        ects: a.category === "thesis" ? 30 : 6,
        semester: semesters[a.row.number] || "Unscheduled",
        status: "completed",
        grade: a.row.grade,
      }),
    );
    const n = Object.keys(grades).length;
    setCourses((prev) => prev.map((c) => (grades[c.id] ? { ...c, grade: grades[c.id], status: "completed" as const } : c)).concat(added));
    toast({
      message: `Updated ${n} grade${n === 1 ? "" : "s"} and added ${added.length} new course${added.length === 1 ? "" : "s"}.`,
      tone: "success",
    });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Sync grades from StudIP"
      subtitle="Everything is parsed in your browser. Nothing is sent anywhere."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
          {match && (
            <Button variant="primary" onClick={apply} disabled={!canApply} title={missingSemester.length ? "Pick a semester for every new course" : undefined}>
              Apply updates
            </Button>
          )}
        </>
      }
    >
      {!match ? (
        <div className="grid gap-4">
          <Steps />
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold">4. Paste what you copied</span>
              <Button size="sm" variant="soft" onClick={paste}>
                <ClipboardPaste size={14} /> Paste from clipboard
              </Button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the copied text here if the button above does not work"
              className="field num min-h-28 w-full resize-y !text-[12px] leading-snug"
            />
            {error && <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn">{error}</p>}
            <div className="mt-3 flex justify-end">
              <Button variant="primary" onClick={runMatch} disabled={!text.trim()}>
                Match <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Results
          match={match}
          skipUpdate={skipUpdate}
          setSkipUpdate={setSkipUpdate}
          skipAdd={skipAdd}
          setSkipAdd={setSkipAdd}
          semesters={semesters}
          setSemesters={setSemesters}
          manual={manual}
          setManual={setManual}
          onBack={() => setMatch(null)}
        />
      )}
    </Modal>
  );
}

function Steps() {
  return (
    <ol className="grid gap-3 text-[13.5px] leading-relaxed">
      <li>
        <b>1.</b> Log in to{" "}
        <a className="font-medium text-accent hover:underline" href={STUDIP_URL} target="_blank" rel="noopener noreferrer">
          Stud.IP <ExternalLink size={12} className="inline" />
        </a>{" "}
        first (same university single sign-on StuMS uses).
      </li>
      <li>
        <b>2.</b> Then open your{" "}
        <a className="font-medium text-accent hover:underline" href={STUMS_URL} target="_blank" rel="noopener noreferrer">
          StuMS grades page <ExternalLink size={12} className="inline" />
        </a>
        , you should land straight on it without logging in again.
      </li>
      <li>
        <b>3.</b> Click <b>"Expand all"</b> if you see it, then press <b>Ctrl+A</b> / <b>Cmd+A</b> and copy (<b>Ctrl+C</b> / <b>Cmd+C</b>).
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-panel-2 px-3 py-2.5 text-[12.5px] text-muted">
          <a
            ref={(el) => el?.setAttribute("href", BOOKMARKLET)}
            onClick={(e) => e.preventDefault()}
            title="Drag this to your bookmarks bar. Clicking it here does nothing."
            className="inline-flex cursor-grab items-center gap-1.5 rounded-lg border border-accent px-2.5 py-1 font-semibold text-accent"
          >
            <Bookmark size={13} /> Sync StuMS page
          </a>
          <span>Drag to your bookmarks bar once. Clicking it on the StuMS page does step 3 for you.</span>
        </div>
      </li>
    </ol>
  );
}

function Results({
  match,
  skipUpdate,
  setSkipUpdate,
  skipAdd,
  setSkipAdd,
  semesters,
  setSemesters,
  manual,
  setManual,
  onBack,
}: {
  match: StumsMatch;
  skipUpdate: Set<string>;
  setSkipUpdate: (s: Set<string>) => void;
  skipAdd: Set<string>;
  setSkipAdd: (s: Set<string>) => void;
  semesters: Record<string, string>;
  setSemesters: (s: Record<string, string>) => void;
  manual: Record<string, string>;
  setManual: (s: Record<string, string>) => void;
  onBack: () => void;
}) {
  const { courses } = useTracker();
  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };
  const semOptions = useMemo(() => Object.fromEntries(match.additions.map((a) => [a.row.number, pastSemestersFor(a.name)])), [match]);
  const nothing = !match.updates.length && !match.additions.length && !match.review.length;

  return (
    <div className="grid gap-5">
      {nothing && (
        <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-[13.5px] text-accent">
          <ListChecks size={18} /> Everything is already up to date.
        </div>
      )}

      {match.updates.length > 0 && (
        <Section title={`Matched (${match.updates.length})`}>
          {match.updates.map((u) => (
            <label key={u.course.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2.5">
              <input
                type="checkbox"
                checked={!skipUpdate.has(u.course.id)}
                onChange={() => toggle(skipUpdate, u.course.id, setSkipUpdate)}
                className="accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{u.course.name}</span>
              <span className="num shrink-0 text-[13px] text-muted">
                {u.course.grade || "-"} <span className="font-semibold text-accent">→ {u.newGrade}</span>
              </span>
            </label>
          ))}
        </Section>
      )}

      {match.additions.length > 0 && (
        <Section title={`Not in your tracker yet, add as new course (${match.additions.length})`}>
          {match.additions.map((a) => {
            const on = !skipAdd.has(a.row.number);
            return (
              <div key={a.row.number} className={cx("rounded-xl border border-line bg-panel-2 px-3 py-2.5", !on && "opacity-50")}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={on} onChange={() => toggle(skipAdd, a.row.number, setSkipAdd)} className="mt-1 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1 text-[13.5px] font-medium">{a.name}</span>
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-7 text-[12.5px] text-muted">
                  <CategoryTag id={a.category} />
                  <span className="num rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white dark:text-paper">Grade {a.row.grade}</span>
                  <select
                    className={cx("field ml-auto h-8 !py-0 !text-[12.5px]", on && !semesters[a.row.number] && "!border-warn")}
                    value={semesters[a.row.number] || ""}
                    onChange={(e) => setSemesters({ ...semesters, [a.row.number]: e.target.value })}
                    disabled={!on}
                    aria-label={`Semester for ${a.name}`}
                  >
                    <option value="" disabled>
                      Select semester
                    </option>
                    {semOptions[a.row.number].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {match.review.length > 0 && (
        <Section title={`Needs review (${match.review.length}), pick the matching course or skip`} tone="warn">
          {match.review.map((r) => (
            <div key={r.number} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2.5">
              <span className="min-w-0 flex-1 text-[13.5px]">
                {r.title} <span className="num text-muted">({r.grade})</span>
              </span>
              <select className="field h-8 max-w-[240px] !py-0 !text-[12.5px]" value={manual[r.number] || ""} onChange={(e) => setManual({ ...manual, [r.number]: e.target.value })}>
                <option value="">Skip</option>
                {courses.filter((c) => !c.hypothetical).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({categoryById(c.category).short})
                  </option>
                ))}
              </select>
            </div>
          ))}
        </Section>
      )}

      <div className="flex items-center justify-between text-[12.5px] text-muted">
        <span>{match.unchanged.length ? `${match.unchanged.length} already up to date.` : ""}</span>
        <button onClick={onBack} className="cursor-pointer font-medium text-accent hover:underline">
          Paste again
        </button>
      </div>
    </div>
  );
}

function Section({ title, tone = "accent", children }: { title: string; tone?: "accent" | "warn"; children: React.ReactNode }) {
  return (
    <section>
      <h4 className={cx("mb-2 border-l-[3px] pl-2.5 text-[13px] font-semibold", tone === "warn" ? "border-warn text-warn" : "border-accent")}>{title}</h4>
      <div className="grid grid-cols-1 gap-2">{children}</div>
    </section>
  );
}
