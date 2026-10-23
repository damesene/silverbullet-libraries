// What Silverware Table's features share: the controller (the host) finds and
// enhances tables, routes events and writes tables; each feature keeps its own
// state and listeners and works through the host.
import type { TableKey } from "./tables.ts";
export type { TableKey } from "./tables.ts";
import type { Bridge, FeatureName, SETTINGS, SettingValue } from "../bridge.ts";
import type { Dialog, DialogOptions } from "./dialog.ts";
import type { Rect } from "./geometry.ts";

export type { Dialog, DialogOptions } from "./dialog.ts";
export type { Rect } from "./geometry.ts";
import type { IndexMap } from "../ops.ts";
import type { OtherPages, PageTable, Table, TableMeta } from "../markdown.ts";
import type { MenuBack, MenuEntry, MenuNaming, MenuTitleIcon } from "../menu.ts";
import type { Pins, ViewState } from "../view.ts";

/** A table shown, in model terms (what modules get): where it is in the page, its shape, its pins */
export type TableInfo = {
  // The table's markdown when it was rendered: the editor only reuses a
  // rendered table while its markdown stays exactly the same
  readonly source: string;
  readonly hint: number;
  readonly key: TableKey;
  readonly columns: number;
  // The table ends with a metadata row (`<meta …>`), rendered as its last row
  readonly metaRow: boolean;
  // Rows in the markdown, the header included
  readonly rows: number;
  // Pinned rows and columns, as stored in the metadata row
  readonly pins: Pins;
};

/** A table shown as the adapter has it: with its rendered element */
export type WidgetInfo = TableInfo & { readonly table: HTMLTableElement };

/** A table of the page as a write finds it, rendered or not: its key, its markdown as last read and where it was (`hint`) */
export type TableTarget = Pick<WidgetInfo, "key" | "source" | "hint">;

// A cell by its row in the markdown (header 0) and its column
export type CellRef = { readonly row: number; readonly column: number };

// Cells from a top left to a bottom right one, inclusive
export type CellArea = { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number };

/**
 * Where a feature lays the page's tables out on a grid of its own (the sheet
 * view): the addresses their cells have there, as formulas write them, and
 * the widths of its columns, which a table's own widths give way to. A
 * table's area is in its body rows in the markdown's order (row 0: its first
 * under the header, A1 of its formulas); the frame's in its own rows and
 * columns (row 0 written 1).
 */
export type AddressFrame = {
  /** The tables laid out in the frame, by their keys (the one the frame is for among them) */
  readonly tables: readonly TableKey[];
  /** A table's area (`table`: another table's name; undefined: the one the frame is for) in the frame: undefined if it is not there as one area */
  outward(table: string | undefined, area: CellArea): CellArea | undefined;
  /** The table holding an area of the frame whole, as one area (its name; undefined: the one the frame is for), and the area in it */
  inward(area: CellArea): { readonly table: string | undefined; readonly area: CellArea } | undefined;
  /** The width the grid's column under a column of the table (its own index) is set to; undefined: automatic */
  columnWidth(column: number): number | undefined;
  /** That width shown while it is dragged (undefined: as set), not stored */
  previewColumnWidth(column: number, width: number | undefined): void;
  /** That width stored (undefined: automatic), for every table in the grid's column */
  setColumnWidth(column: number, width: number | undefined): Promise<void>;
};

/** What a cell shows in place of what its markdown renders to: a text, or a link (opened in a new tab) */
export type CellDisplay = string | { readonly text: string; readonly href: string };

/**
 * How a feature wants a cell to look (Feature.looks), in model terms: the
 * renderer applies it. `display` replaces what the cell shows (the last
 * feature's wins), `value` is what sorting, filters and copying compare (the
 * last's wins), `marks` are added (CSS keys on them: `swt-<mark>`), `title`s
 * are joined.
 */
export type CellLook = {
  readonly display?: CellDisplay;
  readonly value?: string;
  readonly marks?: readonly string[];
  readonly title?: string;
};

/**
 * Where an icon goes among a header's icons, by what it tells (HeaderIcon.order):
 * what the column is (its type), then what is done with it (filtered).
 * A feature picks a slot by meaning, never by another feature's icon.
 */
export const HEADER_ICON_ORDER = { kind: 1, state: 2 } as const;

/** An icon after a header's name (a column type's, the filter mark), before the sorting; `action`: a click on it is the feature's (Feature.action) */
export type HeaderIcon = {
  readonly svg: string;
  readonly title: string;
  readonly className: string;
  // Where it goes among the icons (HEADER_ICON_ORDER)
  readonly order: number;
  readonly action?: string;
};

/** How a feature wants a header to look: icons after its name, marks, a title; `hidesTag`: hashtags in it not shown, by name (a column type's) */
export type HeaderLook = {
  readonly icons?: readonly HeaderIcon[];
  readonly marks?: readonly string[];
  readonly title?: string;
  readonly hidesTag?: (name: string) => boolean;
};

/**
 * A whole table's look as attributes (the themes module: theme, stripes), put
 * on the table by the adapter (`data-swt-<name>`); undefined: not set
 */
export type TableLook = Readonly<Record<string, string | undefined>>;

/** A small table the adapter makes for a feature's own UI (a theme's preview in a menu), shown as the page's tables are */
export type TablePreview = { readonly element: HTMLElement; setLook(look: TableLook): void };

/** A feature's looks for a table's cells and headers (Feature.looks) */
export type TableLooks = {
  readonly cells?: readonly (CellRef & CellLook)[];
  readonly headers?: readonly ({ readonly column: number } & HeaderLook)[];
};

/** A cell of a table shown, as an event found it: its table, the cell rendered and where it is in the markdown */
export type CellHit = { readonly widget: HTMLElement; readonly info: WidgetInfo; readonly cell: HTMLTableCellElement; readonly ref: CellRef };

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

/**
 * The cell editor: an input in place of the cell's content. In model terms
 * (what modules use): the table's key, the cell, what it held and showed when
 * it opened, what it holds now and where its caret is, and what can be done to
 * it; `widget`, `cell` and `field` are the rendering's, going as the modules
 * move off them (docs/silverware-table-isolation.md)
 */
