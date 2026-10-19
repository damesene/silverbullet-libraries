// What Table Plus' features share: the controller (the host) finds and
// enhances tables, routes events and writes tables; each feature keeps its own
// state and listeners and works through the host.
import type { Bridge, SETTINGS, SettingValue } from "../bridge.ts";
import type { IndexMap, TableSource } from "../formula/index.ts";
import type { Table } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import type { Pins, ViewState } from "../view.ts";

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
};

// A cell by its row in the markdown (header 0) and its column
export type CellRef = { readonly row: number; readonly column: number };

// A cell to edit once the table is rendered again; `select` selects its text
export type FocusTarget = CellRef & { readonly select?: boolean };

export type WriteResult = "written" | "unchanged" | "failed";

/** The cell editor: an input in place of the cell's content */
export type CellEditor = {
  readonly widget: HTMLElement;
  readonly cell: HTMLTableCellElement;
  readonly row: number;
  readonly column: number;
  // The cell's markdown when the editor opened
  readonly original: string;
  // What the field showed when it opened: the cell's text, or what a feature showed (a formula)
  readonly initial: string;
  readonly field: HTMLInputElement;
};

/** A button a feature adds to a table's toolbar */
export type ToolbarButton = {
  readonly label: string;
  readonly title: string;
  readonly run: () => void;
  // Where it shows: "icon" its icon alone at the toolbar's right (the label is
  // its accessible name), "label" its label at the toolbar's left (what the
  // table is), "chip" at the left too, how the table is shown (its label, its
  // icon before it, a × that runs it: ends that, its title saying so),
  // "menu" (the default) an item of the toolbar's ⋯ menu
  readonly place?: "icon" | "label" | "chip" | "menu";
  readonly icon?: string;
  // Asks to be used: highlighted
  readonly attention?: boolean;
  // An icon button that is on (the filter row shown)
  readonly pressed?: boolean;
  // A chip's other buttons, before its ×
  readonly actions?: readonly { readonly icon: string; readonly title: string; readonly run: () => void }[];
  // In the menu: what it is set to, after its label and a colon (Name table: prices)
  readonly value?: string;
  // In the menu: destructive, last and red
  readonly danger?: boolean;
};

export type WriteOptions = {
  // The cell to edit once the table is rendered again
  readonly focus?: FocusTarget;
  // Where each row of the markdown (header 0) goes, for edits that move rows
  readonly rowMap?: IndexMap;
  // Where each column goes, for edits that move columns (undefined: deleted)
  readonly columnMap?: IndexMap;
  // The pins after the edit, for edits that change them
  readonly pins?: Pins;
  // The focused row (a new one) is held where it is shown beside these rows
  // (of the markdown after the edit) until the editor leaves it; none: at the end
  readonly hold?: RowHold;
};

/**
 * Where a held row shows while it is edited, sorting and filters
 * notwithstanding: right after the row `after`, else right before `before`
 * (rows of the markdown), else last
 */
