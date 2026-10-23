// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cell, clickOn, flashes, flush, setup, tableMenuItem, useTablePage } from "../testing/page.ts";
import { csvText } from "./export.ts";

describe("Export", () => {
  useTablePage();

  it("writes CSV, quoting what needs it", () => {
    expect(csvText([["a", "b,c"], ['say "hi"', "x\ny"]])).toBe('a,"b,c"\r\n"say ""hi""","x\ny"\r\n');
  });

  it("copies the table as CSV from the toolbar's menu, its rows as shown", async () => {
    await setup(`| Name | Note |\n|---|---|\n| Pear | ripe, "sweet" |\n| apple | 10 |\n| Fig | 2 <meta formulas.f='=1+1'> |\n`);
    let copied = "";
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (t: string) => void (copied = t) }, configurable: true });
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    tableMenuItem(/^Copy as CSV$/)!.click();
    await flush();
    expect(copied).toBe('Name,Note\r\napple,10\r\nFig,2\r\nPear,"ripe, ""sweet"""\r\n');
    expect(flashes.pop()).toBe("Silverware Table: copied 3 rows as CSV");
  });

  it("offers nothing with the export module off", async () => {
    await setup("| A |\n|---|\n| 1 |\n", { "silverware.table.modules.export.enabled": false });
    expect(tableMenuItem(/^Copy as CSV$/)).toBeUndefined();
  });
});
