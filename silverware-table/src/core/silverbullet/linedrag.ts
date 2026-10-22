// Rows (columns) dragged in SilverBullet's rendered tables (TableHost.dragLines):
// a copy of them follows the pointer, the others move aside to show where
// they go, and the page (a wide table's box) scrolls near its edges. What the
// copy looks like and where the lines were is measured here, from the cells.
import { WIDGET_SELECTOR } from "../../dom.ts";
import type { LineDrag, WidgetInfo } from "../feature.ts";
import { scrollNearEdge } from "../geometry.ts";
import type { TableRows } from "../rows.ts";

export type LineDragContext = {
  readonly doc: Document;
  readonly rows: TableRows;
  floating(className: string): HTMLElement;
  place(element: HTMLElement, left: number, top: number): void;
  rowNeeded(info: WidgetInfo, row: HTMLTableRowElement): void;
  holdInDocument(info: WidgetInfo, row: HTMLTableRowElement | undefined): void;
};

/**
 * A block of rows (columns) dragged from where it was pressed (`pressedAt`,
 * its y or x): the copy keeps that point under the pointer; the lines it has
 * passed make room for it; `blockTo` says where the block may go
 */
export function dragLines(
  context: LineDragContext,
  info: WidgetInfo,
  axis: "row" | "column",
  block: { readonly first: number; readonly last: number },
  pressedAt: number,
  blockTo: (asked: number) => number,
): LineDrag | undefined {
  const { doc, rows: tableRows } = context;
  const widget = info.table.closest<HTMLElement>(WIDGET_SELECTOR);
  if (!widget) return undefined;
  const from = block.first;
  const count = block.last - block.first + 1;
  const table = info.table;
  const header = table.rows[0]!;
  const rows = [header, ...tableRows.bodyRows(info)];
  // The cells of each row (column), by its row of the markdown (its column), and its size
  const items =
    axis === "row" ? rows.slice(1).map((tr) => Array.from(tr.cells)) : Array.from(header.cells).map((_, c) => rows.flatMap((tr) => tr.cells[c] ?? []));
  const index = axis === "row" ? from - 1 : from;
  const lines = items.slice(index, index + count);
  const carried = lines.flat();
  if (!carried.length) return undefined;
  // The block's first row stays in the document while the table scrolls (a large table keeps only the rows in view
  // there, and moves its window to each row asked for: only this one is; the others' places are estimated)
  const carriedRow = axis === "row" ? (lines[0]?.[0]?.parentElement as HTMLTableRowElement | undefined) : undefined;
  if (carriedRow) {
    context.rowNeeded(info, carriedRow);
    context.holdInDocument(info, carriedRow);
  }
  // Where each row (column) was, in the table's own coordinates: the page or
  // the table's box may scroll while dragging. Rows out of the document (a
  // large table's) are where rows of their size would be, after those in it.
  const tableAt = () => {
    const r = table.getBoundingClientRect();
    return axis === "row" ? r.top : r.left;
  };
  const origin = tableAt();
  const measured = items.map((cells) => {
    const cell = cells[0];
    if (!cell?.isConnected) return undefined;
    const r = cell.getBoundingClientRect();
    return axis === "row" ? { start: r.top - origin, size: r.height } : { start: r.left - origin, size: r.width };
  });
  const known = measured.filter((m): m is { start: number; size: number } => !!m);
  const typical = known.length ? known.reduce((sum, m) => sum + m.size, 0) / known.length : 0;
  const firstKnown = measured.findIndex((m) => m);
  const lastKnown = measured.findLastIndex((m) => m);
  const places = measured.map((m, i) => {
    if (m) return m;
    if (firstKnown < 0) return { start: i * typical, size: typical };
    if (i < firstKnown) return { start: measured[firstKnown]!.start - (firstKnown - i) * typical, size: typical };
    const last = measured[lastKnown]!;
    return { start: last.start + last.size + (i - lastKnown - 1) * typical, size: typical };
  });
  const carriedSize = places.slice(index, index + count).reduce((sum, p) => sum + p.size, 0);
  const ghost = ghostOf(context, axis, lines);
  const start = carried[0]!.getBoundingClientRect();
  carried.forEach((el) => el.classList.add("swt-dragged"));
  doc.body.classList.add("swt-dragging");
  let to = from;
  // Where the press was on the block: the copy keeps that point under the pointer (taken at the press, not after the drag's threshold)
  const grab = pressedAt - (axis === "row" ? start.top : start.left);

  return {
    move: (x, y) => {
      const pointer = axis === "row" ? y : x;
      if (axis === "row") context.place(ghost, start.left, pointer - grab);
      else context.place(ghost, pointer - grab, start.top);
      // The lines the copy has passed, in the places they had (in the table, as it is scrolled now): going down (right),
      // those after the block whose middle its end is past; going up (left), those before it whose middle its start is past
      const top = pointer - grab - tableAt();
      const bottom = top + carriedSize;
      const end = index + count - 1;
      const middleOf = (i: number) => places[i]!.start + places[i]!.size / 2;
      let passed = 0;
      for (let i = end + 1; i < places.length && middleOf(i) < bottom; i++) passed++;
      if (passed === 0) for (let i = index - 1; i >= 0 && middleOf(i) > top; i--) passed--;
      to = blockTo(from + passed);
      const target = axis === "row" ? to - 1 : to;
      items.forEach((cells, i) => {
        // Those the block passes over make room for it: up (left) when it goes down (right), else down
        const shift = i > end && i <= target + count - 1 ? -carriedSize : i < index && i >= target ? carriedSize : 0;
        for (const cell of cells) cell.style.transform = shift ? (axis === "row" ? `translateY(${shift}px)` : `translateX(${shift}px)`) : "";
      });
      scrollNearEdge(widget, x, y, axis === "column");
    },
    finish: (commit) => {
      for (const cells of items) for (const cell of cells) cell.style.transform = "";
      carried.forEach((el) => el.classList.remove("swt-dragged"));
      ghost.remove();
      doc.body.classList.remove("swt-dragging");
      if (carriedRow) context.holdInDocument(info, undefined);
      return commit ? to : undefined;
    },
  };
}

