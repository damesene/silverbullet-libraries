// Filters: the filter row's fields and the bubble under the one typed in, a column's filter on its own under its header
import type { Page } from "@playwright/test";
import { bodyRows, expect, header, hoverCell, menu, test } from "./playground.ts";

const PAGE = ["| Item | Status |", "|---|---|", "| Pear | open |", "| Fig | done |", "| Kiwi | open |", "| Plum | blocked |", ""].join("\n");

async function load(page: Page): Promise<void> {
  await page.locator("#source").fill(PAGE);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(bodyRows(page)).toHaveCount(4);
}

// The rows shown (those a filter hides stay in the document, hidden)
const items = (page: Page) => page.locator(".sb-table-widget.swt-table tr[data-swt-row]:not(.swt-hidden) > td:first-child");
const bubble = (page: Page) => page.locator(".swt-filter-bubble.swt-visible");

test.describe("Filters", () => {
  test("typed into the filter row, the rows follow each key, the field keeps the focus, the bubble under it ticks values", async ({ page }) => {
    await load(page);
    await hoverCell(page, header(page, 0));
    await page.locator('.swt-bar button[aria-label="Filter"]').click();
    const field = page.locator(".swt-filter-row input.swt-filter").nth(1);
    await field.click();
    await page.keyboard.type("op");
    await expect(items(page)).toHaveText(["Pear", "Kiwi"]);
    // The view applied after each key left the field where it was, focused
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("op");
    // Under the field: what it understands and the column's values to tick
    await expect(bubble(page)).toBeVisible();
    const fieldBox = (await field.boundingBox())!;
    expect((await bubble(page).boundingBox())!.y).toBeGreaterThan(fieldBox.y + fieldBox.height - 1);
    await bubble(page).locator(".swt-filter-value", { hasText: "done" }).locator("input").check();
    await expect(field).toHaveValue("=done");
    await expect(items(page)).toHaveText(["Fig"]);
    await expect(field).toBeFocused();
    // Left: the bubble goes, the filter stays; the header marks its column
    await page.mouse.click(5, 5);
    await expect(bubble(page)).toHaveCount(0);
    await expect(items(page)).toHaveText(["Fig"]);
    await expect(header(page, 1)).toHaveClass(/swt-filtered/);
  });

  test("a column's filter from its menu: a field under its header, nothing moved in the table", async ({ page }) => {
    await load(page);
    await header(page, 1).click({ button: "right" });
    await menu(page).locator('.swt-segment[aria-label="Filter this column"]').click();
    const field = page.locator(".swt-filter-popover input.swt-filter");
    await expect(field).toBeFocused();
    const head = (await header(page, 1).boundingBox())!;
    const opened = (await bubble(page).boundingBox())!;
    expect(opened.y).toBeGreaterThan(head.y + head.height - 1);
    await page.keyboard.type("=open");
    await expect(items(page)).toHaveText(["Pear", "Kiwi"]);
    // The view applied as it filtered left the bubble where it was under its header (the header may have moved: rows hidden)
    const headNow = (await header(page, 1).boundingBox())!;
    expect(Math.abs((await bubble(page).boundingBox())!.x - headNow.x - (opened.x - head.x))).toBeLessThan(1);
    await expect(page.locator(".swt-filter-row")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(bubble(page)).toHaveCount(0);
    await expect(items(page)).toHaveText(["Pear", "Kiwi"]);
  });

});
