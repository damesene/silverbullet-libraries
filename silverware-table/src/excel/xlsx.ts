// An Excel file (.xlsx) of one sheet: the header in row 1 (bold, frozen), the
// rows under it, values as Excel keeps them (values.ts), formulas with their
// results (Excel calculates them again when it opens the file). An .xlsx file
// is a zip of XML parts (Office Open XML, ECMA-376); this writes the few a
// sheet needs, stored without compression, so no library is needed. With a
// table, the sheet's cells are an Excel table too (Insert > Table): its name,
// its columns (as the header names them), a filter in its header, banded rows,
// its last row its totals row where asked, its calculated columns' formulas.
import { columnLetters } from "../formulas/index.ts";
import type { ExcelValue, NumberFormat } from "./values.ts";

export type XlsxCell = {
  readonly value: ExcelValue;
  // Its formula, without =; `array`: written as an array formula (see ExcelFormula)
  readonly formula?: { readonly text: string; readonly array: boolean };
};

export type XlsxSheet = {
  readonly name: string;
  // As an Excel table: its column names, unique and not empty
  readonly header: readonly string[];
  readonly rows: readonly (readonly XlsxCell[])[];
  // The columns' widths, in characters
  readonly widths?: readonly number[];
  readonly table?: XlsxTable;
};

/** The sheet's cells as an Excel table */
export type XlsxTable = {
  // A name Excel takes for a table (excelTableName)
  readonly name: string;
  // The last row is the table's totals row
  readonly totalsRow: boolean;
  // Each column's formula where it is a calculated column (the same in every row but the totals row), in Excel's form
  readonly calculated: readonly ({ readonly text: string; readonly array: boolean } | undefined)[];
};

/**
 * A name Excel takes for a table (letters, digits, _ and ., starting with a
 * letter or _, not a cell: A1, R1C1): the one given, else `Table1`
 */
export function excelTableName(name: string | undefined): string {
  const ok = !!name && /^[A-Za-z_][\w.]{0,254}$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^(R\d*C?\d*|C\d*)$/i.test(name);
  return ok ? name! : "Table1";
}

/** A table's column names as Excel wants them: not empty, none twice (ignoring case): Column1, Qty2 */
export function excelColumnNames(header: readonly string[]): string[] {
  const taken = new Set<string>();
  return header.map((text, c) => {
    const base = text.replace(/\s+/g, " ").trim() || `Column${c + 1}`;
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}${n}`;
    taken.add(name.toLowerCase());
    return name;
  });
}

// The styles' order in styles.xml: 0 the default, 1 the header, then one per number format
const FORMAT_STYLES: readonly NumberFormat[] = ["date", "dateTime", "dateTimeSeconds", "time", "timeSeconds", "percent", "percent1", "percent2"];
// Excel's built-in formats where it has one (9: 0%, 10: 0.00%), else ours from 164 up
const FORMAT_CODES: Readonly<Record<NumberFormat, { readonly id: number; readonly code?: string }>> = {
  date: { id: 164, code: "yyyy\\-mm\\-dd" },
  dateTime: { id: 165, code: "yyyy\\-mm\\-dd hh:mm" },
  dateTimeSeconds: { id: 166, code: "yyyy\\-mm\\-dd hh:mm:ss" },
  time: { id: 167, code: "[h]:mm" },
  timeSeconds: { id: 168, code: "[h]:mm:ss" },
  percent: { id: 9 },
  percent1: { id: 169, code: "0.0%" },
  percent2: { id: 10 },
};

/** Text in XML: escaped, without the characters XML cannot hold */
export function xmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** A sheet's name as Excel takes it: at most 31 characters, none of : \ / ? * [ ] */
export function sheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "_").replace(/^'+|'+$/g, "").trim().slice(0, 31);
  // Excel keeps History for itself
  return cleaned.toLowerCase() === "history" ? "History_" : cleaned || "Table";
}

function cellXml(ref: string, cell: XlsxCell, style?: number): string {
  const { value, formula } = cell;
  const format = value.kind === "number" && value.format ? FORMAT_STYLES.indexOf(value.format) + 2 : undefined;
  const s = style ?? format;
  const sAttr = s === undefined ? "" : ` s="${s}"`;
  if (formula) {
    const f = formula.array ? `<f t="array" ref="${ref}">${xmlText(formula.text)}</f>` : `<f>${xmlText(formula.text)}</f>`;
    // The result as calculated, for readers that do not calculate
    switch (value.kind) {
      case "number":
        return `<c r="${ref}"${sAttr}>${f}<v>${value.value}</v></c>`;
      case "boolean":
        return `<c r="${ref}"${sAttr} t="b">${f}<v>${value.value ? 1 : 0}</v></c>`;
      case "error":
        return `<c r="${ref}"${sAttr} t="e">${f}<v>${xmlText(value.value)}</v></c>`;
      case "empty":
        return `<c r="${ref}"${sAttr} t="str">${f}<v></v></c>`;
      case "text":
        return `<c r="${ref}"${sAttr} t="str">${f}<v>${xmlText(value.value)}</v></c>`;
    }
  }
  switch (value.kind) {
    case "empty":
      return "";
    case "number":
      return `<c r="${ref}"${sAttr}><v>${value.value}</v></c>`;
    case "boolean":
      return `<c r="${ref}"${sAttr} t="b"><v>${value.value ? 1 : 0}</v></c>`;
    case "error":
      return `<c r="${ref}"${sAttr} t="e"><v>${xmlText(value.value)}</v></c>`;
    case "text":
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlText(value.value)}</t></is></c>`;
  }
}

