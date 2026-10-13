import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { forgetHandle, saveHandle } from "./lib/fileBackup";
import { FakeHandle } from "./lib/fakeFileHandle";
import { course } from "./lib/testUtils";

const seed = () =>
  localStorage.setItem(
    "ects-tracker-state",
    JSON.stringify({ courses: [course("wir821", "economics", "SoSe24", "completed", "2.0"), course("wir873", "economics", "SoSe25", "planned")], theme: "light" }),
  );

let file: FakeHandle;

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem("changelog_seen", "x");
  await forgetHandle();
  file = new FakeHandle();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 404 })));
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await forgetHandle();
});

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Data" }));
  await user.click(screen.getByRole("button", { name: /Automatic file backup/ }));
  return screen.getByRole("dialog", { name: "Automatic file backup" });
}

describe("automatic file backup", () => {
  it("explains the alternatives where the browser can't write files", async () => {
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    const dlg = await openSettings(user);
    expect(within(dlg).getByText(/works in Chrome and Edge on a computer/)).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: /Download backup/ })).toBeTruthy();
  });

  it("writes right after choosing a file, then a few seconds after each change", async () => {
    vi.stubGlobal("showSaveFilePicker", async () => file);
    seed();
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    const dlg = await openSettings(user);
    await user.click(within(dlg).getByRole("button", { name: /Choose backup file/ }));
    await waitFor(() => expect(JSON.parse(file.content)).toHaveLength(2));
    expect(within(dlg).getByRole("status").textContent).toMatch(/On · ects-tracker-backup.json/);
    expect(screen.getByText(/Backed up · just now/)).toBeTruthy();
    // The reminder counts this as a backup.
    await waitFor(() => expect(JSON.parse(localStorage.getItem("ects-tracker-state")!).lastBackupAt).toBeTruthy());

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "2" });
    const row = (await screen.findByText("Applied Economics")).closest(".group") as HTMLElement;
    await user.click(within(row).getByTitle("Click to change status"));
    await waitFor(() => expect(JSON.parse(file.content)[1].status).toBe("in-progress"), { timeout: 5000 });
    expect(file.writes).toBe(2);
  });

  it("asks before emptying a backup that still has courses", async () => {
    vi.stubGlobal("showSaveFilePicker", async () => file);
    seed();
    file.content = JSON.stringify([{ name: "x" }, { name: "y" }, { name: "z" }]);
    await saveHandle(file);
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "Data" }));
    await user.click(screen.getByRole("button", { name: "Reset tracker" }));
    await user.click(screen.getByRole("button", { name: "Delete everything" }));
    const ask = await screen.findByRole("dialog", { name: "Empty the backup file too?" }, { timeout: 5000 });
    expect(within(ask).getByText(/still has 3 course/)).toBeTruthy();
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(JSON.parse(file.content)).toHaveLength(3);
  });

  it("asks for permission again in a new session and resumes", async () => {
    vi.stubGlobal("showSaveFilePicker", async () => file);
    seed();
    file.permission = "prompt";
    await saveHandle(file);
    const user = userEvent.setup();
    render(<App />);
    const resume = await screen.findByRole("button", { name: /Resume file backup/ });
    await user.click(resume);
    await waitFor(() => expect(JSON.parse(file.content)).toHaveLength(2));
    expect(await screen.findByText(/Backed up · just now/)).toBeTruthy();
  });

  it("tells the student when the file was moved, and can be turned off", async () => {
    vi.stubGlobal("showSaveFilePicker", async () => file);
    seed();
    await saveHandle(file);
    file.failNext = "NotFoundError";
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    const dlg = await openSettings(user);
    await user.click(within(dlg).getByRole("button", { name: /Back up now/ }));
    expect(await within(dlg).findByText(/moved or deleted/)).toBeTruthy();
    await user.click(within(dlg).getByRole("button", { name: "Turn off" }));
    expect(within(dlg).getByRole("button", { name: /Choose backup file/ })).toBeTruthy();
    expect(screen.queryByText(/Backed up ·/)).toBeNull();
  });
});
