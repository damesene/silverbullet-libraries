import { describe, expect, it } from "vitest";
import {
  areaText,
  autofixFormula,
  calculatedFormula,
  columnLetters,
  formulaCell,
  formulaErrors,
  formulaHelp,
  formulaOf,
  isFormulaInput,
  type IndexMap,
  recalculate,
  references,
  REFERENCE_HELP,
  referenceSlot,
  shiftReferences,
  withCalculatedCells,
} from "./index.ts";
import { parseMetaRow, parseTable, serializeTable, splitRow } from "../markdown.ts";
import { deleteColumn, deleteRow, insertRow, moveColumn, moveRow, reorderRows, setCell } from "../ops.ts";

// A table whose cell `at` holds `formula`; returns what that cell shows after recalculating
function evaluate(markdown: string, formula: string, at = { row: -1, column: -1 }): string {
  const table = parseTable(markdown);
  const row = at.row < 0 ? table.rows.length - 1 : at.row;
  const column = at.column < 0 ? table.rows[0]!.cells.length - 1 : at.column;
  const withFormula = {
    ...table,
    rows: table.rows.map((r, i) =>
      i === row ? { cells: r.cells.map((c, j) => (j === column ? formulaCell("", formula) : c)) } : r,
    ),
  };
  return formulaOf(recalculate(withFormula).rows[row]!.cells[column]!)!.value;
}

const FRUIT = [
  "| Name | Qty | Price |",
  "|---|---|---|",
  "| Pear | 3 | 12,50 € |",
  "| Apple | 10 | 4,50 € |",
  "| Fig | 2 | |",
  "| Total | | |",
].join("\n");

describe("formulas in cells", () => {
  it("stores the result with the formula in a <meta> tag", () => {
    expect(formulaCell("19", '=IF(A1>1,"a|b","c")')).toBe('19 <meta f="=IF(A1&gt;1,&quot;a\\|b&quot;,&quot;c&quot;)">');
    expect(formulaOf('19 <meta f="=IF(A1&gt;1,&quot;a\\|b&quot;,&quot;c&quot;)">')).toEqual({
      formula: '=IF(A1>1,"a|b","c")',
      value: "19",
    });
  });

  it("keeps backslashes and pipes in a formula without breaking the row", () => {
    const formula = '=A1&"\\|"&"\\"';
    const cell = formulaCell("x", formula);
    expect(splitRow(`| a | ${cell} |`)).toEqual(["a", cell]);
    expect(formulaOf(cell)!.formula).toBe(formula);
  });

  it("takes the last tag as the formula when the result contains the text of one", () => {
    expect(formulaOf('<meta f="=1"> <meta f="=2">')!.formula).toBe("=2");
  });

  it("reads the tag before the value, self-closing and in single quotes", () => {
    expect(formulaOf('<meta f="=1+1"> 2')).toEqual({ formula: "=1+1", value: "2" });
    expect(formulaOf("2 <meta f='=1+1' />")).toEqual({ formula: "=1+1", value: "2" });
    expect(formulaOf("plain")).toBeUndefined();
  });

  it("keeps a formula with an empty result apart from the metadata row", () => {
    expect(parseMetaRow('| <meta f="=A1"> |')).toBeUndefined();
    expect(parseMetaRow('| <meta sort="Qty:desc"> |')).toEqual({ sort: "Qty:desc" });
  });

  it("knows typed formulas", () => {
    expect(isFormulaInput("=A1")).toBe(true);
    expect(isFormulaInput(" =1")).toBe(true);
    expect(isFormulaInput("=")).toBe(false);
    expect(isFormulaInput("a=b")).toBe(false);
  });
});

