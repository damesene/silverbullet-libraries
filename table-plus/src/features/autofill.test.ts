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
  const rows = () => text.split("\n").slice(2, 7);

  it("shows the fill handle at the selection's corner, and fills down what is dragged over", async () => {
    await setup(PAGE);
    select({ row: 1, column: 0 }, { row: 2, column: 1 });
    expect(handle().classList.contains("tp-visible")).toBe(true);
    // The corner of B2 (row 2 at y 40–60, column 1 at x 100–200)
    expect([handle().style.left, handle().style.top]).toEqual(["196px", "56px"]);
    pointer(handle(), "pointerdown", 199, 59);
    // Over row 4 (y 80–100): the last value by the pointer, the cells outlined
    pointer(window, "pointermove", 150, 90);
    expect(document.querySelector(".tp-fill-tip")!.textContent).toBe("4");
    expect(document.querySelector(".tp-fill-outline")!.classList.contains("tp-visible")).toBe(true);
    pointer(window, "pointerup", 150, 90);
    await flush();
    await controller.scan();
    expect(rows()).toEqual(["| 1 | Mon | a |", "| 2 | Tue | b |", "| 3 | Wed | |", "| 4 | Thu | |", "| | | |"]);
    // The cells filled are selected with the ones they came from
    expect(editor.querySelectorAll(".tp-selected").length).toBe(8);
  });

  it("fills right, repeats what fits no series, and cancels with Esc", async () => {
    await setup(PAGE);
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    pointer(handle(), "pointerdown", 99, 39);
    pointer(window, "pointermove", 250, 30);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    pointer(window, "pointerup", 250, 30);
    await flush();
    expect(rows()[0]).toBe("| 1 | Mon | a |");
    // A single number repeats, as in a spreadsheet
    pointer(handle(), "pointerdown", 99, 39);
    pointer(window, "pointermove", 250, 30);
    pointer(window, "pointerup", 250, 30);
    await flush();
    expect(rows()[0]).toBe("| 1 | 1 | 1 |");
  });

  it("fills down as far as the column beside has values on a double click", async () => {
    await setup("| N | Day |\n|---|---|\n| 1 | Mon |\n| 2 | |\n| 3 | |\n| | |\n");
    select({ row: 1, column: 1 }, { row: 1, column: 1 });
    handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    await flush();
    expect(text).toBe("| N | Day |\n|---|---|\n| 1 | Mon |\n| 2 | Tue |\n| 3 | Wed |\n| | |\n");
  });

  it("copies a formula with its references moved", async () => {
    await setup("| N | Twice |\n|---|---|\n| 1 | 2 <meta f=\"=A1*2\"> |\n| 5 | |\n| 7 | |\n", { "tablePlus.metadata": true });
    select({ row: 1, column: 1 }, { row: 1, column: 1 });
    pointer(handle(), "pointerdown", 199, 39);
    pointer(window, "pointermove", 150, 70);
    pointer(window, "pointerup", 150, 70);
    await flush();
    expect(text).toBe('| N | Twice |\n|---|---|\n| 1 | 2 <meta f="=A1*2"> |\n| 5 | 10 <meta f="=A2*2"> |\n| 7 | 14 <meta f="=A3*2"> |\n');
  });

  it("does not show while a cell is edited, nor on a sorted table", async () => {
    await setup(PAGE);
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    expect(handle().classList.contains("tp-visible")).toBe(true);
    clickOn(cell(1, 2));
    expect(handle().classList.contains("tp-visible")).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    expect(handle().classList.contains("tp-visible")).toBe(false);
  });
});
