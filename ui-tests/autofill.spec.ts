import { cell, center, expect, markdown, test } from "./playground.ts";

test.describe("AutoFill", () => {
  test("the fill handle dragged down outlines what it fills, and fills it as it is let go", async ({ page }) => {
    // Qty of Pear (3) and apple (10): a series stepping by 7
    await cell(page, 1, 1).click();
    await page.keyboard.press("Shift+ArrowDown");
    const handle = page.locator(".tp-fill-handle");
    await expect(handle).toBeVisible();
    const from = await center(handle);
    const to = await center(cell(page, 4, 1));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(page.locator(".tp-fill-edge").first()).toBeVisible();
    await page.mouse.up();
    await expect(page.locator(".tp-fill-edge")).toHaveCount(0);
    await expect(cell(page, 3, 1)).toHaveText("17");
    await expect(cell(page, 4, 1)).toHaveText("24");
    expect(await markdown(page)).toMatch(/\| Fig +\| +17 \|/);
  });

  test("Esc while dragging the fill handle fills nothing", async ({ page }) => {
    const before = await markdown(page);
    await cell(page, 1, 1).click();
    const from = await center(page.locator(".tp-fill-handle"));
    const to = await center(cell(page, 3, 1));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".tp-fill-edge")).toHaveCount(0);
    expect(await markdown(page)).toBe(before);
  });
});
