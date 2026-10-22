// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cell, controller, editor, flush, setup, tableMenuItem, text, useTablePage } from "../testing/page.ts";

describe("Column widths", () => {
  useTablePage();

  const PAGE = "| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 |\n";
  const handle = (column: number) => cell(0, column).querySelector<HTMLElement>(".swt-col-resize")!;
  // jsdom has no layout: the header cell is `width` wide when the drag starts
  const drag = (column: number, width: number, moves: readonly number[]) => {
    Object.defineProperty(cell(0, column), "getBoundingClientRect", { configurable: true, value: () => new DOMRect(0, 0, width, 30) });
    handle(column).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: 100, detail: 1 }));
    for (const dx of moves) window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 1, clientX: 100 + dx }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 100 + (moves.at(-1) ?? 0), detail: 1 }));
  };

  it("sets a column's width by dragging its header's edge, from the width at the press, stored in the table", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    expect(handle(1)).not.toBeNull();
    // Out of the header's line (marked so, the core knows no module's element): in the cell, at its edge
    expect(handle(1).parentElement).toBe(cell(0, 1));
    expect(cell(0, 1).querySelector(".swt-head .swt-col-resize")).toBeNull();
    // Moving back and forth: the width follows the pointer from the press, at least 40px
    drag(0, 120, [30, 300, -200, 60]);
    await flush();
    expect(text).toBe(`${PAGE}| <meta width.name="180"> |\n`);
    await controller.scan();
    expect(cell(0, 0).style.width).toBe("180px");
    expect(cell(1, 0).style.width).toBe("180px");
    expect(cell(1, 0).classList.contains("swt-sized")).toBe(true);
    // The other column stays automatic
    expect(cell(0, 1).style.width).toBe("");
  });

  it("goes back to the automatic width on a double-click, the stored width removed", async () => {
    await setup(`${PAGE}| <meta width.qty="90"> |\n`, { "silverware.table.metadata": true });
    expect(cell(0, 1).style.width).toBe("90px");
    // The second press of a double-click, released where it was pressed
    Object.defineProperty(cell(0, 1), "getBoundingClientRect", { configurable: true, value: () => new DOMRect(0, 0, 90, 30) });
    handle(1).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail: 2 }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, detail: 2 }));
    await flush();
    expect(text).toBe(PAGE);
    await controller.scan();
    expect(cell(0, 1).style.width).toBe("");
    expect(cell(1, 1).classList.contains("swt-sized")).toBe(false);
  });

  it("drags on a quick second press too (a double-click that moves), and ends a drag released outside the window", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    Object.defineProperty(cell(0, 0), "getBoundingClientRect", { configurable: true, value: () => new DOMRect(0, 0, 100, 30) });
    handle(0).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: 100, detail: 2 }));
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 1, clientX: 150 }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 150, detail: 2 }));
    await flush();
    expect(text).toBe(`${PAGE}| <meta width.name="150"> |\n`);
    await controller.scan();
    // Released outside the window (no mouseup): the next move, without the button, ends it there
    Object.defineProperty(cell(0, 0), "getBoundingClientRect", { configurable: true, value: () => new DOMRect(0, 0, 150, 30) });
    handle(0).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: 100, detail: 1 }));
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 1, clientX: 120 }));
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 0, clientX: 300 }));
    await flush();
    expect(text).toBe(`${PAGE}| <meta width.name="170"> |\n`);
    expect(document.body.classList.contains("swt-resizing")).toBe(false);
  });

  it("saves a cell being edited before a drag", async () => {
    await setup(PAGE, { "silverware.table.metadata": true, "silverware.table.editor.enterKey": "save" });
    localStorage.setItem("silverware.table.editMode", "on");
    cell(1, 0).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    cell(1, 0).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    field.focus();
    field.value = "Plum";
    drag(1, 80, [20]);
    for (let i = 0; i < 5; i++) {
      await flush();
      await controller.scan();
    }
    expect(text).toContain("| Plum | 3 |");
    expect(text).toContain('<meta width.qty="100">');
  });

  it("keeps the handle in a header cell being edited (it shows there, quiet, as on hover)", async () => {
    await setup(PAGE);
    localStorage.setItem("silverware.table.editMode", "on");
    cell(0, 0).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    cell(0, 0).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(cell(0, 0).querySelector(".swt-cell-editor")).not.toBeNull();
    expect(handle(0).parentElement).toBe(cell(0, 0));
    expect(cell(0, 0).querySelector(".swt-head")).toBeNull();
  });

  it("resets every column's width from the table's menu, right before Remove metadata, the rest of the metadata kept", async () => {
    await setup(`${PAGE}| <meta width.name="180" width.qty="90" sort.qty="desc"> |
`, { "silverware.table.metadata": true });
    tableMenuItem(/^Edit markdown$/);
    const labels = Array.from(document.querySelectorAll(".swt-menu .swt-menu-item")).map((e) => e.textContent);
    expect(labels.slice(-2)).toEqual(["Reset column widths", "Remove metadata"]);
    tableMenuItem(/^Reset column widths$/)!.click();
    await flush();
    expect(text).toBe(`${PAGE}| <meta sort.qty="desc"> |
`);
    await controller.scan();
    expect(cell(0, 0).style.width).toBe("");
    expect(cell(0, 1).style.width).toBe("");
    // None set: not offered
    expect(tableMenuItem(/^Reset column widths$/)).toBeUndefined();
  });

  it("resets widths held for the view only", async () => {
    await setup(PAGE);
    expect(tableMenuItem(/^Reset column widths$/)).toBeUndefined();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    drag(1, 80, [40]);
    await flush();
    tableMenuItem(/^Reset column widths$/)!.click();
    await flush();
    expect(text).toBe(PAGE);
    expect(cell(0, 1).style.width).toBe("");
    await controller.scan();
    expect(cell(0, 1).style.width).toBe("");
  });

  it("reads no style of columns without a width (between the writes of a view, every read makes the browser compute the table again)", async () => {
    const read = vi.spyOn(window, "getComputedStyle");
    await setup(`${PAGE}| <meta width.qty="90"> |\n`, { "silverware.table.metadata": true });
    const header = editor.querySelector("table")!.rows[0]!;
    const of = (column: number) => read.mock.calls.filter(([element]) => element === header.cells[column]).length;
    expect(of(0)).toBe(0);
    expect(of(1)).toBeGreaterThan(0);
    expect(cell(1, 1).style.width).toBe("90px");
    read.mockRestore();
  });

  it("holds a width for the view only without the metadata setting", async () => {
    await setup(PAGE);
    drag(1, 80, [40]);
    await flush();
    expect(text).toBe(PAGE);
    expect(cell(0, 1).style.width).toBe("120px");
    // Rendered anew (an edit elsewhere): still so
    await controller.scan();
    expect(cell(0, 1).style.width).toBe("120px");
  });

  it("keeps a press on the edge from selecting or editing the header, and a stored width with its column when it moves", async () => {
    await setup(`| Name | Qty |\n|---|---|\n| Pear | 3 |\n| <meta width.qty="90"> |\n`, { "silverware.table.metadata": true });
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail: 1 });
    Object.defineProperty(cell(0, 1), "getBoundingClientRect", { configurable: true, value: () => new DOMRect(0, 0, 90, 30) });
    handle(1).dispatchEvent(down);
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(down.defaultPrevented).toBe(true);
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    // The column renamed and moved in one edit (as the column menu would): the width goes with it (metadataAfterEdit)
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    await controller.write(widget, (t) => ({ ...t, rows: t.rows.map((r) => ({ ...r, cells: [r.cells[1]!, r.cells[0]!] })) }), {
      columnMap: (c) => (c === 0 ? 1 : 0),
    });
    await controller.scan();
    expect(text).toContain('<meta width.qty="90">');
    expect(cell(0, 0).style.width).toBe("90px");
  });
});
