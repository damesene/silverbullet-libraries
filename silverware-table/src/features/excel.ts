// The excel module: Export to Excel… in the toolbar's menu opens a dialog
// with the two ways, what each keeps and loses, and the outcome:
//
// Copy for Excel: the header and rows as shown (sorted, filtered) onto the
// clipboard, values as Excel keeps them (excel/clipboard.ts), so a paste in
// Excel has numbers, dates and times whatever its language. Formulas paste as
// their results.
//
// Download .xlsx: the whole table, its rows in the order of the markdown
// (where formulas refer to them), as a file of one sheet with the formulas as
// Excel writes them (excel/formulas.ts). A formula Excel cannot have (another
// table or page, a function without an Excel form) is written as its value:
// the dialog lists them, with why, before the file is made. Functions of the
// user's are written by the templates of silverware.table.modules.excel.functions
// ({1}, {2}… their arguments; false: as their values).
import { writeClipboard } from "../clipboard.ts";
import type { Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { excelHtml, excelText } from "../excel/clipboard.ts";
import { excelCell, excelFormula } from "../excel/formulas.ts";
import type { ExcelTemplates } from "../excel/functions.ts";
import { excelValue } from "../excel/values.ts";
import { columnWidth, xlsxFile, type XlsxCell } from "../excel/xlsx.ts";
import { currentTable, type ExportedTable, exportedTable } from "../export/table.ts";
import { formulaOf } from "../formulas/index.ts";
import { ICONS } from "../icons.ts";
import { metaName } from "../meta.ts";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const FUNCTIONS_PATH = "silverware.table.modules.excel.functions";

/** The templates as configured: names to Excel formulas (or false), anything else left out */
export function excelTemplates(value: unknown): ExcelTemplates {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string | false] => typeof entry[1] === "string" || entry[1] === false),
  );
}

/** A name for a file: without the characters file systems refuse */
export function fileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Table";
}

/** The .xlsx file of a name typed (with its extension or not) */
export function xlsxName(typed: string): string {
  return `${fileName(typed.trim().replace(/\.xlsx$/i, ""))}.xlsx`;
}

// A formula written as its value (its body cell, rows from 0), and why
type Skipped = { readonly row: number; readonly column: number; readonly formula: string; readonly reason: string };

// Formulas written as values alike (a calculated column's): their cells as Excel names them, the formula, why, how many
export type SkippedGroup = { readonly cells: string; readonly formula: string; readonly reason: string; readonly count: number };

/**
 * The formulas written as values, one entry per formula and reason (a column
 * of them is one), in the order of their first cells; the cells as ranges of
 * a column where they follow each other (C2:C501), the first `parts` of them
 * and how many more
 */
