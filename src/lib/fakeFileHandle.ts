import type { BackupHandle } from "./fileBackup";

/** In-memory stand-in for a FileSystemFileHandle: content only changes on close(), like the real one. */
export class FakeHandle implements BackupHandle {
  content = "";
  writes = 0;
  failNext: string | null = null;
  permission: "granted" | "prompt" | "denied" = "granted";
  constructor(public name = "ects-tracker-backup.json") {}
  async getFile() {
    return new File([this.content], this.name);
  }
  async createWritable() {
    let pending = "";
    return {
      write: async (d: string) => {
        if (this.failNext) {
          const n = this.failNext;
          this.failNext = null;
          throw new DOMException("fail", n);
        }
        pending += d;
      },
      close: async () => {
        this.content = pending;
        this.writes += 1;
      },
      abort: async () => {},
    };
  }
  async queryPermission() {
    return this.permission;
  }
  async requestPermission() {
    this.permission = "granted";
    return this.permission;
  }
}

