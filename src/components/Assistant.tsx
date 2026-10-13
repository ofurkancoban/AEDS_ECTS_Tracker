import { ArrowUp, BookOpen, Check, ChevronDown, Copy, ExternalLink, MessageCircle, Plus, RotateCw, Search, Square, ThumbsDown, ThumbsUp, Trash2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AEDS_RAG_WEB,
  GREETING,
  STAGE_LABELS,
  SUGGESTIONS,
  StreamInterrupted,
  StreamStopped,
  buildCourseContext,
  clearConversation,
  closeOpenBold,
  compactPassages,
  escapeHtml,
  formatAnswer,
  loadIncludeCourses,
  loadMessages,
  saveIncludeCourses,
  saveMessages,
  sendFeedback,
  streamChat,
  withContext,
  type ChatMessage,
} from "../lib/assistant";
import { catalogCourse, codeOf, offeringPattern, resolveCode, type Catalog } from "../lib/catalog";
import { focusCatalog } from "../lib/catalogFocus";
import { citation, groupSources, stripCitations } from "../lib/citations";
import { CATEGORIES } from "../lib/constants";
import { followUps } from "../lib/followUps";
import type { Course } from "../lib/types";
import { useTracker } from "../state";
import { cx } from "./ui";

const MOBILE = "(max-width: 640px)";

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia(MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

/** Keeps a full-screen panel inside the visual viewport so the iOS keyboard never covers the input. */
function useVisualViewport(active: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) {
      setBox(null);
      return;
    }
    const sync = () => setBox({ top: vv.offsetTop, height: vv.height });
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [active]);
  return box;
}

