import { describe, expect, it, vi } from "vitest";
import libraryPage from "../../../table-plus.md?raw";
import { BUILT_IN_FUNCTIONS as FUNCTIONS } from "./index.ts";
import { FUNCTION_CATEGORIES } from "../function.ts";
import { parse } from "../parser.ts";
import { FormulaError, isError, parseClock, TimeValue, toText, type Value } from "../values.ts";

// Called in the first cell (A1); ROW() tests set the place itself
const call = (name: string, ...args: Value[]) => FUNCTIONS[name]!.call(args, { row: 1, column: 1 });
const toTime = (text: string) => parseClock(text)!;

describe("FUNCTIONS", () => {
  it.each(Object.entries(FUNCTIONS))("%s is described and listed on the library page", (name, f) => {
    expect(name).toBe(name.toUpperCase());
    expect(f.syntax.startsWith(`${name}(`)).toBe(true);
    expect(f.description).not.toBe("");
    // The Functions table in table-plus.md: | `SYNTAX` | Description |
    expect(libraryPage).toContain(`| \`${f.syntax}\` | ${f.description} |`);
    // In a group of the Functions dialog, with an example of it that formulas read
    expect(Object.keys(FUNCTION_CATEGORIES)).toContain(f.category);
    expect(f.example!.startsWith("=") && f.example!.includes(`${name}(`)).toBe(true);
    expect(isError(parse(f.example!))).toBe(false);
  });

  it("takes ranges, skipping empty cells and text in them", () => {
    expect(call("SUM", [1, null, "x", "2,5 €"], 3)).toBe(6.5);
    expect(call("AVERAGE", [2, null, 4])).toBe(3);
    expect(call("COUNT", [1, "x", null, "3"])).toBe(2);
    expect(call("COUNTA", [1, "x", null, ""])).toBe(2);
    expect(call("MIN", [5, 2, 9])).toBe(2);
    expect(call("MAX", [])).toBe(0);
    expect(call("PRODUCT", [2, 3], 4)).toBe(24);
  });

  it("passes errors on", () => {
    const error = new FormulaError("#REF!", "x");
    expect(call("SUM", [1, error])).toBe(error);
    expect(call("SUM", "text")).toEqual(new FormulaError("#VALUE!", '"text" is not a number'));
    expect(call("AVERAGE", [null])).toBeInstanceOf(FormulaError);
    expect(call("IFERROR", error, 0)).toBe(0);
  });

  it("rounds halves away from zero", () => {
    expect(call("ROUND", 2.5)).toBe(3);
    expect(call("ROUND", -2.5)).toBe(-3);
    expect(call("ROUND", 1.005, 2)).toBe(1.01);
    expect(call("ROUND", 1234, -2)).toBe(1200);
    expect(call("ABS", -4)).toBe(4);
  });

  it("does logic", () => {
    expect(call("IF", true, "a", "b")).toBe("a");
    expect(call("IF", 0, "a")).toBe(false);
    expect(call("AND", [true, null, "x"], 1)).toBe(true);
    expect(call("OR", false, 0)).toBe(false);
    expect(call("NOT", "TRUE")).toBe(false);
    expect(call("CONCAT", ["a", 1.5, true, null], "!")).toBe("a1.5TRUE!");
  });
});

