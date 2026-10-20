import { describe, expect, it, vi } from "vitest";
import libraryPage from "../../table-plus.md?raw";
import { FUNCTIONS } from "./functions/index.ts";
import { FormulaError, parseClock, toText, type Value } from "./values.ts";

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
    expect(call("WEEKDAY", "2025-11-06", 3)).toBeInstanceOf(FormulaError);
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
    // A number format is not one of TEXT
    expect(text(5, "0.00")).toBeInstanceOf(FormulaError);
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
