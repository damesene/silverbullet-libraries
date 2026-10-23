// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { insertRow } from "../ops.ts";
import { controller, edits, flashes, flush, nameInMenu, setup, tableMenuItem, text, toolbarName, useTablePage } from "../testing/page.ts";

const PAGE = [
  "| Item | Qty |",
  "|---|---|",
  "| Pear | 3 |",
  "| Fig | 2 |",
  "| <meta name='costs' sheet='Budget' at='A1' sheet.width.B='140'> |",
  "",
  "| Month | Income |",
  "|---|---|",
  "| Jan | 100 |",
  "",
  "| Note |",
  "|---|",
  "| ok |",
  "| <meta name='notes' sheet='Budget' at='D1'> |",
  "",
].join("\n");

describe("Sheets: a table put on a sheet, moved and taken off it by its sheet's name in the toolbar", () => {
  useTablePage();

  it("shows the sheet's name in the row of names, No sheet muted on none", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    expect(toolbarName("container", 0).textContent).toBe("Budget");
    expect(toolbarName("container", 0).classList.contains("swt-muted")).toBe(false);
    const none = toolbarName("container", 1);
    expect(none.textContent).toBe("No sheet");
    expect(none.classList.contains("swt-muted")).toBe(true);
    // Nothing of it is in the ⋯ menu any more
    expect(tableMenuItem(/sheet/i, 1)).toBeUndefined();
  });

  it("puts a table on a sheet of the page by its name: named, in column A one empty row under the sheet's lowest table", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    toolbarName("container", 1);
    expect(await nameInMenu("budget")).toBeUndefined();
    // costs: A1 to A3 (rows 0 to 2), notes: D1 to D2: one empty row, then A5; the sheet's name as the page has it
    expect(text).toContain("| <meta name='table1' sheet='Budget' at='A5'> |");
    expect(flashes.some((f) => f.includes("named table1"))).toBe(true);
    expect(edits).toBe(1);
  });

  it("moves a table to a new sheet by a new name: its place kept, the sheet's widths handed on to the next table, one edit", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    toolbarName("container", 0);
    expect(await nameInMenu("Other")).toBeUndefined();
    expect(text).toContain("| <meta name='costs' sheet='Other' at='A1'> |");
    expect(text).toContain("| <meta name='notes' sheet='Budget' at='D1' sheet.width.B='140'> |");
    expect(edits).toBe(1);
  });

  it("moved where its place is taken on that sheet: under that sheet's lowest table", async () => {
    const page = `${PAGE}\n| City |\n|---|\n| Brno |\n| <meta name='cities' sheet='Other' at='A1'> |\n`;
    await setup(page, { "silverware.table.metadata": true });
    toolbarName("container", 0);
    expect(await nameInMenu("Other")).toBeUndefined();
    // cities: A1 to A2: one empty row, then A4
    expect(text).toContain("| <meta name='costs' sheet='Other' at='A4'> |");
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
    expect(text).toContain("| <meta name='costs'> |");
    expect(text).toContain("| <meta name='notes' sheet='Budget' at='D1' sheet.width.B='140'> |");
    expect(edits).toBe(1);
  });

  it("hands the sheet's widths to a table put on it before its first, in the same edit", async () => {
    await setup(`| X |\n|---|\n| 1 |\n\n${PAGE}`, { "silverware.table.metadata": true });
    toolbarName("container", 0);
    expect(await nameInMenu("Budget")).toBeUndefined();
    expect(text).toContain("| <meta name='table1' sheet='Budget' at='A5' sheet.width.B='140'> |");
    expect(text).toContain("| <meta name='costs' sheet='Budget' at='A1'> |");
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
    "| <meta name='costs' sheet='Budget' at='A1'> |",
    "",
    "| Side |",
    "|---|",
    "| 1 |",
    "| 2 |",
    "| 3 |",
    "| 4 |",
    "| <meta name='side' sheet='Budget' at='D1'> |",
    "",
    "| Total |",
    "|---|",
    "| 5 |",
    "| <meta name='totals' sheet='Budget' at='A6'> |",
    "",
    "| Note |",
    "|---|",
    "| ok |",
    "| <meta name='notes' sheet='Budget' at='D6'> |",
    "",
  ].join("\n");

  const costs = () => controller.shownTables()[0]!;
  const grow = (rows: number, claims: boolean) =>
    controller.writeTable(costs(), (t) => Array.from({ length: rows }).reduce<typeof t>((out) => insertRow(out, out.rows.length), t), claims ? { claims } : {});

  it("rows inserted: everything starting below moves down as far, side by side tables in line, the table beside stays, one edit", async () => {
    await setup(SHEET, { "silverware.table.metadata": true });
    await grow(2, false);
    await flush();
    expect(text).toContain("| <meta name='totals' sheet='Budget' at='A8'> |");
    expect(text).toContain("| <meta name='notes' sheet='Budget' at='D8'> |");
    expect(text).toContain("| <meta name='side' sheet='Budget' at='D1'> |");
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
    expect(text).toContain("| <meta name='totals' sheet='Budget' at='A8'> |");
    expect(text).toContain("| <meta name='notes' sheet='Budget' at='D8'> |");
    expect(text).toContain("| <meta name='side' sheet='Budget' at='D1'> |");
  });

  it("refuses to grow into a table it overlaps already, and writes nothing", async () => {
    const overlapping = SHEET.replace("at='D1'", "at='B3'");
    await setup(overlapping, { "silverware.table.metadata": true });
    expect(await grow(1, false)).toBe("failed");
    expect(text).toBe(overlapping);
  });
});

