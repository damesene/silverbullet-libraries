// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderedMeta } from "./adapter.ts";

/** A rendered table's rows, the last one's cell holding a <meta> with these attributes */
function rowsWithMeta(attributes: Record<string, string>): HTMLTableRowElement[] {
  const table = document.createElement("table");
  table.insertRow().insertCell().textContent = "Qty";
  const meta = document.createElement("meta");
  for (const [name, value] of Object.entries(attributes)) meta.setAttribute(name, value);
  table.insertRow().insertCell().append(meta);
  return Array.from(table.rows);
}

describe("renderedMeta", () => {
  it("reads the metadata row's attributes as rendered, a value with > or | among them", () => {
    const rendered = { "filters.-c-qty.condition": ">10", "filters.-c-status.condition": "=open|blocked", "themes.name": "dark", "themes.stripes": "columns" };
    // The mark of a metadata row is not among its attributes
    expect(renderedMeta(rowsWithMeta({ "core.table": "", ...rendered }))).toEqual(rendered);
    // Without it, a cell's tag
    expect(renderedMeta(rowsWithMeta(rendered))).toBeUndefined();
  });

  it("is no metadata row where the last row's tag is a formula's or a name's", () => {
    expect(renderedMeta(rowsWithMeta({ "formulas.f": "=SUM([qty])" }))).toBeUndefined();
    expect(renderedMeta(rowsWithMeta({ "core.cn": "total" }))).toBeUndefined();
  });
});
