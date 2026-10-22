import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_TYPES } from "./builtin/index.ts";
import { customTypes, HELPERS } from "./custom.ts";
import { allTypes, columnTypeOf, typeNamed, typeOfTag, typeTagPatterns } from "./index.ts";
import { clearCustomTypes, customTypesAnew, defineCustomTypes } from "./registry.ts";
import type { ColumnType } from "./type.ts";

const only = (definitions: unknown): ColumnType => {
  const { types, problems } = customTypes(definitions);
  expect(problems).toEqual([]);
  return types[0]!;
};
const TEMP = {
  name: "Temp",
  syntax: "#temp, #temp-f",
  description: "A temperature.",
  params: { scale: { kind: "choice", values: ["c", "f"], default: "c" } },
  aliases: { fahrenheit: "f" },
  check: (text: string) => (Number.isNaN(Number(text)) ? `"${text}" is not a number` : undefined),
  format: (text: string, { scale }: { scale: string }) => `${text} °${scale.toUpperCase()}`,
};

describe("custom column types", () => {
  afterEach(() => clearCustomTypes());

  it("takes a list, a function given the helpers, or a module's default export; fills in what is left out", () => {
    expect(only([TEMP]).name).toBe("temp");
    let given: unknown;
    only((helpers: typeof HELPERS) => {
      given = helpers;
      return [TEMP];
    });
    expect(given).toBe(HELPERS);
    expect(only({ default: [TEMP] }).syntax).toBe("#temp, #temp-f");
    const bare = only([{ name: "plain" }]);
    expect(bare).toMatchObject({ name: "plain", syntax: "#plain", description: "", params: {} });
    // No check: every text is one; no format: shown as written
    expect([bare.check("anything", {}), bare.format("anything", {})]).toEqual([undefined, "anything"]);
  });

  it("says what is wrong with a definition, and keeps the others", () => {
    const { types, problems } = customTypes([
      TEMP,
      { name: "a-b" },
      { name: "x", format: "nope" },
      { name: "y", params: { n: { kind: "number", min: 1, default: 0 } } },
      { name: "z", params: { s: { kind: "choice", values: [] } } },
      { name: "w", params: { s: { kind: "date" } } },
      { name: "v", params: { s: { kind: "choice", values: ["a"] } }, aliases: { vb: "b" } },
      { name: "u", icon: "★" },
    ]);
    expect(types.map((t) => t.name)).toEqual(["temp"]);
    expect(problems).toEqual([
      'type 2: its name "a-b" is not letters, digits and _ starting with a letter',
      "type 3: #x: format is not a function",
      "type 4: #y: the parameter n: its default is not one it takes",
      "type 5: #z: the parameter s: its values are not a list of words",
      'type 6: #w: the parameter s: its kind is not "number", "choice" or "text"',
      'type 7: #v: the alias vb stands for parameters "b" the type does not take',
      "type 8: #u: its icon is not an SVG (lineIcon draws one)",
    ]);
  });

  it("checks what a type's methods give, so the column types module can mark the cell", () => {
    const type = only([
      {
        name: "odd",
        check: (text: string) => (text === "list" ? ["no"] : undefined),
        format: (text: string) => (text === "promise" ? Promise.resolve("x") : text === "num" ? 42 : { text: "a", href: "https://a" }),
        sortValue: () => ({}),
        choices: () => ["a", { value: "b", label: "B" }],
      },
    ]);
    expect(() => type.check("list", {})).toThrow("check returned a list");
    expect(() => type.format("promise", {})).toThrow("format returned a promise");
    expect(type.format("num", {})).toBe("42");
    expect(type.format("x", {})).toEqual({ text: "a", href: "https://a" });
    expect(() => type.sortValue!("x", {})).toThrow("sortValue returned an object");
    expect(type.choices!({})).toEqual([
      { value: "a", label: "a" },
      { value: "b", label: "B" },
    ]);
  });

  it("are read from headers with their parameters and aliases, and listed after the built-in ones", () => {
    defineCustomTypes([only([TEMP])]);
    expect(columnTypeOf("Oven #temp-F")).toMatchObject({ type: typeNamed("temp"), params: { scale: "f" } });
    expect(columnTypeOf("Out #temp")).toMatchObject({ params: { scale: "c" } });
    expect(columnTypeOf("Oven #fahrenheit")).toMatchObject({ params: { scale: "f" } });
    expect(typeOfTag("temp-k")).toBeUndefined();
    expect(allTypes().at(-1)!.name).toBe("temp");
    expect(typeTagPatterns().exact).toEqual(expect.arrayContaining(["temp", "fahrenheit"]));
    expect(typeTagPatterns().prefixes).toContain("temp-");
  });

  it("replace a built-in type of their name, in its place, its aliases with it; a name comes before an alias", () => {
    defineCustomTypes(customTypes([{ name: "stars", format: () => "custom" }, { name: "kg", format: () => "weight" }]).types);
    expect(allTypes().map((t) => t.name).indexOf("stars")).toBe(BUILT_IN_TYPES.findIndex((t) => t.name === "stars"));
    expect(typeNamed("stars")!.format("3", {})).toBe("custom");
    expect(typeOfTag("evaluation")).toBeUndefined(); // the built-in #stars' alias went with it
    // #kg: the built-in #unit's alias, now a type's own name
    expect(typeOfTag("kg")!.type.format("1", {})).toBe("weight");
    clearCustomTypes();
    expect(typeNamed("stars")).toBe(BUILT_IN_TYPES.find((t) => t.name === "stars"));
    expect(typeOfTag("evaluation")).toBeDefined();
  });

  it("refuses parameters the registry could not read as declared", () => {
    const problem = (params: unknown) => customTypes([{ name: "p", params }]).problems[0];
    expect(problem({ n: { kind: "number", default: NaN } })).toBe("type 1: #p: the parameter n: default is not a number");
    expect(problem({ n: { kind: "number", min: 5, max: 1 } })).toBe("type 1: #p: the parameter n: its min is above its max");
    expect(problem({ n: { kind: "number", integer: "yes" } })).toBe("type 1: #p: the parameter n: integer is not true or false");
    expect(problem({ t: { kind: "text", pattern: /^[a-z]+$/, default: "A1" } })).toBe("type 1: #p: the parameter t: its default is not one it takes");
    // Dashes separate parameters: a value with one only in the last
    expect(problem({ c: { kind: "choice", values: ["a-b"] }, n: { kind: "number" } })).toBe(
      "type 1: #p: the parameter c: a value has a dash, which only the last parameter's may",
    );
    expect(problem({ n: { kind: "number" }, c: { kind: "choice", values: ["a-b"] } })).toBeUndefined();
  });

  it("reads a pattern the same each time, whatever its flags", () => {
    defineCustomTypes([only([{ name: "g", params: { x: { kind: "text", pattern: /^[a-z]+$/g } } }])]);
    expect([1, 2, 3].map(() => typeOfTag("g-abc")?.params)).toEqual([{ x: "abc" }, { x: "abc" }, { x: "abc" }]);
  });

  it("takes the last of a name defined twice; a custom type's alias comes before a built-in one's", () => {
    defineCustomTypes(customTypes([{ name: "t", format: () => "1" }, { name: "T", format: () => "2" }]).types);
    expect(allTypes().filter((t) => t.name === "t").map((t) => t.format("x", {}))).toEqual(["2"]);
    // A custom #currency (in the built-in one's place) with the built-in #unit's alias #kg
    defineCustomTypes(customTypes([{ name: "currency", aliases: { kg: "" } }]).types);
    expect(typeOfTag("kg")!.type.name).toBe("currency");
  });

  it("reads numbers as they are written: no leading zeros, a whole one without a point, an empty part none", () => {
    expect(["stars-05", "stars-5.0", "stars-"].map((tag) => typeOfTag(tag))).toEqual([undefined, undefined, undefined]);
    defineCustomTypes([only([{ name: "range", params: { from: { kind: "number" }, to: { kind: "number" } } }])]);
    expect(typeOfTag("range-1.5-0")!.params).toEqual({ from: 1.5, to: 0 });
    expect(typeOfTag("range--5")).toBeUndefined();
  });

  it("keeps the types of before until Space Lua defines its own again", () => {
    defineCustomTypes([only([{ name: "old" }])]);
    customTypesAnew();
    expect(typeNamed("old")).toBeDefined();
    defineCustomTypes([only([{ name: "new" }])]);
    defineCustomTypes([only([{ name: "more" }])]);
    expect(typeNamed("old")).toBeUndefined();
    expect([typeNamed("new"), typeNamed("more")].every(Boolean)).toBe(true);
    // Loaded again, every definition failing: none of before stays
    customTypesAnew();
    defineCustomTypes(customTypes([{ name: "bad-name" }]).types);
    expect(typeNamed("new")).toBeUndefined();
  });
});
