import { describe, expect, it } from "vitest";
import { columnIdOf, columnKey, findColumn } from "./columns.ts";
import { formulaCell, formulaOf, recalculate, referencedColumn } from "./formulas/index.ts";
import { parseMetaRow, parseTable } from "./markdown.ts";
import { nameOf, nameProblem, withCellName, withName, withoutName } from "./names.ts";

describe("names in cells", () => {
  it("reads, writes and removes a cell's name, keeping its text", () => {
    expect(nameOf('Unit price <meta n="price">')).toBe("price");
    expect(withoutName('Unit price <meta n="price">')).toBe("Unit price");
    expect(withName("Unit price", "price")).toBe('Unit price <meta n="price">');
    expect(withName('Unit price <meta n="price">', "cost")).toBe('Unit price <meta n="cost">');
    expect(withName('Unit price <meta n="price">', undefined)).toBe("Unit price");
    expect(withCellName("", "vat")).toBe('<meta cn="vat">');
    expect(nameOf("Unit price")).toBeUndefined();
  });

  it("takes names formulas can write", () => {
    expect(nameProblem("price", "column")).toBeUndefined();
    expect(nameProblem("unit price", "column")).toContain("is not a column name");
    expect(nameProblem("B2", "column")).toContain("would read as a cell");
  });

  it("is not a metadata row when a last row holds only a named empty cell", () => {
    expect(parseMetaRow('| <meta cn="vat"> | |')).toBeUndefined();
    expect(parseMetaRow('| <meta n="pear"> | |')).toBeUndefined();
  });
});

describe("a column's fixed name", () => {
  const headers = ['Unit price <meta n="price">', "Qty", "Price"];

  it("names the column whatever its header says, and is left out of its key as SilverBullet does", () => {
    expect(columnKey(headers[0]!)).toBe("unit_price");
    expect(findColumn(headers, { name: "price", nth: 1 })).toBe(0);
    expect(findColumn(headers, { name: "unit_price", nth: 1 })).toBe(0);
    expect(columnIdOf(headers, 0)).toEqual({ name: "price", nth: 1, shared: false });
    expect(referencedColumn(headers, "PRICE")).toBe(0);
  });

  it("comes before a column whose header has that key, which is then the second of the name", () => {
    expect(columnIdOf(headers, 2)).toEqual({ name: "price", nth: 2, shared: true });
    expect(findColumn(headers, { name: "price", nth: 2 })).toBe(2);
    const same = ['Price <meta n="price">', "Price"];
    expect(columnIdOf(same, 1)).toEqual({ name: "price", nth: 2, shared: true });
    expect(findColumn(same, { name: "price", nth: 2 })).toBe(1);
    const after = ["Price", 'Cost <meta n="price">'];
    expect(columnIdOf(after, 0)).toEqual({ name: "price", nth: 2, shared: true });
    expect(findColumn(after, { name: "price", nth: 2 })).toBe(0);
  });

  it("keeps a formula cell's name when its result is written again", () => {
    const table = parseTable(`| A |\n|---|\n| 2 |\n| ${formulaCell("0", "=A1*2", "double")} |`);
    const cell = recalculate(table).rows[2]!.cells[0]!;
    expect(cell).toBe('4 <meta f="=A1*2"> <meta cn="double">');
    expect(formulaOf(cell)).toEqual({ formula: "=A1*2", value: "4", name: "double" });
  });

  it("is what [name] reads, after the header is renamed too", () => {
    const table = parseTable(`| Cost <meta n="price"> | Total |\n|---|---|\n| 3 | ${formulaCell("", "=SUM([price])")} |`);
    expect(formulaOf(recalculate(table).rows[1]!.cells[1]!)!.value).toBe("3");
  });
});
