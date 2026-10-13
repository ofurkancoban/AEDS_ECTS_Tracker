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
  chatReply = () => ({ status: 200, body: { answer: "**Take** these:\n- wir895\n- wir894", thread_id: "t1", query_log_id: 42 } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      requests.push({ url, body });
      if (url === AEDS_RAG_BASE + "/auth/guest") return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      if (url === AEDS_RAG_BASE + "/chat") {
        const r = chatReply(body);
        return new Response(JSON.stringify(r.body), { status: r.status });
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
    const chat = requests.find((r) => r.url.endsWith("/chat"))!;
    expect(chat.body).toEqual({ message: "Which courses should I take next semester?", thread_id: null });
    expect(JSON.parse(localStorage.getItem("aedsRagMessages")!)).toHaveLength(2);
  });

  it("sends the course list only when the toggle is on", async () => {
    const { user, panel } = await openAssistant();
    await user.click(within(panel).getByLabelText("Consider my course list"));
    expect(localStorage.getItem("aedsRagIncludeCourses")).toBe("1");
    await user.type(within(panel).getByPlaceholderText(/Ask about the AEDS programme/), "What next?{Enter}");
    await waitFor(() => expect(requests.some((r) => r.url.endsWith("/chat"))).toBe(true));
    const msg = (requests.find((r) => r.url.endsWith("/chat"))!.body as { message: string }).message;
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
    expect(requests.some((r) => r.url.endsWith("/chat"))).toBe(false);
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
