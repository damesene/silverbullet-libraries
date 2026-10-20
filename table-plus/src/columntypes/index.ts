// Column types: a hashtag in a column's header (`| Price #currency |`) shows
// its cells as that type. This is the column types' API for the rest of Table
// Plus; the types are in builtin/ (only types), which exist in registry.ts.
export { columnTypeOf, TYPES, type TypedColumn, typeOfTag, typeTagPatterns, withColumnType } from "./registry.ts";
export type { Choice, ColumnType, Shown } from "./type.ts";
