// The cells of a table Silverware Table draws itself (the sheet), rendered as
// SilverBullet renders its tables' cells (docs/silverware-table-sheets.md,
// "Cells of a table the sheet draws"). Behind one interface, so another
// renderer (live, never evaluating, plain) can come beside it; which cells go
// to SilverBullet is the renderer's decision, not the drawing's.
//
// The static renderer: a plain cell (no character markdown or SilverBullet
// reads) is its text at once; a cell rendered before with the same text and no
// `${…}` comes from its cache at once; the others go to SilverBullet in one
// call per table (markdown.markdownToHtml with expand: `${…}` evaluated, its
// result static), each a row of a table of their own, as a cell is inline text
// (rendered alone, "# x" would be a heading).

import { renderedTableRows } from "../../dom.ts";

/** What a renderer gives for a table's cells */
export type RenderedCells = {
  // A node per cell, in their order, ready now (a cell still to render shows its text)
  readonly now: readonly Node[];
  // The cells rendered later, by their index; what draws the table puts a node in only
  // while its cell still shows the text it was rendered from (else it is dropped)
  readonly later: Promise<ReadonlyMap<number, Node>>;
};

export interface CellRenderer {
  /** A table's cells (their markdown, as in the table) to their content */
  render(cells: readonly string[]): RenderedCells;
  /** Nodes of cells no longer shown let go (a live renderer's; the static one keeps nothing) */
  release(nodes: readonly Node[]): void;
  /** Whether a cell is to be rendered again once the page is indexed (a `${…}`'s result may change) */
  refreshesAfterIndex(cell: string): boolean;
}

/** SilverBullet's markdown.markdownToHtml with expand, through the bridge */
export type MarkdownToHtml = (markdown: string) => string | Promise<string>;

// What a cell may hold to be shown as its text: letters, digits, spaces and
// punctuation markdown and SilverBullet leave alone. Anything else goes to
// SilverBullet: a mistake costs a call, never a cell shown as raw markdown.
const PLAIN_RE = /^[\p{L}\p{N}\p{Zs}.,;'"()?%/+\-=]*$/u;

/** Whether a cell's markdown shows as its text, with nothing to render */
export function isPlainCell(cell: string): boolean {
  return PLAIN_RE.test(cell);
}

// How many cells' HTML the cache keeps, the least used going first
const CACHE_LIMIT = 5000;

export class StaticCellRenderer implements CellRenderer {
  // A cell's markdown (no `${…}`) to the HTML SilverBullet made of it
  private readonly cache = new Map<string, string>();
  private failed = false;

  constructor(
    private readonly doc: Document,
    private readonly toHtml: MarkdownToHtml,
  ) {}

  render(cells: readonly string[]): RenderedCells {
    const queued: number[] = [];
    const now = cells.map((cell, i) => {
      const text = cell.trim();
      if (isPlainCell(text)) return this.doc.createTextNode(text);
      const cached = this.cached(text);
      if (cached !== undefined) return this.nodeOf(cached);
      queued.push(i);
      return this.doc.createTextNode(text);
    });
    return { now, later: queued.length ? this.renderLater(cells, queued) : Promise.resolve(new Map()) };
  }

  release(): void {}

  refreshesAfterIndex(cell: string): boolean {
    return cell.includes("${");
  }

  private async renderLater(cells: readonly string[], queued: readonly number[]): Promise<ReadonlyMap<number, Node>> {
    const texts = queued.map((i) => cells[i]!.trim());
    // A table of the cells, one per row (a header SilverBullet renders apart)
    const markdown = ["| cell |", "| --- |", ...texts.map((text) => `| ${text} |`)].join("\n");
    let html: string;
    try {
      html = await this.toHtml(markdown);
    } catch (e) {
      // Shown as their text; said once
      if (!this.failed) console.error("Silverware Table: SilverBullet could not render a table's cells", e);
      this.failed = true;
      return new Map();
    }
    const template = this.doc.createElement("template");
    template.innerHTML = html;
    const rows = renderedTableRows(template.content);
    const rendered = new Map<number, Node>();
    queued.forEach((index, i) => {
      const cell = rows[i]?.cells[0];
      if (!cell) return;
      const text = texts[i]!;
      if (!this.refreshesAfterIndex(text)) this.remember(text, cell.innerHTML);
      rendered.set(index, this.nodeOf(cell.innerHTML));
    });
    return rendered;
  }

  private cached(text: string): string | undefined {
    const html = this.cache.get(text);
    if (html === undefined) return undefined;
    // Used now: the last to go
    this.cache.delete(text);
    this.cache.set(text, html);
    return html;
  }

  private remember(text: string, html: string): void {
    this.cache.delete(text);
    this.cache.set(text, html);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
  }

  /** A cell's HTML as nodes of its own (one per use: a node is in one place) */
  private nodeOf(html: string): Node {
    const template = this.doc.createElement("template");
    template.innerHTML = html;
    return template.content;
  }
}
