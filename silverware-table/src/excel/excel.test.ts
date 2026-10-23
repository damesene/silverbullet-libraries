// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseTable } from "../markdown.ts";
import { BUILT_IN_FUNCTIONS } from "../formulas/builtin/index.ts";
import { clearCustomFunctions, defineCustomFunctions } from "../formulas/registry.ts";
import { excelHtml, excelText } from "./clipboard.ts";
import { excelFormula } from "../testing/formulas.ts";
import { EXCEL_FUNCTIONS, SAME_IN_EXCEL, withFutureNames } from "./functions.ts";
import { excelValue, serialOf } from "./values.ts";
import { crc32, excelColumnNames, excelTableName, sheetName, xlsxFile, xlsxParts, xmlText } from "./xlsx.ts";
import { structuredColumn } from "./formulas.ts";

// A table with a total row under it, a named row (pear) and a named cell (vat)
const SHOP = parseTable(
  [
    "| Fruit | Qty | Price | Unit |",
    "|---|---|---|---|",
    `| Pear <meta core.n='pear'> | 3 | 12,50 | d |`,
    `| Apple | 10 | 4,50 <meta core.cn='vat'> | w |`,
    `| Total | 13 <meta formulas.f='=SUM([qty])'> | | |`,
  ].join("\n"),
);
// The formula as Excel writes it in the body cell (row, column), or why not
const write = (formula: string, row = 0, column = 3, templates = {}) => {
  const result = excelFormula(formula, SHOP, row, column, templates);
  return "reason" in result ? { reason: result.reason } : result.array ? { array: result.text } : result.text;
};

