// Pinned rows and columns are kept at the edges of the table: the first `top`
// and last `bottom` body rows, the first `left` and last `right` columns. These
// rules keep them there through every edit and say how the counts change.
// Rows are indexes into a table's rows (0 is the header), `rows` their count;
// columns are 0-based, `columns` their count.
import type { Pins } from "./view.ts";

export type RowZone = "top" | "bottom";
export type ColumnZone = "left" | "right";

export function rowZone(pins: Pins, rows: number, row: number): RowZone | undefined {
  if (row >= 1 && row <= pins.top) return "top";
  if (row >= rows - pins.bottom && row <= rows - 1) return "bottom";
  return undefined;
}

export function columnZone(pins: Pins, columns: number, column: number): ColumnZone | undefined {
  if (column >= 0 && column < pins.left) return "left";
  if (column >= columns - pins.right && column < columns) return "right";
  return undefined;
}

/** Where a row may be moved to: within its zone, or between the zones */
export function clampRowMove(pins: Pins, rows: number, from: number, to: number): number {
  const zone = rowZone(pins, rows, from);
  const [min, max] =
    zone === "top" ? [1, pins.top] : zone === "bottom" ? [rows - pins.bottom, rows - 1] : [pins.top + 1, rows - 1 - pins.bottom];
  return Math.max(min, Math.min(to, max));
}

export function clampColumnMove(pins: Pins, columns: number, from: number, to: number): number {
  const zone = columnZone(pins, columns, from);
  const [min, max] =
    zone === "left"
      ? [0, pins.left - 1]
      : zone === "right"
        ? [columns - pins.right, columns - 1]
        : [pins.left, columns - 1 - pins.right];
  return Math.max(min, Math.min(to, max));
}

/**
 * A new row asked for at index `at` (insertRow): never above the first row
 * pinned to the top nor below the last row pinned to the bottom, which keep the
 * edges. Inside a zone the new row is pinned too, at a zone's inner edge it is not.
 */
export function insertRowAt(pins: Pins, rows: number, at: number): { at: number; pins: Pins } {
  let index = Math.max(1, Math.min(at, rows));
  if (pins.top > 0) index = Math.max(index, 2);
  if (pins.bottom > 0) index = Math.min(index, rows - 1);
  return {
    at: index,
    pins: {
      ...pins,
      top: pins.top + (index <= pins.top ? 1 : 0),
      bottom: pins.bottom + (pins.bottom > 0 && index > rows - pins.bottom ? 1 : 0),
    },
  };
}

/** Where a row added at the end goes: above the rows pinned to the bottom */
export function appendRowAt(pins: Pins, rows: number): number {
  return rows - pins.bottom;
}

export function deleteRowPins(pins: Pins, rows: number, row: number): Pins {
  const zone = rowZone(pins, rows, row);
  return { ...pins, top: pins.top - (zone === "top" ? 1 : 0), bottom: pins.bottom - (zone === "bottom" ? 1 : 0) };
}

/** A new column asked for at index `at` (insertColumn), by the same rules as rows */
export function insertColumnAt(pins: Pins, columns: number, at: number): { at: number; pins: Pins } {
  let index = Math.max(0, Math.min(at, columns));
  if (pins.left > 0) index = Math.max(index, 1);
  if (pins.right > 0) index = Math.min(index, columns - 1);
  return {
    at: index,
    pins: {
      ...pins,
      left: pins.left + (index < pins.left ? 1 : 0),
      right: pins.right + (pins.right > 0 && index > columns - pins.right ? 1 : 0),
    },
  };
}

/** Where a column added at the end goes: left of the columns pinned to the right */
export function appendColumnAt(pins: Pins, columns: number): number {
  return columns - pins.right;
}

export function deleteColumnPins(pins: Pins, columns: number, column: number): Pins {
  const zone = columnZone(pins, columns, column);
  return { ...pins, left: pins.left - (zone === "left" ? 1 : 0), right: pins.right - (zone === "right" ? 1 : 0) };
}

/**
 * Pinning (or, with undefined, unpinning) a row: where it moves to and the new
 * counts. A row pinned joins its zone on the inner side; a row unpinned leaves
 * its zone on the inner side, becoming the first (or last) unpinned row.
 */
export function pinRow(pins: Pins, rows: number, row: number, pin: RowZone | undefined): { to: number; pins: Pins } {
  const zone = rowZone(pins, rows, row);
  if (zone === pin) return { to: row, pins };
  // Out of its zone first
  let p = pins;
  let to = row;
  if (zone === "top") {
    to = pins.top;
    p = { ...p, top: p.top - 1 };
  } else if (zone === "bottom") {
    to = rows - pins.bottom;
    p = { ...p, bottom: p.bottom - 1 };
  }
  if (pin === "top") return { to: p.top + 1, pins: { ...p, top: p.top + 1 } };
  if (pin === "bottom") return { to: rows - 1 - p.bottom, pins: { ...p, bottom: p.bottom + 1 } };
  return { to, pins: p };
}

export function pinColumn(
  pins: Pins,
  columns: number,
  column: number,
  pin: ColumnZone | undefined,
): { to: number; pins: Pins } {
  const zone = columnZone(pins, columns, column);
  if (zone === pin) return { to: column, pins };
  let p = pins;
  let to = column;
  if (zone === "left") {
    to = pins.left - 1;
    p = { ...p, left: p.left - 1 };
  } else if (zone === "right") {
    to = columns - pins.right;
    p = { ...p, right: p.right - 1 };
  }
  if (pin === "left") return { to: p.left, pins: { ...p, left: p.left + 1 } };
  if (pin === "right") return { to: columns - 1 - p.right, pins: { ...p, right: p.right + 1 } };
  return { to, pins: p };
}
