// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { bodyTexts, buttonLabel, cell, cellMenuItem, clickOn, controller, editor, flush, key, PAGE, press, setup, text, useTablePage } from "../testing/page.ts";

describe("Cell menu", () => {
  useTablePage();

  const menu = () => document.querySelector<HTMLElement>(".tp-menu");
  // Items, the buttons of bars (by their full names) and separators (—), in order
  const entries = () =>
    Array.from(menu()?.querySelectorAll(".tp-menu-item, .tp-action, .tp-segment, .tp-menu-separator") ?? []).map((e) =>
      e.classList.contains("tp-menu-separator") ? "—" : e.classList.contains("tp-menu-item") ? e.textContent : buttonLabel(e),
    );
  const rightClick = (target: Element, init: MouseEventInit = {}) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const drag = (from: Element, to: Element) => {
    press(from, "mousedown");
    to.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
  };

  it("opens on a right click: the clipboard's bar first, then clearing and moving, a function, filtering, naming", async () => {
    await setup(PAGE, { "tablePlus.metadata": true });
    clickOn(cell(2, 0));
    editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = "apples";
    expect(rightClick(cell(1, 1)).defaultPrevented).toBe(true);
    // The cell is selected, not edited; the cell edited before is saved
    expect(Array.from(editor.querySelectorAll(".tp-selected"))).toEqual([cell(1, 1)]);
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    await flush();
    expect(text).toContain("| apples | 10 |");
    await controller.scan();
    rightClick(cell(1, 1));
    expect(menu()!.querySelector(".tp-menu-title")!.textContent).toBe("Cell: Qty, row 1");
    expect(entries()).toEqual([
      ...["Copy", "Cut", "Paste", "Paste as new rows", "—"],
      ...["Clear", "Move to…", "—", "Insert function…", "—", "AutoFill to…", "—", "Filter: = 3", "Filter: ≠ 3"],
    ]);
    // Named by the pencil in its title
    expect(menu()!.querySelector(".tp-menu-rename")!.getAttribute("aria-label")).toMatch(/^Name this cell/);
    // A header: its column's menu, the column selected as its grip selects it
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    rightClick(cell(0, 1));
    expect(menu()!.querySelector(".tp-menu-title")!.textContent).toBe("Column: Qty");
    expect(menu()!.querySelector('.tp-menu-segmented[aria-label="Sort"], .tp-segments[aria-label="Sort"]')).not.toBeNull();
    expect(menu()!.querySelector(".tp-menu-rename")!.getAttribute("aria-label")).toMatch(/^Name this column/);
    expect(editor.querySelectorAll(".tp-selected").length).toBe(4);
    // Cells selected with the header among them: the selection's menu
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    drag(cell(0, 0), cell(1, 0));
    await flush();
    rightClick(cell(0, 0));
    expect(menu()!.querySelector(".tp-menu-title")!.textContent).toBe("2 cells");
  });

  it("gives a header's column menu once a cell being edited is saved, the table rendered anew", async () => {
    await setup(PAGE);
    // No frames: jsdom has no layout, so following the page's scroll after the write would take the table as out of view
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    clickOn(cell(2, 0));
    editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = "apples";
    // The pointer over the header, as a right click there has it
    cell(0, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    rightClick(cell(0, 1));
    expect(menu()?.querySelector(".tp-menu-title")?.textContent).toBe("Column: Qty");
    // The edit written, the table rendered anew (the harness enhances it when scanned; SilverBullet's as it renders)
    await vi.waitFor(() => expect(text).toContain("| apples | 10 |"));
    await controller.scan();
    // The menu is there, for the table as it is now
    expect(menu()?.querySelector(".tp-menu-title")?.textContent).toBe("Column: Qty");
    expect(cell(0, 1).isConnected).toBe(true);
  });

  it("filters by a cell's value, adding to the column's list; and leaves it out with ≠", async () => {
    await setup(PAGE);
    cellMenuItem(cell(1, 1), /^Filter: = 3$/)!.click();
    expect(bodyTexts()).toEqual(["Pear"]);
    expect(menu()).toBeNull();
    // Another value of the column: the list grows
    const rows = () => Array.from(editor.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]"));
    cellMenuItem(rows().find((tr) => tr.cells[0]!.textContent === "Fig")!.cells[1]!, /^Filter: = 2$/)!.click();
    expect(bodyTexts()).toEqual(["Pear", "Fig"]);
    cellMenuItem(cell(1, 1), /^Filter: ≠ 3$/)!.click();
    expect(bodyTexts()).toEqual(["apple", "Fig"]);
  });

  it("copies and clears the cells selected, a right click elsewhere ending the selection", async () => {
    await setup(PAGE);
    let copied = "";
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (t: string) => void (copied = t) }, configurable: true });
    drag(cell(1, 1), cell(2, 1));
    await flush();
    rightClick(cell(2, 1));
    expect(menu()!.querySelector(".tp-menu-title")!.textContent).toBe("2 cells");
    expect(entries()).toEqual(["Copy 2 cells", "Cut 2 cells", "Paste", "Paste as new rows", "—", "Clear 2 cells", "Move 2 cells to…", "—", "AutoFill to…", "—", "Filter: = 3, 10", "Filter: ≠ 3, 10", "—", "Delete 2 rows", "Delete column"]);
    cellMenuItem(cell(2, 1), /^Copy 2 cells$/)!.click();
    await flush();
    expect(copied).toBe("3\n10");
    cellMenuItem(cell(1, 1), /^Clear 2 cells$/)!.click();
    await flush();
    expect(text).toContain("| Pear | |\n| apple | |");
    await controller.scan();
    // Outside the selection: that cell's menu, the cell selected instead
    rightClick(cell(3, 0));
    expect(entries()).toContain("Copy");
    expect(Array.from(editor.querySelectorAll(".tp-selected"))).toEqual([cell(3, 0)]);
  });

  it("leaves the browser's menu to the cell editor and to Shift+right click", async () => {
    await setup(PAGE);
    expect(rightClick(cell(1, 0), { shiftKey: true }).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
    clickOn(cell(1, 0));
    expect(rightClick(editor.querySelector(".tp-cell-editor")!).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
    // Shift+F10 in the cell editor opens it
    key(editor.querySelector(".tp-cell-editor")!, "F10", { shiftKey: true });
    expect(menu()!.querySelector(".tp-menu-title")!.textContent).toBe("Cell: Name, row 1");
  });

  it("opens on a long press on a touch screen, which does not edit the cell", async () => {
    await setup(PAGE);
    cell(1, 0).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 5, clientY: 5 }));
    await new Promise((resolve) => setTimeout(resolve, 650));
    expect(menu()!.querySelector(".tp-menu-title")!.textContent).toBe("Cell: Name, row 1");
    // The mouse events after the touch
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
    clickOn(cell(1, 0));
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
  });

  it("keeps a menu's keys its own: arrows go along it, Enter runs its button, the selection under it stays", async () => {
    await setup(PAGE);
    rightClick(cell(1, 1));
    const press = (k: string) => {
      const target = (document.activeElement as HTMLElement | null) ?? menu()!;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    };
    press("ArrowDown");
    // The first button focused (the bar's Copy), the cell still the one selected, no editor
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Copy");
    expect(Array.from(editor.querySelectorAll(".tp-selected"))).toEqual([cell(1, 1)]);
    press("ArrowRight");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cut");
    press("Enter");
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    expect(menu()).not.toBeNull();
  });
});
