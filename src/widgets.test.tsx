// The AEDS Assistant and Sync from StudIP, with the network mocked.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AEDS_RAG_BASE } from "./lib/assistant";
import { codeOf } from "./lib/catalog";
import { course } from "./lib/testUtils";
import type { Course } from "./lib/types";
import sample from "./lib/fixtures/rag-answer.json";

const saved = (): Course[] => JSON.parse(localStorage.getItem("ects-tracker-state") || '{"courses":[]}').courses;
let requests: { url: string; body: unknown }[];
let chatReply: (body: { message: string }) => { status: number; body: unknown };
// Set to an SSE string to send instead of the stream built from chatReply.
let rawStream: string | null;
// When true, /chat/stream stays open and the test feeds it through `live`.
let manual: boolean;
let live: ReadableStreamDefaultController<Uint8Array> | null;
const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const push = (text: string) => act(async () => live!.enqueue(new TextEncoder().encode(text)));

/** What /chat/stream sends for a /chat-style answer: stages, the answer word by word, then done. */
function sse(body: Record<string, unknown>): string {
  const answer = String(body.answer ?? "");
  const words = answer.match(/\s*\S+/g) || [];
  return (
    ["understanding", "searching", "ranking", "writing"].map((stage) => ev("stage", { stage })).join("") +
    words.map((text) => ev("token", { text })).join("") +
    ev("done", { ...body, final_answer: answer })
  );
}

