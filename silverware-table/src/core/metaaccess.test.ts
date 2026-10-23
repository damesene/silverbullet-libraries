import { describe, expect, it } from "vitest";
import { parseTable } from "../markdown.ts";
import { ownMeta } from "./metaaccess.ts";

describe("a module's own metadata", () => {
  const table = parseTable("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| <meta core.table core.name='fruit' filters.-c-name.condition='=Pear'> |");

  it("is named by the core: the module's name, its key, and the column", () => {
    const filters = ownMeta("filters", () => true);
    expect(filters.getMeta(table, "condition", { column: 0 })).toBe("=Pear");
    expect(filters.setMeta(table, "condition", ">1", { column: 1 }).meta).toEqual({
      "core.name": "fruit",
      "filters.-c-name.condition": "=Pear",
      "filters.-c-qty.condition": ">1",
    });
    expect(ownMeta("themes", () => true).setMeta(table, "name", "slate").meta?.["themes.name"]).toBe("slate");
    expect(filters.getCellTag("6 <meta filters.x='1'> <meta formulas.x='2'>", "x")).toBe("1");
  });

  it("with the metadata setting off: what the table has may change or go, nothing new is added", () => {
    const filters = ownMeta("filters", () => false);
    expect(filters.setMeta(table, "condition", "=Fig", { column: 0 }).meta?.["filters.-c-name.condition"]).toBe("=Fig");
    expect(filters.setMeta(table, "condition", ">1", { column: 1 })).toBe(table);
    expect(filters.setColumnsMeta(table, "condition", new Map([[0, "=Fig"], [1, ">1"]])).meta).toEqual({ "core.name": "fruit", "filters.-c-name.condition": "=Fig" });
    expect(filters.setMeta(table, "condition", undefined, { column: 0 }).meta).toEqual({ "core.name": "fruit" });
    expect(filters.canStoreMeta(table, "condition", { column: 0 })).toBe(true);
    expect(filters.canStoreMeta(table, "condition", { column: 1 })).toBe(false);
    expect(filters.canStoreCellTag("6 <meta filters.x='1'>", "x")).toBe(true);
    expect(filters.canStoreCellTag("6", "x")).toBe(false);
  });
});