describe("dates", () => {
  it("adds units to a date, by the calendar for months and years", () => {
    expect(call("DATEADD", "2025-11-06", 7, "d")).toBe("2025-11-13");
    expect(call("DATEADD", "2025-11-06", 90, "min")).toBe("2025-11-06 01:30");
    expect(call("DATEADD", "2025-11-06 23:30", 45, "minutes")).toBe("2025-11-07 00:15");
    expect(call("DATEADD", "2025-11-06 10:00", 15, "s")).toBe("2025-11-06 10:00:15");
    expect(call("DATEADD", "2025-11-06", 2, "w")).toBe("2025-11-20");
    expect(call("DATEADD", "2025-01-31", 1, "m")).toBe("2025-02-28");
    expect(call("DATEADD", "2024-02-29", 1, "y")).toBe("2025-02-28");
    expect(call("DATEADD", "2025-03-15 08:00", -3, "Months")).toBe("2024-12-15 08:00");
    expect(call("DATEADD", "2024-01-31", 1, "m")).toBe("2024-02-29");
    // Hours across the change to summer time: an hour on the clock
    expect(call("DATEADD", "2025-03-30 01:30", 1, "h")).toBe("2025-03-30 02:30");
  });

  it("says what is wrong with a date or a unit", () => {
    expect(call("DATEADD", "6.11.2025", 1, "d")).toEqual(new FormulaError("#VALUE!", '"6.11.2025" is not a date written as 2025-11-06'));
    expect(call("DATEADD", "2025-02-30", 1, "d")).toBeInstanceOf(FormulaError);
    expect(call("DATEADD", "2025-11-06", 1, "fortnight")).toBeInstanceOf(FormulaError);
    expect(call("YEAR", null)).toBeInstanceOf(FormulaError);
    expect(call("YEAR", [toTime("9:00")])).toEqual(new FormulaError("#VALUE!", '"9:00" is not a date written as 2025-11-06'));
    // Dates the years 0 to 9999 cannot hold
    expect(call("DATEADD", "2025-11-06", 1e8, "d")).toBeInstanceOf(FormulaError);
    expect(call("DATEADD", "2025-11-06", 1e20, "m")).toBeInstanceOf(FormulaError);
    expect(call("DATE", 9999, 13, 1)).toBeInstanceOf(FormulaError);
    // Years before 100 are not taken as 19xx
    expect(call("DATEADD", "0050-03-01", 1, "d")).toBe("0050-03-02");
    expect(call("DATEADD", "0024-01-31", 1, "m")).toBe("0024-02-29");
  });

  it("counts whole units between dates", () => {
    expect(call("DATEDIF", "2025-01-01", "2025-03-01", "d")).toBe(59);
    // As DATEADD counts: a month after January 31 is February 28
    expect(call("DATEDIF", "2025-01-31", "2025-02-28", "m")).toBe(1);
    expect(call("DATEDIF", "2025-01-31", "2025-02-27", "m")).toBe(0);
    expect(call("DATEDIF", "2025-01-15", "2025-02-15", "m")).toBe(1);
    expect(call("DATEDIF", "1990-06-10", "2025-06-09", "y")).toBe(34);
    expect(call("DATEDIF", "1990-06-10", "2025-06-10", "y")).toBe(35);
    expect(call("DATEDIF", "2025-11-06 08:00", "2025-11-06 17:30", "h")).toBe(9);
    expect(call("DATEDIF", "2025-03-01", "2025-01-01", "m")).toBe(-2);
  });

  it("gives the latest and the earliest of dates, as written", () => {
    const dates = ["2025-11-06", null, "2026-01-02 08:00", "2024-12-31"];
    expect(call("MAX", dates)).toBe("2026-01-02 08:00");
    expect(call("MIN", dates)).toBe("2024-12-31");
    // Not all dates: numbers as before (the text skipped)
    expect(call("MAX", ["2025-11-06", 3])).toBe(3);
  });

  it("builds dates and takes them apart", () => {
    expect(call("DATE", 2025, 13, 1)).toBe("2026-01-01");
    expect(call("DATE", 2025, 3, 0)).toBe("2025-02-28");
    const at = "2025-11-06 14:30:15";
    expect(["YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND"].map((f) => call(f, at))).toEqual([2025, 11, 6, 14, 30, 15]);
    expect(call("HOUR", "2025-11-06")).toBe(0);
    // A time alone too
    expect(["HOUR", "MINUTE", "SECOND"].map((f) => call(f, "9:05:30"))).toEqual([9, 5, 30]);
    // And a fraction of a day, as a #time column may hold
    expect(call("HOUR", 0.75)).toBe(18);
    // 2025-11-06 is a Thursday
    expect(call("WEEKDAY", "2025-11-06")).toBe(5);
    expect(call("WEEKDAY", "2025-11-06", 2)).toBe(4);
    expect(call("WEEKDAY", "2025-11-09", 2)).toBe(7);
    // The other types: Monday 0 (3), and 1 from Monday (11) to Sunday (17)
    expect([3, 11, 12, 13, 14, 15, 16, 17].map((type) => call("WEEKDAY", "2025-11-06", type))).toEqual([3, 4, 3, 2, 1, 7, 6, 5]);
    expect(call("WEEKDAY", "2025-11-06", 4)).toBeInstanceOf(FormulaError);
  });

  it("writes times of day, starting again past midnight", () => {
    const time = (...args: Value[]) => toText(call("TIME", ...args));
    expect(time(14, 30)).toBe("14:30");
    expect(time(9, 5, 30)).toBe("09:05:30");
    expect(time(0, 90)).toBe("01:30");
    expect(time(25)).toBe("01:00");
    expect(call("TIME", -1)).toBeInstanceOf(FormulaError);
  });

  it("writes dates and times in a format", () => {
    const text = (value: Value, format: string) => call("TEXT", value, format);
    expect(text("2025-11-06 14:30:15", "dd.mm.yyyy hh:mm:ss")).toBe("06.11.2025 14:30:15");
    expect(text("2025-11-06", "d. m. yy")).toBe("6. 11. 25");
    expect(text("2025-03-04 09:05", "h:mm")).toBe("9:05");
    expect(text("2025-11-06", 'yyyy "week" d')).toBe("2025 week 6");
    expect(text("2025-11-06", "\\d d")).toBe("d 6");
    expect(text("34:00", "[h]:mm")).toBe("34:00");
    expect(text("34:00", "h:mm")).toBe("10:00"); // the time of day it reaches
    expect(text("1:30:15", '[m] "min" ss "s"')).toBe("90 min 15 s");
    expect(text(0.5, "hh:mm")).toBe("12:00");
    expect(text("34:00", "d")).toBeInstanceOf(FormulaError);
    expect(text("2025-11-06", "[h]")).toBeInstanceOf(FormulaError);
    expect(text("2025-11-06", "mmm")).toBeInstanceOf(FormulaError);
    expect(text("soon", "yyyy")).toBeInstanceOf(FormulaError);
    expect(text("2025-11-06", "abc")).toBeInstanceOf(FormulaError);
  });

  it("rounds down to whole numbers, and whole days of a time", () => {
    expect(call("INT", 2.7)).toBe(2);
    expect(call("INT", -2.5)).toBe(-3);
    expect(call("INT", "24:00")).toBe(1);
    expect(call("INT", "23:59")).toBe(0);
    expect(call("INT", -1e-10)).toBe(-1);
    expect(call("INT", 2.9999999999)).toBe(2);
  });

  it("gives today's date and the time now, as the clock shows them", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 10, 6, 14, 30, 15));
    expect(call("TODAY")).toBe("2025-11-06");
    expect(call("NOW")).toBe("2025-11-06 14:30:15");
    vi.useRealTimers();
  });
});

