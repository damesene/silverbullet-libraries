// Column types: a hashtag in a column's header (`| Price #currency |`) shows
// its cells as that type. This is the column types' API for the rest of Table
// Plus; the types are in builtin/ (only types), custom types in custom.ts,
// which exist in registry.ts.
export { allTypes, columnTypeOf, type TypedColumn, typeNamed, typeOfTag, typeTagPatterns, withColumnType } from "./registry.ts";
export type { Choice, ColumnType, Params, Shown } from "./type.ts";
