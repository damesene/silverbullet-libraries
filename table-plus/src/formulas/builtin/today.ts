import { formatDate, now } from "../dates.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "TODAY",
  syntax: "TODAY()",
  description: "Today's date, e.g. 2025-11-06. The result is written when the table is calculated: the next day, Recalculate updates it.",
  minArgs: 0,
  maxArgs: 0,
  call: () => formatDate(now(false)),
} satisfies FormulaFunction;