describe("evaluation", () => {
  it("does arithmetic with the usual precedence", () => {
    expect(evaluate(FRUIT, "=1+2*3^2")).toBe("19");
    expect(evaluate(FRUIT, "=(1+2)*3")).toBe("9");
    expect(evaluate(FRUIT, "=-2^2")).toBe("4");
    expect(evaluate(FRUIT, "=50%")).toBe("0,5");
    expect(evaluate(FRUIT, "=0.1+0.2")).toBe("0,3");
  });

  it("reads cells and ranges, A1 being the first row under the header", () => {
    expect(evaluate(FRUIT, "=B1")).toBe("3");
    expect(evaluate(FRUIT, "=SUM(B1:B3)")).toBe("15");
    expect(evaluate(FRUIT, "=sum(b1:b3)")).toBe("15");
    expect(evaluate(FRUIT, "=SUM(B3:B1)")).toBe("15");
  });

  it("reads numbers with units and writes the table's decimal separator", () => {
    expect(evaluate(FRUIT, "=SUM(C1:C3)")).toBe("17");
    expect(evaluate(FRUIT, "=AVERAGE(C1:C3)")).toBe("8,5");
    const dotted = FRUIT.replaceAll("12,50 €", "12.5").replaceAll("4,50 €", "4.5");
    expect(evaluate(dotted, "=AVERAGE(C1:C3)")).toBe("8.5");
  });

  it("refers to columns by name, without the cells that total that column", () => {
    const table = parseTable(FRUIT);
    // A total and an average under the same column do not count each other
    const rows = [
      ...table.rows.slice(0, 4),
      { cells: ["Total", formulaCell("", "=SUM([Qty])"), ""] },
      { cells: ["Average", formulaCell("", "=AVERAGE([qty])"), ""] },
    ];
    const done = recalculate({ ...table, rows });
    expect(formulaOf(done.rows[4]!.cells[1]!)!.value).toBe("15");
    expect(formulaOf(done.rows[5]!.cells[1]!)!.value).toBe("5");
  });

  it("refers to a column of the formula's own row with [@Name]", () => {
    const table = parseTable(FRUIT);
    const rows = table.rows.map((r, i) =>
      i > 0 && i < 4 ? { cells: [r.cells[0]!, r.cells[1]!, formulaCell("", "=[@Qty]*2")] } : r,
    );
    const done = recalculate({ ...table, rows });
    expect(done.rows.slice(1, 4).map((r) => formulaOf(r.cells[2]!)!.value)).toEqual(["6", "20", "4"]);
  });

  it("chains formulas", () => {
    const markdown = ["| A | B |", "|---|---|", "| 2 | x |", "| 3 | x |"].join("\n");
    const table = parseTable(markdown);
    const rows = [
      table.rows[0]!,
      { cells: ["2", formulaCell("", "=A1*10")] },
      { cells: ["3", formulaCell("", "=B1+A2")] },
    ];
    expect(formulaOf(recalculate({ ...table, rows }).rows[2]!.cells[1]!)!.value).toBe("23");
  });

  it("shows errors as spreadsheets do", () => {
    expect(evaluate(FRUIT, "=1/0")).toBe("#DIV/0!");
    expect(evaluate(FRUIT, "=Z9")).toBe("#REF!");
    expect(evaluate(FRUIT, "=[Nope]")).toBe("#REF!");
    expect(evaluate(FRUIT, "=NOPE(1)")).toBe("#NAME?");
    expect(evaluate(FRUIT, "=foo")).toBe("#NAME?");
    expect(evaluate(FRUIT, "=A1+1")).toBe("#VALUE!");
    expect(evaluate(FRUIT, "=SUM(1")).toBe("#ERROR!");
    expect(evaluate(FRUIT, "=ROUND()")).toBe("#VALUE!");
    expect(evaluate(FRUIT, "=C4")).toBe("#CYCLE!");
    expect(evaluate(FRUIT, "=IFERROR(1/0, 7)")).toBe("7");
  });

  it("explains an error", () => {
    const table = parseTable(FRUIT);
    const rows = table.rows.map((r, i) => (i === 4 ? { cells: [r.cells[0]!, r.cells[1]!, formulaCell("", "=Q1")] } : r));
    expect(formulaErrors({ ...table, rows })).toEqual(new Map([["4,2", "#REF! Q1 is outside the table"]]));
  });

  it("skips a text cell passed to a number function as it does in a range", () => {
    expect(evaluate(FRUIT, "=SUM(B1, A1, B2)")).toBe("13");
    expect(evaluate(FRUIT, "=SUM(B1, \"x\")")).toBe("#VALUE!");
  });

  it("compares, joins text and uses logic", () => {
    expect(evaluate(FRUIT, '=IF(B2>5, "many", "few")')).toBe("many");
    expect(evaluate(FRUIT, '=A1&" x"&B1')).toBe("Pear x3");
    expect(evaluate(FRUIT, '=A1="pear"')).toBe("TRUE");
    expect(evaluate(FRUIT, "=AND(B1>1, OR(FALSE, B3=2))")).toBe("TRUE");
    expect(evaluate(FRUIT, '=CONCAT(A1:A2, "!")')).toBe("PearApple!");
  });

  it("writes results only when they changed", () => {
    const table = parseTable(FRUIT);
    expect(recalculate(table)).toBe(table);
    const rows = table.rows.map((r, i) => (i === 4 ? { cells: [r.cells[0]!, formulaCell("15", "=SUM(B1:B3)"), ""] } : r));
    const current = { ...table, rows };
    expect(recalculate(current)).toBe(current);
    expect(serializeTable(recalculate({ ...current, rows: rows.map((r, i) => (i === 1 ? { cells: ["Pear", "4", ""] } : r)) }))).toContain(
      '16 <meta f="=SUM(B1:B3)">',
    );
  });
});

