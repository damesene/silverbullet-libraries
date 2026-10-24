// The header held at the top of the page's view as a long table scrolls past
import type { Page } from "@playwright/test";
import { expect, table, tableIcon, test } from "./playground.ts";

test.describe("Rows pinned to the bottom", () => {
  test("a scroller with a bottom padding (as SilverBullet's, to scroll past the end): the row at the table's bottom while it is in view", async ({ page }) => {
    await page.addStyleTag({ content: ".cm-scroller { padding-bottom: 360px !important; }" });
    // Low in the view: within its bottom 360px, which the padding takes from sticky positioning
    const filler = Array.from({ length: 6 }, (_, i) => `Line ${i + 1} of text above the table.`).join("\n\n");
    await page.locator("#source").fill(`# T\n\n${filler}\n\n| Customer | Bags |\n|---|--:|\n| A | 6 |\n| B | 2 |\n| Total | 8 |\n| <meta core.table core.pin-bottom='1'> |\n\nMore text.\n`);
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

test.describe("The held header and the rows pinned to the bottom", () => {
  test("the table's end going up past the view's top: the header gives way to the bottom rows, never under them", async ({ page }) => {
    const rows = Array.from({ length: 6 }, (_, i) => `| Row ${i + 1} | ${i} |`).join("\n");
    const filler = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
    await page.locator("#source").fill(`# T\n\n${filler}\n\n| Name | Qty |\n|---|---|\n${rows}\n| Total | 15 |\n| <meta core.table core.pin-bottom='1'> |\n\n${filler}\n`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(7);
    // The table's top at the view's top, then up by steps until it is gone
    const start = await table(page).evaluate((w) => {
      const scroller = document.querySelector(".cm-scroller")!;
      return scroller.scrollTop + w.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    });
    for (let step = 0; step < 14; step++) {
      await page.evaluate((top) => (document.querySelector(".cm-scroller")!.scrollTop = top), start + step * 25);
      await page.waitForTimeout(80);
      const at = await table(page).evaluate((w) => {
        const t = w.querySelector("table")!;
        return { head: t.tHead!.getBoundingClientRect().bottom, foot: t.tFoot!.getBoundingClientRect().top };
      });
      expect(at.head).toBeLessThanOrEqual(at.foot + 0.5);
    }
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
    const view = await page.locator(".cm-scroller").evaluate((s) => s.getBoundingClientRect().top);
    await expectCovered(page, view);
  });

  test("full screen, a theme collapsing the table's borders: no row shows above the held header", async ({ page }) => {
    const rows = Array.from({ length: 60 }, (_, i) => `| Row ${i + 1} | ${i * 3} |`).join("\n");
    await page.locator("#source").fill(`# Test\n\n| Name | Qty |\n|---|---|\n${rows}\n`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(60);
    // (border-collapse: collapse, as a theme of the user's has it: the browser paints no box-shadow of a cell then)
    await page.addStyleTag({ content: ".sb-table-widget table { border-collapse: collapse; }" });
    await table(page).locator("tbody tr td").first().hover();
    await (await tableIcon(page, "Full screen")).click();
    const box = page.locator(".sb-table-widget.swt-over-window");
    await expect(box).toBeVisible();
    await box.evaluate((b) => (b.scrollTop = 600));
    const top = await box.evaluate((b) => b.getBoundingClientRect().top);
    await expectCovered(page, top);
  });
});

// From `top` down to the held header's top (but the columns' letters, which are drawn there), the page's color
// alone: read from the pixels, as what failed was the browser not painting a cover it had
async function expectCovered(page: Page, top: number): Promise<void> {
  const head = (await table(page).locator("thead").boundingBox())!;
  const first = (await table(page).locator("thead tr").first().locator("> td").first().boundingBox())!;
  // The rows' band between the view's top and the letters (the letters sit just above the header)
  const band = { x: Math.ceil(first.x + 2), y: Math.ceil(top + 1), width: Math.floor(head.width - 4), height: Math.floor(head.y - top - 30) };
  expect(band.height).toBeGreaterThan(10);
  const shot = (await page.screenshot({ clip: band })).toString("base64");
  const colors = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, img.width, img.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < px.length; i += 4) seen.add((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!);
    return seen.size;
  }, shot);
  expect(colors).toBe(1);
}
