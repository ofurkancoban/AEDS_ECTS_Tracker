// Streaming answers from /chat/stream: SSE parsing, the client and its fallbacks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followUps } from "./followUps";
import { AEDS_RAG_BASE, closeOpenBold, formatAnswer, linkCourseCodes, loadMessages, StreamStopped, loadThreadId, parseSse, saveMessages, streamChat, StreamInterrupted } from "./assistant";

const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** A response whose body arrives in the given chunks; `fail` errors the stream after them. */
function chunked(chunks: string[], fail = false): Response {
  const enc = new TextEncoder();
  let i = 0;
  // One chunk per read, like a network; erroring in start() would discard queued chunks.
  return new Response(
    new ReadableStream({
      pull(c) {
        if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
        else if (fail) c.error(new Error("network down"));
        else c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

let urls: string[];
function mockFetch(chat: () => Response) {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.endsWith("/auth/guest")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      return chat();
    }),
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("parseSse", () => {
  it("returns complete events and keeps the unfinished rest", () => {
    const { events, rest } = parseSse(ev("token", { text: "a" }) + "event: tok");
    expect(events).toEqual([{ event: "token", data: '{"text":"a"}' }]);
    expect(rest).toBe("event: tok");
  });

  it("handles CRLF, comments, defaults and multi-line data", () => {
    const { events } = parseSse(": keep-alive\r\n\r\ndata: one\r\ndata: two\r\n\r\nevent:x\ndata:{}\n\n");
    expect(events).toEqual([
      { event: "message", data: "one\ntwo" },
      { event: "x", data: "{}" },
    ]);
  });
});

describe("streamChat", () => {
  it("reports stages and tokens in order, even when chunks cut through events", async () => {
    const all =
      ev("stage", { stage: "searching" }) +
      ev("token", { text: "Thirty" }) +
      ev("token", { text: " ECTS [1]" }) +
      ev("done", { final_answer: "Thirty ECTS [1].", thread_id: "th9", sources: [{ title: "Regs" }], retrieval: [{ text: "p" }], query_log_id: 5 });
    const pieces = all.match(/[\s\S]{1,9}/g)!;
    mockFetch(() => chunked(pieces));
    const seen: string[] = [];
    const res = await streamChat("Q", { onStage: (s) => seen.push("stage:" + s), onToken: (t) => seen.push(t) });
    expect(seen).toEqual(["stage:searching", "Thirty", " ECTS [1]"]);
    expect(res).toMatchObject({ answer: "Thirty ECTS [1].", thread_id: "th9", query_log_id: 5 });
    expect(res.sources).toHaveLength(1);
    expect(loadThreadId()).toBe("th9");
    expect(urls).toEqual([AEDS_RAG_BASE + "/auth/guest", AEDS_RAG_BASE + "/chat/stream"]);
  });

  it("accepts a cached answer that only sends done", async () => {
    mockFetch(() => chunked([ev("done", { final_answer: "From cache", thread_id: "t", cached: true })]));
    const onToken = vi.fn();
    await expect(streamChat("Q", { onToken })).resolves.toMatchObject({ answer: "From cache" });
    expect(onToken).not.toHaveBeenCalled();
  });

  it("parses a last event without the closing blank line", async () => {
    mockFetch(() => chunked([ev("token", { text: "x" }) + 'event: done\ndata: {"final_answer":"x","thread_id":"t"}']));
    await expect(streamChat("Q")).resolves.toMatchObject({ answer: "x" });
  });

  it("keeps the partial answer when the connection drops", async () => {
    mockFetch(() => chunked([ev("token", { text: "Half an" }), ev("token", { text: " answer" })], true));
    const err = await streamChat("Q").catch((e) => e);
    expect(err).toBeInstanceOf(StreamInterrupted);
    expect((err as StreamInterrupted).partial).toBe("Half an answer");
  });

  it("treats a stream that ends without done as interrupted", async () => {
    mockFetch(() => chunked([ev("stage", { stage: "searching" })]));
    const err = await streamChat("Q").catch((e) => e);
    expect(err).toBeInstanceOf(StreamInterrupted);
    expect((err as StreamInterrupted).partial).toBe("");
  });

  it("ignores events it can't read", async () => {
    mockFetch(() => chunked(["event: token\ndata: {broken\n\n", ev("contribution", { x: 1 }), ev("done", { final_answer: "ok", thread_id: "t" })]));
    await expect(streamChat("Q")).resolves.toMatchObject({ answer: "ok" });
  });

  it("gets a new token once when the old one is rejected", async () => {
    localStorage.setItem("aedsRagToken", "expired");
    let n = 0;
    mockFetch(() => (++n === 1 ? new Response("{}", { status: 401 }) : chunked([ev("done", { final_answer: "ok", thread_id: "t" })])));
    await expect(streamChat("Q")).resolves.toMatchObject({ answer: "ok" });
    expect(urls.filter((u) => u.endsWith("/chat/stream"))).toHaveLength(2);
  });

  it("falls back to /chat when the server can't stream", async () => {
    urls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.endsWith("/auth/guest")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
        if (url.endsWith("/chat/stream")) return new Response("{}", { status: 404 });
        return new Response(JSON.stringify({ answer: "plain", thread_id: "t" }), { status: 200 });
      }),
    );
    await expect(streamChat("Q")).resolves.toMatchObject({ answer: "plain" });
    expect(urls.at(-1)).toBe(AEDS_RAG_BASE + "/chat");
  });

  it("surfaces the server's error detail", async () => {
    mockFetch(() => new Response(JSON.stringify({ detail: "Too many requests" }), { status: 429 }));
    await expect(streamChat("Q")).rejects.toThrow("Too many requests");
  });
});

describe("saving a streamed conversation", () => {
  it("skips an answer still arriving and drops the stage", () => {
    saveMessages([
      { role: "user", text: "Q" },
      { role: "assistant", text: "Part", streaming: true, stage: "writing" },
    ]);
    expect(loadMessages()).toEqual([{ role: "user", text: "Q" }]);
    saveMessages([{ role: "assistant", text: "Part", interrupted: true, stage: "writing" }]);
    expect(loadMessages()).toEqual([{ role: "assistant", text: "Part", interrupted: true }]);
  });
});

describe("closeOpenBold", () => {
  it("closes a bold that is still being written", () => {
    expect(closeOpenBold("An exam is **deemed")).toBe("An exam is **deemed**");
    expect(formatAnswer(closeOpenBold("An exam is **deemed"))).toContain("<b>deemed</b>");
    expect(closeOpenBold("**done** and more")).toBe("**done** and more");
    expect(closeOpenBold("**open on an earlier line\nnext")).toBe("**open on an earlier line\nnext");
  });
});

/** A stream the test feeds by hand and that stays open until closed. */
function openStream() {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start: (c) => void (ctl = c),
      cancel: () => void (cancelled = true),
    }),
    { status: 200 },
  );
  return { response, push: (t: string) => ctl.enqueue(new TextEncoder().encode(t)), close: () => ctl.close(), isCancelled: () => cancelled };
}