describe("shiftReferences", () => {
  // Rows: header, 1, 2, 3, Total (=SUM(B1:B3) + B1, [Qty] on the side)
  const TABLE = [
    "| Name | Qty | Note |",
    "|---|---|---|",
    "| a | 1 | |",
    "| b | 2 | |",
    "| c | 3 | |",
    '| Total | 6 <meta f="=SUM(B1:B3)+B1"> | 6 <meta f="=SUM([Qty])"> |',
  ].join("\n");
  const formulas = (table: ReturnType<typeof parseTable>) =>
    table.rows.flatMap((r) => r.cells.map((c) => formulaOf(c)?.formula).filter((f) => f !== undefined));
  const shifted = (change: (t: ReturnType<typeof parseTable>) => ReturnType<typeof parseTable>, rowMap?: IndexMap, columnMap?: IndexMap) => {
    const before = parseTable(TABLE);
    return formulas(shiftReferences(before, change(before), rowMap, columnMap));
  };

  it("widens a range when a row is inserted inside it, and follows rows inserted above", () => {
    expect(shifted((t) => insertRow(t, 2), (r) => (r >= 2 ? r + 1 : r))).toEqual(["=SUM(B1:B4)+B1", "=SUM([Qty])"]);
    expect(shifted((t) => insertRow(t, 1), (r) => (r >= 1 ? r + 1 : r))).toEqual(["=SUM(B2:B4)+B2", "=SUM([Qty])"]);
  });

  it("narrows a range when a row in it is deleted, and writes #REF! for a deleted cell", () => {
    const map: IndexMap = (r) => (r === 1 ? undefined : r > 1 ? r - 1 : r);
    expect(shifted((t) => deleteRow(t, 1), map)).toEqual(["=SUM(B1:B2)+#REF!", "=SUM([Qty])"]);
  });

  it("keeps a range's extent when its rows are only reordered", () => {
    const order = [3, 1, 2, 4];
    const position = new Map(order.map((row, i) => [row, i + 1]));
    expect(shifted((t) => reorderRows(t, order), (r) => (r === 0 ? 0 : position.get(r)))).toEqual([
      "=SUM(B1:B3)+B2",
      "=SUM([Qty])",
    ]);
  });

  it("follows a row moved to the end", () => {
    const after = (r: number) => (r === 1 ? 4 : r > 1 && r <= 4 ? r - 1 : r);
    expect(shifted((t) => moveRow(t, 1, 4), after)).toEqual(["=SUM(B1:B2)+B4", "=SUM([Qty])"]);
  });

  it("follows moved and deleted columns, by letter and by name", () => {
    const toFront = (c: number) => (c === 1 ? 0 : c === 0 ? 1 : c);
    expect(shifted((t) => moveColumn(t, 1, 0), undefined, toFront)).toEqual(["=SUM(A1:A3)+A1", "=SUM([Qty])"]);
    const gone = (c: number) => (c === 1 ? undefined : c > 1 ? c - 1 : c);
    expect(shifted((t) => deleteColumn(t, 1), undefined, gone)).toEqual(["=SUM(#REF!)"]);
  });

  it("renames [Name] references with their column", () => {
    expect(shifted((t) => setCell(t, 0, 1, "Amount"))).toEqual(["=SUM(B1:B3)+B1", "=SUM([Amount])"]);
  });

  it("evaluates a reference to deleted cells as #REF!", () => {
    expect(evaluate(FRUIT, "=SUM(#REF!)")).toBe("#REF!");
  });
});

