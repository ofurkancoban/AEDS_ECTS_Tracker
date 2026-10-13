// Integration tests: the whole app rendered in happy-dom, driven like a user.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
  vi.restoreAllMocks();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-palette");
});

describe("navigation", () => {
  it("welcomes a new user with three ways to start", async () => {
    const { user } = await renderApp();
    expect(screen.getAllByRole("heading", { name: "Overview" }).length).toBeGreaterThan(0);
    const welcome = screen.getByRole("region", { name: "Let's map out your master's" });
    expect(within(welcome).getAllByRole("listitem")).toHaveLength(3);
    await user.click(within(welcome).getByRole("button", { name: "Add a course" }));
    expect(dialog("Add a course")).toBeTruthy();
    press("Escape");
    await user.click(within(welcome).getByRole("button", { name: "Start sync" }));
    expect(await screen.findByRole("dialog", { name: "Sync grades from StudIP" })).toBeTruthy();
  });

  it("shows the dashboard instead once there are courses", async () => {
    seed(sample());
    await renderApp();
    expect(screen.queryByRole("region", { name: "Let's map out your master's" })).toBeNull();
    expect(screen.getByText(/of 120 ECTS done/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Credits and GPA by semester" })).toBeTruthy();
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
  it("adds what-if courses as simulated, completed courses that only move the projected GPA", async () => {
    seed(sample());
    const { user } = await renderApp();
    const gpaBefore = screen.getAllByText("1.90")[0];
    expect(gpaBefore).toBeTruthy();
    await user.click(screen.getAllByRole("switch", { name: /What-if mode/ })[0]);
    expect(screen.getByRole("status").textContent).toMatch(/courses you add now are simulated/);
    press("k", { ctrlKey: true });
    await user.type(within(dialog("Add a course")).getByPlaceholderText(/Search by code/), "wir876");
    await user.keyboard("{Enter}");
    const cfg = dialog("Add a course");
    expect((within(cfg).getByRole("checkbox", { name: /What-if course/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(cfg).getByDisplayValue("Completed") as HTMLSelectElement).value).toBe("completed");
    await user.click(within(cfg).getByRole("button", { name: "1.0" }));
    await user.click(within(cfg).getByRole("button", { name: /Add course/ }));
    await waitFor(() => expect(saved().find((c) => c.hypothetical)).toMatchObject({ status: "completed", grade: "1.0" }));
    // Real GPA (3.0, 1.0, 1.7 over 18 ECTS) stays 1.90; projected includes the 1.0: 6.7 / 4 = 1.68.
    expect(screen.getAllByText("1.90").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/projected 1\.68/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("plan-status").textContent).toMatch(/^102 ECTS left/);
  });

  it("keeps what-if courses when the mode is turned off, until cleared with confirmation", async () => {
    seed([...sample(), course("wir876", "economics", "SoSe26", "completed", "1.0", { hypothetical: true })]);
    const { user } = await renderApp();
    // Saved what-if courses are visible and announced even with the mode off.
    expect(screen.getByRole("status").textContent).toMatch(/1 what-if course is kept aside/);
    await user.click(screen.getAllByRole("switch", { name: /What-if mode/ })[0]);
    await user.click(screen.getAllByRole("switch", { name: /What-if mode/ })[0]);
    expect(saved().filter((c) => c.hypothetical)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Clear what-if courses" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(saved().filter((c) => c.hypothetical)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Clear what-if courses" }));
    expect(dialog("Remove 1 what-if course?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(saved()).toHaveLength(4));
    expect(saved().some((c) => c.hypothetical)).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved().filter((c) => c.hypothetical)).toHaveLength(1));
  });

  it("turns a real course into a what-if one and back without losing it", async () => {
    seed(sample());
    const { user } = await renderApp();
    press("2");
    const row = (await screen.findByText("Advanced Microeconomics")).closest(".group") as HTMLElement;
    await user.click(within(row).getByRole("button", { expanded: false }));
    expect(within(row).queryByRole("checkbox", { name: "What-if only" })).toBeNull();
    await user.click(screen.getAllByRole("switch", { name: /What-if mode/ })[0]);
    await user.click(within(row).getByRole("checkbox", { name: "What-if only" }));
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir874")!.hypothetical).toBe(true));
    await user.click(screen.getAllByRole("switch", { name: /What-if mode/ })[0]);
    expect(saved()).toHaveLength(4);
    // The checkbox stays available on simulated courses so they can be made real again.
    await user.click(within(row).getByRole("checkbox", { name: "What-if only" }));
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir874")!.hypothetical).toBe(false));
  });

  it("leaves what-if courses out of the CSV export", async () => {
    seed([...sample(), course("wir876", "economics", "SoSe26", "completed", "1.0", { hypothetical: true })]);
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => (blobs.push(b as Blob), "blob:x"));
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Data" }));
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    const text = await blobs[0].text();
    expect(text.trim().split("\n")).toHaveLength(1 + 4);
    expect(text).not.toContain("wir876");
    expect(screen.getByText(/1 what-if course\(s\) left out/)).toBeTruthy();
  });

  it("never writes StudIP grades into what-if courses", async () => {
    seed([course("wir821", "economics", "SoSe24", "completed", "", { hypothetical: true })]);
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Data" }));
    await user.click(screen.getByRole("button", { name: /Sync from StudIP/ }));
    const dlg = await screen.findByRole("dialog", { name: "Sync grades from StudIP" });
    await user.click(within(dlg).getByPlaceholderText(/Paste the copied text/));
    await user.paste("1\tmodule International Trade, Production and Change\t2100821\t\t2,0\tBE");
    await user.click(within(dlg).getByRole("button", { name: /Match/ }));
    // Proposed as a new real course instead of updating the simulated one.
    expect(within(dlg).queryByText(/Matched/)).toBeNull();
    expect(within(dlg).getByText(/Not in your tracker yet/)).toBeTruthy();
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

describe("robustness", () => {
  it("opens with broken saved data instead of crashing, keeping what is valid", async () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ courses: [{ id: "a", name: "wir821 - International Trade, Production and Change", category: "economics", ects: 6, status: "completed", grade: "2,3" }, { foo: 1 }, null, "x"] }),
    );
    await renderApp();
    expect(screen.getByText(/of 120 ECTS done/)).toBeTruthy();
    expect(screen.getAllByText("2.30").length).toBeGreaterThan(0);
  });

  it("restores a JSON backup but skips unreadable entries", async () => {
    seed(sample());
    const { user } = await renderApp();
    const input = document.querySelector('input[accept*="json"]') as HTMLInputElement;
    const file = new File([JSON.stringify([{ name: "wir821 - International Trade, Production and Change", category: "economics", ects: 6 }, { nope: true }])], "b.json");
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(/1 unreadable entry will be skipped/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(saved()).toHaveLength(1));
    expect(saved()[0]).toMatchObject({ status: "planned", semester: "Unscheduled" });
  });

  it("refuses a JSON file that is not a backup", async () => {
    await renderApp();
    const input = document.querySelector('input[accept*="json"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['{"hello": 1}'], "x.json")] } });
    expect(await screen.findByText("This file does not look like a valid backup.")).toBeTruthy();
  });

  it("shows a rescue screen instead of a blank page if something crashes", async () => {
    const Boom = () => {
      throw new Error("boom");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/Something went wrong/);
    expect(screen.getByRole("button", { name: "Download my data" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open classic view" }).getAttribute("href")).toBe("./legacy/");
    const report = new URL(screen.getByRole("link", { name: "Report this problem" }).getAttribute("href")!);
    expect(report.pathname).toBe("/ofurkancoban/AEDS_ECTS_Tracker/issues/new");
    expect(report.searchParams.get("title")).toBe("Crash: boom");
    expect(report.searchParams.get("body")).toContain("no course data");
  });
});

describe("undo precision", () => {
  it("the removal toast restores that course even after other edits", async () => {
    seed(sample());
    const { user } = await renderApp();
    press("2");
    const row = (await screen.findByText("Advanced Microeconomics")).closest(".group") as HTMLElement;
    await user.click(within(row).getByLabelText("Course actions"));
    await user.click(screen.getByRole("button", { name: "Remove course" }));
    const other = (await screen.findByText("International Trade, Production and Change")).closest(".group") as HTMLElement;
    fireEvent.change(within(other).getByLabelText("Grade"), { target: { value: "1.0" } });
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir821")!.grade).toBe("1.0"));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved().some((c) => codeOf(c.name) === "wir874")).toBe(true));
    // The later grade edit is kept.
    expect(saved().find((c) => codeOf(c.name) === "wir821")!.grade).toBe("1.0");
    expect(saved().map((c) => codeOf(c.name))).toEqual(["wir821", "wir873", "inf604", "wir874"]);
  });

  it("quick edits to different courses are separate undo steps, typing a note is one", async () => {
    seed(sample());
    const { user } = await renderApp();
    press("2");
    const a = (await screen.findByText("International Trade, Production and Change")).closest(".group") as HTMLElement;
    const b = screen.getByText("Applied Economics").closest(".group") as HTMLElement;
    fireEvent.change(within(a).getByLabelText("Grade"), { target: { value: "1.0" } });
    fireEvent.change(within(b).getByLabelText("Grade"), { target: { value: "2.0" } });
    const grades = () => saved().map((c) => [codeOf(c.name), c.grade]);
    await waitFor(() => expect(grades().slice(0, 2)).toEqual([["wir821", "1.0"], ["wir873", "2.0"]]));
    press("z", { ctrlKey: true });
    // Only the second edit is undone.
    await waitFor(() => expect(grades().slice(0, 2)).toEqual([["wir821", "1.0"], ["wir873", "1.0"]]));
    press("z", { ctrlKey: true });
    await waitFor(() => expect(grades().slice(0, 2)).toEqual([["wir821", "3.0"], ["wir873", "1.0"]]));
    press("z", { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(grades().slice(0, 2)).toEqual([["wir821", "1.0"], ["wir873", "1.0"]]));

    await user.click(within(a).getByRole("button", { expanded: false }));
    await user.type(within(a).getByPlaceholderText(/Exam date/), "Room A1");
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir821")!.notes).toBe("Room A1"));
    (document.activeElement as HTMLElement).blur();
    press("z", { ctrlKey: true });
    // One undo removes the whole note, not a single letter.
    await waitFor(() => expect(saved().find((c) => codeOf(c.name) === "wir821")!.notes).toBe(""));
    expect(saved().find((c) => codeOf(c.name) === "wir821")!.grade).toBe("1.0");
  });

  it("restores a chosen automatic backup, and that can be undone", async () => {
    const all = sample();
    localStorage.setItem(STATE_KEY + "::backups", JSON.stringify([{ t: Date.parse("2026-10-01T10:00:00Z"), value: JSON.stringify({ courses: all.slice(0, 2) }) }]));
    seed(all);
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Data" }));
    await user.click(screen.getByRole("button", { name: "Restore automatic backup" }));
    const dlg = dialog("Automatic backups");
    expect(within(dlg).getByText(/2 courses · brings back 0, drops 2/)).toBeTruthy();
    await user.click(within(dlg).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(saved()).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved()).toHaveLength(4));
  });

  it("says how long ago a past graduation date was", async () => {
    seed(sample(), { graduationDate: "2020-01-01" });
    await renderApp();
    expect(screen.getByText("Graduation date passed")).toBeTruthy();
    expect(screen.getByText(/days ago/)).toBeTruthy();
  });
});

describe("visual features", () => {
  it("groups alerts in one panel, most severe first, with the rest on demand", async () => {
    // A late graduation date, no backup, a missing grade and a compulsory course on its last run.
    seed([...sample(), course("wir875", "empirical", "SoSe25", "completed", "")], { graduationDate: "2020-01-01" });
    const { user } = await renderApp();
    const panel = screen.getByRole("region", { name: "Needs attention" });
    const items = () => within(panel).getAllByRole("listitem");
    expect(items()).toHaveLength(2);
    const toggle = within(panel).getByRole("button", { name: /Show all \d+/ });
    const total = Number(toggle.textContent!.match(/\d+/)![0]);
    expect(total).toBeGreaterThan(2);
    await user.click(toggle);
    expect(items()).toHaveLength(total);
    // Danger (last chance) before warnings before muted notes.
    const order = items().map((li) => (li.querySelector("span")!.className.match(/bg-(danger|warn|ink|accent)/) || [])[1]);
    const rank = { danger: 0, warn: 1, ink: 2, accent: 3 } as Record<string, number>;
    expect([...order].sort((a, b) => rank[a] - rank[b])).toEqual(order);
  });

  it("switches to compact density from Appearance", async () => {
    const { user } = await renderApp();
    await user.click(screen.getAllByRole("button", { name: "Appearance" })[0]);
    await user.click(within(dialog("Appearance")).getByRole("radio", { name: /Compact/ }));
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(localStorage.getItem("ects-tracker-density")).toBe("compact");
  });

  it("keeps the tab icon in the palette's colours", async () => {
    const { user } = await renderApp();
    const icon = () => document.querySelector<HTMLLinkElement>('link[rel="icon"][data-dynamic]');
    await waitFor(() => expect(icon()).toBeTruthy());
    const before = icon()!.href;
    await user.click(screen.getAllByRole("button", { name: "Appearance" })[0]);
    // happy-dom doesn't compute palette CSS, so check the mode switch here (palettes: see e2e).
    await user.click(within(dialog("Appearance")).getByRole("button", { name: /^Dark$/ }));
    await waitFor(() => expect(icon()!.href).not.toBe(before));
    expect(decodeURIComponent(icon()!.href)).toContain("<svg");
  });

  it("collapses past semesters on the timeline and remembers it", async () => {
    seed(sample());
    const { user } = await renderApp();
    press("3");
    const strip = await screen.findByRole("navigation", { name: "Semesters" });
    expect(screen.getByRole("region", { name: "SoSe24" })).toBeTruthy();
    await user.click(within(strip).getByRole("button", { name: "Hide past" }));
    expect(screen.queryByRole("region", { name: "SoSe24" })).toBeNull();
    expect(localStorage.getItem("ects-tracker-past-collapsed")).toBe("1");
    // Jumping to a hidden semester brings the past back.
    await user.click(within(strip).getByRole("button", { name: /^SoSe24/ }));
    expect(await screen.findByRole("region", { name: "SoSe24" })).toBeTruthy();
  });

  it("celebrates once when the last requirement is met", async () => {
    const { ownPool, codeOf: code } = await import("./lib/catalog");
    const { getCatalog } = await import("./lib/catalog");
    const cat = getCatalog();
    const full: Course[] = [];
    const add = (id: Course["category"], need: number) => {
      const pool = ownPool(id, cat).filter((l) => !full.some((c) => c.name === l));
      const sorted = [...pool.filter((l) => cat.compulsory.includes(code(l) || "")), ...pool.filter((l) => !cat.compulsory.includes(code(l) || ""))];
      let e = 0;
      for (const l of sorted) {
        if (e >= need) break;
        full.push(course(l, id, "SoSe25", "completed", "1.7"));
        e += id === "thesis" ? 30 : 6;
      }
    };
    add("economics", 36);
    add("empirical", 18);
    add("datascience", 18);
    add("specialization", 18);
    add("thesis", 30);
    const last = full[full.length - 1];
    seed(full.map((c) => (c.id === last.id ? { ...c, status: "in-progress" as const, grade: "" } : c)));
    const { user } = await renderApp();
    press("2");
    const row = (await screen.findAllByText(/Degree Module/))[0].closest(".group") as HTMLElement;
    await user.click(within(row).getByTitle("Click to change status"));
    expect(await screen.findByTestId("celebration")).toBeTruthy();
    expect(screen.getByText("Every requirement is met. Congratulations!")).toBeTruthy();
    expect(localStorage.getItem("ects-tracker-celebrated")).toBe("1");
  });
});

describe("credits beyond a requirement", () => {
  it("warns about an over-full category and moves a course with one click", async () => {
    const econ = ["wir821", "wir873", "wir874", "wir876", "wir878", "wir893", "wir901"].map((c) => course(c, "economics", "SoSe25", "completed", "2.0"));
    seed(econ);
    const { user } = await renderApp();
    const panel = screen.getByRole("region", { name: "Needs attention" });
    await user.click(within(panel).queryByRole("button", { name: /Show all/ }) ?? panel);
    const note = within(panel)
      .getAllByRole("listitem")
      .find((li) => /more than it needs/.test(li.textContent || ""))!;
    expect(note.textContent).toMatch(/Economics has 6 ECTS more than it needs/);
    expect(screen.getByTestId("plan-status").textContent).toMatch(/^84 ECTS left/);
    await user.click(within(note).getByRole("button", { name: /Move to SPEC/ }));
    await waitFor(() => expect(saved().filter((c) => c.category === "specialization")).toHaveLength(1));
    expect(screen.getByTestId("plan-status").textContent).toMatch(/^78 ECTS left/);
  });
});

describe("progress headline", () => {
  const status = () => screen.getByTestId("plan-status").textContent!.replace(/\s+/g, " ").trim();

  it("says how much is left, what is already covered and what is not in the plan", async () => {
    seed(sample());
    await renderApp();
    expect(screen.getByRole("heading", { level: 2, name: /ECTS done/ }).textContent).toBe("Finding your rhythm: 18 of 120 ECTS done");
    expect(status()).toBe(
      "102 ECTS left. 6 of them are already running or planned. Not in your plan yet: Economics 18 ECTS, Empirical Methods 18 ECTS, Data Science 12 ECTS, Specialization 18 ECTS, Thesis 30 ECTS. Plan it",
    );
  });

  it("names only the thesis when everything else is planned", async () => {
    const plan = [
      ...["wir821", "wir873", "wir874", "wir876", "wir878", "wir893"].map((c) => course(c, "economics", "WiSe26/27", "planned")),
      ...["wir875", "wir894", "wir897"].map((c) => course(c, "empirical", "WiSe26/27", "planned")),
      ...["inf604", "inf607", "inf040"].map((c) => course(c, "datascience", "WiSe26/27", "planned")),
      ...["inf535", "inf530", "wir842"].map((c) => course(c, "specialization", "SoSe27", "planned")),
    ];
    seed(plan);
    await renderApp();
    expect(status()).toBe("120 ECTS left. 90 of them are already running or planned. Not in your plan yet: Thesis 30 ECTS. Plan it");
    cleanup();
    seed([...plan, course("mam", "thesis", "WiSe27/28", "planned")]);
    await renderApp();
    expect(status()).toBe("120 ECTS left. Everything you still need is already running or planned.");
  });

  it("says so when nothing is in the plan yet, and when everything is", async () => {
    seed([course("wir821", "economics", "SoSe24", "completed", "2.0")]);
    await renderApp();
    expect(status()).toMatch(/^114 ECTS left\. None of it is in your plan yet: Economics 30 ECTS, /);
    cleanup();
    seed([course("mam", "thesis", "SoSe27", "planned")]);
    await renderApp();
    expect(screen.getByText("Ready to start: 120 ECTS ahead")).toBeTruthy();
    expect(status()).toMatch(/^120 ECTS left\. 30 of them are already running or planned\. Not in your plan yet: Economics 36 ECTS/);
  });
});

describe("planning risks", () => {
  it("warns only when the credits not planned can't fit before graduation", async () => {
    seed(sample(), { graduationDate: "2099-01-01" });
    await renderApp();
    expect(screen.queryByText(/still need a place/)).toBeNull();
    cleanup();
    const nextYear = new Date().getFullYear() + 1;
    seed(sample(), { graduationDate: `${nextYear}-09-30` }); // one semester after the running one
    await renderApp();
    const panel = screen.getByRole("region", { name: "Needs attention" });
    const first = within(panel).getAllByRole("listitem")[0];
    expect(first.textContent).toMatch(/still need a place, but .* have room for only \d+ ECTS at 30 per semester/);
    expect(within(first).getByRole("button", { name: "Open planner" })).toBeTruthy();
  });

  it("shows 'to plan' as information, not a warning", async () => {
    seed(sample());
    await renderApp();
    const tag = screen.getAllByText(/^\d+ to plan$/)[0];
    expect(tag.className).toContain("text-muted");
    expect(tag.className).not.toContain("text-warn");
  });
});
