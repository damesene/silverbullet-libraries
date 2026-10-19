import { describe, expect, it } from "vitest";
import { filterMatcher, parseFilter } from "./filter.ts";

const values = [
  ["Banana", "10"],
  ["apple", "9"],
  ["", "100"],
  ["Čokoláda", ""],
];

/** The rows whose cells all match the filters, by column */
function matching(rows: readonly (readonly string[])[], filters: Record<number, string>): number[] {
  const matchers = Object.entries(filters).map(([column, filter]) => [Number(column), filterMatcher(filter)!] as const);
  return rows.flatMap((row, i) => (matchers.every(([column, match]) => match(row[column] ?? "")) ? [i] : []));
}

describe("filtering", () => {
  it("matches substrings ignoring case and diacritics", () => {
    expect(matching(values, { 0: "coko" })).toEqual([3]);
    expect(matching(values, { 0: "AN" })).toEqual([0]);
  });

  it("compares numbers with >, <, >= and <=", () => {
    const qty = [["a", "9"], ["b", "10"], ["c", "1 000"], ["d", "2,5"], ["e", "n/a"], ["f", ""]];
    expect(matching(qty, { 1: ">9" })).toEqual([1, 2]);
    expect(matching(qty, { 1: "< 10" })).toEqual([0, 3]);
    expect(matching(qty, { 1: ">=10" })).toEqual([1, 2]);
    expect(matching(qty, { 1: "<=2,5" })).toEqual([3]);
    expect(matching(qty, { 1: ">-1" })).toEqual([0, 1, 2, 3]);
  });

  it("compares numbers with a currency symbol or a unit", () => {
    const prices = [["a", "12,99 €"], ["b", "8,5 €"], ["c", "$9.5"], ["d", "105 Kč"], ["e", "3 kg"]];
    expect(matching(prices, { 1: ">10" })).toEqual([0, 3]);
    expect(matching(prices, { 1: "<=9.5" })).toEqual([1, 2, 4]);
    expect(matching(prices, { 1: ">10 €" })).toEqual([0, 3]);
  });

  it("does not filter while only an operator is typed, and finds text after a non-number", () => {
    expect(filterMatcher(">")).toBeUndefined();
    expect(filterMatcher(" >= ")).toBeUndefined();
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
  });

  it("filters nothing with an empty field", () => {
    expect(filterMatcher("  ")).toBeUndefined();
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
