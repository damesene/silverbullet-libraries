// What the interaction tests share: the playground opened, its tables and
// cells, the page's markdown, waiting for a table rendered anew, and gestures
// Playwright has no single call for. The playground bundles silverware-table/src
// (not the committed silverware-table.js) and keeps its page in localStorage only:
// each test's browser context starts from the sample page.
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { LONG_PRESS_MS } from "../src/core/press.ts";

export { expect };

/** Tests get `page` with the playground open on its sample page; an error in the page (thrown or logged) fails the test */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/");
    await expect(table(page)).toBeVisible();
    await use(page);
    expect(errors, "errors in the page").toEqual([]);
  },
});

/** A table enhanced by Silverware Table, by its place on the page (0: Fruit) */
export const table = (page: Page, index = 0): Locator => page.locator(".sb-table-widget.swt-table").nth(index);

/** A body cell by its row in the markdown (1 the first under the header) and its column */
export const cell = (page: Page, row: number, column: number, index = 0): Locator =>
  table(page, index).locator(`tr[data-swt-row="${row}"] > td`).nth(column);

/** A header cell */
export const header = (page: Page, column: number, index = 0): Locator => table(page, index).locator("table tr").first().locator("th, td").nth(column);

/** The body rows of a table shown */
export const bodyRows = (page: Page, index = 0): Locator => table(page, index).locator("tr[data-swt-row]");

/** A column's body cells as shown */
export const columnCells = (page: Page, column: number, index = 0): Locator => bodyRows(page, index).locator(`> td:nth-child(${column + 1})`);

/** The page's markdown, as the playground's editor has it */
export const markdown = (page: Page): Promise<string> => page.locator("#source").inputValue();

/** The open menu (Silverware Table's own: the toolbar's, a cell's, a grip's) */
export const menu = (page: Page): Locator => page.locator(".swt-menu");

export const menuTitle = (page: Page): Locator => menu(page).locator(".swt-menu-title");

/**
 * Runs `action`, which writes the table, and waits until the table is
 * rendered anew and enhanced: its <table> marked before is gone, the new one
 * has its rows numbered. What is checked after it is the new rendering's, not
 * the one the write replaced.
 */
export async function rendersAnew(page: Page, action: () => Promise<unknown>, index = 0): Promise<void> {
  await markTable(page, index);
  await action();
  await expect(page.locator("table[data-test-old]")).toHaveCount(0);
  await expect(table(page, index).locator("table:not([data-test-old]) tr[data-swt-row]").first()).toBeAttached();
}

/**
 * Lets what an action started finish (a write, a table rendered anew: a few
 * frames), so a check that nothing happened is not made before it would have
 */
export async function settled(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

/** Marks a table's <table> as rendered now: `table[data-test-old]` is gone once it is rendered anew */
export async function markTable(page: Page, index = 0): Promise<void> {
  await table(page, index).locator("table").evaluate((t) => t.setAttribute("data-test-old", ""));
}

export async function center(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error("not laid out");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A mouse drag from an element (its centre) to an element or a point, in
 * steps (Silverware Table follows the moves); `release` false: the button stays
 * down, for checks while dragging (then Esc or page.mouse.up())
 */
export async function drag(page: Page, from: Locator, to: Locator | { x: number; y: number }, { release = true } = {}): Promise<void> {
  const a = await center(from);
  const b = "x" in to ? to : await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  if (release) await page.mouse.up();
}

/** The pointer on a cell, and the grips there (the grips follow the cell hovered) */
/**
 * A table's icon by its name (Sheet view, Full screen), its toolbar shown:
 * in the toolbar's row of names (the toolbarNames setting), else in its ⋯
 * menu (the table's before its title, the sheet's in its first row), opened for it
 */
export async function tableIcon(page: Page, label: string): Promise<Locator> {
  const inBar = page.locator(`.swt-bar.swt-visible button[aria-label="${label}"]`);
  if (await inBar.count()) return inBar;
  if (!(await page.locator(".swt-menu .swt-menu-names").count())) await page.locator(".swt-bar.swt-visible .swt-bar-more").click();
  return page.locator(`.swt-menu button[aria-label="${label}"]`);
}

export async function hoverCell(page: Page, target: Locator): Promise<void> {
  await target.hover();
  await expect(page.locator(".swt-grip.swt-visible").first()).toBeVisible();
}

/** A touch held still on an element past the core's long press, through Chrome's touch events */
export async function longPress(page: Page, target: Locator): Promise<void> {
  const { x, y } = await center(target);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  // Time is what a long press is: held a little past the threshold
  await page.waitForTimeout(LONG_PRESS_MS + 250);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** A tap on an element */
export async function tap(page: Page, target: Locator): Promise<void> {
  const { x, y } = await center(target);
  await page.touchscreen.tap(x, y);
}
