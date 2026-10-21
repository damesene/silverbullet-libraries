// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cell, clickOn, flush, setup, tableMenuItem, useTablePage } from "../testing/page.ts";
import { excelTemplates, fileName, skippedGroups, xlsxName } from "./excel.ts";

describe("Excel", () => {
  useTablePage();

  // Files the browser was given to download: their names and contents
  let downloads: { name: string; bytes: Uint8Array }[];
  beforeEach(() => {
    downloads = [];
    const blobs = new Map<string, Blob>();
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        const url = `blob:${blobs.size}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      const blob = blobs.get(this.href)!;
      void blob.arrayBuffer().then((buffer) => downloads.push({ name: this.download, bytes: new Uint8Array(buffer) }));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const sheetOf = (bytes: Uint8Array) => {
    const text = new TextDecoder().decode(bytes);
    return text.slice(text.indexOf("<worksheet"), text.indexOf("</worksheet>"));
  };
  const dialog = () => document.querySelector<HTMLElement>(".tp-excel-dialog");
  const button = (text: string) => Array.from(dialog()!.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent === text)!;
  const status = () => dialog()!.querySelector<HTMLElement>(".tp-excel-status")!;
  const formulas = () => dialog()!.querySelector<HTMLElement>(".tp-excel-formulas")!;
  const open = async () => {
    tableMenuItem(/^Export to Excel…$/)!.click();
    await flush();
  };

  const SHOP = [
    "| Fruit | Qty | Price |",
    "|---|---|---|",
    "| Pear | 3 | 12,50 € |",
    "| Apple | 10 | 4,50 € |",
    '| Total | 13 <meta f="=SUM([qty])"> | |',
    '| <meta name="shop"> |',
    "",
  ].join("\n");
  const VAT = ["| Fruit | Qty |", "|---|---|", "| Pear | 3 |", '| Total | 6 <meta f="=VAT([qty])"> |', ""].join("\n");

  it("downloads the whole table as an .xlsx file named after it, with its formulas, and says so", async () => {
    await setup(SHOP);
    // Sorted in view: the file keeps the markdown's order
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    await open();
    expect(dialog()!.querySelector(".tp-dialog-subtitle")!.textContent).toBe("shop");
    expect(formulas().textContent).toBe("All 1 formula will be Excel formulas.");
    expect(formulas().classList.contains("tp-excel-ok")).toBe(true);
    button("Download").click();
    await flush();
    expect(downloads.map((d) => d.name)).toEqual(["shop.xlsx"]);
    const sheet = sheetOf(downloads[0]!.bytes);
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Pear</t></is></c>');
    expect(sheet).toContain('<c r="C2"><v>12.5</v></c>');
    expect(sheet).toContain('<c r="B4"><f>SUM(B2:B3)</f><v>13</v></c>');
    // The dialog stays, with the outcome
    expect(status().textContent).toBe("Downloaded shop.xlsx.");
    expect(status().classList.contains("tp-excel-ok")).toBe(true);
    button("Close").click();
    expect(dialog()).toBeNull();
  });

  it("lists the formulas Excel cannot have before the file is made, which writes their values", async () => {
    await setup(VAT);
    await open();
    expect(formulas().querySelector(".tp-excel-formulas-title")!.textContent).toBe("1 formula of 1 will be written as its value (cells as Excel names them):");
    expect(Array.from(formulas().querySelectorAll(".tp-excel-skipped-item > *")).map((e) => e.textContent)).toEqual(["B3", "=VAT([qty])", "VAT has no Excel form"]);
    expect(downloads).toEqual([]);
    button("Download").click();
    await flush();
    // Named after the page, the table having no name
    expect(downloads.map((d) => d.name)).toEqual(["Test.xlsx"]);
    expect(sheetOf(downloads[0]!.bytes)).toContain('<c r="B3"><v>6</v></c>');
    expect(status().textContent).toBe("Downloaded Test.xlsx, 1 formula as values.");
  });

  it("downloads the file under the name typed, Enter in its field downloading too", async () => {
    await setup(SHOP);
    await open();
    const input = dialog()!.querySelector<HTMLInputElement>(".tp-excel-file-input")!;
    expect(input.value).toBe("shop");
    input.value = "Fruit 2025";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await flush();
    expect(downloads.map((d) => d.name)).toEqual(["Fruit 2025.xlsx"]);
    expect(status().textContent).toBe("Downloaded Fruit 2025.xlsx.");
  });

  it("writes custom functions by the templates set", async () => {
    await setup(VAT, { "tablePlus.modules.excel.functions": { VAT: "ROUND(({1})*1.21,2)" } });
    await open();
    expect(formulas().textContent).toBe("All 1 formula will be Excel formulas.");
    button("Download").click();
    await flush();
    expect(sheetOf(downloads[0]!.bytes)).toContain('<c r="B3"><f>(ROUND((B2)*1.21,2))</f><v>6</v></c>');
  });

  it("copies the rows as shown for Excel, saying what is lost", async () => {
    await setup(SHOP);
    let copied = "";
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (t: string) => void (copied = t) }, configurable: true });
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    await open();
    expect(dialog()!.querySelector(".tp-excel-option-text")!.textContent).toContain("Lost: formulas");
    button("Copy").click();
    await flush();
    expect(copied).toBe("Fruit\tQty\tPrice\r\nApple\t10\t4,50 €\r\nPear\t3\t12,50 €\r\nTotal\t13\t");
    expect(status().textContent).toBe("Copied 3 rows: paste them into Excel.");
    // A failure is said there too
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
    button("Copy").click();
    await flush();
    expect(status().textContent).toBe("Could not copy: Error: denied");
    expect(status().classList.contains("tp-excel-error")).toBe(true);
  });

  it("offers nothing with the excel module off", async () => {
    await setup("| A |\n|---|\n| 1 |\n", { "tablePlus.modules.excel.enabled": false });
    expect(tableMenuItem(/Excel/)).toBeUndefined();
    expect(tableMenuItem(/^Copy as CSV$/)).toBeDefined();
  });

  it("lists formulas alike once, their cells as ranges", () => {
    const why = "it refers to the table prices";
    const column = Array.from({ length: 500 }, (_, row) => ({ row, column: 2, formula: "=prices![x]", reason: why }));
    const scattered = [0, 2, 4, 6, 8, 10].map((row) => ({ row, column: 3, formula: "=VAT(1)", reason: "VAT has no Excel form" }));
    expect(skippedGroups([...column, ...scattered])).toEqual([
      { cells: "C2:C501", formula: "=prices![x]", reason: why, count: 500 },
      { cells: "D2, D4, D6, D8 and 2 more", formula: "=VAT(1)", reason: "VAT has no Excel form", count: 6 },
    ]);
  });

  it("lists at most 50 kinds of formulas written as values, and says how many more", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => `| ${i} | 1 <meta f="=NOPE${i}(1)"> |`);
    await setup(["| N | X |", "|---|---|", ...rows, ""].join("\n"));
    await open();
    expect(formulas().querySelector(".tp-excel-formulas-title")!.textContent).toBe("60 formulas of 60 will be written as their values (cells as Excel names them):");
    expect(formulas().querySelectorAll(".tp-excel-skipped-item")).toHaveLength(50);
    expect(formulas().querySelector(".tp-excel-skipped-more")!.textContent).toBe("… and 10 more");
  });

  it("takes only templates that are text or false, and names files as file systems allow", () => {
    expect(excelTemplates({ A: "X({1})", B: false, C: 3, D: true })).toEqual({ A: "X({1})", B: false });
    expect(excelTemplates("x")).toEqual({});
    expect(fileName('a/b:c*d?"e"<f>|g')).toBe("a_b_c_d__e__f__g");
    expect(fileName("  ")).toBe("Table");
    expect(xlsxName(" Report.XLSX ")).toBe("Report.xlsx");
    expect(xlsxName("a/b")).toBe("a_b.xlsx");
  });
});
