// What Table Plus' features share: the controller (the host) finds and
// enhances tables, routes events and writes tables; each feature keeps its own
// state and listeners and works through the host.
import type { Bridge, FeatureName, SETTINGS, SettingValue } from "../bridge.ts";
import type { Dialog, DialogOptions } from "./dialog.ts";

export type { Dialog, DialogOptions } from "./dialog.ts";
import type { IndexMap } from "../ops.ts";
import type { OtherPages, PageTable, Table } from "../markdown.ts";
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

/** A cell's edit a feature keeps instead of having it written at once (the lazy module) */
export type HeldEdit = { readonly row: number; readonly column: number; readonly original: string; readonly value: string };

/**
 * Edits a feature holds for a table: every write of it starts from its
 * markdown with them (`apply`), so they are written with whatever the write
 * changes; `written` once that write is in the page
 */
export type PendingEdits = { readonly apply: (table: Table) => Table; readonly written: () => void };

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
  // An input in the cell, or a textarea in the cell's popup (text that does not fit, wrapped)
  readonly field: CellField;
  // Edited in the cell's popup
  readonly popup: boolean;
};

/** The field of the cell editor: an input in the cell, a textarea in its popup */
export type CellField = HTMLInputElement | HTMLTextAreaElement;

/** Where the cell editor shows, for what goes under or above it (a formula's hint, a type's choices): its popup, else its cell */
export function editorRect(editor: CellEditor): DOMRect {
  return (editor.popup ? (editor.field.closest(".tp-cell-popup") ?? editor.cell) : editor.cell).getBoundingClientRect();
}

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
  // In the menu: opens a list to pick from in its place (a back arrow returns) instead of running `run`;
  // the entries are made when it opens, not with the toolbar (which is made on every hover)
  readonly choices?: { readonly title: string; readonly entries: () => readonly MenuEntry[] };
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

/** The page a write edits: its text as read for it, its tables, and where the edited table is */
export type WritePage = { readonly text: string; readonly tables: readonly PageTable[]; readonly from: number };

/** An edit as features' write steps see it: how rows and columns moved, and the page */
export type WriteEdit = WriteOptions & { readonly page: WritePage };

/** A group of entries in the cell menu, between separators */
export type CellMenuGroup = { readonly order: number; readonly entries: readonly MenuEntry[] };

/**
 * What a feature says it keeps in tables, for Remove metadata: "2 formulas:
 * those cells keep …"; `tags`: the attributes of its hidden tags in cells
 */
