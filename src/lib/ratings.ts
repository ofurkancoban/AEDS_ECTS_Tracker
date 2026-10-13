import { useEffect, useState } from "react";

// Anonymous difficulty ratings: votes go to a private inbox repo via
// repository_dispatch (a fine-grained token limited to that), and the
// aggregate is published as ratings.json in this repo. The token placeholder
// is replaced at deploy time by .github/workflows/deploy-pages.yml.
const OWNER = "ofurkancoban";
const REPO = "AEDS_ECTS_Tracker";
const DISPATCH_REPO = "ratings-inbox";
const TOKEN = "__GITHUB_RATING_TOKEN__";

export type Ratings = Record<string, { sum: number; count: number }>;

let cache: Ratings | null = null;
let loading: Promise<Ratings> | null = null;
const listeners = new Set<(r: Ratings) => void>();

function emit(r: Ratings) {
  cache = r;
  listeners.forEach((l) => l(r));
}

function deviceId(): string {
  try {
    let id = localStorage.getItem("rating_device_id");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : "d-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("rating_device_id", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function loadRatings(): Promise<Ratings> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/ratings.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((r: Ratings) => {
        emit(r);
        return r;
      });
  }
  return loading;
}

export function useRatings(): Ratings {
  const [state, setState] = useState<Ratings>(cache || {});
  useEffect(() => {
    const l = (r: Ratings) => setState({ ...r });
    listeners.add(l);
    loadRatings().then(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}

function dispatch(payload: Record<string, unknown>) {
  fetch(`https://api.github.com/repos/${OWNER}/${DISPATCH_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "course-rating", client_payload: { ...payload, device: deviceId() } }),
  }).catch(() => {});
}

export function myRating(code: string): number {
  try {
    return parseInt(localStorage.getItem("rated_" + code) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function submitRating(code: string, rating: number, previous: number) {
  try {
    localStorage.setItem("rated_" + code, String(rating));
  } catch {
    /* ignore */
  }
  dispatch({ course: code, rating });
  const r = cache || {};
  const o = r[code] || { sum: 0, count: 0 };
  emit({ ...r, [code]: previous ? { sum: o.sum - previous + rating, count: o.count } : { sum: o.sum + rating, count: o.count + 1 } });
}

export function clearRating(code: string, previous: number) {
  try {
    localStorage.removeItem("rated_" + code);
  } catch {
    /* ignore */
  }
  dispatch({ course: code, delete: true });
  const r = cache || {};
  const o = r[code] || { sum: 0, count: 0 };
  emit({ ...r, [code]: { sum: Math.max(0, o.sum - previous), count: Math.max(0, o.count - 1) } });
}

export function difficultyLabel(info: { sum: number; count: number } | undefined): string | null {
  if (!info || info.count <= 0) return null;
  return `${(info.sum / info.count).toFixed(1)}/5 (${info.count} ${info.count === 1 ? "vote" : "votes"})`;
}
