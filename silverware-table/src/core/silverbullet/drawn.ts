// A table of the page drawn by Silverware Table itself (the sheet), in the
// form SilverBullet renders its tables in (a `.sb-table-widget` holding a
// `<table>` with `data-pos`, the header in `thead`, alignment by class, the
// metadata row a cell holding a `<meta>`): the core finds it and enhances it as
// one of SilverBullet's, and it stands for the page's table of its key while it
// is shown (DRAWN_CLASS). Its cells are rendered by a cell renderer
// (cells.ts); the table is handed over whole, once every cell is rendered, so
// nothing is filled in later under what the core and the modules put into it.
import { DRAWN_CLASS } from "../../dom.ts";
import { parseTable } from "../../markdown.ts";
import type { CellRenderer } from "./cells.ts";

/** Draws the table of `source`, which starts at `hint` in the page, with its cells rendered */
export async function drawTable(doc: Document, source: string, hint: number, renderer: CellRenderer): Promise<HTMLElement> {
  const model = parseTable(source);
  // Where each line of the table starts in the page (header, delimiter, body rows, the metadata row)
  const lineStarts: number[] = [];
  let offset = hint;
  for (const line of source.split("\n")) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  // SilverBullet leaves out empty header cells
  const header = model.rows[0]?.cells.map((cell, column) => ({ cell, column })).filter((h) => h.cell.trim() !== "") ?? [];
  const body = model.rows.slice(1);
  const texts = [...header.map((h) => h.cell), ...body.flatMap((row) => row.cells)];
  const rendered = renderer.render(texts);
  const later = await rendered.later;
  const content = (i: number) => later.get(i) ?? rendered.now[i]!;

  const widget = doc.createElement("span");
  widget.className = `sb-table-widget ${DRAWN_CLASS}`;
  const table = doc.createElement("table");
  table.dataset.pos = String(hint);
  const cell = (node: Node, column: number) => {
    const td = doc.createElement("td");
    const align = model.align[column];
    if (align) td.classList.add(`sb-table-align-${align}`);
    td.append(node);
    return td;
  };
  const thead = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  headRow.dataset.pos = String(lineStarts[0]);
  header.forEach((h, i) => headRow.append(cell(content(i), h.column)));
  thead.append(headRow);
  const tbody = doc.createElement("tbody");
  let index = header.length;
  body.forEach((row, r) => {
    const tr = doc.createElement("tr");
    // After the header's line and the delimiter's
    tr.dataset.pos = String(lineStarts[r + 2]);
    row.cells.forEach((_, column) => tr.append(cell(content(index++), column)));
    tbody.append(tr);
  });
  if (model.meta) {
    // As SilverBullet shows it: one cell holding the <meta>, whose attributes are the metadata
    const tr = doc.createElement("tr");
    // Its line after the header's, the delimiter's and the body rows'
    tr.dataset.pos = String(lineStarts[model.rows.length + 1]);
    const meta = doc.createElement("meta");
    for (const [name, value] of Object.entries(model.meta)) meta.setAttribute(name, value);
    const td = doc.createElement("td");
    td.append(meta);
    tr.append(td);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  widget.append(table);
  return widget;
}