/** Splits the text into a few chunks (cutting through events) so parsing across reads is exercised. */
function streamResponse(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  const step = Math.max(1, Math.ceil(bytes.length / 7));
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += step) c.enqueue(bytes.slice(i, i + step));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("changelog_seen", "x");
  localStorage.setItem(
    "ects-tracker-state",
    JSON.stringify({
      courses: [course("wir821", "economics", "SoSe24", "completed", "3.0"), course("wir874", "economics", "WiSe26/27", "planned")],
      theme: "light",
      targetGrade: "",
    }),
  );
  requests = [];
  rawStream = null;
  manual = false;
  live = null;
  chatReply = () => ({ status: 200, body: { answer: "**Take** these:\n- wir895\n- wir894", thread_id: "t1", query_log_id: 42 } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      requests.push({ url, body });
      if (url === AEDS_RAG_BASE + "/auth/guest") return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      if (url === AEDS_RAG_BASE + "/chat/stream") {
        if (manual)
          return new Response(new ReadableStream<Uint8Array>({ start: (c) => void (live = c) }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
        if (rawStream !== null) return streamResponse(rawStream);
        const r = chatReply(body);
        if (r.status !== 200) return new Response(JSON.stringify(r.body), { status: r.status });
        return streamResponse(sse(r.body as Record<string, unknown>));
      }
      if (url === AEDS_RAG_BASE + "/chat/feedback") return new Response("{}", { status: 200 });
      return new Response("[]", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openAssistant() {
  const user = userEvent.setup();
  render(<App />);
  const bubble = await screen.findByRole("button", { name: "Open AEDS AI Assistant chat" }, { timeout: 3000 });
  await user.click(bubble);
  const panel = screen.getByRole("dialog", { name: "AEDS AI Assistant" });
  return { user, panel };
}

describe("AEDS Assistant", () => {
  it("greets with suggestion chips and answers with formatted text", async () => {
    const { user, panel } = await openAssistant();
    expect(within(panel).getByText(/AEDS know-it-all/)).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: "Which courses should I take next semester?" }));
    await waitFor(() => expect(panel.querySelector(".md b")?.textContent).toBe("Take"));
    expect(panel.querySelectorAll(".md li")).toHaveLength(2);
    const chat = requests.find((r) => r.url.endsWith("/chat/stream"))!;
    expect(chat.body).toEqual({ message: "Which courses should I take next semester?", thread_id: null });
    expect(JSON.parse(localStorage.getItem("aedsRagMessages")!)).toHaveLength(2);
  });

  it("sends the course list only when the toggle is on", async () => {
    const { user, panel } = await openAssistant();
    await user.click(within(panel).getByLabelText("Consider my course list"));
    expect(localStorage.getItem("aedsRagIncludeCourses")).toBe("1");
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "What next?{Enter}");
    await waitFor(() => expect(requests.some((r) => r.url.endsWith("/chat/stream"))).toBe(true));
    const msg = (requests.find((r) => r.url.endsWith("/chat/stream"))!.body as { message: string }).message;
    expect(msg.startsWith("My ECTS Tracker progress (6/120 ECTS completed):")).toBe(true);
    expect(msg).toContain("Planned codes by category: economics: wir874");
    expect(msg.endsWith("\n\nQuestion: What next?")).toBe(true);
    // The chat history shows only what the student typed.
    expect(within(panel).queryByText(/My ECTS Tracker progress/)).toBeNull();
  });

  it("does not send on Shift+Enter or an empty message", async () => {
    const { user, panel } = await openAssistant();
    const box = within(panel).getByPlaceholderText(/Ask about the AEDS programme/);
    await user.type(box, "{Enter}");
    await user.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(requests.some((r) => r.url.endsWith("/chat/stream"))).toBe(false);
    expect((box as HTMLTextAreaElement).value).toBe("line one\nline two");
  });

  it("shows errors from the server in the chat", async () => {
    chatReply = () => ({ status: 503, body: { detail: "Assistant is busy" } });
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Hi{Enter}");
    expect(await within(panel).findByText("Assistant is busy")).toBeTruthy();
  });

  it("sends thumbs feedback for an answer", async () => {
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Hi{Enter}");
    await user.click(await within(panel).findByRole("button", { name: "Good answer" }));
    await waitFor(() => expect(requests.find((r) => r.url.endsWith("/chat/feedback"))?.body).toEqual({ query_log_id: 42, rating: 1 }));
  });

  it("clears the conversation after confirming", async () => {
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Hi{Enter}");
    await within(panel).findByRole("button", { name: "Good answer" });
    await user.click(within(panel).getByRole("button", { name: "Clear chat history" }));
    await user.click(within(panel).getByRole("button", { name: "Clear" }));
    expect(localStorage.getItem("aedsRagMessages")).toBe("[]");
    expect(localStorage.getItem("aedsRagThreadId")).toBeNull();
    expect(within(panel).getByText(/AEDS know-it-all/)).toBeTruthy();
  });
});

describe("AEDS Assistant sources", () => {
  beforeEach(() => {
    chatReply = () => ({ status: 200, body: sample });
  });

  it("opens the cited passage from a [n] chip, with its document link", async () => {
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Retakes?{Enter}");
    const chips = await within(panel).findAllByRole("button", { name: "Show source 1" });
    expect(chips.length).toBe(4);
    await user.click(chips[0]);
    const card = within(panel).getByRole("region", { name: "Source 1" });
    expect(within(card).getByText("Examination regulations (2026)")).toBeTruthy();
    expect(within(card).getByText(/Section 8 Resitting/)).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Open document/ }).getAttribute("href")).toMatch(/^https:\/\/elearning\.uni-oldenburg\.de\//);
    await user.click(within(card).getByRole("button", { name: "Close source" }));
    expect(within(panel).queryByRole("region", { name: "Source 1" })).toBeNull();
  });

  it("lists the answer's sources with pages", async () => {
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Retakes?{Enter}");
    const toggle = await within(panel).findByRole("button", { name: /Sources \(1\)/ });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(panel).getByText(/p\. 5, 8, 11/)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Examination regulations (2026)" })).toBeTruthy();
  });

  it("keeps sources after a reload and copies answers without markers", async () => {
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Retakes?{Enter}");
    await within(panel).findAllByRole("button", { name: "Show source 1" });
    const stored = JSON.parse(localStorage.getItem("aedsRagMessages")!);
    expect(stored[1].retrieval).toHaveLength(sample.retrieval.length);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(within(panel).getByRole("button", { name: "Copy message" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(copied).not.toMatch(/\[\d+\]/);
    expect(copied).toContain("up to twice");
  });
});

describe("AEDS Assistant streaming", () => {
  const ask = async (user: ReturnType<typeof userEvent.setup>, panel: HTMLElement, q = "How long is the thesis?") => {
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), q + "{Enter}");
    await waitFor(() => expect(live).not.toBeNull());
  };
  const answerText = (panel: HTMLElement) => [...panel.querySelectorAll(".md")].at(-1)?.textContent;

  it("shows what it is doing, then the answer as it arrives, then sources and actions", async () => {
    manual = true;
    const { user, panel } = await openAssistant();
    await ask(user, panel);
    expect(within(panel).getByRole("status").textContent).toContain("Understanding your question");
    await push(ev("stage", { stage: "searching" }));
    expect(within(panel).getByRole("status").textContent).toContain("Searching the programme documents");
    // While it is writing, Send becomes Stop.
    expect(within(panel).queryByRole("button", { name: "Send message" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "Stop answer" })).toBeTruthy();

    await push(ev("stage", { stage: "writing" }) + ev("token", { text: "The thesis" }));
    await waitFor(() => expect(answerText(panel)).toBe("The thesis"));
    expect(panel.querySelector(".md.streaming")).toBeTruthy();
    expect(panel.querySelector('[aria-busy="true"]')).toBeTruthy();
    // No copy or rating while the answer is incomplete, and nothing saved yet.
    expect(within(panel).queryByRole("button", { name: "Copy message" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("aedsRagMessages")!)).toHaveLength(1);

    await push(ev("token", { text: " is worth 30" }));
    await waitFor(() => expect(answerText(panel)).toBe("The thesis is worth 30"));

    await push(ev("done", { ...sample, final_answer: "The thesis is worth **30 ECTS** [1]." }));
    await act(async () => live!.close());
    await waitFor(() => expect(panel.querySelector(".md.streaming")).toBeNull());
    expect(panel.querySelector(".md b")?.textContent).toBe("30 ECTS");
    expect(within(panel).getByRole("button", { name: "Show source 1" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: /Sources \(1\)/ })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Good answer" })).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem("aedsRagMessages")!);
    expect(stored[1].text).toBe("The thesis is worth **30 ECTS** [1].");
    expect(stored[1].streaming).toBeUndefined();
  });

  it("shows a cached answer that arrives in one piece", async () => {
    rawStream = ev("done", { final_answer: "Straight from the **cache**.", thread_id: "t", cached: true, query_log_id: 3 });
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Hi{Enter}");
    await waitFor(() => expect(panel.querySelector(".md b")?.textContent).toBe("cache"));
    expect(within(panel).queryByRole("status")).toBeNull();
  });

  it("keeps a half answer when the connection drops and asks again on Try again", async () => {
    manual = true;
    const { user, panel } = await openAssistant();
    await ask(user, panel, "Retakes?");
    await push(ev("token", { text: "You can retake" }));
    await act(async () => live!.error(new Error("offline")));
    expect(await within(panel).findByText(/Connection lost before the answer was complete/)).toBeTruthy();
    expect(answerText(panel)).toBe("You can retake");
    expect(JSON.parse(localStorage.getItem("aedsRagMessages")!)[1]).toMatchObject({ text: "You can retake", interrupted: true });

    // Try again asks the same question once more, without a second user bubble.
    live = null;
    manual = false;
    chatReply = () => ({ status: 200, body: { answer: "You can retake twice.", thread_id: "t", query_log_id: 9 } });
    await user.click(within(panel).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(answerText(panel)).toBe("You can retake twice."));
    expect(within(panel).queryByText(/Connection lost/)).toBeNull();
    expect(within(panel).getAllByText("Retakes?")).toHaveLength(1);
    const asked = requests.filter((r) => r.url.endsWith("/chat/stream")).map((r) => (r.body as { message: string }).message);
    expect(asked).toEqual(["Retakes?", "Retakes?"]);
  });

  it("offers Try again when the connection drops before any text", async () => {
    rawStream = ev("stage", { stage: "searching" });
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Hi{Enter}");
    expect(await within(panel).findByText(/connection was interrupted/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(within(panel).queryByRole("status")).toBeNull();
  });
});

describe("AEDS Assistant stop, modules and follow-ups", () => {
  const ask = async (user: ReturnType<typeof userEvent.setup>, panel: HTMLElement, q: string) => {
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), q + "{Enter}");
    await waitFor(() => expect(live).not.toBeNull());
  };

  it("stops an answer, keeping what was written", async () => {
    manual = true;
    const { user, panel } = await openAssistant();
    await ask(user, panel, "Retakes?");
    await push(ev("token", { text: "You can retake" }));
    await waitFor(() => expect(panel.querySelector(".md")?.textContent).toContain("You can retake"));
    await user.click(within(panel).getByRole("button", { name: "Stop answer" }));
    expect(await within(panel).findByText("Stopped.")).toBeTruthy();
    expect([...panel.querySelectorAll(".md")].at(-1)?.textContent).toBe("You can retake");
    expect(within(panel).getByRole("button", { name: "Send message" })).toBeTruthy();
    expect(within(panel).queryByText(/Connection lost/)).toBeNull();
    expect(JSON.parse(localStorage.getItem("aedsRagMessages")!)[1]).toMatchObject({ text: "You can retake", stopped: true });
    // A stopped answer gets no follow-up suggestions.
    expect(within(panel).queryByRole("group", { name: "Suggested follow-up questions" })).toBeNull();
  });

  it("stops before any text arrives", async () => {
    manual = true;
    const { user, panel } = await openAssistant();
    await ask(user, panel, "Retakes?");
    await user.click(within(panel).getByRole("button", { name: "Stop answer" }));
    expect(await within(panel).findByText("Stopped.")).toBeTruthy();
    expect(within(panel).queryByRole("status")).toBeNull();
  });

  it("shows sources as soon as done arrives, without waiting for the stream to close", async () => {
    manual = true;
    const { user, panel } = await openAssistant();
    await ask(user, panel, "Retakes?");
    await push(ev("token", { text: "Twice [1]." }) + ev("done", { ...sample, final_answer: "Twice [1]." }));
    // The server's contribution check keeps the stream open; the answer is complete anyway.
    expect(await within(panel).findByRole("button", { name: /Sources \(1\)/ })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Send message" })).toBeTruthy();
    await act(async () => live!.enqueue(new TextEncoder().encode(ev("contribution", { auto_flagged_contribution: null }))));
    await act(async () => live!.close());
    expect(within(panel).getAllByText(/Twice/)).toHaveLength(1);
  });

  it("turns module codes into cards with the student's status and actions", async () => {
    chatReply = () => ({ status: 200, body: { answer: "Take wir895 next, you already passed wir821.", thread_id: "t", query_log_id: 4 } });
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "What next?{Enter}");
    await user.click(await within(panel).findByRole("button", { name: "Module wir821" }));
    let card = within(panel).getByRole("region", { name: "Module wir821" });
    expect(within(card).getByText("International Trade, Production and Change")).toBeTruthy();
    expect(within(card).getByText(/In your list: Completed, SoSe24 \(3\.0\)/)).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /Add to plan/ })).toBeNull();

    await user.click(within(panel).getByRole("button", { name: "Module wir895" }));
    expect(within(panel).queryByRole("region", { name: "Module wir821" })).toBeNull();
    card = within(panel).getByRole("region", { name: "Module wir895" });
    expect(within(card).getByText(/6 ECTS · Economics.*compulsory.*usually WiSe/)).toBeTruthy();
    await user.click(within(card).getByRole("button", { name: /Add to plan/ }));
    const palette = await screen.findByRole("dialog", { name: "Add a course" });
    expect(within(palette).getByText(/Industrial Organization/)).toBeTruthy();
  });

  it("opens the Catalog on a module from its card", async () => {
    chatReply = () => ({ status: 200, body: { answer: "Have a look at wir895.", thread_id: "t" } });
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Hi{Enter}");
    await user.click(await within(panel).findByRole("button", { name: "Module wir895" }));
    await user.click(within(panel).getByRole("button", { name: /Show in Catalog/ }));
    const search = (await screen.findByPlaceholderText(/Search code, title, lecturer/, {}, { timeout: 3000 })) as HTMLInputElement;
    expect(search.value).toBe("wir895");
  });

  it("does not link codes that are not in the catalog, or inside links", async () => {
    chatReply = () => ({ status: 200, body: { answer: "Not abc123, but [wir895](https://x.example/wir895) and wir895.", thread_id: "t" } });
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Hi{Enter}");
    await within(panel).findAllByRole("button", { name: "Module wir895" });
    expect(within(panel).getAllByRole("button", { name: "Module wir895" })).toHaveLength(1);
    expect(within(panel).queryByRole("button", { name: "Module abc123" })).toBeNull();
    expect(within(panel).getByRole("link", { name: "wir895" }).getAttribute("href")).toBe("https://x.example/wir895");
  });

  it("suggests follow-up questions under the latest answer and asks one on click", async () => {
    chatReply = () => ({ status: 200, body: { answer: "You can resit a failed exam twice. Consider wir895.", thread_id: "t", query_log_id: 1 } });
    const { user, panel } = await openAssistant();
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "Can I retake a failed exam?{Enter}");
    const group = await within(panel).findByRole("group", { name: "Suggested follow-up questions" });
    const chips = within(group).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["When is wir895 offered, and how is it assessed?", "What happens if I fail the resit as well?", "Can I retake an exam I passed to improve my grade?"]);
    await user.click(within(group).getByRole("button", { name: "What happens if I fail the resit as well?" }));
    await waitFor(() => expect(requests.filter((r) => r.url.endsWith("/chat/stream")).map((r) => (r.body as { message: string }).message)).toContain("What happens if I fail the resit as well?"));
    // The asked one is not offered again.
    await waitFor(() => expect(within(panel).queryByRole("button", { name: "What happens if I fail the resit as well?" })).toBeNull());
  });
});

