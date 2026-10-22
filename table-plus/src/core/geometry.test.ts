import { describe, expect, it } from "vitest";
import { EVERYWHERE, intersect, isEmpty } from "./geometry.ts";

describe("intersect", () => {
  it("gives the part the boxes share", () => {
    expect(intersect({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 5, right: 20, top: -5, bottom: 8 })).toEqual({
      left: 5,
      right: 10,
      top: 0,
      bottom: 8,
    });
  });

  it("leaves a side without a limit as the others have it", () => {
    expect(intersect({ left: 0, right: 10, top: 0, bottom: 10 }, { ...EVERYWHERE, top: 4 })).toEqual({ left: 0, right: 10, top: 4, bottom: 10 });
  });

  it("of no boxes is everywhere", () => {
    expect(intersect()).toEqual(EVERYWHERE);
  });
});

describe("isEmpty", () => {
  it("is true for boxes that do not overlap, or only touch", () => {
    expect(isEmpty(intersect({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 20, right: 30, top: 0, bottom: 10 }))).toBe(true);
    expect(isEmpty(intersect({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 10, right: 30, top: 0, bottom: 10 }))).toBe(true);
    expect(isEmpty({ left: 0, right: 1, top: 0, bottom: 1 })).toBe(false);
  });
});
