import { describe, expect, it } from "vitest";
import { formatAt, parseAt, placeBelow, sameSheet, sheetNameProblem, sheetsOf, sheetTables, sheetWidths } from "./page.ts";
import { SHEET_META } from "../testing/meta.ts";

const PAGE = [
  "| Item | Qty |",
  "|---|---|",
  "| Pear | 3 |",
  "| Fig | 2 |",
  "| <meta name='costs' sheet='Budget' at='B2' sheet.width.B='140' sheet.width.AA='60'> |",
  "",
  "| Month | Income |",
  "|---|---|",
  "| Jan | 100 |",
  "| <meta name='income' sheet='budget ' at='E2'> |",
  "",
  "| Note |",
  "|---|",
  "| ok |",
  "| <meta sheet='Other' at='A1'> |",
  "",
  "| Lost |",
  "|---|",
  "| <meta sheet='Budget' at='nowhere'> |",
  "",
].join("\n");

describe("Sheets of a page", () => {
  it("reads and writes a sheet's cells as B3 writes them", () => {
    expect(parseAt("B3")).toEqual({ row: 2, column: 1 });
    expect(parseAt(" aa10 ")).toEqual({ row: 9, column: 26 });
    expect(parseAt("B0")).toBeUndefined();
    expect(parseAt("3B")).toBeUndefined();
    expect(parseAt(undefined)).toBeUndefined();
    expect(formatAt({ row: 2, column: 1 })).toBe("B3");
    expect(formatAt({ row: 0, column: 27 })).toBe("AB1");
  });

  it("finds the tables on sheets, a sheet by its name ignoring case, a table without a valid place on none", () => {
    const tables = sheetTables(SHEET_META, PAGE);
    expect(tables.map((t) => [t.name, t.sheet, formatAt(t.at), t.rows, t.columns])).toEqual([
      ["costs", "Budget", "B2", 3, 2],
      ["income", "budget", "E2", 2, 2],
      [undefined, "Other", "A1", 2, 1],
    ]);
    const sheets = sheetsOf(tables);
    expect(sheets.map((s) => [s.name, s.tables.length])).toEqual([
      ["Budget", 2],
      ["Other", 1],
    ]);
    expect(sameSheet("Budget", " budget ")).toBe(true);
  });

  it("keeps a sheet's columns' widths in its first table", () => {
    const budget = sheetsOf(sheetTables(SHEET_META, PAGE))[0]!.tables;
    expect([...sheetWidths(SHEET_META, budget[0]?.table)]).toEqual([
      [1, 140],
      [26, 60],
    ]);
  });

  it("puts a table added in column A, one empty row under the lowest table, A1 on a new sheet", () => {
    const budget = sheetsOf(sheetTables(SHEET_META, PAGE))[0]!.tables;
    // costs: B2 to B4 (rows 1 to 3 from 0), income: E2 to E3
    expect(placeBelow(budget)).toEqual({ row: 5, column: 0 });
    expect(placeBelow([])).toEqual({ row: 0, column: 0 });
  });

  it("refuses an empty or too long sheet name", () => {
    expect(sheetNameProblem(" ")).toBe("a sheet needs a name");
    expect(sheetNameProblem("x".repeat(61))).toMatch(/at most 60/);
    expect(sheetNameProblem("Budget 2025")).toBeUndefined();
  });
});
