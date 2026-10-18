import { describe, expect, it } from "vitest";
import {
  compareValues,
  cycleSort,
  DEFAULT_VIEW,
  isRearranged,
  remapColumns,
  visibleRows,
  withFilter,
} from "./view.ts";

const values = [
  ["Banana", "10"],
  ["apple", "9"],
  ["", "100"],
  ["Čokoláda", ""],
];

describe("sorting", () => {
  it("cycles ascending, descending, source order", () => {
    const asc = cycleSort(DEFAULT_VIEW, 0);
    expect(asc.sort).toEqual({ column: 0, direction: "asc" });
    const desc = cycleSort(asc, 0);
    expect(desc.sort).toEqual({ column: 0, direction: "desc" });
    expect(cycleSort(desc, 0).sort).toBeUndefined();
    expect(cycleSort(desc, 1).sort).toEqual({ column: 1, direction: "asc" });
  });

  it("sorts text case-insensitively with empty cells last", () => {
    expect(visibleRows(values, cycleSort(DEFAULT_VIEW, 0))).toEqual([1, 0, 3, 2]);
    expect(visibleRows(values, cycleSort(cycleSort(DEFAULT_VIEW, 0), 0))).toEqual([3, 0, 1, 2]);
  });

  it("sorts numbers numerically", () => {
    expect(visibleRows(values, cycleSort(DEFAULT_VIEW, 1))).toEqual([1, 0, 2, 3]);
    expect(compareValues("-2,5", "1")).toBeLessThan(0);
    expect(compareValues("1 000", "999")).toBeGreaterThan(0);
    expect(compareValues("15 %", "9 %")).toBeGreaterThan(0);
  });

  it("keeps the source order without sorting", () => {
    expect(visibleRows(values, DEFAULT_VIEW)).toEqual([0, 1, 2, 3]);
  });
});

describe("filtering", () => {
  it("matches substrings ignoring case and diacritics", () => {
    expect(visibleRows(values, withFilter(DEFAULT_VIEW, 0, "coko"))).toEqual([3]);
    expect(visibleRows(values, withFilter(DEFAULT_VIEW, 0, "AN"))).toEqual([0]);
  });

  it("combines column filters", () => {
    const view = withFilter(withFilter(DEFAULT_VIEW, 0, "a"), 1, "1");
    expect(visibleRows(values, view)).toEqual([0]);
  });

  it("counts as rearranged only with a sort or a non-empty filter", () => {
    expect(isRearranged(DEFAULT_VIEW)).toBe(false);
    expect(isRearranged(withFilter(DEFAULT_VIEW, 0, "  "))).toBe(false);
    expect(isRearranged(withFilter(DEFAULT_VIEW, 0, "x"))).toBe(true);
    expect(isRearranged(cycleSort(DEFAULT_VIEW, 0))).toBe(true);
  });
});

describe("remapColumns", () => {
  it("moves sort and filters with their columns and drops deleted ones", () => {
    const view = withFilter(withFilter(cycleSort(DEFAULT_VIEW, 1), 0, "x"), 2, "y");
    const remapped = remapColumns(view, (c) => (c === 0 ? undefined : c - 1));
    expect(remapped.sort).toEqual({ column: 0, direction: "asc" });
    expect(remapped.filters).toEqual(["", "y"]);
  });

  it("drops the sort when its column is deleted", () => {
    expect(remapColumns(cycleSort(DEFAULT_VIEW, 0), () => undefined).sort).toBeUndefined();
  });
});
