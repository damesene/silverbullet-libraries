// Which column types exist: the built-in ones (builtin/) and the custom ones
// the user defines (custom.ts), which replace a built-in one of their name;
// and how a column's header names its type: a hashtag, `#name`, `#name-param`
// (its parameters read here, so a type gets them as values), or an alias.
import { BUILT_IN_TYPES } from "./builtin/index.ts";
import type { ColumnType, Params, ParamSpec, ParamSpecs } from "./type.ts";

type Known = {
  // Every type: the built-in ones (a custom one in the place of the one it replaces), then the other custom ones
  readonly all: readonly ColumnType[];
  readonly byName: ReadonlyMap<string, ColumnType>;
  // Every hashtag that names a type without a dash of its own: aliases, with
  // the type's parameters as they stand for them (a custom type's before a
  // built-in one's, a later custom type's before an earlier one's)
  readonly aliases: ReadonlyMap<string, { readonly type: ColumnType; readonly written: string | undefined }>;
};

function knownOf(custom: readonly ColumnType[]): Known {
  const replacing = new Map(custom.map((t) => [t.name, t]));
  const all = [...BUILT_IN_TYPES.map((t) => replacing.get(t.name) ?? t), ...custom.filter((t) => !BUILT_IN_TYPES.some((b) => b.name === t.name))];
  return {
    all,
    byName: new Map(all.map((t) => [t.name, t])),
    aliases: new Map(
      [...all.filter((t) => !custom.includes(t)), ...custom].flatMap((t) =>
        Object.entries(t.aliases ?? {}).map(([alias, written]) => [alias, { type: t, written: written || undefined }] as const),
      ),
    ),
  };
}

// The custom types, as last defined
let custom: readonly ColumnType[] = [];
let known = knownOf(custom);
// Space Lua is loaded again: the next definitions replace those of before
let anew = false;

/** Every column type, in the order the Type menu lists them */
export function allTypes(): readonly ColumnType[] {
  return known.all;
}

/** The column type of this name (lower case): the custom one, else the built-in one */
export function typeNamed(name: string): ColumnType | undefined {
  return known.byName.get(name);
}

/** Custom types, added to those defined before (one of the same name replaced, in its place: the last of a name), or replacing them all after `customTypesAnew` */
export function defineCustomTypes(types: readonly ColumnType[]): void {
  custom = Array.from(new Map([...(anew ? [] : custom), ...types].map((t) => [t.name, t])).values());
  known = knownOf(custom);
  anew = false;
}

/**
 * Space Lua is loaded again: the scripts define the types anew. Those of
 * before are kept until then; when no script defines any any more, they stay
 * until a reload.
 */
export function customTypesAnew(): void {
  anew = true;
}

/** Forgets the custom types */
export function clearCustomTypes(): void {
  custom = [];
  known = knownOf(custom);
  anew = false;
}

/** A column's type: the type, its parameters, and the hashtag that gave it (as written, without #) */
export type TypedColumn = { readonly type: ColumnType; readonly params: Params; readonly tag: string };

// A hashtag in a header: `#` after the start or a space, up to a space or another #
const HASHTAG_RE = /(^|\s)#([^\s#]+)/g;

/** The type a hashtag names (#stars, #stars-10, #euro), if any */
export function typeOfTag(tag: string): TypedColumn | undefined {
  const lower = tag.toLowerCase();
  // A type's own name before an alias (a custom type named as a built-in one's alias)
  const alias = known.byName.has(lower) ? undefined : known.aliases.get(lower);
  const dash = lower.indexOf("-");
  const type = alias?.type ?? known.byName.get(dash < 0 ? lower : lower.slice(0, dash));
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
      // A dash separates parameters: no negative numbers; written as numbers are (no 05, no 5.0 for a whole one)
      const n = (spec.integer ? /^(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)(\.\d+)?$/).test(part) ? Number(part) : NaN;
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
    exact: [...known.all.map((t) => t.name), ...known.aliases.keys()],
    prefixes: known.all.filter((t) => Object.keys(t.params ?? {}).length > 0).map((t) => `${t.name}-`),
  };
}
