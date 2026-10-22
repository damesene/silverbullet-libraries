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
  const handle = () => document.querySelector<HTMLElement>(".swt-fill-handle")!;
  const pointer = (target: EventTarget, type: string, x: number, y: number) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
  // A press on the handle with the mouse (detail 2: a double click's second)
  const press = (detail = 1) => handle().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail }));
  const rows = () => text.split("\n").slice(2, 7);

  it("shows the fill handle at the selection's corner, and fills down what is dragged over", async () => {
    await setup(PAGE);
    // In the table's last row and column: inside the cell (its box would cut what is past its edge)
    select({ row: 5, column: 2 }, { row: 5, column: 2 });
    expect([handle().classList.contains("swt-fill-last-row"), handle().classList.contains("swt-fill-last-column")]).toEqual([true, true]);
    select({ row: 1, column: 0 }, { row: 2, column: 1 });
    // In the selection's last cell, B2, on its corner
    expect(handle().parentElement).toBe(cell(2, 1));
    expect([handle().classList.contains("swt-fill-last-row"), handle().classList.contains("swt-fill-last-column")]).toEqual([false, false]);
    press();
    // Over row 4 (y 80–100): the last value by the pointer, the cells outlined, the handle in their last one
    pointer(window, "pointermove", 150, 90);
    expect(document.querySelector(".swt-fill-tip")!.textContent).toBe("4");
    expect(handle().parentElement).toBe(cell(4, 1));
    const edges = (r: number, c: number) => Array.from(cell(r, c).querySelector(".swt-fill-edge")?.classList ?? []).filter((n) => /^swt-fill-(top|bottom|left|right)$/.test(n));
    expect(edges(1, 0)).toEqual(["swt-fill-top", "swt-fill-left"]);
    expect(edges(3, 1)).toEqual(["swt-fill-right"]);
    expect(edges(4, 1)).toEqual(["swt-fill-bottom", "swt-fill-right"]);
    expect(document.querySelectorAll(".swt-fill-edge").length).toBe(8);
    pointer(window, "pointerup", 150, 90);
    expect(document.querySelectorAll(".swt-fill-edge").length).toBe(0);
    await flush();
    await controller.scan();
    expect(rows()).toEqual(["| 1 | Mon | a |", "| 2 | Tue | b |", "| 3 | Wed | |", "| 4 | Thu | |", "| | | |"]);
    // The cells filled are selected with the ones they came from
    expect(editor.querySelectorAll(".swt-selected").length).toBe(8);
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

  it("fills to the cell clicked after AutoFill to… in the cell menu, also across, and outlines it on hover first", async () => {
    await setup(PAGE);
    const menuItem = (label: string) => Array.from(document.querySelectorAll<HTMLElement>(".swt-menu-item")).find((b) => b.textContent === label);
    // A right click, its pointerdown first as a browser fires it
    const openMenu = (at: Element) => {
      at.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2, pointerType: "mouse" }));
      at.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    };
    select({ row: 1, column: 1 }, { row: 2, column: 1 });
    openMenu(cell(1, 1));
    clickOn(menuItem("AutoFill to…")!);
    // Hovering a cell outlines what a click fills
    cell(5, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(document.querySelectorAll(".swt-fill-edge").length).toBe(5);
    clickOn(cell(5, 1));
    await flush();
    await controller.scan();
    expect(rows().map((r) => r.split("|")[2]!.trim())).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    // Across from one cell; a click in the selection fills nothing, Esc ends picking
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    openMenu(cell(1, 0));
    clickOn(menuItem("AutoFill to…")!);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    clickOn(cell(1, 2));
    await flush();
    expect(rows()[0]).toBe("| 1 | Mon | a |");
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    openMenu(cell(1, 0));
    clickOn(menuItem("AutoFill to…")!);
    clickOn(cell(1, 2));
    await flush();
    expect(rows()[0]).toBe("| 1 | 1 | 1 |");
  });

  it("fills to the cell tapped after AutoFill to…, a touch that moves scrolling with picking going on", async () => {
    await setup(PAGE);
    const touch = (target: EventTarget, type: string, x = 0, y = 0) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerType: "touch", isPrimary: true, clientX: x, clientY: y }));
    select({ row: 1, column: 1 }, { row: 2, column: 1 });
    cell(1, 1).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    clickOn(Array.from(document.querySelectorAll<HTMLElement>(".swt-menu-item")).find((b) => b.textContent === "AutoFill to…")!);
    // A swipe (the page scrolls): nothing filled, still picking
    touch(cell(3, 1), "pointerdown", 150, 70);
    touch(window, "pointermove", 150, 20);
    touch(window, "pointerup", 150, 20);
    expect(widget().classList.contains("swt-fill-picking")).toBe(true);
    // A tap, without the mouse events a browser may leave out after scrolling
    touch(cell(4, 1), "pointerdown", 150, 90);
    touch(window, "pointerup", 150, 90);
    await flush();
    await controller.scan();
    expect(rows().map((r) => r.split("|")[2]!.trim())).toEqual(["Mon", "Tue", "Wed", "Thu", ""]);
    expect(document.querySelector(".swt-fill-picking")).toBeNull();
  });

  it("keeps picking while the same cells show selected again, and lets a press on the header sort, ending it", async () => {
    await setup(PAGE);
    select({ row: 1, column: 1 }, { row: 2, column: 1 });
    cell(1, 1).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2, pointerType: "mouse" }));
    cell(1, 1).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    clickOn(Array.from(document.querySelectorAll<HTMLElement>(".swt-menu-item")).find((b) => b.textContent === "AutoFill to…")!);
    // The table rendered anew shows the same cells selected again
    select({ row: 1, column: 1 }, { row: 2, column: 1 });
    expect(widget().classList.contains("swt-fill-picking")).toBe(true);
    // The header's sort control: picking ends, the click sorts
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    expect(document.querySelector(".swt-fill-picking")).toBeNull();
    expect(controller.rearranged(controller.infoOf(widget())!)).toBe(true);
    expect(text).toBe(PAGE);
  });

  it("copies a formula with its references moved", async () => {
    await setup("| N | Twice |\n|---|---|\n| 1 | 2 <meta f=\"=A1*2\"> |\n| 5 | |\n| 7 | |\n", { "silverware.table.metadata": true });
    select({ row: 1, column: 1 }, { row: 1, column: 1 });
    press();
    pointer(window, "pointermove", 150, 70);
    pointer(window, "pointerup", 150, 70);
    await flush();
    expect(text).toBe('| N | Twice |\n|---|---|\n| 1 | 2 <meta f="=A1*2"> |\n| 5 | 10 <meta f="=A2*2"> |\n| 7 | 14 <meta f="=A3*2"> |\n');
  });

  it("stops before pinned rows, ends a drag taken away without filling, and fills down to the end without a value beside", async () => {
    await setup('| N | Day |\n|---|---|\n| 1 | Mon |\n| 2 | |\n| 3 | |\n| Total | x |\n| <meta pin-bottom="1"> |\n', { "silverware.table.metadata": true });
    select({ row: 1, column: 1 }, { row: 1, column: 1 });
    // Dragged over the total row (row 4, y 80–100): the fill stops before it
    press();
    pointer(window, "pointermove", 150, 90);
    expect(document.querySelector(".swt-fill-tip")!.textContent).toBe("Wed");
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
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    select({ row: 1, column: 0 }, { row: 1, column: 0 });
    await flush();
    expect(handle()).toBeNull();
  });
});
