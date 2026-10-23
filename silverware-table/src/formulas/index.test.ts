import { describe, expect, it } from "vitest";
import {
  areaText,
  autofixFormula,
  columnLetters,
  argumentSpan,
  cycleFixed,
  filledFormula,
  findFunctions,
  needsOperator,
  formulaHelp,
  formulaChoices,
  isFormulaInput,
  type IndexMap,
  namedReferences,
  references,
  type TableSource,
  REFERENCE_HELP,
  referenceSlot,
  withColumnKeys,
} from "./index.ts";
import { calculatedFormula, cellNamesOf, followTable, formulaCell, formulaErrors, formulaOf, qualifyCellNames, recalculate, referredTableNames, shiftReferences, withCalculatedCells } from "../testing/formulas.ts";
import { parseMetaRow, parseTable, serializeTable, splitRow } from "../markdown.ts";
import { metaName, withMetaName } from "../meta.ts";
import { cellNameOf, namedRows, nameOf, rowNameIn, withCellName, withName, withoutName } from "../names.ts";
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


/** What formulaChoices offers, by name: where the name typed is, and the names in order */
const choiceNames = (choices: ReturnType<typeof formulaChoices>) => choices && { from: choices.from, to: choices.to, names: choices.choices.map((c) => c.name) };

describe("formulas in cells", () => {
  it("stores the result with the formula in a <meta> tag", () => {
    expect(formulaCell("19", '=IF(A1>1,"a|b","c")')).toBe(`19 <meta formulas.f='=IF(A1&gt;1,"a\\|b","c")'>`);
    expect(formulaOf(`19 <meta formulas.f='=IF(A1&gt;1,"a\\|b","c")'>`)).toEqual({
      formula: '=IF(A1>1,"a|b","c")',
      value: "19",
    });
  });

  it("writes an apostrophe in a formula as &#39;, its quotes as they are", () => {
    const cell = formulaCell("it's", `="it's"&" done"`);
    expect(cell).toBe(`it's <meta formulas.f='="it&#39;s"&amp;" done"'>`);
    expect(formulaOf(cell)?.formula).toBe(`="it's"&" done"`);
  });

  it("leaves a table written in quotes as it is while its results are right, and writes a changed result in apostrophes", () => {
    const table = parseTable('| A | B |\n|---|---|\n| 2 | 4 <meta formulas.f="=A1*2"> |\n| 3 | x <meta formulas.f="=IF(A2&gt;1,&quot;big&quot;,&quot;&quot;)"> |\n');
    expect(recalculate(table)).not.toBe(table);
    const right = parseTable('| A | B |\n|---|---|\n| 2 | 4 <meta formulas.f="=A1*2"> |\n| 3 | big <meta formulas.f="=IF(A2&gt;1,&quot;big&quot;,&quot;&quot;)"> |\n');
    expect(recalculate(right)).toBe(right);
    expect(recalculate(table).rows[2]!.cells[1]).toBe(`big <meta formulas.f='=IF(A2&gt;1,"big","")'>`);
  });

  it("reads a formula written in quotes, as tables before apostrophes have it", () => {
    expect(formulaOf('19 <meta formulas.f="=IF(A1&gt;1,&quot;it&#39;s&quot;,&quot;c&quot;)">')?.formula).toBe(`=IF(A1>1,"it's","c")`);
  });

  it("keeps backslashes and pipes in a formula without breaking the row", () => {
    const formula = '=A1&"\\|"&"\\"';
    const cell = formulaCell("x", formula);
    expect(splitRow(`| a | ${cell} |`)).toEqual(["a", cell]);
    expect(formulaOf(cell)!.formula).toBe(formula);
  });

  it("takes the last tag as the formula when the result contains the text of one", () => {
    expect(formulaOf(`<meta formulas.f='=1'> <meta formulas.f='=2'>`)!.formula).toBe("=2");
  });

  it("reads the tag before the value, self-closing and in single quotes", () => {
    expect(formulaOf(`<meta formulas.f='=1+1'> 2`)).toEqual({ formula: "=1+1", value: "2" });
    expect(formulaOf("2 <meta formulas.f='=1+1' />")).toEqual({ formula: "=1+1", value: "2" });
    expect(formulaOf("plain")).toBeUndefined();
  });

  it("keeps a formula with an empty result apart from the metadata row", () => {
    expect(parseMetaRow(`| <meta formulas.f='=A1'> |`)).toBeUndefined();
    expect(parseMetaRow(`| <meta core.table sort='Qty:desc'> |`)).toEqual({ sort: "Qty:desc" });
  });

  it("knows typed formulas", () => {
    expect(isFormulaInput("=A1")).toBe(true);
    expect(isFormulaInput(" =1")).toBe(true);
    expect(isFormulaInput("=")).toBe(false);
    expect(isFormulaInput("a=b")).toBe(false);
  });
});

