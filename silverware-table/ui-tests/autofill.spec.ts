import { cell, columnCells, drag, expect, markdown, markTable, rendersAnew, settled, test } from "./playground.ts";

test.describe("AutoFill", () => {
  test("the fill handle dragged down outlines what it fills, and fills it as it is let go", async ({ page }) => {
    // Qty of Pear (3) and apple (10): a series stepping by 7
    await cell(page, 1, 1).click();
    await page.keyboard.press("Shift+ArrowDown");
    await drag(page, page.locator(".swt-fill-handle"), cell(page, 4, 1), { release: false });
    await expect(page.locator(".swt-fill-edge").first()).toBeVisible();
    await rendersAnew(page, () => page.mouse.up());
    await expect(page.locator(".swt-fill-edge")).toHaveCount(0);
    await expect(columnCells(page, 1)).toHaveText(["3", "10", "17", "24", "7", "1"]);
    expect(await markdown(page)).toMatch(/\| Fig +\| +17 \|/);
  });

  test("Esc while dragging the fill handle fills nothing", async ({ page }) => {
    const before = await markdown(page);
    await cell(page, 1, 1).click();
    await drag(page, page.locator(".swt-fill-handle"), cell(page, 3, 1), { release: false });
    // A fill going on: what it would fill outlined
    await expect(page.locator(".swt-fill-edge").first()).toBeVisible();
    await markTable(page);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".swt-fill-edge")).toHaveCount(0);
    // Nothing written: the table not rendered anew once a write would have been
    await settled(page);
    await expect(page.locator("table[data-test-old]")).toHaveCount(1);
    expect(await markdown(page)).toBe(before);
  });
});
