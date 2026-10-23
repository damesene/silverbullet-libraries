import { cell, drag, expect, markdown, markTable, settled, test } from "./playground.ts";

test.describe("Selecting cells", () => {
  test("a drag selects the cells, with a band on each side of the edge to drag them by", async ({ page }) => {
    await drag(page, cell(page, 1, 1), cell(page, 3, 2));
    await expect(page.locator(".swt-selected")).toHaveCount(6);
    // One band per side of each cell on the edge: 2 top, 2 bottom, 3 left, 3 right
    await expect(page.locator(".swt-select-edge")).toHaveCount(10);
    await page.keyboard.press("Shift+ArrowDown");
    await expect(page.locator(".swt-selected")).toHaveCount(8);
  });

  test("Ctrl held over cells selected shows the move cursor, as in a cell editor; let go, the pointer is as before", async ({ page }) => {
    await cell(page, 1, 1).click();
    await expect(page.locator(".swt-selected")).toHaveCount(1);
    await cell(page, 2, 1).hover();
    await page.keyboard.down("Control");
    await expect(cell(page, 2, 1)).toHaveClass(/swt-navigating-here/);
    expect(await cell(page, 2, 1).evaluate((c) => getComputedStyle(c).cursor)).toBe("move");
    await page.keyboard.up("Control");
    await expect(cell(page, 2, 1)).not.toHaveClass(/swt-navigating-here/);
  });

  test("copied cells are outlined until Esc", async ({ page }) => {
    await drag(page, cell(page, 1, 1), cell(page, 3, 2));
    await page.keyboard.press("Control+c");
    // A piece in each cell on the area's edge (all six), the corners with both sides
    await expect(page.locator(".swt-cut-edge")).toHaveCount(6);
    await expect(page.locator(".swt-cut-edge.swt-cut-top.swt-cut-left")).toHaveCount(1);
    await expect(page.locator(".swt-cut-edge.swt-cut-bottom.swt-cut-right")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".swt-cut-edge")).toHaveCount(0);
  });

  test("cells dragged by their edge show where they go, and Esc leaves them where they are", async ({ page }) => {
    const before = await markdown(page);
    await cell(page, 1, 1).click();
    await drag(page, page.locator(".swt-select-edge-right").first(), cell(page, 2, 3), { release: false });
    await expect(page.locator(".swt-move-edge")).toHaveCount(1);
    // Its address as formulas name it, by the pointer
    await expect(page.locator(".swt-move-tip.swt-visible")).toHaveText("D2");
    await markTable(page);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".swt-move-edge")).toHaveCount(0);
    await settled(page);
    await expect(page.locator("table[data-test-old]")).toHaveCount(1);
    expect(await markdown(page)).toBe(before);
  });
});
