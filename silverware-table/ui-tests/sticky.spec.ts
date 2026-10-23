// The header held at the top of the page's view as a long table scrolls past
import { expect, table, test } from "./playground.ts";

test.describe("Rows pinned to the bottom", () => {
  test("a scroller with a bottom padding (as SilverBullet's, to scroll past the end): the row at the table's bottom while it is in view", async ({ page }) => {
    await page.addStyleTag({ content: ".cm-scroller { padding-bottom: 360px !important; }" });
    // Low in the view: within its bottom 360px, which the padding takes from sticky positioning
    const filler = Array.from({ length: 6 }, (_, i) => `Line ${i + 1} of text above the table.`).join("\n\n");
    await page.locator("#source").fill(`# T\n\n${filler}\n\n| Customer | Bags |\n|---|--:|\n| A | 6 |\n| B | 2 |\n| Total | 8 |\n| <meta pin-bottom='1'> |\n\nMore text.\n`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(3);
    const at = await table(page).evaluate((w) => {
      const t = w.querySelector("table")!;
      return { table: t.getBoundingClientRect().bottom, foot: t.tFoot!.getBoundingClientRect().bottom, view: document.querySelector(".cm-scroller")!.getBoundingClientRect().bottom };
    });
    // (The table wholly in view, its bottom within the view's bottom 360px)
    expect(at.table).toBeLessThan(at.view);
    expect(at.table).toBeGreaterThan(at.view - 360);
    expect(Math.round(at.foot)).toBe(Math.round(at.table));
  });
});

test.describe("The held header", () => {
  test("a table near the page's top: its header where the table starts, the page not scrolled, its first row not covered", async ({ page }) => {
    await page.locator("#source").fill("Intro\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 |\n\nText under.\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(2);
    const at = await table(page).evaluate((w) => {
      const r = (e: Element) => e.getBoundingClientRect();
      return { view: r(document.querySelector(".cm-scroller")!).top, table: r(w.querySelector("table")!).top, head: r(w.querySelector("thead")!), row: r(w.querySelector("tbody tr")!).top };
    });
    // (Nearer the view's top than the room for the toolbar: the case)
    expect(at.table - at.view).toBeLessThan(66);
    expect(Math.round(at.head.top)).toBe(Math.round(at.table));
    expect(at.row).toBeGreaterThanOrEqual(at.head.bottom - 0.5);
    // The toolbar above the header (less of a gap, the room being small), not over its names
    await table(page).locator("tbody tr td").first().hover();
    const bar = (await page.locator(".swt-bar.swt-visible").boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(at.head.top + 0.5);
    expect(bar.y).toBeGreaterThanOrEqual(at.view - 0.5);
  });

  test("the room above it is covered whole in the page's color: no row shows between the view's top and the header", async ({ page }) => {
    const rows = Array.from({ length: 60 }, (_, i) => `| Row ${i + 1} | ${i * 3} |`).join("\n");
    await page.locator("#source").fill(`# Test\n\nText above.\n\n| Name | Qty |\n|---|---|\n${rows}\n\nText below.\n`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(60);
    await page.evaluate(() => (document.querySelector(".cm-scroller")!.scrollTop = 913));
    await expect(table(page).locator("thead")).toHaveClass(/swt-stuck/);
    // The view's top, the header's: the shadows its top cells cast (each as tall as the cell, moved up) reach from
    // the one to the other without a gap
    const covered = await table(page)
      .locator("thead tr")
      .first()
      .locator("> td")
      .first()
      .evaluate((td) => {
        const view = document.querySelector(".cm-scroller")!.getBoundingClientRect().top;
        const cell = td.getBoundingClientRect();
        const ups = Array.from(getComputedStyle(td).boxShadow.matchAll(/(-?\d+(?:\.\d+)?)px (-?\d+(?:\.\d+)?)px 0px 0px/g), (m) => -Number(m[2]));
        // From the header's top up: each shadow covers [top - up, top - up + height]
        let reach = 0;
        for (const up of ups.sort((a, b) => a - b)) if (up - cell.height <= reach) reach = Math.max(reach, up);
        return { gap: Math.round(cell.top - view), reach };
      });
    expect(covered.reach).toBeGreaterThanOrEqual(covered.gap);
  });
});