describe("streamChat stopping and finishing", () => {
  it("resolves on done while the server still holds the stream open", async () => {
    const s = openStream();
    mockFetch(() => s.response);
    const p = streamChat("Q");
    await new Promise((r) => setTimeout(r, 0));
    s.push(ev("token", { text: "Hi" }) + ev("done", { final_answer: "Hi.", thread_id: "t" }));
    await expect(p).resolves.toMatchObject({ answer: "Hi." });
    // The rest (the contribution event) is still read, not cut off.
    expect(s.isCancelled()).toBe(false);
    s.push(ev("contribution", { auto_flagged_contribution: null }));
    s.close();
  });

  it("stops on abort with what had arrived and cancels the stream", async () => {
    const s = openStream();
    mockFetch(() => s.response);
    const ctl = new AbortController();
    const p = streamChat("Q", { signal: ctl.signal });
    await new Promise((r) => setTimeout(r, 0));
    s.push(ev("token", { text: "Half" }));
    await new Promise((r) => setTimeout(r, 0));
    ctl.abort();
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(StreamStopped);
    expect((err as StreamStopped).partial).toBe("Half");
    expect(s.isCancelled()).toBe(true);
  });

  it("stops before the request when already aborted", async () => {
    mockFetch(() => new Response("{}"));
    const ctl = new AbortController();
    ctl.abort();
    await expect(streamChat("Q", { signal: ctl.signal })).rejects.toBeInstanceOf(StreamStopped);
    expect(urls).toEqual([]);
  });

  it("stops while the request is still on its way", async () => {
    const ctl = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/auth/guest")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
        ctl.abort();
        expect(init?.signal).toBe(ctl.signal);
        throw new DOMException("aborted", "AbortError");
      }),
    );
    await expect(streamChat("Q", { signal: ctl.signal })).rejects.toBeInstanceOf(StreamStopped);
  });
});

describe("linkCourseCodes", () => {
  const known = (c: string) => ["wir895", "inf530"].includes(c);
  it("wraps known codes in text, any case, and leaves the rest", () => {
    const html = linkCourseCodes("<p>Take WIR895 and inf530, not abc123.</p>", known);
    expect(html).toContain('data-code="wir895" aria-label="Module WIR895">WIR895</button>');
    expect(html).toContain('data-code="inf530"');
    expect(html).not.toContain('data-code="abc123"');
  });

  it("never touches tags, links, buttons or longer words", () => {
    const html = formatAnswer("[wir895](https://x.example/wir895) [1] xwir8950 `wir895`", known);
    expect(html).toContain('<a href="https://x.example/wir895" target="_blank" rel="noopener noreferrer">wir895</a>');
    expect(html.match(/data-code=/g)).toHaveLength(1); // only the one in the code span
    expect(html).toContain('data-cite="1"');
  });
});

describe("followUps", () => {
  it("starts with a module question, then the question's topic, and skips what was asked", () => {
    expect(followUps("Can I retake an exam?", "Yes, twice. See wir895.", ["Can I retake an exam?"], ["wir895"])).toEqual([
      "When is wir895 offered, and how is it assessed?",
      "What happens if I fail the resit as well?",
      "Can I retake an exam I passed to improve my grade?",
    ]);
    expect(followUps("How is the thesis graded?", "", ["How do I register my Master's thesis"])).toEqual([
      "How long do I have to write the thesis?",
      "How is my final grade calculated?",
      "Do failed attempts count toward my final grade?",
    ]);
  });

  it("falls back to the starter questions", () => {
    expect(followUps("Hello", "Hi there!", [])).toEqual(["How many ECTS do I need to graduate?", "Which courses should I take next semester?"]);
    expect(followUps("Hello", "Hi", ["How many ECTS do I need to graduate?", "Which courses should I take next semester?"])).toEqual([]);
  });
});
