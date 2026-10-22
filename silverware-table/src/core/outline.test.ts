// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Outline } from "./outline.ts";

/** A table of `rows` × `columns` cells */
function table(rows: number, columns: number): HTMLTableCellElement[][] {
  const element = document.createElement("table");
  for (let i = 0; i < rows; i++) {
    const tr = element.insertRow();
    for (let j = 0; j < columns; j++) tr.insertCell();
  }
  document.body.append(element);
  return Array.from(element.rows, (tr) => Array.from(tr.cells));
}

const marks = (cells: HTMLTableCellElement[][]) => cells.map((row) => row.map((cell) => Array.from(cell.children, (piece) => piece.classList[2]).join("+")));

describe("Outline", () => {
  it("puts a piece in each cell on the area's edge, with the sides it draws", () => {
    const cells = table(3, 3);
    const outline = new Outline(document, (sides) => [sides.join("-")]);
    outline.show(3, 3, (i, j) => cells[i]![j]);
    expect(marks(cells)).toEqual([
      ["top-left", "top", "top-right"],
      ["left", "", "right"],
      ["bottom-left", "bottom", "bottom-right"],
    ]);
  });

  it("gives one cell all four sides, and a piece per class string", () => {
    const cells = table(1, 1);
    const outline = new Outline(document, (sides) => [...sides]);
    outline.show(1, 1, (i, j) => cells[i]![j]);
    expect(marks(cells)).toEqual([["top+bottom+left+right"]]);
  });

  it("goes when cleared or shown elsewhere, and skips cells not there", () => {
    const cells = table(2, 2);
    const outline = new Outline(document, (sides) => [sides.join("-")]);
    outline.show(2, 2, (i, j) => cells[i]![j]);
    expect(outline.contains(cells[0]![0]!.firstChild!)).toBe(true);
    outline.show(1, 1, (i, j) => (i === 0 && j === 0 ? undefined : cells[i]![j]));
    expect(marks(cells)).toEqual([
      ["", ""],
      ["", ""],
    ]);
    outline.show(1, 2, (i, j) => cells[i]![j]);
    outline.clear();
    expect(marks(cells)).toEqual([
      ["", ""],
      ["", ""],
    ]);
  });
});
