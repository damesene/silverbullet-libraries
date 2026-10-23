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
import { type CellEditor, type Feature, type HeldEdit, type ModelHost, type PartTable, type PendingEdits, type TableInfo, type TableLooks, tablePartsOf, type ToolbarButton } from "../core/feature.ts";
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

/** One table's lazy saving (the module's part for it, core/parts.ts): switched on or not, its cells held, its flush */
class LazyTable {
  // Switched to lazy saving (for this visit of the page)
  on = false;
  held: Held | undefined;
  // Its flush on its way (the delay, the tab hidden or closing, a toggle may come together): the others wait for it
  private flushing: Promise<boolean> | undefined;

  constructor(
    private readonly table: PartTable,
    private readonly module: Lazy,
    private readonly host: ModelHost,
  ) {}

  /** The switch: on, cells edited are written later; off, what is held is written at once */
  toolbarButtons(): ToolbarButton[] {
    const unsaved = this.held?.edits.size ?? 0;
    return [
      {
        label: "Lazy saving",
        title: !this.on
          ? "Lazy saving: cells edited are saved together, a moment after editing stops"
          : unsaved
            ? `Lazy saving is on: ${unsaved} ${unsaved === 1 ? "cell" : "cells"} not saved yet. Click to save now and turn it off`
            : "Lazy saving is on: cells edited are saved together, a moment after editing stops. Click to turn it off",
        place: "icon",
        icon: ICONS.lazy,
        pressed: this.on,
        attention: this.on && unsaved > 0,
        run: () => this.toggle(),
      },
    ];
  }

  private toggle(): void {
    this.on = !this.on;
    if (!this.on) void this.switchedOff();
    this.host.toolbarChanged();
  }

  /**
   * Switched off: written at once, the cell being edited too (a press on the
   * toolbar leaves its editor open): closed and saved first, no longer held,
   * in a write that takes the others along
   */
  private async switchedOff(): Promise<void> {
    if (this.host.editing) await this.host.saveEditing();
    await this.flush();
  }

  holdCellEdit(info: TableInfo, edit: HeldEdit): boolean {
    if (!this.on) return false;
    const held = this.held ?? { page: this.host.currentPage, hint: info.hint, source: info.source, edits: new Map() };
    const id = cellId(edit);
    // What a write checks is the markdown's cell: the original of the first edit held
    const original = held.edits.get(id)?.original ?? edit.original;
    if (edit.value === original) held.edits.delete(id);
    else held.edits.set(id, { ...edit, original });
    this.held = held.edits.size ? held : undefined;
    this.host.looksChanged(info, [{ row: edit.row, column: edit.column }]);
    this.host.toolbarChanged();
    void this.module.schedule();
    return true;
  }

  pendingEdits(): PendingEdits | undefined {
    const held = this.held;
    if (!held?.edits.size) return undefined;
    const edits = [...held.edits.values()];
    let skipped = 0;
    return {
      apply: (table) => {
        const applied = applyEdits(table, edits);
        skipped = applied.skipped;
        return applied.table;
      },
      written: () => this.written(edits, skipped),
    };
  }

  /** Edits written (by any write of the table): no longer held, unless edited again meanwhile */
  private written(edits: readonly HeldEdit[], skipped: number): void {
    const held = this.held;
    if (held) {
      for (const edit of edits) if (held.edits.get(cellId(edit)) === edit) held.edits.delete(cellId(edit));
      if (!held.edits.size) this.held = undefined;
    }
    if (skipped) void this.host.bridge.flash(`Silverware Table: ${skipped} ${skipped === 1 ? "cell was" : "cells were"} changed elsewhere meanwhile, the edit there was not saved`, "error");
    this.host.toolbarChanged();
  }

  // Rendered anew (an edit elsewhere, or back in view): where it is now; written after the delay, if a flush found it gone
  enhanced(info: TableInfo): void {
    const held = this.held;
    if (!held) return;
    held.hint = info.hint;
    held.source = info.source;
    if (!this.host.editing) void this.module.schedule();
  }

  /** The held cells show what was typed (as text: the markdown renders once written), marked */
  looks(): TableLooks | undefined {
    const edits = this.held?.edits;
    if (!edits?.size) return undefined;
    return { cells: [...edits.values()].map((edit) => ({ row: edit.row, column: edit.column, display: unescapeCell(withoutTags(edit.value)), marks: ["lazy-pending"] })) };
  }

  /** Its page left: switched off (a table of the page left is a different table now) */
  pageLeft(name: string): void {
    if (this.host.pageOf(this.table.key) !== name) this.on = false;
  }

  /**
   * Writes what is held: into the editor while its page is there, else into
   * the page's file; whether it went into the editor (one undo step)
   */
  async flush(): Promise<boolean> {
    const going = this.flushing;
    if (going) {
      await going;
      return false;
    }
    const flush = this.flushNow().finally(() => (this.flushing = undefined));
    this.flushing = flush;
    return flush;
  }

