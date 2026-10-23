// A named table's tab with its name at its top right corner (the tableLabels module), in the page and on the sheet
import type { Locator, Page } from "@playwright/test";
import { cell, expect, hoverCell, table, tableIcon, test } from "./playground.ts";

const filler = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
const PAGE =
  `# Test\n\n${filler}\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta core.table core.name='fruit' sheet.name='Plan' sheet.at='A1'> |\n\n` +
  `| City |\n|---|\n| Brno |\n\n| Code |\n|---|\n| X1 |\n| <meta core.table core.name='codes' sheet.name='Plan' sheet.at='A4'> |\n\n${filler}\n`;

const label = (page: Page, name: string): Locator => page.locator(".swt-table-label.swt-visible", { hasText: new RegExp(`^${name}$`) });
const labels = (page: Page): Locator => page.locator(".swt-table-label.swt-visible");

/** Whether the tab's bottom right corner is on the header's top right one (within a pixel: placed in whole pixels), and above it */
async function onCorner(tab: Locator, of: Locator): Promise<{ x: boolean; y: boolean; inside: boolean }> {
  const box = (await tab.boundingBox())!;
  const at = (await of.locator("table tr").first().boundingBox())!;
  const inside = await tab.evaluate((e) => e.classList.contains("swt-inside"));
  return { x: Math.abs(box.x + box.width - (at.x + at.width)) <= 1, y: Math.abs((inside ? box.y : box.y + box.height) - at.y) <= 1, inside };
}
const ON = { x: true, y: true, inside: false };

async function open(page: Page): Promise<void> {
  await page.locator("#source").fill(PAGE);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page, 2).locator("tr[data-swt-row]")).toHaveCount(1);
  await page.mouse.move(2, 2);
}

test.describe("Table labels", () => {
  test("a long table scrolled: the tab goes along with its header held at the view's top, above it", async ({ page }) => {
    const rows = Array.from({ length: 30 }, (_, i) => `| R${i} | ${i} |`).join("\n");
    await page.locator("#source").fill(`# T\n\nText.\n\n| Name | Qty |\n|---|---|\n${rows}\n| <meta core.table core.name='long'> |\n\nMore.\n`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(30);
    await page.mouse.move(2, 2);
    for (const top of [0, 80, 200, 500]) {
      await page.evaluate((top) => (document.querySelector(".cm-scroller")!.scrollTop = top), top);
      await expect.poll(() => onCorner(label(page, "long"), table(page))).toEqual(ON);
    }
  });

  test("a named table shows its name at its top right corner, an unnamed one none; hovered, its toolbar shows instead", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const scroller = document.querySelector(".cm-scroller")!;
      const t = document.querySelector(".sb-table-widget.swt-table")!;
      scroller.scrollTop += t.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 120;
    });
    await expect(labels(page)).toHaveText(["fruit", "codes"]);
    expect(await onCorner(label(page, "fruit"), table(page, 0))).toEqual(ON);
    await hoverCell(page, cell(page, 1, 0));
    await expect(labels(page)).toHaveText(["codes"]);
    await page.mouse.move(2, 2);
    await expect(label(page, "fruit")).toHaveCount(1);
    await expect(labels(page)).toHaveCount(2);
  });

  test("scrolling the page: the tab stays on its table's corner, and on its header held; it goes with the header", async ({ page }) => {
    await open(page);
    const scroll = (by: number) =>
      page.evaluate((by) => {
        const scroller = document.querySelector(".cm-scroller")!;
        const t = document.querySelector(".sb-table-widget.swt-table")!;
        scroller.scrollTop += t.getBoundingClientRect().top - scroller.getBoundingClientRect().top - by;
      }, by);
    for (const by of [300, 200, 80]) {
      await scroll(by);
      await expect.poll(() => onCorner(label(page, "fruit"), table(page, 0))).toEqual(ON);
    }
    // Its top above the view's: on its header held
    await scroll(-20);
    await expect.poll(() => onCorner(label(page, "fruit"), table(page, 0))).toEqual(ON);
    // Scrolled past: the header gone, the tab too
    await scroll(-400);
    await expect(label(page, "fruit")).toHaveCount(0);
  });

  test("on the sheet: each named table's tab, over the columns' letters for one on the first row; it follows the board's scroll", async ({ page }) => {
    await open(page);
    await hoverCell(page, cell(page, 1, 0));
    await (await tableIcon(page, "Sheet view")).click();
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    await expect(drawn).toHaveCount(2);
    await page.mouse.move(2, 2);
    await expect(labels(page)).toHaveText(["fruit", "codes"]);
    const first = drawn.filter({ hasText: "Pear" });
    expect(await onCorner(label(page, "fruit"), first)).toEqual(ON);
    // The board scrolled down a little: the tabs move with their tables
    await page.evaluate(() => (document.querySelector(".swt-sheet-board")!.scrollTop = 20));
    const second = drawn.filter({ hasText: "X1" });
    await expect.poll(() => onCorner(label(page, "codes"), second)).toEqual(ON);
    // The first table's top scrolled out of the grid: its tab on its header, held at the board's top
    await expect.poll(() => onCorner(label(page, "fruit"), first)).toEqual(ON);
  });
});
