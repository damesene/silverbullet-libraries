import { wildcardRegExp } from "../criteria.ts";
import { parseDate } from "../dates.ts";
import { FormulaError, isError, isRange, sameValue, type Scalar, single, toNumber, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

/**
 * The order of a key against the value looked up, for the next smaller or
 * larger: dates as dates, numbers as numbers, text as text ignoring case;
 * undefined for values of different kinds or an empty cell, which are never
 * the next one
 */
function order(key: Scalar, value: Scalar): number | undefined {
  if (key === null || isError(key) || typeof key === "boolean" || typeof value === "boolean") return undefined;
  if (typeof key === "string" && key.trim() === "") return undefined;
  const dk = typeof key === "string" ? parseDate(key) : undefined;
  const dv = typeof value === "string" ? parseDate(value) : undefined;
  if (dk || dv) return dk && dv ? dk.ms - dv.ms : undefined;
  const nk = toNumber(key);
  const nv = toNumber(value);
  if (!isError(nk) || !isError(nv)) return !isError(nk) && !isError(nv) ? nk - nv : undefined;
  const tk = (toText(key) as string).toLowerCase();
  const tv = (toText(value) as string).toLowerCase();
  return tk < tv ? -1 : tk > tv ? 1 : 0;
}

/** The place of the key found in `keys` (searched in `places` order), or -1 */
function find(value: Scalar, keys: readonly Scalar[], places: readonly number[], mode: number): number {
  if (mode === 2) {
    const re = wildcardRegExp(toText(value) as string, true);
    // Wildcards match text only, as in the conditions of COUNTIFS
    return places.find((at) => typeof keys[at] === "string" && re.test((keys[at] as string).trim())) ?? -1;
  }
  const exact = places.find((at) => sameValue(value, keys[at]!));
  if (exact !== undefined || mode === 0) return exact ?? -1;
  // -1: the largest key below the value; 1: the smallest above it (the first of equal ones)
  let best = -1;
  for (const at of places) {
    const o = order(keys[at]!, value);
    if (o === undefined || (mode < 0 ? o > 0 : o < 0)) continue;
    if (best < 0 || (mode < 0 ? order(keys[at]!, keys[best]!)! > 0 : order(keys[at]!, keys[best]!)! < 0)) best = at;
  }
  return best;
}

export default {
  name: "XLOOKUP",
  syntax: "XLOOKUP(value, lookup_range, result_range, [if_not_found], [match_mode], [search_mode])",
  description:
    'Finds the value in one range or column and gives the value in the same place of another, e.g. XLOOKUP("Pear", prices![Name], prices![Price]); text is found ignoring case. Not found: if_not_found, else #N/A. match_mode: 0 the same value (the default), -1 or else the next smaller, 1 or else the next larger, 2 with wildcards (* any text, ? one character). search_mode: 1 from the first (the default), -1 from the last.',
  category: "lookup",
  example: "=XLOOKUP([@fruit], prices![name], prices![price])",
  minArgs: 3,
  maxArgs: 6,
  call: ([value, lookIn, results, notFound, matchMode, searchMode]) => {
    const v = single(value!);
    if (isError(v)) return v;
    // A range that is an error (a column that does not exist) is the result, not "not found"
    if (isError(lookIn!)) return lookIn;
    if (isError(results!)) return results;
    // An argument left out (XLOOKUP(a, b, c, , 1)) is null: the default
    const mode = matchMode === undefined || matchMode === null ? 0 : toNumber(matchMode);
    const search = searchMode === undefined || searchMode === null ? 1 : toNumber(searchMode);
    if (isError(mode)) return mode;
    if (isError(search)) return search;
    if (![0, -1, 1, 2].includes(mode)) return new FormulaError("#VALUE!", `${mode} is not a match_mode: 0, -1, 1 or 2`);
    // 2 and -2 are a binary search in spreadsheets: on sorted keys it finds what 1 and -1 find
    if (![1, -1, 2, -2].includes(search)) return new FormulaError("#VALUE!", `${search} is not a search_mode: 1 or -1`);
    const keys = isRange(lookIn!) ? lookIn : [lookIn!];
    const found = isRange(results!) ? results : [results!];
    if (keys.length !== found.length) {
      return new FormulaError("#VALUE!", `the ranges are not the same size (${keys.length} and ${found.length} cells)`);
    }
    const places = keys.map((_, at) => at);
    if (search < 0) places.reverse();
    const index = find(v, keys, places, mode);
    if (index < 0) {
      return notFound === undefined || notFound === null ? new FormulaError("#N/A", `"${toText(v)}" is not in the range`) : single(notFound);
    }
    return found[index] ?? null;
  },
} satisfies FormulaFunction;
