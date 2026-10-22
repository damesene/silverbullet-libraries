// The lazy module: a table switched to lazy saving (its toolbar icon) keeps the
// cells edited in memory, shown in the table, and writes them in one edit once
// no cell has been edited for a while (silverware.table.modules.lazy.delay); switched
// off, it writes them at once. The icon is highlighted while edits are not
// saved yet. Every other write of the table (a row inserted, cells pasted)
// takes them along: the core puts them into the table before its change
// (pendingEdits), so rows and columns never get out of step with them.
//
// Leaving the page: another page loaded into the editor (SilverBullet saved the
// page left first), the edits are written into that page's file; the tab going
// to the background, they are written at once; the tab closing, too, and the
// browser asks whether to leave.
import type { CellEditor, Feature, HeldEdit, PendingEdits, TableHost, TableLooks, TableTarget, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { locateBySource, parseTable, serializeTable, type Table, unescapeCell } from "../markdown.ts";
import { setCell } from "../ops.ts";
import { withoutTags } from "../tags.ts";

// After a navigation started, what is held waits this long at most for the page loaded
const LEAVING_MS = 5000;

// What is held for a table: where it was (to find it in its page's text) and its cells' edits
type Held = {
  readonly page: string;
  hint: number;
  source: string;
  // By "row:column"; `original` is the cell's markdown before the first edit held
  readonly edits: Map<string, HeldEdit>;
};

const cellId = (edit: { readonly row: number; readonly column: number }) => `${edit.row}:${edit.column}`;

/**
 * The edits put into a table, those whose cell still holds what they replace;
 * the others are counted (changed elsewhere), but for a cell that holds the
 * edit already (written by a write not finished yet)
 */
function applyEdits(table: Table, edits: readonly HeldEdit[]): { table: Table; skipped: number } {
  let skipped = 0;
  const result = edits.reduce((t, edit) => {
    const cell = t.rows[edit.row]?.cells[edit.column] ?? "";
    if (cell === edit.value) return t;
    if (cell !== edit.original) {
      skipped++;
      return t;
    }
    return setCell(t, edit.row, edit.column, edit.value);
  }, table);
  return { table: result, skipped };
}

export class Lazy implements Feature {
  // Tables switched to lazy saving, by key (for this visit of the page)
  private readonly on = new Set<string>();
  private readonly held = new Map<string, Held>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  // A table's flush on its way (the delay, the tab hidden or closing, a toggle may come together): the others wait for it
  private readonly flushing = new Map<string, Promise<boolean>>();
  // A navigation started: nothing is written into the editor until the page is loaded
  private leavingSince = 0;

  constructor(private readonly host: TableHost) {}

  start(): void {
    const win = this.host.doc.defaultView!;
    win.addEventListener("beforeunload", this.onBeforeUnload);
    win.addEventListener("popstate", this.onPopState, true);
    this.host.doc.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  stop(): void {
    clearTimeout(this.timer);
    const win = this.host.doc.defaultView!;
    win.removeEventListener("beforeunload", this.onBeforeUnload);
    win.removeEventListener("popstate", this.onPopState, true);
    this.host.doc.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** The switch: on, cells edited are written later; off, what is held is written at once */
  toolbarButtons(_widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    const on = this.on.has(info.key);
    const unsaved = this.held.get(info.key)?.edits.size ?? 0;
    return [
      {
        label: "Lazy saving",
        title: !on
          ? "Lazy saving: cells edited are saved together, a moment after editing stops"
          : unsaved
            ? `Lazy saving is on: ${unsaved} ${unsaved === 1 ? "cell" : "cells"} not saved yet. Click to save now and turn it off`
            : "Lazy saving is on: cells edited are saved together, a moment after editing stops. Click to turn it off",
        place: "icon",
        icon: ICONS.lazy,
        pressed: on,
        attention: on && unsaved > 0,
        run: () => this.toggle(info.key),
      },
    ];
  }

  private toggle(key: string): void {
    if (this.on.delete(key)) void this.switchedOff(key);
    else this.on.add(key);
    this.host.toolbarChanged();
  }

  /**
   * Switched off: written at once, the cell being edited too (a press on the
   * toolbar leaves its editor open): closed and saved first, no longer held,
   * in a write that takes the others along
   */
  private async switchedOff(key: string): Promise<void> {
    if (this.host.editing) await this.host.saveEditing();
    await this.flush(key);
  }

  holdCellEdit(_widget: HTMLElement, info: WidgetInfo, edit: HeldEdit): boolean {
    if (!this.on.has(info.key)) return false;
    const held = this.held.get(info.key) ?? { page: this.host.currentPage, hint: info.hint, source: info.source, edits: new Map() };
    const id = cellId(edit);
    // What a write checks is the markdown's cell: the original of the first edit held
    const original = held.edits.get(id)?.original ?? edit.original;
    if (edit.value === original) held.edits.delete(id);
    else held.edits.set(id, { ...edit, original });
    if (held.edits.size) this.held.set(info.key, held);
    else this.held.delete(info.key);
    this.host.looksChanged(info);
    this.host.toolbarChanged();
    void this.schedule();
    return true;
  }

  pendingEdits(info: TableTarget): PendingEdits | undefined {
    const held = this.held.get(info.key);
    if (!held?.edits.size) return undefined;
    const edits = [...held.edits.values()];
    let skipped = 0;
    return {
      apply: (table) => {
        const applied = applyEdits(table, edits);
        skipped = applied.skipped;
        return applied.table;
      },
      written: () => this.written(info.key, edits, skipped),
    };
  }

  /** Edits written (by any write of the table): no longer held, unless edited again meanwhile */
  private written(key: string, edits: readonly HeldEdit[], skipped: number): void {
    const held = this.held.get(key);
    if (held) {
      for (const edit of edits) if (held.edits.get(cellId(edit)) === edit) held.edits.delete(cellId(edit));
      if (!held.edits.size) {
        this.held.delete(key);
      }
    }
    if (skipped) void this.host.bridge.flash(`Silverware Table: ${skipped} ${skipped === 1 ? "cell was" : "cells were"} changed elsewhere meanwhile, the edit there was not saved`, "error");
    this.host.toolbarChanged();
  }

  // Editing goes on: nothing is written meanwhile; it stops: written after the delay
  editorOpened(_editor: CellEditor): void {
    clearTimeout(this.timer);
  }

  editorClosed(_editor: CellEditor): void {
    void this.schedule();
  }

  private async schedule(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.held.size) return;
    const delay = await this.host.setting("lazyDelay");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // A cell edited again: its editor closing schedules the next
      if (!this.host.editing) void this.flushAll();
    }, delay);
  }

  // A table rendered anew (an edit elsewhere, or back in view): where it is now; written after the delay, if a flush found it gone
  enhanced(_widget: HTMLElement, info: WidgetInfo): void {
    const held = this.held.get(info.key);
    if (!held) return;
    held.hint = info.hint;
    held.source = info.source;
    if (!this.host.editing) void this.schedule();
  }

  /**
   * Ctrl+Z with cells held (not in a field, which undoes its own typing): they
   * are written, then that write undone, so they go back together (Ctrl+Y
   * brings them back); the editor's undo would undo the edit before them
   */
  keyDown(e: KeyboardEvent): boolean {
    const undo = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "z";
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const { undo: undoEdit } = this.host.bridge;
    if (!undo || inField || !this.held.size || !undoEdit) return false;
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      // As many steps as writes went into the editor (one per table held); none if nothing could be written now
      const writes = await this.flushAll();
      for (let i = 0; i < writes; i++) await undoEdit();
    })();
    return true;
  }

  /** The held cells show what was typed (as text: the markdown renders once written), marked */
  looks(info: WidgetInfo): TableLooks | undefined {
    const edits = this.held.get(info.key)?.edits;
    if (!edits?.size) return undefined;
    return { cells: [...edits.values()].map((edit) => ({ row: edit.row, column: edit.column, display: unescapeCell(withoutTags(edit.value)), marks: ["lazy-pending"] })) };
  }

  /** Writes what is held for every table; how many writes went into the editor */
  private async flushAll(): Promise<number> {
    let writes = 0;
    for (const key of [...this.held.keys()]) if (await this.flush(key)) writes++;
    return writes;
  }

  /**
   * Writes what is held for a table: into the editor while its page is there,
   * else into the page's file; whether it went into the editor (one undo step)
   */
  private async flush(key: string): Promise<boolean> {
    const going = this.flushing.get(key);
    if (going) {
      await going;
      return false;
    }
    const flush = this.flushNow(key).finally(() => this.flushing.delete(key));
    this.flushing.set(key, flush);
    return flush;
  }

  private async flushNow(key: string): Promise<boolean> {
    clearTimeout(this.timer);
    const held = this.held.get(key);
    if (!held?.edits.size) return false;
    if (Date.now() - this.leavingSince < LEAVING_MS) return false;
    if ((await this.host.bridge.getCurrentPage()) !== held.page) {
      await this.flushToPage(key, held);
      return false;
    }
    // A cell opened meanwhile: written once it closes (a write now would render the table anew under it)
    if (this.host.editing) return false;
    // Where the table is now, else where it was when last rendered (scrolled far out of view)
    const target = this.host.tableFor(key) ?? { key, hint: held.hint, source: held.source };
    return (await this.host.writeTable(target, (table) => table)) === "written";
  }

  /** The page left: what was held for it is written into its file (SilverBullet saved it before loading the other) */
  private async flushToPage(key: string, held: Held): Promise<void> {
    const { readPage, writePage } = this.host.bridge;
    const count = held.edits.size;
    const lost = () => void this.host.bridge.flash(`Silverware Table: ${count} ${count === 1 ? "cell" : "cells"} edited on ${held.page} could not be saved`, "error");
    if (!readPage || !writePage) return lost();
    try {
      const text = await readPage(held.page);
      const range = locateBySource(text, held.hint, held.source);
      if (!range) return lost();
      const { table, skipped } = applyEdits(parseTable(range.text), [...held.edits.values()]);
      const format = await this.host.setting("autoFormat");
      const markdown = serializeTable(format ? { ...table, padded: true } : table);
      await writePage(held.page, text.slice(0, range.from) + markdown + text.slice(range.to));
      this.held.delete(key);
      const saved = count - skipped;
      if (saved) void this.host.bridge.flash(`Silverware Table: saved ${saved} ${saved === 1 ? "cell" : "cells"} edited on ${held.page}`, "info");
      if (skipped) void this.host.bridge.flash(`Silverware Table: ${skipped} ${skipped === 1 ? "cell" : "cells"} on ${held.page} changed elsewhere meanwhile, the edit there was not saved`, "error");
    } catch (e) {
      console.error("Silverware Table: could not save the cells held", e);
      lost();
    }
  }

  async pageLoaded(name: string): Promise<void> {
    this.leavingSince = 0;
    // (flush finds the page is not in the editor: into its file)
    for (const [key, held] of [...this.held]) if (held.page !== name) await this.flush(key);
    // A table of the page left is a different table now
    for (const key of [...this.on]) if (!key.startsWith(`${name}#`)) this.on.delete(key);
  }

  // A navigation: nothing goes into the editor until the other page is loaded (pageLoaded)
  private onPopState = (): void => {
    if (!this.held.size) return;
    clearTimeout(this.timer);
    this.leavingSince = Date.now();
    // Within the same page (no other page loaded): written as usual once the wait is over
    setTimeout(() => void this.schedule(), LEAVING_MS + 10);
  };

  // The tab closing (or reloading): written at once, and the browser asks whether to leave meanwhile
  private onBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (!this.held.size) return;
    void this.flushAll();
    e.preventDefault();
    e.returnValue = "";
  };

  // The tab hidden (another tab, an app on a phone): written at once, as it may not come back
  private onVisibilityChange = (): void => {
    if (this.host.doc.visibilityState === "hidden" && this.held.size && !this.host.editing) void this.flushAll();
  };
}
