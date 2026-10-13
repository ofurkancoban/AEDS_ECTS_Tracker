// The chosen file must survive a reload: the handle goes to IndexedDB and comes
// back on the next visit. Uses an IndexedDB emulation, since happy-dom has none.
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

describe("remembering the backup file across visits", () => {
  it("stores the handle in IndexedDB and reads it back in a fresh module instance", async () => {
    const first = await import("./fileBackup");
    // A structured-cloneable stand-in (real handles are cloneable too).
    await first.saveHandle({ name: "my-backup.json" } as unknown as import("./fileBackup").BackupHandle);

    vi.resetModules(); // like a page reload: no in-memory copy left
    const second = await import("./fileBackup");
    expect((await second.loadHandle())?.name).toBe("my-backup.json");

    await second.forgetHandle();
    vi.resetModules();
    const third = await import("./fileBackup");
    expect(await third.loadHandle()).toBeNull();
  });
});
