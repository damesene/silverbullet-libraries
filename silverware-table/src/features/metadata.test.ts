// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseTable } from "../markdown.ts";
import { PAGE, bodyTexts, cell, clickOn, controller, editor, flashes, flush, key, nameInMenu, setup, tableMenuItem, text, toolbarName, useTablePage } from "../testing/page.ts";

describe("Table metadata", () => {
  useTablePage();

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const META_PAGE = `| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| <meta core.table core.-c-qty.sort='desc'> |\n`;

  it("names a table from its toolbar, refusing a name that is taken or not valid", async () => {
    const TWO = `| A |\n|---|\n| 1 |\n\n| B |\n|---|\n| 2 |\n| <meta core.table core.name='prices'> |\n`;
    await setup(TWO, { "silverware.table.metadata": true });
    const title = () => document.querySelector(".swt-menu-title")!.textContent;
    // No name: the ⋯ menu's title is Table, its pencil the name's field
    tableMenuItem(/^Edit markdown$/);
    expect(title()).toBe("Table");
    toolbarName("table");
    // Taken by the other table (ignoring case)
    expect(await nameInMenu("Prices")).toBe("another table on this page is named Prices");
    expect(text).toBe(TWO);
    // Not a name
    expect(await nameInMenu("A1")).toContain('"A1" would read as a cell');
    expect(text).toBe(TWO);
    expect(await nameInMenu("fruit")).toBeUndefined();
    expect(text).toBe(TWO.replace("| 1 |\n", `| 1 |\n| <meta core.table core.name='fruit'> |\n`));
    // Saved, the menu closes; opened again, its title is the name
    expect(document.querySelector(".swt-menu")).toBeNull();
    await controller.scan();
    tableMenuItem(/^Edit markdown$/);
    expect(title()).toBe("fruit");
    toolbarName("table");
    expect(document.querySelector<HTMLInputElement>(".swt-menu .swt-menu-name")!.value).toBe("fruit");
    // An empty name removes it
    expect(await nameInMenu("")).toBeUndefined();
    expect(text).toBe(TWO);
  });

  it("keeps a name's field to itself: arrows skip the pencil, a copy there copies no cells, Enter on the name as it was hands the keyboard back", async () => {
    await setup(`| A |\n|---|\n| 1 |\n| <meta core.table core.name='fruit'> |\n`, { "silverware.table.metadata": true });
    tableMenuItem(/^Edit markdown$/);
    const menu = document.querySelector<HTMLElement>(".swt-menu")!;
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    // The first of its items, not the pencil: Full screen
    expect(document.activeElement?.classList.contains("swt-menu-rename")).toBe(false);
    expect(document.activeElement?.textContent).toBe("Full screen");
    // The cell selected, then the name's field: a copy there is the field's
    clickOn(cell(1, 0));
    key(document.activeElement ?? editor, "Escape");
    toolbarName("table");
    const field = document.querySelector<HTMLInputElement>(".swt-menu .swt-menu-name")!;
    expect(document.activeElement).toBe(field);
    field.setSelectionRange(5, 5);
    window.dispatchEvent(new Event("copy", { bubbles: true, cancelable: true }));
    expect(flashes).toEqual([]);
    key(field, "Enter");
    await flush();
    expect(text).toBe(`| A |\n|---|\n| 1 |\n| <meta core.table core.name='fruit'> |\n`);
    expect(document.querySelector(".swt-menu")).toBeNull();
    expect(document.activeElement).toBe(editor);
  });

  it("offers a name only with the setting on, or to rename a table named already", async () => {
    const pencil = () => document.querySelector<HTMLElement>(".swt-menu .swt-menu-rename")!;
    await setup(PAGE);
    toolbarName("table");
    expect(pencil().getAttribute("aria-disabled")).toBe("true");
    // A metadata row without a name: nothing new is stored with the setting off
    controller.stop();
    document.body.replaceChildren();
    await setup(`| A |\n|---|\n| 1 |\n| 2 |\n| <meta core.table core.pin-top='1'> |\n`);
    toolbarName("table");
    expect(pencil().getAttribute("aria-disabled")).toBe("true");
    // A name it has may change
    controller.stop();
    document.body.replaceChildren();
    await setup(`| A |\n|---|\n| 1 |\n| 2 |\n| <meta core.table core.name='fruit'> |\n`);
    // (Allowed: the name's field opens at once)
    toolbarName("table");
    expect(document.querySelector(".swt-menu .swt-menu-name")).not.toBeNull();
  });

  it("does not change the table when sorting with the setting off", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    await wait(700);
    expect(text).toBe(PAGE);
  });

  it("with the setting off, changes a sorting stored, but stores none in a table that has none (a name only)", async () => {
    const SORTED = `| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| <meta core.table core.-c-qty.sort='desc'> |\n`;
    await setup(SORTED);
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    await wait(700);
    expect(text).toContain("core.-c-name.sort='asc'");
    controller.stop();
    document.body.replaceChildren();
    const NAMED = `| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| <meta core.table core.name='fruit'> |\n`;
    await setup(NAMED);
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    await wait(700);
    expect(text).toBe(NAMED);
  });

  it("with the setting off, takes the hidden values new to a table off a write, and says so; those it has stay", async () => {
    await setup(`| Name | Qty |\n|---|---|\n| Pear <meta x.note='a'> | 3 |\n| apple | 10 |\n`);
    const [info] = controller.shownTables();
    await controller.writeTable(info!, (t) => ({
      ...t,
      rows: t.rows.map((row, r) => (r === 1 ? { cells: ["Pears <meta x.note='b'>", "3 <meta x.note='c'>"] } : r === 2 ? { cells: ["apple <meta x.other='1'>", "10"] } : row)),
    }));
    expect(text).toContain("| Pears <meta x.note='b'> | 3 |");
    expect(text).toContain("| apple | 10 |");
    expect(flashes.some((f) => f.includes("2 new hidden values") && f.includes("not stored"))).toBe(true);
    // (Pins: only where the table has them)
    expect(controller.canPin(parseTable(`| A |\n|---|\n| 1 |\n| <meta core.table core.pin-top='1'> |`), "top")).toBe(true);
    expect(controller.canPin(parseTable(`| A |\n|---|\n| 1 |\n| <meta core.table core.pin-top='1'> |`), "bottom")).toBe(false);
  });

  it("stores the sorting with the setting on, only where the clicks end", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    clickOn(cell(0, 1).querySelector(".swt-sort")!); // Qty ascending
    clickOn(cell(0, 1).querySelector(".swt-sort")!); // Qty descending
    await wait(700);
    await controller.scan();
    expect(text).toBe(PAGE.replace("| Fig | 2 |\n", `| Fig | 2 |\n| <meta core.table core.-c-qty.sort='desc'> |\n`));
    expect(bodyTexts()).toEqual(["apple", "Pear", "Fig"]);
    clickOn(cell(0, 1).querySelector(".swt-sort")!); // back to the order as written
    await wait(700);
    expect(text).toBe(PAGE);
  });

  it("hides the metadata row and uses its sorting as the first view", async () => {
    await setup(META_PAGE);
    expect(bodyTexts()).toEqual(["apple", "Pear"]);
    const rows = editor.querySelectorAll("table tr");
    expect(rows[rows.length - 1]!.classList.contains("swt-meta-row")).toBe(true);
  });

  it("keeps updating a table's metadata with the setting off", async () => {
    await setup(META_PAGE); // the setting is off; the table stores Qty descending
    clickOn(cell(0, 1).querySelector(".swt-sort")!); // Qty: descending → the order as written
    await wait(700);
    // the stored sorting is cleared, and the row, now empty, goes
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n");
  });

  it("removes a table's metadata from its toolbar, and of all tables with the command", async () => {
    await setup(META_PAGE);
    const remove = () => tableMenuItem(/^Remove metadata$/)!;
    let agree = false;
    const questions: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      questions.push(message);
      return agree;
    };
    remove().click(); // declined: nothing changes
    await flush();
    expect(text).toBe(META_PAGE);
    expect(questions[0]).toContain("this table's metadata");
    agree = true;
    remove().click();
    await flush();
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n");

    controller.stop();
    document.body.replaceChildren();
    await setup(`${META_PAGE}\n${META_PAGE.replace("Qty:desc", "Name:asc")}`);
    const asked: string[] = [];
    let answer = false;
    const bridge = (controller as unknown as { bridge: Record<string, unknown> }).bridge;
    bridge.confirm = (message: string) => {
      asked.push(message);
      return answer;
    };
    await controller.removeAllMetadata(); // declined: nothing changes
    expect(text).toContain("<meta");
    expect(asked[0]).toContain("all 2 tables on this page");
    answer = true;
    await controller.removeAllMetadata();
    expect(text).not.toContain("<meta");
    expect(flashes).toEqual(["Silverware Table: removed the metadata of 2 table(s)"]);
  });

  it("shows the rows as written once the metadata with their sorting is removed", async () => {
    await setup(META_PAGE);
    expect(bodyTexts()).toEqual(["apple", "Pear"]); // stored: Qty descending
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = () => true;
    tableMenuItem(/^Remove metadata$/)!.click();
    await flush();
    await controller.scan();
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n");
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    expect(cell(0, 1).querySelector(".swt-sort")!.textContent).toBe("⇅");

    // The same with the command for the whole page
    controller.stop();
    document.body.replaceChildren();
    await setup(META_PAGE);
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = () => true;
    await controller.removeAllMetadata();
    await controller.scan();
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
  });

  it("says it removes what a module turned off keeps in cells too", async () => {
    const page = `| Name | Qty |\n|---|---|\n| Pear <meta core.n='pear'> | 3 |\n| Total | 3 <meta formulas.f='=SUM([Qty])'> |\n`;
    await setup(page, { "silverware.table.modules.formulas.enabled": false });
    const questions: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      questions.push(message);
      return true;
    };
    tableMenuItem(/^Remove metadata$/)!.click();
    await flush();
    // Named by whose it is, the module turned off too
    expect(questions[0]).toBe("Remove this table's metadata, what Silverware Table (1 cell) and Formulas (1 cell) keep in it? Cells keep their text, a formula's cell its result. Ctrl+Z brings it back.");
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Total | 3 |\n");
  });

  it("removes formulas with the metadata, keeping their results, and says so", async () => {
    const page = `| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Total | 3 <meta formulas.f='=SUM([Qty])'> |\n| <meta core.table core.-c-qty.sort='desc'> |\n`;
    await setup(page);
    const questions: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      questions.push(message);
      return true;
    };
    tableMenuItem(/^Remove metadata$/)!.click();
    await flush();
    expect(questions[0]).toContain("what Silverware Table and Formulas (1 cell) keep in it? Cells keep their text, a formula's cell its result");
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Total | 3 |\n");

    // A table with formulas only: the button shows, and the command counts it
    controller.stop();
    document.body.replaceChildren();
    await setup(`| A |\n|---|\n| 1 |\n| 2 <meta formulas.f='=A1*2'> |\n`);
    const asked: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      asked.push(message);
      return true;
    };
    await controller.removeAllMetadata();
    expect(asked[0]).toContain("the 1 table on this page, what Formulas (1 cell) keeps in it?");
    expect(text).toBe("| A |\n|---|\n| 1 |\n| 2 |\n");
  });

  it("keeps the metadata row last and follows a renamed column", async () => {
    // Enter only saves the header: the cell below would open
    await setup(META_PAGE, { "silverware.table.editor.enterKey": "save" });
    clickOn(cell(0, 1)); // the Qty header
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "Count";
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    await flush();
    await controller.scan();
    expect(text).toBe(`| Name | Count |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| <meta core.table core.-c-count.sort='desc'> |\n`);
    // a row added at the end goes above the metadata row
    clickOn(editor.querySelector('tr[data-swt-row="1"]')!.querySelector("td")!); // Pear (shown last)
    key(editor.querySelector(".swt-cell-editor")!, "Tab");
    key(editor.querySelector(".swt-cell-editor")!, "Tab");
    await flush();
    await controller.scan();
    expect(text.split("\n").slice(-3)).toEqual(["| | |", `| <meta core.table core.-c-count.sort='desc'> |`, ""]);
  });
});
