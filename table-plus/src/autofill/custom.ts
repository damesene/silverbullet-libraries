// Custom series: the user's own, defined in a JS file of the space and given
// to Table Plus from Space Lua (tablePlus.defineSeries, on the library page).
// A definition is a list of words AutoFill goes round (data: quarters,
// statuses, sprints), or a series in the built-in ones' form (series.ts).
// Definitions are checked here; what a series gives is checked as it is
// called, and a series that throws or gives something else fills nothing of
// its own, so a mistake never breaks a fill.
import { formatDate, parseDate } from "../formulas/dates.ts";
import { key, listSeries } from "./builtin/lists.ts";
import type { Generator, Series } from "./series.ts";

/** What custom series may use (a definitions function gets them) */
export const HELPERS = {
  parseDate,
  // A date as formulas write it, or the error code of one past the years 0 to 9999
  formatDate: (date: Parameters<typeof formatDate>[0]) => {
    const written = formatDate(date);
    return typeof written === "string" ? written : written.code;
  },
} as const;

// A series' name: as a column type's, so one can be told in a message
const NAME_RE = /^[a-z][a-z0-9_ ]*$/i;

/**
 * The definitions given: a list of series and lists, or a function that gets
 * HELPERS and returns that list (a module whose default export is one of
 * them). The series, and what is wrong with the others.
 */
export function customSeries(definitions: unknown): { series: Series[]; problems: string[] } {
  let list = definitions;
  if (isObject(list) && !Array.isArray(list) && "default" in list) list = list.default;
  if (typeof list === "function") {
    try {
      list = (list as (helpers: typeof HELPERS) => unknown)(HELPERS);
    } catch (e) {
      return { series: [], problems: [`the definitions failed: ${message(e)}`] };
    }
  }
  if (!Array.isArray(list)) return { series: [], problems: ["the definitions are not a list of series (or a function returning one)"] };
  const series: Series[] = [];
  const problems: string[] = [];
  list.forEach((definition: unknown, i) => {
    const one = customOne(definition);
    if (typeof one === "string") problems.push(`series ${i + 1}: ${one}`);
    else series.push(one);
  });
  return { series, problems };
}

/** One definition as a series, or what is wrong with it */
function customOne(definition: unknown): Series | string {
  if (!isObject(definition)) return "not an object";
  const { name, words, alone, match } = definition;
  if (typeof name !== "string" || !NAME_RE.test(name)) return `its name ${JSON.stringify(name)} is not letters, digits, _ and spaces starting with a letter`;
  if ((words === undefined) === (match === undefined)) return `${name}: it has words (a list to go round) or match (a series), one of them`;
  if (words !== undefined) {
    if (!Array.isArray(words) || words.length < 2 || !words.every((w) => typeof w === "string" && w.trim() !== "")) return `${name}: its words are not a list of two or more texts`;
    const keys = words.map(key);
    if (new Set(keys).size < keys.length) return `${name}: a word is in its words twice (case and diacritics aside)`;
    if (alone !== undefined && typeof alone !== "boolean") return `${name}: alone is not true or false`;
    return listSeries(name, [{ words: words.map((w: string) => w.trim()), alone: alone ?? true }]);
  }
  if (typeof match !== "function") return `${name}: match is not a function`;
  return { name, match: (values: readonly string[]) => checkedGenerator(name, values, match as (values: readonly string[]) => unknown) };
}

/**
 * The series' generator for the values, if it gives one: a function giving a
 * text (or a number) for every index. A match that throws or gives something
 * else is no match; a generator that does for an index gives that cell the
 * value it would have repeated (logged once, for the one who wrote it).
 */
function checkedGenerator(name: string, values: readonly string[], match: (values: readonly string[]) => unknown): Generator | undefined {
  let next: unknown;
  try {
    next = match(values);
  } catch (e) {
    console.warn(`Table Plus: the series ${name} failed: ${message(e)}`);
    return undefined;
  }
  if (next === undefined || next === null) return undefined;
  if (typeof next !== "function") {
    console.warn(`Table Plus: the series ${name}: match gave ${kindOf(next)}, not a function of the index (or nothing)`);
    return undefined;
  }
  const k = values.length;
  let warned = false;
  return (i) => {
    let text: unknown;
    try {
      text = (next as (index: number) => unknown)(i);
      if (typeof text === "number" && Number.isFinite(text)) return String(text);
      if (typeof text === "string") return text;
      throw new Error(`it gave ${kindOf(text)} for index ${i}: a text or a number`);
    } catch (e) {
      if (!warned) console.warn(`Table Plus: the series ${name}: ${message(e)}`);
      warned = true;
      return values[((i % k) + k) % k] ?? "";
    }
  };
}

function kindOf(value: unknown): string {
  if (isObject(value) && typeof value.then === "function") return "a promise";
  return value === null ? "null" : Array.isArray(value) ? "a list" : typeof value === "object" ? "an object" : `a ${typeof value}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