export type MetadataPart = { readonly count: number; readonly what: string; readonly note?: string; readonly tags: readonly string[] };

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
  /**
   * Opens a feature's modal dialog over the page (one at a time): its keys and
   * presses are its own, Esc or a press beside it closes it, the focus goes
   * back where it was; the cell editor stays open meanwhile
   */
  openDialog(options: DialogOptions): Dialog;
  /** Re-reads the table, applies `change` and writes it back as one edit */
  write(widget: HTMLElement, change: (table: Table) => Table | undefined, options?: WriteOptions): Promise<WriteResult>;
  /** Closes the cell editor without saving, and drops a cell waiting to be edited */
  cancelEditing(): void;
  /** The open cell editor, if any */
  readonly editing: CellEditor | undefined;
  /**
   * What the last press was made with: "mouse", "touch" or "pen" ("" before
   * any). Also on the page's root as data-tp-pointer, so CSS shows the
   * controls for it (handles to drag with a finger, a fill handle for a mouse).
   */
  readonly pressedWith: string;
  /**
   * The press going on is the feature's (a mouse's taken in mouseDown, a tap
   * told by its pointer events): its mouse events after it (a touch's
   * mousedown, the mouseup, the click) are swallowed, as they would select or
   * edit the cell, follow a link, sort. A cell menu a touch opens takes it so.
   */
  takePress(): void;
  /** Whether the press going on was taken (another feature does nothing more with it) */
  pressTaken(): boolean;
  /** Whether a click selects first (a feature's select mode), so that a second one acts: a cell's editor, a grip's menu */
  clickSelects(): boolean;
  /** A header given a new name (escaped markdown) other than by its editor: with what features keep in it (Feature.headerRenamed) */
  headerRenamed(name: string, original: string): string;
  /** Opens the cell menu at a point, as a right click on the cell would; false when no feature offers anything */
  openCellMenu(widget: HTMLElement, info: WidgetInfo, at: CellRef, point: { x: number; y: number }): boolean;
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
  /** Closes the cell editor saving, as leaving it does (an edit a feature holds stays held), the focus left where it is */
  saveEditing(): Promise<void>;
  /** Asks the user (SilverBullet's dialog, else the browser's) */
  ask(question: string): Promise<boolean>;
  /** The table as edited: its markdown with the edits features hold (pendingEdits), what a cell's editor starts from */
  tableOf(info: WidgetInfo): Table;
  /** The page's text as last read */
  readonly pageText: string;
  /** The name of the page shown */
  readonly currentPage: string;
  /** The other pages a feature read for formulas (pageLinks); undefined: none reads them */
  otherPages(): OtherPages | undefined;
  /** Selects cells, where a feature selects (Feature.selectCells) */
  selectCells(info: WidgetInfo, anchor: CellRef, focus: CellRef): void;
  /**
   * Edits a cell of a table shown (a selected cell, from the keyboard), its
   * text as the setting says; "replace": the field starts empty, so what is
   * typed replaces the text; "select": the text selected (a paste replaces it)
   */
  editCell(info: WidgetInfo, ref: CellRef, how?: "replace" | "select", popup?: boolean): void;
  /** The cell being edited goes on in its popup (a textarea, wrapped), what is typed kept */
  editInPopup(): void;
  /** Whether a feature selects cells (Feature.selectCells) */
  selectsCells(): boolean;
  /** The cells selected in a table, if a feature selects (Feature.selected) */
  selectedCells(info: WidgetInfo): readonly CellRef[];
  /** The cells selected changed (the selection module): what follows them (the quiet + of a last row or column) follows */
  selectionChanged(): void;
  /** Whether a module is on (one feature serves another: pageLinks reads pages for formulas) */
  moduleOn(name: FeatureName): boolean;
  /** Tables changed outside the page (another page read anew): features check them again */
  tablesChanged(): void;
  /** What deleting a column also removes, by the features (names of rows and cells in it) */
  columnDeleteWarnings(info: WidgetInfo, column: number): string[];
  /** Attributes of hidden tags a copy of a row leaves out (names: one per page or table) */
  uniqueTags(): ReadonlySet<string>;
  /** What the features say the metadata of these tables holds (Remove metadata) */
  metadataParts(tables: readonly Table[]): MetadataPart[];
  /** What a feature's toolbar buttons show changed: the toolbar in view is shown again */
  toolbarChanged(): void;
  /** A table changed its size (a column's width): what follows its layout (pinned columns' offsets, the held header, the controls, cut cells) follows */
  tableResized(info: WidgetInfo): void;
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
  /** A feature's copy of a cell for another cell (Feature.fillCell), or undefined: copied as its value */
  fillCell(info: WidgetInfo, cell: string, from: CellRef, to: CellRef): string | undefined;
  /** Keyboard and input events from a field of a feature must not reach SilverBullet's editor */
  isolate(element: HTMLElement): void;
  /** A cell's value as sorting and filtering see it: a type's value, the edited cell's typed text */
  cellValue(cell: HTMLTableCellElement): string;
  /** A cell of a table as rendered, by its row in the markdown; hidden rows only with includeHidden */
  cellAt(info: WidgetInfo, cell: CellRef, includeHidden?: boolean): HTMLTableCellElement | undefined;
  /** Shows a table's rows again as sorted and filtered, e.g. after cells changed their text */
  applyView(widget: HTMLElement, info: WidgetInfo): void;
  /**
   * A body row about to be measured, edited or scrolled to: put back into the
   * document if a feature keeps it out (only the rows in view of a large table are there)
   */
  rowNeeded(info: WidgetInfo, row: HTMLTableRowElement): void;
  /** A feature put body rows back into the document (a large table scrolled): the features that lay out rows follow */
  rowsAttached(info: WidgetInfo, rows: readonly HTMLTableRowElement[]): void;
  /** A body row that stays in the document whatever scrolls (a row being dragged); undefined: none any more */
  holdInDocument(info: WidgetInfo, row: HTMLTableRowElement | undefined): void;
  /** The row held in the document (holdInDocument), if any */
  heldInDocument(info: WidgetInfo): HTMLTableRowElement | undefined;
  /** Whether a table is taller than its box (the maximum height setting) and scrolls inside it */
  scrollsInside(widget: HTMLElement): boolean;
  /** The element the page scrolls in, around an element */
  scrollParentOf(element: HTMLElement): HTMLElement | undefined;
  /**
   * Where the page is in view around an element: its scroller (below the
   * editor's top bar, also while the page is too short to scroll), or the
   * window, cut to what an on-screen keyboard leaves visible
   */
  viewBounds(element: HTMLElement): { left: number; right: number; top: number; bottom: number };
  /**
   * The part of a cell in view: cut to the table's box, the page in view and,
   * for a body cell, what is held over the body (the header, pinned rows and
   * columns); undefined when none of it is
   */
  shownPart(widget: HTMLElement, info: WidgetInfo, cell: HTMLElement): { left: number; right: number; top: number; bottom: number } | undefined;
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
  /** The entries features add with inserting and moving a column (see Feature.columnMenuInsertEntries) */
  columnMenuInsertEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[];
  /** The entries features add to a row's menu, for the cell in `column` (see Feature.rowMenuEntries) */
  rowMenuEntries(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[];
  /** The entries features add first to the menu of rows (columns) `lines` (see Feature.lineMenuEntries) */
  lineMenuEntries(widget: HTMLElement, info: WidgetInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[];
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
  /**
   * Something holds the pointer: a drag (the hover controls stay where they
   * are), or an open menu (they stay in its table, cells hovered there still reported)
   */
  pointerBusy?(): "drag" | "menu" | undefined;
  /** The pointer is over a cell, or the page moved under it */
  cellHovered?(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void;
  /** The cell menu opened (a tap or a press that sends no mouse event a feature sees): the feature's own menu closes */
  cellMenuOpened?(): void;
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
  /**
   * Entries for the menu of a cell, or of cells (selected), opened with a right
   * click, a long press or the Menu key, in groups; `order` places a group (0
   * naming, 1 editing, 2 viewing, 9 deleting, last). They close the menu when run.
   */
  cellMenuEntries?(widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): CellMenuGroup | readonly CellMenuGroup[] | undefined;
  /**
   * The cells the cell menu opened on `at` is for: the cells selected (as
   * shown) when the selection holds it, else `at`, now selected
   */
  selectedCells?(info: WidgetInfo, at: CellRef): readonly CellRef[] | undefined;
  /**
   * Selects the cells from `anchor` to `focus` (rows as shown): a row's or a
   * column's grip clicked, rows (columns) picked with the pointer
   */
  selectCells?(info: WidgetInfo, anchor: CellRef, focus: CellRef): void;
  /** The cells selected in the table (as shown), if any */
  selected?(info: WidgetInfo): readonly CellRef[] | undefined;
  /** Entries at the top of a column's menu, before its sorting (naming the column); they close the menu when run */
  columnMenuTopEntries?(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[];
  /** Entries with inserting and moving the column in its menu, after them (a numbered column); they close the menu when run */
  columnMenuInsertEntries?(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[];
  /** Entries at the top of a row's menu, about its cell in `column` (the one under the pointer or edited); they close the menu when run */
  rowMenuEntries?(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[];
  /**
   * Entries first in the menu of rows (columns): `lines`, those its grip acts
   * on (the lines selected whole that hold its own, else it), markdown rows or
   * columns; they close the menu when run (the clipboard's: copy, cut, paste)
   */
  lineMenuEntries?(widget: HTMLElement, info: WidgetInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[];
  /** Buttons for the table's toolbar, shown while the pointer is over the table */
  toolbarButtons?(widget: HTMLElement, info: WidgetInfo): ToolbarButton[];
  /** Before a write reads the page's text: what it needs read first (other pages the tables written refer to) */
  prepareWrite?(info: WidgetInfo): Promise<void>;
  /**
   * A cell's edit the cell editor would write (not a header's name): true, the
   * feature keeps it (shows it, writes it later, through pendingEdits); the
   * editor goes on as if nothing was written
   */
  holdCellEdit?(widget: HTMLElement, info: WidgetInfo, edit: HeldEdit): boolean;
  /** The edits the feature holds for a table, put into each of its writes (and into tableOf) */
  pendingEdits?(info: WidgetInfo): PendingEdits | undefined;
  /** Another page was loaded into the editor (`name`): what was held for the page left can no longer be written into the editor */
  pageLoaded?(name: string): Promise<void> | void;
  /** After the edit, before the write steps: what they need read (other pages the edited table refers to) */
  prepareEdit?(edited: Table, page: WritePage): Promise<void>;
  /** A write step: the table edited, as the feature changes it in the same write (formulas recalculated, references following) */
  writeStep?(before: Table, after: Table, edit: WriteEdit): Table;
  /** Other tables of the page the write changes too, in the same edit (formulas referring to the edited table) */
  otherTablesWritten?(before: Table, after: Table, edit: WriteEdit): readonly PageTable[];
  /** Other pages read for formulas (the pageLinks module) */
  otherPages?(): OtherPages;
  /** SilverBullet indexed a page (it changed) */
  pageIndexed?(name: string): Promise<void> | void;
  /** What deleting a column of the table also removes, asked first: "the names of 2 rows pear and fig: …" */
  columnDeleteWarning?(info: WidgetInfo, column: number): string | undefined;
  /** Attributes of the feature's hidden tags a copy of a row leaves out (a name is one cell's, one row's) */
  uniqueTags?(): readonly string[];
  /** What the feature keeps in these tables, for Remove metadata (which removes it) */
  metadataPart?(tables: readonly Table[]): MetadataPart | undefined;
  /**
   * Body rows the feature hides (filters), as indexes into `values` (one array
   * of cell values per body row, values[0] being row 1); pinned rows are not hidden
   */
  hiddenRows?(info: WidgetInfo, values: readonly (readonly string[])[]): ReadonlySet<number> | undefined;
  /** Whether the feature hides rows of the table now (moving rows and pasting wait for that to end) */
  hidesRows?(info: WidgetInfo): boolean;
  /** The table's view was applied: rows sorted and hidden, the header marked */
  viewApplied?(widget: HTMLElement, info: WidgetInfo): void;
  /**
   * SilverBullet put a table into the page, before the browser lays it out:
   * its rows as rendered (the header first). A feature may take rows out of
   * the document; Table Plus keeps them (bodyRows, shownRows, cellAt still
   * have them) and its features read them as before, but for their layout.
   */
  tableAdded?(widget: HTMLElement, table: HTMLTableElement, rows: readonly HTMLTableRowElement[]): void;
  /**
   * The body rows shown, in their order (sorted and filtered; not those pinned
   * to the top or bottom), placed into the table's body by the feature instead
   * of Table Plus (true): e.g. only those in view, the others out of the document
   */
  placeRows?(widget: HTMLElement, info: WidgetInfo, body: HTMLTableSectionElement, shown: readonly HTMLTableRowElement[]): boolean;
  /** A body row out of the document is needed (rowNeeded): the feature that took it out puts it back */
  rowNeeded?(info: WidgetInfo, row: HTMLTableRowElement): void;
  /** Body rows were put back into the document (rowsAttached): laid out now, they can be measured */
  rowsAttached?(info: WidgetInfo, rows: readonly HTMLTableRowElement[]): void;
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
   * Before a write replaces a table (from..to of the page's text), with the
   * edit `change` (the part of the text it replaces); may return what to do
   * after it, given where the change started and how much longer the text got
   */
  beforeWrite?(
    text: string,
    from: number,
    to: number,
    change: { readonly from: number; readonly to: number },
  ): Promise<((editFrom: number, lengthChange: number) => void) | undefined>;
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
  /** A click selects first (select mode: the selection module's), a second click acts; false: a click acts at once */
  clickSelects?(): boolean;
  /** A header given a new name other than by its editor (a paste): what it becomes (the column type's hashtag kept); undefined: as given */
  headerRenamed?(name: string, original: string): string | undefined;
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
  /**
   * A copy of a cell the feature makes for another cell of the table (`to`;
   * AutoFill), a cell of the markdown's table, the header 0: formulas, their
   * references moved by as many rows and columns; undefined: not the
   * feature's cell (it is copied as its value)
   */
  fillCell?(info: WidgetInfo, cell: string, from: CellRef, to: CellRef): string | undefined;
  /** The cells selected changed (the selection module): what goes with them follows */
  selectionChanged?(): void;
  editorClosed?(editor: CellEditor): void;
}
