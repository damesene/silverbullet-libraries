// The functions formulas can call, one per file in this folder.
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
import type { FormulaFunction } from "./types.ts";

export type { FormulaFunction } from "./types.ts";

const ALL: readonly FormulaFunction[] = [sum, average, min, max, product, count, counta, round, abs, if_, iferror, and_, or_, not_, concat];

/** The functions by name */
export const FUNCTIONS: Readonly<Record<string, FormulaFunction>> = Object.fromEntries(ALL.map((f) => [f.name, f]));
