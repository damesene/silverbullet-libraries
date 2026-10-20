// The functions formulas can call: the built-in ones, one per file in this
// folder, and the user's own (own.ts), which replace a built-in one of their name.
//
// To add one: copy a file such as sum.ts, change its name, syntax, description
// and call, import it here and add it to the list. Then add its syntax and
// description to the Functions table in table-plus.md (a test checks that).
import sum from "./sum.ts";
import average from "./average.ts";
import min from "./min.ts";
import max from "./max.ts";
import product from "./product.ts";
import count from "./count.ts";
import counta from "./counta.ts";
import round from "./round.ts";
import abs from "./abs.ts";
import if_ from "./if.ts";
import iferror from "./iferror.ts";
import and_ from "./and.ts";
import or_ from "./or.ts";
import not_ from "./not.ts";
import concat from "./concat.ts";
import today from "./today.ts";
import now from "./now.ts";
import date from "./date.ts";
import time from "./time.ts";
import int from "./int.ts";
import text from "./text.ts";
import xlookup from "./xlookup.ts";
import dateadd from "./dateadd.ts";
import datedif from "./datedif.ts";
import year from "./year.ts";
import month from "./month.ts";
import day from "./day.ts";
import hour from "./hour.ts";
import minute from "./minute.ts";
import second from "./second.ts";
import weekday from "./weekday.ts";
import row from "./row.ts";
import type { FormulaFunction } from "./types.ts";

export type { FormulaFunction, FunctionContext } from "./types.ts";

const ALL: readonly FormulaFunction[] = [
  sum,
  average,
  min,
  max,
  product,
  count,
  counta,
  round,
  abs,
  if_,
  iferror,
  and_,
  or_,
  not_,
  concat,
  today,
  now,
  date,
  time,
  dateadd,
  datedif,
  year,
  month,
  day,
  hour,
  minute,
  second,
  weekday,
  int,
  text,
  xlookup,
  row,
];

/** The built-in functions by name */
export const BUILT_IN_FUNCTIONS: Readonly<Record<string, FormulaFunction>> = Object.fromEntries(ALL.map((f) => [f.name, f]));

// The user's own functions by name, as last defined
let own = new Map<string, FormulaFunction>();

/** The function formulas call by this name (upper case): the user's own, else the built-in one */
export function functionNamed(name: string): FormulaFunction | undefined {
  return own.get(name) ?? BUILT_IN_FUNCTIONS[name];
}

/** Every function's name, built-in and own */
export function functionNames(): string[] {
  return Array.from(new Set([...Object.keys(BUILT_IN_FUNCTIONS), ...own.keys()]));
}

/** Whether formulas calling this function (upper case) call one of the user's own */
export function isOwnFunction(name: string): boolean {
  return own.has(name);
}

// Space Lua is loaded again: the next definitions replace those of before
let anew = false;

/** Functions of the user's own, added to those defined before (one of the same name replaced), or replacing them all after `ownFunctionsAnew` */
export function defineOwnFunctions(functions: readonly FormulaFunction[]): void {
  own = new Map([...(anew ? [] : own), ...functions.map((f) => [f.name, f] as const)]);
  anew = false;
}

/**
 * Space Lua is loaded again: the scripts define the functions anew. Those of
 * before are kept until then, so formulas calculated meanwhile (a write) still
 * have them; when no script defines any any more, they stay until a reload.
 */
export function ownFunctionsAnew(): void {
  anew = true;
}

/** Forgets the user's own functions */
export function clearOwnFunctions(): void {
  own = new Map();
  anew = false;
}