describe("references", () => {
  it("lists cells, ranges and columns with where they are written", () => {
    const formula = "=SUM(A1:B3, C2) + [Qty] - [@Price]";
    expect(references(formula)).toEqual([
      { kind: "area", area: { top: 0, left: 0, bottom: 2, right: 1 }, from: 5, to: 10 },
      { kind: "area", area: { top: 1, left: 2, bottom: 1, right: 2 }, from: 12, to: 14 },
      { kind: "column", name: "Qty", thisRow: false, from: 18, to: 23 },
      { kind: "column", name: "Price", thisRow: true, from: 26, to: 34 },
    ]);
  });

  it("does not take a function name for a cell", () => {
    expect(references("=LOG10(A1)").map((r) => r.from)).toEqual([7]);
  });

  it("finds them while the formula is still being typed", () => {
    expect(references('=SUM(A1:A3, "unfinished').map((r) => r.from)).toEqual([5]);
  });

  it("writes cell names", () => {
    expect(columnLetters(0)).toBe("A");
    expect(columnLetters(26)).toBe("AA");
    expect(areaText({ top: 0, left: 1, bottom: 0, right: 1 })).toBe("B1");
    expect(areaText({ top: 0, left: 1, bottom: 4, right: 2 })).toBe("B1:C5");
  });
});

describe("calculated columns", () => {
  const ROWS = [
    "| Item | Qty | Price | Amount |",
    "|---|---|---|---|",
    '| a | 2 | 3 | 6 <meta f="=[@Qty]*[@Price]"> |',
    '| b | 1 | 4 | 4 <meta f="=[@Qty]*[@Price]"> |',
    "| new | | | |",
    '| Total | 3 <meta f="=SUM([Qty])"> | | |',
  ].join("\n");

  it("fills a new row's empty cells with the formula its column computes every row with", () => {
    const filled = withCalculatedCells(parseTable(ROWS), 3);
    expect(filled.rows[3]!.cells).toEqual(["new", "", "", '<meta f="=[@Qty]*[@Price]">']);
    expect(formulaOf(recalculate(filled).rows[4]!.cells[1]!)!.value).toBe("3");
  });

  it("knows a column as calculated only when all its rows hold the same formula, total rows aside", () => {
    const table = parseTable(ROWS);
    expect(calculatedFormula(table, 3, 3)).toBe("=[@Qty]*[@Price]");
    expect(calculatedFormula(table, 1, 3)).toBeUndefined();
    const mixed = setCell(table, 2, 3, "5");
    expect(calculatedFormula(mixed, 3, 3)).toBeUndefined();
    const other = setCell(table, 2, 3, formulaCell("", "=[@Qty]+1"));
    expect(calculatedFormula(other, 3, 3)).toBeUndefined();
  });
});

describe("autofixFormula", () => {
  const fix = (formula: string) => autofixFormula(formula);

  it("closes parentheses left open at the end", () => {
    expect(fix("=SUM(A1:A3")).toEqual({ formula: "=SUM(A1:A3)", fixes: ["added )"] });
    expect(fix("=ROUND(AVERAGE(B1:B3), 2")).toEqual({ formula: "=ROUND(AVERAGE(B1:B3), 2)", fixes: ["added )"] });
    expect(fix("=ROUND(SUM(A1 ")).toEqual({ formula: "=ROUND(SUM(A1))", fixes: ["added ))"] });
  });

  it("closes a text in quotes or a column name left open at the end", () => {
    expect(fix('=CONCAT(A1, " kg')).toEqual({ formula: '=CONCAT(A1, " kg")', fixes: ['closed the text with "', "added )"] });
    expect(fix("=SUM([Qty")).toEqual({ formula: "=SUM([Qty])", fixes: ["closed the column name with ]", "added )"] });
  });

  it("drops unmatched ) at the very end", () => {
    expect(fix("=SUM(A1:A3))")).toEqual({ formula: "=SUM(A1:A3)", fixes: ["removed )"] });
  });

  it("leaves formulas that read, and those whose fix is not clear", () => {
    expect(fix("=SUM(A1)")).toEqual({ formula: "=SUM(A1)", fixes: [] });
    expect(fix("=SUM(A1,")).toEqual({ formula: "=SUM(A1,", fixes: [] });
    expect(fix("=A1+")).toEqual({ formula: "=A1+", fixes: [] });
    expect(fix("=A1)+(B1")).toEqual({ formula: "=A1)+(B1", fixes: [] });
    expect(fix("=NOPE(A1")).toEqual({ formula: "=NOPE(A1)", fixes: ["added )"] });
  });
});

