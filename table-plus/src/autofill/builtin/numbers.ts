import type { Series } from "../series.ts";

// A number as cells write it plainly: 3, -1.5, 2,25 (a decimal comma), 007
export const NUMBER_RE = /^([-+]?)(\d+)(?:([.,])(\d+))?$/;

// More digits than a number keeps exactly (an account number): such values repeat
const MAX_DIGITS = 15;

/**
 * Numbers, at least two (one number repeats, as in a spreadsheet): they go on
 * by the step between them, or by their trend when the steps differ (as a
 * spreadsheet fills 1, 2, 4 → 5.33, 6.83). Written as they are: a decimal
 * comma stays one, as many decimal places, leading zeros kept (001, 002 → 003).
 * Numbers of more than 15 digits are no series: they would not be kept exactly.
 */
export default {
  name: "numbers",
  match: (values) => {
    const parts = values.map((v) => NUMBER_RE.exec(v.trim()));
    if (parts.length < 2 || !parts.every((m) => m)) return undefined;
    const all = parts as RegExpExecArray[];
    if (all.some((m) => m[2]!.length + (m[4]?.length ?? 0) > MAX_DIGITS)) return undefined;
    const numbers = all.map((m) => Number(`${m[1]}${m[2]}.${m[4] ?? "0"}`));
    // As the first written with decimals writes them
    const comma = all.find((m) => m[3])?.[3] === ",";
    const decimals = Math.max(...all.map((m) => m[4]?.length ?? 0));
    // Leading zeros: as wide as the widest written so
    const width = Math.max(0, ...all.filter((m) => m[2]!.length > 1 && m[2]!.startsWith("0")).map((m) => m[2]!.length));
    // The least squares line through the values (their own step when they are evenly spaced)
    const n = numbers.length;
    const meanX = (n - 1) / 2;
    const meanY = numbers.reduce((a, b) => a + b, 0) / n;
    const slope = numbers.reduce((sum, y, x) => sum + (x - meanX) * (y - meanY), 0) / numbers.reduce((sum, _, x) => sum + (x - meanX) ** 2, 0);
    const steps = numbers.slice(1).map((y, x) => y - numbers[x]!);
    const even = steps.every((s) => Math.abs(s - steps[0]!) < 1e-9);
    // A trend gets two decimal places more than the values have, past what they show
    const places = even ? decimals : decimals + 2;
    return (i) => {
      const value = even ? numbers[0]! + i * steps[0]! : meanY + (i - meanX) * slope;
      let text = (Math.round(value * 10 ** places) / 10 ** places).toFixed(places);
      if (!even && places > decimals) text = text.replace(/0+$/, "").replace(/\.$/, "");
      const [sign, digits] = text.startsWith("-") ? ["-", text.slice(1)] : ["", text];
      const [whole, fraction] = digits.split(".");
      const padded = whole!.padStart(width, "0");
      return `${sign}${padded}${fraction ? `${comma ? "," : "."}${fraction}` : ""}`;
    };
  },
} satisfies Series;
