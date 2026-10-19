import { describe, expect, it } from "vitest";
import libraryPage from "../../table-plus.md?raw";
import { columnTypeOf, typeOfTag, TYPES, withColumnType } from "./index.ts";

const type = (name: string) => TYPES.get(name)!;
const show = (name: string, text: string, param?: string, locale = "en-US") => type(name).format(text, param, locale);
const check = (name: string, text: string, param?: string) => type(name).check(text, param);

describe("TYPES", () => {
  it.each(Array.from(TYPES.entries()))("%s is described and listed on the library page", (name, t) => {
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
    expect(columnTypeOf("Price #currency-usd")).toMatchObject({ type: type("currency"), param: "usd", tag: "currency-usd" });
    expect(columnTypeOf("#stars Rating")).toMatchObject({ type: type("stars"), param: undefined });
    expect(columnTypeOf("Done #todo #check")).toMatchObject({ type: type("check") });
    expect(columnTypeOf("Price")).toBeUndefined();
  });

  it("knows MdTableRender's hashtags, and ignores hashtags that are not types", () => {
    expect(columnTypeOf("Price #euro")).toMatchObject({ type: type("currency"), param: "eur" });
    expect(columnTypeOf("Weight #kg")).toMatchObject({ type: type("unit"), param: "kg" });
    expect(columnTypeOf("Ok #logical")).toMatchObject({ type: type("check"), param: undefined });
    expect(typeOfTag("constructor")).toBeUndefined();
    expect(typeOfTag("stars-x")).toBeUndefined(); // not a parameter #stars takes
    expect(typeOfTag("check-1")).toBeUndefined(); // #check takes none
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
    expect(type("check").sortValue!("yes", undefined)).toBe("1");
    expect([show("trend", "+"), show("trend", "-"), show("trend", "=")]).toEqual(["🔼", "🔽", "➡️"]);
    // A number by its sign; the list offers only +, - and =
    expect([show("trend", "3"), show("trend", "+2,5 %"), show("trend", "-0.1"), show("trend", "0")]).toEqual(["🔼", "🔼", "🔽", "➡️"]);
    expect(check("trend", "up")).toBe('"up" is not +, -, = or a number');
    expect(type("trend").choices!(undefined).map((c) => c.value)).toEqual(["+", "-", "="]);
    // #check: a number above 0 is yes, 0 or below no; not in its list either
    expect([show("check", "1"), show("check", "42"), show("check", "0,5"), show("check", "0"), show("check", "-3")]).toEqual([
      "✅",
      "✅",
      "✅",
      "❌",
      "❌",
    ]);
    expect(type("check").sortValue!("7", undefined)).toBe("1");
    expect(type("check").choices!(undefined).map((c) => c.value)).toEqual(["yes", "no"]);
    expect(show("progress", "30")).toBe("▰▰▰▱▱▱▱▱▱▱ 30%");
    expect(show("progress", "5", "10")).toBe("▰▰▰▰▰▱▱▱▱▱ 50%");
  });

  it("shows dates as the locale writes them, and checks them", () => {
    expect(show("date", "2025-11-06")).toBe("Nov 6, 2025");
    expect(show("date", "2025-11-06", "short", "cs-CZ")).toBe("06.11.25");
    expect(show("date", "2025-11-06 14:30")).toBe("Nov 6, 2025, 2:30 PM");
    expect(check("date", "2025-02-30")).toBe('"2025-02-30" is not a date written as 2025-11-06');
    expect(check("date", "6.11.2025")).toBeDefined();
  });

  it("makes links of web addresses", () => {
    expect(show("link", "https://silverbullet.md/")).toEqual({ text: "silverbullet.md", href: "https://silverbullet.md/" });
    expect(check("link", "silverbullet.md")).toBeDefined();
  });

  it("offers values for the editor", () => {
    expect(type("stars").choices!("3").map((c) => c.value)).toEqual(["0", "1", "2", "3"]);
    expect(type("check").choices!(undefined)).toEqual([
      { value: "yes", label: "✅ yes" },
      { value: "no", label: "❌ no" },
    ]);
  });
});
