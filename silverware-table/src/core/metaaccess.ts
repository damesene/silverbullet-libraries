// What an owner (a module, or the core) reads and writes of what tables keep,
// its own only: the host's functions for it, each attribute's name made of the
// owner's and the key (meta.ts). The core gives a module these in its own
// host (core/modulehost.ts), so the module never names an attribute whole.
//
// With the metadata setting off, nothing new is stored: an attribute the table
// has may change or go, none is added (`enabled`: whether the setting is on).
import { cellTagName, columnAttributeOf, columnValues, metaValue, metaValuesOf, type Owner, tableAttributeName, withColumnValues, withMetaValue } from "../meta.ts";
import type { Table } from "../markdown.ts";
import { tagValue, withTagValue } from "../tagvalues.ts";
import type { ModelHost } from "./feature.ts";

export type OwnMeta = Pick<
  ModelHost,
  "getMeta" | "setMeta" | "metaOf" | "columnsMeta" | "setColumnsMeta" | "canStoreMeta" | "getCellTag" | "withCellTag" | "canStoreCellTag"
>;

export function ownMeta(owner: Owner, enabled: () => boolean): OwnMeta {
  // Whether the table may have this attribute: the setting on, or it has it already
  const storable = (table: Table, name: string | undefined) => name !== undefined && (enabled() || name in (table.meta ?? {}));
  const nameOf = (table: Table, key: string, at?: { readonly column: number }) => (at ? columnAttributeOf(table, owner, key, at.column) : tableAttributeName(owner, key));
  return {
    getMeta: (table, key, at) => (at ? columnValues(table, owner, key).get(at.column) : metaValue(table, owner, key)),
    setMeta: (table, key, value, at) => {
      if (value !== undefined && !storable(table, nameOf(table, key, at))) return table;
      if (!at) return withMetaValue(table, owner, key, value);
      const values = columnValues(table, owner, key);
      if (value === undefined) values.delete(at.column);
      else values.set(at.column, value);
      return withColumnValues(table, owner, key, values);
    },
    metaOf: (table) => metaValuesOf(table, owner),
    columnsMeta: (table, key) => columnValues(table, owner, key),
    setColumnsMeta: (table, key, values) => {
      const kept = new Map([...values].filter(([column]) => storable(table, columnAttributeOf(table, owner, key, column))));
      return withColumnValues(table, owner, key, kept);
    },
    canStoreMeta: (table, key, at) => storable(table, nameOf(table, key, at)),
    getCellTag: (cell, key) => tagValue(cell, cellTagName(owner, key)),
    withCellTag: (cell, key, value) => withTagValue(cell, cellTagName(owner, key), value),
    canStoreCellTag: (cell, key) => enabled() || tagValue(cell, cellTagName(owner, key)) !== undefined,
  };
}
