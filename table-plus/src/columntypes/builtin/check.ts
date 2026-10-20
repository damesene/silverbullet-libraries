import { lineIcon } from "../../icons.ts";
import { numberOf } from "../format.ts";
import type { ColumnType } from "../type.ts";

const YES = new Set(["yes", "y", "true", "x", "✓", "✔", "✅", "done", "ok"]);
const NO = new Set(["no", "n", "false", "✗", "❌", "-"]);

/** Yes or no for a cell's text: a word or mark, or a number (above 0: yes); undefined: neither */
function yesOrNo(text: string): boolean | undefined {
  const t = text.trim().toLowerCase();
  if (YES.has(t)) return true;
  if (NO.has(t)) return false;
  const n = numberOf(t);
  return n === undefined ? undefined : n > 0;
}

export default {
  name: "check",
  syntax: "#check",
  description: "Yes or no as a check mark: yes, true, x, ✅ or a number above 0 shows ✅; no, false, ❌, 0 or a number below it shows ❌.",
  icon: lineIcon('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>'),
  aliases: { logical: "" },
  check: (text) => (yesOrNo(text) === undefined ? `"${text}" is not yes, no or a number` : undefined),
  format: (text) => (yesOrNo(text) ? "✅" : "❌"),
  sortValue: (text) => (yesOrNo(text) ? "1" : "0"),
  choices: () => [
    { value: "yes", label: "✅ yes" },
    { value: "no", label: "❌ no" },
  ],
} satisfies ColumnType;
