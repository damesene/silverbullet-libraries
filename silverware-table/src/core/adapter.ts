// What the core needs from whatever renders the tables: the adapter. The core
// keeps the model (tables by key, cells by their row in the markdown and
// their column), the view, the editor's state and the writes, and asks the
// adapter to show what the features want; the adapter knows the rendering
// (SilverBullet's tables today: core/silverbullet/) and answers in model
// terms. Another rendering (the sheet's own tables, the page's tables drawn
// by Silverware Table itself) is another adapter.
//
// Being moved here step by step from the controller (docs/silverware-table-isolation.md):
// what is not here yet is still the controller's own DOM code.
import type { CellRef, HandlePlace, HeaderRow, PointerTarget, Rect, Side, TableLook, TablePreview, WidgetInfo } from "./feature.ts";
import type { MergedLooks } from "./looks.ts";

export interface TableAdapter {
  /** The features' looks applied to a table's cells and headers; `editing`: the cell edited (its field shows, not a display) */
  applyLooks(info: WidgetInfo, looks: MergedLooks, editing: CellRef | undefined): void;
  /** A cell's text as its markdown renders, before any look; undefined: not rendered */
  renderedText(info: WidgetInfo, ref: CellRef): string | undefined;
  /** A whole table's look (the features' merged) applied, what it had before and has no more taken back */
  applyTableLook(info: WidgetInfo, look: TableLook): void;
  /** A small table for a feature's own UI, looking as the page's tables do */
  previewTable(header: readonly string[], rows: readonly (readonly string[])[], look: TableLook): TablePreview;
  /** The part of a cell in view (cut to its table's box, the page's view, what is held over the body), in the window; undefined: none */
  cellRect(info: WidgetInfo, ref: CellRef): Rect | undefined;
  /** Hashtags in headers not shown from the moment a table is rendered, by name (exact, or starting so); `owner`'s replaced */
  hideHeaderTags(owner: string, tags: { readonly exact: readonly string[]; readonly prefixes: readonly string[] }): void;
  /** The cells of a table that have a mark (MarkLayer); the cells that had it before and are not among them lose it */
  markCells(info: WidgetInfo, mark: string, cells: readonly CellRef[]): void;
  /** The rows of features' own UI under the table's header, in this order (undefined: that feature has none); elements in place stay */
  placeHeaderRows(info: WidgetInfo, rows: readonly (HeaderRow | undefined)[]): void;
  /** An area of a table's cells outlined for a layer (OutlineLayer), its outline before gone */
  showOutline(name: string, info: WidgetInfo, rows: readonly number[], columns: readonly [number, number], pieces: (sides: readonly Side[]) => readonly string[]): void;
  hideOutline(name: string): void;
  /** Whether a layer's outline is in the tables shown (none rendered anew since) */
  outlineShown(name: string): boolean;
  /** A layer's handles placed in a table (HandleLayer) */
  placeHandles(name: string, info: WidgetInfo, handles: readonly HandlePlace[]): void;
  hideHandles(name: string): void;
  /** What an element is: a cell of a table shown, a piece of an outline, a handle; undefined: none of the tables' */
  targetOf(element: Element): PointerTarget | undefined;
  /** What is at a point of the window */
  elementAt(x: number, y: number): Element | null;
  /** The cell of a table nearest a point (the row and column it is in, or the first or last of them past the table) */
  cellNear(info: WidgetInfo, x: number, y: number): CellRef | undefined;
  /** A drag at a point near an edge of what shows the table scrolls it (its box, the page) */
  scrollNear(info: WidgetInfo, x: number, y: number, sideways: boolean): void;
  /** A state of the page for CSS (swt-<mark>) */
  pageMark(mark: string, on: boolean): void;
  /** A cell scrolled into view */
  revealCell(info: WidgetInfo, ref: CellRef): void;
  /** Whether a node is one of the adapter's own elements over the cells (a piece of an outline, a handle) */
  owns(node: Node): boolean;
  /** Silverware Table stops: what the adapter added to the page goes */
  stop(): void;
}