describe("Excel's formulas", () => {
  it("writes references as Excel's, the header being row 1", () => {
    expect(write("=A1+B2")).toBe("A2+B3");
    expect(write("=SUM(B1:C2)")).toBe("SUM(B2:C3)");
    // The column without its total row; this row's cell
    expect(write("=SUM([qty])")).toBe("SUM(B2:B3)");
    expect(write("=[@qty]*[@price]", 1)).toBe("B3*C3");
    expect(write("=pear[price] * vat")).toBe("C2*C3");
    // A reference outside the table
    expect(write("=B9")).toBe("#REF!");
    // Its $ kept
    expect(write("=$A$1*SUM($B1:C$2)")).toBe("$A$2*SUM($B2:C$3)");
  });

  it("keeps the order of operations, literals as Excel writes them", () => {
    expect(write("=(A1+B1)*2")).toBe("(A2+B2)*2");
    expect(write("=-B1^2")).toBe("(-B2)^2");
    expect(write("=B1%")).toBe("B2%");
    expect(write('=A1&" ""x"""')).toBe('A2&" ""x"""');
    expect(write("=IF(TRUE, 1.5, B1>=2)")).toBe("IF(TRUE,1.5,B2>=2)");
    // An argument left out stays left out
    expect(write("=XLOOKUP(B1, [qty], [fruit], , -1)")).toBe("_xlfn.XLOOKUP(B2,B2:B3,A2:A3,,-1)");
  });

  it("writes operators on ranges as array formulas", () => {
    expect(write("=SUM([qty] * [price])")).toEqual({ array: "SUM(B2:B3*C2:C3)" });
    expect(write('=TEXTJOIN(", ", TRUE, "**" & [fruit] & "**")')).toEqual({ array: '_xlfn.TEXTJOIN(", ",TRUE,("**"&A2:A3)&"**")' });
    expect(write("=SUM(B1:B2) * 2")).toBe("SUM(B2:B3)*2");
  });

  it("writes functions as Excel has them", () => {
    expect(write("=ROW()")).toBe("(ROW()-1)");
    expect(write("=ROUND(C1)")).toBe("ROUND(C2,0)");
    expect(write("=CEILING(C1, 0.05)")).toBe("_xlfn.CEILING.MATH(C2,0.05)");
    expect(write("=TIME(14, 30)")).toBe("TIME(14,30,0)");
    expect(write('=DATEADD(A1, 2, "w")')).toBe("(A2)+(2)*7");
    expect(write('=DATEADD(A1, 1, "months")')).toBe("EDATE((A2),(1))+MOD((A2),1)");
    expect(write('=DATEDIF(A1, B1, "d")')).toBe("TRUNC(((B2)-(A2)))");
    expect(write('=DATEDIF(A1, B1, "ym")')).toBe('DATEDIF(A2,B2,"YM")');
    expect(write('=MAXIFS([qty], [fruit], "p*")')).toBe('_xlfn.MAXIFS(B2:B3,A2:A3,"p*")');
  });

  it("writes a named row as its cells' run", () => {
    const table = parseTable(`| Name | Jan | Total |\n|---|---|---|\n| Pear <meta core.n='pear'> | 4 | |\n| Fig | 1 | |`);
    expect(excelFormula("=SUM(pear)", table, 1, 2)).toEqual({ text: "SUM(A2:C2)", array: false });
  });

  it("says why a formula cannot be one in Excel", () => {
    expect(write("=prices!B2")).toEqual({ reason: "it refers to the table prices" });
    expect(write("=[[Prices]]vat")).toEqual({ reason: "it refers to vat on another page" });
    expect(write("=prices!vat")).toEqual({ reason: "it refers to the table prices" });
    // The table's own name before its own cell: that cell
    expect(excelFormula("=shop!vat*2", { ...SHOP, meta: { "core.name": "shop" } }, 0, 3)).toEqual({ text: "C3*2", array: false });
    expect(write('=TEXT(A1, "dd.mm.yyyy")')).toEqual({ reason: "Excel reads TEXT's format codes in its own language" });
    expect(write("=DATEADD(A1, 1, [@unit])")).toEqual({ reason: "its unit is not written in the formula (it comes from a cell)" });
    expect(write("=VAT(C1)")).toEqual({ reason: "VAT has no Excel form" });
    expect(write("=SUM(")).toHaveProperty("reason");
    // A wrong number of arguments: Excel would not open the file
    expect(write("=SUM()")).toEqual({ reason: "SUM has a wrong number of arguments" });
    expect(write("=IF(1)")).toEqual({ reason: "IF has a wrong number of arguments" });
    expect(write("=DATEADD(A1)")).toEqual({ reason: "DATEADD has a wrong number of arguments" });
    expect(write("=ABS(1, 2)")).toEqual({ reason: "ABS has a wrong number of arguments" });
    // A range as the result: #VALUE! in Silverware Table
    expect(write("=[qty] * 2")).toEqual({ reason: "its result is a range, not one value" });
    // A custom function of a built-in's name is not Excel's
    defineCustomFunctions([{ name: "ABS", syntax: "ABS(x)", description: "Mine.", minArgs: 1, call: () => 1 }]);
    try {
      expect(write("=ABS(B1)")).toEqual({ reason: "ABS is a custom function with no Excel form (see silverware.table.modules.excel.functions)" });
    } finally {
      clearCustomFunctions();
    }
    expect(write("=ABS(B1)")).toBe("ABS(B2)");
    // Total rows between a column's rows
    const split = parseTable(["| Qty |", "|---|", "| 1 |", `| 1 <meta formulas.f='=SUM([qty])'> |`, "| 2 |"].join("\n"));
    expect(excelFormula("=SUM([qty])", split, 2, 0)).toEqual({ reason: "[qty] has total rows between its rows" });
  });

  it("writes custom functions by their templates", () => {
    const templates = { vat: "ROUND(({1})*1.21,2)", MARGIN: "XLOOKUP({1},{2},{2})", SLUG: false as const };
    expect(write("=VAT(C1)", 0, 3, templates)).toBe("(ROUND((C2)*1.21,2))");
    expect(write("=MARGIN(B1, [qty])", 0, 3, templates)).toBe("(_xlfn.XLOOKUP(B2,B2:B3,B2:B3))");
    expect(write("=SLUG(A1)", 0, 3, templates)).toEqual({ reason: "SLUG is set to be written as its value" });
    // Operations as arguments, and the call in an operation, keep their order
    const margin = { MARGIN: "({1}-{2})/{1}", PLUS: "{1}+1", EMPTY: " " };
    expect(write("=MARGIN(A1+1, B1)", 0, 3, margin)).toBe("(((A2+1)-B2)/(A2+1))");
    expect(write("=2*PLUS(2)", 0, 3, margin)).toBe("2*(2+1)");
    expect(write("=-PLUS(2)", 0, 3, margin)).toBe("-(2+1)");
    expect(write("=EMPTY(2)", 0, 3, margin)).toEqual({ reason: "the template of EMPTY is empty" });
    expect(withFutureNames("_xlfn.XLOOKUP(A1,B1,C1)+concat(x)")).toBe("_xlfn.XLOOKUP(A1,B1,C1)+_xlfn.CONCAT(x)");
  });

  it("knows how every built-in function is written in Excel", () => {
    for (const name of Object.keys(BUILT_IN_FUNCTIONS)) {
      expect([name, SAME_IN_EXCEL.has(name) !== (name in EXCEL_FUNCTIONS)]).toEqual([name, true]);
    }
  });
});

