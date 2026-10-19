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
