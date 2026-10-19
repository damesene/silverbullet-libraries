// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PAGE, bodyTexts, cell, clickOn, controller, cursorMoves, editor, flashes, flush, key, press, renderPage, setText, setup, tableMenuItem, text, useTablePage } from "./testing/page.ts";

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
    expect(tableMenuItem(/^Name table/)).toBeUndefined();
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

  it("keeps the toolbar to icons, the rest in its ⋯ menu, destructive last", async () => {
    await setup('| A |\n|---|\n| 1 |\n| <meta name="prices"> |\n', { "tablePlus.metadata": true });
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const bar = document.querySelector(".tp-bar")!;
    expect(Array.from(bar.querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["prices", "Filter", "More"]);
    tableMenuItem(/^Edit markdown$/);
    const menu = document.querySelector(".tp-menu")!;
    expect(Array.from(menu.querySelectorAll(".tp-menu-item, .tp-menu-separator")).map((e) => e.textContent || "—")).toEqual([
      "Name table: prices",
      "Edit markdown",
      "—",
      "Remove metadata",
    ]);
    expect(bar.querySelector(".tp-bar-more")!.classList.contains("tp-active")).toBe(true);
    // Escape closes it, and so does a press elsewhere
    key(menu, "Escape");
    expect(document.querySelector(".tp-menu")).toBeNull();
    tableMenuItem(/^Edit markdown$/);
    press(editor, "mousedown");
    expect(document.querySelector(".tp-menu")).toBeNull();
  });

  describe("a row being edited stays where it is shown until the editor leaves it", () => {
    const editing = () => editor.querySelector<HTMLInputElement>(".tp-cell-editor");
    const waitFor = async (done: () => boolean) => {
      for (let i = 0; i < 50 && !done(); i++) {
        await flush();
        await controller.scan();
      }
    };

    it("shows a row added under a filter until it is left", async () => {
      await setup(PAGE, { "tablePlus.editor.enterKey": "save" });
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector<HTMLElement>('.tp-bar button[aria-label="Filter"]')!.click();
      const filter = editor.querySelector<HTMLInputElement>('.tp-filter[data-tp-column="1"]')!;
      filter.value = ">5";
      filter.dispatchEvent(new Event("input"));
      await flush();
      expect(bodyTexts()).toEqual(["apple"]);
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector<HTMLElement>(".tp-add-row")!.click();
      await waitFor(() => !!editing());
      expect(bodyTexts()).toEqual(["apple", ""]);
      // Tab within the row: still shown, though Plum (no Qty) does not match
      editing()!.value = "Plum";
      key(editing()!, "Tab");
      await waitFor(() => editing()?.closest("td")?.cellIndex === 1);
      expect(text).toContain("| Plum | |");
      expect(bodyTexts()).toEqual(["apple", "Plum"]);
      // Left: the filter hides it
      key(editing()!, "Escape");
      await flush();
      expect(bodyTexts()).toEqual(["apple"]);
    });

    it("keeps an edited row in its place while sorted, and sorts it once left", async () => {
      await setup(PAGE, { "tablePlus.editor.enterKey": "save" });
      clickOn(cell(0, 0).querySelector(".tp-sort")!);
      expect(bodyTexts()).toEqual(["apple", "Fig", "Pear"]);
      clickOn(editor.querySelector<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)")!.cells[0]!);
      editing()!.value = "Zucchini";
      key(editing()!, "Tab");
      await waitFor(() => editing()?.closest("td")?.cellIndex === 1);
      expect(text).toContain("| Zucchini | 10 |");
      expect(bodyTexts()).toEqual(["Zucchini", "Fig", "Pear"]);
      key(editing()!, "Escape");
      await flush();
      expect(bodyTexts()).toEqual(["Fig", "Pear", "Zucchini"]);
    });

    it("keeps the row in its place for a click on another of its cells, sorts it on a click in another row", async () => {
      await setup(PAGE, { "tablePlus.editor.enterKey": "save" });
      clickOn(cell(0, 0).querySelector(".tp-sort")!);
      const rows = () => Array.from(editor.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)"));
      clickOn(rows()[0]!.cells[0]!);
      editing()!.value = "Zucchini";
      clickOn(rows()[0]!.cells[1]!);
      await waitFor(() => editing()?.closest("td")?.cellIndex === 1);
      expect(text).toContain("| Zucchini | 10 |");
      expect(bodyTexts()).toEqual(["Zucchini", "Fig", "Pear"]);
      clickOn(rows()[1]!.cells[1]!);
      await waitFor(() => bodyTexts()[2] === "Zucchini");
      expect(bodyTexts()).toEqual(["Fig", "Pear", "Zucchini"]);
    });

    it("sorts the row being edited with the others when the sorting changes", async () => {
      await setup(PAGE, { "tablePlus.editor.enterKey": "save" });
      // The rows shown, by their rows in the markdown (Pear 1, apple 2, Fig 3)
      const order = () => Array.from(editor.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)")).map((tr) => tr.dataset.tpRow);
      // Pear's name is edited: the column sorted by, sorted by what is typed
      clickOn(cell(1, 0));
      expect(order()).toEqual(["1", "2", "3"]);
      clickOn(cell(0, 0).querySelector(".tp-sort")!);
      expect(editing()).not.toBeNull();
      expect(order()).toEqual(["2", "3", "1"]);
      key(editing()!, "Escape");
      await flush();
      expect(order()).toEqual(["2", "3", "1"]);
    });
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
      document.querySelector<HTMLElement>('.tp-bar button[aria-label="Filter"]')!.click();
      const input = editor.querySelector<HTMLInputElement>('.tp-filter[data-tp-column="1"]')!;
      input.value = ">2";
      input.dispatchEvent(new Event("input"));
      await flush();
      return bodyTexts();
    };
    expect(await filterRows({})).toEqual(["Pear", "apple"]);
    expect(await filterRows({ "tablePlus.modules.filters.smart": false })).toEqual([]);
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
