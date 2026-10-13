// Integration tests: the whole app rendered in happy-dom, driven like a user.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { codeOf, labelForCode } from "./lib/catalog";
import { coursesToCsv } from "./lib/io";
import { course } from "./lib/testUtils";
import type { Course } from "./lib/types";

const STATE_KEY = "ects-tracker-state";

function seed(courses: Course[], extra: Record<string, unknown> = {}) {
  localStorage.setItem(STATE_KEY, JSON.stringify({ courses, theme: "light", targetGrade: "", graduationDate: "", ...extra }));
}
const saved = (): Course[] => JSON.parse(localStorage.getItem(STATE_KEY) || '{"courses":[]}').courses;
const savedState = () => JSON.parse(localStorage.getItem(STATE_KEY) || "{}");

function sample(): Course[] {
  return [
    course("wir821", "economics", "SoSe24", "completed", "3.0"),
    course("wir873", "economics", "WiSe25/26", "completed", "1.0"),
    course("inf604", "datascience", "WiSe25/26", "completed", "1.7"),
    course("wir874", "economics", "WiSe26/27", "planned"),
  ];
}

async function renderApp() {
  const user = userEvent.setup();
  const utils = render(<App />);
  await act(async () => {});
  return { user, ...utils };
}

const press = (key: string, opts: KeyboardEventInit = {}) => fireEvent.keyDown(document, { key, ...opts });
const dialog = (name: string | RegExp) => screen.getByRole("dialog", { name });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("changelog_seen", "x");
  window.location.hash = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 404 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-palette");
});

