import type { ColumnType } from "./types.ts";

export default {
  name: "link",
  syntax: "#link",
  description: "A web address as a link, shown without its https://.",
  check: (text) => (/^https?:\/\/\S+$/.test(text.trim()) ? undefined : `"${text}" is not a web address starting with http:// or https://`),
  format: (text) => ({ text: text.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), href: text.trim() }),
} satisfies ColumnType;
