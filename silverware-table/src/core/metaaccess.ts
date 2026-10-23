// What an owner (a module, or the core) reads and writes of what tables keep,
// its own only: the host's functions for it, each attribute's name made of the
// owner's and the key (meta.ts). The core gives a module these in its own
// host (core/modulehost.ts), so the module never names an attribute whole.
import { cellTagName, columnValues, metaValue, metaValuesOf, type Owner, withColumnValues, withMetaValue } from "../meta.ts";
import { tagValue, withTagValue } from "../tagvalues.ts";
import type { ModelHost } from "./feature.ts";

export type OwnMeta = Pick<ModelHost, "getMeta" | "setMeta" | "metaOf" | "columnsMeta" | "setColumnsMeta" | "getCellTag" | "withCellTag">;

export function ownMeta(owner: Owner): OwnMeta {
  return {
    getMeta: (table, key, at) => (at ? columnValues(table, owner, key).get(at.column) : metaValue(table, owner, key)),
    setMeta: (table, key, value, at) => {
      if (!at) return withMetaValue(table, owner, key, value);
      const values = columnValues(table, owner, key);
      if (value === undefined) values.delete(at.column);
      else values.set(at.column, value);
      return withColumnValues(table, owner, key, values);
    },
    metaOf: (table) => metaValuesOf(table, owner),
    columnsMeta: (table, key) => columnValues(table, owner, key),
    setColumnsMeta: (table, key, values) => withColumnValues(table, owner, key, values),
    getCellTag: (cell, key) => tagValue(cell, cellTagName(owner, key)),
    withCellTag: (cell, key, value) => withTagValue(cell, cellTagName(owner, key), value),
  };
}
