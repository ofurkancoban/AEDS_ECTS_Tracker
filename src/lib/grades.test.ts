import { describe, expect, it } from "vitest";
import { gradeTone } from "./grades";

describe("gradeTone", () => {
  it("runs from the accent colour at 1.0 to the warning colour at 4.0", () => {
    expect(gradeTone("1.0")!.color).toBe("var(--accent)");
    expect(gradeTone("4.0")!.color).toBe("var(--warn)");
    expect(gradeTone(2.5)!.color).toBe("color-mix(in oklch, var(--warn) 50%, var(--accent))");
    expect(gradeTone("2,0")!.color).toBe("color-mix(in oklch, var(--warn) 33%, var(--accent))");
  });

  it("marks fails with the danger colour and ignores missing grades", () => {
    expect(gradeTone("5.0")).toEqual({ color: "var(--danger)", soft: "var(--danger-soft)" });
    expect(gradeTone("")).toBeNull();
    expect(gradeTone("abc")).toBeNull();
    expect(gradeTone(undefined)).toBeNull();
  });

  it("gets lighter tints for backgrounds", () => {
    expect(gradeTone("1.0")!.soft).toBe("color-mix(in oklab, var(--accent) 14%, transparent)");
  });
});