describe("navigation", () => {
  it("opens on the overview with nothing completed", async () => {
    await renderApp();
    expect(screen.getAllByRole("heading", { name: "Overview" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/ECTS to go/)).toBeTruthy();
  });

  it("switches views with the number keys and remembers the last one", async () => {
    await renderApp();
    press("2");
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Courses" }).length).toBeGreaterThan(0));
    press("6");
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Checklist" }).length).toBeGreaterThan(0));
    expect(localStorage.getItem("ects-tracker-view")).toBe("checklist");
  });

  it("ignores number keys while typing", async () => {
    await renderApp();
    press("2");
    const input = await screen.findByPlaceholderText("Filter your courses");
    fireEvent.keyDown(input, { key: "3" });
    expect(screen.getAllByRole("heading", { name: "Courses" }).length).toBeGreaterThan(0);
  });
});

describe("adding courses", () => {
  it("adds a catalog course from the command palette", async () => {
    const { user } = await renderApp();
    press("k", { ctrlKey: true });
    const pal = dialog("Add a course");
    await user.type(within(pal).getByPlaceholderText(/Search by code/), "wir821");
    await user.keyboard("{Enter}");
    await user.click(within(dialog("Add a course")).getByRole("button", { name: /Add course/ }));
    await waitFor(() => expect(saved().map((c) => codeOf(c.name))).toEqual(["wir821"]));
    const c = saved()[0];
    expect(c).toMatchObject({ category: "economics", homeCategory: "economics", status: "planned", ects: 6 });
    expect(c.studipLink).toMatch(/^https:/);
    expect(screen.getByText(/Added WIR821 to Economics/)).toBeTruthy();
  });

  it("adds a completed course with a grade", async () => {
    const { user } = await renderApp();
    press("k", { metaKey: true });
    const pal = dialog("Add a course");
    await user.type(within(pal).getByPlaceholderText(/Search by code/), "inf604");
    await user.keyboard("{Enter}");
    const cfg = dialog("Add a course");
    fireEvent.change(within(cfg).getByDisplayValue("Planned"), { target: { value: "completed" } });
    await user.click(within(cfg).getByRole("button", { name: "1.3" }));
    await user.click(within(cfg).getByRole("button", { name: /Add course/ }));
    await waitFor(() => expect(saved()[0]).toMatchObject({ status: "completed", grade: "1.3", category: "datascience" }));
  });

  it("offers a custom course when nothing in the catalog matches", async () => {
    const { user } = await renderApp();
    press("k", { ctrlKey: true });
    await user.type(within(dialog("Add a course")).getByPlaceholderText(/Search by code/), "Summer school Lisbon");
    await user.click(screen.getByRole("button", { name: /as a custom course/ }));
    await user.click(within(dialog("Add a course")).getByRole("button", { name: /Add course/ }));
    await waitFor(() => expect(saved()[0]).toMatchObject({ name: "Summer school Lisbon", category: "additional" }));
  });

  it("blocks a fourth attempt", async () => {
    seed([1, 2, 3].map((i) => course("wir821", "economics", `SoSe2${i + 1}`, "completed", "5.0")));
    const { user } = await renderApp();
    press("k", { ctrlKey: true });
    await user.type(within(dialog("Add a course")).getByPlaceholderText(/Search by code/), "wir821");
    await user.keyboard("{Enter}");
    expect(screen.getByText(/Maximum of 3 attempts already reached/)).toBeTruthy();
    expect((within(dialog("Add a course")).getByRole("button", { name: /Add course/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("warns that the next try is the final attempt", async () => {
    seed([course("wir821", "economics", "SoSe23", "completed", "5.0"), course("wir821", "economics", "SoSe24", "completed", "5.0")]);
    const { user } = await renderApp();
    press("k", { ctrlKey: true });
    await user.type(within(dialog("Add a course")).getByPlaceholderText(/Search by code/), "wir821");
    await user.keyboard("{Enter}");
    expect(screen.getByText(/attempt 3 of 3, the final allowed attempt/)).toBeTruthy();
  });

  it("filters the palette by category", async () => {
    const { user } = await renderApp();
    press("k", { ctrlKey: true });
    const pal = dialog("Add a course");
    await user.click(within(pal).getByRole("button", { name: "Thesis" }));
    expect(within(pal).getByText("1 modules")).toBeTruthy();
  });
});

describe("editing", () => {
  it("cycles the status from the pill", async () => {
    seed(sample());
    const { user } = await renderApp();
    press("2");
    const row = (await screen.findByText("Advanced Microeconomics")).closest(".group") as HTMLElement;
    await user.click(within(row).getByTitle("Click to change status"));
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir874")!.status).toBe("in-progress"));
  });

  it("changes a grade and recomputes the GPA", async () => {
    seed(sample());
    await renderApp();
    press("2");
    const row = (await screen.findByText("International Trade, Production and Change")).closest(".group") as HTMLElement;
    fireEvent.change(within(row).getByLabelText("Grade"), { target: { value: "1.0" } });
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir821")!.grade).toBe("1.0"));
    expect(screen.getAllByText("1.23").length).toBeGreaterThan(0);
  });

  it("removes a course and brings it back from the toast", async () => {
    seed(sample());
    const { user } = await renderApp();
    press("2");
    const row = (await screen.findByText("Advanced Microeconomics")).closest(".group") as HTMLElement;
    await user.click(within(row).getByLabelText("Course actions"));
    await user.click(screen.getByRole("button", { name: "Remove course" }));
    await waitFor(() => expect(saved()).toHaveLength(3));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved()).toHaveLength(4));
  });

  it("undoes and redoes any edit with the keyboard", async () => {
    seed(sample());
    await renderApp();
    press("2");
    const row = (await screen.findByText("International Trade, Production and Change")).closest(".group") as HTMLElement;
    fireEvent.change(within(row).getByLabelText("Grade"), { target: { value: "1.3" } });
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir821")!.grade).toBe("1.3"));
    press("z", { ctrlKey: true });
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir821")!.grade).toBe("3.0"));
    press("z", { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir821")!.grade).toBe("1.3"));
  });

  it("moves a course to another semester from the move sheet", async () => {
    seed(sample());
    const { user } = await renderApp();
    press("2");
    const row = (await screen.findByText("Advanced Microeconomics")).closest(".group") as HTMLElement;
    await user.click(within(row).getByLabelText("Course actions"));
    await user.click(screen.getByRole("button", { name: "Move to semester" }));
    const sheet = dialog("Advanced Microeconomics");
    const target = within(sheet)
      .getAllByRole("button")
      .find((b) => /^WiSe\d\d\/\d\d/.test(b.textContent || "") && !b.className.includes("bg-accent-soft"))!;
    const label = target.textContent!.slice(0, 9);
    await user.click(target);
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir874")!.semester).toBe(label));
  });

  it("moves an elective to Specialization and only back home afterwards", async () => {
    seed([course("wir821", "economics", "SoSe24", "completed", "2.0")]);
    const { user } = await renderApp();
    press("2");
    const row = (await screen.findByText("International Trade, Production and Change")).closest(".group") as HTMLElement;
    await user.click(within(row).getByLabelText("Course actions"));
    await user.click(screen.getByRole("button", { name: "Specialization" }));
    await waitFor(() => expect(saved()[0].category).toBe("specialization"));
    const moved = (await screen.findByText("International Trade, Production and Change")).closest(".group") as HTMLElement;
    await user.click(within(moved).getByLabelText("Course actions"));
    const menuTargets = screen.getAllByRole("button").filter((b) => ["Economics", "Further modules", "Additional"].includes(b.textContent || ""));
    expect(menuTargets.map((b) => b.textContent)).toEqual(["Economics"]);
  });
});

describe("modes and settings", () => {
  it("keeps what-if courses out of the real record and drops them when leaving", async () => {
    seed(sample());
    const { user } = await renderApp();
    await user.click(screen.getAllByRole("switch", { name: /What-if mode/ })[0]);
    press("k", { ctrlKey: true });
    await user.type(within(dialog("Add a course")).getByPlaceholderText(/Search by code/), "wir876");
    await user.keyboard("{Enter}");
    await user.click(within(dialog("Add a course")).getByRole("button", { name: "1.0" }));
    await user.click(within(dialog("Add a course")).getByRole("button", { name: /Add course/ }));
    await waitFor(() => expect(saved().some((c) => c.hypothetical)).toBe(true));
    expect(screen.getAllByText(/projected 1\.\d\d/).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("switch", { name: /What-if mode/ })[0]);
    await waitFor(() => expect(saved().some((c) => c.hypothetical)).toBe(false));
    expect(saved()).toHaveLength(4);
  });

  it("switches palette and mode from Appearance without touching course data", async () => {
    seed(sample());
    const { user } = await renderApp();
    await user.click(screen.getAllByRole("button", { name: "Appearance" })[0]);
    const dlg = dialog("Appearance");
    await user.click(within(dlg).getByRole("button", { name: /^Forest/ }));
    await user.click(within(dlg).getByRole("button", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-palette")).toBe("forest");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("ects-tracker-palette")).toBe("forest");
    await waitFor(() => expect(savedState().theme).toBe("dark"));
    expect(Object.keys(savedState()).sort()).toEqual(["courses", "graduationDate", "installBannerDismissed", "lastBackupAt", "targetGrade", "theme", "usageCount"]);
  });

  it("saves the target GPA and shows the required average", async () => {
    seed([course("wir873", "economics", "SoSe25", "completed", "2.0")]);
    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Target GPA"), "1,9");
    await waitFor(() => expect(savedState().targetGrade).toBe("1.9"));
    expect(screen.getByText(/Need 1\.89 avg across the remaining 114 ECTS/)).toBeTruthy();
  });
});

describe("data", () => {
  it("imports a CSV through the Data menu input", async () => {
    await renderApp();
    const input = document.querySelector('input[accept*="csv"]') as HTMLInputElement;
    const file = new File([coursesToCsv(sample())], "t.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(saved()).toHaveLength(4));
    expect(screen.getByText("Imported 4 course(s).")).toBeTruthy();
  });

  it("imports a shared #qrimport link after confirmation", async () => {
    window.location.hash = "#qrimport=" + encodeURIComponent("e~wir821~6~SoSe24~c~2.3\nd~inf604~6~WiSe25/26~p~");
    const { user } = await renderApp();
    expect(screen.getByText(/Import 2 course\(s\) from this shared link/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(saved().map((c) => [codeOf(c.name), c.status, c.grade])).toEqual([
      ["wir821", "completed", "2.3"],
      ["inf604", "planned", ""],
    ]));
    expect(window.location.hash).toBe("");
  });

  it("resets only after confirmation, and the reset can be undone", async () => {
    seed(sample());
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Data" }));
    await user.click(screen.getByRole("button", { name: "Reset tracker" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(saved()).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Data" }));
    await user.click(screen.getByRole("button", { name: "Reset tracker" }));
    await user.click(screen.getByRole("button", { name: "Delete everything" }));
    await waitFor(() => expect(saved()).toHaveLength(0));
    press("z", { ctrlKey: true });
    await waitFor(() => expect(saved()).toHaveLength(4));
  });
});

describe("planning views", () => {
  it("shows the checklist with compulsory modules", async () => {
    seed(sample());
    await renderApp();
    press("6");
    expect(await screen.findByText("Compulsory modules")).toBeTruthy();
    expect(screen.getByText(labelForCode("wir873"))).toBeTruthy();
    expect(screen.getByText(/Graduation readiness/i)).toBeTruthy();
  });

  it("adds a suggested next-semester plan in one click", async () => {
    seed(sample());
    const { user } = await renderApp();
    press("4");
    const button = await screen.findByRole("button", { name: /Add to my plan/ });
    const before = saved().length;
    await user.click(button);
    await waitFor(() => expect(saved().length).toBeGreaterThan(before));
    expect(saved().slice(before).every((c) => c.status === "planned")).toBe(true);
  });

  it("projects the final GPA in the grade simulator", async () => {
    seed(sample(), { targetGrade: "1.5" });
    const { user } = await renderApp();
    press("4");
    expect(await screen.findByText("Projected final GPA")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reach target/ }));
    expect(screen.getByText("Target reached")).toBeTruthy();
  });

  it("finds modules in the catalog by lecturer", async () => {
    const { user } = await renderApp();
    press("5");
    const search = await screen.findByPlaceholderText(/Search code, title, lecturer/);
    await user.type(search, "Trautwein");
    await waitFor(() => expect(screen.getByText(/^\d+ of \d+ modules$/).textContent).toMatch(/^[1-9]\d* of/));
    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
  });
});
