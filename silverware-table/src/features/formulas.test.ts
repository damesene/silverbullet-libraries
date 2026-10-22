// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttonLabel, cell, cellMenuItem, clickOn, controller, cursorMoves, editor, flashes, flush, key, menuButtons, nameInMenu, pointInsert, press, renderPage, setup as setupPage, tableMenuItem, text, useTablePage } from "../testing/page.ts";
import { FORMULAS_NEED_METADATA } from "./formulas.ts";
import { clearCustomFunctions, defineCustomFunctions, functionNamed } from "../formulas/registry.ts";
import { toNumber, type Value } from "../formulas/values.ts";
import { defineFunctions, resetDefinitions } from "../index.ts";

describe("Formulas", () => {
  useTablePage();

  // New formulas are stored in the table: the metadata setting is on unless a test turns it off
  const setup = (page: string, settings: Record<string, unknown> = {}, bridgeExtras: Parameters<typeof setupPage>[2] = {}) =>
    setupPage(page, { "silverware.table.metadata": true, ...settings }, bridgeExtras);

  const TOTAL = "| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | |\n";
  const field = () => editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
  const type = async (value: string) => {
    field().value = value;
    field().dispatchEvent(new Event("input", { bubbles: true }));
    key(field(), "Enter");
    await flush();
    await controller.scan();
  };

  it("writes a typed formula's result with the formula", async () => {
    await setup(TOTAL);
    clickOn(cell(3, 1));
    await type("=SUM(B1:B2)");
    expect(text).toBe(`| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | 13 <meta f='=SUM(B1:B2)'> |\n`);
    expect(cell(3, 1).textContent).toBe("13");
    expect(cell(3, 1).classList.contains("swt-formula")).toBe(true);
    expect(cell(3, 1).title).toBe("=SUM(B1:B2)");
  });

  it("inserts a numbered column (=ROW() in every row) from a column's menu; rows added or moved are numbered again", async () => {
    const openColumnMenu = (column: number) => {
      cell(1, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector(".swt-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    };
    const item = (label: string) => menuButtons().find((b) => buttonLabel(b) === label);
    await setup("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n");
    openColumnMenu(0);
    // With inserting the column, after Insert column right
    const labels = menuButtons().map((b) => buttonLabel(b));
    expect(labels[labels.indexOf("Insert column right") + 1]).toBe("Insert numbered column left");
    item("Insert numbered column left")!.click();
    await flush();
    await controller.scan();
    expect(text).toBe(`| # | Name | Qty |\n|---|---|---|\n| 1 <meta f='=ROW()'> | Pear | 3 |\n| 2 <meta f='=ROW()'> | Apple | 10 |\n`);
    // Another, right of Name: as many as wanted
    openColumnMenu(2);
    item("Insert numbered column left")!.click();
    await flush();
    await controller.scan();
    expect(text).toContain(`| 2 <meta f='=ROW()'> | Apple | 2 <meta f='=ROW()'> | 10 |`);
    // A row added at the start: a calculated column fills it, every row is numbered again
    cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    pointInsert({ key: "Test#0", axis: "row", at: 1, beside: { before: 1 } });
    document.querySelector<HTMLElement>(".swt-insert")!.click();
    await flush();
    await controller.scan();
    key(field(), "Escape");
    await flush();
    expect(text).toBe(
      `| # | Name | # | Qty |\n|---|---|---|---|\n| 1 <meta f='=ROW()'> | | 1 <meta f='=ROW()'> | |\n| 2 <meta f='=ROW()'> | Pear | 2 <meta f='=ROW()'> | 3 |\n| 3 <meta f='=ROW()'> | Apple | 3 <meta f='=ROW()'> | 10 |\n`,
    );
  });

  it("offers a numbered column only with the metadata setting on (a new formula)", async () => {
    await setup("| Name |\n|---|\n| Pear |\n", { "silverware.table.metadata": false });
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document.querySelector(".swt-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    const entry = menuButtons().find((b) => buttonLabel(b) === "Insert numbered column left")!;
    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(entry.title).toBe(FORMULAS_NEED_METADATA);
    entry.click();
    await flush();
    expect(text).toBe("| Name |\n|---|\n| Pear |\n");
  });

  it("edits a formula cell as its formula and recalculates on every edit", async () => {
    await setup(`| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | 13 <meta f='=SUM([Qty])'> |\n`);
    clickOn(cell(3, 1));
    expect(field().value).toBe("=SUM([Qty])");
    key(field(), "Escape");
    await flush();
    clickOn(cell(1, 1));
    await type("5");
    expect(text).toContain(`| Total | 15 <meta f='=SUM([Qty])'> |`);
    // A plain value replaces the formula
    clickOn(cell(3, 1));
    await type("7");
    expect(text).toContain("| Total | 7 |");
  });

  it("computes a new row with the formula its columns compute every row with", async () => {
    await setup(
      `| Item | Qty | Price | Amount |\n|---|---|---|---|\n| a | 2 | 3 | 6 <meta f='=[@Qty]*[@Price]'> |\n`,
    );
    clickOn(cell(1, 0));
    key(field(), "Enter", { ctrlKey: true });
    await flush();
    await controller.scan();
    expect(text).toContain(`<meta f='=[@Qty]*[@Price]'> |\n| `);
    for (const [value, next] of [["b", "Tab"], ["5", "Tab"], ["2", "Enter"]] as const) {
      field().value = value;
      key(field(), next);
      await flush();
      await controller.scan();
    }
    expect(text.split("\n").slice(-2)).toEqual([`| b | 5 | 2 | 10 <meta f='=[@Qty]*[@Price]'> |`, ""]);
  });

  describe("functions as their names are typed", () => {
    const typeIn = (value: string, caret = value.length) => {
      field().value = value;
      field().setSelectionRange(caret, caret);
      field().dispatchEvent(new Event("input"));
    };
    const options = () => Array.from(document.querySelectorAll<HTMLElement>(".swt-formula-choice"));
    const picked = () => options().find((o) => o.getAttribute("aria-selected") === "true")?.querySelector("code")?.textContent;
    const help = () => document.querySelector(".swt-formula-help code")?.textContent;

    it("lists the functions a name may be, picks one with the arrows and inserts it with Tab", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      typeIn("=a");
      expect(options().map((o) => o.querySelector("code")!.textContent)).toEqual(["ABS", "AND", "AVERAGE", "AVERAGEIFS"]);
      expect(picked()).toBe("ABS");
      expect(help()).toBe("ABS(number)");
      key(field(), "ArrowDown");
      key(field(), "ArrowDown");
      key(field(), "ArrowDown");
      key(field(), "ArrowDown"); // stays on the last
      expect(picked()).toBe("AVERAGEIFS");
      key(field(), "ArrowUp");
      key(field(), "ArrowUp");
      expect(picked()).toBe("AND");
      key(field(), "Tab");
      // Inserted, the editor still open, the help now for its arguments
      expect(field().value).toBe("=AND(");
      expect(field().selectionStart).toBe(5);
      expect(options()).toEqual([]);
      expect(document.querySelector(".swt-formula-argument")!.textContent).toBe("logical1");
      typeIn("=AND(1, ");
      expect(document.querySelector(".swt-formula-argument")!.textContent).toBe("[logical2]");
      // The one of the whole name typed comes first
      typeIn("=AND(1, if");
      expect(picked()).toBe("IF");
      key(field(), "Tab");
      expect(field().value).toBe("=AND(1, IF(");
      // Saved with the column's key, as SilverBullet's queries name it: Enter saves where no list shows
      typeIn("=SUM([Qty])");
      key(field(), "Enter");
      await flush();
      expect(text).toContain(`| Total | 13 <meta f='=SUM([qty])'> |`);
    });

    it("inserts the function clicked; Esc closes the list and leaves the editor open", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      typeIn("=ro");
      // A press on the list is the formula's, not a press outside the table that ends editing
      const option = options().find((o) => o.querySelector("code")!.textContent === "ROUND")!;
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      option.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      expect(controller.isFloating(option)).toBe(true);
      option.click();
      expect(field().value).toBe("=ROUND(");
      typeIn("=ro");
      key(field(), "Escape");
      expect(options()).toEqual([]);
      expect(editor.querySelector(".swt-cell-editor")).not.toBeNull();
      // Open again once the name changes
      typeIn("=row");
      expect(picked()).toBe("ROW");
    });

    it("saves the formula as typed with Enter, the list open: a cell's name that starts a function's is the cell", async () => {
      await setup(`| Item | Price |\n|---|---|\n| Rate | 2 <meta cn='day'> |\n| Total | |\n`);
      clickOn(cell(2, 1));
      typeIn("=day");
      // The cell first (the whole name typed, and the user's own), the function after it
      expect(options().map((o) => o.querySelector("code")!.textContent)).toEqual(["day", "DAY"]);
      expect(options()[0]!.textContent).toContain("Named cell of this table");
      key(field(), "Enter");
      await flush();
      expect(text).toContain(`| Total | 2 <meta f='=day'> |`);
    });

    it("offers the page's named cells, rows of the table and tables, and inserts each as a formula writes it", async () => {
      await setup(
        `| Fruit | Price |\n|---|---|\n| Pear <meta n='pear'> | 3 <meta cn='pear_price'> |\n| Total | |\n| <meta name='prices'> |\n\n` +
          `| Rate |\n|---|\n| 0.21 <meta cn='vat'> |\n| <meta name='rates'> |\n\n| Plain |\n|---|\n| 1 <meta cn='hidden'> |\n`,
        { "silverware.table.metadata": true },
      );
      clickOn(cell(2, 1));
      typeIn("=pe");
      expect(options().map((o) => o.querySelector("code")!.textContent)).toEqual(["pear", "pear_price"]);
      expect(options()[0]!.textContent).toContain("Named row");
      key(field(), "Tab");
      expect(field().value).toBe("=pear[");
      typeIn("=pr");
      expect(picked()).toBe("prices");
      key(field(), "Tab");
      expect(field().value).toBe("=prices!");
      // A cell of another table, as it is written there (a name is its table's): with the table's name
      typeIn("=1+va");
      expect(picked()).toBe("rates!vat");
      expect(options()[0]!.textContent).toContain("Named cell of rates");
      key(field(), "Tab");
      expect(field().value).toBe("=1+rates!vat");
      // A table without a name: its cells cannot be referred to from another table, so not offered
      typeIn("=hid");
      expect(options().map((o) => o.querySelector("code")!.textContent)).not.toContain("hidden");
      // After a table's name: its cells, inserted by their names alone
      typeIn("=1+rates!v");
      expect(options().map((o) => o.querySelector("code")!.textContent)).toEqual(["vat"]);
      key(field(), "Tab");
      expect(field().value).toBe("=1+rates!vat");
      // The name in full, nothing left to insert: Tab saves and moves on, as elsewhere
      key(field(), "Tab");
      await flush();
      expect(text).toContain(`<meta f='=1+rates!vat'>`);
    });
  });

  it("cycles the $ of the reference at the caret with F4, and saves the formula with it", async () => {
    await setup(TOTAL);
    clickOn(cell(3, 1));
    field().value = "=SUM(B1:B2)*2";
    field().setSelectionRange(10, 10);
    field().dispatchEvent(new Event("input"));
    key(field(), "F4");
    expect(field().value).toBe("=SUM($B$1:$B$2)*2");
    expect(field().selectionStart).toBe(14);
    key(field(), "F4");
    expect(field().value).toBe("=SUM(B$1:B$2)*2");
    // Off a reference F4 does nothing of its own
    field().setSelectionRange(1, 1);
    expect(key(field(), "F4")).toBe(true);
    expect(field().value).toBe("=SUM(B$1:B$2)*2");
    // Nor in a text that is no formula
    const typed = field().value;
    field().value = "Room B2";
    field().setSelectionRange(7, 7);
    expect(key(field(), "F4")).toBe(true);
    expect(field().value).toBe("Room B2");
    field().value = typed;
    key(field(), "Enter");
    await flush();
    expect(text).toContain(`| Total | 26 <meta f='=SUM(B$1:B$2)*2'> |`);
  });

  describe("the Functions dialog", () => {
    const dialog = () => document.querySelector<HTMLElement>(".swt-functions-dialog");
    const search = () => dialog()!.querySelector<HTMLInputElement>(".swt-functions-search")!;
    const listed = () => Array.from(dialog()!.querySelectorAll(".swt-functions-option code")).map((c) => c.textContent);
    const picked = () => dialog()!.querySelector('.swt-functions-option[aria-selected="true"] code')?.textContent;
    const find = (query: string) => {
      search().value = query;
      search().dispatchEvent(new Event("input"));
    };
    const edit = (value: string) => {
      field().value = value;
      field().setSelectionRange(value.length, value.length);
      field().dispatchEvent(new Event("input"));
    };

    it("opens with Shift+F3, finds a function by what it does, and puts it in place of the name typed", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      edit("=SUM(B1)+ro");
      key(field(), "F3", { shiftKey: true });
      expect(dialog()).not.toBeNull();
      expect(dialog()!.querySelector(".swt-dialog-subtitle")!.textContent).toBe("=SUM(B1)+ro▌");
      expect(document.activeElement).toBe(search());
      // The cell editor stays open behind it; keys typed in the dialog are the dialog's
      expect(field().isConnected).toBe(true);
      find("decimal places");
      expect(listed()).toEqual(["ROUND", "ROUNDDOWN", "ROUNDUP"]);
      expect(dialog()!.querySelector(".swt-functions-syntax")!.textContent).toBe("ROUND(number, [digits])");
      expect(dialog()!.querySelector(".swt-functions-example code")!.textContent).toBe("=ROUND([@price] * 1.21, 2)");
      key(search(), "Enter");
      expect(dialog()).toBeNull();
      expect(field().value).toBe("=SUM(B1)+ROUND(");
      expect(document.activeElement).toBe(field());
      expect(field().selectionStart).toBe(15);
      expect(text).toBe(TOTAL);
    });

    it("opens from fx in the hint, shows a group, picks with the arrows; Esc leaves the formula as it was", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      edit("=");
      const fx = document.querySelector<HTMLElement>(".swt-formula-functions")!;
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      fx.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      fx.click();
      Array.from(dialog()!.querySelectorAll<HTMLElement>(".swt-functions-group")).find((b) => b.textContent === "Logic")!.click();
      expect(listed()).toEqual(["AND", "IF", "IFERROR", "ISNUMBER", "NOT", "OR"]);
      key(search(), "ArrowDown");
      expect(picked()).toBe("IF");
      key(search(), "Escape");
      expect(dialog()).toBeNull();
      expect(field().value).toBe("=");
      expect(document.activeElement).toBe(field());
      // Again: Insert puts the one picked in
      fx.click();
      find("if");
      dialog()!.querySelector<HTMLElement>(".swt-dialog-primary")!.click();
      expect(field().value).toBe("=IF(");
    });

    it("starts a formula from a cell's menu", async () => {
      await setup(TOTAL);
      cellMenuItem(cell(1, 1), /^Insert function/)!.click();
      expect(field().value).toBe("=");
      find("sum");
      expect(picked()).toBe("SUM");
      key(search(), "Enter");
      expect(field().value).toBe("=SUM(");
      key(field(), "Enter");
      await flush();
      await controller.scan();
      // On a cell with a formula: its formula edited, the function after a "+" (it follows an operand)
      cellMenuItem(cell(1, 1), /^Insert function/)!.click();
      expect(field().value).toBe("=SUM()");
      find("abs");
      key(search(), "Enter");
      expect(field().value).toBe("=SUM()+ABS(");
      key(field(), "Escape");
      // Without the metadata setting a new formula cannot be stored: offered, not available
      controller.stop();
      document.body.replaceChildren();
      await setup(TOTAL, { "silverware.table.metadata": false });
      expect(cellMenuItem(cell(1, 1), /^Insert function/)!.getAttribute("aria-disabled")).toBe("true");
    });
  });

  it("fixes a missing ) when the formula is saved, and says so", async () => {
    await setup(TOTAL);
    clickOn(cell(3, 1));
    await type("=SUM(B1:B2");
    expect(text).toContain(`| Total | 13 <meta f='=SUM(B1:B2)'> |`);
    expect(flashes).toEqual(["Silverware Table: formula fixed: added )"]);
  });

  it("keeps a text that starts with = when typed as '=, and when it is edited again", async () => {
    await setup(TOTAL);
    clickOn(cell(3, 1));
    await type("'=not a formula");
    expect(text).toContain("| Total | =not a formula |");
    clickOn(cell(3, 1));
    expect(field().value).toBe("'=not a formula");
    await type("'=still not a formula");
    expect(text).toContain("| Total | =still not a formula |");
  });

  it("adjusts references when a row is deleted", async () => {
    await setup(`| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Fig | 2 |\n| Total | 15 <meta f='=SUM(B1:B3)'> |\n`);
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document
      .querySelector<HTMLElement>(".swt-grip:not(.swt-grip-column)")!
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    menuButtons()
      .find((b) => buttonLabel(b) === "Delete row")!
      .click();
    await flush();
    expect(text).toBe(`| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 |\n| Total | 5 <meta f='=SUM(B1:B2)'> |\n`);
  });

  it("offers to recalculate results that are out of date", async () => {
    const stale = `| Name | Qty |\n|---|---|\n| Pear | 4 |\n| Apple | 10 |\n| Total | 13 <meta f='=SUM([Qty])'> |\n`;
    await setup(stale);
    // Viewing does not write
    expect(text).toBe(stale);
    const recalc = () => document.querySelector<HTMLElement>('.swt-bar button[aria-label="Recalculate"]');
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    // An icon, first in the toolbar, highlighted while results are out of date
    expect(document.querySelector(".swt-bar")!.firstElementChild).toBe(recalc());
    expect(recalc()!.querySelector("svg")).not.toBeNull();
    expect(recalc()!.classList.contains("swt-attention")).toBe(true);
    recalc()!.click();
    await flush();
    await controller.scan();
    expect(text).toContain(`| Total | 14 <meta f='=SUM([Qty])'> |`);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    // Still there, no longer highlighted
    expect(recalc()!.classList.contains("swt-attention")).toBe(false);
  });

  it("offers to recalculate a result of TODAY() once the day moved on, the table rendered again as it was", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2025, 10, 6, 12));
      const page = `| Day |\n|---|\n| 2025-11-06 <meta f='=TODAY()'> |\n`;
      await setup(page);
      const attention = () => {
        cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        return document.querySelector<HTMLElement>('.swt-bar button[aria-label="Recalculate"]')!.classList.contains("swt-attention");
      };
      expect(attention()).toBe(false);
      // The next day the page shows the same markdown again (scrolled back into view, opened again)
      vi.setSystemTime(new Date(2025, 10, 7, 12));
      renderPage(text, editor, cursorMoves);
      await controller.scan();
      expect(text).toBe(page);
      expect(attention()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("custom functions", () => {
    const GLOBAL_KEY = "__silverwareTable";
    afterEach(() => {
      clearCustomFunctions();
      delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    });
    const recalc = () => document.querySelector<HTMLElement>('.swt-bar button[aria-label="Recalculate"]');
    // As the docs' example: a reference is a one-cell list, toNumber takes it as its value
    const vat = (rate: number) => ({ name: "VAT", syntax: "VAT(amount)", minArgs: 1, maxArgs: 1, call: ([a]: Value[]) => (toNumber(a!) as number) * rate });
    const attention = () => {
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      return recalc()!.classList.contains("swt-attention");
    };
    const checked = () => new Promise((resolve) => setTimeout(resolve));

    it("calls a function defined from Space Lua; the tables are checked again when the definitions change", async () => {
      await setup("| Name | Price | Gross |\n|---|---|---|\n| Pear | 4 | |\n");
      // As the library page's entry does: the controller is the window's
      (globalThis as Record<string, unknown>)[GLOBAL_KEY] = controller;
      defineFunctions([vat(1.5)]);
      clickOn(cell(1, 2));
      await type("=VAT([@price])");
      expect(text).toContain(`| Pear | 4 | 6 <meta f='=VAT([@price])'> |`);
      expect(attention()).toBe(false);
      // Space Lua loaded again: the function is kept until the scripts define theirs
      resetDefinitions();
      await checked();
      expect(attention()).toBe(false);
      // Another version: viewing writes nothing, Recalculate is highlighted and writes the new result
      defineFunctions([vat(2)]);
      await checked();
      expect(attention()).toBe(true);
      expect(text).toContain(`| Pear | 4 | 6 <meta f='=VAT([@price])'> |`);
      recalc()!.click();
      await flush();
      await controller.scan();
      expect(text).toContain(`| Pear | 4 | 8 <meta f='=VAT([@price])'> |`);
      expect(attention()).toBe(false);
      // Loaded again, defined no more (its file gone): the result stays as written, Recalculate highlighted
      resetDefinitions();
      defineFunctions([{ name: "OTHER", call: () => 1 }]);
      await checked();
      expect(attention()).toBe(true);
      expect(text).toContain(`| Pear | 4 | 8 <meta f='=VAT([@price])'> |`);
    });

    it("says what is wrong with definitions, and defines the others", () => {
      expect(defineFunctions([{ name: "OK", call: () => 1 }, { name: "NOCALL" }])).toBe("Silverware Table: custom functions not defined: function 2: NOCALL has no call function");
      expect(defineFunctions([{ name: "OKAY", call: () => 1 }])).toBeUndefined();
      expect(functionNamed("OK")).toBeDefined();
    });
  });

  describe("referring to other tables", () => {
    const PAGE2 = [
      "| Name | Price |",
      "|---|---|",
      "| Pear | 12 |",
      "| Fig | 3 |",
      `| <meta name='prices'> |`,
      "",
      "| Fruit | Cost |",
      "|---|---|",
      `| Fig | 3 <meta f='=XLOOKUP([@fruit], prices![name], prices![price])'> |`,
      `| All | 15 <meta f='=SUM(prices![price])'> |`,
      "",
    ].join("\n");
    const second = (row: number, column: number) => editor.querySelectorAll("table")[1]!.rows[row]!.cells[column]!;

    it("writes the results of the tables that refer to an edited one, in the same edit", async () => {
      await setup(PAGE2, { "silverware.table.editor.enterKey": "save" });
      let edits = 0;
      const bridge = (controller as unknown as { bridge: { replaceRange: (...a: unknown[]) => unknown } }).bridge;
      const replace = bridge.replaceRange;
      bridge.replaceRange = (...args: unknown[]) => {
        edits++;
        return replace(...args);
      };
      clickOn(cell(2, 1)); // Fig's price
      await type("4");
      expect(edits).toBe(1);
      expect(text).toContain("| Fig | 4 |");
      expect(text).toContain(`| Fig | 4 <meta f='=XLOOKUP([@fruit], prices![name], prices![price])'> |`);
      expect(text).toContain(`| All | 16 <meta f='=SUM(prices![price])'> |`);
      expect(second(1, 1).textContent).toBe("4");
    });

    it("leaves the tables that do not refer to the edited one as they are", async () => {
      const unrelated = `| X |\n|---|\n| 1 <meta f='=stock!A1'> |\n`;
      await setup(`${PAGE2}\n${unrelated}`, { "silverware.table.editor.enterKey": "save" });
      clickOn(cell(2, 1));
      await type("4");
      expect(text).toContain(`| All | 16 <meta f='=SUM(prices![price])'> |`);
      expect(text).toContain(unrelated);
    });

    it("keeps the references of other tables on the cells they were to, and on the table when it is renamed", async () => {
      const PAGE3 = [
        "| Name | Price |",
        "|---|---|",
        "| Pear | 12 |",
        "| Fig | 3 |",
        `| <meta name='prices'> |`,
        "",
        "| Item | Cost |",
        "|---|---|",
        `| Fig | 3 <meta f='=prices!B2'> |`,
        "",
      ].join("\n");
      await setup(PAGE3);
      // A row inserted above Pear, from its row menu
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector(".swt-grip:not(.swt-grip-column)")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      menuButtons().find((b) => buttonLabel(b) === "Insert row above")!.click();
      await flush();
      await controller.scan();
      expect(text).toContain(`| Fig | 3 <meta f='=prices!B3'> |`);
      // Renamed in the ⋯ menu's title
      tableMenuItem(/^Edit markdown$/);
      expect(await nameInMenu("costs")).toBeUndefined();
      expect(text).toContain(`<meta name='costs'>`);
      expect(text).toContain(`| Fig | 3 <meta f='=costs!B3'> |`);
    });

    it("offers to recalculate a table when the one it refers to was changed in the markdown", async () => {
      await setup(PAGE2.replace("| Fig | 3 |", "| Fig | 5 |"));
      second(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      const recalc = document.querySelector<HTMLElement>('.swt-bar button[aria-label="Recalculate"]')!;
      expect(recalc.classList.contains("swt-attention")).toBe(true);
      recalc.click();
      await flush();
      expect(text).toContain(`| Fig | 5 <meta f='=XLOOKUP([@fruit], prices![name], prices![price])'> |`);
      expect(text).toContain(`| All | 17 <meta f='=SUM(prices![price])'> |`);
    });
  });

  describe("referring to tables on other pages", () => {
    const OTHER = `# Prices\n\n| Name | Price |\n|---|---|\n| Pear | 12 |\n| Fig | 3 |\n| <meta name='fruit'> |\n`;
    const HERE = "| Item | Cost |\n|---|---|\n| Fig | |\n";
    const withPages = (pages: Record<string, string>) => {
      const read: string[] = [];
      (controller as unknown as { bridge: Record<string, unknown> }).bridge.readPage = (name: string) => {
        read.push(name);
        if (!(name in pages)) throw new Error(`no page ${name}`);
        return pages[name]!;
      };
      return read;
    };

    it("reads a table of another page, again for every edit", async () => {
      await setup(HERE, { "silverware.table.editor.enterKey": "save" });
      const pages: Record<string, string> = { Prices: OTHER };
      const read = withPages(pages);
      clickOn(cell(1, 1));
      await type("=XLOOKUP([@item], [[Prices]]fruit![name], [[Prices]]fruit![price])");
      expect(text).toBe(`| Item | Cost |\n|---|---|\n| Fig | 3 <meta f='=XLOOKUP([@item], [[Prices]]fruit![name], [[Prices]]fruit![price])'> |\n`);
      expect(read).toEqual(["Prices"]);
      // The other page changed: the next edit reads it again
      pages.Prices = OTHER.replace("| Fig | 3 |", "| Fig | 7 |");
      clickOn(cell(1, 0));
      await type("fig");
      expect(text).toContain("| fig | 7 <meta");
      expect(read).toEqual(["Prices", "Prices"]);
    });

    it("highlights Recalculate when the other page is indexed again with changes", async () => {
      const pages: Record<string, string> = { Prices: OTHER };
      // Read when the table shows
      await setup(`| Item | Cost |\n|---|---|\n| Fig | 3 <meta f='=[[Prices]]fruit!B2'> |\n`, {}, { readPage: (name) => pages[name]! });
      const recalc = () => {
        cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        return document.querySelector<HTMLElement>('.swt-bar button[aria-label="Recalculate"]')!;
      };
      expect(recalc().classList.contains("swt-attention")).toBe(false);
      pages.Prices = OTHER.replace("| Fig | 3 |", "| Fig | 5 |");
      await controller.pageIndexed("Prices");
      expect(recalc().classList.contains("swt-attention")).toBe(true);
      recalc().click();
      await flush();
      expect(text).toContain(`| Fig | 5 <meta f='=[[Prices]]fruit!B2'> |`);
    });

    it("does not read other pages for an edit of a table that has nothing to do with them", async () => {
      const read: string[] = [];
      const page = `| Item | Cost |\n|---|---|\n| Fig | 3 <meta f='=[[Prices]]fruit!B2'> |\n\n| A |\n|---|\n| 1 |\n`;
      await setup(page, { "silverware.table.editor.enterKey": "save" }, { readPage: (name) => (read.push(name), OTHER) });
      expect(read).toEqual(["Prices"]); // read when the table showed
      const unrelated = editor.querySelectorAll("table")[1]!.rows[1]!.cells[0]!;
      clickOn(unrelated);
      await type("2");
      expect(text).toContain("| 2 |");
      expect(read).toEqual(["Prices"]);
    });

    it("reads no other page with the pageLinks module off: the results stay as written", async () => {
      const read: string[] = [];
      const page = `| Item | Cost | Twice |\n|---|---|---|\n| Fig | 7 <meta f='=[[Prices]]fruit!B2'> | 0 <meta f='=[@cost]*2'> |\n| Kiwi | | |\n`;
      await setup(
        page,
        { "silverware.table.editor.enterKey": "save", "silverware.table.modules.pageLinks.enabled": false },
        { readPage: (name) => (read.push(name), OTHER) },
      );
      // Stale only for the formula using it: Twice is not yet 14
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      expect(document.querySelector('.swt-bar button[aria-label="Recalculate"]')!.classList.contains("swt-attention")).toBe(true);
      document.querySelector<HTMLElement>('.swt-bar button[aria-label="Recalculate"]')!.click();
      await flush();
      // The kept result counts for the formulas using it; a new link has none to keep
      expect(text).toContain(`| Fig | 7 <meta f='=[[Prices]]fruit!B2'> | 14 <meta f='=[@cost]*2'> |`);
      await controller.scan();
      clickOn(cell(2, 1));
      await type("=[[Prices]]fruit!B1");
      expect(text).toContain(`| Kiwi | #REF! <meta f='=[[Prices]]fruit!B1'> |`);
      expect(cell(2, 1).title).toContain("the other page is not read");
      expect(read).toEqual([]);
    });

    it("gives an error's real reason once the page it refers to is read", async () => {
      const page = `| Item | Cost |\n|---|---|\n| Fig | #REF! <meta f='=[[Nowhere]]fruit!B1'> |\n`;
      await setup(page, {}, {
        readPage: () => {
          throw new Error("no such page");
        },
      });
      for (let i = 0; i < 3; i++) await flush();
      expect(cell(1, 1).title).toContain("there is no table named fruit on Nowhere");
    });

    it("reads no other page with the formulas module off", async () => {
      const read: string[] = [];
      await setup(
        `| Item | Cost |\n|---|---|\n| Fig | 3 <meta f='=[[Prices]]fruit!B2'> |\n`,
        { "silverware.table.editor.enterKey": "save", "silverware.table.modules.formulas.enabled": false },
        { readPage: (name) => (read.push(name), OTHER) },
      );
      clickOn(cell(1, 0));
      await type("Figs");
      expect(text).toContain("| Figs |");
      expect(read).toEqual([]);
    });

    it("says when the page or its table is not there", async () => {
      await setup(HERE, { "silverware.table.editor.enterKey": "save" });
      withPages({ Prices: OTHER });
      clickOn(cell(1, 1));
      await type("=[[Nowhere]]fruit!B1");
      expect(text).toContain("| Fig | #REF! <meta");
      expect(cell(1, 1).title).toContain("there is no table named fruit on Nowhere");
    });
  });

  describe("fixed column names", () => {
    const PRICES = `| Unit price | Total |\n|---|---|\n| 3 | 3 <meta f='=SUM([unit_price])'> |\n`;
    const openColumnMenu = (column: number) => {
      cell(1, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector(".swt-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    };

    it("gives a column a fixed name from its menu, and its references then use it", async () => {
      await setup(PRICES, { "silverware.table.editor.enterKey": "save" });
      openColumnMenu(0);
      // Named in the menu's title, which then shows the name; the menu closes
      expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Column: Unit price");
      expect(await nameInMenu("price")).toBeUndefined();
      expect(document.querySelector(".swt-menu")).toBeNull();
      await controller.scan();
      expect(text).toBe(`| Unit price <meta n='price'> | Total |\n|---|---|\n| 3 | 3 <meta f='=SUM([price])'> |\n`);
      // The header shows without it, and is edited as the name only: the fixed name stays
      expect(cell(0, 0).textContent!.trim().startsWith("Unit price")).toBe(true);
      clickOn(cell(0, 0));
      expect(field().value).toBe("Unit price");
      await type("Cost");
      expect(text).toBe(`| Cost <meta n='price'> | Total |\n|---|---|\n| 3 | 3 <meta f='=SUM([price])'> |\n`);
    });

    it("refuses a name another column answers to", async () => {
      await setup('| A | B |\n|---|---|\n| 1 | 2 |\n');
      openColumnMenu(0);
      expect(await nameInMenu("b")).toBe("another column of this table is named b");
      expect(text).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n");
    });

    it("keeps a cell's name when the cell is edited", async () => {
      await setup(`| A |\n|---|\n| 1 <meta cn='one'> |\n`, { "silverware.table.editor.enterKey": "save" });
      clickOn(cell(1, 0));
      expect(field().value).toBe("1");
      await type("2");
      expect(text).toBe(`| A |\n|---|\n| 2 <meta cn='one'> |\n`);
    });
  });

  describe("named cells", () => {
    const PAGE4 = [
      "| Rate | Value |",
      "|---|---|",
      "| VAT | 0.21 |",
      "| <meta name='rates'> |",
      "",
      "| Item | Price | Gross |",
      "|---|---|---|",
      `| Pear | 100 | 121 <meta f='=[@price]*(1+rates!vat)'> |`,
      "",
    ].join("\n");
    const openRowMenu = (row: number, column: number) => {
      // A menu still open would be closed by the next grip click instead
      if (document.querySelector(".swt-menu")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      // Over another cell first: the grips come back once the pointer moves to a cell
      cell(0, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      cell(row, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector(".swt-grip:not(.swt-grip-column)")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    };
    const item = (label: RegExp) => menuButtons().find((b) => label.test(buttonLabel(b)))!;

    it("names a cell from its menu; the tables using the name get its value in the same edit", async () => {
      await setup(PAGE4.replace(`121 <meta f='=[@price]*(1+rates!vat)'>`, `0 <meta f='=[@price]*(1+rates!vat)'>`), { "silverware.table.editor.enterKey": "save" });
      cellMenuItem(cell(1, 1), /^Copy$/);
      expect(await nameInMenu("vat")).toBeUndefined();
      await controller.scan();
      expect(text).toContain(`| VAT | 0.21 <meta cn='vat'> |`);
      expect(text).toContain(`| Pear | 100 | 121 <meta f='=[@price]*(1+rates!vat)'> |`);
      expect(cell(1, 1).classList.contains("swt-named")).toBe(true);
      expect(cell(1, 1).title).toBe("Name: vat");
      // Its value changed: the other table follows, in the same edit
      clickOn(cell(1, 1));
      expect(field().value).toBe("0.21");
      await type("0.1");
      expect(text).toContain(`| VAT | 0.1 <meta cn='vat'> |`);
      expect(text).toContain(`| Pear | 100 | 110 <meta f='=[@price]*(1+rates!vat)'> |`);
    });

    it("names a row from its menu, refusing a name another row of the table has", async () => {
      await setup(`| Name | Price |\n|---|---|\n| Pear <meta n='pear'> | 12 |\n| Fig | 3 |\n`, { "silverware.table.editor.enterKey": "save" });
      openRowMenu(2, 1);
      expect(await nameInMenu("PEAR")).toBe("another row of this table is named PEAR");
      // Refused, the field stays for another name
      expect(await nameInMenu("fig")).toBeUndefined();
      await controller.scan();
      openRowMenu(2, 1);
      expect(document.querySelector(".swt-menu-title")!.textContent).toBe("Row: fig");
      expect(text).toBe(`| Name | Price |\n|---|---|\n| Pear <meta n='pear'> | 12 |\n| Fig <meta n='fig'> | 3 |\n`);
      expect(cell(2, 0).classList.contains("swt-row-named")).toBe(true);
      expect(cell(2, 0).title).toBe("Row name: fig");
      // Editing the first cell keeps the row's name
      clickOn(cell(2, 0));
      expect(field().value).toBe("Fig");
      await type("Figs");
      expect(text).toContain(`| Figs <meta n='fig'> | 3 |`);
    });

    it("asks before deleting a column that holds names of rows or cells", async () => {
      const NAMED = `| Name | Price | Note |\n|---|---|---|\n| Pear <meta n='pear'> | 12 | a |\n| Fig <meta n='fig'> | 3 <meta cn='fig_price'> | b |\n`;
      await setup(NAMED);
      const confirm = vi.spyOn(window, "confirm");
      const deleteColumn = async (column: number) => {
        if (document.querySelector(".swt-menu")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        // Over another cell first: the grips come back once the pointer moves to a cell
        cell(0, column === 0 ? 1 : 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        cell(1, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        document.querySelector(".swt-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
        item(/^Delete column$/).click();
        await flush();
      };
      confirm.mockReturnValue(false);
      await deleteColumn(0);
      expect(confirm).toHaveBeenLastCalledWith(
        "Deleting this column also removes the names of 2 rows pear and fig: formulas that use them show #REF! or #NAME?. Delete the column? Ctrl+Z brings it back.",
      );
      expect(text).toBe(NAMED);
      await deleteColumn(1);
      expect(confirm).toHaveBeenLastCalledWith(
        "Deleting this column also removes the name of the cell fig_price: formulas that use it show #REF! or #NAME?. Delete the column? Ctrl+Z brings it back.",
      );
      expect(text).toBe(NAMED);
      // Without names: no question
      confirm.mockClear();
      await deleteColumn(2);
      expect(confirm).not.toHaveBeenCalled();
      expect(text).toBe(`| Name | Price |\n|---|---|\n| Pear <meta n='pear'> | 12 |\n| Fig <meta n='fig'> | 3 <meta cn='fig_price'> |\n`);
      await controller.scan();
      confirm.mockReturnValue(true);
      await deleteColumn(0);
      expect(text).toBe(`| Price |\n|---|\n| 12 |\n| 3 <meta cn='fig_price'> |\n`);
    });

    const TWO_TABLES = `| A | B |\n|---|---|\n| 1 <meta cn='one'> | 2 |\n\n| C |\n|---|\n| 3 <meta cn='two'> |\n`;

    it("refuses a name another cell of the table has, or a function's; takes one a cell of another table has", async () => {
      await setup(TWO_TABLES);
      cellMenuItem(cell(1, 1), /^Copy$/);
      expect(await nameInMenu("ONE")).toBe("another cell of this table is named ONE");
      expect(await nameInMenu("sum")).toBe("sum is a function's name");
      // A custom one's too
      defineCustomFunctions([{ name: "VAT", syntax: "VAT()", description: "", minArgs: 0, call: () => 1 }]);
      const why = await nameInMenu("vat");
      clearCustomFunctions();
      expect(why).toBe("vat is a function's name");
      expect(text).toBe(TWO_TABLES);
      // A name is the table's: the other table's cell two does not take it
      expect(await nameInMenu("two")).toBeUndefined();
      expect(text).toContain(`| 1 <meta cn='one'> | 2 <meta cn='two'> |`);
    });

    it("leaves the names out of a duplicated row: a name is the table's", async () => {
      await setup(`| A | B |\n|---|---|\n| 1 <meta cn='one'> | 2 |\n`);
      openRowMenu(1, 1);
      item(/^Duplicate row/).click();
      await flush();
      expect(text).toBe(`| A | B |\n|---|---|\n| 1 <meta cn='one'> | 2 |\n| 1 | 2 |\n`);
    });
  });

  describe("with the metadata setting off", () => {
    const OFF = { "silverware.table.metadata": false };

    it("saves a typed formula as text, and says why while it is typed", async () => {
      await setup(TOTAL, OFF);
      clickOn(cell(3, 1));
      field().value = "=SUM(B1:B2)";
      field().dispatchEvent(new Event("input", { bubbles: true }));
      expect(document.querySelector(".swt-formula-hint")!.textContent).toBe(FORMULAS_NEED_METADATA);
      expect(document.querySelectorAll(".swt-ref-mark").length).toBe(0);
      key(field(), "Enter");
      await flush();
      expect(text).toContain("| Total | =SUM(B1:B2) |");
      expect(flashes).toEqual([`Silverware Table: ${FORMULAS_NEED_METADATA}; saved as text`]);
    });

    it("keeps existing formulas working: edited, recalculated", async () => {
      await setup(`| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | 13 <meta f='=SUM([qty])'> |\n`, OFF);
      clickOn(cell(3, 1));
      expect(field().value).toBe("=SUM([qty])");
      await type("=SUM(B1:B2)*2");
      expect(text).toContain(`| Total | 26 <meta f='=SUM(B1:B2)*2'> |`);
      clickOn(cell(1, 1));
      await type("4");
      expect(text).toContain(`| Total | 28 <meta f='=SUM(B1:B2)*2'> |`);
    });
  });

  describe("with layout", () => {
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

    const marks = () => Array.from(document.querySelectorAll<HTMLElement>(".swt-ref-mark"));
    const pointer = (target: EventTarget, type: string, x: number, y: number) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));

    it("outlines each reference in its own color, with help under the cell", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(B1:B2) + A1";
      field().dispatchEvent(new Event("input"));
      expect(marks().map((m) => [m.style.left, m.style.top, m.style.width, m.style.height])).toEqual([
        ["100px", "20px", "100px", "40px"],
        ["0px", "20px", "100px", "20px"],
      ]);
      expect(marks()[0]!.style.getPropertyValue("--swt-ref-color")).not.toBe(marks()[1]!.style.getPropertyValue("--swt-ref-color"));
      expect(document.querySelector(".swt-formula-preview")!.textContent).toBe("=SUM(B1:B2) + A1");
      key(field(), "Escape");
      await flush();
      expect(marks()).toEqual([]);
      expect(document.querySelector(".swt-formula-hint")!.classList.contains("swt-visible")).toBe(false);
    });

    it("cuts an outline at the header held over the rows scrolled under it", async () => {
      await setup(TOTAL);
      // The page scrolled: the header held at the top over B1 (y 20–40), its bottom at 30
      Object.defineProperty(document.querySelector("thead")!, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 0, top: 10, width: 1000, height: 20, right: 1000, bottom: 30, x: 0, y: 10 }) as DOMRect,
      });
      clickOn(cell(3, 1));
      field().value = "=SUM([qty])";
      field().dispatchEvent(new Event("input"));
      // The column's body (y 20–80) from under the header down
      expect(marks().map((m) => [m.style.top, m.style.height])).toEqual([["30px", "50px"]]);
    });

    it("shows no help for a cell scrolled out of view", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(";
      field().dispatchEvent(new Event("input"));
      const hint = document.querySelector<HTMLElement>(".swt-formula-hint")!;
      expect(hint.classList.contains("swt-visible")).toBe(true);
      // The header held over the cell (y 60–80) as the page scrolls
      Object.defineProperty(document.querySelector("thead")!, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 0, top: 0, width: 1000, height: 90, right: 1000, bottom: 90, x: 0, y: 0 }) as DOMRect,
      });
      field().dispatchEvent(new Event("input"));
      expect(hint.classList.contains("swt-visible")).toBe(false);
    });

    it("keeps the formula's help where it was placed, and above the cell when an on-screen keyboard covers the room below", async () => {
      const visual = { width: 300, height: 120, offsetTop: 0, offsetLeft: 0, addEventListener: () => {}, removeEventListener: () => {} };
      Object.defineProperty(window, "visualViewport", { configurable: true, value: visual });
      const width = Object.getOwnPropertyDescriptor(window, "innerWidth");
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 300 });
      try {
        await setup(TOTAL);
        const hint = document.querySelector<HTMLElement>(".swt-formula-hint")!;
        // A box of no set width: as narrow as the room right of where it is (at most 400 px)
        Object.defineProperty(hint, "offsetWidth", { configurable: true, get: () => Math.min(400, 300 - (parseFloat(hint.style.left) || 0)) });
        Object.defineProperty(hint, "offsetHeight", { configurable: true, value: 50 });
        clickOn(cell(3, 1));
        field().value = "=";
        field().dispatchEvent(new Event("input"));
        const left = hint.style.left;
        for (let i = 0; i < 3; i++) field().dispatchEvent(new Event("input"));
        expect(hint.style.left).toBe(left);
        expect(left).toBe("4px");
        // The cell at y 60–80, the keyboard from y 120 up: 36 px below, 56 above
        expect(hint.classList.contains("swt-above")).toBe(true);
        expect(hint.style.top).toBe("6px");
      } finally {
        delete (window as { visualViewport?: unknown }).visualViewport;
        if (width) Object.defineProperty(window, "innerWidth", width);
      }
    });

    it("moves a reference by dragging its outline, and resizes a range by its corner", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(B1)";
      field().dispatchEvent(new Event("input"));
      // Drag B1 (y 20–40) down one row
      pointer(marks()[0]!.querySelector(".swt-ref-top")!, "pointerdown", 150, 30);
      pointer(window, "pointermove", 150, 50);
      expect(field().value).toBe("=SUM(B2)");
      pointer(window, "pointerup", 150, 50);
      // Resize from B2 up to B1
      pointer(marks()[0]!.querySelector(".swt-ref-corner")!, "pointerdown", 150, 50);
      pointer(window, "pointermove", 150, 30);
      expect(field().value).toBe("=SUM(B1:B2)");
      pointer(window, "pointerup", 150, 30);
      expect(document.activeElement).toBe(field());
      key(field(), "Enter");
      await flush();
      expect(text).toContain(`| Total | 13 <meta f='=SUM(B1:B2)'> |`);
    });

    it("keeps a reference's $ as its outline is dragged or resized", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM($B$1)";
      field().dispatchEvent(new Event("input"));
      pointer(marks()[0]!.querySelector(".swt-ref-top")!, "pointerdown", 150, 30);
      pointer(window, "pointermove", 150, 50);
      expect(field().value).toBe("=SUM($B$2)");
      pointer(window, "pointerup", 150, 50);
      pointer(marks()[0]!.querySelector(".swt-ref-corner")!, "pointerdown", 150, 50);
      pointer(window, "pointermove", 150, 30);
      expect(field().value).toBe("=SUM($B$1:$B$2)");
      pointer(window, "pointerup", 150, 30);
    });

    it("inserts a cell, a dragged range or a clicked column where the formula expects a reference", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(";
      field().setSelectionRange(5, 5);
      // Press on B1 (y 20–40), drag to B2, release
      press(cell(1, 1), "mousedown", { clientX: 150, clientY: 30 });
      expect(field().value).toBe("=SUM(B1");
      window.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 150, clientY: 50 }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 150, clientY: 50 }));
      expect(field().value).toBe("=SUM(B1:B2");
      expect(document.querySelector(".swt-cell-editor")).not.toBeNull();
      // F4 cycles it, and pointing again still replaces it
      key(field(), "F4");
      expect(field().value).toBe("=SUM($B$1:$B$2");
      press(cell(2, 0), "mousedown", { clientX: 50, clientY: 50 });
      window.dispatchEvent(new MouseEvent("mouseup"));
      expect(field().value).toBe("=SUM(A2");
      // After a comma, a click on the header inserts the column
      field().value = "=SUM(A2, ";
      field().setSelectionRange(9, 9);
      press(cell(0, 1), "mousedown", { clientX: 150, clientY: 10 });
      window.dispatchEvent(new MouseEvent("mouseup"));
      expect(field().value).toBe("=SUM(A2, [qty]");
      field().value += ")";
      key(field(), "Enter");
      await flush();
      expect(text).toContain(`| Total | 13 <meta f='=SUM(A2, [qty])'> |`);
    });

    it("shows that cells can be pointed at, extends with Shift+click and stops a drag when editing ends", async () => {
      await setup(TOTAL);
      const widget = () => editor.querySelector<HTMLElement>(".sb-table-widget")!;
      clickOn(cell(3, 1));
      field().value = "=SUM(";
      field().setSelectionRange(5, 5);
      field().dispatchEvent(new Event("input"));
      expect(widget().classList.contains("swt-pointing")).toBe(true);
      press(cell(1, 1), "mousedown", { clientX: 150, clientY: 30 });
      window.dispatchEvent(new MouseEvent("mouseup"));
      press(cell(2, 1), "mousedown", { clientX: 150, clientY: 50, shiftKey: true });
      window.dispatchEvent(new MouseEvent("mouseup"));
      expect(field().value).toBe("=SUM(B1:B2");
      // Typing makes it part of the formula: no more pointing after it
      key(field(), ")");
      field().value = "=SUM(B1:B2)";
      field().setSelectionRange(11, 11);
      field().dispatchEvent(new Event("input"));
      expect(widget().classList.contains("swt-pointing")).toBe(false);
      // A drag whose editor closes stops changing anything
      field().value = "=SUM(B1:B2)+";
      field().setSelectionRange(12, 12);
      press(cell(1, 0), "mousedown", { clientX: 50, clientY: 30 });
      expect(field().value).toBe("=SUM(B1:B2)+A1");
      const closed = field();
      key(closed, "Escape");
      window.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 50, clientY: 50 }));
      expect(closed.value).toBe("=SUM(B1:B2)+A1");
      expect(widget().classList.contains("swt-pointing")).toBe(false);
    });

    it("ends editing after a typed reference instead of replacing it", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=B1+B2";
      field().setSelectionRange(6, 6);
      clickOn(cell(1, 0));
      await flush();
      expect(text).toContain(`| Total | 13 <meta f='=B1+B2'> |`);
    });

    it("ends editing as before when a click comes after a complete operand", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(B1:B2)";
      field().setSelectionRange(11, 11);
      clickOn(cell(1, 0));
      await flush();
      expect(text).toContain(`| Total | 13 <meta f='=SUM(B1:B2)'> |`);
    });

    it("puts the reference back when a drag is cancelled with Esc", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=[Qty]";
      field().dispatchEvent(new Event("input"));
      expect(marks().length).toBe(1);
      pointer(marks()[0]!.querySelector(".swt-ref-left")!, "pointerdown", 150, 30);
      pointer(window, "pointermove", 50, 30);
      expect(field().value).toBe("=[name]");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      expect(field().value).toBe("=[Qty]");
      expect(document.querySelector(".swt-cell-editor")).not.toBeNull();
    });
  });
});