describe("referenceSlot", () => {
  it("takes a reference where an operand can go", () => {
    expect(referenceSlot("=", 1, 1)).toEqual({ from: 1, to: 1 });
    expect(referenceSlot("=SUM(", 5, 5)).toEqual({ from: 5, to: 5 });
    expect(referenceSlot("=SUM(A1, ", 9, 9)).toEqual({ from: 9, to: 9 });
    expect(referenceSlot("=A1*", 4, 4)).toEqual({ from: 4, to: 4 });
  });

  it("replaces the reference just pointed at while the caret is after it", () => {
    const pointed = { from: 5, to: 10, text: "A1:B2" };
    expect(referenceSlot("=SUM(A1:B2", 10, 10, pointed)).toEqual({ from: 5, to: 10 });
    // Typed references are operands: a click after them ends editing
    expect(referenceSlot("=SUM(A1:B2", 10, 10)).toBeUndefined();
    expect(referenceSlot("=B1+B2", 6, 6)).toBeUndefined();
    // Changed since it was pointed at, or the caret moved: no longer the pointed reference
    expect(referenceSlot("=SUM(A1:B3", 10, 10, pointed)).toBeUndefined();
    expect(referenceSlot("=SUM(A1:B2", 7, 7, pointed)).toBeUndefined();
  });

  it("replaces a selected operand", () => {
    expect(referenceSlot("=A1+B1", 1, 3)).toEqual({ from: 1, to: 3 });
  });

  it("handles spaces, unary minus and operators", () => {
    expect(referenceSlot("= ", 2, 2)).toEqual({ from: 2, to: 2 });
    expect(referenceSlot("=-", 2, 2)).toEqual({ from: 2, to: 2 });
    expect(referenceSlot("=A1 ", 4, 4)).toBeUndefined();
    expect(referenceSlot("=A1%", 4, 4)).toBeUndefined();
    expect(referenceSlot("=A1:", 4, 4)).toBeUndefined();
  });

  it("takes none in a text in quotes", () => {
    expect(referenceSlot('="a+', 4, 4)).toBeUndefined();
    expect(referenceSlot('="a()"', 4, 4)).toBeUndefined();
    expect(referenceSlot('="x, , y"', 5, 5)).toBeUndefined();
    expect(referenceSlot('="x"&', 5, 5)).toEqual({ from: 5, to: 5 });
  });

  it("takes none after an operand, before one, or outside a formula", () => {
    expect(referenceSlot("=SUM(A1)", 8, 8)).toBeUndefined();
    expect(referenceSlot("=12", 3, 3)).toBeUndefined();
    expect(referenceSlot("text", 4, 4)).toBeUndefined();
    expect(referenceSlot("=SUM(A1", 5, 5)).toBeUndefined();
    expect(referenceSlot("=[Qty", 3, 3)).toBeUndefined();
  });
});

describe("formulaHelp", () => {
  it("offers the functions whose names start with what is typed", () => {
    expect(formulaHelp("=SU", 3).map((h) => h.syntax)).toEqual(["SUM(number1, [number2], …)"]);
  });

  it("explains the function whose arguments the cursor is in", () => {
    expect(formulaHelp("=ROUND(SUM(A1:A2), ", 19).map((h) => h.syntax)).toEqual(["ROUND(number, [digits])"]);
    expect(formulaHelp("=ROUND(SUM(A1", 13).map((h) => h.syntax)).toEqual(["SUM(number1, [number2], …)"]);
  });

  it("explains references otherwise, and nothing outside formulas", () => {
    expect(formulaHelp("=", 1)).toEqual([REFERENCE_HELP]);
    expect(formulaHelp("text", 2)).toEqual([]);
  });
});
