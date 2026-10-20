import { lineIcon } from "../../icons.ts";
import type { ColumnType } from "../type.ts";

export default {
  name: "link",
  syntax: "#link",
  description: "A web address as a link, shown without its https://.",
  icon: lineIcon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  check: (text) => (/^https?:\/\/\S+$/.test(text.trim()) ? undefined : `"${text}" is not a web address starting with http:// or https://`),
  format: (text) => ({ text: text.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), href: text.trim() }),
} satisfies ColumnType;
