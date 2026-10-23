// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { insertRow } from "../ops.ts";
import { controller, edits, flashes, flush, nameInMenu, setup, tableMenuItem, text, toolbarName, useTablePage } from "../testing/page.ts";

const PAGE = [
  "| Item | Qty |",
  "|---|---|",
  "| Pear | 3 |",
  "| Fig | 2 |",
  "| <meta core.table core.name='costs' sheet.name='Budget' sheet.at='A1' sheet.width.B='140'> |",
  "",
  "| Month | Income |",
  "|---|---|",
  "| Jan | 100 |",
  "",
  "| Note |",
  "|---|",
  "| ok |",
  "| <meta core.table core.name='notes' sheet.name='Budget' sheet.at='D1'> |",
  "",
].join("\n");

describe("Sheets: a table put on a sheet, moved and taken off it by its sheet's name in the toolbar", () => {
  useTablePage();

  it("shows the sheet in its row of the ⋯ menu, Sheet: Budget, Sheet alone on none, its × taking it off disabled there", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    const row = (table: number) => {
      tableMenuItem(/^Edit markdown$/, table);
      return document.querySelector(".swt-menu .swt-menu-row-container")!;
    };
    expect(row(0).querySelector(".swt-label")!.textContent).toBe("Sheet: Budget");
    expect(row(0).querySelectorAll(".swt-segment")[1]!.getAttribute("aria-disabled")).toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(row(1).querySelector(".swt-label")!.textContent).toBe("Sheet");
    expect(row(1).querySelectorAll(".swt-segment")[1]!.getAttribute("aria-disabled")).toBe("true");
    // No item of its own in the ⋯ menu (the sheet view is the sheet module's)
    expect(Array.from(document.querySelectorAll(".swt-menu .swt-menu-item"), (b) => b.textContent).filter((l) => /sheet/i.test(l!))).toEqual(["Sheet view"]);
  });

  it("takes a table off its sheet by Remove from sheet under the field, its name kept; none on a table on no sheet", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    toolbarName("container", 1);
    expect(document.querySelector(".swt-menu-name-clear")).toBeNull();
    toolbarName("container", 0);
    const clear = document.querySelector<HTMLElement>(".swt-menu-name-clear")!;
    expect(clear.textContent).toBe("Remove from sheet");
    clear.click();
    await flush();
    expect(text).toContain("| <meta core.table core.name='costs'> |");
    expect(edits).toBe(1);
  });

  it("puts a table on a sheet of the page by its name: named, in column A one empty row under the sheet's lowest table", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    toolbarName("container", 1);
    expect(await nameInMenu("budget")).toBeUndefined();
    // costs: A1 to A3 (rows 0 to 2), notes: D1 to D2: one empty row, then A5; the sheet's name as the page has it
    expect(text).toContain("| <meta core.table core.name='table1' sheet.name='Budget' sheet.at='A5'> |");
    expect(flashes.some((f) => f.includes("named table1"))).toBe(true);
    expect(edits).toBe(1);
  });

  it("the only table of its sheet moved to a sheet no table is on (the sheet renamed): the sheet's widths go with it", async () => {
    await setup("| Item |\n|---|\n| Pear |\n| <meta core.table core.name='costs' sheet.name='Budget' sheet.at='A1' sheet.width.B='140'> |\n", { "silverware.table.metadata": true });
    toolbarName("container", 0);
    expect(await nameInMenu("Plan")).toBeUndefined();
    expect(text).toContain("| <meta core.table core.name='costs' sheet.name='Plan' sheet.at='A1' sheet.width.B='140'> |");
  });

  it("moves a table to a new sheet by a new name: its place kept, the sheet's widths handed on to the next table, one edit", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    toolbarName("container", 0);
    expect(await nameInMenu("Other")).toBeUndefined();
    expect(text).toContain("| <meta core.table core.name='costs' sheet.name='Other' sheet.at='A1'> |");
    expect(text).toContain("| <meta core.table core.name='notes' sheet.name='Budget' sheet.at='D1' sheet.width.B='140'> |");
    expect(edits).toBe(1);
  });

  it("moved where its place is taken on that sheet: under that sheet's lowest table", async () => {
    const page = `${PAGE}\n| City |\n|---|\n| Brno |\n| <meta core.table core.name='cities' sheet.name='Other' sheet.at='A1'> |\n`;
    await setup(page, { "silverware.table.metadata": true });
    toolbarName("container", 0);
    expect(await nameInMenu("Other")).toBeUndefined();
    // cities: A1 to A2: one empty row, then A4
    expect(text).toContain("| <meta core.table core.name='costs' sheet.name='Other' sheet.at='A4'> |");
  });

  it("refuses a name that cannot be a sheet's", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    toolbarName("container", 1);
    expect(await nameInMenu("x".repeat(61))).toBe("a sheet's name is at most 60 characters");
    expect(text).toBe(PAGE);
  });

  it("takes a table off its sheet with an empty name: its name kept, the sheet's widths handed on, one edit", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    toolbarName("container", 0);
    expect(await nameInMenu("")).toBeUndefined();
    expect(text).toContain("| <meta core.table core.name='costs'> |");
    expect(text).toContain("| <meta core.table core.name='notes' sheet.name='Budget' sheet.at='D1' sheet.width.B='140'> |");
    expect(edits).toBe(1);
  });

  it("with the metadata setting off, keeps the sheet's widths where they are: the table that becomes its first cannot take them", async () => {
    await setup(PAGE);
    // Costs taken off the sheet (a name it has may change), notes its first now: the widths stay in costs
    toolbarName("container", 0);
    expect(await nameInMenu("")).toBeUndefined();
    expect(text).toContain("| <meta core.table core.name='costs' sheet.width.B='140'> |");
    expect(text).toContain("| <meta core.table core.name='notes' sheet.name='Budget' sheet.at='D1'> |");
  });

  it("hands the sheet's widths to a table put on it before its first, in the same edit", async () => {
    await setup(`| X |\n|---|\n| 1 |\n\n${PAGE}`, { "silverware.table.metadata": true });
    toolbarName("container", 0);
    expect(await nameInMenu("Budget")).toBeUndefined();
    expect(text).toContain("| <meta core.table core.name='table1' sheet.name='Budget' sheet.at='A5' sheet.width.B='140'> |");
    expect(text).toContain("| <meta core.table core.name='costs' sheet.name='Budget' sheet.at='A1'> |");
    expect(edits).toBe(1);
  });
});

