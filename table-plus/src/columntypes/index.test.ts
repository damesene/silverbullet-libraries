import { describe, expect, it } from "vitest";
import libraryPage from "../../table-plus.md?raw";
import { dateTimeFormat, numberFormat } from "./format.ts";
import { BUILT_IN_TYPES } from "./builtin/index.ts";
import { columnTypeOf, typeNamed, typeOfTag, withColumnType } from "./index.ts";
import { readParams } from "./registry.ts";

const type = (name: string) => typeNamed(name)!;
// The parameters a type gets for what is written after its name's dash (#stars-10: "10"), as a header gives them
const paramsOf = (name: string, written?: string) => typeOfTag(written === undefined ? name : `${name}-${written}`)!.params;
const show = (name: string, text: string, written?: string, locale = "en-US") => type(name).format(text, paramsOf(name, written), locale);
const check = (name: string, text: string, written?: string) => type(name).check(text, paramsOf(name, written));

describe("formatters", () => {
  it("are made once per locale and options (making one is slow, a column formats every cell)", () => {
    expect(numberFormat("en", { maximumFractionDigits: 2 })).toBe(numberFormat("en", { maximumFractionDigits: 2 }));
    expect(numberFormat("en", { maximumFractionDigits: 1 })).not.toBe(numberFormat("en", { maximumFractionDigits: 2 }));
    expect(dateTimeFormat("en", { dateStyle: "short" })).toBe(dateTimeFormat("en", { dateStyle: "short" }));
  });
});

describe("BUILT_IN_TYPES", () => {
  it.each(BUILT_IN_TYPES.map((t) => [t.name, t] as const))("%s is described and listed on the library page", (name, t) => {
    expect(name).toBe(name.toLowerCase());
    expect(t.syntax.startsWith(`#${name}`)).toBe(true);
    expect(t.description).not.toBe("");
    expect(t.icon).toMatch(/^<svg viewBox="0 0 24 24"[^>]*>.+<\/svg>$/);
    // The Column types table in table-plus.md: | `SYNTAX` | Description |
    expect(libraryPage).toContain(`| \`${t.syntax}\` | ${t.description} |`);
  });
});

describe("column types in headers", () => {
  it("reads the type from a header's hashtag, with its parameter", () => {
    expect(columnTypeOf("Price #currency-usd")).toMatchObject({ type: type("currency"), params: { code: "usd" }, tag: "currency-usd" });
    expect(columnTypeOf("#stars Rating")).toMatchObject({ type: type("stars"), params: { max: 5 } });
    expect(columnTypeOf("Done #todo #check")).toMatchObject({ type: type("check") });
    expect(columnTypeOf("Price")).toBeUndefined();
  });

  it("knows MdTableRender's hashtags, and ignores hashtags that are not types", () => {
    expect(columnTypeOf("Price #euro")).toMatchObject({ type: type("currency"), params: { code: "eur" } });
    expect(columnTypeOf("Weight #kg")).toMatchObject({ type: type("unit"), params: { unit: "kg" } });
    expect(columnTypeOf("Ok #logical")).toMatchObject({ type: type("check"), params: {} });
    expect(typeOfTag("constructor")).toBeUndefined();
    expect(typeOfTag("stars-x")).toBeUndefined(); // not a parameter #stars takes
    expect(typeOfTag("check-1")).toBeUndefined(); // #check takes none
  });

  it("reads a type's parameters, so the type gets them as values", () => {
    expect(paramsOf("stars", "10")).toEqual({ max: 10 });
    expect(paramsOf("date", "LONG")).toEqual({ style: "long" }); // as listed
    expect(paramsOf("number")).toEqual({ digits: undefined }); // no default
    expect(paramsOf("percent")).toEqual({ digits: 0 });
    expect(paramsOf("progress", "10")).toEqual({ max: 10 }); // also #gauge: 100
    expect(paramsOf("unit", "m-s")).toEqual({ unit: "m-s" }); // the last takes the rest
    // Not the type's: out of range, not whole, not one of the words, a dash on a type that takes none
    for (const tag of ["stars-0", "stars-100", "stars-2.5", "date-full", "number-10", "currency-dollar", "check-1", "stars-"]) {
      expect(typeOfTag(tag), tag).toBeUndefined();
    }
    const specs = { from: { kind: "number", default: 1 }, to: { kind: "number" }, label: { kind: "text" } } as const;
    expect(readParams(specs, "2-5-a-b")).toEqual({ from: 2, to: 5, label: "a-b" });
    expect(readParams(specs, "2")).toEqual({ from: 2, to: undefined, label: undefined });
    expect(readParams(specs, undefined)).toEqual({ from: 1, to: undefined, label: undefined });
    expect(readParams(specs, "x")).toBeUndefined();
  });

  it("sets and removes a header's type, keeping its other hashtags", () => {
    expect(withColumnType("Price", "currency-usd")).toBe("Price #currency-usd");
    expect(withColumnType("Price #euro #todo", "number-2")).toBe("Price #todo #number-2");
    expect(withColumnType("Price #currency #todo", undefined)).toBe("Price #todo");
  });
});

