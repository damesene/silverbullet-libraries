// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { bodyTexts, buttonLabel, cell, clickOn, controller, editor, flush, key, menuButtons, PAGE, setup, text, useTablePage } from "../testing/page.ts";

describe("Row and column grips", () => {
  useTablePage();

  const openMenu = (row: number, axis: "row" | "column", column = 0) => {
    // A menu still open would be closed by the next grip click instead
    if (document.querySelector(".swt-menu")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    cell(row, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(axis === "row" ? ".swt-grip:not(.swt-grip-column)" : ".swt-grip-column")!;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    return document.querySelector(".swt-menu")!;
  };
  const item = (menu: Element, label: string) =>
    menuButtons(menu).find((b) => buttonLabel(b) === label)!;

  it("keeps the grips with the edited cell, also while the pointer is over other cells", async () => {
    await setup(PAGE);
    const shown = () => document.querySelectorAll(".swt-grip.swt-visible").length;
    // A tap on a touch screen: no hover first
    clickOn(cell(2, 1));
    expect(editor.querySelector(".swt-cell-editor")).not.toBeNull();
    expect(shown()).toBe(2);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(shown()).toBe(2);
    // The row grip opens the edited cell's row menu
    const grip = document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Row 2");
  });

  it("closes a grip's menu when the cells selected change otherwise (a touch's handles, keys)", async () => {
    await setup(PAGE);
    const menu = openMenu(1, "row");
    expect(menu.isConnected).toBe(true);
    expect(editor.querySelectorAll(".swt-selected").length).toBe(2);
    controller.selectCells(controller.infoOf(editor.querySelector(".sb-table-widget")!)!, { row: 1, column: 0 }, { row: 2, column: 1 });
    expect(document.querySelector(".swt-menu")).toBeNull();
  });

  it("in select mode selects with a grip's first click and opens its menu with the second; a right click opens it at once", async () => {
    localStorage.removeItem("silverware.table.editMode");
    await setup(PAGE);
    const grip = () => document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;
    const click = () => {
      grip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    };
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(grip().classList.contains("swt-line-selected")).toBe(false);
    click();
    expect(editor.querySelectorAll(".swt-selected").length).toBe(2);
    expect(document.querySelector(".swt-menu")).toBeNull();
    // Selected: its grip says a click opens the menu (the context-menu pointer)
    expect(grip().classList.contains("swt-line-selected")).toBe(true);
    click();
    expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Row 2");
    // Again: closed
    click();
    expect(document.querySelector(".swt-menu")).toBeNull();
    // Another row's grip, right-clicked: selected and its menu open at once
    cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    grip().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Row 3");
    expect(editor.querySelectorAll(".swt-selected").length).toBe(2);
  });

  it("gives a right click on a cell of rows (columns) selected whole their menu, not the cell's", async () => {
    await setup(PAGE);
    const info = controller.infoOf(editor.querySelector<HTMLElement>(".sb-table-widget")!)!;
    const rightClick = (target: Element) => {
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2, pointerType: "mouse" }));
      target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    };
    const title = () => document.querySelector(".swt-menu-title")!.textContent;
    // The Qty column, its header and every row
    controller.selectCells(info, { row: 0, column: 1 }, { row: 3, column: 1 });
    rightClick(cell(2, 1));
    expect(title()).toBe("Column: Qty");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // Two whole rows
    controller.selectCells(info, { row: 1, column: 0 }, { row: 2, column: 1 });
    rightClick(cell(2, 0));
    expect(title()).toBe("Row 2");
    expect(menuButtons().map((b) => buttonLabel(b))).toContain("Delete 2 rows");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // A cell outside them: the cell's menu, as before
    rightClick(cell(3, 0));
    expect(title()).toBe("Cell: Name, row 3");
  });

  it("keeps a grip's menu a press opened (Ctrl+click on a Mac, a held finger) open when the press ends or the finger moves a little", async () => {
    localStorage.removeItem("silverware.table.editMode");
    await setup(PAGE);
    const grip = () => document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    // Ctrl+click: a left press, the context menu, the press's end
    grip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    grip().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Row 2");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // A finger held on the grip: the menu, kept as the finger moves 6 px lifting
    vi.useFakeTimers();
    cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    grip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch", clientX: 5, clientY: 50 }));
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "touch", clientX: 5, clientY: 56 }));
    vi.advanceTimersByTime(600);
    expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Row 3");
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "touch", clientX: 5, clientY: 62 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "touch" }));
    expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Row 3");
    vi.useRealTimers();
  });

  it("runs no item of the menu a tap opened, under the finger, with the tap's click", async () => {
    localStorage.removeItem("silverware.table.editMode");
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void (copied = t) } });
    try {
      await setup(PAGE);
      const grip = () => document.querySelector<HTMLElement>(".swt-grip-column")!;
      const tap = () => {
        grip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch" }));
        window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "touch" }));
      };
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      tap();
      tap();
      const first = menuButtons().find((b) => buttonLabel(b) === "Copy column")!;
      // The click the browser fires after the second tap, where the finger was: an item of the menu now
      const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
      first.dispatchEvent(click);
      // Checked now: later jsdom, which lays nothing out, takes the table for scrolled out of view (its menu closes)
      expect(document.querySelector(".swt-menu")).not.toBeNull();
      await flush();
      expect(copied).toBe("");
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it("tints what a hovered grip acts on, and selects it when clicked", async () => {
    await setup(PAGE);
    const tinted = () => Array.from(editor.querySelectorAll(".swt-handle-hover"));
    cell(2, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const rowGrip = document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;
    rowGrip.dispatchEvent(new PointerEvent("pointerenter"));
    expect(tinted()).toEqual([cell(2, 0), cell(2, 1)]);
    rowGrip.dispatchEvent(new PointerEvent("pointerleave"));
    expect(tinted()).toEqual([]);
    // A click: the row selected, its menu open
    openMenu(2, "row");
    expect(Array.from(editor.querySelectorAll(".swt-selected"))).toEqual([cell(2, 0), cell(2, 1)]);
    // The column: its header and its cells
    openMenu(1, "column", 1);
    expect(Array.from(editor.querySelectorAll(".swt-selected"))).toEqual([cell(0, 1), cell(1, 1), cell(2, 1), cell(3, 1)]);
  });

  it("extends the selection with Shift+click on a grip, and deletes the rows selected", async () => {
    const PINNED = "| A | B |\n|---|---|\n| 1 | a |\n| 2 | b |\n| 3 | c |\n| 4 | d |\n| <meta pin-bottom=\"1\"> |\n";
    await setup(PINNED);
    openMenu(1, "row");
    // With the first row's menu open, the grip follows the pointer: Shift+click on the third row's, rows 1 to 3
    cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;
    expect(grip.classList.contains("swt-active")).toBe(false);
    expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Row 1");
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, shiftKey: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    // Rows 1 to 3 selected at once: no menu, nothing to pick with the pointer
    expect(editor.querySelectorAll(".swt-selected").length).toBe(6);
    expect(document.querySelector(".swt-menu")).toBeNull();
    cell(2, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(editor.querySelectorAll(".swt-selected").length).toBe(6);
    // Shift+click on the second row's: from the first again, rows 1 and 2
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, shiftKey: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    expect(editor.querySelectorAll(".swt-selected").length).toBe(4);
    cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, shiftKey: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    expect(editor.querySelectorAll(".swt-selected").length).toBe(6);
    item(openMenu(2, "row"), "Delete 3 rows").click();
    await flush();
    // The row pinned to the bottom stays pinned
    expect(text).toBe("| A | B |\n|---|---|\n| 4 | d |\n| <meta pin-bottom=\"1\"> |\n");
  });

  it("has no item to select rows (columns): Shift+click on a grip selects columns between too", async () => {
    await setup(PAGE);
    const selected = () => Array.from(editor.querySelectorAll(".swt-selected"));
    const labels = Array.from(openMenu(1, "row").querySelectorAll(".swt-menu-item")).map((b) => b.textContent);
    expect(labels.some((l) => /^Select/.test(l ?? ""))).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // The first column's grip, then Shift+click on the second's: both columns, header and rows
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".swt-grip-column")!;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    // With its menu open the grip follows the pointer
    cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, shiftKey: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    expect(selected().length).toBe(8);
  });

  it("deletes whole rows (columns) with a second Delete, once they are empty", async () => {
    await setup("| A | B | C |\n|---|---|---|\n| 1 | a | x |\n| 2 | b | y |\n");
    openMenu(1, "row");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    key(editor, "Delete");
    await flush();
    expect(text).toBe("| A | B | C |\n|---|---|---|\n| | | |\n| 2 | b | y |\n");
    await controller.scan();
    key(editor, "Delete");
    await flush();
    expect(text).toBe("| A | B | C |\n|---|---|---|\n| 2 | b | y |\n");
    // A column: its cells emptied, then the column deleted (its header name does not count)
    await controller.scan();
    openMenu(1, "column", 2);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    key(editor, "Delete");
    await flush();
    expect(text).toBe("| A | B | C |\n|---|---|---|\n| 2 | b | |\n");
    await controller.scan();
    key(editor, "Delete");
    await flush();
    expect(text).toBe("| A | B |\n|---|---|\n| 2 | b |\n");
  });

  it("asks once before deleting columns that hold names", async () => {
    const NAMED = '| Name | Price | Note |\n|---|---|---|\n| <meta n="pear"> | | a |\n| | <meta cn="fig_price"> | b |\n';
    await setup(NAMED);
    const questions: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      questions.push(message);
      return true;
    };
    openMenu(1, "column", 0);
    openMenu(1, "column", 1);
    // openMenu(…) clicks without Shift: extend by hand
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    controller.selectCells(controller.infoOf(editor.querySelector(".sb-table-widget")!)!, { row: 0, column: 0 }, { row: 2, column: 1 });
    key(editor, "Delete");
    await flush();
    expect(questions).toEqual([
      "Deleting these columns also removes the name of the row pear: formulas that use it show #REF! or #NAME?, and the name of the cell fig_price: formulas that use it show #REF! or #NAME?. Delete the 2 columns? Ctrl+Z brings it back.",
    ]);
    expect(text).toBe("| Note |\n|---|\n| a |\n| b |\n");
  });

  it("offers pinning only with the metadata setting", async () => {
    await setup(PAGE);
    await flush();
    const pin = item(openMenu(1, "row"), "Pin to top");
    expect(pin.getAttribute("aria-disabled")).toBe("true");
    pin.click();
    await flush();
    expect(text).toBe(PAGE);

    // a table with metadata: nothing new can be pinned, but unpinning works
    controller.stop();
    document.body.replaceChildren();
    await setup('| A |\n|---|\n| 1 |\n| 2 |\n| <meta pin-top="1"> |\n');
    await flush();
    expect(item(openMenu(2, "row"), "Pin to bottom").getAttribute("aria-disabled")).toBe("true");
    const unpin = item(openMenu(1, "row"), "Unpin from the top");
    expect(unpin.getAttribute("aria-disabled")).toBeNull();
    unpin.click();
    await flush();
    expect(text).toBe("| A |\n|---|\n| 1 |\n| 2 |\n");
  });

  it("moves a pinned row to the edge and keeps it there", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    await flush();
    item(openMenu(1, "row"), "Pin to bottom").click(); // Pear
    await flush();
    await controller.scan();
    expect(text).toBe('Intro\n\n| Name | Qty |\n|---|---|\n| apple | 10 |\n| Fig | 2 |\n| Pear | 3 |\n| <meta pin-bottom="1"> |\n');
    expect(editor.querySelector("tfoot")?.textContent).toContain("Pear");

    // a row added at the end goes above it
    clickOn(cell(2, 1)); // Fig's Qty, the last unpinned row
    key(editor.querySelector(".swt-cell-editor")!, "Enter", { ctrlKey: true });
    await flush();
    await controller.scan();
    expect(text.split("\n").slice(4, 9)).toEqual(["| apple | 10 |", "| Fig | 2 |", "| | |", "| Pear | 3 |", '| <meta pin-bottom="1"> |']);

    // sorting leaves it at the bottom
    key(editor.querySelector(".swt-cell-editor")!, "Escape");
    await flush();
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    clickOn(cell(0, 0).querySelector(".swt-sort")!); // Name descending
    expect(bodyTexts()).toEqual(["Fig", "apple", "", "Pear"]);
  });

  it("disables inserting outside the pinned edges", async () => {
    await setup('| A | B |\n|---|---|\n| top | 1 |\n| mid | 2 |\n| end | 3 |\n| <meta pin-top="1" pin-bottom="1" pin-left="1"> |\n', {
      "silverware.table.metadata": true,
    });
    await flush();
    const blocked = (menu: Element, label: string) => item(menu, label).getAttribute("aria-disabled") === "true";
    let menu = openMenu(1, "row"); // "top", pinned to the top
    expect([blocked(menu, "Insert row above"), blocked(menu, "Insert row below")]).toEqual([true, false]);
    menu = openMenu(4, "row"); // "end", pinned to the bottom (in the footer, after the hidden metadata row)
    expect([blocked(menu, "Insert row above"), blocked(menu, "Insert row below")]).toEqual([false, true]);
    menu = openMenu(2, "column", 0); // A, pinned left
    expect([blocked(menu, "Insert column left"), blocked(menu, "Insert column right")]).toEqual([true, false]);
    menu = openMenu(2, "column", 1); // B, not pinned
    expect([blocked(menu, "Insert column left"), blocked(menu, "Insert column right")]).toEqual([false, false]);
  });

  it("pins a column to the left", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    await flush();
    item(openMenu(1, "column", 1), "Pin left").click(); // Qty
    await flush();
    await controller.scan();
    expect(text).toBe('Intro\n\n| Qty | Name |\n|---|---|\n| 3 | Pear |\n| 10 | apple |\n| 2 | Fig |\n| <meta pin-left="1"> |\n');
    expect(cell(1, 0).classList.contains("swt-pin-left")).toBe(true);
  });

  it("opens a row menu from the row grip and runs its actions", async () => {
    await setup(PAGE);
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;
    expect(grip.classList.contains("swt-visible")).toBe(true);
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    const menu = document.querySelector(".swt-menu")!;
    expect(menu.querySelector(".swt-menu-title")?.textContent).toBe("Row 2");
    const item = menuButtons(menu).find(
      (b) => buttonLabel(b) === "Duplicate row",
    )!;
    item.click();
    await flush();
    expect(text).toBe(
      "Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| apple | 10 |\n| Fig | 2 |\n",
    );
    expect(document.querySelector(".swt-menu")).toBeNull();
  });

  it("blocks moving rows while sorted", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    const moveUp = menuButtons().find(
      (b) => buttonLabel(b) === "Move up",
    )!;
    expect(moveUp.getAttribute("aria-disabled")).toBe("true");
    moveUp.click();
    await flush();
    expect(text).toBe(PAGE);
  });

  describe("moving the rows (columns) selected together", () => {
    const LETTERS = "| N | M |\n|---|---|\n| a | 1 |\n| b | 2 |\n| c | 3 |\n| d | 4 |\n";
    const body = () => text.split("\n").slice(2, 6);
    const info = () => controller.infoOf(editor.querySelector<HTMLElement>(".sb-table-widget")!)!;
    const rowGrip = () => document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;

    it("moves them from the grip's menu", async () => {
      await setup(LETTERS);
      controller.selectCells(info(), { row: 1, column: 0 }, { row: 2, column: 1 });
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      rowGrip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      const item = menuButtons().find((b) => buttonLabel(b) === "Move 2 rows down")!;
      expect(item.getAttribute("aria-disabled")).toBeNull();
      item.click();
      await flush();
      expect(body()).toEqual(["| c | 3 |", "| a | 1 |", "| b | 2 |", "| d | 4 |"]);
      // They stay selected where they went
      await controller.scan();
      expect(Array.from(editor.querySelectorAll(".swt-selected")).map((td) => td.textContent!.trim())).toEqual(["a", "1", "b", "2"]);
    });

    it("moves columns too, and a block across pinned and unpinned rows moves the grip's row alone", async () => {
      await setup(LETTERS + '| <meta pin-bottom="1"> |\n', { "silverware.table.metadata": true });
      const columnGrip = () => document.querySelector<HTMLElement>(".swt-grip-column")!;
      const last = Number(controller.shownRows(info()).at(-1)!.dataset.swtRow);
      controller.selectCells(info(), { row: 0, column: 0 }, { row: last, column: 1 });
      cell(0, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      columnGrip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      // Both columns: none to move them past
      const right = menuButtons().find((b) => buttonLabel(b) === "Move 2 columns right")!;
      expect(right.getAttribute("aria-disabled")).toBe("true");
      key(document.querySelector(".swt-menu")!, "Escape");
      // Rows c and d (d pinned to the bottom): the grip's row alone
      controller.selectCells(info(), { row: 3, column: 0 }, { row: 4, column: 1 });
      cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      rowGrip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      const labels = menuButtons().map((b) => buttonLabel(b));
      expect(labels).toContain("Move up");
      expect(labels).not.toContain("Move 2 rows up");
    });

    // a and b 20 px high, c and d 100 px: the header 0..20, a 20..40, b 40..60, c 60..160, d 160..260
    const unevenRows = () => {
      const tops = [0, 20, 40, 60, 160];
      const heights = [20, 20, 20, 100, 100];
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        const rect = (left: number, top: number, width: number, height: number) =>
          ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
        const row = this instanceof HTMLTableCellElement ? (this.parentElement as HTMLTableRowElement).rowIndex : this instanceof HTMLTableRowElement ? this.rowIndex : -1;
        if (row >= 0) return rect(this instanceof HTMLTableCellElement ? this.cellIndex * 100 : 0, tops[row]!, this instanceof HTMLTableCellElement ? 100 : 200, heights[row]!);
        return rect(0, 0, 200, 260);
      });
    };
    // a and b selected, dragged by a's grip (pressed at y 30) to y
    const dragBlock = (y: number) => {
      controller.selectCells(info(), { row: 1, column: 0 }, { row: 2, column: 1 });
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      rowGrip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 5, clientY: 30 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 5, clientY: 40 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 5, clientY: y }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    };

    it("keeps a block dragged short of the middle of a taller row after it", async () => {
      await setup(LETTERS);
      unevenRows();
      // 40 px down: the block's end (100) is not past c's middle (110), so it stays
      dragBlock(70);
      await flush();
      expect(body()).toEqual(["| a | 1 |", "| b | 2 |", "| c | 3 |", "| d | 4 |"]);
    });

    it("drops a block below a taller row once its end is past that row's middle", async () => {
      await setup(LETTERS);
      unevenRows();
      // 60 px down: its end (120) past c's middle: below c
      dragBlock(90);
      await vi.waitFor(() => expect(body()).toEqual(["| c | 3 |", "| a | 1 |", "| b | 2 |", "| d | 4 |"]), { timeout: 3000 });
    });

    it("drags them by the grip of one of them", async () => {
      await setup(LETTERS);
      // Rows 20 px high, the header at 0
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        const rect = (left: number, top: number, width: number, height: number) =>
          ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
        if (this instanceof HTMLTableCellElement) return rect(this.cellIndex * 100, (this.parentElement as HTMLTableRowElement).rowIndex * 20, 100, 20);
        if (this instanceof HTMLTableRowElement) return rect(0, this.rowIndex * 20, 200, 20);
        return rect(0, 0, 200, 100);
      });
      try {
        controller.selectCells(info(), { row: 1, column: 0 }, { row: 2, column: 1 });
        cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        rowGrip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 5, clientY: 50 }));
        // Pressed on b's grip (y 50: 30 px into the block), moved one row (20 px) down: the block one row down
        window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 5, clientY: 58 }));
        window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 5, clientY: 70 }));
        window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 5, clientY: 70 }));
        await flush();
        expect(body()).toEqual(["| c | 3 |", "| a | 1 |", "| b | 2 |", "| d | 4 |"]);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
