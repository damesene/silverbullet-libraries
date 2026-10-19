import type { ColumnType } from "./types.ts";

const YES = new Set(["yes", "y", "true", "1", "x", "✓", "✔", "✅", "done", "ok"]);
const NO = new Set(["no", "n", "false", "0", "✗", "❌", "-"]);

export default {
  name: "check",
  syntax: "#check",
  description: "Yes or no as a check mark: yes, true, 1, x or ✅ shows ✅; no, false, 0 or ❌ shows ❌.",
  aliases: { logical: "" },
  check: (text) =>
    YES.has(text.trim().toLowerCase()) || NO.has(text.trim().toLowerCase()) ? undefined : `"${text}" is not yes or no`,
  format: (text) => (YES.has(text.trim().toLowerCase()) ? "✅" : "❌"),
  sortValue: (text) => (YES.has(text.trim().toLowerCase()) ? "1" : "0"),
  choices: () => [
    { value: "yes", label: "✅ yes" },
    { value: "no", label: "❌ no" },
  ],
} satisfies ColumnType;
