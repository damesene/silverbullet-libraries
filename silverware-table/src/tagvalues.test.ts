import { describe, expect, it } from "vitest";
import { parseTable } from "./markdown.ts";
import { moveRow, setCell } from "./ops.ts";
import { tagValue, withoutNewTagValues, withTagValue } from "./tagvalues.ts";

describe("an attribute of cells' hidden tags", () => {
  it("is read by its name, the last tag with it counting", () => {
    expect(tagValue("6 <meta formulas.f='=3*2'> <meta core.n='pear'>", "core.n")).toBe("pear");
    expect(tagValue("6 <meta formulas.f='=1'> <meta formulas.f='=3*2'>", "formulas.f")).toBe("=3*2");
    expect(tagValue("plain", "formulas.f")).toBeUndefined();
  });

  it("is set in the tag that has it, else in a tag of its own; removed, a tag left empty goes", () => {
    expect(withTagValue("6 <meta formulas.f='=3*2'>", "formulas.f", "=4")).toBe("6 <meta formulas.f='=4'>");
    expect(withTagValue("Pear <meta core.n='pear'>", "formulas.f", "=1")).toBe("Pear <meta core.n='pear'> <meta formulas.f='=1'>");
    expect(withTagValue("6 <meta formulas.f='=3*2'> <meta core.n='pear'>", "formulas.f", undefined)).toBe("6 <meta core.n='pear'>");
    // Another's attributes in that tag as written: their case, one without a value, quotes
    expect(withTagValue(`6 <meta formulas.f='=A1' data-Note="x" hidden>`, "formulas.f", "=A2")).toBe(`6 <meta formulas.f='=A2' data-Note="x" hidden>`);
    expect(withTagValue(`6 <meta data-Note="a formulas.f='no'" formulas.f='=A1'>`, "formulas.f", undefined)).toBe(`6 <meta data-Note="a formulas.f='no'">`);
  });
});

describe("hidden values new to a table (the metadata setting off)", () => {
  const before = parseTable(
    ["| Item | Qty | Total |", "|---|---|---|", "| Pear | 3 | 6 <meta formulas.f='=[@qty]*2'> |", "| Fig | 2 | 4 <meta formulas.f='=[@qty]*2'> |", ""].join("\n"),
  );

  it("are taken off, the cell's text kept, and counted", () => {
    const after = setCell(before, 1, 1, "3 <meta formulas.f='=1+2'>");
    const { table, taken } = withoutNewTagValues(before, after);
    expect(table.rows[1]!.cells[1]).toBe("3");
    expect(taken).toBe(1);
  });

  it("stay where the cell had the attribute (edited), or the table had it with that value (a calculated column's new row, a cell moved)", () => {
    const edited = setCell(before, 1, 2, "9 <meta formulas.f='=[@qty]*3'>");
    expect(withoutNewTagValues(before, edited).taken).toBe(0);
    const copied = setCell(before, 2, 1, "4 <meta formulas.f='=[@qty]*2'>");
    expect(withoutNewTagValues(before, copied).taken).toBe(0);
  });

  it("follow the rows and columns the edit moved", () => {
    const named = setCell(before, 1, 0, "Pear <meta core.n='pear'>");
    // Pear's row moved down and renamed: its cell had a name, so the new one stays
    const moved = setCell(moveRow(named, 1, 2), 2, 0, "Pear <meta core.n='pearl'>");
    expect(withoutNewTagValues(named, moved, (r) => (r === 1 ? 2 : r === 2 ? 1 : r)).taken).toBe(0);
    // Read as if nothing moved, it is Fig's cell, which had none
    expect(withoutNewTagValues(named, moved).taken).toBe(1);
  });
});
