import { isError } from "../values.ts";
import { booleans } from "./helpers.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "AND",
  syntax: "AND(logical1, [logical2], …)",
  description: "TRUE if all of the values are true.",
  minArgs: 1,
  call: (args) => {
    const bs = booleans(args);
    return isError(bs) ? bs : bs.every(Boolean);
  },
} satisfies FormulaFunction;