export type CellEditor = {
  readonly key: TableKey;
  readonly row: number;
  readonly column: number;
  // What the field holds now, and its selection (the caret: from = to)
  readonly text: string;
  readonly selection: readonly [number, number];
  /** The field's text set (the caret at its end, or where given) */
  setText(text: string, selection?: readonly [number, number]): void;
  /** Part of the text replaced as typing would (so Ctrl+Z in the field undoes it), the caret after it */
  insert(from: number, to: number, text: string): void;
  /** Part of the text selected */
  select(from: number, to: number): void;
  /** The keyboard back in the field */
  focus(): void;
  /** Saved as Enter saves (and on as Enter goes on) */
  commit(): void;
  // The cell's markdown when the editor opened
  readonly original: string;
  // What the field showed when it opened: the cell's text, or what a feature showed (a formula)
  readonly initial: string;
  // Edited in the cell's popup
  readonly popup: boolean;
  // What is typed is the caller's to write (TableHost.editBeyond's `place`): no table's cells are pasted from it
  readonly placed?: boolean;
};

/** The cell editor as rendered (the adapter's): its table's element, its cell, its field */
export type RenderedEditor = CellEditor & {
  readonly widget: HTMLElement;
  readonly cell: HTMLTableCellElement;
  // An input in the cell, or a textarea in the cell's popup (text that does not fit, wrapped)
  readonly field: CellField;
};

/** The field of the cell editor: an input in the cell, a textarea in its popup */
export type CellField = HTMLInputElement | HTMLTextAreaElement;

/** Where the cell editor shows, for what goes under or above it (a formula's hint, a type's choices): its popup, else its cell */
export function editorRect(editor: RenderedEditor): DOMRect {
  return (editor.popup ? (editor.field.closest(".swt-cell-popup") ?? editor.cell) : editor.cell).getBoundingClientRect();
}

/**
 * What a panel (TableHost.panel) is anchored to: the cell editor (its popup
 * while it is open there), a cell or a header of a table shown, a point of the
 * window
 */
export type PanelAnchor =
  | { readonly kind: "editor" }
  | { readonly kind: "cell"; readonly key: TableKey; readonly row: number; readonly column: number }
  | { readonly kind: "point"; readonly x: number; readonly y: number }
  // An element of the feature's own UI (a field of its header row)
  | { readonly kind: "element"; readonly element: HTMLElement };

/**
 * Where a panel goes: below its anchor, or above it where it does not fit
 * below in the page's view and there is more room above (marked swt-above),
 * `gap` away, `offsetX` from its left edge, at least as wide as it
 * (`minWidth: "anchor"`)
 */
export type PanelOptions = { readonly place?: "below" | "above"; readonly minWidth?: "anchor"; readonly gap?: number; readonly offsetX?: number };

/**
 * A mark some cells of tables have (TableHost.markLayer: cells selected, the
 * headers of the columns filtering), kept by table and cell: a table rendered
 * anew shows it again. The adapter shows it (class swt-<mark>).
 */
export interface MarkLayer {
  /** The cells of a table that have the mark; its other cells lose it */
  set(key: TableKey, cells: readonly CellRef[]): void;
  /** No cell of any table has it */
  clear(): void;
}

/** A side of an area of cells outlined */
export type Side = "top" | "bottom" | "left" | "right";

/**
 * An area of cells outlined (TableHost.outlineLayer: cells copied or cut, a
 * move's target, the band a selection is dragged by): a piece in each cell on
 * its edge, its classes those `pieces` gives for the sides the cell is on (one
 * piece per string). Kept by table: a table rendered anew shows it again.
 */
export interface OutlineLayer {
  /** The area outlined: these rows (of the markdown, in the order shown) and the columns from..to; the outline before it gone */
  show(key: TableKey, rows: readonly number[], columns: readonly [number, number]): void;
  hide(): void;
  /** Whether it outlines an area now */
  readonly shown: boolean;
}

/**
 * Where a handle goes (TableHost.handleLayer): in a cell (its class says
 * which corner, CSS places it; on the table's edges it is marked
 * swt-at-edge-row / swt-at-edge-column), or `mid`: on the line of that cell
 * (its row, or its column), in the middle of the part of the table in view,
 * as a spreadsheet's app puts the handles of whole rows (columns); where no
 * cell of the line is in view there, in its cell
 */
export type HandlePlace = {
  // What tells it apart in its layer (and styles it): the same class places the same element again
  readonly className: string;
  readonly row: number;
  readonly column: number;
  readonly mid?: "row" | "column";
  readonly title?: string;
  // In use (dragged): swt-active, on the same element
  readonly active?: boolean;
};

/** Handles in cells (the selection's, the fill handle): placed by the adapter, kept by table, pressed: TableHost.targetOf says which */
export interface HandleLayer {
  place(key: TableKey, handles: readonly HandlePlace[]): void;
  hide(): void;
}

/**
 * What a pointer is on, in model terms (TableHost.targetOf): a cell of a
 * table shown, a piece of an outline or a handle of a layer (in a cell), one
 * of Silverware Table's own controls (a panel, a menu, the toolbar), or none of these
 */
export type PointerTarget =
  | { readonly kind: "cell"; readonly key: TableKey; readonly row: number; readonly column: number }
  | { readonly kind: "outline"; readonly layer: string; readonly key: TableKey; readonly row: number; readonly column: number }
  | { readonly kind: "handle"; readonly layer: string; readonly key: TableKey; readonly className: string; readonly row: number; readonly column: number }
  | { readonly kind: "control" }
  | { readonly kind: "none" };

/** Where a drag is (TableHost.drag): the pointer, its keys, what it is on, and the cell of the drag's table under it (or the nearest, `clamp`) */
export type DragPoint = {
  readonly x: number;
  readonly y: number;
  readonly ctrl: boolean;
  readonly target: PointerTarget;
  readonly cell: CellRef | undefined;
};

/**
 * A drag from a press (TableHost.drag), followed by the core: `onMove` as the
 * pointer moves (and, `repeat`, again while it is held still near an edge,
 * which scrolls), `onEnd` when it is let go or (`cancelled`) the window left,
 * or Esc (`escape`); keys on the way (Ctrl) go to `onKey`. `events`: mouse
 * events (a mouse's press) or pointer events (a touch's); what is under the
 * pointer: its events' target, a touch's by its point (`byPoint`: always by
 * its point); `clamp`: the cell nearest the pointer when it is past the
 * table; `pageMark` on the page meanwhile (TableHost.pageMark)
 */