/** A column's width in characters for texts in it: the longest one's, within bounds */
export function columnWidth(texts: readonly string[]): number {
  const longest = texts.reduce((n, t) => Math.max(n, t.length), 0);
  return Math.min(60, Math.max(8, longest + 2));
}

function sheetXml(sheet: XlsxSheet): string {
  const cols = (sheet.widths ?? []).map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("");
  const header = `<row r="1">${sheet.header
    .map((name, c) => cellXml(`${columnLetters(c)}1`, { value: name === "" ? { kind: "empty" } : { kind: "text", value: name } }, 1))
    .join("")}</row>`;
  const rows = sheet.rows
    .map((cells, r) => `<row r="${r + 2}">${cells.map((cell, c) => cellXml(`${columnLetters(c)}${r + 2}`, cell)).join("")}</row>`)
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${header}${rows}</sheetData>` +
    (sheet.table ? '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' : "") +
    "</worksheet>"
  );
}

function stylesXml(): string {
  const custom = FORMAT_STYLES.map((f) => FORMAT_CODES[f]).filter((f) => f.code);
  const numFmts = custom.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${xmlText(f.code!)}"/>`).join("");
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    ...FORMAT_STYLES.map((f) => `<xf numFmtId="${FORMAT_CODES[f].id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${custom.length}">${numFmts}</numFmts>` +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>"
  );
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** The table part: where it is, its columns (a totals row's label or formula, a calculated column's formula), its style */
function tableXml(sheet: XlsxSheet, table: XlsxTable): string {
  const columns = sheet.header.length;
  const last = sheet.rows.length + 1;
  const ref = `A1:${columnLetters(Math.max(0, columns - 1))}${last}`;
  const filtered = `A1:${columnLetters(Math.max(0, columns - 1))}${table.totalsRow ? last - 1 : last}`;
  const totals = table.totalsRow ? sheet.rows[sheet.rows.length - 1] : undefined;
  const formula = (tag: string, f: { readonly text: string; readonly array: boolean }) => `<${tag}${f.array ? ' array="1"' : ""}>${xmlText(f.text)}</${tag}>`;
  const tableColumns = sheet.header
    .map((name, c) => {
      const total = totals?.[c];
      // A label is text: a number, a date or a logical value there stays the cell's value only
      const label = total && !total.formula && total.value.kind === "text" ? ` totalsRowLabel="${xmlText(total.value.value)}"` : "";
      const fn = total?.formula ? ' totalsRowFunction="custom"' : "";
      const calculated = table.calculated[c];
      const inner = (calculated ? formula("calculatedColumnFormula", calculated) : "") + (total?.formula ? formula("totalsRowFormula", total.formula) : "");
      return `<tableColumn id="${c + 1}" name="${xmlText(name)}"${label}${fn}${inner ? `>${inner}</tableColumn>` : "/>"}`;
    })
    .join("");
  return (
    XML +
    `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="${xmlText(table.name)}" displayName="${xmlText(table.name)}" ref="${ref}"${table.totalsRow ? ' totalsRowCount="1"' : ""}>` +
    `<autoFilter ref="${filtered}"/>` +
    `<tableColumns count="${columns}">${tableColumns}</tableColumns>` +
    '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>' +
    "</table>"
  );
}


/** The parts of the file, by their paths in the zip */
export function xlsxParts(sheet: XlsxSheet): [string, string][] {
  return [
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        (sheet.table ? '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>' : "") +
        "</Types>",
    ],
    [
      "_rels/.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    ],
    [
      "xl/workbook.xml",
      `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${xmlText(sheetName(sheet.name))}" sheetId="1" r:id="rId1"/></sheets>` +
        // Calculated again when opened: the results written are Silverware Table's, Excel's may differ
        '<calcPr calcId="0" fullCalcOnLoad="1"/>' +
        "</workbook>",
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>",
    ],
    ["xl/styles.xml", stylesXml()],
    ["xl/worksheets/sheet1.xml", sheetXml(sheet)],
    ...(sheet.table
      ? ([
          [
            "xl/worksheets/_rels/sheet1.xml.rels",
            `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
              '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/>' +
              "</Relationships>",
          ],
          ["xl/tables/table1.xml", tableXml(sheet, sheet.table)],
        ] as [string, string][])
      : []),
  ];
}

// ---- zip (stored, no compression) ---------------------------------------------

let crcTable: Uint32Array | undefined;

export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip of the files, stored as they are (names in UTF-8, dated 1980-01-01) */
export function zip(files: readonly (readonly [string, Uint8Array])[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  for (const [name, data] of files) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // names in UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true); // time
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true); // made by
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, DOS_DATE, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The .xlsx file of a sheet */
export function xlsxFile(sheet: XlsxSheet): Uint8Array {
  const encoder = new TextEncoder();
  return zip(xlsxParts(sheet).map(([name, text]) => [name, encoder.encode(text)] as const));
}
