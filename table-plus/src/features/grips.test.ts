// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PAGE, bodyTexts, cell, clickOn, controller, editor, flush, key, setup, text, useTablePage } from "../testing/page.ts";

describe("Row and column grips", () => {
  useTablePage();

  const openMenu = (row: number, axis: "row" | "column", column = 0) => {
    // A menu still open would be closed by the next grip click instead
    if (document.querySelector(".tp-menu")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    cell(row, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(axis === "row" ? ".tp-grip:not(.tp-grip-column)" : ".tp-grip-column")!;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    return document.querySelector(".tp-menu")!;
  };
  const item = (menu: Element, label: string) =>
    Array.from(menu.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === label)!;

  it("keeps the grips with the edited cell, also while the pointer is over other cells", async () => {
    await setup(PAGE);
    const shown = () => document.querySelectorAll(".tp-grip.tp-visible").length;
    // A tap on a touch screen: no hover first
    clickOn(cell(2, 1));
    expect(editor.querySelector(".tp-cell-editor")).not.toBeNull();
    expect(shown()).toBe(2);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(shown()).toBe(2);
    // The row grip opens the edited cell's row menu
    const grip = document.querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    expect(document.querySelector(".tp-menu-title")!.textContent).toBe("Row 2");
  });

  it("tints what a hovered grip acts on, and selects it when clicked", async () => {
    await setup(PAGE);
    const tinted = () => Array.from(editor.querySelectorAll(".tp-handle-hover"));
    cell(2, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const rowGrip = document.querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!;
    rowGrip.dispatchEvent(new PointerEvent("pointerenter"));
    expect(tinted()).toEqual([cell(2, 0), cell(2, 1)]);
    rowGrip.dispatchEvent(new PointerEvent("pointerleave"));
    expect(tinted()).toEqual([]);
    // A click: the row selected, its menu open
    openMenu(2, "row");
    expect(Array.from(editor.querySelectorAll(".tp-selected"))).toEqual([cell(2, 0), cell(2, 1)]);
    // The column: its header and its cells
    openMenu(1, "column", 1);
    expect(Array.from(editor.querySelectorAll(".tp-selected"))).toEqual([cell(0, 1), cell(1, 1), cell(2, 1), cell(3, 1)]);
  });

  it("extends the selection with Shift+click on a grip, and deletes the rows selected", async () => {
    const PINNED = "| A | B |\n|---|---|\n| 1 | a |\n| 2 | b |\n| 3 | c |\n| 4 | d |\n| <meta pin-bottom=\"1\"> |\n";
    await setup(PINNED);
    openMenu(1, "row");
    // With the first row's menu open, the grip follows the pointer: Shift+click on the third row's, rows 1 to 3
    cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!;
    expect(grip.classList.contains("tp-active")).toBe(false);
    expect(document.querySelector(".tp-menu-title")!.textContent).toBe("Row 1");
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, shiftKey: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    // Rows picked as with Select rows: no menu, the pointer moves the end, a click in the table ends it
    expect(editor.querySelectorAll(".tp-selected").length).toBe(6);
    expect(document.querySelector(".tp-menu")).toBeNull();
    cell(2, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(editor.querySelectorAll(".tp-selected").length).toBe(4);
    clickOn(cell(3, 1));
    expect(editor.querySelectorAll(".tp-selected").length).toBe(6);
    item(openMenu(2, "row"), "Delete 3 rows").click();
    await flush();
    // The row pinned to the bottom stays pinned
    expect(text).toBe("| A | B |\n|---|---|\n| 4 | d |\n| <meta pin-bottom=\"1\"> |\n");
  });

  it("selects rows (columns) from the menu's one to the one under the pointer, until a click", async () => {
    await setup(PAGE);
    const selected = () => Array.from(editor.querySelectorAll(".tp-selected"));
    item(openMenu(1, "row"), "Select rows").click();
    expect(selected()).toEqual([cell(1, 0), cell(1, 1)]);
    // The header is not a row to select: the selection stays
    cell(0, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(selected().length).toBe(2);
    cell(2, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(selected().length).toBe(4);
    // A click in the table ends it there, without editing the cell
    clickOn(cell(3, 1));
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    expect(selected().length).toBe(6);
    cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(selected().length).toBe(6);
    expect(item(openMenu(2, "row"), "Delete 3 rows")).toBeDefined();

    // Columns; Esc keeps just the first
    item(openMenu(1, "column", 0), "Select columns").click();
    cell(2, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(selected().length).toBe(8);
    key(editor, "Escape");
    expect(selected()).toEqual([cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0)]);
    cell(2, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(selected().length).toBe(4);
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
    const unpin = item(openMenu(1, "row"), "Pin to top"); // checked: unpins
    expect(unpin.getAttribute("aria-disabled")).toBeNull();
    unpin.click();
    await flush();
    expect(text).toBe("| A |\n|---|\n| 1 |\n| 2 |\n");
  });

  it("moves a pinned row to the edge and keeps it there", async () => {
    await setup(PAGE, { "tablePlus.metadata": true });
    await flush();
    item(openMenu(1, "row"), "Pin to bottom").click(); // Pear
    await flush();
    await controller.scan();
    expect(text).toBe('Intro\n\n| Name | Qty |\n|---|---|\n| apple | 10 |\n| Fig | 2 |\n| Pear | 3 |\n| <meta pin-bottom="1"> |\n');
    expect(editor.querySelector("tfoot")?.textContent).toContain("Pear");

    // a row added at the end goes above it
    clickOn(cell(2, 1)); // Fig's Qty, the last unpinned row
    key(editor.querySelector(".tp-cell-editor")!, "Enter", { ctrlKey: true });
    await flush();
    await controller.scan();
    expect(text.split("\n").slice(4, 9)).toEqual(["| apple | 10 |", "| Fig | 2 |", "| | |", "| Pear | 3 |", '| <meta pin-bottom="1"> |']);

    // sorting leaves it at the bottom
    key(editor.querySelector(".tp-cell-editor")!, "Escape");
    await flush();
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    clickOn(cell(0, 0).querySelector(".tp-sort")!); // Name descending
    expect(bodyTexts()).toEqual(["Fig", "apple", "", "Pear"]);
  });

  it("disables inserting outside the pinned edges", async () => {
    await setup('| A | B |\n|---|---|\n| top | 1 |\n| mid | 2 |\n| end | 3 |\n| <meta pin-top="1" pin-bottom="1" pin-left="1"> |\n', {
      "tablePlus.metadata": true,
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
    await setup(PAGE, { "tablePlus.metadata": true });
    await flush();
    item(openMenu(1, "column", 1), "Pin left").click(); // Qty
    await flush();
    await controller.scan();
    expect(text).toBe('Intro\n\n| Qty | Name |\n|---|---|\n| 3 | Pear |\n| 10 | apple |\n| 2 | Fig |\n| <meta pin-left="1"> |\n');
    expect(cell(1, 0).classList.contains("tp-pin-left")).toBe(true);
  });

  it("opens a row menu from the row grip and runs its actions", async () => {
    await setup(PAGE);
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!;
    expect(grip.classList.contains("tp-visible")).toBe(true);
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    const menu = document.querySelector(".tp-menu")!;
    expect(menu.querySelector(".tp-menu-title")?.textContent).toBe("Row 2");
    const item = Array.from(menu.querySelectorAll<HTMLElement>(".tp-menu-item")).find(
      (b) => b.textContent === "Duplicate row",
    )!;
    item.click();
    await flush();
    expect(text).toBe(
      "Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| apple | 10 |\n| Fig | 2 |\n",
    );
    expect(document.querySelector(".tp-menu")).toBeNull();
  });

  it("blocks moving rows while sorted", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    const moveUp = Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find(
      (b) => b.textContent === "Move up",
    )!;
    expect(moveUp.getAttribute("aria-disabled")).toBe("true");
    moveUp.click();
    await flush();
    expect(text).toBe(PAGE);
  });
});
