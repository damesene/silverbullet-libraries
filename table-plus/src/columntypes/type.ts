/** A value a typed cell offers in its editor */
export type Choice = { readonly value: string; readonly label: string };

/** What a typed cell shows: text, or a link */
export type Shown = string | { readonly text: string; readonly href: string };

/**
 * A parameter a type takes, written after its name and a dash (#stars-10).
 * The registry reads it from the hashtag: a hashtag whose parameter is not
 * one of these is not the type's.
 */
export type ParamSpec =
  // A number, e.g. the most stars; `integer`: a whole one
  | { readonly kind: "number"; readonly integer?: boolean; readonly min?: number; readonly max?: number; readonly default?: number }
  // One of these words, in any case (given as listed here)
  | { readonly kind: "choice"; readonly values: readonly string[]; readonly default?: string }
  // Text, as written; `pattern`: what it must be
  | { readonly kind: "text"; readonly pattern?: RegExp; readonly default?: string };

/** A type's parameters by name, in the order they are written after its name (#name-first-second) */
export type ParamSpecs = Readonly<Record<string, ParamSpec>>;

/** The parameters a type gets: each read from its hashtag, its default where none is written (undefined: no default) */
export type Params = Readonly<Record<string, number | string | undefined>>;

// A number as a number, a choice as one of its values (as listed), text as written
type ParamValue<S extends ParamSpec> = S extends { readonly kind: "number" }
  ? number
  : S extends { readonly kind: "choice"; readonly values: readonly (infer V)[] }
    ? V
    : string;

/** The parameters `specs` give a type, as it gets them */
export type ParamsOf<S extends ParamSpecs> = {
  readonly [K in keyof S]: S[K] extends { readonly default: unknown } ? ParamValue<S[K]> : ParamValue<S[K]> | undefined;
};

/**
 * A column type: the built-in ones one per file in builtin/. A column gets it
 * with a hashtag in its header, `| Price #currency-usd |`: the type's name,
 * and after a "-" its parameters if it takes any (`params`), which the
 * registry reads, so a type gets them as values. `syntax` and `description`
 * are shown in the column menu; a built-in type's must also be listed in the
 * Column types section of table-plus.md (a test checks that).
 *
 * A type only changes what a cell shows: the markdown keeps the value as
 * typed, and sorting, filters and copying use it too (or `sortValue`).
 */
export type ColumnType<P extends Params = Params> = {
  // The name in the hashtag, lower case
  readonly name: string;
  readonly syntax: string;
  readonly description: string;
  // The type's icon, in the column menu and in its columns' headers: an SVG,
  // 24x24 and drawn with currentColor (lineIcon draws one); none: a tag
  readonly icon?: string;
  // The parameters it takes; none: a hashtag with a dash is not this type's
  readonly params?: ParamSpecs;
  // Other hashtags that mean this type, with its parameters as written after
  // the dash ("" for none); e.g. MdTableRender's #euro is #currency-eur
  readonly aliases?: Readonly<Record<string, string>>;
  // Methods, not function properties: a type of its own parameters is still a ColumnType
  /** Why a cell's text is not a value of this type; undefined when it is (empty cells are never checked) */
  check(text: string, params: P): string | undefined;
  /** What a valid cell shows; `locale` for numbers and dates (undefined: the browser's) */
  format(text: string, params: P, locale?: string): Shown;
  /** What sorting and filters compare instead of the text, e.g. 1 / 0 for a check mark */
  sortValue?(text: string, params: P): string;
  /** The values the cell editor offers */
  choices?(params: P): readonly Choice[];
};

/** A type with the parameters it declares typed for its methods (`params: { max: { kind: "number", default: 5 } }` gives `max` as a number) */
export function columnType<const S extends ParamSpecs = Record<never, never>>(type: Omit<ColumnType<ParamsOf<S>>, "params"> & { readonly params?: S }): ColumnType {
  return type;
}
