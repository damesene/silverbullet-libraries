import { lineIcon } from "../icons.ts";
import type { ColumnType } from "./types.ts";

const ARROWS: Readonly<Record<string, string>> = { "+": "🔼", "-": "🔽", "=": "➡️" };

export default {
  name: "trend",
  syntax: "#trend",
  description: "A trend as an arrow: + shows 🔼, - shows 🔽, = shows ➡️.",
  icon: lineIcon('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  check: (text) => (ARROWS[text.trim()] ? undefined : `"${text}" is not +, - or =`),
  format: (text) => ARROWS[text.trim()]!,
  choices: () => Object.entries(ARROWS).map(([value, arrow]) => ({ value, label: `${arrow} ${value}` })),
} satisfies ColumnType;