export type RowHold = { readonly after?: number; readonly before?: number };

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
  /** The open cell editor, if any */
  readonly editing: CellEditor | undefined;
  /** A floating element (position: fixed) in the page, kept out of the editor's way */
  floating<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K];
  /** Places a floating element at a point of the viewport, kept inside it sideways, and shows it */
  place(element: HTMLElement, left: number, top: number): void;
  /** A table's visible box: the part of it not scrolled out of view */
  innerBox(widget: HTMLElement): { left: number; right: number; top: number; bottom: number };
  /**
   * Closes the cell editor for an edit that ends editing: `save` adds what the
   * editor held to that edit (undefined: the cell changed in the meantime)
   */
  takeEditor():
    | { readonly widget: HTMLElement; readonly row: number; readonly column: number; readonly save: (table: Table) => Table | undefined }
    | undefined;
  /** Asks the user (SilverBullet's dialog, else the browser's) */
  ask(question: string): Promise<boolean>;
  /** The page's tables (as last read) that formulas can refer to by name */
  tableSource(): TableSource;
  /** What a feature's toolbar buttons show changed: the toolbar in view is shown again */
  toolbarChanged(): void;
  /** Asks for a text (SilverBullet's dialog, else the browser's); undefined: cancelled */
  promptText(message: string, value?: string): Promise<string | undefined>;
  /** Hands the keyboard back to SilverBullet's editor */
  focusEditor(widget: HTMLElement): void;
  /** Whether a table is shown sorted or with rows hidden (filtered), so rows are not where the markdown has them */
  rearranged(info: WidgetInfo): boolean;
  /**
   * Ends the view a table's metadata stored (its sorting, the features' state
   * read from it: filters), so the table shows its rows as written
   */
  forgetStoredView(key: string): void;
  /**
   * A feature changed what a table shows (its filters): the view applied
   * anew, the row being edited placed with the others and held there
   */
  viewChanged(widget: HTMLElement, info: WidgetInfo): void;
  /**
   * A cell's new markdown with the hidden tags the cell had, but those the
   * features that manage them take (Feature.takesTags): editing, pasting or
   * clearing a cell keeps the data modules keep in it
   */
  keepTags(value: string, from: string): string;
  /** Why a cell's value is a feature's (Feature.keepsCell): pasting leaves it */
  cellKeptBy(cell: string): string | undefined;
  /** Keyboard and input events from a field of a feature must not reach SilverBullet's editor */
  isolate(element: HTMLElement): void;
  /** A cell's value as sorting and filtering see it: a type's value, the edited cell's typed text */
  cellValue(cell: HTMLTableCellElement): string;
  /** A cell of a table as rendered, by its row in the markdown; hidden rows only with includeHidden */
  cellAt(info: WidgetInfo, cell: CellRef, includeHidden?: boolean): HTMLTableCellElement | undefined;
  /** Shows a table's rows again as sorted and filtered, e.g. after cells changed their text */
  applyView(widget: HTMLElement, info: WidgetInfo): void;
  /** Whether a table is taller than its box (the maximum height setting) and scrolls inside it */
  scrollsInside(widget: HTMLElement): boolean;
  /** The element the page scrolls in, around an element */
  scrollParentOf(element: HTMLElement): HTMLElement | undefined;
  /** Where a table is in view: the table, cut to the box that scrolls it sideways */
  shownRect(widget: HTMLElement, info: WidgetInfo): { left: number; right: number; top: number; bottom: number };
  /** The body rows as rendered, in the order of the markdown, hidden ones included */
  bodyRows(info: WidgetInfo): HTMLTableRowElement[];
  /**
   * The entries features add to a column's menu (see Feature.columnMenuEntries);
   * `open` shows other entries in the menu's place, e.g. a list to pick from
   */
  columnMenuEntries(
    widget: HTMLElement,
    info: WidgetInfo,
    column: number,
    open: (title: string, entries: readonly MenuEntry[]) => void,
  ): MenuEntry[];
  /** The entries features add at the top of a column's menu (see Feature.columnMenuTopEntries) */
  columnMenuTopEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[];
  /** The entries features add to a row's menu, for the cell in `column` (see Feature.rowMenuEntries) */
  rowMenuEntries(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[];
  /** A setting's value, its default when unset or not valid */
  setting<K extends keyof typeof SETTINGS>(name: K): Promise<SettingValue<K>>;
  /** The metadata setting as last read */
  readonly metadataEnabled: boolean;
  /** How a table is shown: sorting and filters */
  viewOf(info: WidgetInfo): ViewState;
  setView(widget: HTMLElement, info: WidgetInfo, view: ViewState): void;
  /** A view change that may change the sorting, which the metadata setting also stores */
  setSort(widget: HTMLElement, info: WidgetInfo, view: ViewState): void;
}

