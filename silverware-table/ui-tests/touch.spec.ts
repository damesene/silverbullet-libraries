// On a touch screen (the "touch" project: a phone's viewport, touch events)
import { cell, expect, longPress, menu, menuTitle, tap, test } from "./playground.ts";

test.describe("Touch", () => {
  test("a long press on a cell opens its menu", async ({ page }) => {
    await longPress(page, cell(page, 2, 0));
    await expect(menuTitle(page)).toHaveText(/^Cell: Name, row 2/);
  });

  test("a tap on cells selected opens their menu; a tap selects one cell", async ({ page }) => {
    await tap(page, cell(page, 1, 0));
    await expect(page.locator(".swt-selected")).toHaveCount(1);
    await page.keyboard.press("Shift+ArrowDown");
    await expect(page.locator(".swt-selected")).toHaveCount(2);
    await tap(page, cell(page, 1, 0));
    await expect(menuTitle(page)).toHaveText("2 cells");
    await expect(menu(page)).toHaveCount(1);
  });

  test("a tap on a choice of the list while typing a formula inserts it, the editor staying open", async ({ page }) => {
    // Select mode: the first tap selects the cell, the second edits it
    await tap(page, cell(page, 1, 3));
    await tap(page, cell(page, 1, 3));
    const field = page.locator(".swt-cell-editor");
    await expect(field).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("=su");
    const sum = page.locator(".swt-formula-choice", { has: page.locator("code", { hasText: /^SUM$/ }) });
    await expect(sum).toBeVisible();
    await tap(page, sum);
    await expect(field).toHaveValue("=SUM(");
    await expect(field).toBeFocused();
  });

  test("the selection's handles show after a touch, the fill handle does not", async ({ page }) => {
    await tap(page, cell(page, 2, 1));
    await expect(page.locator(".swt-select-handle").first()).toBeVisible();
    await expect(page.locator(".swt-fill-handle")).toBeHidden();
  });
});
