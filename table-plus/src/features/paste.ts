// Pasting cells copied from a spreadsheet into a table, from the cell being
// edited (or selected: its editor opens for the paste): over the cells there
// (Ctrl+V) or as new rows (Ctrl+Shift+V). Reading
// the clipboard and planning the paste is paste.ts; this is the editor's side.
import type { CellEditor, Feature, TableHost } from "../core/feature.ts";
import { parseTable } from "../markdown.ts";
import { parseClipboardCells, pasteCells, planPaste } from "../paste.ts";

const PASTE_BLOCKED = "Clear sorting and filters to paste cells: the rows shown are not where they would go";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export class Paste implements Feature {
  // The paste on its way was asked for with Ctrl+Shift+V: as new rows
  private inserts = false;

  constructor(private readonly host: TableHost) {}

  // The paste event does not tell Shift; the key may come before the editor opens (Ctrl+V on a selected cell)
  keyDown(e: KeyboardEvent): boolean {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") this.inserts = e.shiftKey;
    return false;
  }

  editorOpened(editor: CellEditor): void {
    const field = editor.field;
    // Cells copied from a spreadsheet go into the table; a single value into the field
    (field as HTMLElement).addEventListener("paste", (e) => {
      const insert = this.inserts;
      this.inserts = false;
      const data = parseClipboardCells(e.clipboardData?.getData("text/plain") ?? "");
      if (!data || this.host.editing?.field !== field) return;
      e.preventDefault();
      void this.paste(data, insert);
    });
  }

  /**
   * Pastes the cells from the edited cell, as one edit: over the cells there
   * (insert false), or as new rows at the cell's row. Cells with formulas keep
   * them. Not while the table is sorted or filtered: the rows shown are not
   * where the cells would go.
   */
  private async paste(data: string[][], insert: boolean): Promise<void> {
    const active = this.host.editing;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    if (this.host.rearranged(info)) {
      void this.host.bridge.flash(`Table Plus: ${PASTE_BLOCKED.toLowerCase()}`, "info");
      return;
    }
    const plan = planPaste(parseTable(info.source), info.pins, active, data, insert);
    if ("error" in plan) {
      void this.host.bridge.flash(`Table Plus: cannot paste here: ${plan.error}`, "error");
      return;
    }
    const closed = this.host.takeEditor()!;
    let skipped: ReadonlyMap<string, number> = new Map();
    const { newRows, newColumns } = plan;
    const result = await this.host.write(
      closed.widget,
      (t) => {
        const edited = closed.save(t);
        if (!edited) return undefined;
        const pasted = pasteCells(edited, plan, data, {
          keptBy: (cell) => this.host.cellKeptBy(cell),
          keepTags: (value, from) => this.host.keepTags(value, from),
        });
        skipped = pasted.skipped;
        return pasted.table;
      },
      {
        columnMap: newColumns.count ? (c) => (c >= newColumns.at ? c + newColumns.count : c) : undefined,
        pins: plan.pins,
        rowMap: newRows.count ? (r) => (r >= newRows.at ? r + newRows.count : r) : undefined,
      },
    );
    if (result !== "written") return;
    const width = Math.max(...data.map((r) => r.length));
    const added = [
      ...(newRows.count && !insert ? [`added ${plural(newRows.count, "row")}`] : []),
      ...(newColumns.count ? [`added ${plural(newColumns.count, "column")}`] : []),
      ...Array.from(skipped, ([what, count]) => `kept ${plural(count, what)}`),
    ];
    const what = insert ? `${plural(data.length, "new row")}` : `${data.length} × ${width} cells`;
    void this.host.bridge.flash(`Table Plus: pasted ${what}${added.length ? ` (${added.join(", ")})` : ""}`, "info");
    this.host.focusEditor(closed.widget);
  }
}