export function skippedGroups(skipped: readonly Skipped[], parts = 4): SkippedGroup[] {
  const groups = new Map<string, Skipped[]>();
  for (const s of skipped) {
    const key = `${s.reason}\u0000${s.formula}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return Array.from(groups.values(), (cells) => {
    const sorted = [...cells].sort((a, b) => a.column - b.column || a.row - b.row);
    const runs: string[] = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1]!.column === sorted[i]!.column && sorted[j + 1]!.row === sorted[j]!.row + 1) j++;
      const first = sorted[i]!;
      const last = sorted[j]!;
      runs.push(i === j ? excelCell(first.row, first.column) : `${excelCell(first.row, first.column)}:${excelCell(last.row, last.column)}`);
      i = j + 1;
    }
    const more = runs.length - parts;
    return {
      cells: more > 0 ? `${runs.slice(0, parts).join(", ")} and ${more} more` : runs.join(", "),
      formula: cells[0]!.formula,
      reason: cells[0]!.reason,
      count: cells.length,
    };
  });
}

// At most this many entries in the dialog's list (the rest counted)
const SHOWN_GROUPS = 50;

// The file as it will be made: its cells, the formulas in it and those written as values
type Workbook = {
  // The table's name, else its page's: the sheet's, and the file's unless another is typed
  readonly name: string;
  readonly make: () => Uint8Array;
  readonly formulas: number;
  readonly skipped: readonly Skipped[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class Excel implements Feature {
  private opening = false;

  constructor(private readonly host: TableHost) {}

  /** Export to Excel… in the toolbar's menu */
  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    return [
      {
        label: "Export to Excel…",
        title: "Copy the table for Excel, or download it as an Excel file with its formulas",
        icon: ICONS.download,
        run: () => void this.open(widget, info),
      },
    ];
  }

  /** The dialog: both ways, with what they keep, and the outcome of the one taken */
  private async open(shownWidget: HTMLElement, shownInfo: WidgetInfo): Promise<void> {
    // Pressed again while the file is prepared: one dialog
    if (this.opening) return;
    this.opening = true;
    const { info } = currentTable(this.host, shownWidget, shownInfo);
    const shown = exportedTable(this.host, info, "shown");
    let workbook: Workbook;
    try {
      workbook = await this.workbook(info);
    } catch (e) {
      console.error("Silverware Table: the table could not be prepared for Excel", e);
      void this.host.bridge.flash(`Silverware Table: could not prepare the table for Excel (${String(e)})`, "error");
      return;
    } finally {
      this.opening = false;
    }
    const { doc } = this.host;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
      const e = doc.createElement(tag);
      e.className = className;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const button = (text: string, primary = false) => {
      const b = el("button", primary ? "swt-dialog-primary" : "swt-dialog-button", text);
      b.type = "button";
      return b;
    };
    // A way: its title, then what it needs (the file's name) and its button at the right; what it does under them
    const option = (title: string, lines: readonly string[], actions: readonly HTMLElement[], ...more: HTMLElement[]) => {
      const box = el("section", "swt-excel-option");
      const head = el("div", "swt-excel-option-head");
      const right = el("div", "swt-excel-option-actions");
      right.append(...actions);
      head.append(el("h3", "swt-excel-option-title", title), right);
      const list = el("ul", "swt-excel-option-text");
      for (const line of lines) list.append(el("li", "", line));
      box.append(head, list);
      box.append(...more);
      return box;
    };

    // The outcome of what was done, under the ways
    const status = el("div", "swt-excel-status");
    status.setAttribute("role", "status");
    const report = (text: string, ok: boolean) => {
      status.textContent = text;
      status.classList.toggle("swt-excel-ok", ok);
      status.classList.toggle("swt-excel-error", !ok);
    };

    const copy = button("Copy");
    const rows = shown.rows.length;
    const copyBox = option(
      "Copy for Excel",
      [
        `${plural(rows, "row", "rows")} as shown here (sorted, filtered), with the header, to paste into a sheet.`,
        "Numbers, dates, times and TRUE / FALSE paste as Excel's values, in any language of Excel.",
        "Lost: formulas (their results are pasted), how column types show cells (currency signs, stars), links.",
      ],
      [copy],
    );

    const download = button("Download", true);
    const formulaNote = el("div", "swt-excel-formulas");
    const { skipped, formulas } = workbook;
    if (skipped.length === 0) {
      formulaNote.classList.add("swt-excel-ok");
      formulaNote.textContent = formulas === 0 ? "No formulas in the table." : `All ${plural(formulas, "formula", "formulas")} will be Excel formulas.`;
    } else {
      formulaNote.append(
        el(
          "div",
          "swt-excel-formulas-title",
          `${plural(skipped.length, "formula", "formulas")} of ${formulas} will be written as ${skipped.length === 1 ? "its value" : "their values"} (cells as Excel names them):`,
        ),
      );
      const list = el("div", "swt-excel-skipped");
      const groups = skippedGroups(skipped);
      for (const g of groups.slice(0, SHOWN_GROUPS)) {
        const item = el("div", "swt-excel-skipped-item");
        const cells = el("span", "swt-excel-skipped-cell", g.cells);
        if (g.count > 1) cells.title = plural(g.count, "cell", "cells");
        item.append(cells, el("code", "swt-excel-skipped-formula", g.formula), el("span", "swt-excel-skipped-reason", g.reason));
        list.append(item);
      }
      if (groups.length > SHOWN_GROUPS) list.append(el("div", "swt-excel-skipped-more", `… and ${groups.length - SHOWN_GROUPS} more`));
      formulaNote.append(list);
    }
    // The file's name, the table's to start with, edited in place: the field as wide as its text, .xlsx right after it
    const nameField = el("label", "swt-excel-file");
    nameField.append(el("span", "swt-excel-file-label", "File name:"));
    const nameInput = el("input", "swt-excel-file-input");
    nameInput.type = "text";
    nameInput.value = fileName(workbook.name);
    nameInput.spellcheck = false;
    nameInput.setAttribute("aria-label", "File name");
    const fit = () => (nameInput.size = Math.max(1, nameInput.value.length));
    fit();
    nameInput.addEventListener("input", fit);
    nameField.append(nameInput, el("span", "swt-excel-file-extension", ".xlsx"));
    const downloadBox = option(
      "Download .xlsx",
      [
        "The whole table, every row in the order of the markdown (not as sorted or filtered), the header in row 1.",
        "Numbers, dates and times as Excel's values; formulas as Excel formulas, calculated again by Excel.",
      ],
      [nameField, download],
      formulaNote,
    );

    const content = el("div", "swt-excel");
    content.append(copyBox, downloadBox, status);
    const close = button("Close");
    const footer = el("div", "swt-excel-foot");
    footer.append(close);
    const dialog = this.host.openDialog({
      title: "Export to Excel",
      subtitle: workbook.name,
      className: "swt-excel-dialog",
      content,
      footer,
      focus: download,
    });
    close.addEventListener("click", () => dialog.close());
    copy.addEventListener("click", () => void this.copy(shown).then(({ text, ok }) => report(text, ok)));
    const save = () => {
      const { text, ok } = this.download(workbook, xlsxName(nameInput.value));
      report(text, ok);
    };
    download.addEventListener("click", save);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      save();
    });
  }

  /** The rows as shown onto the clipboard, for Excel */
  private async copy(table: ExportedTable): Promise<{ text: string; ok: boolean }> {
    const rows = table.rows.map((r) => r.values);
    try {
      await writeClipboard(this.host.doc, excelText(table.header, rows), excelHtml(table.header, rows));
      return { text: `Copied ${plural(rows.length, "row", "rows")}: paste them into Excel.`, ok: true };
    } catch (e) {
      return { text: `Could not copy: ${String(e)}`, ok: false };
    }
  }

  /** The file: every row of the markdown in its place, formulas as Excel writes them, those it cannot as values */
  private async workbook(info: WidgetInfo): Promise<Workbook> {
    const exported = exportedTable(this.host, info, "all");
    // The markdown, edits held (lazy saving) included: the formulas
    const model = this.host.tableOf(info);
    const templates = excelTemplates(await this.host.bridge.getConfig?.(FUNCTIONS_PATH, {}));
    const skipped: Skipped[] = [];
    let formulas = 0;
    // Each markdown row in its place: Excel's row 2 is the first under the header, as formulas count them
    const rows: XlsxCell[][] = Array.from({ length: Math.max(0, model.rows.length - 1) }, () => []);
    for (const { row, values } of exported.rows) {
      rows[row - 1] = values.map((text, column) => {
        const value = excelValue(text);
        const stored = formulaOf(model.rows[row]?.cells[column] ?? "");
        if (!stored) return { value };
        formulas++;
        const formula = excelFormula(stored.formula, model, row - 1, column, templates);
        if ("reason" in formula) {
          skipped.push({ row: row - 1, column, formula: stored.formula, reason: formula.reason });
          return { value };
        }
        return { value, formula };
      });
    }
    const page = await this.host.bridge.getCurrentPage();
    const name = metaName(model) ?? page.split("/").pop() ?? "Table";
    const widths = exported.header.map((h, c) => columnWidth([h, ...exported.rows.map((r) => r.values[c] ?? "")]));
    return { name, make: () => xlsxFile({ name, header: exported.header, rows, widths }), formulas, skipped };
  }

  /** The file made and given to the browser to download */
  private download(workbook: Workbook, file: string): { text: string; ok: boolean } {
    let bytes: Uint8Array;
    try {
      bytes = workbook.make();
    } catch (e) {
      console.error("Silverware Table: the Excel file could not be made", e);
      return { text: `Could not make the file: ${String(e)}`, ok: false };
    }
    const { doc } = this.host;
    const win = doc.defaultView!;
    const url = win.URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_TYPE }));
    const link = doc.createElement("a");
    link.href = url;
    link.download = file;
    link.style.display = "none";
    doc.body.append(link);
    link.click();
    link.remove();
    // Once the browser has taken the file
    win.setTimeout(() => win.URL.revokeObjectURL(url), 60_000);
    const values = workbook.skipped.length;
    return { text: `Downloaded ${file}${values ? `, ${plural(values, "formula", "formulas")} as values` : ""}.`, ok: true };
  }
}