describe("the types", () => {
  it("puts a currency's sign where its country writes it, the number as the locale writes it", () => {
    expect(show("currency", "12.99", "gbp")).toBe("£12.99");
    expect(show("currency", "12.99", "czk")).toBe("12.99\u00a0Kč");
    expect(show("currency", "-5", "usd")).toBe("-$5.00");
    expect(show("currency", "1234.5", "usd", "cs-CZ")).toBe("$1\u00a0234,50");
    expect(show("currency", "1234.5", "eur", "cs-CZ")).toBe("1\u00a0234,50\u00a0€");
  });

  it("formats numbers, money, percentages and units", () => {
    expect(show("currency", "12.99", "usd")).toBe("$12.99");
    expect(show("currency", "1 234,5")).toBe("1,234.50\u00a0€");
    expect(show("number", "1234.5", "2")).toBe("1,234.50");
    expect(show("number", "1234.567")).toBe("1,234.567");
    expect(show("percent", "0.155", "1")).toBe("15.5%");
    expect(show("percent", "15 %")).toBe("15%");
    expect(show("unit", "12345", "kg")).toBe("12,345 kg");
    expect(check("currency", "abc")).toBe('"abc" is not a number');
    expect(check("unit", "3", undefined)).toBe("#unit needs a unit, e.g. #unit-kg");
  });

  it("shows ratings, check marks, trends and progress", () => {
    expect(show("stars", "3")).toBe("★★★☆☆");
    expect(show("stars", "2", "3")).toBe("★★☆");
    expect(check("stars", "6")).toBe('"6" is not a whole number from 0 to 5');
    expect(check("stars", "2.5")).toBeDefined();
    expect([show("check", "yes"), show("check", "X"), show("check", "0")]).toEqual(["✅", "✅", "❌"]);
    expect(check("check", "maybe")).toBe('"maybe" is not yes, no or a number');
    expect(type("check").sortValue!("yes", paramsOf("check"))).toBe("1");
    expect([show("trend", "+"), show("trend", "-"), show("trend", "=")]).toEqual(["🔼", "🔽", "➡️"]);
    // A number by its sign; the list offers only +, - and =
    expect([show("trend", "3"), show("trend", "+2,5 %"), show("trend", "-0.1"), show("trend", "0")]).toEqual(["🔼", "🔼", "🔽", "➡️"]);
    expect(check("trend", "up")).toBe('"up" is not +, -, = or a number');
    expect(type("trend").choices!(paramsOf("trend")).map((c) => c.value)).toEqual(["+", "-", "="]);
    // #check: a number above 0 is yes, 0 or below no; not in its list either
    expect([show("check", "1"), show("check", "42"), show("check", "0,5"), show("check", "0"), show("check", "-3")]).toEqual([
      "✅",
      "✅",
      "✅",
      "❌",
      "❌",
    ]);
    expect(type("check").sortValue!("7", paramsOf("check"))).toBe("1");
    expect(type("check").choices!(paramsOf("check")).map((c) => c.value)).toEqual(["yes", "no"]);
    expect(show("progress", "30")).toBe("▰▰▰▱▱▱▱▱▱▱ 30%");
    expect(show("progress", "5", "10")).toBe("▰▰▰▰▰▱▱▱▱▱ 50%");
  });

  it("shows dates as the locale writes them, and checks them", () => {
    expect(show("date", "2025-11-06")).toBe("Nov 6, 2025");
    expect(show("date", "2025-11-06", "short", "cs-CZ")).toBe("06.11.25");
    expect(show("date", "2025-11-06 14:30")).toBe("Nov 6, 2025, 2:30 PM");
    expect(show("date", "2025-11-06 14:30:15")).toBe("Nov 6, 2025, 2:30:15 PM");
    // As written, also where the clock jumps from 2:00 to 3:00 that night
    expect(show("date", "2025-03-30 02:30")).toBe("Mar 30, 2025, 2:30 AM");
  });

  it("shows times of day as the locale writes them, and sorts them by the time", () => {
    expect(show("time", "14:30")).toBe("2:30 PM");
    expect(show("time", "14:30", undefined, "cs-CZ")).toBe("14:30");
    expect(show("time", "9:05:30")).toBe("9:05:30 AM");
    expect(show("time", "0.5")).toBe("12:00 PM"); // a fraction of a day, as spreadsheets keep times
    expect(check("time", "24:00")).toBe('"24:00" is not a time written as 14:30');
    expect(check("time", "1.5")).toBeDefined();
    // Written in full, so it sorts by the time and a filter for 9:05 still finds it
    expect(["9:05", "14:30:15", "0.5"].map((t) => type("time").sortValue!(t, paramsOf("time")))).toEqual(["09:05", "14:30:15", "12:00"]);
    expect(check("date", "2025-02-30")).toBe('"2025-02-30" is not a date written as 2025-11-06');
    expect(check("date", "6.11.2025")).toBeDefined();
  });

  it("makes links of web addresses", () => {
    expect(show("link", "https://silverbullet.md/")).toEqual({ text: "silverbullet.md", href: "https://silverbullet.md/" });
    expect(check("link", "silverbullet.md")).toBeDefined();
  });

  it("offers values for the editor", () => {
    expect(type("stars").choices!(paramsOf("stars", "3")).map((c) => c.value)).toEqual(["0", "1", "2", "3"]);
    expect(type("check").choices!(paramsOf("check"))).toEqual([
      { value: "yes", label: "✅ yes" },
      { value: "no", label: "❌ no" },
    ]);
  });
});
