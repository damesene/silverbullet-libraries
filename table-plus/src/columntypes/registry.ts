// Which column types exist (builtin/), and how a column's header names its
// type: a hashtag, `#name`, `#name-param` (its parameters read here, so a type
// gets them as values), or an alias.
import { BUILT_IN_TYPES } from "./builtin/index.ts";
import type { ColumnType, Params, ParamSpec, ParamSpecs } from "./type.ts";

// Every column type
const ALL: readonly ColumnType[] = BUILT_IN_TYPES;

/** The column types by name */
export const TYPES: ReadonlyMap<string, ColumnType> = new Map(ALL.map((t) => [t.name, t]));

// Every hashtag that names a type without a dash of its own: aliases, with the
// type's parameters as they stand for them
const ALIASES = new Map<string, { type: ColumnType; written: string | undefined }>(
  ALL.flatMap((t) => Object.entries(t.aliases ?? {}).map(([alias, written]) => [alias, { type: t, written: written || undefined }])),
);

/** A column's type: the type, its parameters, and the hashtag that gave it (as written, without #) */
export type TypedColumn = { readonly type: ColumnType; readonly params: Params; readonly tag: string };

// A hashtag in a header: `#` after the start or a space, up to a space or another #
const HASHTAG_RE = /(^|\s)#([^\s#]+)/g;

/** The type a hashtag names (#stars, #stars-10, #euro), if any */
export function typeOfTag(tag: string): TypedColumn | undefined {
  const lower = tag.toLowerCase();
  const alias = ALIASES.get(lower);
  const dash = lower.indexOf("-");
  const type = alias?.type ?? TYPES.get(dash < 0 ? lower : lower.slice(0, dash));
  if (!type) return undefined;
  const params = readParams(type.params ?? {}, alias ? alias.written : dash < 0 ? undefined : tag.slice(dash + 1));
  return params && { type, params, tag };
}

/**
 * The parameters written after a type's name (`written`: what follows the
 * dash), read as `specs` say: one after another, separated by dashes, the last
 * taking the rest (#unit-m-s); each one not written its default. Undefined
 * when they are not the type's (a dash on a type that takes none, a value a
 * parameter does not take).
 */
export function readParams(specs: ParamSpecs, written: string | undefined): Params | undefined {
  const names = Object.keys(specs);
  if (written !== undefined && names.length === 0) return undefined;
  const parts = written === undefined ? [] : written.split("-");
  // The last parameter takes the rest, dashes and all
  if (parts.length > names.length) parts.splice(names.length - 1, Infinity, parts.slice(names.length - 1).join("-"));
  const params: Record<string, number | string | undefined> = {};
  for (const [i, name] of names.entries()) {
    const spec = specs[name]!;
    const part = parts[i];
    if (part === undefined) {
      params[name] = spec.default;
      continue;
    }
    const value = paramValue(spec, part);
    if (value === undefined) return undefined;
    params[name] = value;
  }
  return params;
}

/** One parameter's value as written, if the parameter takes it */
function paramValue(spec: ParamSpec, part: string): number | string | undefined {
  switch (spec.kind) {
    case "number": {
      // A dash separates parameters: no negative numbers
      const n = /^\d+(\.\d+)?$/.test(part) ? Number(part) : NaN;
      const fits = Number.isFinite(n) && (!spec.integer || Number.isInteger(n)) && n >= (spec.min ?? -Infinity) && n <= (spec.max ?? Infinity);
      return fits ? n : undefined;
    }
    case "choice":
      return spec.values.find((value) => value.toLowerCase() === part.toLowerCase());
    case "text":
      return part !== "" && (!spec.pattern || spec.pattern.test(part)) ? part : undefined;
  }
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
    prefixes: ALL.filter((t) => Object.keys(t.params ?? {}).length > 0).map((t) => `${t.name}-`),
  };
}
