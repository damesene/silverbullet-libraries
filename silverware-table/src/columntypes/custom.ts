// Custom column types: the user's own, defined in a JS file of the space and
// given to Silverware Table from Space Lua (silverware.table.defineTypes, on the library
// page). They have the built-in types' form (type.ts): they declare their
// parameters, which the registry reads, and get the helpers those use
// (HELPERS). Definitions are checked here; what a type's method gives is
// checked as it is called, and a method that throws marks the cell (the
// column types module), so a mistake never breaks a table.
import { parseDate } from "../formulas/dates.ts";
import { lineIcon } from "../icons.ts";
import { dateTimeFormat, formatNumber, notANumber, numberFormat, numberOf } from "./format.ts";
import { readParams } from "./registry.ts";
import type { Choice, ColumnType, Params, ParamSpec, ParamSpecs, Shown } from "./type.ts";

/** What the built-in types use, for custom ones (a definitions function gets them) */
export const HELPERS = { numberOf, notANumber, formatNumber, numberFormat, dateTimeFormat, parseDate, lineIcon } as const;

// A type's name and an alias: a hashtag's characters, no dash (it starts the parameters)
const NAME_RE = /^[a-z][a-z0-9_]*$/i;

/**
 * The definitions given: a list of types, or a function that gets HELPERS and
 * returns that list (a module whose default export is one of them). The
 * types, and what is wrong with the others.
 */
export function customTypes(definitions: unknown): { types: ColumnType[]; problems: string[] } {
  let list = definitions;
  if (isObject(list) && !Array.isArray(list) && "default" in list) list = list.default;
  if (typeof list === "function") {
    try {
      list = (list as (helpers: typeof HELPERS) => unknown)(HELPERS);
    } catch (e) {
      return { types: [], problems: [`the definitions failed: ${message(e)}`] };
    }
  }
  if (!Array.isArray(list)) return { types: [], problems: ["the definitions are not a list of types (or a function returning one)"] };
  const types: ColumnType[] = [];
  const problems: string[] = [];
  list.forEach((definition: unknown, i) => {
    const type = customType(definition);
    if (typeof type === "string") problems.push(`type ${i + 1}: ${type}`);
    else types.push(type);
  });
  return { types, problems };
}

/** One definition as a column type, or what is wrong with it */
function customType(definition: unknown): ColumnType | string {
  if (!isObject(definition)) return "not an object";
  const { name, syntax, description, icon, params = {}, aliases = {}, check, format, sortValue, choices } = definition;
  if (typeof name !== "string" || !NAME_RE.test(name)) return `its name ${JSON.stringify(name)} is not letters, digits and _ starting with a letter`;
  const lower = name.toLowerCase();
  const tag = `#${lower}`;
  if (syntax !== undefined && typeof syntax !== "string") return `${tag}: its syntax is not text`;
  if (description !== undefined && typeof description !== "string") return `${tag}: its description is not text`;
  if (icon !== undefined && (typeof icon !== "string" || !icon.trim().startsWith("<svg"))) return `${tag}: its icon is not an SVG (lineIcon draws one)`;
  for (const [key, method] of Object.entries({ check, format, sortValue, choices })) {
    if (method !== undefined && typeof method !== "function") return `${tag}: ${key} is not a function`;
  }
  const specs = specsOf(params);
  if (typeof specs === "string") return `${tag}: ${specs}`;
  if (!isObject(aliases) || Array.isArray(aliases)) return `${tag}: its aliases are not an object`;
  for (const [alias, written] of Object.entries(aliases)) {
    if (!NAME_RE.test(alias)) return `${tag}: the alias ${alias} is not letters, digits and _`;
    if (typeof written !== "string" || !readParams(specs, written || undefined)) return `${tag}: the alias ${alias} stands for parameters ${JSON.stringify(written)} the type does not take`;
  }
  const call = <T>(method: string, result: T): T => {
    if (isObject(result) && typeof result.then === "function") throw new Error(`${method} returned a promise: a type gives its result at once`);
    return result;
  };
  type Method<R> = (...args: unknown[]) => R;
  return {
    name: lower,
    syntax: syntax ?? tag,
    description: description ?? "",
    ...(icon === undefined ? {} : { icon }),
    params: specs,
    aliases: Object.fromEntries(Object.entries(aliases).map(([alias, written]) => [alias.toLowerCase(), written as string])),
    check: (text: string, p: Params) => {
      if (!check) return undefined;
      const why = call("check", (check as Method<unknown>)(text, p));
      if (why === undefined || why === null || why === "") return undefined;
      if (typeof why !== "string") throw new Error(`check returned ${kindOf(why)}: it gives why a value is not one of the type (text), or nothing`);
      return why;
    },
    format: (text: string, p: Params, locale?: string): Shown => {
      if (!format) return text;
      const shown = call("format", (format as Method<unknown>)(text, p, locale));
      if (typeof shown === "string") return shown;
      if (typeof shown === "number") return String(shown);
      if (isObject(shown) && typeof shown.text === "string" && typeof shown.href === "string") return { text: shown.text, href: shown.href };
      throw new Error(`format returned ${kindOf(shown)}: it gives a text, or a link { text, href }`);
    },
    ...(sortValue
      ? {
          sortValue: (text: string, p: Params) => {
            const value = call("sortValue", (sortValue as Method<unknown>)(text, p));
            if (typeof value === "string" || typeof value === "number") return String(value);
            throw new Error(`sortValue returned ${kindOf(value)}: it gives a text or a number`);
          },
        }
      : {}),
    ...(choices
      ? {
          choices: (p: Params): readonly Choice[] => {
            const list = call("choices", (choices as Method<unknown>)(p));
            if (!Array.isArray(list)) throw new Error(`choices returned ${kindOf(list)}: it gives a list`);
            return list.map((choice): Choice => {
              if (typeof choice === "string") return { value: choice, label: choice };
              if (isObject(choice) && typeof choice.value === "string") return { value: choice.value, label: typeof choice.label === "string" ? choice.label : choice.value };
              throw new Error(`choices gave ${kindOf(choice)}: a choice is a text or { value, label }`);
            });
          },
        }
      : {}),
  };
}