export default function Assistant() {
  const { courses, state, catalog, openAdd, setView } = useTracker();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [include, setInclude] = useState(loadIncludeCourses);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const [confirmClear, setConfirmClear] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Closed: not just transparent but unreachable by keyboard and screen readers
  // (React 18 has no `inert` prop, so set the attribute directly).
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mobile = useIsMobile();
  const vv = useVisualViewport(open && mobile);

  useEffect(() => saveMessages(messages), [messages]);

  // Follow the answer as it grows, unless the reader scrolled up to read something.
  const stick = useRef(true);
  const onScroll = () => {
    const b = bodyRef.current;
    if (b) stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 48;
  };
  useLayoutEffect(() => {
    const b = bodyRef.current;
    if (b && stick.current) b.scrollTop = b.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    if (mobile) document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      if (mobile) document.body.style.overflow = "";
    };
  }, [open, mobile]);

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(100, ta.scrollHeight) + "px";
  }, [input]);

  // Patches the answer that is currently arriving (always the last message).
  const patchLast = (f: (m: ChatMessage) => ChatMessage) =>
    setMessages((all) => (all.length && all[all.length - 1].streaming ? [...all.slice(0, -1), f(all[all.length - 1])] : all));

  const ask = async (text: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    stick.current = true;
    setMessages((m) => [...m, { role: "assistant", text: "", streaming: true, stage: "understanding" }]);
    const message = include ? withContext(text, buildCourseContext(courses, state.targetGrade)) : text;
    // Tokens arrive faster than the screen refreshes; render at most once per frame.
    let pending = "";
    let frame = 0;
    const flush = () => {
      frame = 0;
      const add = pending;
      pending = "";
      if (add) patchLast((m) => ({ ...m, text: m.text + add, stage: "writing" }));
    };
    try {
      const res = await streamChat(message, {
        signal: controller.signal,
        onStage: (stage) => patchLast((m) => ({ ...m, stage })),
        onToken: (t) => {
          pending += t;
          if (!frame) frame = requestAnimationFrame(flush);
        },
      });
      cancelAnimationFrame(frame);
      // The server's final text replaces the streamed one (it may tidy it up).
      patchLast(() => ({ role: "assistant", text: res.answer, sources: res.sources || [], retrieval: compactPassages(res.retrieval), queryLogId: res.query_log_id || null }));
    } catch (err) {
      cancelAnimationFrame(frame);
      if (err instanceof StreamStopped) {
        // Whatever had arrived stays, marked as stopped; nothing arrived: just the note.
        const partial = err.partial;
        if (partial.trim()) patchLast(() => ({ role: "assistant", text: partial, stopped: true }));
        else setMessages((all) => [...all.filter((m) => !m.streaming), { role: "system", text: "Stopped." }]);
      } else if (err instanceof StreamInterrupted && err.partial.trim()) {
        patchLast(() => ({ role: "assistant", text: err.partial, interrupted: true }));
      } else {
        setMessages((all) => [
          ...all.filter((m) => !m.streaming),
          { role: "system", text: err instanceof Error && err.message ? err.message : "Something went wrong, please try again.", interrupted: err instanceof StreamInterrupted },
        ]);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  };

  const stop = () => abortRef.current?.abort();

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    ask(text);
  };

  /** Asks the question before an interrupted answer again, replacing that answer. */
  const retry = (index: number) => {
    if (sending) return;
    const question = [...messages.slice(0, index)].reverse().find((m) => m.role === "user");
    if (!question) return;
    setMessages((m) => m.filter((_, i) => i !== index));
    ask(question.text);
  };

  const rate = (index: number, rating: 1 | -1) => {
    setMessages((m) => m.map((x, i) => (i === index ? { ...x, feedbackRating: rating } : x)));
    const id = messages[index]?.queryLogId;
    if (id) sendFeedback(id, rating).catch(() => {});
  };

  const clear = () => {
    abortRef.current?.abort();
    clearConversation();
    setMessages([]);
    setConfirmClear(false);
  };

  const isCode = useCallback((code: string) => !!catalogCourse(code, catalog), [catalog]);
  // On a phone the chat covers the app, so step aside when sending the reader there.
  const leave = () => mobile && setOpen(false);
  const showModule = (code: string) => {
    focusCatalog(code);
    setView("catalog");
    leave();
  };
  const addModule = (code: string) => {
    const c = catalogCourse(code, catalog);
    if (!c) return;
    openAdd({ name: c.label, category: c.category });
    leave();
  };

  const next = useMemo(() => {
    const last = messages[messages.length - 1];
    if (sending || !last || last.role !== "assistant" || last.streaming || last.interrupted || last.stopped) return [];
    const asked = messages.filter((m) => m.role === "user").map((m) => m.text);
    const codes = [...new Set((last.text.match(/\b[A-Za-z]{2,5}\d{2,4}\b/g) || []).map((c) => c.toLowerCase()))].filter(isCode);
    return followUps(asked[asked.length - 1] || "", last.text, asked, codes);
  }, [messages, sending, isCode]);

  const shown: (ChatMessage & { greeting?: boolean })[] = messages.length ? messages : [{ role: "assistant", text: GREETING, greeting: true }];

  return createPortal(
    <>
      {!(open && mobile) && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close AEDS AI Assistant" : "Open AEDS AI Assistant chat"}
          data-tour="assistant"
          className="no-print fixed right-[calc(20px+env(safe-area-inset-right))] bottom-[calc(var(--aeds-bubble-bottom)+env(safe-area-inset-bottom))] z-[9500] flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_28px_-8px_var(--accent)] transition hover:scale-105 active:scale-95 dark:text-paper"
        >
          {open ? <X size={24} /> : <MessageCircle size={25} />}
        </button>
      )}

      <section
        role="dialog"
        aria-label="AEDS AI Assistant"
        aria-hidden={!open}
        ref={panelRef}
        data-tour={open ? "assistant-panel" : undefined}
        style={mobile && vv ? { top: vv.top, height: vv.height } : undefined}
        className={cx(
          "no-print fixed z-[9500] flex flex-col overflow-hidden border-line bg-panel shadow-[var(--shadow-lg)] transition-[opacity,transform] duration-200",
          mobile
            ? "inset-x-0 top-0 h-[100dvh] border-0"
            : "right-5 bottom-[calc(var(--aeds-bubble-bottom)+72px)] h-[560px] max-h-[calc(100vh-120px)] w-[380px] origin-bottom-right rounded-3xl border",
          open ? "opacity-100" : "pointer-events-none invisible translate-y-2 opacity-0",
        )}
      >
        <header className="flex shrink-0 items-center gap-2 bg-accent px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3 text-white sm:pt-3 dark:text-paper">
          <MessageCircle size={18} />
          <span className="font-serif text-title-sm font-semibold">AEDS AI Assistant</span>
          <a href={AEDS_RAG_WEB} target="_blank" rel="noopener noreferrer" title="Open in a new tab" aria-label="Open AEDS AI Assistant in a new tab" className="opacity-75 hover:opacity-100">
            <ExternalLink size={14} />
          </a>
          <span className="flex-1" />
          <button onClick={() => setConfirmClear(true)} aria-label="Clear chat history" title="Clear chat history" className="cursor-pointer rounded-lg p-1.5 opacity-85 hover:bg-white/15 hover:opacity-100">
            <Trash2 size={17} />
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close chat" className="cursor-pointer rounded-lg p-1.5 opacity-85 hover:bg-white/15 hover:opacity-100">
            <X size={19} />
          </button>
        </header>

        <div ref={bodyRef} onScroll={onScroll} className="scrollbar-none flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain bg-paper px-3.5 py-4">
          {shown.map((m, i) => (
            <Bubble
              key={i}
              msg={m}
              plain={m.greeting}
              onRate={(r) => rate(i, r)}
              onRetry={sending ? undefined : () => retry(i)}
              modules={{ isCode, catalog, courses, onShow: showModule, onAdd: addModule }}
            />
          ))}
          {next.length > 0 && (
            <div className="rise flex flex-col items-start gap-1.5" role="group" aria-label="Suggested follow-up questions">
              {next.map((q) => (
                <button key={q} onClick={() => send(q)} className="cursor-pointer rounded-full border border-accent/30 bg-panel px-3 py-1.5 text-left text-meta text-accent transition hover:border-accent hover:bg-accent-soft">
                  {q}
                </button>
              ))}
            </div>
          )}
          {!messages.length && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((q) => (
                <button key={q} onClick={() => send(q)} className="cursor-pointer rounded-full border border-line bg-panel px-3 py-1.5 text-left text-meta transition hover:border-accent hover:text-accent">
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-panel px-3 pt-2 pb-[calc(10px+env(safe-area-inset-bottom))]">
          <label data-tour="assistant-context" className="mb-1.5 flex w-fit cursor-pointer items-center gap-2 text-caption text-muted select-none">
            <input
              type="checkbox"
              checked={include}
              onChange={(e) => {
                setInclude(e.target.checked);
                saveIncludeCourses(e.target.checked);
              }}
              className="accent-[var(--accent)]"
            />
            Consider my course list
          </label>
          <div className="flex items-end gap-1.5 rounded-[22px] border border-line bg-paper py-1.5 pr-1.5 pl-4 transition focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_15%,transparent)]">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about the AEDS programme..."
              className="max-h-[100px] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-title-sm leading-snug outline-none placeholder:text-faint sm:text-body"
            />
            {sending ? (
              <button
                onClick={stop}
                aria-label="Stop answer"
                title="Stop"
                className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper transition active:scale-90"
              >
                <Square size={12} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                aria-label="Send message"
                className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-white transition active:scale-90 disabled:opacity-50 dark:text-paper"
              >
                <ArrowUp size={17} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        {confirmClear && (
          <div className="fade absolute inset-0 z-20 flex items-center justify-center bg-[#1c2333]/45 p-5">
            <div className="pop w-full max-w-[290px] rounded-2xl bg-panel p-4 shadow-[var(--shadow-lg)]">
              <p className="mb-4 text-body leading-relaxed">Clear this chat history? This cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmClear(false)} className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-body-sm">
                  Cancel
                </button>
                <button onClick={clear} className="cursor-pointer rounded-lg bg-warn px-3 py-1.5 text-body-sm font-semibold text-white">
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>,
    document.body,
  );
}

function RetryButton({ onRetry }: { onRetry?: () => void }) {
  if (!onRetry) return null;
  return (
    <button onClick={onRetry} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1 text-caption font-medium text-ink not-italic hover:border-accent hover:text-accent">
      <RotateCw size={12} /> Try again
    </button>
  );
}

interface Modules {
  isCode: (code: string) => boolean;
  catalog: Catalog;
  courses: Course[];
  onShow: (code: string) => void;
  onAdd: (code: string) => void;
}

function Bubble({ msg, onRate, onRetry, plain, modules }: { msg: ChatMessage; onRate: (r: 1 | -1) => void; onRetry?: () => void; plain?: boolean; modules?: Modules }) {
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [module, setModule] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  if (msg.role === "system")
    return (
      <div className="rise flex flex-wrap items-center gap-2 self-start px-1 text-meta text-warn italic">
        {msg.text}
        {msg.interrupted && <RetryButton onRetry={onRetry} />}
      </div>
    );
  if (msg.streaming && !msg.text)
    return (
      <div role="status" className="rise inline-flex items-center gap-2 self-start rounded-[20px] rounded-bl-md border border-line bg-panel px-4 py-2.5 text-meta text-muted">
        <span className="inline-flex gap-1" aria-hidden>
          {[0, 1, 2].map((d) => (
            <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d * 0.15}s` }} />
          ))}
        </span>
        {STAGE_LABELS[msg.stage || ""] || "Thinking…"}
      </div>
    );
  if (msg.role === "user")
    return (
      <div
        className="rise max-w-[82%] self-end rounded-[20px] rounded-br-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-body leading-relaxed whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: escapeHtml(msg.text) }}
      />
    );
  const copy = () => {
    const done = (ok: boolean) => {
      setCopied(ok);
      window.setTimeout(() => setCopied(false), 1500);
    };
    // "[2]" would point nowhere once pasted elsewhere.
    const text = stripCitations(msg.text);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    else done(false);
  };
  const sources = groupSources(msg.sources);
  const cite = active !== null ? citation(active, msg.retrieval, msg.sources) : null;
  // Citation chips are plain HTML inside the rendered answer; handle their clicks here.
  const onAnswerClick = (e: React.MouseEvent) => {
    const codeChip = (e.target as HTMLElement).closest<HTMLElement>("[data-code]");
    if (codeChip) {
      const code = codeChip.dataset.code!;
      setActive(null);
      setModule((m) => (m === code ? null : code));
      return;
    }
    const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-cite]");
    if (!chip) return;
    setModule(null);
    const n = Number(chip.dataset.cite);
    if (!msg.retrieval?.[n - 1]) {
      setShowSources(true);
      return;
    }
    setActive((a) => (a === n ? null : n));
  };
  return (
    <div
      aria-busy={msg.streaming || undefined}
      className={cx("rise relative max-w-[88%] self-start rounded-[20px] rounded-bl-md border border-line bg-panel px-3.5 pt-2.5 text-body leading-relaxed shadow-[0_1px_3px_rgba(0,0,0,0.04)]", plain || msg.streaming ? "pb-2.5" : "pb-7")}
    >
      <div className={cx("md", msg.streaming && "streaming")} data-active-cite={active ?? undefined} onClick={onAnswerClick} dangerouslySetInnerHTML={{ __html: formatAnswer(msg.streaming ? closeOpenBold(msg.text) : msg.text, plain || msg.streaming ? undefined : modules?.isCode) }} />

      {msg.stopped && <div className="mt-1 text-caption text-faint italic">Stopped.</div>}

      {module && modules && <ModuleCard code={module} modules={modules} onClose={() => setModule(null)} />}

      {msg.interrupted && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-meta text-warn">
          <TriangleAlert size={13} /> Connection lost before the answer was complete.
          <RetryButton onRetry={onRetry} />
        </div>
      )}

      {cite && (
        <div className="pop mt-2 rounded-xl border border-line bg-panel-2 p-3 text-meta" role="region" aria-label={`Source ${cite.n}`}>
          <div className="flex items-start gap-2">
            <span className="num mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-accent px-1 text-caption font-bold text-white dark:text-paper">{cite.n}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{cite.title}</div>
              <div className="text-caption text-muted">
                {cite.kind}
                {cite.section ? ` · ${cite.section}` : ""}
              </div>
            </div>
            <button onClick={() => setActive(null)} aria-label="Close source" className="cursor-pointer rounded-md p-0.5 text-faint hover:text-ink">
              <X size={14} />
            </button>
          </div>
          {cite.expiredSince && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-warn-soft px-2 py-1 text-caption text-warn">
              <TriangleAlert size={12} /> Outdated since {cite.expiredSince}
            </div>
          )}
          <p className="mt-2 max-h-40 overflow-y-auto leading-relaxed whitespace-pre-line text-muted">{cite.text}</p>
          {cite.url && (
            <a href={cite.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-accent hover:underline">
              Open document <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {!plain && sources.length > 0 && (
        <div className="mt-2 border-t border-line pt-1.5">
          <button
            onClick={() => setShowSources((v) => !v)}
            aria-expanded={showSources}
            className="inline-flex cursor-pointer items-center gap-1.5 text-meta font-medium text-muted hover:text-ink"
          >
            <BookOpen size={13} /> Sources ({sources.length})
            <ChevronDown size={13} className={cx("transition", showSources && "rotate-180")} />
          </button>
          {showSources && (
            <ul className="mt-1.5 grid gap-1.5 pb-1">
              {sources.map((g) => (
                <li key={g.id} className="text-meta leading-snug">
                  {g.url ? (
                    <a href={g.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                      {g.title}
                    </a>
                  ) : (
                    <span className="font-medium">{g.title}</span>
                  )}
                  <span className="text-muted">
                    {" "}
                    · {g.kind}
                    {g.pages.length ? ` · p. ${g.pages.join(", ")}` : ""}
                  </span>
                  {g.expiredSince && <span className="ml-1 rounded bg-warn-soft px-1 text-micro text-warn">outdated since {g.expiredSince}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!plain && !msg.streaming && (
      <div className="absolute right-1.5 bottom-1 flex items-center text-muted">
        {msg.queryLogId && (
          <>
            <button onClick={() => onRate(-1)} aria-label="Poor answer" title="Poor answer" className={cx("cursor-pointer rounded-md p-1.5 hover:bg-ink/5", msg.feedbackRating === -1 && "text-warn")}>
              <ThumbsDown size={13} />
            </button>
            <button onClick={() => onRate(1)} aria-label="Good answer" title="Good answer" className={cx("cursor-pointer rounded-md p-1.5 hover:bg-ink/5", msg.feedbackRating === 1 && "text-accent")}>
              <ThumbsUp size={13} />
            </button>
          </>
        )}
        <button onClick={copy} aria-label="Copy message" title="Copy" className="cursor-pointer rounded-md p-1.5 hover:bg-ink/5">
          {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
        </button>
      </div>
      )}
    </div>
  );
}

/** What the tracker knows about a module the answer mentions, with ways to act on it. */
function ModuleCard({ code, modules, onClose }: { code: string; modules: Modules; onClose: () => void }) {
  const { catalog, courses } = modules;
  const c = catalogCourse(code, catalog);
  if (!c) return null;
  const mine = courses.find((x) => !x.hypothetical && (resolveCode(x.name, catalog) || codeOf(x.name)) === code);
  const pattern = offeringPattern(code, catalog);
  const category = CATEGORIES.find((k) => k.id === c.category)?.name || c.category;
  const status = mine ? { completed: "Completed", "in-progress": "In progress", planned: "Planned" }[mine.status] : null;
  return (
    <div className="pop mt-2 rounded-xl border border-line bg-panel-2 p-3 text-meta" role="region" aria-label={`Module ${code}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{c.name}</div>
          <div className="text-caption text-muted">
            {code} · {c.ects} ECTS · {category}
            {c.compulsory ? " · compulsory" : ""}
            {pattern ? ` · ${pattern.pattern === "both" ? "every semester" : `usually ${pattern.pattern}`}` : ""}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close module" className="cursor-pointer rounded-md p-0.5 text-faint hover:text-ink">
          <X size={14} />
        </button>
      </div>
      {mine && (
        <div className="mt-2 rounded-lg bg-accent-soft px-2 py-1 text-caption text-accent">
          In your list: {status}
          {mine.semester && mine.semester !== "Unscheduled" ? `, ${mine.semester}` : ""}
          {mine.grade ? ` (${mine.grade})` : ""}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {!mine && (
          <button onClick={() => modules.onAdd(code)} className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-caption font-semibold text-white dark:text-paper">
            <Plus size={12} /> Add to plan
          </button>
        )}
        <button onClick={() => modules.onShow(code)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1 text-caption font-medium hover:border-accent hover:text-accent">
          <Search size={12} /> Show in Catalog
        </button>
      </div>
    </div>
  );
}
