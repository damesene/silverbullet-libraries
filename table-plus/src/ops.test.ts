import { describe, expect, it } from "vitest";
import { parseTable, serializeTable } from "./markdown.ts";
import {
  columnAfterMove,
  deleteColumn,
  deleteRow,
  duplicateRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  nameEmptyHeaders,
  setAlign,
} from "./ops.ts";

const base = parseTable("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |");
const md = (t: ReturnType<typeof parseTable>) => serializeTable(t);

describe("row operations", () => {
  it("inserts an empty row", () => {
    expect(md(insertRow(base, 2))).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n| | |\n| 3 | 4 |");
  });

  it("never inserts above the header", () => {
    expect(insertRow(base, 0).rows[0]?.cells).toEqual(["A", "B"]);
  });

  it("deletes a body row but not the header", () => {
    expect(md(deleteRow(base, 1))).toBe("| A | B |\n|---|---|\n| 3 | 4 |");
    expect(deleteRow(base, 0)).toBe(base);
  });

  it("duplicates a body row below itself", () => {
    expect(md(duplicateRow(base, 1))).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n| 1 | 2 |\n| 3 | 4 |");
    expect(duplicateRow(base, 0)).toBe(base);
  });

  it("moves rows, keeping their source text", () => {
    expect(md(moveRow(base, 2, 1))).toBe("| A | B |\n|---|---|\n| 3 | 4 |\n| 1 | 2 |");
    expect(moveRow(base, 1, 0)).toBe(base);
  });
});

describe("column operations", () => {
  it("inserts a column with a generated header", () => {
    expect(md(insertColumn(base, 1))).toBe("| A | Column 3 | B |\n|---|---|---|\n| 1 | | 2 |\n| 3 | | 4 |");
  });

  it("names empty header cells after their position", () => {
    const t = parseTable("| A | | Column 3 | |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |");
    expect(nameEmptyHeaders(t).rows[0]?.cells).toEqual(["A", "Column 2", "Column 3", "Column 4"]);
    const clash = parseTable("| Column 2 | |\n|---|---|\n| 1 | 2 |");
    expect(nameEmptyHeaders(clash).rows[0]?.cells).toEqual(["Column 2", "Column 3"]);
  });

  it("generates a header name that is not taken", () => {
    const taken = parseTable("| Column 3 | B |\n|---|---|\n| 1 | 2 |");
    expect(insertColumn(taken, 2).rows[0]?.cells).toEqual(["Column 3", "B", "Column 4"]);
  });

  it("deletes a column but never the last one", () => {
    const one = deleteColumn(base, 0);
    expect(md(one)).toBe("| B |\n|---|\n| 2 |\n| 4 |");
    expect(deleteColumn(one, 0)).toBe(one);
  });

  it("moves a column with its alignment", () => {
    const aligned = setAlign(base, 0, "right");
    expect(md(moveColumn(aligned, 0, 1))).toBe("| B | A |\n|---|---:|\n| 2 | 1 |\n| 4 | 3 |");
  });

  it("maps column indexes through a move", () => {
    // [a b c d], move 0 -> 2 gives [b c a d]
    expect([0, 1, 2, 3].map((c) => columnAfterMove(c, 0, 2))).toEqual([2, 0, 1, 3]);
    // move 3 -> 1 gives [a d b c]
    expect([0, 1, 2, 3].map((c) => columnAfterMove(c, 3, 1))).toEqual([0, 2, 3, 1]);
  });
});
