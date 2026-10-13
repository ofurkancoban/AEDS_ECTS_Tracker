import { afterEach, describe, expect, it, vi } from "vitest";
import { relativeTime } from "../components/FileBackup";
import { EmptyListGuard, fileBackupSupported, forgetHandle, lastWrite, loadHandle, permissionOf, pickFile, saveHandle, writeBackup } from "./fileBackup";
import { FakeHandle } from "./fakeFileHandle";
import { course } from "./testUtils";

afterEach(async () => {
  vi.unstubAllGlobals();
  await forgetHandle();
});

describe("file backup", () => {
  const list = [course("wir821", "economics", "SoSe24", "completed", "2.0"), course("wir873", "economics", "SoSe25", "planned")];

  it("writes the same JSON as a manual backup and remembers when", async () => {
    const h = new FakeHandle();
    const at = await writeBackup(h, list);
    expect(JSON.parse(h.content)).toEqual(list);
    expect(lastWrite()).toBe(at);
  });

  it("never replaces a backup that still has courses with an empty list, unless asked", async () => {
    const h = new FakeHandle();
    await writeBackup(h, list);
    await expect(writeBackup(h, [])).rejects.toBeInstanceOf(EmptyListGuard);
    expect(JSON.parse(h.content)).toHaveLength(2);
    await writeBackup(h, [], { allowEmpty: true });
    expect(JSON.parse(h.content)).toEqual([]);
  });

  it("writes an empty list into a new or empty file without asking", async () => {
    const h = new FakeHandle();
    await writeBackup(h, []);
    expect(h.content).toBe("[]");
  });

  it("keeps the previous backup when a write fails half way", async () => {
    const h = new FakeHandle();
    await writeBackup(h, list);
    h.failNext = "NotAllowedError";
    await expect(writeBackup(h, [list[0]])).rejects.toThrow();
    expect(JSON.parse(h.content)).toHaveLength(2);
  });

  it("knows whether the browser can do it", async () => {
    expect(fileBackupSupported()).toBe(false);
    vi.stubGlobal("showSaveFilePicker", async () => new FakeHandle());
    expect(fileBackupSupported()).toBe(true);
  });

  it("treats a cancelled save dialog as no choice", async () => {
    vi.stubGlobal("showSaveFilePicker", async () => {
      throw new DOMException("cancel", "AbortError");
    });
    expect(await pickFile()).toBeNull();
  });

  it("remembers the chosen file and its permission state", async () => {
    const h = new FakeHandle("mine.json");
    await saveHandle(h);
    expect((await loadHandle())?.name).toBe("mine.json");
    h.permission = "prompt";
    expect(await permissionOf(h)).toBe("prompt");
    await forgetHandle();
    expect(await loadHandle()).toBeNull();
  });

  it("describes how long ago the last write was", () => {
    const now = Date.parse("2026-10-13T12:00:00");
    expect(relativeTime(null, now)).toBe("never");
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 h ago");
  });
});