describe("as an Excel table", () => {
  it("names the table and its columns as Excel takes them", () => {
    expect(excelTableName("prices")).toBe("prices");
    expect(excelTableName(undefined)).toBe("Table1");
    expect(excelTableName("A1")).toBe("Table1");
    expect(excelTableName("R1C1")).toBe("Table1");
    expect(excelTableName("Rates")).toBe("Rates");
    expect(excelColumnNames(["Qty", "qty", "", "Qty"])).toEqual(["Qty", "qty2", "Column3", "Qty3"]);
    expect(structuredColumn("Bob's [x] #1")).toBe("[Bob''s '[x'] '#1]");
  });

  it("writes column references by the table's columns: its totals row not among their rows, else cells", () => {
    const table = parseTable("| Name | Jan | Feb | Total |\n|---|---|---|---|\n| a | 1 | 2 | |\n| b | 3 | 4 | |\n| Sum | 4 <meta formulas.f='=SUM([jan])'> | | |");
    const structured = { name: "T", columns: ["Name", "Jan", "Feb", "Total"], totalsRow: true };
    expect(excelFormula("=SUM([jan])", table, 2, 1, {}, structured)).toEqual({ text: "SUM(T[Jan])", array: false });
    expect(excelFormula("=[@jan]*2", table, 0, 3, {}, structured)).toEqual({ text: "T[[#This Row],[Jan]]*2", array: false });
    expect(excelFormula("=SUM([@[feb]:[jan]])", table, 0, 3, {}, structured)).toEqual({ text: "SUM(T[[#This Row],[Jan]:[Feb]])", array: false });
    // Its total row not its last one (no totals row): the column's cells as before
    expect(excelFormula("=SUM([jan])", table, 2, 1, {}, { ...structured, totalsRow: false })).toEqual({ text: "SUM(B2:B3)", array: false });
  });
});