/**
 * The copy that follows the pointer: the rows' (columns') cells cloned with
 * their sizes and looks, as it is outside the table that styles them
 */
function ghostOf(context: LineDragContext, axis: "row" | "column", lines: readonly (readonly HTMLTableCellElement[])[]): HTMLElement {
  const { doc } = context;
  const ghost = context.floating("swt-drag-ghost swt-visible");
  const table = doc.createElement("table");
  const look = (cell: HTMLTableCellElement) => {
    const copy = cell.cloneNode(true) as HTMLTableCellElement;
    copy.classList.remove("swt-dragged", "swt-selected", "swt-handle-hover");
    const style = doc.defaultView!.getComputedStyle(cell);
    const r = cell.getBoundingClientRect();
    for (const name of ["font", "color", "background-color", "padding", "border", "text-align", "vertical-align", "white-space"]) {
      copy.style.setProperty(name, style.getPropertyValue(name));
    }
    Object.assign(copy.style, { boxSizing: "border-box", width: `${r.width}px`, height: `${r.height}px`, transform: "" });
    return copy;
  };
  if (axis === "row") {
    for (const cells of lines) {
      const tr = doc.createElement("tr");
      tr.append(...cells.map(look));
      table.append(tr);
    }
  } else {
    // A column's cells run down: each row of the copy takes one from each column
    const height = Math.max(...lines.map((cells) => cells.length));
    for (let r = 0; r < height; r++) {
      const tr = doc.createElement("tr");
      tr.append(...lines.flatMap((cells) => (cells[r] ? [look(cells[r]!)] : [])));
      table.append(tr);
    }
  }
  ghost.append(table);
  return ghost;
}