  private async flushNow(): Promise<boolean> {
    // Written now: what was scheduled waits for the next edit or the page left, as for every flush
    this.module.cancelSchedule();
    const held = this.held;
    if (!held?.edits.size) return false;
    if (this.module.leaving()) return false;
    if ((await this.host.bridge.getCurrentPage()) !== held.page) {
      await this.flushToPage(held);
      return false;
    }
    const target = this.table.current();
    // Not rendered (scrolled far out of view): written once it is (enhanced), or when the page is left;
    // a cell opened meanwhile: written once it closes (a write now would render the table anew under it)
    if (!target || this.host.editing) return false;
    return (await this.host.writeTable(target, (table) => table)) === "written";
  }

  /** The page left: what was held for it is written into its file (SilverBullet saved it before loading the other) */
  private async flushToPage(held: Held): Promise<void> {
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
      this.held = undefined;
      const saved = count - skipped;
      if (saved) void this.host.bridge.flash(`Silverware Table: saved ${saved} ${saved === 1 ? "cell" : "cells"} edited on ${held.page}`, "info");
      if (skipped) void this.host.bridge.flash(`Silverware Table: ${skipped} ${skipped === 1 ? "cell" : "cells"} on ${held.page} changed elsewhere meanwhile, the edit there was not saved`, "error");
    } catch (e) {
      console.error("Silverware Table: could not save the cells held", e);
      lost();
    }
  }
}

/**
 * The lazy module: its parts are the tables' lazy saving (LazyTable); itself,
 * what is the page's: the one delay, leaving the page, the tab hidden or
 * closing, Ctrl+Z over what every table holds
 */
export class Lazy implements Feature {
  private timer: ReturnType<typeof setTimeout> | undefined;
  // A navigation started: nothing is written into the editor until the page is loaded
  private leavingSince = 0;
  readonly tableParts = tablePartsOf(LazyTable, (table) => new LazyTable(table, this, this.host));

  constructor(private readonly host: ModelHost) {}

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

  /** The tables' parts holding cells */
  private holding(): LazyTable[] {
    return this.host.tableParts<LazyTable>(this).filter((part) => part.held?.edits.size);
  }

  /** A navigation started a moment ago: nothing goes into the editor meanwhile */
  leaving(): boolean {
    return Date.now() - this.leavingSince < LEAVING_MS;
  }

  // Editing goes on: nothing is written meanwhile; it stops: written after the delay
  editorOpened(_editor: CellEditor): void {
    clearTimeout(this.timer);
  }

  editorClosed(_editor: CellEditor): void {
    void this.schedule();
  }

  /** Nothing written after the delay (a flush now writes what it is for) */
  cancelSchedule(): void {
    clearTimeout(this.timer);
  }

  async schedule(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.holding().length) return;
    const delay = await this.host.setting("lazyDelay");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // A cell edited again: its editor closing schedules the next
      if (!this.host.editing) void this.flushAll();
    }, delay);
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
    if (!undo || inField || !this.holding().length || !undoEdit) return false;
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      // As many steps as writes went into the editor (one per table held); none if nothing could be written now
      const writes = await this.flushAll();
      for (let i = 0; i < writes; i++) await undoEdit();
    })();
    return true;
  }

  /** Writes what is held for every table; how many writes went into the editor */
  private async flushAll(): Promise<number> {
    clearTimeout(this.timer);
    let writes = 0;
    for (const part of this.holding()) if (await part.flush()) writes++;
    return writes;
  }

  async pageLoaded(name: string): Promise<void> {
    this.leavingSince = 0;
    // (flush finds the page is not in the editor: into its file)
    for (const part of this.holding()) if (part.held!.page !== name) await part.flush();
    for (const part of this.host.tableParts<LazyTable>(this)) part.pageLeft(name);
  }

  // A navigation: nothing goes into the editor until the other page is loaded (pageLoaded)
  private onPopState = (): void => {
    if (!this.holding().length) return;
    clearTimeout(this.timer);
    this.leavingSince = Date.now();
    // Within the same page (no other page loaded): written as usual once the wait is over
    setTimeout(() => void this.schedule(), LEAVING_MS + 10);
  };

  // The tab closing (or reloading): written at once, and the browser asks whether to leave meanwhile
  private onBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (!this.holding().length) return;
    void this.flushAll();
    e.preventDefault();
    e.returnValue = "";
  };

  // The tab hidden (another tab, an app on a phone): written at once, as it may not come back
  private onVisibilityChange = (): void => {
    if (this.host.doc.visibilityState === "hidden" && this.holding().length && !this.host.editing) void this.flushAll();
  };
}
