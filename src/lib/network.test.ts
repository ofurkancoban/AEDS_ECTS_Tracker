// API clients with a mocked fetch: the AEDS Assistant and the anonymous ratings.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AEDS_RAG_BASE, clearConversation, loadMessages, loadThreadId, postChat, saveMessages, sendFeedback } from "./assistant";
import { clearRating, difficultyLabel, myRating, submitRating } from "./ratings";

type Call = { url: string; init?: RequestInit };
let calls: Call[];

function mockFetch(responder: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const r = responder(url, init);
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
    }),
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("assistant API", () => {
  it("starts a guest session once, then sends the message with the thread id", async () => {
    mockFetch((url) =>
      url.endsWith("/auth/guest") ? { status: 200, body: { access_token: "tok1" } } : { status: 200, body: { answer: "Hi", thread_id: "th1", query_log_id: 7 } },
    );
    const res = await postChat("Hello");
    expect(res.answer).toBe("Hi");
    expect(loadThreadId()).toBe("th1");
    expect(calls.map((c) => c.url)).toEqual([AEDS_RAG_BASE + "/auth/guest", AEDS_RAG_BASE + "/chat"]);
    expect((calls[1].init!.headers as Record<string, string>).Authorization).toBe("Bearer tok1");
    expect(JSON.parse(calls[1].init!.body as string)).toEqual({ message: "Hello", thread_id: null });

    await postChat("Again");
    expect(calls.filter((c) => c.url.endsWith("/auth/guest"))).toHaveLength(1);
    expect(calls).toHaveLength(3);
    expect(JSON.parse(calls[2].init!.body as string).thread_id).toBe("th1");
  });

  it("gets a new token once when the old one is rejected", async () => {
    localStorage.setItem("aedsRagToken", "expired");
    let chatCalls = 0;
    mockFetch((url) => {
      if (url.endsWith("/auth/guest")) return { status: 200, body: { access_token: "fresh" } };
      chatCalls++;
      return chatCalls === 1 ? { status: 401, body: {} } : { status: 200, body: { answer: "ok", thread_id: "t" } };
    });
    await expect(postChat("Q")).resolves.toMatchObject({ answer: "ok" });
    expect(localStorage.getItem("aedsRagToken")).toBe("fresh");
  });

  it("surfaces the server's error detail", async () => {
    localStorage.setItem("aedsRagToken", "t");
    mockFetch(() => ({ status: 429, body: { detail: "Too many requests" } }));
    await expect(postChat("Q")).rejects.toThrow("Too many requests");
  });

  it("does not loop when a fresh token is rejected too", async () => {
    localStorage.setItem("aedsRagToken", "t");
    mockFetch((url) => (url.endsWith("/auth/guest") ? { status: 200, body: { access_token: "t2" } } : { status: 401, body: {} }));
    await expect(postChat("Q")).rejects.toThrow("Request failed (401)");
    expect(calls.filter((c) => c.url.endsWith("/chat"))).toHaveLength(2);
  });

  it("sends answer feedback", async () => {
    localStorage.setItem("aedsRagToken", "t");
    mockFetch(() => ({ status: 200, body: {} }));
    await sendFeedback(7, -1);
    expect(calls[0].url).toBe(AEDS_RAG_BASE + "/chat/feedback");
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ query_log_id: 7, rating: -1 });
  });

  it("persists and clears the conversation", () => {
    saveMessages([{ role: "user", text: "a" }]);
    localStorage.setItem("aedsRagThreadId", "x");
    expect(loadMessages()).toHaveLength(1);
    clearConversation();
    expect(loadMessages()).toEqual([]);
    expect(loadThreadId()).toBeNull();
  });

  it("survives corrupted stored messages", () => {
    localStorage.setItem("aedsRagMessages", "{not json");
    expect(loadMessages()).toEqual([]);
  });
});

describe("ratings", () => {
  it("formats the average difficulty", () => {
    expect(difficultyLabel(undefined)).toBeNull();
    expect(difficultyLabel({ sum: 0, count: 0 })).toBeNull();
    expect(difficultyLabel({ sum: 4, count: 1 })).toBe("4.0/5 (1 vote)");
    expect(difficultyLabel({ sum: 7, count: 2 })).toBe("3.5/5 (2 votes)");
  });

  it("stores my vote and dispatches it anonymously with a device id", async () => {
    mockFetch(() => ({ status: 204 }));
    submitRating("wir821", 4, 0);
    expect(myRating("wir821")).toBe(4);
    await Promise.resolve();
    const call = calls.find((c) => c.url.includes("/dispatches"))!;
    const body = JSON.parse(call.init!.body as string);
    expect(body.event_type).toBe("course-rating");
    expect(body.client_payload).toMatchObject({ course: "wir821", rating: 4 });
    expect(body.client_payload.device).toBe(localStorage.getItem("rating_device_id"));
  });

  it("clears my vote", () => {
    mockFetch(() => ({ status: 204 }));
    submitRating("wir821", 2, 0);
    clearRating("wir821", 2);
    expect(myRating("wir821")).toBe(0);
    const body = JSON.parse(calls[calls.length - 1].init!.body as string);
    expect(body.client_payload).toMatchObject({ course: "wir821", delete: true });
  });
});
