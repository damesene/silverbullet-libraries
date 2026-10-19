// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PAGE, bodyTexts, cell, clickOn, controller, cursorMoves, editor, flashes, flush, key, press, renderPage, setText, setup, text, useTablePage } from "./testing/page.ts";

describe("Controller", () => {
  useTablePage();

  it("leaves out the modules turned off with tablePlus.modules.<name>.enabled", async () => {
    const TYPED = "| Item | Done #check |\n|---|---|\n| Pear | yes |\n";
    await setup(TYPED, {
      "tablePlus.metadata": true,
      "tablePlus.modules.columnTypes.enabled": false,
      "tablePlus.modules.handles.enabled": false,
      "tablePlus.modules.formulas.enabled": false,
    });
    // No column type: the cell as written, the hashtag shown
    expect(cell(1, 1).textContent).toBe("yes");
    expect(document.querySelector("style[data-table-plus='types']")).toBeNull();
    // No handles
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(document.querySelector(".tp-grip")).toBeNull();
    // No formulas: a typed formula is text
    clickOn(cell(1, 0));
    editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = "=1+1";
    key(editor.querySelector(".tp-cell-editor")!, "Enter");
    await flush();
    expect(text).toBe("| Item | Done #check |\n|---|---|\n| =1+1 | yes |\n");
    // The others are on
    controller.stop();
    document.body.replaceChildren();
    await setup(TYPED);
    expect(cell(1, 1).textContent).toBe("✅");
  });

  it("leaves out naming with the names module off, the names still working in formulas", async () => {
    const NAMED = '| Price <meta n="price"> | Total |\n|---|---|\n| 2 | 0.5 <meta cn="vat"> |\n| 3 | 4.5 <meta f="=[@price]*(1+vat)"> |\n| <meta name="prices"> |\n';
    await setup(NAMED, { "tablePlus.metadata": true, "tablePlus.editor.enterKey": "save", "tablePlus.modules.names.enabled": false });
    expect(document.querySelector(".tp-named")).toBeNull();
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(Array.from(document.querySelectorAll(".tp-bar button")).some((b) => b.textContent!.startsWith("Name"))).toBe(false);
    // The named cell keeps its name when edited, and the formula using it follows
    clickOn(cell(1, 1));
    editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = "1";
    key(editor.querySelector(".tp-cell-editor")!, "Enter");
    await flush();
    expect(text).toContain('| 2 | 1 <meta cn="vat"> |\n| 3 | 6 <meta f="=[@price]*(1+vat)"> |');
    // On: the fixed name's mark in the header, and the named cell's
    controller.stop();
    document.body.replaceChildren();
    await setup(NAMED, { "tablePlus.metadata": true });
    expect(cell(0, 0).classList.contains("tp-named")).toBe(true);
    expect(cell(0, 0).title).toBe("Column name: price");
    expect(cell(1, 1).classList.contains("tp-named")).toBe(true);
  });

  it("sorts and restores the order without touching the markdown", async () => {
    await setup(PAGE);
    const sort = cell(0, 0).querySelector(".tp-sort")!;
    clickOn(sort);
    expect(bodyTexts()).toEqual(["apple", "Fig", "Pear"]);
    clickOn(sort);
    expect(bodyTexts()).toEqual(["Pear", "Fig", "apple"]);
    clickOn(sort);
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
    expect(text).toBe(PAGE);
    expect(cursorMoves).toEqual([]);
  });

  it("clears the sorting with the cross next to the sort status", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const chip = document.querySelector(".tp-bar .tp-chip")!;
    expect(chip.textContent).toBe("Sorted by Name ↑");
    expect(document.querySelector(".tp-bar")!.textContent).not.toContain("Original order");
    chip.querySelector<HTMLElement>(".tp-chip-clear")!.click();
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
    expect(document.querySelector(".tp-bar .tp-chip")).toBeNull();
  });

  it("filters with number comparisons unless smart filters are off", async () => {
    const filterRows = async (config: Record<string, unknown>) => {
      controller?.stop();
      document.body.replaceChildren();
      delete (globalThis as Record<string, unknown>).__tablePlus;
      await setup(PAGE, config);
      await flush();
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      Array.from(document.querySelectorAll<HTMLElement>(".tp-bar button"))
        .find((b) => b.textContent === "Filter")!
        .click();
      const input = editor.querySelector<HTMLInputElement>('.tp-filter[data-tp-column="1"]')!;
      input.value = ">2";
      input.dispatchEvent(new Event("input"));
      await flush();
      return bodyTexts();
    };
    expect(await filterRows({})).toEqual(["Pear", "apple"]);
    expect(await filterRows({ "tablePlus.filter.smart": false })).toEqual([]);
  });

  it("limits the table height with the maxHeight setting", async () => {
    await setup(PAGE, { "tablePlus.maxHeight": 300 });
    await flush();
    await controller.scan();
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    expect(widget.style.maxHeight).toBe("300px");
    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "tablePlus.maxHeight": "nonsense" });
    await flush();
    expect(editor.querySelector<HTMLElement>(".sb-table-widget")!.style.maxHeight).toBe("");
  });

  it("applies the sorting to the markdown, once confirmed, and ends the sorting view", async () => {
    await setup(PAGE);
    let agree = false;
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = () => agree;
    const sortQty = () => clickOn(cell(0, 1).querySelector(".tp-sort")!);
    sortQty();
    sortQty(); // Qty descending
    const applyButton = () => {
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      return document.querySelector<HTMLElement>(".tp-bar .tp-chip-apply")!;
    };
    applyButton().click(); // declined
    await flush();
    expect(text).toBe(PAGE);
    agree = true;
    applyButton().click();
    await flush();
    await controller.scan();
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| apple | 10 |\n| Pear | 3 |\n| Fig | 2 |\n");
    expect(bodyTexts()).toEqual(["apple", "Pear", "Fig"]);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(document.querySelector(".tp-bar .tp-chip")).toBeNull(); // no sorting view any more
  });

  it("sorts numbers numerically", async () => {
    await setup(PAGE);
    clickOn(cell(0, 1).querySelector(".tp-sort")!);
    expect(bodyTexts()).toEqual(["Fig", "Pear", "apple"]);
  });

  it("keeps the sort when the table is re-rendered after an edit", async () => {
    await setup(PAGE, { "tablePlus.editor.enterKey": "save" });
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    clickOn(cell(1, 0)); // shown first: apple
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    expect(field.value).toBe("apple");
    field.value = "Zucchini";
    key(field, "Enter");
    await flush();
    await controller.scan();
    expect(text).toContain("| Zucchini | 10 |");
    expect(bodyTexts()).toEqual(["Fig", "Pear", "Zucchini"]);
  });

  it("shows the markdown on Alt+click with the cursor in the clicked cell", async () => {
    await setup(PAGE);
    press(cell(2, 1), "mousedown", { altKey: true });
    press(cell(2, 1), "click", { altKey: true });
    await flush();
    expect(cursorMoves.length).toBe(1);
    expect(text.slice(cursorMoves[0])).toMatch(/^10 \|/);
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
  });

  it("leaves link clicks to SilverBullet", async () => {
    await setup("| Page |\n|---|\n| [[Other]] |\n");
    const link = editor.querySelector("a[data-ref]")!;
    clickOn(link);
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    expect(cursorMoves.length).toBe(1);
  });

  it("refuses to save when the table changed underneath", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    setText(text.replace("| Pear | 3 |", "| Plum | 3 |"));
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    field.value = "Kiwi";
    key(field, "Enter");
    await flush();
    expect(text).not.toContain("Kiwi");
    expect(flashes.length).toBe(1);
  });

  it("offers to name unnamed columns instead of enhancing a shifted table", async () => {
    await setup("| A | | C |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    expect(editor.querySelector(".sb-table-widget")!.classList.contains("tp-table")).toBe(false);
    const button = editor.querySelector<HTMLElement>(".tp-notice button")!;
    button.click();
    await flush();
    expect(text).toBe("| A | Column 2 | C |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    expect(cursorMoves).toEqual([]);
    await controller.scan();
    expect(editor.querySelector(".sb-table-widget")!.classList.contains("tp-table")).toBe(true);
  });

  it("stays out of the way when tables render without positions", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await setup(PAGE);
    document.body.replaceChildren();
    editor.replaceChildren();
    document.body.append(editor);
    renderPage(PAGE, editor, cursorMoves);
    for (const el of Array.from(editor.querySelectorAll("[data-pos]"))) el.removeAttribute("data-pos");
    await controller.scan();
    await controller.scan();
    clickOn(cell(1, 0));
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    expect(cursorMoves.length).toBe(1);
    expect(flashes.length).toBe(1);
  });
});
