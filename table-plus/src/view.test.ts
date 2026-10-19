import { describe, expect, it } from "vitest";
import { compareValues, cycleSort, DEFAULT_VIEW, remapColumns, visibleRows } from "./view.ts";

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
    expect(compareValues("105 €", "12,99 €")).toBeGreaterThan(0);
    expect(compareValues("$5", "$40")).toBeLessThan(0);
    expect(compareValues("3 kg", "20kg")).toBeLessThan(0);
  });

  it("keeps the source order without sorting", () => {
    expect(visibleRows(values, DEFAULT_VIEW)).toEqual([0, 1, 2, 3]);
  });
});

describe("remapColumns", () => {
  it("moves the sort with its column", () => {
    const remapped = remapColumns(cycleSort(DEFAULT_VIEW, 1), (c) => (c === 0 ? undefined : c - 1));
    expect(remapped.sort).toEqual({ column: 0, direction: "asc" });
  });

  it("leaves out the rows a feature hides, sorting the others", () => {
    expect(visibleRows(values, cycleSort(DEFAULT_VIEW, 0), new Set([1]))).toEqual([0, 3, 2]);
  });

  it("drops the sort when its column is deleted", () => {
    expect(remapColumns(cycleSort(DEFAULT_VIEW, 0), () => undefined).sort).toBeUndefined();
  });
});
