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

  test("the selection's handles show after a touch, the fill handle does not", async ({ page }) => {
    await tap(page, cell(page, 2, 1));
    await expect(page.locator(".swt-select-handle").first()).toBeVisible();
    await expect(page.locator(".swt-fill-handle")).toBeHidden();
  });
});
