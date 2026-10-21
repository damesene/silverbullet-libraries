// Cells for the clipboard, as Excel pastes them: an HTML table whose cells
// say what they are in Excel's own attributes (x:num: the number, x:bool,
// mso-number-format: how it is shown, "\@" text kept as text), so a number
// written 12,50 € is a number and 2025-11-06 a date in any Excel's language;
// and the same cells as text with tabs, for anything else.
import { xmlText } from "./xlsx.ts";
import { excelValue, type NumberFormat } from "./values.ts";

// mso-number-format of the formats (as in xlsx.ts)
const MSO_FORMATS: Readonly<Record<NumberFormat, string>> = {
  date: "yyyy\\-mm\\-dd",
  dateTime: "yyyy\\-mm\\-dd hh:mm",
  dateTimeSeconds: "yyyy\\-mm\\-dd hh:mm:ss",
  time: "\\[h\\]:mm",
  timeSeconds: "\\[h\\]:mm:ss",
  percent: "0%",
  percent1: "0.0%",
  percent2: "0.00%",
};

function cellHtml(text: string): string {
  const value = excelValue(text);
  const shown = xmlText(text);
  switch (value.kind) {
    case "empty":
      return "<td></td>";
    case "number":
      return value.format
        ? `<td x:num="${value.value}" style="mso-number-format:'${MSO_FORMATS[value.format]}'">${shown}</td>`
        : `<td x:num="${value.value}">${shown}</td>`;
    case "boolean":
      return `<td x:bool="${value.value ? "TRUE" : "FALSE"}">${shown}</td>`;
    case "error":
      return `<td x:err="${xmlText(value.value)}">${shown}</td>`;
    case "text":
      return `<td style="mso-number-format:'\\@'">${shown}</td>`;
  }
}

/** The header and rows as an HTML table for Excel */
export function excelHtml(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const head = `<tr>${header.map((h) => `<td style="font-weight:bold;mso-number-format:'\\@'">${xmlText(h)}</td>`).join("")}</tr>`;
  const body = rows.map((row) => `<tr>${row.map(cellHtml).join("")}</tr>`).join("");
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table>${head}${body}</table></body></html>`;
}

/** The header and rows as text with tabs between cells (a cell with a tab, a line break or a quote in quotes) */
export function excelText(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const quote = (v: string) => (/[\t\r\n"]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return [header, ...rows].map((row) => row.map(quote).join("\t")).join("\r\n");
}
