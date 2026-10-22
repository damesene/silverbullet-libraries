import { cell, drag, expect, markdown, markTable, settled, test } from "./playground.ts";

test.describe("Selecting cells", () => {
  test("a drag selects the cells, with a band on each side of the edge to drag them by", async ({ page }) => {
    await drag(page, cell(page, 1, 1), cell(page, 3, 2));
    await expect(page.locator(".tp-selected")).toHaveCount(6);
    // One band per side of each cell on the edge: 2 top, 2 bottom, 3 left, 3 right
    await expect(page.locator(".tp-select-edge")).toHaveCount(10);
    await page.keyboard.press("Shift+ArrowDown");
    await expect(page.locator(".tp-selected")).toHaveCount(8);
  });

  test("copied cells are outlined until Esc", async ({ page }) => {
    await drag(page, cell(page, 1, 1), cell(page, 3, 2));
    await page.keyboard.press("Control+c");
    // A piece in each cell on the area's edge (all six), the corners with both sides
    await expect(page.locator(".tp-cut-edge")).toHaveCount(6);
    await expect(page.locator(".tp-cut-edge.tp-cut-top.tp-cut-left")).toHaveCount(1);
    await expect(page.locator(".tp-cut-edge.tp-cut-bottom.tp-cut-right")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".tp-cut-edge")).toHaveCount(0);
  });

  test("cells dragged by their edge show where they go, and Esc leaves them where they are", async ({ page }) => {
    const before = await markdown(page);
    await cell(page, 1, 1).click();
    await drag(page, page.locator(".tp-select-edge-right").first(), cell(page, 2, 3), { release: false });
    await expect(page.locator(".tp-move-edge")).toHaveCount(1);
    // Its address as formulas name it, by the pointer
    await expect(page.locator(".tp-move-tip.tp-visible")).toHaveText("D2");
    await markTable(page);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".tp-move-edge")).toHaveCount(0);
    await settled(page);
    await expect(page.locator("table[data-test-old]")).toHaveCount(1);
    expect(await markdown(page)).toBe(before);
  });
});
