import { describe, expect, it } from "vitest";
import {
  compareValues,
  cycleSort,
  filterMatcher,
  DEFAULT_VIEW,
  isRearranged,
  parseFilter,
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
    expect(compareValues("105 €", "12,99 €")).toBeGreaterThan(0);
    expect(compareValues("$5", "$40")).toBeLessThan(0);
    expect(compareValues("3 kg", "20kg")).toBeLessThan(0);
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

  it("compares numbers with >, <, >= and <=", () => {
    const qty = [["a", "9"], ["b", "10"], ["c", "1 000"], ["d", "2,5"], ["e", "n/a"], ["f", ""]];
    expect(visibleRows(qty, withFilter(DEFAULT_VIEW, 1, ">9"))).toEqual([1, 2]);
    expect(visibleRows(qty, withFilter(DEFAULT_VIEW, 1, "< 10"))).toEqual([0, 3]);
    expect(visibleRows(qty, withFilter(DEFAULT_VIEW, 1, ">=10"))).toEqual([1, 2]);
    expect(visibleRows(qty, withFilter(DEFAULT_VIEW, 1, "<=2,5"))).toEqual([3]);
    expect(visibleRows(qty, withFilter(DEFAULT_VIEW, 1, ">-1"))).toEqual([0, 1, 2, 3]);
  });

  it("compares numbers with a currency symbol or a unit", () => {
    const prices = [["a", "12,99 €"], ["b", "8,5 €"], ["c", "$9.5"], ["d", "105 Kč"], ["e", "3 kg"]];
    expect(visibleRows(prices, withFilter(DEFAULT_VIEW, 1, ">10"))).toEqual([0, 3]);
    expect(visibleRows(prices, withFilter(DEFAULT_VIEW, 1, "<=9.5"))).toEqual([1, 2, 4]);
    expect(visibleRows(prices, withFilter(DEFAULT_VIEW, 1, ">10 €"))).toEqual([0, 3]);
  });

  it("does not filter while only an operator is typed, and finds text after a non-number", () => {
    expect(filterMatcher(">")).toBeUndefined();
    expect(filterMatcher(" >= ")).toBeUndefined();
    expect(isRearranged(withFilter(DEFAULT_VIEW, 0, ">"))).toBe(false);
    expect(filterMatcher(">abc")!("x >abc y")).toBe(true);
    expect(filterMatcher(">abc")!("abc")).toBe(false);
    expect(filterMatcher(">1")!("v2")).toBe(false);
  });

  it("matches regular expressions, case-insensitive unless flagged c", () => {
    const re = (f: string) => filterMatcher(f)!;
    expect(re("/^item 1\\d$/")("Item 12")).toBe(true);
    expect(re("/^item 1\\d$/")("Item 2")).toBe(false);
    expect(re("/praha|brno/")("Office Brno")).toBe(true);
    expect(re("/^item/c")("Item 1")).toBe(false);
    expect(re("/^Item/c")("Item 1")).toBe(true);
    expect(re("/^$/")("")).toBe(true);
    expect(re("/český/")("Český")).toBe(true);
    expect(re("/a/b/")("xa/by")).toBe(true);
  });

  it("does not filter while a regular expression is unclosed, empty or invalid", () => {
    expect(filterMatcher("/^ite")).toBeUndefined(); // waits for the closing slash
    expect(parseFilter("//")).toEqual({});
    const invalid = parseFilter("/[a/");
    expect(invalid.match).toBeUndefined();
    expect(invalid.error).toBeTruthy();
    expect(isRearranged(withFilter(DEFAULT_VIEW, 0, "/[a/"))).toBe(false);
    // letters after the slash that are not flags: still being typed, no error
    expect(parseFilter("/home/user")).toEqual({});
  });

  it("matches whole cells with = and negates with !", () => {
    expect(filterMatcher("=pear")!("Pear")).toBe(true);
    expect(filterMatcher("=pear")!("Pear tree")).toBe(false);
    expect(filterMatcher("=")).toBeUndefined();
    expect(filterMatcher("!pear")!("Apple")).toBe(true);
    expect(filterMatcher("!pear")!("Pear tree")).toBe(false);
    expect(filterMatcher("!>5")!("3")).toBe(true);
    expect(filterMatcher("!/^a/")!("apple")).toBe(false);
    expect(filterMatcher("!")).toBeUndefined();
    expect(parseFilter("!/[a/").error).toBeTruthy();
  });

  it("treats comparisons as text when smart filters are off", () => {
    const off = { smart: false };
    expect(filterMatcher(">9", off)!("9")).toBe(false);
    expect(filterMatcher(">9", off)!("a >9 b")).toBe(true);
    expect(filterMatcher(">", off)).toBeDefined();
    expect(filterMatcher("/^a/", off)!("x /^a/ y")).toBe(true);
    expect(filterMatcher("!pear", off)!("!pear")).toBe(true);
    expect(isRearranged(withFilter(DEFAULT_VIEW, 0, ">"), off)).toBe(true);
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

describe("alternatives", () => {
  it("matches either of them, exactly with =, and empty cells with an empty one", () => {
    const either = filterMatcher("pea|fig")!;
    expect(["Pear", "Fig", "Kiwi"].map(either)).toEqual([true, true, false]);
    const exact = filterMatcher("=pear|fig")!;
    expect(["Pear", "Pears", "fig", ""].map(exact)).toEqual([true, false, true, false]);
    expect(["", " ", "x"].map(filterMatcher("=|x")!)).toEqual([true, true, true]);
    expect(["1", "5", "12"].map(filterMatcher("<2|>10")!)).toEqual([true, false, true]);
    // Not: none of them
    expect(["Pear", "Kiwi"].map(filterMatcher("!=pear|fig")!)).toEqual([false, true]);
    // Still being typed, and in a regular expression a | of its own
    expect(["Pear", "Kiwi"].map(filterMatcher("pear|")!)).toEqual([true, false]);
    expect(["ab", "c"].map(filterMatcher("/^(a|c)/")!)).toEqual([true, true]);
    expect(filterMatcher("=")).toBeUndefined();
    // Without smart filters it is text
    expect(filterMatcher("a|b", { smart: false })!("a|b")).toBe(true);
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
