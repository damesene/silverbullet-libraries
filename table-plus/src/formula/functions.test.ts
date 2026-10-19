import { describe, expect, it } from "vitest";
import libraryPage from "../../table-plus.md?raw";
import { FUNCTIONS } from "./functions/index.ts";
import { FormulaError, type Value } from "./values.ts";

const call = (name: string, ...args: Value[]) => FUNCTIONS[name]!.call(args);

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
