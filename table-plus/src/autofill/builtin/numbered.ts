import type { Series } from "../series.ts";

// Text with a number in it, the last one: Item 1, A-01, Q4, 10 %
const NUMBERED_RE = /^(.*?)(\d+)(\D*)$/s;

/**
 * Text with a number (not a number alone): one goes on by 1 (Item 1 → Item 2),
 * several of the same text by the step between their numbers (Q1, Q3 → Q5).
 * Leading zeros are kept (A-01 → A-02).
 */
export default {
  name: "numbered text",
  match: (values) => {
    const parts = values.map((v) => NUMBERED_RE.exec(v));
    if (parts.length === 0 || !parts.every((m) => m)) return undefined;
    const all = parts as RegExpExecArray[];
    const [, prefix, , suffix] = all[0]!;
    if (prefix!.trim() === "" && suffix!.trim() === "") return undefined;
    if (!all.every((m) => m[1] === prefix && m[3] === suffix)) return undefined;
    const numbers = all.map((m) => Number(m[2]));
    const step = numbers.length === 1 ? 1 : numbers[1]! - numbers[0]!;
    if (step === 0 || !numbers.every((n, i) => n === numbers[0]! + i * step)) return undefined;
    const width = all[0]![2]!.startsWith("0") ? all[0]![2]!.length : 0;
    return (i) => {
      const n = numbers[0]! + i * step;
      return `${prefix}${n < 0 ? "-" : ""}${String(Math.abs(n)).padStart(width, "0")}${suffix}`;
    };
  },
} satisfies Series;
