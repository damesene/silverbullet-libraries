// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { positionHint } from "../../dom.ts";
import { StaticCellRenderer } from "./cells.ts";
import { drawTable } from "./drawn.ts";
import { renderedMeta } from "./adapter.ts";

describe("drawTable", () => {
  it("draws a table in SilverBullet's form: its position, rows' positions, alignment, the metadata row's attributes", async () => {
    const source = "| Item | Qty |   |\n|---|--:|---|\n| Pear | 3 | x |\n| #fig | 5 | |\n| <meta core.table core.name='fruit' themes.name='plain'> |";
    // Cells with something to render come back as SilverBullet would give them (here: the hashtag as a link)
    const renderer = new StaticCellRenderer(document, (md) => {
      const rows = md.split("\n").slice(2).map((line) => line.slice(2, -2).trim().replace(/#(\w+)/, '<a class="hashtag" data-ref="tag:$1">#$1</a>'));
      return `<table><thead><tr><td>cell</td></tr></thead>${rows.map((r) => `<tr><td>${r}</td></tr>`).join("")}</table>`;
    });
    const widget = await drawTable(document, source, 40, renderer);
    expect(widget.classList.contains("sb-table-widget")).toBe(true);
    expect(widget.classList.contains("swt-drawn")).toBe(true);
    const table = widget.querySelector("table")!;
    expect(positionHint(table)).toBe(40);
    // The header without its empty cell, as SilverBullet renders it; each row where its line starts
    const rows = Array.from(table.rows);
    expect(Array.from(rows[0]!.cells, (c) => c.textContent)).toEqual(["Item", "Qty"]);
    const starts = source.split("\n").reduce<number[]>((at, line, i) => [...at, i === 0 ? 40 : at[i - 1]! + source.split("\n")[i - 1]!.length + 1], []);
    // Header, then (past the delimiter's line) the body rows and the metadata row
    expect(rows.map((tr) => Number(tr.dataset.pos))).toEqual([starts[0], starts[2], starts[3], starts[4]]);
    expect(rows[1]!.cells[1]!.classList.contains("sb-table-align-right")).toBe(true);
    expect(rows[2]!.cells[0]!.querySelector("a.hashtag")?.textContent).toBe("#fig");
    expect(renderedMeta(rows)).toEqual({ "core.name": "fruit", "themes.name": "plain" });
  });
});