describe("conditions", () => {
  const STATUS = ["open", "Open", "done", null, "", "opened", "a*b"];
  const count = (condition: Value) => call("COUNTIFS", STATUS, condition);

  it("match text ignoring case, with wildcards", () => {
    expect(count("open")).toBe(2);
    expect(count("=OPEN")).toBe(2);
    expect(count("open*")).toBe(3);
    expect(count("?one")).toBe(1);
    expect(count("a~*b")).toBe(1);
    expect(count("<>open")).toBe(5);
    expect(count("*")).toBe(5);
  });

  it("match empty cells, and cells that are not", () => {
    expect(count("")).toBe(2);
    expect(count("=")).toBe(2);
    expect(count("<>")).toBe(5);
  });

  it("compare numbers, dates and text", () => {
    const qty = [1, "5", "12,50 €", null, "x", 10];
    expect(call("COUNTIFS", qty, ">4")).toBe(3);
    expect(call("COUNTIFS", qty, "<=5")).toBe(2);
    expect(call("COUNTIFS", qty, 5)).toBe(1);
    expect(call("COUNTIFS", qty, "<>5")).toBe(5);
    const dates = ["2025-11-06", "2025-12-24 10:00", "soon", null];
    expect(call("COUNTIFS", dates, "<2025-12-01")).toBe(1);
    expect(call("COUNTIFS", dates, ">=2025-12-24")).toBe(1);
    expect(call("COUNTIFS", ["apple", "banana", "cherry", 5], ">b")).toBe(2);
    expect(call("COUNTIFS", [true, "TRUE", false], true)).toBe(2);
  });

  it("all hold, across ranges of the same size", () => {
    const name = ["Pear", "Apple", "Fig", "Plum"];
    const qty = [3, 10, 2, 7];
    const price = ["12,50 €", "4,50 €", null, "2 €"];
    expect(call("SUMIFS", qty, name, "p*")).toBe(10);
    expect(call("SUMIFS", qty, name, "p*", price, ">5")).toBe(3);
    expect(call("COUNTIFS", name, "p*", qty, ">5")).toBe(1);
    expect(call("AVERAGEIFS", qty, name, "<>fig")).toBeCloseTo(20 / 3);
    expect(call("AVERAGEIFS", qty, name, "kiwi")).toBeInstanceOf(FormulaError);
    expect(call("MAXIFS", qty, name, "p*")).toBe(7);
    expect(call("MINIFS", qty, price, "")).toBe(2);
    expect(call("MAXIFS", qty, name, "kiwi")).toBe(0);
    // Times and dates as SUM and MAX take them
    expect(toText(call("SUMIFS", ["14:00", "20:00", "1:00"].map(toTime), name.slice(0, 3), "<>fig"))).toBe("34:00");
    expect(call("MAXIFS", ["2025-11-06", "2026-01-02", "2024-12-31", null], name, "<>apple")).toBe("2025-11-06");
    expect(call("SUMIFS", qty, name.slice(0, 3), "p*")).toEqual(new FormulaError("#VALUE!", "the ranges are not the same size (4 and 3 cells)"));
    expect(call("SUMIFS", qty, name)).toBeInstanceOf(FormulaError);
    // An error among the cells added passes on; elsewhere it only does not match
    const error = new FormulaError("#REF!", "x");
    expect(call("SUMIFS", [1, error, 3], ["a", "b", "a"], "a")).toBe(4);
    expect(call("SUMIFS", [1, error, 3], ["a", "b", "a"], "b")).toBe(error);
    expect(call("COUNTIFS", [error, 1], 1)).toBe(1);
  });
});

