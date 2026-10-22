// What the interaction tests share: the playground opened, its tables and
// cells, the page's markdown, and gestures Playwright has no single call for.
import { test as base, expect, type Locator, type Page } from "@playwright/test";

export { expect };

/**
 * Tests get `page` with the playground open on its sample page (each test has a
 * browser context of its own: nothing kept from another); an error in the page
 * fails the test
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator(".sb-table-widget.tp-table").first()).toBeVisible();
    await use(page);
    expect(errors, "errors in the page").toEqual([]);
  },
});

/** A table enhanced by Table Plus, by its place on the page (0: Fruit) */
export const table = (page: Page, index = 0): Locator => page.locator(".sb-table-widget.tp-table").nth(index);

/** A body cell by its row in the markdown (1 the first under the header) and its column */
export const cell = (page: Page, row: number, column: number, index = 0): Locator =>
  table(page, index).locator(`tr[data-tp-row="${row}"] > td`).nth(column);

/** A header cell */
export const header = (page: Page, column: number, index = 0): Locator => table(page, index).locator("table tr").first().locator("th, td").nth(column);

/** The body rows of a table shown */
export const bodyRows = (page: Page, index = 0): Locator => table(page, index).locator("tr[data-tp-row]");

/** The page's markdown, as the playground's editor has it */
export const markdown = (page: Page): Promise<string> => page.locator("#source").inputValue();

/** The open menu (Table Plus' own: the toolbar's, a cell's, a grip's) */
export const menu = (page: Page): Locator => page.locator(".tp-menu");

export const menuTitle = (page: Page): Locator => menu(page).locator(".tp-menu-title");

export async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not laid out");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A mouse drag from one element to another, in steps (Table Plus follows the moves) */
export async function drag(page: Page, from: Locator, to: Locator, { release = true } = {}): Promise<void> {
  const a = await center(from);
  const b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  if (release) await page.mouse.up();
}

/** The grips at a cell: hovered from another cell first, so they move there */
export async function hoverCell(page: Page, target: Locator): Promise<void> {
  await target.hover();
  await expect(page.locator(".tp-grip.tp-visible").first()).toBeVisible();
}

/** A touch held still on an element (a long press), through Chrome's touch events */
export async function longPress(page: Page, target: Locator, ms = 800): Promise<void> {
  const { x, y } = await center(target);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** A tap on an element */
export async function tap(page: Page, target: Locator): Promise<void> {
  const { x, y } = await center(target);
  await page.touchscreen.tap(x, y);
}
