// Which column types exist (builtin/), and how a column's header names its
// type: a hashtag, `#name`, `#name-param`, or an alias.
import { BUILT_IN_TYPES } from "./builtin/index.ts";
import type { ColumnType } from "./type.ts";

// Every column type
const ALL: readonly ColumnType[] = BUILT_IN_TYPES;

/** The column types by name */
export const TYPES: ReadonlyMap<string, ColumnType> = new Map(ALL.map((t) => [t.name, t]));

// Every hashtag that names a type without a parameter of its own: aliases
const ALIASES = new Map<string, { type: ColumnType; param: string | undefined }>(
  ALL.flatMap((t) => Object.entries(t.aliases ?? {}).map(([alias, param]) => [alias, { type: t, param: param || undefined }])),
);

/** A column's type: the type, its parameter, and the hashtag that gave it (as written, without #) */
export type TypedColumn = { readonly type: ColumnType; readonly param: string | undefined; readonly tag: string };

// A hashtag in a header: `#` after the start or a space, up to a space or another #
const HASHTAG_RE = /(^|\s)#([^\s#]+)/g;

/** The type a hashtag names (#stars, #stars-10, #euro), if any */
export function typeOfTag(tag: string): TypedColumn | undefined {
  const lower = tag.toLowerCase();
  const alias = ALIASES.get(lower);
  if (alias) return { ...alias, tag };
  const dash = lower.indexOf("-");
  const type = TYPES.get(dash < 0 ? lower : lower.slice(0, dash));
  const param = dash < 0 ? undefined : tag.slice(dash + 1);
  if (!type || (param !== undefined && !type.param?.test(param))) return undefined;
  return { type, param, tag };
}

/** The type a header's hashtags give its column: the first that names one */
export function columnTypeOf(header: string): TypedColumn | undefined {
  for (const match of header.matchAll(HASHTAG_RE)) {
    const typed = typeOfTag(match[2]!);
    if (typed) return typed;
  }
  return undefined;
}

/** The header with its type hashtags replaced by `#tag` (none: removed) */
export function withColumnType(header: string, tag: string | undefined): string {
  const rest = header.replace(HASHTAG_RE, (all, space: string, name: string) => (typeOfTag(name) ? space : all));
  const name = rest.replace(/\s+/g, " ").trim();
  return tag ? `${name} #${tag}` : name;
}

/** Every hashtag that names a type, as CSS can match it: names, names with a parameter, aliases */
export function typeTagPatterns(): { readonly exact: readonly string[]; readonly prefixes: readonly string[] } {
  return {
    exact: [...ALL.map((t) => t.name), ...ALIASES.keys()],
    prefixes: ALL.filter((t) => t.param).map((t) => `${t.name}-`),
  };
}
