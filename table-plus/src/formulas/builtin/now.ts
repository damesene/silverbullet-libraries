import { formatDate, now } from "../dates.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "NOW",
  syntax: "NOW()",
  description: "The date and time now, e.g. 2025-11-06 14:30:15. The result is written when the table is calculated: Recalculate updates it.",
  minArgs: 0,
  maxArgs: 0,
  call: () => formatDate(now(true)),
} satisfies FormulaFunction;