describe("Sync from StudIP", () => {
  const PASTE = [
    "1\tmodule International Trade, Production and Change\t2100821\t\t2,0\tBE",
    "2\tmodule Advanced Microeconomics\t2100874\t\t1,3\tBE",
    "3\tmodule Environmental Economics\t2100901\t\t1,7\tBE",
  ].join("\n");

  async function openSync() {
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "Data" }));
    await user.click(screen.getByRole("button", { name: /Sync from StudIP/ }));
    const dlg = await screen.findByRole("dialog", { name: "Sync grades from StudIP" });
    return { user, dlg };
  }

  it("explains when nothing could be read", async () => {
    const { user, dlg } = await openSync();
    await user.type(within(dlg).getByPlaceholderText(/Paste the copied text/), "hello");
    await user.click(within(dlg).getByRole("button", { name: /Match/ }));
    expect(within(dlg).getByText(/Could not find any finished grades/)).toBeTruthy();
  });

  it("updates grades, adds missing modules and requires a semester for them", async () => {
    const { user, dlg } = await openSync();
    await user.click(within(dlg).getByPlaceholderText(/Paste the copied text/));
    await user.paste(PASTE);
    await user.click(within(dlg).getByRole("button", { name: /Match/ }));
    expect(within(dlg).getByText("Matched (2)")).toBeTruthy();
    const apply = within(dlg).getByRole("button", { name: "Apply updates" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    const sem = within(dlg).getByLabelText(/Semester for wir901/) as HTMLSelectElement;
    await user.selectOptions(sem, sem.options[1].value);
    expect(apply.disabled).toBe(false);
    await user.click(apply);
    await waitFor(() => expect(saved()).toHaveLength(3));
    const byCode = Object.fromEntries(saved().map((c) => [codeOf(c.name), c]));
    expect(byCode.wir821).toMatchObject({ grade: "2.0", status: "completed" });
    expect(byCode.wir874).toMatchObject({ grade: "1.3", status: "completed" });
    expect(byCode.wir901).toMatchObject({ grade: "1.7", status: "completed", category: "economics", semester: sem.options[1].value });
    expect(byCode.wir901.id).toBeTruthy();
    expect(screen.getByText("Updated 2 grades and added 1 new course.")).toBeTruthy();
  });

  it("lets the student skip a match", async () => {
    const { user, dlg } = await openSync();
    await user.click(within(dlg).getByPlaceholderText(/Paste the copied text/));
    await user.paste(PASTE.split("\n").slice(0, 2).join("\n"));
    await user.click(within(dlg).getByRole("button", { name: /Match/ }));
    await user.click(within(dlg).getAllByRole("checkbox")[0]);
    await user.click(within(dlg).getByRole("button", { name: "Apply updates" }));
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir874")!.grade).toBe("1.3"));
    expect(saved().find((c) => codeOf(c.name) === "wir821")!.grade).toBe("3.0");
  });
});
