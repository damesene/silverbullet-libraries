// Functions of the user's own, defined in a JS file of the space and given to
// Table Plus from Space Lua (tablePlus.defineFunctions, on the library page).
// They have the built-in functions' form (types.ts) and get the conversions
// those use (HELPERS); what one gives or throws is checked here, so a mistake
// in it shows as the formula's error, never breaks the calculation.
import { formatDate, parseDate, toDate } from "../dates.ts";
import {
  ERROR_CODES,
  FormulaError,
  firstError,
  flatten,
  isError,
  isRange,
  numbers,
  type Scalar,
  single,
  TimeValue,
  toBoolean,
  toNumber,
  toText,
} from "../values.ts";
import { CELL_RE } from "../../names.ts";
import type { FormulaFunction } from "./types.ts";

/** The conversions the built-in functions use, for functions of one's own (a definitions function gets them) */
export const HELPERS = {
  FormulaError,
  TimeValue,
  isError,
  isRange,
  firstError,
  single,
  flatten,
  numbers,
  toNumber,
  toText,
  toBoolean,
  toDate,
  formatDate,
  parseDate,
} as const;

// As formulas write function names (formula/index.ts tokenizes them so)
const NAME_RE = /^[A-Za-z][A-Za-z0-9_.]*$/;

/**
 * The definitions given: a list of functions, or a function that gets HELPERS
 * and returns that list (a module whose default export is one of them). The
 * functions, and what is wrong with the others.
 */
export function ownFunctions(definitions: unknown): { functions: FormulaFunction[]; problems: string[] } {
  let list = definitions;
  if (isObject(list) && !Array.isArray(list) && "default" in list) list = list.default;
  if (typeof list === "function") {
    try {
      list = (list as (helpers: typeof HELPERS) => unknown)(HELPERS);
    } catch (e) {
      return { functions: [], problems: [`the definitions failed: ${message(e)}`] };
    }
  }
  if (!Array.isArray(list)) return { functions: [], problems: ["the definitions are not a list of functions (or a function returning one)"] };
  const functions: FormulaFunction[] = [];
  const problems: string[] = [];
  list.forEach((definition: unknown, i) => {
    const f = ownFunction(definition);
    if (typeof f === "string") problems.push(`function ${i + 1}: ${f}`);
    else functions.push(f);
  });
  return { functions, problems };
}

/** One definition as a function formulas can call, or what is wrong with it */
function ownFunction(definition: unknown): FormulaFunction | string {
  if (!isObject(definition)) return "not an object";
  const { name, syntax, description, minArgs = 0, maxArgs, call } = definition;
  if (typeof name !== "string" || !NAME_RE.test(name)) return `its name ${JSON.stringify(name)} is not letters, digits, _ and . starting with a letter`;
  const upper = name.toUpperCase();
  // Formulas would read it as a cell (LOG2 is the cell in column LOG) or a value
  if (CELL_RE.test(name) || upper === "TRUE" || upper === "FALSE") return `its name ${name} reads as ${upper === "TRUE" || upper === "FALSE" ? "a value" : "a cell"} in formulas`;
  if (typeof call !== "function") return `${upper} has no call function`;
  if (syntax !== undefined && typeof syntax !== "string") return `${upper}: its syntax is not text`;
  if (description !== undefined && typeof description !== "string") return `${upper}: its description is not text`;
  if (!isCount(minArgs)) return `${upper}: minArgs is not a whole number of 0 or more`;
  if (maxArgs !== undefined && (!isCount(maxArgs) || maxArgs < minArgs)) return `${upper}: maxArgs is not a whole number of minArgs or more`;
  return {
    name: upper,
    syntax: syntax ?? `${upper}(…)`,
    description: description ?? "",
    minArgs,
    ...(maxArgs === undefined ? {} : { maxArgs }),
    call: (args, context) => {
      let result: unknown;
      try {
        result = (call as FormulaFunction["call"])(args, context);
      } catch (e) {
        // An error thrown is given, as one returned
        result = e instanceof FormulaError ? e : new FormulaError("#VALUE!", `${upper} failed: ${message(e)}`);
      }
      return resultOf(upper, result);
    },
  };
}

/** What a function gave as a formula's value: one value of the kinds formulas compute with */
function resultOf(name: string, result: unknown): Scalar {
  if (result === undefined || result === null) return null;
  if (typeof result === "number" || typeof result === "string" || typeof result === "boolean") return result;
  if (result instanceof FormulaError) {
    // Written into the cell: only a code formulas know reads as an error again
    return ERROR_CODES.includes(result.code) ? result : new FormulaError("#VALUE!", `${name} gave the error ${String(result.code)}, which is none of ${ERROR_CODES.join(" ")}`);
  }
  if (result instanceof TimeValue) return result;
  if (isObject(result) && typeof result.then === "function") {
    return new FormulaError("#VALUE!", `${name} returned a promise: a function gives its result at once (it cannot wait for anything)`);
  }
  return new FormulaError("#VALUE!", `${name} returned ${Array.isArray(result) ? "a list" : "an object"}: a function gives one value (a number, a text, TRUE or FALSE)`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
