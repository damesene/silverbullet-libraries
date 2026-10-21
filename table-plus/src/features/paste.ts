// Pasting cells copied from a spreadsheet into a table, from the cell being
// edited (or selected: its editor opens for the paste): over the cells there
// (Ctrl+V) or as new rows (Ctrl+Shift+V); and Paste / Paste as new rows in the
// cell menu, which read the clipboard themselves (a touch screen has no Ctrl+V).
// Reading the clipboard's text and planning the paste is paste.ts; this is the
// editor's and the menu's side.
import type { CellEditor, CellMenuGroup, CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import { parseClipboardCells, pasteCells, planPaste } from "../paste.ts";

const PASTE_BLOCKED = "Clear sorting and filters to paste cells: the rows shown are not where they would go";

// Without the Clipboard API (a page over http) a page cannot read the clipboard: only the browser's own paste can
const NO_CLIPBOARD = "The browser lets a page read the clipboard only over https: paste with Ctrl+V, or into a cell's editor";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export class Paste implements Feature {
  // The paste on its way was asked for with Ctrl+Shift+V: as new rows
  private inserts = false;
  // What the clipboard holds, where the page may read it without asking (Chrome, the permission granted); else unknown
  private clipboard: "unknown" | "empty" | "text" = "unknown";
  private readable = false;

  constructor(private readonly host: TableHost) {}

  /**
   * Where the browser says the page may read the clipboard without asking,
   * what it holds is read again when the page comes back to the front (copied
   * in another application: Excel) and on every press (copied in this page),
   * so Paste in the cell menu shows disabled when there is nothing to paste
   */
  start(): void {
    const win = this.host.doc.defaultView!;
    if (!win.navigator.clipboard?.readText) return;
    win.addEventListener("focus", this.refresh);
    win.addEventListener("pointerdown", this.refresh, true);
    this.host.doc.addEventListener("visibilitychange", this.refresh);
    void win.navigator.permissions
      ?.query({ name: "clipboard-read" as PermissionName })
      .then((status) => {
        const update = () => {
          this.readable = status.state === "granted";
          if (!this.readable) this.clipboard = "unknown";
          this.refresh();
        };
        status.addEventListener("change", update);
        update();
      })
      // The browser knows no such permission (Firefox, Safari): what the clipboard holds stays unknown
      .catch(() => {});
  }

  stop(): void {
    const win = this.host.doc.defaultView!;
    win.removeEventListener("focus", this.refresh);
    win.removeEventListener("pointerdown", this.refresh, true);
    this.host.doc.removeEventListener("visibilitychange", this.refresh);
  }

  private refresh = (): void => {
    const clipboard = this.host.doc.defaultView!.navigator.clipboard;
    // Read only while the page has the focus (else the browser refuses)
    if (!this.readable || !clipboard?.readText || !this.host.doc.hasFocus()) return;
    clipboard.readText().then(
      (text) => (this.clipboard = text ? "text" : "empty"),
      () => (this.clipboard = "unknown"),
    );
  };

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
      void this.pasteFromEditor(data, insert);
    });
  }

  /** Paste and Paste as new rows in the cell menu: from the first cell selected */
  cellMenuEntries(widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): CellMenuGroup | undefined {
    const at = cells[0];
    if (!at) return undefined;
    const clipboard = this.host.doc.defaultView!.navigator.clipboard;
    const disabled = !clipboard?.readText
      ? NO_CLIPBOARD
      : this.host.rearranged(info)
        ? PASTE_BLOCKED
        : this.clipboard === "empty"
          ? "The clipboard holds no text to paste"
          : undefined;
    const item = (label: string, hint: string, insert: boolean) => ({
      kind: "item" as const,
      label,
      icon: ICONS.paste,
      hint,
      run: () => void this.pasteFromMenu(widget, info, at, insert),
      ...(disabled ? { disabled } : {}),
    });
    return {
      // After copying and clearing
      order: 1.2,
      entries: [
        item("Paste", "Paste what the clipboard holds from this cell, over the cells there, as Ctrl+V does", false),
        item("Paste as new rows", "Paste the clipboard's rows as new rows at this row, as Ctrl+Shift+V does", true),
      ],
    };
  }

  /** The clipboard read (the browser may ask, or show its own Paste button), pasted from the cell */
  private async pasteFromMenu(shownWidget: HTMLElement, shownInfo: WidgetInfo, at: CellRef, insert: boolean): Promise<void> {
    let text: string;
    try {
      text = await this.host.doc.defaultView!.navigator.clipboard.readText();
    } catch (e) {
      void this.host.bridge.flash(`Table Plus: could not read the clipboard (${String(e)})`, "error");
      return;
    }
    if (!text) {
      this.clipboard = "empty";
      void this.host.bridge.flash("Table Plus: the clipboard holds no text to paste", "info");
      return;
    }
    // A single value (a line break at its end, as a spreadsheet copies one cell, left out) is one cell
    const data = parseClipboardCells(text) ?? [[text.replace(/\r?\n$/, "")]];
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    await this.paste(widget, info, at, data, insert);
  }

  private async pasteFromEditor(data: string[][], insert: boolean): Promise<void> {
    const active = this.host.editing;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    await this.paste(active.widget, info, active, data, insert, true);
  }

  /**
   * Pastes the cells from a cell, as one edit: over the cells there (insert
   * false), or as new rows at the cell's row. Cells with formulas keep them.
   * From the cell editor, what it holds is saved in the same edit. Not while
   * the table is sorted or filtered: the rows shown are not where the cells
   * would go.
   */
  private async paste(widget: HTMLElement, info: WidgetInfo, at: CellRef, data: string[][], insert: boolean, fromEditor = false): Promise<void> {
    if (this.host.rearranged(info)) {
      void this.host.bridge.flash(`Table Plus: ${PASTE_BLOCKED.toLowerCase()}`, "info");
      return;
    }
    const plan = planPaste(parseTable(info.source), info.pins, at, data, insert);
    if ("error" in plan) {
      void this.host.bridge.flash(`Table Plus: cannot paste here: ${plan.error}`, "error");
      return;
    }
    const closed = fromEditor ? this.host.takeEditor() : undefined;
    let skipped: ReadonlyMap<string, number> = new Map();
    const { newRows, newColumns } = plan;
    const result = await this.host.write(
      closed?.widget ?? widget,
      (t) => {
        const edited = closed ? closed.save(t) : t;
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
    if (closed) this.host.focusEditor(closed.widget);
  }
}
