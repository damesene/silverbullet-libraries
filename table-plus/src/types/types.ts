/** A value a typed cell offers in its editor */
export type Choice = { readonly value: string; readonly label: string };

/** What a typed cell shows: text, or a link */
export type Shown = string | { readonly text: string; readonly href: string };

/**
 * A column type: one per file in this folder, listed in index.ts. A column
 * gets it with a hashtag in its header, `| Price #currency-usd |`: the type's
 * name, and after a "-" its parameter if it takes one. `syntax` and
 * `description` are shown in the column menu and must also be listed in the
 * Column types section of table-plus.md (a test checks that).
 *
 * A type only changes what a cell shows: the markdown keeps the value as
 * typed, and sorting, filters and copying use it too (or `sortValue`).
 */
export type ColumnType = {
  // The name in the hashtag, lower case
  readonly name: string;
  readonly syntax: string;
  readonly description: string;
  // The type's icon, in the column menu and in its columns' headers: an SVG,
  // 24x24 and drawn with currentColor (lineIcon draws one); none: a tag
  readonly icon?: string;
  // What the parameter after "name-" may be; no `param`: the type takes none
  readonly param?: RegExp;
  // Other hashtags that mean this type, with the parameter they stand for
  // ("" for none); e.g. MdTableRender's #euro is #currency-eur
  readonly aliases?: Readonly<Record<string, string>>;
  /** Why a cell's text is not a value of this type; undefined when it is (empty cells are never checked) */
  readonly check: (text: string, param: string | undefined) => string | undefined;
  /** What a valid cell shows; `locale` for numbers and dates (undefined: the browser's) */
  readonly format: (text: string, param: string | undefined, locale?: string) => Shown;
  /** What sorting and filters compare instead of the text, e.g. 1 / 0 for a check mark */
  readonly sortValue?: (text: string, param: string | undefined) => string;
  /** The values the cell editor offers */
  readonly choices?: (param: string | undefined) => readonly Choice[];
};
