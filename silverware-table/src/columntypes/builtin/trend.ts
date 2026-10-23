import { lineIcon } from "../../icons.ts";
import { numberOf } from "../format.ts";
import { columnType } from "../type.ts";

const ARROWS: Readonly<Record<string, string>> = { "+": "↑", "-": "↓", "=": "=" };
// The arrows shown read as what they show too
const MARKS: Readonly<Record<string, string>> = { "↑": "+", "↓": "-" };

/** The arrow for +, - or =, or for a number by its sign (a change: +3, -1.5, 0) */
function arrowOf(text: string): string | undefined {
  const t = MARKS[text.trim()] ?? text.trim();
  if (ARROWS[t]) return ARROWS[t];
  const n = numberOf(t);
  return n === undefined ? undefined : n > 0 ? ARROWS["+"] : n < 0 ? ARROWS["-"] : ARROWS["="];
}

export default columnType({
  name: "trend",
  syntax: "#trend",
  description: "A trend as an arrow: + or a number above 0 shows ↑, - or one below 0 shows ↓, = or 0 shows =.",
  icon: lineIcon('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  check: (text) => (arrowOf(text) ? undefined : `"${text}" is not +, -, = or a number`),
  format: (text) => arrowOf(text)!,
  // (= shows as itself: once)
  choices: () => Object.entries(ARROWS).map(([value, arrow]) => ({ value, label: arrow === value ? value : `${arrow} ${value}` })),
});
