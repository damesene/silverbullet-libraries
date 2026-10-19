// What Table Plus' features share: the controller (the host) finds and
// enhances tables, routes events and writes tables; each feature keeps its own
// state and listeners and works through the host.
import type { Bridge } from "../bridge.ts";
import type { IndexMap } from "../formula/index.ts";
import type { Table } from "../markdown.ts";
import type { Pins } from "../view.ts";

export type WidgetInfo = {
  readonly table: HTMLTableElement;
  // The table's markdown when it was rendered: the editor only reuses a
  // rendered table while its markdown stays exactly the same
  readonly source: string;
  readonly hint: number;
  readonly key: string;
  readonly columns: number;
  // The table ends with a metadata row (`<meta …>`), rendered as its last row
  readonly metaRow: boolean;
  // Rows in the markdown, the header included
  readonly rows: number;
  // Pinned rows and columns, as stored in the metadata row
  readonly pins: Pins;
  // Some formula cells show results from before the table was changed outside Table Plus
  readonly stale: boolean;
  // How many cells hold a formula (a <meta f> tag)
  readonly formulas: number;
};

// A cell by its row in the markdown (header 0) and its column
export type CellRef = { readonly row: number; readonly column: number };

// A cell to edit once the table is rendered again; `select` selects its text
export type FocusTarget = CellRef & { readonly select?: boolean };

export type WriteResult = "written" | "unchanged" | "failed";

export type WriteOptions = {
  // The cell to edit once the table is rendered again
  readonly focus?: FocusTarget;
  // Where each row of the markdown (header 0) goes, for edits that move rows
  readonly rowMap?: IndexMap;
  // Where each column goes, for edits that move columns (undefined: deleted)
  readonly columnMap?: IndexMap;
  // The pins after the edit, for edits that change them
  readonly pins?: Pins;
};

/**
 * A step every write goes through after the edit itself, such as formulas
 * following moved cells: the table before the edit, the table after it, and
 * how rows and columns moved; returns the table to write.
 */
export type WriteStep = (before: Table, after: Table, options: WriteOptions) => Table;

/** What the controller offers features */
export interface TableHost {
  readonly doc: Document;
  readonly bridge: Bridge;
  infoOf(widget: HTMLElement): WidgetInfo | undefined;
  /** The rendered table a key belongs to, if it is enhanced and on screen */
  widgetForKey(key: string): HTMLElement | undefined;
  /** The enhanced table an event target is in */
  enhancedWidgetOf(target: EventTarget | null): [HTMLElement, WidgetInfo] | undefined;
  /** The header or body cell an event target is in (not the filter or metadata row) */
  tableCellOf(info: WidgetInfo, target: EventTarget | null): HTMLTableCellElement | undefined;
  cellRef(info: WidgetInfo, cell: HTMLTableCellElement): CellRef | undefined;
  /** The header row and the shown body rows, in display order */
  shownRows(info: WidgetInfo): HTMLTableRowElement[];
  /** Whether a node is one of Table Plus' floating controls (toolbar, grips, menus) */
  isFloating(node: Node): boolean;
  /** Re-reads the table, applies `change` and writes it back as one edit */
  write(widget: HTMLElement, change: (table: Table) => Table | undefined, options?: WriteOptions): Promise<WriteResult>;
  /** Closes the cell editor without saving, and drops a cell waiting to be edited */
  cancelEditing(): void;
}

/** A feature: every hook is optional */
export interface Feature {
  start?(): void;
  stop?(): void;
  /** Any left press, before Table Plus handles it */
  beforeMouseDown?(e: MouseEvent): void;
  /** A press on a cell that Table Plus took to edit it (not a link, not pointing in a formula) */
  afterCellPress?(info: WidgetInfo, cell: CellRef, e: MouseEvent): void;
  /** A key, before Table Plus handles it; true: handled, nothing else happens */
  keyDown?(e: KeyboardEvent): boolean;
  /** A table was enhanced, e.g. rendered again after a write */
  enhanced?(widget: HTMLElement, info: WidgetInfo): void;
}
