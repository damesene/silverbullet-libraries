import { describe, expect, it } from "vitest";
import { parseTable, serializeTable } from "./markdown.ts";
import { parseClipboardCells, pasteCells, planPaste } from "./paste.ts";
import { formulaOf } from "./formulas/index.ts";
import { keepTags } from "./tags.ts";
import { NO_PINS } from "./view.ts";

describe("parseClipboardCells", () => {
  it("reads rows and cells as spreadsheets copy them", () => {
    expect(parseClipboardCells("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseClipboardCells("a\n\nb")).toEqual([["a"], [""], ["b"]]);
    expect(parseClipboardCells("a\t\tc")).toEqual([["a", "", "c"]]);
  });

  it("reads quoted cells with tabs, line breaks and quotes in them", () => {
    expect(parseClipboardCells('"two\nlines"\t"say ""hi"""\n')).toEqual([["two\nlines", 'say "hi"']]);
    // A quote that does not end the cell is text
    expect(parseClipboardCells('"5" kg\tx')).toEqual([['"5" kg', "x"]]);
  });

  it("leaves a single value to the field", () => {
    expect(parseClipboardCells("just text")).toBeUndefined();
    expect(parseClipboardCells("one value\n")).toBeUndefined();
    expect(parseClipboardCells("")).toBeUndefined();
  });
});

const TABLE = parseTable(
  ["| Name | Qty |", "|---|---|", "| Pear | 3 |", "| Apple | 10 |", `| Total | 13 <meta f='=SUM([qty])'> |`].join("\n"),
);

function paste(data: string[][], at: { row: number; column: number }, insert = false, pins = NO_PINS) {
  const plan = planPaste(TABLE, pins, at, data, insert);
  if ("error" in plan) return plan;
  // As with the formulas module on: formula cells are its
  const pasted = pasteCells(TABLE, plan, data, {
    keptBy: (cell) => (formulaOf(cell) ? "formula cell" : undefined),
    keepTags: (value, from) => keepTags(value, from, new Set(["f"])),
  });
  return { markdown: serializeTable(pasted.table), skipped: pasted.skipped.get("formula cell") ?? 0, plan };
}

describe("pasting cells", () => {
  it("overwrites from the cell to the right and down, keeping formula cells", () => {
    const result = paste(
      [
        ["Fig", "2"],
        ["Plum", "5"],
        ["Kiwi", "7"],
      ],
      { row: 1, column: 0 },
    );
    expect(result).toMatchObject({ skipped: 1 });
    expect("markdown" in result && result.markdown).toBe(
      ["| Name | Qty |", "|---|---|", "| Fig | 2 |", "| Plum | 5 |", `| Kiwi | 13 <meta f='=SUM([qty])'> |`].join("\n"),
    );
  });

  it("adds rows and columns where the table ends, before the rows pinned to the bottom", () => {
    const result = paste(
      [
        ["Fig", "2", "red"],
        ["Plum", "5", "blue"],
      ],
      { row: 2, column: 0 },
      false,
      { ...NO_PINS, bottom: 1 },
    );
    expect("markdown" in result && result.markdown).toBe(
      [
        "| Name | Qty | Column 3 |",
        "|---|---|---|",
        "| Pear | 3 | |",
        "| Fig | 2 | red |",
        "| Plum | 5 | blue |",
        `| Total | 13 <meta f='=SUM([qty])'> | |`,
      ].join("\n"),
    );
    expect("plan" in result && result.plan.newRows).toEqual({ at: 3, count: 1 });
    expect("plan" in result && result.plan.newColumns).toEqual({ at: 2, count: 1 });
  });

  it("inserts the rows as new at the cell's row with Shift, overwriting nothing", () => {
    const result = paste(
      [
        ["Fig", "2"],
        ["Plum", "5"],
      ],
      { row: 2, column: 0 },
      true,
    );
    expect("markdown" in result && result.markdown).toBe(
      [
        "| Name | Qty |",
        "|---|---|",
        "| Pear | 3 |",
        "| Fig | 2 |",
        "| Plum | 5 |",
        "| Apple | 10 |",
        `| Total | 13 <meta f='=SUM([qty])'> |`,
      ].join("\n"),
    );
  });

  it("names columns from a row pasted onto the header, keeping names left empty", () => {
    const result = paste(
      [
        ["Fruit", ""],
        ["Fig", "2"],
      ],
      { row: 0, column: 0 },
    );
    expect("markdown" in result && result.markdown).toBe(
      ["| Fruit | Qty |", "|---|---|", "| Fig | 2 |", "| Apple | 10 |", `| Total | 13 <meta f='=SUM([qty])'> |`].join("\n"),
    );
  });

  it("escapes pipes and puts line breaks in a cell on one line", () => {
    const result = paste([["a|b", "two\nlines"]], { row: 1, column: 0 });
    expect("markdown" in result && result.markdown).toContain("| a\\|b | two lines |");
  });

  it("says when new rows would have no place among the rows pinned to the bottom", () => {
    expect(paste([["x"], ["y"]], { row: 3, column: 0 }, false, { ...NO_PINS, bottom: 1 })).toEqual({
      error: "there are no rows below the rows pinned to the bottom to paste into",
    });
  });
});
