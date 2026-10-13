// Placement of the tour card and arrow, and when the tour offers itself.
import { beforeEach, describe, expect, it } from "vitest";
import { arrowPath, coversScreen, GAP, markTourDone, placeCard, shouldInviteToTour, tourDone, visiblePart } from "./tour";

const vp = { w: 1440, h: 900 };
const card = { w: 340, h: 260 };

describe("placeCard", () => {
  it("centres the card when there is nothing to point at", () => {
    expect(placeCard(null, card, vp, false)).toEqual({ x: 550, y: 320, side: null });
  });

  it("prefers below the target, aligned with it but kept on screen", () => {
    expect(placeCard({ x: 1220, y: 12, w: 176, h: 40 }, card, vp, false)).toEqual({ x: 1440 - 340 - 16, y: 12 + 40 + GAP, side: "bottom" });
  });

  it("goes right, then above, then left when below is too tight", () => {
    expect(placeCard({ x: 16, y: 100, w: 216, h: 700 }, card, vp, false).side).toBe("right");
    expect(placeCard({ x: 300, y: 600, w: 1100, h: 250 }, card, vp, false).side).toBe("top");
    expect(placeCard({ x: 1000, y: 100, w: 420, h: 760 }, card, vp, false).side).toBe("left");
  });

  it("falls back to the bottom-right corner for a target that fills the screen", () => {
    expect(placeCard({ x: 260, y: 60, w: 1160, h: 830 }, card, vp, false)).toEqual({ x: 1084, y: 624, side: null });
  });

  it("docks to the edge away from the target on a phone", () => {
    const phone = { w: 412, h: 915 };
    const c = { w: 380, h: 300 };
    expect(placeCard({ x: 170, y: 850, w: 64, h: 60 }, c, phone, true)).toMatchObject({ x: 16, side: "top" });
    expect(placeCard({ x: 0, y: 10, w: 412, h: 60 }, c, phone, true)).toMatchObject({ x: 16, y: 915 - 300 - 16 - 72, side: "bottom" });
  });
});

describe("arrowPath", () => {
  it("runs from the card's top edge up to the target's bottom edge", () => {
    const a = arrowPath({ x: 100, y: 300, w: 340, h: 200 }, { x: 200, y: 100, w: 100, h: 40 })!;
    expect(a.d.startsWith("M 250 294 Q")).toBe(true);
    expect(a.end).toEqual({ x: 250, y: 148 });
  });

  it("points sideways when the card is beside the target", () => {
    const a = arrowPath({ x: 300, y: 100, w: 340, h: 200 }, { x: 16, y: 120, w: 216, h: 40 })!;
    expect(a.end).toEqual({ x: 232 + 8, y: 140 });
  });

  it("draws nothing when the card overlaps the target", () => {
    expect(arrowPath({ x: 100, y: 100, w: 340, h: 200 }, { x: 50, y: 50, w: 600, h: 600 })).toBeNull();
  });
});

describe("visibility helpers", () => {
  it("clips a long view to what shows on screen", () => {
    expect(visiblePart({ x: 260, y: -400, w: 1100, h: 3000 }, vp)).toEqual({ x: 260, y: 0, w: 1100, h: 900 });
  });

  it("tells when a target covers most of the screen", () => {
    expect(coversScreen({ x: 0, y: 0, w: 412, h: 800 }, { w: 412, h: 915 })).toBe(true);
    expect(coversScreen({ x: 0, y: 0, w: 412, h: 300 }, { w: 412, h: 915 })).toBe(false);
  });
});

describe("shouldInviteToTour", () => {
  beforeEach(() => localStorage.clear());

  it("invites only a brand-new visitor", () => {
    expect(shouldInviteToTour(0)).toBe(true);
    expect(shouldInviteToTour(3)).toBe(false);
    localStorage.setItem("changelog_seen", "2026-10-13");
    expect(shouldInviteToTour(0)).toBe(false);
  });

  it("never again once the tour was finished or dismissed", () => {
    expect(tourDone()).toBe(false);
    markTourDone();
    expect(tourDone()).toBe(true);
    expect(shouldInviteToTour(0)).toBe(false);
  });
});