describe("statistics", () => {
  it("multiplies ranges and adds the products", () => {
    expect(call("SUMPRODUCT", [3, 10, 2], ["12,50 €", "4,50 €", null])).toBe(82.5);
    expect(call("SUMPRODUCT", [1, 2, 3])).toBe(6);
    expect(call("SUMPRODUCT", [1, 2], [1])).toBeInstanceOf(FormulaError);
  });

  it("finds the middle, the k-th and a place", () => {
    expect(call("MEDIAN", [1, 3, 2])).toBe(2);
    expect(call("MEDIAN", [4, 1, 2, 3], null)).toBe(2.5);
    expect(call("MEDIAN", ["x"])).toBeInstanceOf(FormulaError);
    expect(toText(call("MEDIAN", ["9:00", "10:00", "12:00"].map(toTime)))).toBe("10:00");
    expect(call("LARGE", [3, 1, "x", 2], 1)).toBe(3);
    expect(call("LARGE", [3, 1, 2], 3)).toBe(1);
    expect(call("LARGE", [3, 1, 2], 4)).toBeInstanceOf(FormulaError);
    expect(call("SMALL", [3, 1, 2], 2)).toBe(2);
    expect(call("SMALL", [3, 1, 2], 0)).toBeInstanceOf(FormulaError);
    const scores = [1, 3, "3", 5, null];
    expect(call("RANK", 5, scores)).toBe(1);
    expect(call("RANK", [3], scores)).toBe(2);
    expect(call("RANK", 1, scores)).toBe(4);
    expect(call("RANK", 1, scores, 1)).toBe(1);
    expect(call("RANK", 5, scores, 1)).toBe(4);
    expect(call("RANK", 4, scores)).toBeInstanceOf(FormulaError);
  });

  it("gives the standard deviation of a sample", () => {
    expect(call("STDEV", [2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
    expect(call("STDEV", [1])).toBeInstanceOf(FormulaError);
    expect(toText(call("STDEV", ["9:00", "11:00"].map(toTime)))).toBe("01:24:51");
  });
});

describe("rounding", () => {
  it("gives the remainder with the divisor's sign", () => {
    expect(call("MOD", 10, 3)).toBe(1);
    expect(call("MOD", -10, 3)).toBe(2);
    expect(call("MOD", 10, -3)).toBe(-2);
    expect(call("MOD", 5.1, 1)).toBe(0.1);
    expect(call("MOD", 0.3, 0.1)).toBe(0);
    expect(call("MOD", 1, 0)).toBeInstanceOf(FormulaError);
    expect(call("MOD", 1e17, 3)).toBeInstanceOf(FormulaError);
    // A shift past midnight: 22:00 to 6:00 is -16:00, a day later 08:00
    expect(toText(call("MOD", new TimeValue(-16 * 3600), 1))).toBe("08:00");
  });

  it("rounds up and down", () => {
    expect(call("ROUNDUP", 3.2)).toBe(4);
    expect(call("ROUNDUP", -3.2)).toBe(-4);
    expect(call("ROUNDUP", 3.14159, 3)).toBe(3.142);
    expect(call("ROUNDUP", 1234, -2)).toBe(1300);
    expect(call("ROUNDDOWN", -3.9)).toBe(-3);
    expect(call("ROUNDDOWN", 0.29 * 100)).toBe(29);
    expect(call("ROUNDDOWN", 3.14159, 2)).toBe(3.14);
  });

  it("rounds to multiples, times too", () => {
    expect(call("CEILING", 2.1)).toBe(3);
    expect(call("CEILING", -2.1)).toBe(-2);
    expect(call("CEILING", 0.3, 0.1)).toBe(0.3);
    expect(call("CEILING", 7, -2)).toBe(8);
    expect(call("CEILING", 5, 0)).toBe(0);
    expect(call("FLOOR", -2.1)).toBe(-3);
    expect(call("FLOOR", 0.3, 0.1)).toBe(0.3);
    expect(call("FLOOR", 12.99, 0.5)).toBe(12.5);
    expect(toText(call("CEILING", "9:07", "0:15"))).toBe("09:15");
    expect(toText(call("FLOOR", "9:07", "0:15"))).toBe("09:00");
    expect(call("MROUND", 10, 3)).toBe(9);
    expect(call("MROUND", -10, -3)).toBe(-9);
    expect(call("MROUND", 1.3, 0.2)).toBe(1.4);
    expect(call("MROUND", 5, -2)).toBeInstanceOf(FormulaError);
    expect(toText(call("MROUND", "9:08", "0:15"))).toBe("09:15");
  });
});

describe("text", () => {
  it("measures, cuts and changes case", () => {
    expect(call("LEN", "Příliš")).toBe(6);
    expect(call("LEN", null)).toBe(0);
    expect(call("MID", "ABCDEF", 2, 3)).toBe("BCD");
    expect(call("MID", "ABC", 3, 10)).toBe("C");
    expect(call("MID", "ABC", 5, 1)).toBe("");
    expect(call("MID", "ABC", 0, 1)).toBeInstanceOf(FormulaError);
    expect(call("UPPER", "žluť")).toBe("ŽLUŤ");
    expect(call("LOWER", "ABC")).toBe("abc");
    expect(call("PROPER", "hello WORLD o'neil 2-way čech")).toBe("Hello World O'Neil 2-Way Čech");
    expect(call("TRIM", "  a   b  ")).toBe("a b");
  });

  it("replaces and finds text", () => {
    expect(call("SUBSTITUTE", "a-b-c", "-", "+")).toBe("a+b+c");
    expect(call("SUBSTITUTE", "a-b-c", "-", "+", 2)).toBe("a-b+c");
    expect(call("SUBSTITUTE", "a-b-c", "-", "+", 3)).toBe("a-b-c");
    expect(call("SUBSTITUTE", "aaa", "aa", "b", 2)).toBe("aaa");
    expect(call("SUBSTITUTE", "Aa", "a", "x")).toBe("Ax");
    expect(call("SUBSTITUTE", "abc", "", "x")).toBe("abc");
    expect(call("SUBSTITUTE", "abc", "b", "x", 0)).toBeInstanceOf(FormulaError);
    expect(call("SEARCH", "B", "abc")).toBe(2);
    expect(call("SEARCH", "c?", "abcd")).toBe(3);
    expect(call("SEARCH", "~*", "a*b")).toBe(2);
    expect(call("SEARCH", "a", "banana", 3)).toBe(4);
    expect(call("SEARCH", "", "abc", 2)).toBe(2);
    expect(call("SEARCH", "x", "abc")).toBeInstanceOf(FormulaError);
    expect(call("SEARCH", "a", "abc", 5)).toBeInstanceOf(FormulaError);
  });

  it("joins values with a delimiter", () => {
    expect(call("TEXTJOIN", ", ", true, ["a", null, "", "b"], "c")).toBe("a, b, c");
    expect(call("TEXTJOIN", "-", false, ["a", null, "b"])).toBe("a--b");
    expect(call("TEXTJOIN", "", "TRUE", [1.5, true])).toBe("1.5TRUE");
  });

  it("tells numbers", () => {
    expect([5, "12,99 €", "15 %", "9:00"].map((v) => call("ISNUMBER", v))).toEqual([true, true, true, true]);
    const others: Value[] = ["abc", null, "", true, "2025-11-06", [1, 2], new FormulaError("#N/A", "x")];
    expect(others.map((v) => call("ISNUMBER", v))).toEqual(others.map(() => false));
  });

  it("writes numbers in a format", () => {
    const text = (value: Value, format: string) => call("TEXT", value, format);
    expect(text(1234.567, "#,##0.00")).toBe("1,234.57");
    expect(text(5, "0.00")).toBe("5.00");
    expect(text(-1234.5, "#,##0")).toBe("-1,235");
    expect(text(0.256, "0%")).toBe("26%");
    expect(text(0.256, "0.0%")).toBe("25.6%");
    expect(text(0.5, "#.##")).toBe(".5");
    expect(text(2, "0.##")).toBe("2.");
    expect(text(1234567.891, "#,##0.###")).toBe("1,234,567.891");
    expect(text(42, "000")).toBe("042");
    expect(text(1.005, "0.00")).toBe("1.01");
    expect(text(-0.001, "0.00")).toBe("0.00");
    expect(text(3, '"$"0.00')).toBe("$3.00");
    expect(text(-3, '"$"0.00')).toBe("-$3.00");
    expect(text(12.5, '0.0 "kg"')).toBe("12.5 kg");
    expect(text("12,99 €", "0.0")).toBe("13.0");
    expect(text("2025-11-06", "0.00")).toBeInstanceOf(FormulaError);
    expect(text(1, "0.0.0")).toBeInstanceOf(FormulaError);
    expect(text(1, "0 0")).toBeInstanceOf(FormulaError);
    // Sections: positive;negative;zero
    expect(text(-5, "0.00;(0.00)")).toBe("(5.00)");
    expect(text(5, "0.00;(0.00)")).toBe("5.00");
    expect(text(0, '0;-0;"none"')).toBe("none");
    expect(text(-5, "#,##0;")).toBe("");
    expect(text(1, "0;0;0;0")).toBeInstanceOf(FormulaError);
    // A comma after the last digit divides by a thousand
    expect(text(1234567, "0,")).toBe("1235");
    expect(text(1234567, '#,##0.0,, "M"')).toBe("1.2 M");
  });
});

describe("lookup", () => {
  const MIN = [0, 50, 70, 90];
  const GRADE = ["F", "C", "B", "A"];

  it("finds the next smaller or larger, or by wildcards", () => {
    expect(call("XLOOKUP", 75, MIN, GRADE, "-", -1)).toBe("B");
    expect(call("XLOOKUP", 70, MIN, GRADE, "-", -1)).toBe("B");
    expect(call("XLOOKUP", 95, MIN, GRADE, "-", -1)).toBe("A");
    expect(call("XLOOKUP", -5, MIN, GRADE, "-", -1)).toBe("-");
    expect(call("XLOOKUP", 75, MIN, GRADE, null, 1)).toBe("A");
    expect(call("XLOOKUP", 95, MIN, GRADE, null, 1)).toEqual(new FormulaError("#N/A", '"95" is not in the range'));
    // Unsorted keys, text and an empty cell among numbers
    expect(call("XLOOKUP", 60, [90, "x", 50, 70, null], ["A", "X", "C", "B", "E"], null, -1)).toBe("C");
    expect(call("XLOOKUP", "2025-11-10", ["2025-11-01", "2025-11-08", "2025-11-15"], [1, 2, 3], null, -1)).toBe(2);
    expect(call("XLOOKUP", "ban*", ["apple pie", "Banana", "band"], [1, 2, 3], null, 2)).toBe(2);
    expect(call("XLOOKUP", "b?nd", ["apple pie", "Banana", "band"], [1, 2, 3], null, 2)).toBe(3);
    expect(call("XLOOKUP", "ban*", ["apple pie", "Banana"], [1, 2])).toBeInstanceOf(FormulaError);
    expect(call("XLOOKUP", "1*", [10, "1a"], [1, 2], null, 2)).toBe(2);
    expect(call("XLOOKUP", 75, MIN, GRADE, null, 3)).toBeInstanceOf(FormulaError);
  });

  it("searches from the last", () => {
    expect(call("XLOOKUP", "a", ["a", "b", "a"], [1, 2, 3])).toBe(1);
    expect(call("XLOOKUP", "a", ["a", "b", "a"], [1, 2, 3], null, 0, -1)).toBe(3);
    expect(call("XLOOKUP", "a", ["a", "b", "a"], [1, 2, 3], null, 0, -2)).toBe(3);
    expect(call("XLOOKUP", "a", ["a", "b", "a"], [1, 2, 3], null, 0, 0)).toBeInstanceOf(FormulaError);
  });
});

describe("working days and weeks", () => {
  it("counts working days, without holidays", () => {
    expect(call("NETWORKDAYS", "2025-11-03", "2025-11-14")).toBe(10);
    expect(call("NETWORKDAYS", "2025-11-14", "2025-11-03")).toBe(-10);
    expect(call("NETWORKDAYS", "2025-11-08", "2025-11-09")).toBe(0);
    expect(call("NETWORKDAYS", "2025-11-03", "2025-11-14", ["2025-11-11", "2025-11-08", null, "2025-11-11"])).toBe(9);
    // Microsoft's examples
    expect(call("NETWORKDAYS", "2012-10-01", "2013-03-01")).toBe(110);
    expect(call("NETWORKDAYS", "2012-10-01", "2013-03-01", ["2012-11-22", "2012-12-04", "2013-01-21"])).toBe(107);
    expect(call("NETWORKDAYS", "2012-10-01", "2013-03-01", ["soon"])).toBeInstanceOf(FormulaError);
  });

  it("finds the date working days away", () => {
    // Microsoft's examples
    expect(call("WORKDAY", "2008-10-01", 151)).toBe("2009-04-30");
    expect(call("WORKDAY", "2008-10-01", 151, ["2008-11-26", "2008-12-04", "2009-01-21"])).toBe("2009-05-05");
    expect(call("WORKDAY", "2025-11-07", 1)).toBe("2025-11-10");
    expect(call("WORKDAY", "2025-11-10 14:00", -1)).toBe("2025-11-07");
    expect(call("WORKDAY", "2025-11-08", 0)).toBe("2025-11-08");
    expect(call("WORKDAY", "2025-11-07", 1e9)).toBeInstanceOf(FormulaError);
  });

  it("gives ISO weeks and the ends of months", () => {
    expect(call("ISOWEEKNUM", "2012-03-09")).toBe(10);
    expect(call("ISOWEEKNUM", "2021-01-01")).toBe(53);
    expect(call("ISOWEEKNUM", "2024-12-30")).toBe(1);
    expect(call("ISOWEEKNUM", "2026-01-01")).toBe(1);
    expect(call("ISOWEEKNUM", "2025-11-09")).toBe(45);
    expect(call("EOMONTH", "2011-01-01", 1)).toBe("2011-02-28");
    expect(call("EOMONTH", "2011-01-01", -3)).toBe("2010-10-31");
    expect(call("EOMONTH", "2024-01-31 10:00", 1)).toBe("2024-02-29");
    expect(call("EOMONTH", "2025-11-06", 0)).toBe("2025-11-30");
  });

  it("counts the units DATEDIF leaves the larger ones out of", () => {
    // Microsoft's examples
    expect(call("DATEDIF", "2001-06-01", "2002-08-15", "YD")).toBe(75);
    expect(call("DATEDIF", "2001-06-01", "2002-08-15", "md")).toBe(14);
    expect(call("DATEDIF", "2001-06-01", "2002-08-15", "ym")).toBe(2);
    expect(call("DATEDIF", "2025-01-31", "2025-03-01", "md")).toBe(1);
    expect(call("DATEDIF", "2002-08-15", "2001-06-01", "md")).toBeInstanceOf(FormulaError);
  });
});
