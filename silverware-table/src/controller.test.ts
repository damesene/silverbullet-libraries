// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { STICKY_GAP } from "./core/layout.ts";
import { PAGE, bodyTexts, cell, clickOn, controller, cursorMoves, editor, flashes, flush, inInsertBand, key, pointInsert, press, renderPage, setText, setup, tableMenuItem, text, useTablePage } from "./testing/page.ts";

describe("Controller", () => {
  useTablePage();

  it("leaves out the modules turned off with silverware.table.modules.<name>.enabled", async () => {
    const TYPED = "| Item | Done #check |\n|---|---|\n| Pear | yes |\n";
    await setup(TYPED, {
      "silverware.table.metadata": true,
      "silverware.table.modules.columnTypes.enabled": false,
      "silverware.table.modules.handles.enabled": false,
      "silverware.table.modules.formulas.enabled": false,
    });
    // No column type: the cell as written, the hashtag shown
    expect(cell(1, 1).textContent).toBe("yes");
    expect(document.querySelector("style[data-silverware-table='types']")).toBeNull();
    // No handles
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(document.querySelector(".swt-grip")).toBeNull();
    // No formulas: a typed formula is text
    clickOn(cell(1, 0));
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "=1+1";
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    await flush();
    expect(text).toBe("| Item | Done #check |\n|---|---|\n| =1+1 | yes |\n");
    // The others are on
    controller.stop();
    document.body.replaceChildren();
    await setup(TYPED);
    expect(cell(1, 1).textContent).toBe("✅");
  });

  it("recalculates nothing with the formulas module off: results stay as written", async () => {
    const SUMMED = '| Item | Qty |\n|---|---|\n| Pear | 3 |\n| Total | 3 <meta f="=SUM([qty])"> |\n\n| Order |\n|---|\n| 6 <meta f="=Totals!A1*2"> |\n';
    await setup(SUMMED, { "silverware.table.editor.enterKey": "save", "silverware.table.modules.formulas.enabled": false });
    clickOn(cell(1, 1));
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "5";
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    await flush();
    expect(text).toBe(SUMMED.replace("| Pear | 3 |", "| Pear | 5 |"));
  });

  it("leaves out naming with the names module off, the names still working in formulas", async () => {
    const NAMED = '| Price <meta n="price"> | Total |\n|---|---|\n| 2 | 0.5 <meta cn="vat"> |\n| 3 | 4.5 <meta f="=[@price]*(1+vat)"> |\n| <meta name="prices"> |\n';
    await setup(NAMED, { "silverware.table.metadata": true, "silverware.table.editor.enterKey": "save", "silverware.table.modules.names.enabled": false });
    expect(document.querySelector(".swt-named")).toBeNull();
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    tableMenuItem(/^Edit markdown$/);
    expect(document.querySelector(".swt-menu .swt-menu-rename")).toBeNull();
    // The named cell keeps its name when edited, and the formula using it follows
    clickOn(cell(1, 1));
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "1";
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    await flush();
    expect(text).toContain('| 2 | 1 <meta cn="vat"> |\n| 3 | 6 <meta f="=[@price]*(1+vat)"> |');
    // On: the fixed name's mark in the header, and the named cell's
    controller.stop();
    document.body.replaceChildren();
    await setup(NAMED, { "silverware.table.metadata": true });
    expect(cell(0, 0).classList.contains("swt-named")).toBe(true);
    expect(cell(0, 0).title).toBe("Column name: price");
    expect(cell(1, 1).classList.contains("swt-named")).toBe(true);
  });

  it("sizes every icon it adds before the library's CSS loads (an SVG without a size shows 300x150)", async () => {
    await setup('| Name | Done #check |\n|---|---|\n| Pear | yes |\n| <meta filter.name="P"> |\n', { "silverware.table.metadata": true });
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const icons = Array.from(document.querySelectorAll("svg"));
    expect(icons.length).toBeGreaterThan(3);
    for (const icon of icons) expect([icon.getAttribute("width"), icon.getAttribute("height")]).toEqual(["1em", "1em"]);
  });

  it("keeps the toolbar to icons, the rest in its ⋯ menu, destructive last", async () => {
    await setup('| A |\n|---|\n| 1 |\n| <meta name="prices"> |\n', { "silverware.table.metadata": true });
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const bar = document.querySelector(".swt-bar")!;
    expect(Array.from(bar.querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["prices", "Filter", "Edit mode", "Lazy saving", "Full screen", "More"]);
    tableMenuItem(/^Edit markdown$/);
    const menu = document.querySelector(".swt-menu")!;
    expect(Array.from(menu.querySelectorAll(".swt-menu-item, .swt-menu-separator")).map((e) => e.textContent || "—")).toEqual([
      "Theme: Native (global)",
      "Copy as CSV",
      "Export to Excel…",
      "Format table",
      "Edit markdown",
      "Silverware Table settings…",
      "—",
      "Remove metadata",
    ]);
    expect(bar.querySelector(".swt-bar-more")!.classList.contains("swt-active")).toBe(true);
    // Escape closes it, and so does a press elsewhere
    key(menu, "Escape");
    expect(document.querySelector(".swt-menu")).toBeNull();
    tableMenuItem(/^Edit markdown$/);
    press(editor, "mousedown");
    expect(document.querySelector(".swt-menu")).toBeNull();
  });

  describe("a row being edited stays where it is shown until the editor leaves it", () => {
    const editing = () => editor.querySelector<HTMLInputElement>(".swt-cell-editor");
    const waitFor = async (done: () => boolean) => {
      for (let i = 0; i < 50 && !done(); i++) {
        await flush();
        await controller.scan();
      }
    };

    it("shows a row added under a filter until it is left", async () => {
      await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector<HTMLElement>('.swt-bar button[aria-label="Filter"]')!.click();
      const filter = editor.querySelector<HTMLInputElement>('.swt-filter[data-swt-column="1"]')!;
      filter.value = ">5";
      filter.dispatchEvent(new Event("input"));
      await flush();
      expect(bodyTexts()).toEqual(["apple"]);
      // The + under the last row shown (jsdom has no layout to hover it: set as the pointer would)
      pointInsert({ key: "Test#0", axis: "row", at: 4, beside: { after: 3 } });
      document.querySelector<HTMLElement>(".swt-insert")!.click();
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
      await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
      clickOn(cell(0, 0).querySelector(".swt-sort")!);
      expect(bodyTexts()).toEqual(["apple", "Fig", "Pear"]);
      clickOn(editor.querySelector<HTMLTableRowElement>("tr[data-swt-row]:not(.swt-hidden)")!.cells[0]!);
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
      await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
      clickOn(cell(0, 0).querySelector(".swt-sort")!);
      const rows = () => Array.from(editor.querySelectorAll<HTMLTableRowElement>("tr[data-swt-row]:not(.swt-hidden)"));
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
      await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
      // The rows shown, by their rows in the markdown (Pear 1, apple 2, Fig 3)
      const order = () => Array.from(editor.querySelectorAll<HTMLTableRowElement>("tr[data-swt-row]:not(.swt-hidden)")).map((tr) => tr.dataset.swtRow);
      // Pear's name is edited: the column sorted by, sorted by what is typed
      clickOn(cell(1, 0));
      expect(order()).toEqual(["1", "2", "3"]);
      clickOn(cell(0, 0).querySelector(".swt-sort")!);
      expect(editing()).not.toBeNull();
      expect(order()).toEqual(["2", "3", "1"]);
      key(editing()!, "Escape");
      await flush();
      expect(order()).toEqual(["2", "3", "1"]);
    });
  });

  it("keeps a press beside the table that misses the + from SilverBullet, and hides the + when the pointer leaves the window", async () => {
    await setup(PAGE);
    const mark = document.querySelector<HTMLElement>(".swt-insert")!;
    // The band beside the table, a + shown (jsdom has no layout to hover it: set as the pointer would)
    pointInsert({ key: "Test#0", axis: "row", at: 4, beside: { after: 3 } }, true);
    mark.classList.add("swt-visible");
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    editor.querySelector(".sb-table-widget")!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await flush();
    expect(text).toBe(PAGE.replace("| Fig | 2 |\n", "| Fig | 2 |\n| | |\n"));
    expect(cursorMoves).toEqual([]);
    // In the band where no + shows: nothing happens, SilverBullet does not get it either
    await controller.scan();
    pointInsert(undefined, true);
    const again = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    editor.querySelector(".sb-table-widget")!.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(true);
    // The pointer leaves the window
    pointInsert({ key: "Test#0", axis: "row", at: 1, beside: {} }, true);
    mark.classList.add("swt-visible");
    document.body.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: null }));
    expect(mark.classList.contains("swt-visible")).toBe(false);
    expect(inInsertBand()).toBe(false);
  });

  // The table at x 100..400, y 100, its rows 30 high, its two columns 150 wide (jsdom has no layout)
  const layOutTable = () => {
    // Real DOMRects (their fields are getters, as the browser's)
    const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const tr = this.closest("tr");
      if (tr && this.closest(".sb-table-widget")) {
        const top = 100 + (tr as HTMLTableRowElement).rowIndex * 30;
        return this instanceof HTMLTableCellElement ? rect(100 + this.cellIndex * 150, top, 150, 30) : rect(100, top, 300, 30);
      }
      if (this.matches(".sb-table-widget, table")) return rect(100, 100, 300, 120);
      return rect(0, 0, 0, 0);
    });
  };

  it("shows the + inserting a row in a lane of its own left of the row grips, none over a grip", async () => {
    await setup(PAGE);
    layOutTable();
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const mark = document.querySelector<HTMLElement>(".swt-insert")!;
    const move = (x: number, y: number) => document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: x, clientY: y }));
    // On the border under Pear, over the row grip on the table's edge: no +
    move(97, 160);
    expect(mark.classList.contains("swt-visible")).toBe(false);
    move(94, 160);
    expect(mark.classList.contains("swt-visible")).toBe(false);
    // Left of the grip: the +, its centre 17px left of the edge (the 18px + clear of the grip, 12px wide on the edge)
    move(85, 160);
    expect(mark.classList.contains("swt-visible")).toBe(true);
    expect(parseFloat(mark.style.left) + mark.offsetWidth / 2).toBe(83);
    // Anywhere in the lane: on the border nearest the pointer, no aiming needed
    move(75, 183);
    expect(parseFloat(mark.style.top) + mark.offsetHeight / 2).toBe(190);
    move(75, 172);
    expect(parseFloat(mark.style.top) + mark.offsetHeight / 2).toBe(160);
    mark.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    await flush();
    expect(text).toBe(PAGE.replace("| Pear | 3 |\n", "| Pear | 3 |\n| | |\n"));
  });

  it("shows the + on the borders of the header and of the rows pinned to the top", async () => {
    await setup("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| Fig | 2 |\n| <meta pin-top=\"2\"> |\n", { "silverware.table.metadata": true });
    layOutTable();
    expect(cell(2, 0).closest("thead")).not.toBeNull();
    cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const mark = document.querySelector<HTMLElement>(".swt-insert:not(.swt-quiet)")!;
    const move = (x: number, y: number) => document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: x, clientY: y }));
    const at = () => parseFloat(mark.style.top) + mark.offsetHeight / 2;
    // Under the header (130), between Pear and apple (160), under apple (190)
    for (const border of [130, 160, 190]) {
      move(80, border + 2);
      expect(at()).toBe(border);
    }
  });

  it("gives a row scrolled under the header held at the top no grip, its border no +", async () => {
    await setup(PAGE);
    layOutTable();
    // The header held over Pear (130..160) and part of apple (160..190)
    const head = document.querySelector("thead")!;
    Object.defineProperty(head, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 135, bottom: 165, left: 100, right: 400, width: 300, height: 30, x: 100, y: 135, toJSON: () => ({}) }) as DOMRect,
    });
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const mark = document.querySelector<HTMLElement>(".swt-insert:not(.swt-quiet)")!;
    const grip = document.querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!;
    const move = (x: number, y: number) => document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: x, clientY: y }));
    // Beside Pear, under the header: no grip goes to it
    move(97, 150);
    expect(grip.style.top).not.toBe(`${130 + (30 - 22) / 2}px`);
    // The nearest border shown: not Pear's (160, under the header)
    move(80, 158);
    expect(mark.classList.contains("swt-visible")).toBe(true);
    expect(parseFloat(mark.style.top) + mark.offsetHeight / 2).not.toBe(160);
    expect([130, 190]).toContain(parseFloat(mark.style.top) + mark.offsetHeight / 2);
  });

  it("shows the + inserting a column in a lane of its own above the column grips, none over a grip; the toolbar keeps clear of it", async () => {
    await setup(PAGE);
    layOutTable();
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const mark = document.querySelector<HTMLElement>(".swt-insert:not(.swt-quiet)")!;
    const move = (x: number, y: number) => document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: x, clientY: y }));
    // Over the column grip on the header's top edge: no +
    move(250, 97);
    expect(mark.classList.contains("swt-visible")).toBe(false);
    // Above it: the + on the border nearest the pointer (between Name and Qty at 250), its centre 17px above the header
    move(230, 85);
    expect(mark.classList.contains("swt-visible")).toBe(true);
    expect(parseFloat(mark.style.left) + mark.offsetWidth / 2).toBe(250);
    expect(parseFloat(mark.style.top) + mark.offsetHeight / 2).toBe(83);
    // Nearer the table's right edge: there, adding a column at the end
    move(360, 80);
    expect(parseFloat(mark.style.left) + mark.offsetWidth / 2).toBe(400);
    mark.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    await flush();
    expect(text).toContain("| Name | Qty | Column 3 |");
    // The toolbar ends left of the + at the table's right edge
    await controller.scan();
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const bar = document.querySelector<HTMLElement>(".swt-bar.swt-visible")!;
    expect(parseFloat(bar.style.left) + bar.offsetWidth).toBeLessThanOrEqual(400 - 9 - 4);
  });

  it("shows a quiet + under the last row and right of the last column while a cell of it is hovered, edited or selected; lit under the pointer, it adds one", async () => {
    await setup(PAGE);
    layOutTable();
    const row = document.querySelector<HTMLElement>('.swt-insert.swt-quiet[aria-label="Add a row"]')!;
    const column = document.querySelector<HTMLElement>('.swt-insert.swt-quiet[aria-label="Add a column"]')!;
    const line = document.querySelector<HTMLElement>(".swt-insert-line")!;
    const shown = () => [row, column].map((mark) => mark.classList.contains("swt-visible"));
    const hover = (r: number, c: number) => cell(r, c).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    hover(1, 0);
    expect(shown()).toEqual([false, false]);
    // Fig, Qty: the last row and the last column
    hover(3, 1);
    expect(shown()).toEqual([true, true]);
    expect(line.classList.contains("swt-visible")).toBe(false);
    hover(2, 1);
    expect(shown()).toEqual([false, true]);
    hover(3, 0);
    expect(shown()).toEqual([true, false]);
    // Edited: shown while the pointer is elsewhere
    clickOn(cell(3, 0));
    hover(1, 0);
    expect(shown()).toEqual([true, false]);
    key(editor.querySelector(".swt-cell-editor")!, "Escape");
    await flush();
    // A press in the band beside the table (no + of the pointer's there) adds nothing
    hover(3, 0);
    pointInsert(undefined, true);
    editor.querySelector(".sb-table-widget")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    await flush();
    expect(text).toBe(PAGE);
    pointInsert(undefined);
    // The pointer on it: the line where it adds; a press adds a row at the end
    row.dispatchEvent(new PointerEvent("pointerenter"));
    expect(line.classList.contains("swt-visible")).toBe(true);
    row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    await flush();
    expect(text).toBe(`${PAGE}| | |
`);
    await controller.scan();
    key(editor.querySelector(".swt-cell-editor")!, "Escape");
    await flush();
    hover(1, 1);
    column.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    await flush();
    expect(text).toContain("| Name | Qty | Column 3 |");
  });

  it("draws the line of the + under the pointer, though both quiet + show (the last cell of the last row)", async () => {
    await setup(PAGE);
    layOutTable();
    const row = document.querySelector<HTMLElement>('.swt-insert.swt-quiet[aria-label="Add a row"]')!;
    const column = document.querySelector<HTMLElement>('.swt-insert.swt-quiet[aria-label="Add a column"]')!;
    const line = document.querySelector<HTMLElement>(".swt-insert-line")!;
    const across = () => line.classList.contains("swt-visible") && line.style.height === "2px" && line.style.width !== "2px";
    const down = () => line.classList.contains("swt-visible") && line.style.width === "2px" && line.style.height !== "2px";
    const hoverLast = () => cell(3, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    hoverLast();
    expect([row, column].map((m) => m.classList.contains("swt-visible"))).toEqual([true, true]);
    // On the row's +: the line across the table, also once the + are shown again
    row.dispatchEvent(new PointerEvent("pointerenter"));
    expect(across()).toBe(true);
    hoverLast();
    expect(across()).toBe(true);
    row.dispatchEvent(new PointerEvent("pointerleave"));
    expect(line.classList.contains("swt-visible")).toBe(false);
    // On the column's +: the line down the table
    column.dispatchEvent(new PointerEvent("pointerenter"));
    hoverLast();
    expect(down()).toBe(true);
    column.dispatchEvent(new PointerEvent("pointerleave"));
    // The pointer's own + under the last row (in the lane left of the grips): its line, the column's quiet + notwithstanding
    document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 80, clientY: 215 }));
    expect(document.querySelector(".swt-insert:not(.swt-quiet)")!.classList.contains("swt-visible")).toBe(true);
    expect(across()).toBe(true);
  });

  it("shows the quiet + of a cell only selected, the pointer away from the table", async () => {
    // Select mode: a click selects
    localStorage.removeItem("silverware.table.editMode");
    await setup(PAGE);
    const row = document.querySelector<HTMLElement>('.swt-insert.swt-quiet[aria-label="Add a row"]')!;
    cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    clickOn(cell(3, 0));
    expect(cell(3, 0).classList.contains("swt-selected")).toBe(true);
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    // The pointer leaves the table: its controls go, the quiet + of the selection stays
    (controller as unknown as { hideFloating(): void }).hideFloating();
    expect(document.querySelector(".swt-bar")!.classList.contains("swt-visible")).toBe(false);
    expect(row.classList.contains("swt-visible")).toBe(true);
    // Another cell selected: it goes
    clickOn(cell(1, 0));
    expect(row.classList.contains("swt-visible")).toBe(false);
  });

  it("formats the table's markdown from the toolbar's menu; again, it writes nothing", async () => {
    await setup("| A | Long |\n|---|---|\n| 1 | x |\n", { "silverware.table.autoFormat": false });
    tableMenuItem(/^Format table$/)!.click();
    await flush();
    expect(text).toBe("| A   | Long |\n| --- | ---- |\n| 1   | x    |\n");
    await controller.scan();
    const formatted = text;
    tableMenuItem(/^Format table$/)!.click();
    await flush();
    expect(text).toBe(formatted);
  });

  it("unpins all rows and columns from the toolbar's menu, leaving them where they are", async () => {
    const PINNED = '| A | B |\n|---|---|\n| 1 | x |\n| 2 | y |\n| 3 | z |\n| <meta sort.b="desc" pin-top="1" pin-bottom="1" pin-left="1"> |\n';
    await setup(PINNED);
    tableMenuItem(/^Unpin all$/)!.click();
    await flush();
    expect(text).toBe('| A | B |\n|---|---|\n| 1 | x |\n| 2 | y |\n| 3 | z |\n| <meta sort.b="desc"> |\n');
    // Nothing pinned: no such item
    await controller.scan();
    expect(tableMenuItem(/^Unpin all$/)).toBeUndefined();
  });

  it("sorts and restores the order without touching the markdown", async () => {
    await setup(PAGE);
    const sort = cell(0, 0).querySelector(".swt-sort")!;
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
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const chip = document.querySelector(".swt-bar .swt-chip")!;
    expect(chip.textContent).toBe("Sorted by Name ↑");
    expect(document.querySelector(".swt-bar")!.textContent).not.toContain("Original order");
    chip.querySelector<HTMLElement>(".swt-chip-clear")!.click();
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
    expect(document.querySelector(".swt-bar .swt-chip")).toBeNull();
  });

  it("filters with number comparisons unless smart filters are off", async () => {
    const filterRows = async (config: Record<string, unknown>) => {
      controller?.stop();
      document.body.replaceChildren();
      delete (globalThis as Record<string, unknown>).__silverwareTable;
      await setup(PAGE, config);
      await flush();
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector<HTMLElement>('.swt-bar button[aria-label="Filter"]')!.click();
      const input = editor.querySelector<HTMLInputElement>('.swt-filter[data-swt-column="1"]')!;
      input.value = ">2";
      input.dispatchEvent(new Event("input"));
      await flush();
      return bodyTexts();
    };
    expect(await filterRows({})).toEqual(["Pear", "apple"]);
    expect(await filterRows({ "silverware.table.modules.filters.smart": false })).toEqual([]);
  });

  it("limits the table height with the maxHeight setting", async () => {
    await setup(PAGE, { "silverware.table.maxHeight": 300 });
    await flush();
    await controller.scan();
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    expect(widget.style.maxHeight).toBe("300px");
    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "silverware.table.maxHeight": "nonsense" });
    await flush();
    expect(editor.querySelector<HTMLElement>(".sb-table-widget")!.style.maxHeight).toBe("");
  });

  it("applies the sorting to the markdown, once confirmed, and ends the sorting view", async () => {
    await setup(PAGE);
    let agree = false;
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = () => agree;
    const sortQty = () => clickOn(cell(0, 1).querySelector(".swt-sort")!);
    sortQty();
    sortQty(); // Qty descending
    const applyButton = () => {
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      return document.querySelector<HTMLElement>(".swt-bar .swt-chip-apply")!;
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
    expect(document.querySelector(".swt-bar .swt-chip")).toBeNull(); // no sorting view any more
  });

  it("sorts numbers numerically", async () => {
    await setup(PAGE);
    clickOn(cell(0, 1).querySelector(".swt-sort")!);
    expect(bodyTexts()).toEqual(["Fig", "Pear", "apple"]);
  });

  it("keeps the sort when the table is re-rendered after an edit", async () => {
    await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    clickOn(cell(1, 0)); // shown first: apple
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
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
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
  });

  it("leaves link clicks to SilverBullet", async () => {
    await setup("| Page |\n|---|\n| [[Other]] |\n");
    const link = editor.querySelector("a[data-ref]")!;
    clickOn(link);
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    expect(cursorMoves.length).toBe(1);
  });

  it("refuses to save when the table changed underneath", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    setText(text.replace("| Pear | 3 |", "| Plum | 3 |"));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    field.value = "Kiwi";
    key(field, "Enter");
    await flush();
    expect(text).not.toContain("Kiwi");
    expect(flashes.length).toBe(1);
  });

  it("offers to name unnamed columns instead of enhancing a shifted table", async () => {
    await setup("| A | | C |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    expect(editor.querySelector(".sb-table-widget")!.classList.contains("swt-table")).toBe(false);
    const button = editor.querySelector<HTMLElement>(".swt-notice button")!;
    button.click();
    await flush();
    expect(text).toBe("| A | Column 2 | C |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    expect(cursorMoves).toEqual([]);
    await controller.scan();
    expect(editor.querySelector(".sb-table-widget")!.classList.contains("swt-table")).toBe(true);
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
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    expect(cursorMoves.length).toBe(1);
    expect(flashes.length).toBe(1);
  });

  describe("in the page's view, as SilverBullet lays it out", () => {
    // The page scrolls in CodeMirror's scroller below the top bar (top 55, 500
    // high); the table is 1000px down the page, 300 high, its rows 30 high.
    // jsdom has no layout: the rectangles follow the scroller's scrollTop.
    const SCROLLER_TOP = 55;
    let scroller: HTMLElement;
    let viewHeight: number;
    const layOut = (pageHeight: number) => {
      scroller = document.createElement("div");
      scroller.className = "cm-scroller";
      scroller.style.overflowY = "auto";
      document.body.append(scroller);
      scroller.append(editor);
      viewHeight = 500;
      Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => pageHeight });
      Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => Math.min(pageHeight, viewHeight) });
      const rect = (top: number, height: number) =>
        ({ top, bottom: top + height, left: 0, right: 800, width: 800, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        if (this === scroller) return rect(SCROLLER_TOP, viewHeight);
        const widget = this.closest(".sb-table-widget");
        if (!widget || !widget.isConnected) return rect(0, 0);
        const tableTop = SCROLLER_TOP + (pageHeight > 500 ? 1000 : 5) - scroller.scrollTop;
        if (this === widget || this.tagName === "TABLE") return rect(tableTop, 300);
        const tr = this.closest("tr");
        return tr ? rect(tableTop + tr.rowIndex * 30, 30) : rect(0, 0);
      });
    };
    const top = () => editor.querySelector<HTMLElement>(".sb-table-widget")!.getBoundingClientRect().top;
    // What SilverBullet's editor does while it measures a table rendered anew: the page jumps
    const jumpAfterWrite = () => {
      const bridge = controller.bridge as { replaceRange: (from: number, to: number, insert: string) => unknown };
      const replace = bridge.replaceRange.bind(bridge);
      bridge.replaceRange = async (from, to, insert) => {
        await replace(from, to, insert);
        scroller.scrollTop = 0;
        setTimeout(() => {
          scroller.scrollTop = 4000;
          scroller.dispatchEvent(new Event("scroll"));
        }, 0);
      };
    };

    it("keeps a table written where it was in the view, though the editor scrolls the page as it renders it anew", async () => {
      await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
      layOut(5000);
      scroller.scrollTop = 900;
      const before = top();
      jumpAfterWrite();
      clickOn(cell(3, 1));
      editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "7";
      key(editor.querySelector(".swt-cell-editor")!, "Enter");
      await flush();
      await controller.scan();
      expect(text).toContain("| Fig | 7 |");
      expect(top()).toBe(before);
      // The editor's later scrolling too
      await flush();
      await flush();
      expect(top()).toBe(before);
      // The user scrolls: the page is theirs again
      window.dispatchEvent(new WheelEvent("wheel"));
      scroller.scrollTop = 100;
      scroller.dispatchEvent(new Event("scroll"));
      expect(scroller.scrollTop).toBe(100);
    });

    it("keeps the + adding a row low on a long page from scrolling the page, and swallows the click that ends the press", async () => {
      await setup(PAGE);
      layOut(5000);
      scroller.scrollTop = 900;
      const before = top();
      jumpAfterWrite();
      const mark = document.querySelector<HTMLElement>(".swt-insert")!;
      pointInsert({ key: "Test#0", axis: "row", at: 4, beside: { after: 3 } });
      mark.classList.add("swt-visible");
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
      mark.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      await flush();
      await controller.scan();
      expect(text).toBe(PAGE.replace("| Fig | 2 |\n", "| Fig | 2 |\n| | |\n"));
      expect(top()).toBe(before);
      // The press ends over whatever is there now (a link, say): it reaches nothing
      const link = document.createElement("a");
      link.dataset.ref = "Elsewhere";
      editor.append(link);
      const reached: string[] = [];
      for (const type of ["mouseup", "click"]) link.addEventListener(type, () => reached.push(type));
      link.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      expect(reached).toEqual([]);
      expect(text).toBe(PAGE.replace("| Fig | 2 |\n", "| Fig | 2 |\n| | |\n"));
      // The next click is a click
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      expect(reached).toEqual(["click"]);
      // Another press right after the + is not swallowed
      pointInsert({ key: "Test#0", axis: "row", at: 1, beside: {} });
      mark.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
      link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
      link.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      expect(reached).toEqual(["click", "mouseup", "click"]);
    });

    it("leaves holding the header to the browser (position: sticky) for a table that fits its width, to the script for a wide one", async () => {
      await setup(PAGE);
      layOut(5000);
      scroller.scrollTop = 1100;
      const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
      const table = widget.querySelector("table")!;
      Object.defineProperty(widget, "clientWidth", { configurable: true, value: 800 });
      // A few frames: the sticky update runs in one, after other work queued for frames
      const settle = async () => {
        scroller.dispatchEvent(new Event("scroll"));
        for (let i = 0; i < 3; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
      };
      // Fits: the browser moves it (no transform), the script only marks it held
      Object.defineProperty(table, "offsetWidth", { configurable: true, value: 800 });
      Object.defineProperty(document.querySelector("thead")!, "getBoundingClientRect", {
        configurable: true,
        value: () => new DOMRect(0, SCROLLER_TOP + STICKY_GAP, 800, 30),
      });
      await settle();
      expect(widget.classList.contains("swt-sticky-native")).toBe(true);
      expect(document.querySelector<HTMLElement>("thead")!.style.transform).toBe("");
      expect(document.querySelector("thead")!.classList.contains("swt-stuck")).toBe(true);
      // Wider than its box (it scrolls sideways in it): moved by the script
      Object.defineProperty(table, "offsetWidth", { configurable: true, value: 1200 });
      await settle();
      expect(widget.classList.contains("swt-sticky-native")).toBe(false);
      expect(document.querySelector<HTMLElement>("thead")!.style.transform).toMatch(/^translateY\(/);
    });

    it("keeps the toolbar above a header held at the top while the page scrolls, not over a column's name", async () => {
      await setup(PAGE);
      layOut(5000);
      // The table scrolled up past the top of the view: Sticky holds its header there
      scroller.scrollTop = 1100;
      const bar = document.querySelector<HTMLElement>(".swt-bar")!;
      Object.defineProperty(bar, "offsetHeight", { configurable: true, value: 26 });
      const header = cell(0, 0).parentElement!;
      const held = SCROLLER_TOP + STICKY_GAP;
      // Its own (a spy on the element would replace the prototype's mock for every element)
      Object.defineProperty(header, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: held, bottom: held + 30, left: 0, right: 800, width: 800, height: 30, x: 0, y: held, toJSON: () => ({}) }) as DOMRect,
      });
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(document.querySelector("thead")!.classList.contains("swt-stuck")).toBe(true);
      const top = parseFloat(bar.style.top);
      expect(top).toBeGreaterThanOrEqual(SCROLLER_TOP);
      expect(top + 26).toBeLessThanOrEqual(held);
    });

    it("keeps the toolbar below the top bar on a page too short to scroll", async () => {
      await setup(PAGE);
      layOut(300);
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      const bar = document.querySelector<HTMLElement>(".swt-bar.swt-visible")!;
      // No room above the header (just below the top bar): over the header instead
      expect(parseFloat(bar.style.top)).toBeGreaterThanOrEqual(SCROLLER_TOP);
    });

    // A workaround, not a feature: what SilverBullet and the browser do on a phone, countered
    describe("on a touch screen, against SilverBullet and the on-screen keyboard (core/touch-keyboard.ts)", () => {
      it("hands the focus back to the editor when a cell editor closes, but not on a touch screen (its keyboard would scroll the page to the editor's cursor)", async () => {
        await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
        // Left unchanged with Enter: the table is not rendered anew
        const edit = (pointerType: string) => {
          cell(1, 1).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType }));
          clickOn(cell(1, 1));
          const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
          expect(document.activeElement).toBe(field);
          key(field, "Enter");
        };
        edit("mouse");
        await flush();
        expect(editor.querySelector(".swt-cell-editor")).toBeNull();
        expect(document.activeElement).toBe(editor);
        edit("touch");
        await flush();
        expect(editor.querySelector(".swt-cell-editor")).toBeNull();
        expect(document.activeElement).toBe(document.body);
        // The editor focused (SilverBullet focuses it when the page opens): a touch on the table takes its focus
        editor.focus();
        cell(2, 0).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
        expect(document.activeElement).toBe(document.body);
        // A mouse press leaves it
        editor.focus();
        cell(2, 0).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
        expect(document.activeElement).toBe(editor);
      });

      it("scrolls the cell being edited back into view when an on-screen keyboard shrinks the view", async () => {
        await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
        layOut(5000);
        // The last row at the bottom of the view
        scroller.scrollTop = 1000 + 3 * 30 + 30 - 500;
        clickOn(cell(3, 1));
        const field = editor.querySelector<HTMLElement>(".swt-cell-editor")!;
        expect(field.closest("td")!.getBoundingClientRect().bottom).toBe(SCROLLER_TOP + 500);
        // The keyboard shows: SilverBullet shrinks its layout to what is above it
        viewHeight = 250;
        window.dispatchEvent(new Event("resize"));
        expect(field.closest("td")!.getBoundingClientRect().bottom).toBe(SCROLLER_TOP + 250);
        expect(editor.querySelector(".swt-cell-editor")).toBe(field);
      });

      it("shows the cell Enter moved to above a keyboard that shows after the write, though the table written is kept in its place", async () => {
        await setup(PAGE);
        layOut(5000);
        // The last row at the bottom of the view
        scroller.scrollTop = 1000 + 3 * 30 + 30 - 500;
        clickOn(cell(2, 1));
        const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
        field.value = "11";
        key(field, "Enter");
        await flush();
        await controller.scan();
        const td = editor.querySelector(".swt-cell-editor")!.closest("td")!;
        expect(td).toBe(cell(3, 1));
        // The keyboard shows for the new field, and the page scrolls to show it: the table written is not held against that
        viewHeight = 250;
        window.dispatchEvent(new Event("resize"));
        scroller.dispatchEvent(new Event("scroll"));
        await flush();
        expect(td.getBoundingClientRect().bottom).toBeLessThanOrEqual(SCROLLER_TOP + 250);
      });

      it("brings the cell being edited back when SilverBullet scrolls to its own cursor as the field takes the focus", async () => {
        await setup(PAGE);
        layOut(5000);
        scroller.scrollTop = 900;
        clickOn(cell(3, 1));
        const td = editor.querySelector(".swt-cell-editor")!.closest("td")!;
        const shown = td.getBoundingClientRect().top;
        // SilverBullet: its editor's content has the focus (the field is in it), so it scrolls to its cursor, at the page's start
        scroller.scrollTop = 0;
        scroller.dispatchEvent(new Event("scroll"));
        expect(td.getBoundingClientRect().top).toBeLessThanOrEqual(SCROLLER_TOP + 500);
        expect(td.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(SCROLLER_TOP);
        expect(scroller.scrollTop).toBeGreaterThan(0);
        // The user scrolls: theirs
        window.dispatchEvent(new Event("touchstart"));
        scroller.scrollTop = 0;
        scroller.dispatchEvent(new Event("scroll"));
        expect(scroller.scrollTop).toBe(0);
        expect(shown).toBeGreaterThan(SCROLLER_TOP);
      });

      it("scrolls the cell being edited above a keyboard that only shrinks the visual viewport", async () => {
        const visual = Object.assign(new EventTarget(), { offsetTop: 0, height: 768 });
        Object.defineProperty(window, "visualViewport", { configurable: true, value: visual });
        try {
          await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
          layOut(5000);
          scroller.scrollTop = 1000 + 3 * 30 + 30 - 500;
          clickOn(cell(3, 1));
          const td = editor.querySelector(".swt-cell-editor")!.closest("td")!;
          // The layout keeps its size, the keyboard covers all but the top 300px of the window
          visual.height = 300;
          visual.dispatchEvent(new Event("resize"));
          expect(td.getBoundingClientRect().bottom).toBe(300);
        } finally {
          Reflect.deleteProperty(window, "visualViewport");
        }
      });
    });
  });
});