describe("Sheets: a table that grows makes room on its sheet", () => {
  useTablePage();

  // costs at A1 (A1:B3), under it totals at A6 and, side by side with it, notes at D6; beside costs, side at D1 (D1:D5)
  const SHEET = [
    "| Item | Qty |",
    "|---|---|",
    "| Pear | 3 |",
    "| Fig | 2 |",
    "| <meta core.table core.name='costs' sheet.name='Budget' sheet.at='A1'> |",
    "",
    "| Side |",
    "|---|",
    "| 1 |",
    "| 2 |",
    "| 3 |",
    "| 4 |",
    "| <meta core.table core.name='side' sheet.name='Budget' sheet.at='D1'> |",
    "",
    "| Total |",
    "|---|",
    "| 5 |",
    "| <meta core.table core.name='totals' sheet.name='Budget' sheet.at='A6'> |",
    "",
    "| Note |",
    "|---|",
    "| ok |",
    "| <meta core.table core.name='notes' sheet.name='Budget' sheet.at='D6'> |",
    "",
  ].join("\n");

  const costs = () => controller.shownTables()[0]!;
  const grow = (rows: number, claims: boolean) =>
    controller.writeTable(costs(), (t) => Array.from({ length: rows }).reduce<typeof t>((out) => insertRow(out, out.rows.length), t), claims ? { claims } : {});

  it("rows inserted: everything starting below moves down as far, side by side tables in line, the table beside stays, one edit", async () => {
    await setup(SHEET, { "silverware.table.metadata": true });
    await grow(2, false);
    await flush();
    expect(text).toContain("| <meta core.table core.name='totals' sheet.name='Budget' sheet.at='A8'> |");
    expect(text).toContain("| <meta core.table core.name='notes' sheet.name='Budget' sheet.at='D8'> |");
    expect(text).toContain("| <meta core.table core.name='side' sheet.name='Budget' sheet.at='D1'> |");
    expect(edits).toBe(1);
  });

  it("rows claimed (a value typed under it): nothing moves until they reach a table, then all below as far as they reach", async () => {
    await setup(SHEET, { "silverware.table.metadata": true });
    // A1:B5 reaches nothing (totals starts at row 6)
    await grow(2, true);
    // The table rendered anew is enhanced before the next write
    await vi.waitFor(() => expect(controller.shownTables().length).toBeGreaterThan(0));
    expect(text).toContain("at='A6'> |");
    // A1:B7 reaches totals by 2 rows: it and notes move down 2
    await grow(2, true);
    await flush();
    expect(text).toContain("| <meta core.table core.name='totals' sheet.name='Budget' sheet.at='A8'> |");
    expect(text).toContain("| <meta core.table core.name='notes' sheet.name='Budget' sheet.at='D8'> |");
    expect(text).toContain("| <meta core.table core.name='side' sheet.name='Budget' sheet.at='D1'> |");
  });

  it("refuses to grow into a table it overlaps already, and writes nothing", async () => {
    const overlapping = SHEET.replace("at='D1'", "at='B3'");
    await setup(overlapping, { "silverware.table.metadata": true });
    expect(await grow(1, false)).toBe("failed");
    expect(text).toBe(overlapping);
  });
});


describe("Sheets: a table of a sheet deleted (Delete table)", () => {
  useTablePage();

  const answer = () => {
    const questions: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      questions.push(message);
      return true;
    };
    return questions;
  };

  it("hands the sheet's widths to its next table in the same edit", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    const questions = answer();
    const before = edits;
    tableMenuItem(/^Delete table$/, 0)!.click();
    await vi.waitFor(() => expect(edits - before).toBe(1));
    expect(questions[0]).toBe("Delete the table costs (2 rows) from the page? Ctrl+Z brings it back.");
    expect(text).not.toContain("costs");
    expect(text).toContain("| <meta core.table core.name='notes' sheet.name='Budget' sheet.at='D1' sheet.width.B='140'> |");
  });

  it("with the metadata setting off, says the sheet's widths go with the table holding them: no other can take them", async () => {
    await setup(PAGE);
    const questions = answer();
    const before = edits;
    tableMenuItem(/^Delete table$/, 0)!.click();
    await vi.waitFor(() => expect(edits - before).toBe(1));
    expect(questions[0]).toBe(
      "Delete the table costs (2 rows) from the page? The sheet Budget's column widths, kept in it, go with it (the Store table metadata setting is off, so no other table takes them). Ctrl+Z brings it back.",
    );
    expect(text).not.toContain("sheet.width");
  });

  it("says the sheet goes with its only table", async () => {
    await setup("| Note |\n|---|\n| ok |\n| <meta core.table core.name='notes' sheet.name='Plan' sheet.at='A1'> |\n", { "silverware.table.metadata": true });
    const questions = answer();
    tableMenuItem(/^Delete table$/)!.click();
    await vi.waitFor(() => expect(questions).toHaveLength(1));
    expect(questions[0]).toBe("Delete the table notes (1 row) from the page? The sheet Plan goes with it, as it is its only table. Ctrl+Z brings it back.");
  });
});
