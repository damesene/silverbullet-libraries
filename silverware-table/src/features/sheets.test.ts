// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { insertRow } from "../ops.ts";
import { controller, edits, flush, setup, tableMenuItem, text, useTablePage } from "../testing/page.ts";

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

describe("Sheets: a table added to a sheet and removed from it", () => {
  useTablePage();

  const dialog = () => document.querySelector<HTMLElement>(".swt-sheet-add")!;
  const inputs = () => Array.from(dialog().querySelectorAll<HTMLInputElement>("input"));
  const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === label)!;

  it("adds a table to a sheet of the page: named, in column A one empty row under the sheet's lowest table", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    tableMenuItem(/Add to sheet/, 1)!.click();
    await flush();
    const select = dialog().querySelector<HTMLSelectElement>("select")!;
    expect(Array.from(select.options, (o) => o.value)).toEqual(["Budget", ""]);
    // A free name offered: table1
    expect(inputs()[1]!.value).toBe("table1");
    inputs()[1]!.value = "income";
    button("Add to sheet").click();
    // Enter as well: one write, not two
    dialog()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    await flush();
    // costs: A1 to A3 (rows 0 to 2), notes: D1 to D2: one empty row, then A5
    expect(text).toContain("| <meta name='income' sheet='Budget' at='A5'> |");
    expect(text.match(/name='income'/g)).toHaveLength(1);
  });

  it("refuses a name another table of the page has", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    tableMenuItem(/Add to sheet/, 1)!.click();
    await flush();
    inputs()[1]!.value = "Costs";
    button("Add to sheet").click();
    await flush();
    expect(dialog().querySelector(".swt-sheet-add-problem")!.textContent).toBe("another table on this page is named Costs");
    expect(text).toBe(PAGE);
  });

  it("hands the sheet's widths to a table added before its first, in the same edit", async () => {
    await setup(`| X |\n|---|\n| 1 |\n\n${PAGE}`, { "silverware.table.metadata": true });
    tableMenuItem(/Add to sheet/, 0)!.click();
    await flush();
    inputs()[1]!.value = "first";
    button("Add to sheet").click();
    await flush();
    await flush();
    expect(text).toContain("| <meta name='first' sheet='Budget' at='A5' sheet.width.B='140'> |");
    expect(text).toContain("| <meta name='costs' sheet='Budget' at='A1'> |");
    expect(edits).toBe(1);
  });

  it("removes a table from its sheet, its name kept, the sheet's widths handed on to the next table", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    expect(tableMenuItem(/Add to sheet/, 0)).toBeUndefined();
    tableMenuItem(/Remove from sheet/, 0)!.click();
    await flush();
    await flush();
    expect(text).toContain("| <meta name='costs'> |");
    expect(text).toContain("| <meta name='notes' sheet='Budget' at='D1' sheet.width.B='140'> |");
    // One edit: one Ctrl+Z undoes it all
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

