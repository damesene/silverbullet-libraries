// An area of cells outlined as a spreadsheet outlines cells copied, moved or
// filled: a piece (an element of Table Plus' own, placed by CSS) in each cell
// on the area's edge, marked with the sides it draws. Pieces in the cells,
// not a box over the table, so they scroll, stick and are cut with their cells.
import { OUT_OF_LINE_CLASS, UI_CLASS } from "../dom.ts";

export type Side = "top" | "bottom" | "left" | "right";

export class Outline {
  private pieces: HTMLElement[] = [];

  /**
   * `classes` gives the classes of the pieces a cell on the edge gets for the
   * sides it is on: one piece per string (e.g. one for all its sides, or one per side)
   */
  constructor(
    private readonly doc: Document,
    private readonly classes: (sides: readonly Side[]) => readonly string[],
  ) {}

  /**
   * Outlines an area of `height` rows and `width` columns, the outline before
   * it gone; `cellAt(i, j)` is its cell in row i, column j (undefined: none
   * there, e.g. a row out of the document). Only the cells on the edge are visited.
   */
  show(height: number, width: number, cellAt: (i: number, j: number) => HTMLTableCellElement | undefined): void {
    this.clear();
    for (let i = 0; i < height; i++) {
      const edgeRow = i === 0 || i === height - 1;
      // A row between the first and the last: its first and last cell only
      for (let j = 0; j < width; j = edgeRow || j === width - 1 ? j + 1 : width - 1) {
        const sides: Side[] = [];
        if (i === 0) sides.push("top");
        if (i === height - 1) sides.push("bottom");
        if (j === 0) sides.push("left");
        if (j === width - 1) sides.push("right");
        const cell = cellAt(i, j);
        if (!cell) continue;
        for (const classes of this.classes(sides)) {
          const piece = this.doc.createElement("span");
          piece.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} ${classes}`;
          cell.append(piece);
          this.pieces.push(piece);
        }
      }
    }
  }

  clear(): void {
    for (const piece of this.pieces) piece.remove();
    this.pieces = [];
  }

  /** Whether a node is (in) one of the pieces */
  contains(node: Node): boolean {
    return this.pieces.some((piece) => piece.contains(node));
  }

  /** Whether the outline is still in the table shown (not rendered anew since): none is */
  get shown(): boolean {
    return this.pieces.every((piece) => piece.isConnected);
  }
}