/** A type's parameters as declared, as the registry reads them, or what is wrong with them */
function specsOf(params: unknown): ParamSpecs | string {
  if (!isObject(params) || Array.isArray(params)) return "its params are not an object";
  const names = Object.keys(params);
  const specs: Record<string, ParamSpec> = {};
  for (const [i, name] of names.entries()) {
    const spec = specOf(params[name], i === names.length - 1);
    if (typeof spec === "string") return `the parameter ${name}: ${spec}`;
    specs[name] = spec;
  }
  return specs;
}

/** One parameter as declared (`last`: it takes the rest of the hashtag), or what is wrong with it */
function specOf(spec: unknown, last: boolean): ParamSpec | string {
  if (!isObject(spec)) return "not an object";
  switch (spec.kind) {
    case "number": {
      const { integer, min, max, default: d } = spec;
      for (const [key, value] of Object.entries({ min, max, default: d })) {
        if (value !== undefined && (typeof value !== "number" || Number.isNaN(value))) return `${key} is not a number`;
      }
      if (integer !== undefined && typeof integer !== "boolean") return "integer is not true or false";
      const lowest = (min as number | undefined) ?? -Infinity;
      const highest = (max as number | undefined) ?? Infinity;
      if (lowest > highest) return "its min is above its max";
      if (typeof d === "number" && ((integer && !Number.isInteger(d)) || d < lowest || d > highest)) return "its default is not one it takes";
      return spec as ParamSpec;
    }
    case "choice": {
      const { values, default: d } = spec;
      if (!Array.isArray(values) || values.length === 0 || !values.every((v) => typeof v === "string" && v !== "")) return "its values are not a list of words";
      // Dashes separate parameters: only the last one's values may have them
      if (!last && values.some((v: string) => v.includes("-"))) return "a value has a dash, which only the last parameter's may";
      if (d !== undefined && !values.includes(d)) return "its default is not one of its values";
      return spec as ParamSpec;
    }
    case "text": {
      const { pattern, default: d } = spec;
      if (pattern !== undefined && !(pattern instanceof RegExp)) return "its pattern is not a regular expression";
      // Without g and y: a pattern that keeps where it last matched gives other answers each time
      const own = pattern && new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
      if (d !== undefined && (typeof d !== "string" || d === "" || (own && !own.test(d)))) return "its default is not one it takes";
      return { kind: "text", ...(own ? { pattern: own } : {}), ...(d === undefined ? {} : { default: d }) };
    }
    default:
      return `its kind is not "number", "choice" or "text"`;
  }
}

function kindOf(value: unknown): string {
  return value === null ? "null" : Array.isArray(value) ? "a list" : typeof value === "object" ? "an object" : `a ${typeof value}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
