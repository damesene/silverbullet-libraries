// The built-in column types, one per file in this folder: only types, what
// they share is in the folder above (format.ts, type.ts).
//
// To add one: copy a file such as stars.ts, change its name, syntax,
// description, icon, check and format (and params, aliases, sortValue, choices
// if it needs them), made with columnType (its parameters typed), import it here and add it to the list. Then add its syntax and
// description to the Column types table in table-plus.md (a test checks that).
import check from "./check.ts";
import currency from "./currency.ts";
import date from "./date.ts";
import link from "./link.ts";
import number from "./number.ts";
import percent from "./percent.ts";
import progress from "./progress.ts";
import stars from "./stars.ts";
import time from "./time.ts";
import trend from "./trend.ts";
import type { ColumnType } from "../type.ts";
import unit from "./unit.ts";

/** The built-in column types, in the order the Type menu lists them */
export const BUILT_IN_TYPES: readonly ColumnType[] = [currency, number, percent, unit, stars, check, date, time, trend, progress, link];
