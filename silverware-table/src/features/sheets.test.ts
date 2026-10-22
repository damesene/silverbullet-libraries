// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { flush, setup, tableMenuItem, text, useTablePage } from "../testing/page.ts";

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

  it("removes a table from its sheet, its name kept, the sheet's widths handed on to the next table", async () => {
    await setup(PAGE, { "silverware.table.metadata": true });
    expect(tableMenuItem(/Add to sheet/, 0)).toBeUndefined();
    tableMenuItem(/Remove from sheet/, 0)!.click();
    await flush();
    await flush();
    expect(text).toContain("| <meta name='costs'> |");
    expect(text).toContain("| <meta name='notes' sheet='Budget' at='D1' sheet.width.B='140'> |");
  });
});
