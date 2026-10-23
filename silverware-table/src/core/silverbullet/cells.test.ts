// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { isPlainCell, StaticCellRenderer } from "./cells.ts";

/** SilverBullet's markdownToHtml, as far as a cell needs: links, hashtags, bold, `${…}` (its number doubled) */
function fakeToHtml(markdown: string): string {
  const cell = (text: string) =>
    text
      .replace(/\[\[([^\]]+)\]\]/g, '<a class="wiki-link" data-ref="$1">$1</a>')
      .replace(/#(\w+)/g, '<a class="hashtag sb-hashtag" data-ref="tag:$1">#$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\$\{(\d+)\}/g, (_, n) => `<span class="p">${Number(n) * 2}</span>`);
  const [header, , ...rows] = markdown.split("\n");
  const cells = (line: string) => line.slice(2, -2).trim();
  return `<table><thead><tr><td>${cells(header!)}</td></tr></thead>${rows.map((r) => `<tr><td>${cell(cells(r))}</td></tr>`).join("")}</table>`;
}

const htmlOf = (node: Node) => {
  const div = document.createElement("div");
  div.append(node.cloneNode(true));
  return div.innerHTML;
};

describe("isPlainCell", () => {
  it("takes text with nothing to render as plain, anything markdown or SilverBullet reads not", () => {
    for (const plain of ["Pear", "12.99", "2025-11-06", "Pražská 12, Brno", "", "50 %", "a (b) / c - d + e = f", "'quoted' \"too\""]) {
      expect(isPlainCell(plain), plain).toBe(true);
    }
    for (const marked of ["[[index]]", "#tag", "**bold**", "*em*", "_em_", "~~gone~~", "`code`", "${1+2}", "a \\| b", "&amp;", "<b>x</b>", "x <meta formulas.f='=1'>", "https://example.com", ":smile:", "![img](x.png)", "@mention", "a!"]) {
      expect(isPlainCell(marked), marked).toBe(false);
    }
  });
});

describe("StaticCellRenderer", () => {
  it("gives plain cells at once and renders the others in one call, each a row of a table of their own", async () => {
    const toHtml = vi.fn(fakeToHtml);
    const renderer = new StaticCellRenderer(document, toHtml);
    const { now, later } = renderer.render(["Pear", "[[index]] **x**", "#fruit", "12"]);
    // At once: plain cells as they are, the others as their text meanwhile
    expect(now.map((n) => n.textContent)).toEqual(["Pear", "[[index]] **x**", "#fruit", "12"]);
    const rendered = await later;
    expect(toHtml).toHaveBeenCalledTimes(1);
    expect(toHtml.mock.calls[0]![0]).toBe("| cell |\n| --- |\n| [[index]] **x** |\n| #fruit |");
    expect([...rendered.keys()]).toEqual([1, 2]);
    expect(htmlOf(rendered.get(1)!)).toBe('<a class="wiki-link" data-ref="index">index</a> <strong>x</strong>');
    expect(htmlOf(rendered.get(2)!)).toBe('<a class="hashtag sb-hashtag" data-ref="tag:fruit">#fruit</a>');
  });

  it("keeps what it rendered by the cell's text, and gives it at once the next time; a ${…} always anew", async () => {
    const toHtml = vi.fn(fakeToHtml);
    const renderer = new StaticCellRenderer(document, toHtml);
    await renderer.render(["#fruit", "${2}"]).later;
    const again = renderer.render(["#fruit", "${2}"]);
    expect(htmlOf(again.now[0]!)).toBe('<a class="hashtag sb-hashtag" data-ref="tag:fruit">#fruit</a>');
    expect(again.now[1]!.textContent).toBe("${2}");
    expect(htmlOf((await again.later).get(1)!)).toBe('<span class="p">4</span>');
    // The second time only the ${…} went to SilverBullet
    expect(toHtml).toHaveBeenCalledTimes(2);
    expect(toHtml.mock.calls[1]![0]).toBe("| cell |\n| --- |\n| ${2} |");
    expect(renderer.refreshesAfterIndex("${2}")).toBe(true);
    expect(renderer.refreshesAfterIndex("#fruit")).toBe(false);
  });

  it("gives each cell its own content when one holds a table of its own (a query's result)", async () => {
    // As SilverBullet renders a ${query[[…]]}: a table inside the cell
    const toHtml = () =>
      "<table><thead><tr><td>cell</td></tr></thead><tr><td><table><tr><td>row a</td></tr><tr><td>row b</td></tr></table></td></tr><tr><td><strong>second</strong></td></tr></table>";
    const { later } = new StaticCellRenderer(document, toHtml).render(["${query}", "**second**"]);
    const rendered = await later;
    expect(rendered.get(0)!.textContent).toBe("row arow b");
    expect(htmlOf(rendered.get(1)!)).toBe("<strong>second</strong>");
  });

  it("calls SilverBullet for nothing when every cell is plain", async () => {
    const toHtml = vi.fn(fakeToHtml);
    const { later } = new StaticCellRenderer(document, toHtml).render(["Pear", "3", ""]);
    expect((await later).size).toBe(0);
    expect(toHtml).not.toHaveBeenCalled();
  });

  it("leaves the cells as their text when SilverBullet cannot render them", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const renderer = new StaticCellRenderer(document, () => Promise.reject(new Error("no syscall")));
      expect((await renderer.render(["#a"]).later).size).toBe(0);
      expect((await renderer.render(["#b"]).later).size).toBe(0);
      // Said once
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});
