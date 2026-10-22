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
    expect(renderedMeta(rowsWithMeta({ "filter.qty": ">10", "filter.status": "=open|blocked", theme: "dark", stripes: "columns" }))).toEqual({
      "filter.qty": ">10",
      "filter.status": "=open|blocked",
      theme: "dark",
      stripes: "columns",
    });
  });

  it("is no metadata row where the last row's tag is a formula's or a name's", () => {
    expect(renderedMeta(rowsWithMeta({ f: "=SUM([qty])" }))).toBeUndefined();
    expect(renderedMeta(rowsWithMeta({ cn: "total" }))).toBeUndefined();
  });
});
