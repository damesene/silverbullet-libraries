import { afterEach, describe, expect, it } from "vitest";
import { clearCustomFunctions, defineCustomFunctions, functionNamed, functionNames, customFunctionsAnew } from "./registry.ts";
import { BUILT_IN_FUNCTIONS } from "./builtin/index.ts";
import { HELPERS, customFunctions } from "./custom.ts";
import { findFunctions, formulaHelp, functionChoices, recalculate } from "./index.ts";
import { parseTable } from "../markdown.ts";
import { FormulaError, TimeValue, toNumber, type Value } from "./values.ts";

const PLACE = { row: 1, column: 1 };
const only = (definitions: unknown) => {
  const { functions, problems } = customFunctions(definitions);
  expect(problems).toEqual([]);
  return functions[0]!;
};

describe("custom functions", () => {
  afterEach(() => clearCustomFunctions());

  it("takes a list, a function given the helpers, or a module's default export", () => {
    // A reference comes as a one-cell list: toNumber takes it as its value
    const vat = { name: "vat", call: ([a]: Value[]) => (toNumber(a!) as number) * 1.21 };
    expect(only([vat]).call([[100]], PLACE)).toBeCloseTo(121);
    let given: unknown;
    const factory = (helpers: typeof HELPERS) => {
      given = helpers;
      return [{ name: "DOUBLE", call: ([a]: Value[]) => (helpers.toNumber(a!) as number) * 2 }];
    };
    expect(only(factory).call(["3"], PLACE)).toBe(6);
    expect(given).toBe(HELPERS);
    expect(HELPERS.toNumber).toBe(toNumber);
    expect(only({ default: [vat] }).name).toBe("VAT");
  });

  it("fills in what a definition leaves out", () => {
    const f = only([{ name: "Slug", call: () => "x" }]);
    expect(f).toMatchObject({ name: "SLUG", syntax: "SLUG(…)", description: "", minArgs: 0 });
    expect(f.maxArgs).toBeUndefined();
  });

  it("says what is wrong with a definition, and keeps the others", () => {
    const { functions, problems } = customFunctions([
      { name: "GOOD", call: () => 1 },
      { name: "1BAD", call: () => 1 },
      { name: "NOCALL" },
      { name: "ARGS", minArgs: 2, maxArgs: 1, call: () => 1 },
      "text",
      { name: "LOG2", call: () => 1 },
      { name: "true", call: () => 1 },
    ]);
    expect(functions.map((f) => f.name)).toEqual(["GOOD"]);
    expect(problems).toEqual([
      'function 2: its name "1BAD" is not letters, digits, _ and . starting with a letter',
      "function 3: NOCALL has no call function",
      "function 4: ARGS: maxArgs is not a whole number of minArgs or more",
      "function 5: not an object",
      "function 6: its name LOG2 reads as a cell in formulas",
      "function 7: its name true reads as a value in formulas",
    ]);
    expect(customFunctions({ a: 1 }).problems).toEqual(["the definitions are not a list of functions (or a function returning one)"]);
    expect(
      customFunctions(() => {
        throw new Error("oops");
      }).problems,
    ).toEqual(["the definitions failed: oops"]);
  });

  it("turns what a function throws or gives wrongly into the formula's error", () => {
    const result = (call: () => unknown) => only([{ name: "F", call }]).call([], PLACE);
    expect(
      result(() => {
        throw new Error("no rate");
      }),
    ).toEqual(new FormulaError("#VALUE!", "F failed: no rate"));
    expect((result(() => Promise.resolve(1)) as FormulaError).detail).toContain("returned a promise");
    expect((result(() => [1, 2]) as FormulaError).detail).toContain("returned a list");
    expect((result(() => ({ a: 1 })) as FormulaError).detail).toContain("returned an object");
    expect(result(() => undefined)).toBeNull();
    const time = new TimeValue(3600);
    expect(result(() => time)).toBe(time);
    const error = new FormulaError("#N/A", "not found");
    expect(result(() => error)).toBe(error);
    // Thrown, as returned
    expect(
      result(() => {
        throw error;
      }),
    ).toBe(error);
    // A code formulas do not know would not read as an error once written
    expect((result(() => new FormulaError("#OOPS" as "#N/A", "x")) as FormulaError).detail).toContain("gave the error #OOPS");
  });

  it("take a group of the Functions dialog (none: Custom) and an example", () => {
    defineCustomFunctions([only([{ name: "VAT", category: "math", example: "=VAT([@price])", call: () => 1 }]), only([{ name: "MINE", call: () => 1 }])]);
    expect(findFunctions("", "math").map((f) => f.name)).toContain("VAT");
    expect(findFunctions("", "custom").map((f) => f.name)).toEqual(["MINE"]);
    expect(functionNamed("VAT")!.example).toBe("=VAT([@price])");
    expect(customFunctions([{ name: "BAD", category: "money", call: () => 1 }]).problems).toEqual([
      "function 1: BAD: its category is not one of math, logic, text, date, lookup (none: Custom)",
    ]);
  });

  it("are called by formulas, replace a built-in function of their name, and are forgotten when cleared", () => {
    defineCustomFunctions([only([{ name: "VAT", syntax: "VAT(amount)", description: "With VAT.", minArgs: 1, maxArgs: 1, call: ([a]: Value[]) => (toNumber(a!) as number) * 2 }])]);
    defineCustomFunctions([only([{ name: "ABS", call: () => "own" }])]);
    const table = parseTable('| A | B | C |\n|---|---|---|\n| 5 | <meta f="=VAT(A1)"> | <meta f="=ABS(-1)"> |\n');
    expect(recalculate(table).rows[1]!.cells.slice(1)).toEqual(['10 <meta f="=VAT(A1)">', 'own <meta f="=ABS(-1)">']);
    expect(functionNames()).toContain("VAT");
    expect(functionChoices("=VA", 3, 3)).toEqual({ from: 1, to: 3, names: ["VAT"] });
    expect(formulaHelp("=VAT(", 5)).toEqual({ syntax: "VAT(amount)", description: "With VAT.", argument: { from: 4, to: 10 } });
    // Arguments counted as for built-in functions
    const wrong = recalculate(parseTable('| A |\n|---|\n| <meta f="=VAT()"> |\n'));
    expect(wrong.rows[1]!.cells[0]).toBe('#VALUE! <meta f="=VAT()">');
    // The built-in one's help gives way too
    expect(formulaHelp("=ABS(", 5)).toEqual({ syntax: "ABS(…)", description: "", argument: { from: 4, to: 5 } });
    clearCustomFunctions();
    expect(functionNamed("VAT")).toBeUndefined();
    expect(functionNamed("ABS")).toBe(BUILT_IN_FUNCTIONS.ABS);
    expect(recalculate(table).rows[1]!.cells[1]).toBe('#NAME? <meta f="=VAT(A1)">');
  });

  it("keeps the functions of before until Space Lua defines its own again", () => {
    defineCustomFunctions([only([{ name: "OLD", call: () => 1 }])]);
    customFunctionsAnew();
    expect(functionNamed("OLD")).toBeDefined();
    defineCustomFunctions([only([{ name: "NEW", call: () => 2 }])]);
    defineCustomFunctions([only([{ name: "MORE", call: () => 3 }])]);
    expect(functionNamed("OLD")).toBeUndefined();
    expect([functionNamed("NEW"), functionNamed("MORE")].every(Boolean)).toBe(true);
  });

  it("helps with a name that has digits but is no cell", () => {
    defineCustomFunctions([only([{ name: "ROUND2", syntax: "ROUND2(x)", description: "Two places.", call: () => 1 }])]);
    expect(functionChoices("=ROUND2", 7, 7)!.names).toEqual(["ROUND2"]);
    expect(functionChoices("=ROUND", 6, 6)!.names).toEqual(["ROUND", "ROUND2", "ROUNDDOWN", "ROUNDUP"]);
    // A cell is no function's start
    expect(functionChoices("=A1", 3, 3)).toBeUndefined();
  });
});