describe("evaluation", () => {
  it("counts and adds by conditions on the table's columns", () => {
    expect(evaluate(FRUIT, '=SUMIFS([qty], [price], ">5")')).toBe("3");
    expect(evaluate(FRUIT, '=COUNTIFS([name], "*e*")')).toBe("2");
    // The total row (this formula's) is not in [price]
    expect(evaluate(FRUIT, '=COUNTIFS([price], "")')).toBe("1");
    expect(evaluate(FRUIT, '=COUNTIFS([price], "<>")')).toBe("2");
    expect(evaluate(FRUIT, '=AVERAGEIFS([qty], [name], "<>fig")')).toBe("6,5");
    expect(evaluate(FRUIT, '=SUMIFS([qty], [qty], ">"&B1)')).toBe("10");
    expect(evaluate(FRUIT, "=SUMPRODUCT([qty], [price])")).toBe("82,5");
    expect(evaluate(FRUIT, "=RANK(B2, [qty])")).toBe("1");
    // Cells that read as numbers join as numbers, as with CONCAT
    expect(evaluate(FRUIT, '=TEXTJOIN(", ", TRUE, [price])')).toBe("12.5, 4.5");
  });

  it("applies operators on ranges cell by cell, for functions to take on", () => {
    // The Total row is in [name]: the formula refers to no whole column of its own (Price)
    expect(evaluate(FRUIT, '=TEXTJOIN(", ", TRUE, "**" & [name] & "**")')).toBe("**Pear**, **Apple**, **Fig**, **Total**");
    expect(evaluate(FRUIT, '=TEXTJOIN(", ", TRUE, "[[" & A1:A2 & "]]")')).toBe("[[Pear]], [[Apple]]");
    expect(evaluate(FRUIT, "=SUM([qty] * [price])")).toBe("82,5");
    expect(evaluate(FRUIT, "=SUM(-[qty])")).toBe("-15");
    expect(evaluate(FRUIT, "=SUMPRODUCT(([qty] > 2) * [qty])")).toBe("13");
    // A one-cell reference is its value; ranges must be the same size
    expect(evaluate(FRUIT, '=TEXTJOIN("+", TRUE, [qty] * B1)')).toBe("9+30+6+0");
    expect(evaluate(FRUIT, "=SUM(B1:B3 * C1:C2)")).toBe("#VALUE!");
    // A cell shows one value: a range left as the result is #VALUE!
    expect(evaluate(FRUIT, "=[qty] * 2")).toBe("#VALUE!");
    expect(evaluate(FRUIT, "=B1 * 2")).toBe("6");
  });

  it("takes an argument left out as not given", () => {
    const GRADES = ["| Min | Grade | Result |", "|---|---|---|", "| 0 | F | |", "| 50 | C | |", "| 70 | B | |", "| 90 | A | 75 |"].join("\n");
    const at = { row: 1, column: 2 };
    expect(evaluate(GRADES, "=XLOOKUP(C4, A1:A4, B1:B4, , -1)", at)).toBe("B");
    expect(evaluate(GRADES, "=XLOOKUP(5, A1:A4, B1:B4, , 1)", at)).toBe("C");
    expect(evaluate(GRADES, "=XLOOKUP(95, A1:A4, B1:B4, , 1)", at)).toBe("#N/A");
    expect(evaluate(GRADES, "=XLOOKUP(95, A1:A4, B1:B4, C3, 1)", at)).toBe("");
    expect(evaluate(GRADES, '=CONCAT("a", , "b")', at)).toBe("ab");
  });

  it("computes with times and lengths of time, and writes them as times", () => {
    const SHIFTS = ["| From | To | Hours |", "|---|---|---|", "| 9:00 | 17:30 | 14:00 |", "| 22:15 | 23:00 | 20:00 |", "| | | |", ""].join("\n");
    const last = { row: 3, column: 2 };
    expect(evaluate(SHIFTS, "=B1-A1", last)).toBe("08:30");
    expect(evaluate(SHIFTS, "=SUM(C1:C2)", last)).toBe("34:00");
    expect(evaluate(SHIFTS, "=SUM(B1:B2)-SUM(A1:A2)", last)).toBe("09:15");
    expect(evaluate(SHIFTS, "=AVERAGE(C1:C2)", last)).toBe("17:00");
    expect(evaluate(SHIFTS, "=MAX(A1:A2)", last)).toBe("22:15");
    expect(evaluate(SHIFTS, "=C1*3", last)).toBe("42:00");
    expect(evaluate(SHIFTS, "=C1/4", last)).toBe("03:30");
    expect(evaluate(SHIFTS, "=C1/1E-320", last)).toBe("#NUM!");
    expect(evaluate(SHIFTS, "=C1/C2", last)).toBe("0.7");
    expect(evaluate(SHIFTS, "=A1-B1", last)).toBe("-08:30");
    expect(evaluate(SHIFTS, '="17:30"-"9:00"', last)).toBe("08:30");
    // Compared by length, not as text
    expect(evaluate(SHIFTS, "=A1<A2", last)).toBe("TRUE");
    expect(evaluate(SHIFTS, '="9:05"<"14:30"', last)).toBe("TRUE");
    // A fraction of a day where a number is expected; as text, as written
    expect(evaluate(SHIFTS, "=ROUND(C1, 3)", last)).toBe("0.583");
    // Hours (minutes) of a time as a number: the time divided by an hour (a minute)
    expect(evaluate(SHIFTS, '=C1/"1:00"', last)).toBe("14");
    expect(evaluate(SHIFTS, '=B1/"0:01"-A1/"0:01"', last)).toBe("510");
    expect(evaluate(SHIFTS, "=A1&\"-\"&B1", last)).toBe("9:00-17:30");
    expect(evaluate(SHIFTS, "=A1", last)).toBe("9:00");
    // Days and hours of a length of time
    expect(evaluate(SHIFTS, '=INT(SUM(C1:C2)) & " d " & HOUR(SUM(C1:C2)) & " h"', last)).toBe("1 d 10 h");
    expect(evaluate(SHIFTS, '=TEXT(SUM(C1:C2), "[h]:mm")', last)).toBe("34:00");
    // A sum of times and numbers is a number
    expect(evaluate(SHIFTS, "=SUM(C1, 1)", last)).toBe("1.5833333333333");
  });

  it("adds days to dates and subtracts dates, as spreadsheets do", () => {
    const TRIP = ["| Start | End | Result |", "|---|---|---|", "| 2025-11-06 | 2025-11-09 18:00 | |", ""].join("\n");
    expect(evaluate(TRIP, "=A1+7")).toBe("2025-11-13");
    expect(evaluate(TRIP, "=7+A1")).toBe("2025-11-13");
    expect(evaluate(TRIP, "=A1-1")).toBe("2025-11-05");
    expect(evaluate(TRIP, "=A1+0.25")).toBe("2025-11-06 06:00");
    expect(evaluate(TRIP, "=B1-A1")).toBe("3.75");
    expect(evaluate(TRIP, '="2025-12-24"-A1')).toBe("48");
    expect(evaluate(TRIP, "=A1+C1")).toBe("2025-11-06"); // an empty cell is 0 days
    // A time of day added to a date: the date at that time
    expect(evaluate(TRIP, "=DATE(2025, 11, 6) + TIME(14, 30)")).toBe("2025-11-06 14:30");
    expect(evaluate(TRIP, '=A1+"9:05"')).toBe("2025-11-06 09:05");
    expect(evaluate(TRIP, '=B1-"18:00"')).toBe("2025-11-09 00:00"); // a date with a time keeps one
    expect(evaluate(TRIP, "=A1+B1")).toBe("#VALUE!");
    expect(evaluate(TRIP, '=A1+"x"')).toBe("#VALUE!");
    // Dates compare in order, and a date a formula gave is a date for the next one
    expect(evaluate(TRIP, "=B1>A1")).toBe("TRUE");
    expect(evaluate(TRIP, '=A1="2025-11-06 00:00"')).toBe("TRUE");
    expect(evaluate(TRIP, '="2025-11-06T08:00"<"2025-11-06 09:00"')).toBe("TRUE");
    expect(evaluate(TRIP, '=DATEADD(DATEADD(A1, 1, "m"), 1, "d")')).toBe("2025-12-07");
  });

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

  it("names columns as SilverBullet's index keys them, and duplicates by occurrence", () => {
    const markdown = ["| Name | Unit price | Qty | qty |", "|---|---|---|---|", "| a | 2 | 3 | 4 |", "| x | | | |"].join("\n");
    expect(evaluate(markdown, "=SUM([unit_price])", { row: 2, column: 1 })).toBe("2");
    expect(evaluate(markdown, "=SUM([Qty:2])", { row: 2, column: 1 })).toBe("4");
    expect(evaluate(markdown, "=SUM([QTY])", { row: 2, column: 1 })).toBe("3");
  });

  it("writes column references by the columns' keys, leaving unknown ones as written", () => {
    const headers = ["Name", "Unit price", "Qty", "qty"];
    expect(withColumnKeys("=[@Unit price]*[QTY:2]+[Nope]", headers)).toBe("=[@unit_price]*[qty:2]+[Nope]");
    expect(withColumnKeys("=SUM(A1:A3)", headers)).toBe("=SUM(A1:A3)");
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
      `16 <meta formulas.f='=SUM(B1:B3)'>`,
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
    `| Total | 6 <meta formulas.f='=SUM(B1:B3)+B1'> | 6 <meta formulas.f='=SUM([Qty])'> |`,
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

  it("renames [name] references with their column, written by its key", () => {
    expect(shifted((t) => setCell(t, 0, 1, "Amount"))).toEqual(["=SUM(B1:B3)+B1", "=SUM([amount])"]);
    // The same key written another way is not a rename
    expect(shifted((t) => setCell(t, 0, 1, "QTY"))).toEqual(["=SUM(B1:B3)+B1", "=SUM([Qty])"]);
  });

  it("writes the occurrence when a column comes to share its name with another", () => {
    expect(shifted((t) => setCell(t, 0, 0, "Qty"))).toEqual(["=SUM(B1:B3)+B1", "=SUM([qty:2])"]);
  });

  it("moves references with $ with their cells too, their $ kept", () => {
    const fixed = TABLE.replace('=SUM(B1:B3)+B1', '=SUM($B$1:B$3)+$B1');
    const before = parseTable(fixed);
    const inserted = shiftReferences(before, insertRow(before, 1), (r) => (r >= 1 ? r + 1 : r));
    expect(formulas(inserted)[0]).toBe("=SUM($B$2:B$4)+$B2");
    const toFront = (c: number) => (c === 1 ? 0 : c === 0 ? 1 : c);
    expect(formulas(shiftReferences(before, moveColumn(before, 1, 0), undefined, toFront))[0]).toBe("=SUM($A$1:A$3)+$A1");
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

  it("reads $ in cells and ranges: the edges kept when a formula is filled", () => {
    const [cell, range, mixed, other] = references("=$A$1 + SUM(A$1:$B3) + B3:$A$1 + prices!$B$2");
    expect(cell).toEqual({ kind: "area", area: { top: 0, left: 0, bottom: 0, right: 0 }, fixed: { left: true, top: true, right: true, bottom: true }, from: 1, to: 5 });
    expect(range).toMatchObject({ area: { top: 0, left: 0, bottom: 2, right: 1 }, fixed: { left: false, top: true, right: true, bottom: false } });
    // Each edge as the end that gives it is written
    expect(mixed).toMatchObject({ area: { top: 0, left: 0, bottom: 2, right: 1 }, fixed: { left: true, top: true, right: false, bottom: false } });
    expect(other).toMatchObject({ table: { name: "prices" }, fixed: { left: true, top: true } });
    // Without $, no fixed edges
    expect(references("=A1")[0]).not.toHaveProperty("fixed");
    // A $ that makes no cell is a mistake, as any other character there
    expect(references("=$X")).toEqual([]);
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

describe("ROW()", () => {
  it("is the row the formula is in, counted as A1 counts (1: the first row under the header)", () => {
    expect(evaluate(FRUIT, "=ROW()", { row: 1, column: 2 })).toBe("1");
    expect(evaluate(FRUIT, "=ROW()", { row: 4, column: 2 })).toBe("4");
    // A number as any other
    expect(evaluate(FRUIT, "=ROW()*10+[@qty]", { row: 2, column: 2 })).toBe("30");
  });
});

describe("calculated columns", () => {
  const ROWS = [
    "| Item | Qty | Price | Amount |",
    "|---|---|---|---|",
    `| a | 2 | 3 | 6 <meta formulas.f='=[@Qty]*[@Price]'> |`,
    `| b | 1 | 4 | 4 <meta formulas.f='=[@Qty]*[@Price]'> |`,
    "| new | | | |",
    `| Total | 3 <meta formulas.f='=SUM([Qty])'> | | |`,
  ].join("\n");

  it("fills a new row's empty cells with the formula its column computes every row with", () => {
    const filled = withCalculatedCells(parseTable(ROWS), 3);
    expect(filled.rows[3]!.cells).toEqual(["new", "", "", `<meta formulas.f='=[@Qty]*[@Price]'>`]);
    expect(formulaOf(recalculate(filled).rows[4]!.cells[1]!)!.value).toBe("3");
  });

  it("knows a column as calculated only when all its rows hold the same formula, total rows aside", () => {
    const table = parseTable(ROWS);
    expect(calculatedFormula(table, 3, new Set([3]))).toBe("=[@Qty]*[@Price]");
    expect(calculatedFormula(table, 1, new Set([3]))).toBeUndefined();
    const mixed = setCell(table, 2, 3, "5");
    expect(calculatedFormula(mixed, 3, new Set([3]))).toBeUndefined();
    const other = setCell(table, 2, 3, formulaCell("", "=[@Qty]+1"));
    expect(calculatedFormula(other, 3, new Set([3]))).toBeUndefined();
  });
});

describe("formulaChoices of the page's names", () => {
  const names = [
    { kind: "cell" as const, name: "_tmp" },
    { kind: "table" as const, name: "Prices" },
    { kind: "cell" as const, name: "day" },
  ];

  it("offers names as written, ignoring case, a whole one first and names before functions", () => {
    expect(choiceNames(formulaChoices("=pr", 3, 3, names))!.names).toEqual(["Prices", "PRODUCT", "PROPER"]);
    expect(choiceNames(formulaChoices("=DAY", 4, 4, names))!.names.slice(0, 2)).toEqual(["day", "DAY"]);
    // A name may start with _
    expect(choiceNames(formulaChoices("=_t", 3, 3, names))!.names).toEqual(["_tmp"]);
  });

  it("offers after a table's name and ! that table's cells by their names, its own name its own cells, another page's nothing", () => {
    const page = [
      { kind: "cell" as const, name: "vat", table: "rates" },
      { kind: "cell" as const, name: "fee", table: "rates" },
      { kind: "cell" as const, name: "total" },
    ];
    expect(choiceNames(formulaChoices("=rates!v", 8, 8, page))!.names).toEqual(["vat"]);
    // In the table named prices, its own cells are offered bare: prices!to is its total
    expect(choiceNames(formulaChoices("=prices!to", 10, 10, page, "prices"))!.names).toEqual(["total"]);
    expect(formulaChoices("=[[Other]]rates!v", 17, 17, page)).toBeUndefined();
  });
});

describe("formulaChoices of functions", () => {
  it("offers the functions a name typed may be, the one of that whole name first", () => {
    expect(choiceNames(formulaChoices("=AVE", 4, 4))).toEqual({ from: 1, to: 4, names: ["AVERAGE", "AVERAGEIFS"] });
    expect(choiceNames(formulaChoices("=sum(A1)+rou", 12, 12))).toEqual({ from: 9, to: 12, names: ["ROUND", "ROUNDDOWN", "ROUNDUP"] });
    expect(choiceNames(formulaChoices("=A", 2, 2))!.names).toEqual(["ABS", "AND", "AVERAGE", "AVERAGEIFS"]);
    expect(choiceNames(formulaChoices("=IF", 3, 3))!.names).toEqual(["IF", "IFERROR"]);
  });

  it("offers none for cells, texts, existing parentheses, the middle of a name, or no function", () => {
    expect(choiceNames(formulaChoices("=A1", 3, 3))).toBeUndefined();
    expect(choiceNames(formulaChoices("=SUM(", 4, 4))).toBeUndefined();
    expect(choiceNames(formulaChoices('="AVE', 5, 5))).toBeUndefined();
    expect(choiceNames(formulaChoices("=[AVE", 5, 5))).toBeUndefined();
    expect(choiceNames(formulaChoices("=XYZ", 4, 4))).toBeUndefined();
    expect(choiceNames(formulaChoices("=AVERAGE", 4, 4))).toBeUndefined(); // in the middle of a name
    expect(choiceNames(formulaChoices("=AVE", 2, 4))).toBeUndefined(); // a selection
    expect(choiceNames(formulaChoices("AVE", 3, 3))).toBeUndefined();
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
    // Not right before another operand, a cell with $ too
    expect(referenceSlot("=SUM(A1)", 5, 5)).toBeUndefined();
    expect(referenceSlot("=SUM($A$1)", 5, 5)).toBeUndefined();
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
  it("explains the function whose arguments the cursor is in, marking the one it is in", () => {
    const marked = (formula: string, caret = formula.length) => {
      const help = formulaHelp(formula, caret)!;
      return help.argument ? `${help.syntax.slice(0, help.argument.from)}<${help.syntax.slice(help.argument.from, help.argument.to)}>${help.syntax.slice(help.argument.to)}` : help.syntax;
    };
    expect(marked("=ROUND(")).toBe("ROUND(<number>, [digits])");
    expect(marked("=ROUND(SUM(A1:A2), ")).toBe("ROUND(number, <[digits]>)");
    expect(marked("=ROUND(SUM(A1")).toBe("SUM(<number1>, [number2], …)");
    // Past the arguments written: the one before "…" again (it repeats)
    expect(marked("=SUM(1; 2; 3; ")).toBe("SUM(number1, <[number2]>, …)");
    expect(marked('=IF(A1>1, "a", "b", ')).toBe("IF(condition, value_if_true, [value_if_false])"); // too many: none
    // Commas in a text or a call inside are not this call's
    expect(marked('=CONCAT("a,b", ROUND(1, 2), ')).toBe("CONCAT(text1, <[text2]>, …)");
  });

  it("explains references otherwise, and nothing outside formulas", () => {
    expect(formulaHelp("=", 1)).toEqual(REFERENCE_HELP);
    expect(formulaHelp("=SU", 3)).toEqual(REFERENCE_HELP); // a name typed: the list of functions shows instead
    expect(formulaHelp("text", 2)).toBeUndefined();
  });
});

describe("findFunctions", () => {
  const names = (query: string, category?: Parameters<typeof findFunctions>[1]) => findFunctions(query, category).map((f) => f.name);
  it("finds functions by their names first, then by what they do", () => {
    expect(names("sum")[0]).toBe("SUM");
    // A name starting so, then one containing it, then the descriptions
    expect(names("count").slice(0, 3)).toEqual(["COUNT", "COUNTA", "COUNTIFS"]);
    expect(names("count")).toContain("ROW"); // "counted in the table"
    expect(names("date").slice(0, 3)).toEqual(["DATE", "DATEADD", "DATEDIF"]);
    expect(names("date")).toContain("TODAY"); // "Today's date"
    // Every word, in any order and case
    expect(names("ROUNDS decimal")).toEqual(["ROUND", "ROUNDDOWN", "ROUNDUP"]);
    expect(names("nothing like this")).toEqual([]);
    expect(names("").length).toBeGreaterThan(30);
  });

  it("finds them in a group", () => {
    expect(names("", "logic")).toEqual(["AND", "IF", "IFERROR", "ISNUMBER", "NOT", "OR"]);
    expect(names("", "lookup")).toEqual(["ROW", "XLOOKUP"]);
    expect(names("", "custom")).toEqual([]);
  });
});

describe("cells with $", () => {
  it("are calculated as the same cells without", () => {
    expect(evaluate(FRUIT, "=$B$1+B$2")).toBe("13");
    expect(evaluate(FRUIT, "=SUM($B$1:$B3)")).toBe("15");
  });

  it("cycle with F4: A1, $A$1, A$1, $A1, A1, a range's ends alike, the caret in or right after it", () => {
    const f4 = (formula: string, caret = formula.length) => {
      const cycled = cycleFixed(formula, caret);
      return cycled && formula.slice(0, cycled.from) + cycled.text + formula.slice(cycled.to);
    };
    expect(f4("=A1")).toBe("=$A$1");
    expect(f4("=$A$1")).toBe("=A$1");
    expect(f4("=A$1")).toBe("=$A1");
    expect(f4("=$A1")).toBe("=A1");
    expect(f4("=SUM(B1:C3)", 7)).toBe("=SUM($B$1:$C$3)");
    expect(f4("=prices!B2*2", 9)).toBe("=prices!$B$2*2");
    // Not on a reference: nothing
    expect(f4("=SUM(1)")).toBeUndefined();
    expect(f4("=[qty]")).toBeUndefined();
    // Not in a text that is no formula
    expect(f4("Room B2")).toBeUndefined();
  });

  it("are not taken for a function's name while typed", () => {
    expect(choiceNames(formulaChoices("=$A", 3, 3))).toBeUndefined();
    expect(choiceNames(formulaChoices("=A$", 3, 3))).toBeUndefined();
  });
});

describe("filledFormula", () => {
  const size = { rows: 5, columns: 3 };
  it("moves a formula's references as far as it is copied, but the parts fixed with $", () => {
    expect(filledFormula("=A1*2", 2, 0, size)).toBe("=A3*2");
    expect(filledFormula("=SUM(A1:B2)", 1, 1, size)).toBe("=SUM(B2:C3)");
    expect(filledFormula("=$A$1+A$1+$A1", 2, 1, size)).toBe("=$A$1+B$1+$A3");
    expect(filledFormula("=SUM($A$1:A1)", 3, 0, size)).toBe("=SUM($A$1:A4)");
    // Up or left past the table, or past its end: #REF!
    expect(filledFormula("=A1+B2", -1, 0, size)).toBe("=#REF!+B1");
    expect(filledFormula("=C1", 0, 1, size)).toBe("=#REF!");
    // Another table's references move, unchecked; columns and names need no moving
    expect(filledFormula("=prices!B2+[qty]+[@qty]+vat", 1, 0, size)).toBe("=prices!B3+[qty]+[@qty]+vat");
  });
});

describe("needsOperator", () => {
  it("says where a function would follow an operand", () => {
    expect(["=", "=SUM(", "=A1+", "=IF(A1, ", "=A1 * "].map((f) => needsOperator(f, f.length))).toEqual([false, false, false, false, false]);
    expect(["=A1", "=VAT([@price])", "=3 ", '="a"'].map((f) => needsOperator(f, f.length))).toEqual([true, true, true, true]);
  });
});

describe("argumentSpan", () => {
  it("finds an argument in a syntax, brackets and all", () => {
    const at = (syntax: string, index: number) => {
      const span = argumentSpan(syntax, index);
      return span && syntax.slice(span.from, span.to);
    };
    expect(at("XLOOKUP(value, lookup_range, result_range, [if_not_found])", 3)).toBe("[if_not_found]");
    expect(at("TODAY()", 0)).toBeUndefined();
    expect(at("VAT(…)", 4)).toBe("…");
  });
});

describe("other tables", () => {
  // The tables of a page by their names, as the controller hands them to formulas
  const tablesOf = (...markdown: string[]): TableSource => {
    const tables = markdown.map((m) => parseTable(m));
    return (name, page) => (page === undefined ? tables.find((t) => metaName(t)?.toLowerCase() === name.toLowerCase()) : undefined);
  };
  const PRICES = `| Name | Price |\n|---|---|\n| Pear | 12 |\n| Fig | 2,5 |\n| Total | 14,5 <meta formulas.f='=SUM([price])'> |\n| <meta core.table core.name='prices'> |`;
  // What `formula` shows in the last cell of a one-cell table, with `tables` around it
  const result = (formula: string, tables: TableSource, own = "| A |\n|---|\n| |") => {
    const table = parseTable(own);
    const cells = table.rows.map((r, i) => (i === table.rows.length - 1 ? { cells: [formulaCell("", formula)] } : r));
    return formulaOf(recalculate({ ...table, rows: cells }, tables).rows[table.rows.length - 1]!.cells[0]!)!.value;
  };

  it("reads another table's cells, ranges and columns by its name", () => {
    const tables = tablesOf(PRICES);
    expect(result("=prices!B1", tables)).toBe("12");
    expect(result("=SUM(prices!B1:B2)", tables)).toBe("14.5");
    // A column without its total; the other table's formulas are calculated
    expect(result("=SUM(prices![price])", tables)).toBe("14.5");
    expect(result("=prices!B3", tables)).toBe("14.5");
    expect(result("=PRICES!A2", tables)).toBe("Fig");
    expect(result('=XLOOKUP("fig", prices![name], prices![price])', tables)).toBe("2.5");
  });

  it("says what is wrong with a reference to another table", () => {
    const tables = tablesOf(PRICES);
    const errors = (formula: string) => {
      const table = parseTable("| A |\n|---|\n| |");
      return formulaErrors({ ...table, rows: [table.rows[0]!, { cells: [formulaCell("", formula)] }] }, tables).get("1,0");
    };
    expect(errors("=stock!A1")).toBe("#REF! there is no table named stock on this page");
    expect(errors("=prices!C1")).toBe("#REF! prices!C1 is outside the table");
    expect(errors("=SUM(prices![qty])")).toBe('#REF! there is no column named "qty" in prices');
    expect(errors('=XLOOKUP("fig", prices![qty], prices![price], 0)')).toBe('#REF! there is no column named "qty" in prices');
    expect(errors("=[[Other page]]prices!A1")).toBe("#REF! there is no table named prices on Other page");
    expect(errors("=prices![@price]")).toContain("is a cell of the formula's own row");
    expect(errors("=prices!SUM(A1)")).toContain("is followed by a cell, a range, a [column] or a named cell");
    expect(errors("=prices!")).toBeDefined();
  });

  it("refers to its own table by its name, and finds circles across tables", () => {
    const own = `| A |\n|---|\n| 5 |\n| |\n| <meta core.table core.name='mine'> |`;
    expect(result("=mine!A1*2", tablesOf(), own)).toBe("10");
    const ping = `| A |\n|---|\n| 1 <meta formulas.f='=pong!A1'> |\n| <meta core.table core.name='ping'> |`;
    const pong = `| A |\n|---|\n| 1 <meta formulas.f='=ping!A1'> |\n| <meta core.table core.name='pong'> |`;
    expect(formulaOf(recalculate(parseTable(ping), tablesOf(ping, pong)).rows[1]!.cells[0]!)!.value).toBe("#CYCLE!");
  });

  it("finds the references to other tables, for the controller to recalculate them", () => {
    expect(references("=prices!B2+[@qty]*prices![price]").map((r) => [r.kind, r.table?.name])).toEqual([
      ["area", "prices"],
      ["column", undefined],
      ["column", "prices"],
    ]);
    expect(references("=[[Ceník]]prices!A1")[0]!.table).toEqual({ name: "prices", page: "Ceník" });
    expect(referredTableNames(parseTable(`| A |\n|---|\n| 1 <meta formulas.f='=Prices!B1+[[Other]]stock!A1'> |`))).toEqual(new Set(["prices"]));
    expect(referredTableNames(parseTable(`| A |\n|---|\n| 1 <meta formulas.f='=B1'> |`)).size).toBe(0);
  });

  it("leaves references to other tables alone when this table's rows and columns move", () => {
    const own = `| Price | Qty |\n|---|---|\n| 1 | 2 |\n| 3 <meta formulas.f='=prices!B1+prices![price]+A1'> | |`;
    const before = parseTable(own);
    // Columns swapped: A1 follows to B1, prices!B1 and prices![price] stay
    const after = { ...before, rows: before.rows.map((r) => ({ cells: [r.cells[1]!, r.cells[0]!] })) };
    const shifted = shiftReferences(before, after, undefined, (c) => 1 - c);
    expect(formulaOf(shifted.rows[2]!.cells[1]!)!.formula).toBe("=prices!B1+prices![price]+B1");
  });

  it("does not count another table's column as a total of its own", () => {
    // [price] of this table without the row that sums prices![price]
    const own = `| Price |\n|---|\n| 3 |\n| 0 <meta formulas.f='=SUM(prices![price])'> |\n| |`;
    expect(result("=SUM([price])", tablesOf(PRICES), own)).toBe("17.5");
  });
});

describe("references to another table follow its edits", () => {
  const PRICES = `| Name | Price |\n|---|---|\n| Pear | 12 |\n| Fig | 3 |\n| <meta core.table core.name='prices'> |`;
  const prices = parseTable(PRICES);
  const formulas = (table: ReturnType<typeof parseTable>) =>
    table.rows.slice(1).flatMap((row) => row.cells.map((cell) => formulaOf(cell)?.formula).filter((f) => f !== undefined));
  const referring = (...formula: string[]) =>
    parseTable(["| X |", "|---|", ...formula.map((f) => `| ${formulaCell("", f)} |`)].join("\n"));

  it("follows inserted, deleted and moved rows and columns of the named table", () => {
    const table = referring("=prices!B1", "=SUM(prices!B1:B2)", "=other!B1+B1", "=[[Elsewhere]]prices!B1");
    // A row inserted above Pear: its cells move down one row
    const inserted = insertRow(prices, 1);
    expect(formulas(followTable(table, prices, inserted, (r) => (r === 0 ? 0 : r + 1)))).toEqual([
      "=prices!B2",
      "=SUM(prices!B2:B3)",
      "=other!B1+B1",
      "=[[Elsewhere]]prices!B1",
    ]);
    // Column Price deleted: its cells are gone
    const deleted = deleteColumn(prices, 1);
    expect(formulas(followTable(referring("=prices!B1", "=prices![price]"), prices, deleted, undefined, (c) => (c === 1 ? undefined : c)))).toEqual([
      "=prices!#REF!",
      "=prices!#REF!",
    ]);
  });

  it("follows a renamed column and a renamed table", () => {
    const renamedColumn = setCell(prices, 0, 1, "Cost");
    expect(formulas(followTable(referring("=SUM(prices![price])"), prices, renamedColumn))).toEqual(["=SUM(prices![cost])"]);
    const renamed = withMetaName(prices, "cost");
    expect(formulas(followTable(referring("=prices!B1*prices![price]", "=PRICES!A1"), prices, renamed))).toEqual([
      "=cost!B1*cost![price]",
      "=cost!A1",
    ]);
    // A reference to its deleted cells is renamed too, and one to its named cell
    expect(formulas(followTable(referring("=prices!#REF!"), prices, renamed))).toEqual(["=cost!#REF!"]);
    expect(formulas(followTable(referring("=1+prices!vat"), prices, renamed))).toEqual(["=1+cost!vat"]);
    expect(referredTableNames(referring("=prices!#REF!"))).toEqual(new Set(["prices"]));
    // The name removed: the references stay, and show #REF!
    expect(formulas(followTable(referring("=prices!B1"), prices, withMetaName(prices, undefined)))).toEqual(["=prices!B1"]);
  });

  it("follows the table's own edits in references that name the table itself", () => {
    const mine = parseTable(`| A |\n|---|\n| 5 |\n| 0 <meta formulas.f='=mine!A1*2'> |\n| <meta core.table core.name='mine'> |`);
    const inserted = insertRow(mine, 1);
    expect(formulas(shiftReferences(mine, inserted, (r) => (r === 0 ? 0 : r + 1)))).toEqual(["=mine!A2*2"]);
    expect(formulas(shiftReferences(mine, withMetaName(mine, "ours")))).toEqual(["=ours!A1*2"]);
  });

  it("evaluates a reference to deleted cells of another table as #REF!", () => {
    const table = referring("=prices!#REF!");
    const tables: TableSource = (name) => (name === "prices" ? prices : undefined);
    expect(formulaErrors(table, tables).get("1,0")).toBe("#REF! a reference to deleted cells of prices");
  });
});

describe("named cells", () => {
  const RATES = parseTable(`| Rate | Value |\n|---|---|\n| VAT | 0.21 <meta core.cn='vat'> |\n| Fee | 2 <meta formulas.f='=vat*10'> <meta core.cn='fee'> |\n| <meta core.table core.name='rates'> |`);
  const UNNAMED = parseTable(`| Rate | Value |\n|---|---|\n| VAT | 0.21 <meta core.cn='vat'> |`);
  type Tables = ReturnType<typeof parseTable>[];
  // A source with `tables` on this page and `elsewhere` on the page "Other": the tables by their names, the cells by theirs
  const sourceOf = (tables: Tables, elsewhere: Tables = []): TableSource => {
    const list = (page?: string) => (page === "Other" ? elsewhere : tables);
    const cells = (name: string, page?: string) =>
      list(page).flatMap((table) =>
        table.rows.flatMap((row, r) => {
          const column = row.cells.findIndex((cell) => cellNameOf(cell)?.toLowerCase() === name.toLowerCase());
          return r > 0 && column >= 0 ? [{ table, tableName: metaName(table), row: r, column }] : [];
        }),
      );
    return Object.assign((name: string, page?: string) => list(page).find((table) => metaName(table)?.toLowerCase() === name.toLowerCase()), {
      cell: (name: string, page?: string) => cells(name, page)[0],
      cellsNamed: cells,
    });
  };
  const result = (formula: string, tables?: TableSource, own = "| A |\n|---|\n| |") => {
    const table = parseTable(own);
    const rows = table.rows.map((r, i) => (i === table.rows.length - 1 ? { cells: [formulaCell("", formula)] } : r));
    return formulaOf(recalculate({ ...table, rows }, tables).rows[table.rows.length - 1]!.cells[0]!)!.value;
  };
  const error = (formula: string, tables: TableSource) => {
    const table = parseTable("| A |\n|---|\n| |");
    return formulaErrors({ ...table, rows: [table.rows[0]!, { cells: [formulaCell("", formula)] }] }, tables).get("1,0");
  };

  it("uses a named cell of its own table, and another table's by its name, also on another page", () => {
    expect(result("=rate*100", undefined, `| A |\n|---|\n| 0.5 <meta core.cn='rate'> |\n| |`)).toBe("50");
    expect(result("=100*(1+rates!VAT)", sourceOf([RATES]))).toBe("121");
    // A named cell's formula is calculated too (its bare vat is its own table's)
    expect(result("=rates!fee+1", sourceOf([RATES]))).toBe("3.1");
    expect(result("=[[Other]]rates!vat*2", sourceOf([], [RATES]))).toBe("0.42");
  });

  it("takes a bare name as its own table's only, and says how to write another table's", () => {
    expect(error("=VAT", sourceOf([RATES]))).toBe("#NAME? VAT is a cell of the table rates: write rates!VAT");
    expect(error("=vat", sourceOf([UNNAMED]))).toContain("vat is a cell of another table, which has no name: name that table");
    expect(error("=vat", sourceOf([RATES, UNNAMED]))).toBe("#NAME? vat is a cell of several tables (rates): write which, as rates!vat");
    expect(error("=[[Other]]vat", sourceOf([], [RATES]))).toBe("#NAME? vat is a cell of the table rates: write [[Other]]rates!vat");
    expect(error("=tax", sourceOf([RATES]))).toBe("#NAME? there is no cell or row named tax in this table");
    expect(error("=rates!tax", sourceOf([RATES]))).toBe("#NAME? there is no cell or row named tax in rates");
    expect(error("=[[Other]]tax", sourceOf([], [RATES]))).toBe("#NAME? there is no cell or row named tax on Other");
  });

  it("writes another table's cell named bare, as before a name was its table's, as that table's: only where one named table has it", () => {
    const own = parseTable("| A |\n|---|\n| |");
    expect(qualifyCellNames("=1+vat*2", own, sourceOf([RATES]))).toEqual({ formula: "=1+rates!vat*2", fixes: ["vat → rates!vat"] });
    expect(qualifyCellNames("=[[Other]]vat", own, sourceOf([], [RATES]))).toEqual({ formula: "=[[Other]]rates!vat", fixes: ["[[Other]]vat → [[Other]]rates!vat"] });
    // Left as written: its own table's, already a table's, a table without a name, several tables, no such cell
    expect(qualifyCellNames("=vat", parseTable(`| A |\n|---|\n| 1 <meta core.cn='vat'> |`), sourceOf([RATES])).fixes).toEqual([]);
    expect(qualifyCellNames("=rates!vat", own, sourceOf([RATES])).fixes).toEqual([]);
    expect(qualifyCellNames("=vat", own, sourceOf([UNNAMED])).fixes).toEqual([]);
    expect(qualifyCellNames("=vat", own, sourceOf([RATES, UNNAMED])).fixes).toEqual([]);
    expect(qualifyCellNames("=tax", own, sourceOf([RATES])).fixes).toEqual([]);
    // A table's name that no formula can write (typed by hand), or one another table answers to first: left as written
    const spaced = parseTable(`| Rate | Value |\n|---|---|\n| VAT | 0.21 <meta core.cn='vat'> |\n| <meta core.table core.name='my rates'> |`);
    expect(qualifyCellNames("=vat", own, sourceOf([spaced])).fixes).toEqual([]);
    const twin = parseTable(`| X |\n|---|\n| 1 |\n| <meta core.table core.name='rates'> |`);
    expect(qualifyCellNames("=vat", own, sourceOf([twin, RATES])).fixes).toEqual([]);
  });

  it("finds circles", () => {
    const loop = parseTable(`| A |\n|---|\n| 0 <meta formulas.f='=self+1'> <meta core.cn='self'> |`);
    expect(formulaOf(recalculate(loop).rows[1]!.cells[0]!)!.value).toBe("#CYCLE!");
  });

  it("finds the named cells a formula refers to, not functions, cells or other tables' cell references", () => {
    const named = (formula: string) => namedReferences(formula).map(({ name, page, table }) => ({ name, ...(page ? { page } : {}), ...(table ? { table } : {}) }));
    expect(named("=SUM(A1:B2)*vat+prices!C3+[[Other]]fee+TRUE+[qty]+rates!fee+[[Other]]rates!vat")).toEqual([
      { name: "vat" },
      { name: "fee", page: "Other" },
      { name: "fee", table: { name: "rates" } },
      { name: "vat", table: { name: "rates", page: "Other" } },
    ]);
    expect([...cellNamesOf(RATES)]).toEqual(["vat", "fee"]);
  });
});

describe("named rows", () => {
  const PRICES = parseTable(`| Name | Price |\n|---|---|\n| Pear <meta core.n='pear'> | 12 |\n| Fig <meta core.n='fig'> | 3 |\n| <meta core.table core.name='prices'> |`);
  const source: TableSource = (name, page) => (name.toLowerCase() === "prices" && (page === undefined || page === "Shop") ? PRICES : undefined);
  const result = (formula: string, own = "| A |\n|---|\n| |") => {
    const table = parseTable(own);
    const rows = table.rows.map((r, i) => (i === table.rows.length - 1 ? { cells: [formulaCell("", formula)] } : r));
    return formulaOf(recalculate({ ...table, rows }, source).rows[table.rows.length - 1]!.cells[0]!)!.value;
  };

  it("reads a named row's cell, in its own table, another one and on another page", () => {
    const own = `| Name | Qty | Total |\n|---|---|---|\n| Pear <meta core.n='pear'> | 4 | |\n| x | | |`;
    const table = parseTable(own);
    const withFormula = { ...table, rows: [...table.rows.slice(0, 2), { cells: ["x", "", formulaCell("", "=pear[qty]*2")] }] };
    expect(formulaOf(recalculate(withFormula).rows[2]!.cells[2]!)!.value).toBe("8");
    expect(result("=prices!pear[price]+prices!FIG[price]")).toBe("15");
    expect(result("=[[Shop]]prices!fig[price]")).toBe("3");
  });

  it("is a range of the row's cells, bare: from another row, also by its table's name; from its own, a cycle", () => {
    const own = parseTable(`| Name | Jan | Feb | Total |\n|---|---|---|---|\n| Pear <meta core.n='pear'> | 4 | 5 | |\n| Fig | 1 | 2 | |\n| <meta core.table core.name='fruit'> |`);
    const at = (row: number, formula: string) => setCell(own, row, 3, formulaCell("", formula));
    // From another row: all of it (the name's text is no number for SUM)
    expect(formulaOf(recalculate(at(2, "=SUM(pear)")).rows[2]!.cells[3]!)!.value).toBe("9");
    expect(formulaOf(recalculate(at(2, "=COUNTA(fruit!pear)")).rows[2]!.cells[3]!)!.value).toBe("3");
    expect(formulaOf(recalculate(at(2, "=MAX(pear)")).rows[2]!.cells[3]!)!.value).toBe("5");
    // In its own row: the formula is in the range
    expect(formulaErrors(at(1, "=SUM(pear)")).get("1,3")).toContain("#CYCLE!");
    // Where one value is asked for: as for a whole column
    expect(formulaErrors(at(2, "=pear*2")).get("2,3")).toContain("#VALUE!");
    // From another table
    expect(result("=SUM(prices!pear)")).toBe("12");
    // A cell's name goes before a row's
    const both = setCell(setCell(own, 2, 1, `1 <meta core.cn='pear'>`), 2, 3, formulaCell("", "=pear+1"));
    expect(formulaOf(recalculate(both).rows[2]!.cells[3]!)!.value).toBe("2");
  });

  it("says what is missing, and is not a named cell", () => {
    const table = parseTable("| A |\n|---|\n| |");
    const errors = (formula: string) => formulaErrors({ ...table, rows: [table.rows[0]!, { cells: [formulaCell("", formula)] }] }, source).get("1,0");
    expect(errors("=prices!plum[price]")).toBe("#REF! there is no row named plum in prices");
    expect(errors("=prices!pear[cost]")).toBe('#REF! there is no column named "cost" in prices');
    expect(errors("=prices!pear[@price]")).toContain("a row's cell is written pear[price]");
    expect(namedReferences("=pear[price]+vat").map((ref) => ref.name)).toEqual(["vat"]);
    expect(references("=prices!pear[price]")[0]).toMatchObject({ kind: "column", name: "price", row: "pear", table: { name: "prices" } });
  });

  it("follows its column's rename, and the rows' new order", () => {
    const own = parseTable(`| Name | Price |\n|---|---|\n| Pear <meta core.n='pear'> | 12 |\n| Total | 0 <meta formulas.f='=pear[price]'> |`);
    const renamed = setCell(own, 0, 1, "Cost");
    expect(formulaOf(shiftReferences(own, renamed).rows[2]!.cells[1]!)!.formula).toBe("=pear[cost]");
    // Sorted into the markdown: the name moves with its row
    const sorted = reorderRows(own, [2, 1]);
    expect(formulaOf(recalculate(sorted).rows[1]!.cells[1]!)!.value).toBe("12");
  });

  it("keeps a cell's own name and its row's name apart", () => {
    const cell = withName(withCellName("Pear", "first"), "pear");
    expect(cell).toBe(`Pear <meta core.n='pear' core.cn='first'>`);
    expect([nameOf(cell), cellNameOf(cell), withoutName(cell)]).toEqual(["pear", "first", "Pear"]);
    expect(withCellName(cell, undefined)).toBe(`Pear <meta core.n='pear'>`);
    // In any order, with single quotes; a formula's tag is another one
    expect([nameOf("1 <meta core.cn='x' core.n='y'>"), cellNameOf("1 <meta core.cn='x' core.n='y'>")]).toEqual(["y", "x"]);
    expect(withoutName(`2 <meta formulas.f='=1+1'> <meta core.n='a' core.cn='b'>`)).toBe(`2 <meta formulas.f='=1+1'>`);
  });

  it("finds a row's name a column inserted before the first one moved", () => {
    const table = parseTable(`| New | Name | Price |\n|---|---|---|\n| | Pear <meta core.n='pear'> | 12 |`);
    expect(rowNameIn(table.rows[1]!.cells)).toEqual({ name: "pear", column: 1 });
    expect(namedRows(table).get("pear")).toBe(1);
  });
});