describe("Excel's values", () => {
  it("reads numbers, dates, times, percentages and logical values as Excel keeps them", () => {
    expect(excelValue("12,50 €")).toEqual({ kind: "number", value: 12.5 });
    expect(excelValue("1 000")).toEqual({ kind: "number", value: 1000 });
    expect(excelValue("$5")).toEqual({ kind: "number", value: 5 });
    expect(excelValue("-0,5")).toEqual({ kind: "number", value: -0.5 });
    // What a number would lose stays text
    for (const text of ["007", "+420 777 123 456", "3 kg", "10115 Berlin", "1A", "12345678901234567890", "-5:00"]) {
      expect(excelValue(text)).toEqual({ kind: "text", value: text });
    }
    expect(excelValue("15 %")).toEqual({ kind: "number", value: 0.15, format: "percent" });
    expect(excelValue("12.5%")).toEqual({ kind: "number", value: 0.125, format: "percent1" });
    expect(excelValue("2025-11-06")).toEqual({ kind: "number", value: 45967, format: "date" });
    expect(excelValue("2025-11-06 12:00")).toEqual({ kind: "number", value: 45967.5, format: "dateTime" });
    expect(excelValue("14:30")).toEqual({ kind: "number", value: 14.5 / 24, format: "time" });
    expect(excelValue("40:00:30")).toEqual({ kind: "number", value: (40 * 3600 + 30) / 86400, format: "timeSeconds" });
    expect(excelValue("true")).toEqual({ kind: "boolean", value: true });
    expect(excelValue("#DIV/0!")).toEqual({ kind: "error", value: "#DIV/0!" });
    expect(excelValue("#CYCLE!")).toEqual({ kind: "error", value: "#VALUE!" });
    expect(excelValue("Pear")).toEqual({ kind: "text", value: "Pear" });
    expect(excelValue("  ")).toEqual({ kind: "empty" });
    // Before 1900-03-01 Excel's days are off by its 1900-02-29: kept as text
    expect(excelValue("1900-01-15")).toEqual({ kind: "text", value: "1900-01-15" });
    expect(serialOf(Date.UTC(1900, 2, 1))).toBe(61);
  });

  it("puts values on the clipboard with Excel's attributes, and as text with tabs", () => {
    const html = excelHtml(["Fruit", "Due"], [["Pear & co", "2025-11-06"], ["5", "TRUE"]]);
    expect(html).toContain('<td style="mso-number-format:\'\\@\'">Pear &amp; co</td>');
    expect(html).toContain("<td x:num=\"45967\" style=\"mso-number-format:'yyyy\\-mm\\-dd'\">2025-11-06</td>");
    expect(html).toContain('<td x:num="5">5</td><td x:bool="TRUE">TRUE</td>');
    expect(excelText(["A", "B"], [["x\ty", "1"]])).toBe('A\tB\r\n"x\ty"\t1');
  });
});

/** The files of a zip stored without compression, by name */
function unzip(bytes: Uint8Array): Map<string, string> {
  const files = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(view.getUint32(at + 14, true)).toBe(crc32(data));
    files.set(name, new TextDecoder().decode(data));
    at += 30 + nameLength + size;
  }
  return files;
}

describe("the .xlsx file", () => {
  const sheet = {
    name: "Fruit: [best]",
    header: ["Fruit", "Qty", "Due"],
    rows: [
      [{ value: excelValue("Pear <b>") }, { value: excelValue("3") }, { value: excelValue("2025-11-06") }],
      [{ value: excelValue("Total") }, { value: excelValue("3"), formula: { text: "SUM(B2:B2)", array: false } }, { value: excelValue("") }],
      [{ value: excelValue("") }, { value: excelValue("6"), formula: { text: "SUM(B2:B2*2)", array: true } }],
    ],
    widths: [10, 8, 12],
  };

  it("is a zip of well-formed parts", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
    const files = unzip(xlsxFile(sheet));
    expect(Array.from(files.keys())).toEqual(xlsxParts(sheet).map(([name]) => name));
    for (const [name, text] of files) {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      expect([name, doc.getElementsByTagName("parsererror").length]).toEqual([name, 0]);
    }
  });

  it("holds the cells, their formats and formulas", () => {
    const files = unzip(xlsxFile(sheet));
    const xml = files.get("xl/worksheets/sheet1.xml")!;
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Fruit</t></is></c>');
    expect(xml).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Pear &lt;b&gt;</t></is></c>');
    expect(xml).toContain('<c r="C2" s="2"><v>45967</v></c>');
    expect(xml).toContain('<c r="B3"><f>SUM(B2:B2)</f><v>3</v></c>');
    expect(xml).toContain('<c r="B4"><f t="array" ref="B4">SUM(B2:B2*2)</f><v>6</v></c>');
    expect(xml).toContain('<col min="3" max="3" width="12" customWidth="1"/>');
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Fruit_ _best_" sheetId="1" r:id="rId1"/>');
  });

  it("names sheets and escapes text as Excel and XML need", () => {
    expect(sheetName("a/b:c?d*e[f]g\\h")).toBe("a_b_c_d_e_f_g_h");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    expect(sheetName("''")).toBe("Table");
    expect(sheetName("history")).toBe("History_");
    expect(xmlText('a & <b> "c"\u0001')).toBe("a &amp; &lt;b&gt; &quot;c&quot;");
  });
});
