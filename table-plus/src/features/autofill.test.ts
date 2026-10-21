// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cell, clickOn, controller, editor, flush, setup, text, useTablePage } from "../testing/page.ts";

describe("AutoFill", () => {
  useTablePage();

  // Cells 100×20 px in a grid: column c at x = 100c, row r (header 0) at y = 20r
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const rect = (left: number, top: number, width: number, height: number) =>
        ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
      if (this instanceof HTMLTableCellElement) {
        const row = (this.parentElement as HTMLTableRowElement).rowIndex;
        return rect(this.cellIndex * 100, row * 20, 100, 20);
      }
      if (this instanceof HTMLTableRowElement) return rect(0, this.rowIndex * 20, 1000, 20);
      if (this instanceof HTMLTableElement || this.classList.contains("sb-table-widget")) return rect(0, 0, 1000, 1000);
      return rect(0, 0, 0, 0);
    });
  });

  const PAGE = [
    "| N | Day | Note |",
    "|---|---|---|",
    "| 1 | Mon | a |",
    "| 2 | Tue | b |",
    "| | | |",
    "| | | |",
    "| | | |",
    "",
  ].join("\n");
  const widget = () => editor.querySelector<HTMLElement>(".sb-table-widget")!;
  const select = (anchor: { row: number; column: number }, focus: { row: number; column: number }) =>
    controller.selectCells(controller.infoOf(widget())!, anchor, focus);
  const handle = () => document.querySelector<HTMLElement>(".tp-fill-handle")!;
  const pointer = (target: EventTarget, type: string, x: number, y: number) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
  // A press on the handle with the mouse (detail 2: a double click's second)
  const press = (detail = 1) => handle().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail }));
  const rows = () => text.split("\n").slice(2, 7);

  it("shows the fill handle at the selection's corner, and fills down what is dragged over", async () => {
    await setup(PAGE);
    select({ row: 1, column: 0 }, { row: 2, column: 1 });
    // In the selection's last cell, B2
    expect(handle().parentElement).toBe(cell(2, 1));
    press();
    // Over row 4 (y 80–100): the last value by the pointer, the cells outlined, the handle in their last one
    pointer(window, "pointermove", 150, 90);
    expect(document.querySelector(".tp-fill-tip")!.textContent).toBe("4");
    expect(handle().parentElement).toBe(cell(4, 1));
    const edges = (r: number, c: number) => Array.from(cell(r, c).querySelector(".tp-fill-edge")?.classList ?? []).filter((n) => /^tp-fill-(top|bottom|left|right)$/.test(n));
    expect(edges(1, 0)).toEqual(["tp-fill-top", "tp-fill-left"]);
    expect(edges(3, 1)).toEqual(["tp-fill-right"]);
    expect(edges(4, 1)).toEqual(["tp-fill-bottom", "tp-fill-right"]);
    expect(document.querySelectorAll(".tp-fill-edge").length).toBe(8);
    pointer(window, "pointerup", 150, 90);
    expect(document.querySelectorAll(".tp-fill-edge").length).toBe(0);
    await flush();
    await controller.scan();
    expect(rows()).toEqual(["| 1 | Mon | a |", "| 2 | Tue | b |", "| 3 | Wed | |", "| 4 | Thu | |", "| | | |"]);
    // The cells filled are selected with the ones they came from
    expect(editor.querySelectorAll(".tp-selected").length).toBe(8);
  });

  it("fills right, repeats what fits no series, and cancels with Esc", async () => {
    await setup(PAGE);
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    press();
    pointer(window, "pointermove", 250, 30);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    pointer(window, "pointerup", 250, 30);
    await flush();
    expect(rows()[0]).toBe("| 1 | Mon | a |");
    // Back in the cell selected
    expect(handle().parentElement).toBe(cell(1, 0));
    // A single number repeats, as in a spreadsheet (a touch: its pointer)
    handle().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerType: "touch" }));
    pointer(window, "pointermove", 250, 30);
    pointer(window, "pointerup", 250, 30);
    await flush();
    expect(rows()[0]).toBe("| 1 | 1 | 1 |");
  });

  it("fills down as far as the column beside has values on a double click", async () => {
    await setup("| N | Day |\n|---|---|\n| 1 | Mon |\n| 2 | |\n| 3 | |\n| | |\n");
    select({ row: 1, column: 1 }, { row: 1, column: 1 });
    press(1);
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    press(2);
    await flush();
    expect(text).toBe("| N | Day |\n|---|---|\n| 1 | Mon |\n| 2 | Tue |\n| 3 | Wed |\n| | |\n");
  });

  it("copies a formula with its references moved", async () => {
    await setup("| N | Twice |\n|---|---|\n| 1 | 2 <meta f=\"=A1*2\"> |\n| 5 | |\n| 7 | |\n", { "tablePlus.metadata": true });
    select({ row: 1, column: 1 }, { row: 1, column: 1 });
    press();
    pointer(window, "pointermove", 150, 70);
    pointer(window, "pointerup", 150, 70);
    await flush();
    expect(text).toBe('| N | Twice |\n|---|---|\n| 1 | 2 <meta f="=A1*2"> |\n| 5 | 10 <meta f="=A2*2"> |\n| 7 | 14 <meta f="=A3*2"> |\n');
  });

  it("stops before pinned rows, ends a drag taken away without filling, and fills down to the end without a value beside", async () => {
    await setup('| N | Day |\n|---|---|\n| 1 | Mon |\n| 2 | |\n| 3 | |\n| Total | x |\n| <meta pin-bottom="1"> |\n', { "tablePlus.metadata": true });
    select({ row: 1, column: 1 }, { row: 1, column: 1 });
    // Dragged over the total row (row 4, y 80–100): the fill stops before it
    press();
    pointer(window, "pointermove", 150, 90);
    expect(document.querySelector(".tp-fill-tip")!.textContent).toBe("Wed");
    // The pointer taken away: nothing filled
    window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    pointer(window, "pointerup", 150, 90);
    await flush();
    expect(text).toContain("| 2 | |");
    // A double click on the last row of its zone: nothing to fill, no error
    select({ row: 3, column: 0 }, { row: 3, column: 0 });
    press(2);
    await flush();
    expect(text).toContain("| 3 | |");
  });

  it("does not show while a cell is edited, nor on a sorted table", async () => {
    await setup(PAGE);
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    expect(handle()).not.toBeNull();
    clickOn(cell(1, 2));
    await flush();
    expect(handle()).toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    await flush();
    expect(handle()).toBeNull();
  });
});
