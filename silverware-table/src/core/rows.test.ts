// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { WidgetInfo } from "./feature.ts";
import { TableRows } from "./rows.ts";

/** A rendered table of a header and `rows` body rows of one cell, kept as the core keeps them */
function rendered(rows: number): { info: WidgetInfo; tableRows: TableRows; body: HTMLTableRowElement[] } {
  const table = document.createElement("table");
  table.insertRow().insertCell().textContent = "Name";
  const body = Array.from({ length: rows }, (_, i) => {
    const tr = table.insertRow();
    tr.dataset.swtRow = String(i + 1);
    tr.insertCell().textContent = `row ${i + 1}`;
    return tr;
  });
  const tableRows = new TableRows();
  tableRows.setBodyRows(table, body);
  const info = { table, key: "t", source: "", hint: 0, columns: 1, rows: rows + 1, metaRow: undefined, pins: {} } as unknown as WidgetInfo;
  return { info, tableRows, body };
}

describe("TableRows", () => {
  it("finds a cell by its row without copying the table's rows (asked for every cell of a pass)", () => {
    const { info, tableRows, body } = rendered(1000);
    const copies = vi.spyOn(tableRows, "bodyRows");
    for (let row = 1; row <= 1000; row++) expect(tableRows.cellAt(info, { row, column: 0 })).toBe(body[row - 1]!.cells[0]);
    expect(tableRows.rowAt(info, 1000)).toBe(body[999]);
    expect(copies).not.toHaveBeenCalled();
  });

  it("leaves a hidden row's cell out unless asked for", () => {
    const { info, tableRows, body } = rendered(2);
    body[1]!.classList.add("swt-hidden");
    expect(tableRows.cellAt(info, { row: 2, column: 0 })).toBeUndefined();
    expect(tableRows.cellAt(info, { row: 2, column: 0 }, true)).toBe(body[1]!.cells[0]);
  });
});