/** A feature: every hook is optional */
export interface Feature {
  start?(): void;
  stop?(): void;
  /** Whether a node is one of the feature's floating elements (a grip, a menu) */
  owns?(node: Node): boolean;
  /** Something holds the pointer: a drag, or an open menu; the hover controls stay where they are */
  pointerBusy?(): "drag" | "menu" | undefined;
  /** The pointer is over a cell, or the page moved under it */
  cellHovered?(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void;
  /** No cell is hovered any more; with `closeMenus`, menus close too */
  hoverEnded?(closeMenus: boolean): void;
  /** Any press (any button), before anything else; true: taken, nothing else happens */
  mouseDown?(e: MouseEvent): boolean;
  /** Any left press, before Table Plus handles it */
  beforeMouseDown?(e: MouseEvent): void;
  /** A press on a cell, before Table Plus edits it; true: taken (e.g. pointing in a formula) */
  beforeCellPress?(widget: HTMLElement, info: WidgetInfo, cell: CellRef, e: MouseEvent): boolean;
  /** A press on a cell that Table Plus took to edit it (not a link, not pointing in a formula) */
  afterCellPress?(info: WidgetInfo, cell: CellRef, e: MouseEvent): void;
  /** A key, before Table Plus handles it; true: handled, nothing else happens */
  keyDown?(e: KeyboardEvent): boolean;
  /** A table was enhanced, e.g. rendered again after a write */
  enhanced?(widget: HTMLElement, info: WidgetInfo): void;
  /** Marks on a table's cells, once its rows know their rows in the markdown (data-tp-row) */
  decorate?(widget: HTMLElement, info: WidgetInfo): void;
  /**
   * Entries for a column's menu, after its sorting and filter; `open` shows
   * other entries in the menu's place (they close the menu when run)
   */
  columnMenuEntries?(
    widget: HTMLElement,
    info: WidgetInfo,
    column: number,
    open: (title: string, entries: readonly MenuEntry[]) => void,
  ): MenuEntry[];
  /** Entries at the top of a column's menu, before its sorting (naming the column); they close the menu when run */
  columnMenuTopEntries?(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[];
  /** Entries at the top of a row's menu, about its cell in `column` (the one under the pointer or edited); they close the menu when run */
  rowMenuEntries?(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[];
  /** Buttons for the table's toolbar, shown while the pointer is over the table */
  toolbarButtons?(widget: HTMLElement, info: WidgetInfo): ToolbarButton[];
  /**
   * Body rows the feature hides (filters), as indexes into `values` (one array
   * of cell values per body row, values[0] being row 1); pinned rows are not hidden
   */
  hiddenRows?(info: WidgetInfo, values: readonly (readonly string[])[]): ReadonlySet<number> | undefined;
  /** Whether the feature hides rows of the table now (moving rows and pasting wait for that to end) */
  hidesRows?(info: WidgetInfo): boolean;
  /** The table's view was applied: rows sorted and hidden, the header marked */
  viewApplied?(widget: HTMLElement, info: WidgetInfo): void;
  /** The view a table's metadata stored ends (Remove metadata): state read from it goes */
  viewForgotten?(key: string): void;
  /** Columns of the table with `key` moved or were deleted (`map`: their new indexes, undefined: deleted) */
  columnsMoved?(key: string, map: (column: number) => number | undefined): void;
  /**
   * A click on an element the feature marked with data-tp-action in a table
   * (clicks there reach Table Plus only); true: it was the feature's
   */
  action?(name: string, element: HTMLElement, widget: HTMLElement, info: WidgetInfo): boolean;
  /**
   * Before a write replaces a table (from..to of the page's text); may return
   * what to do after it, given where the change started and how much longer
   * the text got
   */
  beforeWrite?(text: string, from: number, to: number): Promise<((editFrom: number, lengthChange: number) => void) | undefined>;
  /** Another page whose tables formulas refer to was changed: results may be out of date */
  tablesChanged?(): void;
  /** The page or a table scrolled, or tables moved: floating elements follow */
  layoutChanged?(): void;
  /** What the cell editor shows for a cell's markdown (hidden tags and all); undefined: its text */
  editorText?(info: WidgetInfo, cell: CellRef, original: string): string | undefined;
  editorOpened?(editor: CellEditor): void;
  /** A key in the cell editor, before Table Plus handles it; true: handled (its default is prevented) */
  editorKeyDown?(e: KeyboardEvent, editor: CellEditor): boolean;
  /** The markdown to save for what was typed; undefined: the text */
  editorValue?(editor: CellEditor, typed: string): string | undefined;
  /**
   * Attributes of the hidden tags in cells (tags.ts) the feature manages: when
   * a cell's text is edited, pasted over or cleared, its tags with them are not
   * kept but what the feature wrote (formulas: f). Others' tags are kept.
   */
  takesTags?(): readonly string[];
  /**
   * Why a cell's value is the feature's, so pasting leaves the cell as it is
   * (formulas: "formula cell", the formula computes it); undefined: it is not
   */
  keepsCell?(cell: string): string | undefined;
  editorClosed?(editor: CellEditor): void;
}