export type DragOptions = {
  readonly key: TableKey;
  readonly events: "mouse" | "pointer";
  readonly autoscroll?: boolean;
  readonly sideways?: boolean;
  readonly repeat?: boolean;
  readonly clamp?: boolean;
  readonly escape?: boolean;
  readonly byPoint?: boolean;
  readonly pageMark?: string;
  onMove(at: DragPoint): void;
  onEnd(at: DragPoint | undefined, cancelled: boolean): void;
  onKey?(e: KeyboardEvent): void;
};

/** A drag of rows or columns (TableHost.dragLines) */
export type LineDrag = { move(x: number, y: number): void; finish(commit: boolean): number | undefined };

/** What a feature puts on the clipboard for a copy or a cut (Feature.clipboardData) */
export type ClipboardData = { readonly text: string; readonly html?: string };

/** A row of a feature's own UI under a table's header (the filter row): its element for each column, in a cell of the row */
export type HeaderRow = { readonly className: string; readonly cells: readonly HTMLElement[] };

/**
 * A floating container of a feature's own UI (a list of choices, a formula's
 * help): the feature fills `element`; the core places it by its anchor, keeps
 * it there as the page and the table scroll, hides it while the anchor is out
 * of view
 */
export interface Panel {
  readonly element: HTMLElement;
  readonly shown: boolean;
  /** Shown at its anchor (placed anew: its content may have changed its size) */
  show(anchor: PanelAnchor, options?: PanelOptions): void;
  hide(): void;
  remove(): void;
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
  // "menu" (the default) an item of the toolbar's ⋯ menu. In the toolbar's row
  // of names, above the rest, by `slot` (TOOLBAR_NAME_ORDER): "name" a name
  // (its label; a click opens its `naming`, `run` unused), "name-icon" an icon
  // button before the name of its slot (a feature's, apart from the name's)
  readonly place?: "icon" | "label" | "chip" | "menu" | "name" | "name-icon";
  // A name's or a name's icon's place in the row of names
  readonly slot?: ToolbarNameSlot;
  // A name: a stand-in for none (Table, No sheet), shown muted
  readonly muted?: boolean;
  // A name: what a click on it names (the title of a menu that is its field)
  readonly naming?: MenuNaming;
  readonly icon?: string;
  // Asks to be used: highlighted
  readonly attention?: boolean;
  // An icon button that is on (the filter row shown)
  readonly pressed?: boolean;
  // A chip's other buttons, before its ×
  readonly actions?: readonly { readonly icon: string; readonly title: string; readonly run: () => void }[];
  // In the menu: what it is set to, after its label and a colon (Theme: Native)
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
  // The rows and columns the edit adds take the empty cells past the table (a value typed or pasted there), rather
  // than being inserted: what lies past them need only make room where they reach it (a sheet's other tables)
  readonly claims?: boolean;
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

/**
 * The places in the toolbar's row of names, in their order, by what they name:
 * what holds the table (a sheet), then the table itself. A module picks one by
 * meaning, never by another module's names.
 */
export const TOOLBAR_NAME_ORDER = { container: 0, table: 1 } as const;
export type ToolbarNameSlot = keyof typeof TOOLBAR_NAME_ORDER;

/**
 * Where a group goes in the cell menu, by what its entries do
 * (CellMenuGroup.order): the clipboard's bar first, naming, editing the cells,
 * inserting into them, filling from them, viewing (filters), deleting last.
 * A feature picks a slot by meaning, never by another feature's entries.
 */
// Rows a PageUp / PageDown jumps (Ctrl; in a selection without Ctrl) or moves a row (Ctrl+Alt)
export const PAGE_ROWS = 10;

export const CELL_MENU_ORDER = { clipboard: -1, naming: 0, editing: 1, inserting: 1.2, filling: 1.5, viewing: 2, deleting: 9 } as const;

/** A group of entries in the cell menu, between separators (CELL_MENU_ORDER) */
export type CellMenuGroup = { readonly order: number; readonly entries: readonly MenuEntry[] };

/**
 * What a feature says it keeps in tables, for Remove metadata: "2 formulas:
 * those cells keep …"; `tags`: the attributes of its hidden tags in cells
 */
export type MetadataPart = { readonly count: number; readonly what: string; readonly note?: string; readonly tags: readonly string[] };

/** What the controller offers features */
/** What a menu is about, which can be named in its title */
export type NamingTarget =
  | { readonly kind: "cell"; readonly row: number; readonly column: number }
  | { readonly kind: "row"; readonly row: number }
  | { readonly kind: "column"; readonly column: number }
  | { readonly kind: "table" };

/**
 * What the core offers the modules (src/features/), in model terms: tables by
 * their key, cells by their row in the markdown and their column; no element of
 * the rendering (docs/silverware-table-isolation.md). A module may build its own
 * UI in what the host gives it (panels, dialogs, menus, its floating elements).
 */
export interface ModelHost {
  readonly doc: Document;
  readonly bridge: Bridge;
  /** Whether a node is in one of Silverware Table's floating controls (toolbar, grips, menus): one the core made */
  isFloating(node: Node): boolean;
  /**
   * Opens a feature's modal dialog over the page (one at a time): its keys and
   * presses are its own, Esc or a press beside it closes it, the focus goes
   * back where it was; the cell editor stays open meanwhile
   */
  openDialog(options: DialogOptions): Dialog;
  /**
   * The same for a table of the page by where it is (a TableInfo is one),
   * whether it is rendered or not: what modules write with
   */
  writeTable(target: TableTarget, change: (table: Table) => Table | undefined, options?: WriteOptions): Promise<WriteResult>;
  /**
   * A new table written into the page, in one edit: after the table `after`
   * (an empty line between), else at the page's end; `also`: a table of the
   * page changed in the same edit (put on a sheet with it); `key`: the new
   * table's, made before it is written (newTableKey), for what the caller
   * keeps for it meanwhile. No other table's key changes, wherever it goes.
   */
  insertTable(table: Table, after?: TableTarget, also?: { readonly target: TableTarget; readonly change: (table: Table) => Table }, key?: TableKey): Promise<WriteResult>;
  /** A key for a table not written yet (insertTable's `key`, given back if it is not written), on the current page */
  newTableKey(): TableKey;
  /** A table shown, by its key, as it is now (rendered anew after a write: its new info) */
  tableFor(key: TableKey): TableInfo | undefined;
  /**
   * The keys of a page's tables in its text (as read now: bridge.getText), in
   * the order findTables gives them: a table found in the text by its key. How
   * tables are told apart is the core's (core/tables.ts): a key is made by it
   * only, never from a table's place
   */
  tableKeys(page: string, text: string): readonly TableKey[];
  /** The page a table's key is of */
  pageOf(key: TableKey): string | undefined;
  /** The tables shown on the page */
  shownTables(): TableInfo[];
  /** The rows shown, in display order: the header (0) first, then the body rows (their rows in the markdown) as sorted and filtered */
  shownOrder(info: TableInfo): number[];
  /** Whether a body row is hidden (filtered out) */
  rowHidden(info: TableInfo, row: number): boolean;
  /** A cell's text as its markdown renders (a link's text, a `${…}` result), before any feature's look; undefined: not rendered */
  shownText(info: TableInfo, ref: CellRef): string | undefined;
  /** A cell's value as sorting, filters and copying see it (a look's value, else its text shown; the edited cell's typed text) */
  shownValue(info: TableInfo, ref: CellRef): string | undefined;
  /**
   * What features want the table's cells to look like changed (Feature.looks):
   * applied anew to `cells` (none: every cell and header); the view stays as it
   * is (its order and the rows hidden: a value changed for sorting sorts at the next view)
   */
  looksChanged(info: TableInfo, cells?: readonly CellRef[]): void;
  /** What features want the tables to look like as a whole changed (Feature.tableLook: a setting): applied anew to every table shown */
  tableLooksChanged(): void;
  /** A small table for a feature's own UI, with this header and rows, looking as the page's tables do with `look` */
  previewTable(header: readonly string[], rows: readonly (readonly string[])[], look: TableLook): TablePreview;
  /** Hands the keyboard back to the page's editor */
  focusPage(): void;
  /** A floating container for a feature's own UI, placed by what it is anchored to (Panel) */
  panel(className: string): Panel;
  /** A mark of cells, kept by table and cell (MarkLayer) */
  markLayer(mark: string): MarkLayer;
  /** An outline of areas of cells, `name` telling its pieces apart when pressed (OutlineLayer) */
  outlineLayer(name: string, pieces: (sides: readonly Side[]) => readonly string[]): OutlineLayer;
  /** Handles in cells, `name` telling them apart when pressed (HandleLayer) */
  handleLayer(name: string): HandleLayer;
  /** What an event's target (or, with a point, what is at that point of the window) is, in model terms */
  targetOf(target: EventTarget | null, point?: { readonly x: number; readonly y: number }): PointerTarget;
  /** Follows a drag from a press (DragOptions); returns what ends it early */
  drag(start: MouseEvent | PointerEvent, options: DragOptions): () => void;
  /** A state of the page for CSS while it lasts (class swt-<mark> on the page: a drag going on, a mode) */
  pageMark(mark: string, on: boolean): void;
  /** A state of a table for CSS while it lasts (class swt-<mark> on it: picking a cell in it), kept by its key: rendered anew, it has it again */
  tableMark(key: TableKey, mark: string, on: boolean): void;
  /** A cell scrolled into view, the page and its table's box as needed */
  revealCell(info: TableInfo, ref: CellRef): void;
  /** The rows shown from one row to another (of the markdown, in the order shown), both included; empty: either not shown */
  shownBetween(info: TableInfo, a: number, b: number): number[];
  /**
   * Where a part of a table shown is in the window (for a feature's own UI by
   * it: a grip, a menu): a cell, a row (across its cells), a column (its header
   * cell), the table (as far as its box shows it); undefined: not rendered
   */
  rectOf(info: TableInfo, part: { readonly row: number; readonly column: number } | { readonly row: number } | { readonly column: number } | "table"): Rect | undefined;
  /**
   * A block of rows (columns) dragged from a press `pressedAt` (its y, x): a
   * copy of them follows the pointer, the others make room where they would
   * go (`to` from `blockTo`, given where the block was asked to start), near
   * the edges it scrolls; the core's (the rendering's). `move` as the pointer
   * moves, `finish` where they go (the block's first line), none: cancelled
   */
  dragLines(info: TableInfo, axis: "row" | "column", block: { readonly first: number; readonly last: number }, pressedAt: number, blockTo: (asked: number) => number): LineDrag | undefined;
  /**
   * The part of the area from one cell to another (their corners) in view:
   * cut to the table's box, the page's view and, for body cells, what is held
   * over the body (the header, rows pinned to the bottom); undefined: none of it
   */
  areaRect(info: TableInfo, first: CellRef, last: CellRef): Rect | undefined;
  /** The cell of a table at a point of the window, by where its rows and columns are (whatever is over them); undefined: not on it */
  cellAtPoint(info: TableInfo, x: number, y: number): CellRef | undefined;
  /** A column shown `width` pixels wide for now (undefined: as Feature.columnWidths has it), a width being dragged */
  showColumnWidth(info: TableInfo, column: number, width: number | undefined): void;
  /**
   * Hashtags in headers not shown, by name (a column type's): hidden from the
   * moment a table is rendered (before its looks apply); given again, they replace those of `owner`
   */
  hideHeaderTags(owner: string, tags: { readonly exact: readonly string[]; readonly prefixes: readonly string[] }): void;
  /** Closes the cell editor without saving, and drops a cell waiting to be edited */
  cancelEditing(): void;
  /** The open cell editor, if any */
  readonly editing: CellEditor | undefined;
  /**
   * What the last press was made with: "mouse", "touch" or "pen" ("" before
   * any). Also on the page's root as data-swt-pointer, so CSS shows the
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
  /** The naming for a menu's title (Feature.menuNaming): the first feature's */
  menuNaming(info: TableInfo, target: NamingTarget): MenuNaming | undefined;
  /** Opens the table's ⋯ menu (of its toolbar), with `naming` its title's name field open (a name to type) */
  openTableMenu(info: TableInfo, naming?: boolean): void;
  /** A header given a new name (escaped markdown) other than by its editor: with what features keep in it (Feature.headerRenamed) */
  headerRenamed(name: string, original: string): string;
  /** Opens the cell menu at a point, as a right click on the cell would; false when no feature offers anything */
  openCellMenu(info: TableInfo, at: CellRef, point: { x: number; y: number }): boolean;
  /** A menu floating over the page (core/menu.ts) made of the entries, one of the core's floating elements, in the page: to place and focus (focusMenu) */
  floatingMenu(title: string, entries: readonly MenuEntry[], options: { readonly back?: MenuBack; readonly naming?: MenuNaming; readonly close: () => void; readonly owner?: object; readonly titleIcon?: MenuTitleIcon }): HTMLElement;
  /** A file given to the browser to download (made in the page: nothing is sent anywhere) */
  download(file: string, data: Uint8Array, type: string): void;
  /** The keyboard into a menu made by floatingMenu, once it is placed (its entry checked, if it is a list) */
  focusMenu(menu: HTMLElement): void;
  /** A floating element (position: fixed) in the page, kept out of the editor's way */
  floating<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K];
  /** Places a floating element at a point of the viewport, kept inside it sideways, and shows it */
  place(element: HTMLElement, left: number, top: number): void;
  /**
   * Closes the cell editor for an edit that ends editing: `save` adds what the
   * editor held to that edit (undefined: the cell changed in the meantime)
   */
  takeEditor(): { readonly key: TableKey; readonly row: number; readonly column: number; readonly save: (table: Table) => Table | undefined } | undefined;
  /** Closes the cell editor saving, as leaving it does (an edit a feature holds stays held), the focus left where it is */
  saveEditing(): Promise<void>;
  /** Asks the user (SilverBullet's dialog, else the browser's) */
  ask(question: string): Promise<boolean>;
  /** The table as edited: its markdown with the edits features hold (pendingEdits), what a cell's editor starts from */
  tableOf(info: TableInfo): Table;
  /** The page's text as last read */
  readonly pageText: string;
  /** The name of the page shown */
  readonly currentPage: string;
  /** The other pages a feature read for formulas (pageLinks); undefined: none reads them */
  otherPages(): OtherPages | undefined;
  /** Selects cells, where a feature selects (Feature.selectCells) */
  selectCells(info: TableInfo, anchor: CellRef, focus: CellRef): void;
  /**
   * Edits a cell of a table shown (a selected cell, from the keyboard), its
   * text as the setting says; "replace": the field starts empty, so what is
   * typed replaces the text; "select": the text selected (a paste replaces it)
   */
  editCell(info: TableInfo, ref: CellRef, how?: "replace" | "select", popup?: boolean): void;
  /** The cell being edited goes on in its popup (a textarea, wrapped), what is typed kept */
  editInPopup(): void;
  /** Whether a feature selects cells (Feature.selectCells) */
  selectsCells(): boolean;
  /** The cells selected in a table, if a feature selects (Feature.selected) */
  selectedCells(info: TableInfo): readonly CellRef[];
  /** The cells selected changed (the selection module): what follows them (the quiet + of a last row or column) follows */
  selectionChanged(): void;
  /**
   * An arrow on a cell selected alone at the table's edge, away from the
   * table (the selection module): whether a feature took the selection on past
   * it (Feature.selectionLeaves), so the table's selection ends
   */
  selectionLeaves(info: TableInfo, from: CellRef, step: readonly [number, number]): boolean;
  /** The addresses a table's cells have where a feature lays it out on a grid of its own (Feature.addressFrame), if one does */
  addressFrame(info: TableInfo): AddressFrame | undefined;
  /** Whether a module is on (one feature serves another: pageLinks reads pages for formulas) */
  moduleOn(name: FeatureName): boolean;
  /** Tables changed outside the page (another page read anew): features check them again */
  tablesChanged(): void;
  /** What deleting a column also removes, by the features (names of rows and cells in it) */
  columnDeleteWarnings(info: TableInfo, column: number): string[];
  /** Attributes of hidden tags a copy of a row leaves out (names: one per page or table) */
  uniqueTags(): ReadonlySet<string>;
  /** What the features say the metadata of these tables holds (Remove metadata) */
  metadataParts(tables: readonly Table[]): MetadataPart[];
  /** What a feature's toolbar buttons show changed: the toolbar in view is shown again */
  toolbarChanged(): void;
  /** Whether a table is shown sorted or with rows hidden (filtered), so rows are not where the markdown has them */
  rearranged(info: TableInfo): boolean;
  /**
   * Ends the view a table's metadata stored (its sorting, the features' state
   * read from it: filters), so the table shows its rows as written
   */
  forgetStoredView(key: TableKey): void;
  /** The same for the table with `key`, as it is shown now */
  viewChangedFor(key: TableKey): void;
  /**
   * A cell's new markdown with the hidden tags the cell had, but those the
   * features that manage them take (Feature.takesTags): editing, pasting or
   * clearing a cell keeps the data modules keep in it
   */
  keepTags(value: string, from: string): string;
  /** Why a cell's value is a feature's (Feature.keepsCell): pasting leaves it */
  cellKeptBy(cell: string): string | undefined;
  /** A feature's copy of a cell for another cell (Feature.fillCell), or undefined: copied as its value */
  fillCell(info: TableInfo, cell: string, from: CellRef, to: CellRef): string | undefined;
  /** Keyboard and input events from a field of a feature must not reach SilverBullet's editor */
  isolate(element: HTMLElement): void;
  /**
   * The entries features add to a column's menu (see Feature.columnMenuEntries);
   * `open` shows other entries in the menu's place, e.g. a list to pick from
   */
  columnMenuEntries(info: TableInfo, column: number, open: (title: string, entries: readonly MenuEntry[]) => void): MenuEntry[];
  /** The entries features put first in a column's menu's section of sorting and filtering (see Feature.columnMenuLeadEntries) */
  columnMenuLeadEntries(info: TableInfo, column: number, open: (title: string, entries: readonly MenuEntry[]) => void): MenuEntry[];
  /** The entries features add at the top of a column's menu (see Feature.columnMenuTopEntries) */
  columnMenuTopEntries(info: TableInfo, column: number): MenuEntry[];
  /** The entries features add with inserting and moving a column (see Feature.columnMenuInsertEntries) */
  columnMenuInsertEntries(info: TableInfo, column: number): MenuEntry[];
  /** The entries features add to a row's menu, for the cell in `column` (see Feature.rowMenuEntries) */
  rowMenuEntries(info: TableInfo, row: number, column: number): MenuEntry[];
  /** The entries features add first to the menu of rows (columns) `lines` (see Feature.lineMenuEntries) */
  lineMenuEntries(info: TableInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[];
  /** A setting's value, its default when unset or not valid */
  setting<K extends keyof typeof SETTINGS>(name: K): Promise<SettingValue<K>>;
  /** The metadata setting as last read */
  readonly metadataEnabled: boolean;
  /** How a table is shown: sorting and filters */
  viewOf(info: TableInfo): ViewState;
  /** A view change that may change the sorting, which the metadata setting also stores */
  setSort(info: TableInfo, view: ViewState): void;
}

/** What the core offers the adapter's modules (src/core/silverbullet/modules/): the model host and the rendering */
export interface TableHost extends ModelHost {
  infoOf(widget: HTMLElement): WidgetInfo | undefined;
  /** The rendered table a key belongs to, if it is enhanced and on screen */
  widgetForKey(key: TableKey): HTMLElement | undefined;
  /** The enhanced table an event target is in */
  enhancedWidgetOf(target: EventTarget | null): [HTMLElement, WidgetInfo] | undefined;
  /** The header or body cell an event target is in (not the filter or metadata row) */
  tableCellOf(info: WidgetInfo, target: EventTarget | null): HTMLTableCellElement | undefined;
  cellRef(info: WidgetInfo, cell: HTMLTableCellElement): CellRef | undefined;
  /** The header or body cell an event target is in, in an enhanced table; with `key`, only in that table */
  cellUnder(target: EventTarget | null, key?: TableKey): CellHit | undefined;
  /** The row of the markdown a row rendered is (the header 0) */
  rowOf(info: WidgetInfo, tr: HTMLTableRowElement): number;
  /** The header row and the shown body rows, in display order */
  shownRows(info: WidgetInfo): HTMLTableRowElement[];
  /** Re-reads the table, applies `change` and writes it back as one edit */
  write(widget: HTMLElement, change: (table: Table) => Table | undefined, options?: WriteOptions): Promise<WriteResult>;
  /** A table's visible box: the part of it not scrolled out of view */
  innerBox(widget: HTMLElement): Rect;
  /**
   * Edits a cell past the table's last row or column (`at`: row `info.rows` is
   * the first row past it, column `info.columns` the first column), shown by
   * the caller's element `cell` (a td of its own where that cell would be):
   * Enter or Tab saves it, the table grown to hold it in the same edit (rows
   * above those pinned to the bottom, named columns left of those pinned to
   * the right), nothing written while it is empty; Esc drops it. Not while
   * another cell is edited. With `place`, the caller writes what was typed
   * (as typed: no feature makes anything of it) instead of the table grown:
   * a value that makes a table of its own (the sheet's far cells).
   */
  editBeyond(widget: HTMLElement, info: WidgetInfo, at: CellRef, cell: HTMLTableCellElement, place?: (typed: string) => Promise<WriteResult>): void;
  /** A table changed its size (a column's width): what follows its layout (pinned columns' offsets, the held header, the controls, cut cells) follows */
  tableResized(info: WidgetInfo): void;
  /** Hands the keyboard back to SilverBullet's editor */
  focusEditor(widget: HTMLElement): void;
  /**
   * A feature changed what a table shows (its filters): the view applied
   * anew, the row being edited placed with the others and held there
   */
  viewChanged(widget: HTMLElement, info: WidgetInfo): void;
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
  viewBounds(element: HTMLElement): Rect;
  /**
   * The part of a cell in view: cut to the table's box, the page in view and,
   * for a body cell, what is held over the body (the header, pinned rows and
   * columns); undefined when none of it is
   */
  shownPart(widget: HTMLElement, info: WidgetInfo, cell: HTMLElement): Rect | undefined;
  /** The controls of the table hovered go (its toolbar, grips, the +, a menu open on it): what is under the pointer changed (core/overwindow.ts) */
  hideControls(): void;
  /** Where a table is in view: the table, cut to the box that scrolls it sideways */
  shownRect(widget: HTMLElement, info: WidgetInfo): Rect;
  /**
   * Where the body shows between what is held over it (the header, rows
   * pinned to the bottom, columns pinned left and right); a side with nothing
   * held is infinite
   */
  heldBounds(info: WidgetInfo): Rect;
  /** The body rows as rendered, in the order of the markdown, hidden ones included */
  bodyRows(info: WidgetInfo): HTMLTableRowElement[];
  setView(widget: HTMLElement, info: WidgetInfo, view: ViewState): void;
  /** The element a table was rendered in */
  widgetOf(info: WidgetInfo): HTMLElement;
  /** The cell editor as rendered: its field, its cell */
  rendered(editor: CellEditor): RenderedEditor;
  /** A table shown, by its key, as rendered now */
  tableFor(key: TableKey): WidgetInfo | undefined;
  /** The tables shown, as rendered */
  shownTables(): WidgetInfo[];
  /** The open cell editor as rendered, if any */
  readonly editing: RenderedEditor | undefined;
  /** Opens the table's ⋯ menu at its rendered table */
  openTableMenu(target: TableInfo | HTMLElement, naming?: boolean): void;
}

/** A feature: every hook is optional */
/** A module (src/features/): every hook is optional, all in model terms */
export interface Feature {
  start?(): void;
  stop?(): void;
  /**
   * Something holds the pointer: a drag (the hover controls stay where they
   * are), or an open menu (they stay in its table, cells hovered there still reported)
   */
  pointerBusy?(): "drag" | "menu" | undefined;
  /** The same in model terms: the cell of the table the pointer is over */
  hovered?(info: TableInfo, ref: CellRef): void;
  /**
   * The cell menu asked for on a cell (a right click, a long press, the Menu
   * key, a tap on cells selected): true when the feature opens its own menu
   * there instead (the grips': rows or columns selected whole get theirs)
   */
  cellMenu?(info: TableInfo, at: CellRef, point: { x: number; y: number }): boolean;
  /** The cell menu opened (a tap or a press that sends no mouse event a feature sees): the feature's own menu closes */
  cellMenuOpened?(): void;
  /** No cell is hovered any more; with `closeMenus`, menus close too */
  hoverEnded?(closeMenus: boolean): void;
  /** Any press (any button), before anything else; true: taken, nothing else happens */
  mouseDown?(e: MouseEvent): boolean;
  /** Any left press, before Silverware Table handles it */
  beforeMouseDown?(e: MouseEvent): void;
  /** A press on a cell, before Silverware Table edits it; true: taken (e.g. pointing in a formula) */
  beforeCellPress?(info: TableInfo, cell: CellRef, e: MouseEvent): boolean;
  /** A press on a cell that Silverware Table took to edit it (not a link, not pointing in a formula) */
  afterCellPress?(info: TableInfo, cell: CellRef, e: MouseEvent): void;
  /** A key, before Silverware Table handles it; true: handled, nothing else happens */
  keyDown?(e: KeyboardEvent): boolean;
  /** A table was enhanced, e.g. rendered again after a write */
  enhanced?(info: TableInfo): void;
  /**
   * How the table's cells and headers look (in model terms; the renderer
   * applies it), asked when the table is rendered and when a feature says its
   * looks changed (TableHost.looksChanged); `table` is its markdown as shown
   */
  looks?(info: TableInfo, table: Table): TableLooks | undefined;
  /**
   * How a table looks as a whole, from its metadata row (none: undefined);
   * asked as soon as the table is rendered (before it is laid out: the
   * metadata as rendered) and once its markdown is read
   */
  tableLook?(meta: TableMeta | undefined): TableLook | undefined;
  /**
   * Entries for a column's menu, after its sorting; `open` shows other
   * entries in the menu's place (they close the menu when run)
   */
  columnMenuEntries?(info: TableInfo,
    column: number,
    open: (title: string, entries: readonly MenuEntry[]) => void,
  ): MenuEntry[];
  /** As columnMenuEntries, first in that section, before the sorting: what the column is (its type) */
  columnMenuLeadEntries?(info: TableInfo,
    column: number,
    open: (title: string, entries: readonly MenuEntry[]) => void,
  ): MenuEntry[];
  /**
   * Entries for the menu of a cell, or of cells (selected), opened with a right
   * click, a long press or the Menu key, in groups; `order` places a group (0
   * naming, 1 editing, 2 viewing, 9 deleting, last). They close the menu when run.
   */
  cellMenuEntries?(info: TableInfo, cells: readonly CellRef[]): CellMenuGroup | readonly CellMenuGroup[] | undefined;
  /**
   * The cells the cell menu opened on `at` is for: the cells selected (as
   * shown) when the selection holds it, else `at`, now selected
   */
  selectedCells?(info: TableInfo, at: CellRef): readonly CellRef[] | undefined;
  /**
   * Selects the cells from `anchor` to `focus` (rows as shown): a row's or a
   * column's grip clicked, rows (columns) picked with the pointer
   */
  selectCells?(info: TableInfo, anchor: CellRef, focus: CellRef): void;
  /** The cells selected in the table (as shown), if any */
  selected?(info: TableInfo): readonly CellRef[] | undefined;
  /** Entries at the top of a column's menu, before its sorting (naming the column); they close the menu when run */
  columnMenuTopEntries?(info: TableInfo, column: number): MenuEntry[];
  /** Entries with inserting and moving the column in its menu, after them (a numbered column); they close the menu when run */
  columnMenuInsertEntries?(info: TableInfo, column: number): MenuEntry[];
  /** Entries at the top of a row's menu, about its cell in `column` (the one under the pointer or edited); they close the menu when run */
  rowMenuEntries?(info: TableInfo, row: number, column: number): MenuEntry[];
  /**
   * Entries first in the menu of rows (columns): `lines`, those its grip acts
   * on (the lines selected whole that hold its own, else it), markdown rows or
   * columns; they close the menu when run (the clipboard's: copy, cut, paste)
   */
  lineMenuEntries?(info: TableInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[];
  /** Buttons for the table's toolbar, shown while the pointer is over the table */
  toolbarButtons?(info: TableInfo): ToolbarButton[];
  /** Before a write reads the page's text: what it needs read first (other pages the tables written refer to) */
  prepareWrite?(info: TableTarget): Promise<void>;
  /**
   * A cell's edit the cell editor would write (not a header's name): true, the
   * feature keeps it (shows it, writes it later, through pendingEdits); the
   * editor goes on as if nothing was written
   */
  holdCellEdit?(info: TableInfo, edit: HeldEdit): boolean;
  /** The edits the feature holds for a table, put into each of its writes (and into tableOf) */
  pendingEdits?(info: TableTarget): PendingEdits | undefined;
  /** Another page was loaded into the editor (`name`): what was held for the page left can no longer be written into the editor */
  pageLoaded?(name: string): Promise<void> | void;
  /** After the edit, before the write steps: what they need read (other pages the edited table refers to) */
  prepareEdit?(edited: Table, page: WritePage): Promise<void>;
  /** A write step: the table edited, as the feature changes it in the same write (formulas recalculated, references following) */
  writeStep?(before: Table, after: Table, edit: WriteEdit): Table;
  /**
   * Why the write must not be made (said so, nothing written): a sheet's table
   * that would grow into another; undefined: it may
   */
  refusesWrite?(before: Table, after: Table, edit: WriteEdit): string | undefined;
  /**
   * Other tables of the page the write changes too, in the same edit (formulas
   * referring to the edited table); `edit.page.tables` has those features
   * before it changed. `after` undefined: the table is deleted (Delete table)
   */
  otherTablesWritten?(before: Table, after: Table | undefined, edit: WriteEdit): readonly PageTable[];
  /** Other pages read for formulas (the pageLinks module) */
  otherPages?(): OtherPages;
  /** SilverBullet indexed a page (it changed) */
  pageIndexed?(name: string): Promise<void> | void;
  /** What deleting a column of the table also removes, asked first: "the names of 2 rows pear and fig: …" */
  columnDeleteWarning?(info: TableInfo, column: number): string | undefined;
  /** What deleting the whole table (Delete table) also affects, asked first: "the formulas of 2 tables that refer to it show #REF!" */
  tableDeleteWarning?(info: TableInfo): string | undefined;
  /** Attributes of the feature's hidden tags a copy of a row leaves out (a name is one cell's, one row's) */
  uniqueTags?(): readonly string[];
  /** What the feature keeps in these tables, for Remove metadata (which removes it) */
  metadataPart?(tables: readonly Table[]): MetadataPart | undefined;
  /**
   * Body rows the feature hides (filters), as indexes into `values` (one array
   * of cell values per body row, values[0] being row 1); pinned rows are not hidden
   */
  hiddenRows?(info: TableInfo, values: readonly (readonly string[])[]): ReadonlySet<number> | undefined;
  /** Whether the feature hides rows of the table now (moving rows and pasting wait for that to end) */
  hidesRows?(info: TableInfo): boolean;
  /** The table's view was applied: rows sorted and hidden, the header marked */
  viewApplied?(info: TableInfo): void;
  /** The widths of a table's columns, in pixels (the widths module's); asked each time its view is applied */
  columnWidths?(info: TableInfo): ReadonlyMap<number, number> | undefined;
  /**
   * A row of the feature's own UI under the table's header, asked each time
   * the view is applied (undefined: none): the same elements given again stay
   * where they are (a field typed in keeps its focus)
   */
  headerRow?(info: TableInfo): HeaderRow | undefined;
  /** The view a table's metadata stored ends (Remove metadata): state read from it goes */
  viewForgotten?(key: TableKey): void;
  /** Columns of the table with `key` moved or were deleted (`map`: their new indexes, undefined: deleted) */
  columnsMoved?(key: TableKey, map: (column: number) => number | undefined): void;
  /**
   * A click on an element the feature marked with data-swt-action in a table
   * (a header icon's `action`, or its own UI's element), with the column of its
   * data-swt-column (clicks there reach Silverware Table only); true: it was the feature's
   */
  action?(name: string, info: TableInfo, column: number | undefined): boolean;
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
  editorText?(info: TableInfo, cell: CellRef, original: string): string | undefined;
  editorOpened?(editor: CellEditor): void;
  /** What the cell editor holds changed (typed, pasted, set) */
  editorInput?(editor: CellEditor): void;
  /** The cell editor's caret may have moved (a key let go, a click in its field, the focus back) */
  editorCaret?(editor: CellEditor): void;
  /** Text pasted into the cell editor (`text`, the clipboard's): true, the feature takes it (the browser does not paste it into the field) */
  editorPaste?(editor: CellEditor, text: string): boolean;
  /**
   * A copy or a cut (Ctrl+C, Ctrl+X) not in a field with text selected: what
   * the feature puts on the clipboard (the cells selected); the first one's
   * is taken, and `copied` told to every feature after it
   */
  clipboardData?(kind: "copy" | "cut"): ClipboardData | undefined;
  /** A copy or a cut happened: data what a feature put on the clipboard (Feature.clipboardData), undefined: text a field copied (what follows the cells copied ends) */
  copied?(kind: "copy" | "cut", data: ClipboardData | undefined): void;
  /** A key in the cell editor, before Silverware Table handles it; true: handled (its default is prevented) */
  editorKeyDown?(e: KeyboardEvent, editor: CellEditor): boolean;
  /** The markdown to save for what was typed; undefined: the text */
  editorValue?(editor: CellEditor, typed: string): string | undefined;
  /** A click selects first (select mode: the selection module's), a second click acts; false: a click acts at once */
  clickSelects?(): boolean;
  /** The name of what a menu is about (a cell, a row, a column, the table), shown in its title with a pencil to change it */
  menuNaming?(info: TableInfo, target: NamingTarget): MenuNaming | undefined;
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
  fillCell?(info: TableInfo, cell: string, from: CellRef, to: CellRef): string | undefined;
  /** The cells selected changed (the selection module): what goes with them follows */
  selectionChanged?(): void;
  /**
   * An arrow on a cell selected alone at the table's edge, away from it
   * (`step`: rows and columns, one of them ±1): true, the feature selects on
   * past the edge (the sheet view's empty cells), the table's selection ends
   */
  selectionLeaves?(info: TableInfo, from: CellRef, step: readonly [number, number]): boolean;
  /** The addresses the table's cells have where the feature lays it out on a grid of its own (the sheet view) */
  addressFrame?(info: TableInfo): AddressFrame | undefined;
  /**
   * A press on a control in a cell (a header's sort button, its filter mark):
   * true, the feature takes it instead of the control (pointing at the
   * header while a formula waits for a reference)
   */
  beforeActionPress?(info: TableInfo, cell: CellRef, e: MouseEvent): boolean;
  editorClosed?(editor: CellEditor): void;
}

/** A module of the adapter (src/core/silverbullet/modules/): a module, and the hooks of the rendering */
export interface AdapterFeature extends Feature {
  /** The pointer is over a cell, or the page moved under it */
  cellHovered?(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void;
  /** Marks on a table's cells, once its rows know their rows in the markdown (data-swt-row) */
  decorate?(widget: HTMLElement, info: WidgetInfo): void;
  /**
   * SilverBullet put a table into the page, before the browser lays it out:
   * its rows as rendered (the header first). A feature may take rows out of
   * the document; Silverware Table keeps them (bodyRows, shownRows, cellAt still
   * have them) and its features read them as before, but for their layout.
   */
  tableAdded?(widget: HTMLElement, table: HTMLTableElement, rows: readonly HTMLTableRowElement[]): void;
  /**
   * The body rows shown, in their order (sorted and filtered; not those pinned
   * to the top or bottom), placed into the table's body by the feature instead
   * of Silverware Table (true): e.g. only those in view, the others out of the document
   */
  placeRows?(widget: HTMLElement, info: WidgetInfo, body: HTMLTableSectionElement, shown: readonly HTMLTableRowElement[]): boolean;
  /** A body row out of the document is needed (rowNeeded): the feature that took it out puts it back */
  rowNeeded?(info: WidgetInfo, row: HTMLTableRowElement): void;
  /** Body rows were put back into the document (rowsAttached): laid out now, they can be measured */
  rowsAttached?(info: WidgetInfo, rows: readonly HTMLTableRowElement[]): void;
}
