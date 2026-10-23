import { cell, drag, expect, header, markdown, markTable, settled, test } from "./playground.ts";

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

  test("Tab and Shift+Tab move the cell selected along its row and on to the next, as in a cell editor", async ({ page }) => {
    const last = cell(page, 1, 3);
    await last.click();
    await expect(last).toHaveClass(/swt-selected/);
    await page.keyboard.press("Tab");
    await expect(cell(page, 2, 0)).toHaveClass(/swt-selected/);
    await page.keyboard.press("Shift+Tab");
    await expect(last).toHaveClass(/swt-selected/);
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
  });

  test("Ctrl+Enter on a cell selected adds a row under it, edited in the same column, as in a cell editor", async ({ page }) => {
    const rows = page.locator(".sb-table-widget table").first().locator("tbody tr[data-swt-row]");
    const count = await rows.count();
    await cell(page, 2, 1).click();
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
    await page.keyboard.press("Control+Enter");
    await expect(rows).toHaveCount(count + 1);
    const field = page.locator(".swt-cell-editor");
    await expect(field).toBeFocused();
    expect(await field.evaluate((f) => [(f.closest("tr") as HTMLTableRowElement).dataset.swtRow, (f.closest("td") as HTMLTableCellElement).cellIndex])).toEqual(["3", 1]);
  });

  test("Enter in the last row's cell editor adds a row under it, edited in the same column", async ({ page }) => {
    const rows = page.locator(".sb-table-widget table").first().locator("tbody tr[data-swt-row]");
    const count = await rows.count();
    const lastCell = rows.last().locator("td").nth(1);
    await lastCell.dblclick();
    await expect(page.locator(".swt-cell-editor")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(rows).toHaveCount(count + 1);
    await expect(page.locator(".swt-cell-editor")).toBeFocused();
    expect(await page.locator(".swt-cell-editor").evaluate((f) => (f.closest("tr") as HTMLTableRowElement).dataset.swtRow)).toBe(String(count + 1));
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

test.describe("The selection after deleting", () => {
  const PAGE = "# Test\n\n| A | B |\n|---|---|\n| 1 | x |\n| 2 | y |\n| 3 | z |\n";

  test("rows deleted with Delete: the row that came up is selected whole, the keyboard going on from there", async ({ page }) => {
    await page.locator("#source").fill(PAGE);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(cell(page, 3, 1)).toHaveText("z");
    await drag(page, cell(page, 2, 0), cell(page, 2, 1));
    await page.keyboard.press("Delete");
    await expect.poll(() => markdown(page)).toMatch(/\| 1 +\| x +\|\n\| +\| +\|\n/);
    await expect(cell(page, 2, 0)).toHaveText("");
    await page.keyboard.press("Delete");
    await expect.poll(() => markdown(page)).not.toContain("| 2 |");
    // Row 2 is now 3's, selected whole
    await expect(cell(page, 2, 0)).toHaveText("3");
    await expect(page.locator(".swt-selected")).toHaveCount(2);
    await expect(cell(page, 2, 0)).toHaveClass(/swt-selected/);
    // (One cell selected from there: the row above's)
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('tr[data-swt-row="1"] > td.swt-selected')).toHaveCount(1);
    await expect(page.locator(".swt-selected")).toHaveCount(1);
  });

  test("the last row deleted: the row above it, now last, is selected whole", async ({ page }) => {
    await page.locator("#source").fill(PAGE);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(cell(page, 3, 1)).toHaveText("z");
    await drag(page, cell(page, 3, 0), cell(page, 3, 1));
    await page.keyboard.press("Delete");
    await expect(cell(page, 3, 0)).toHaveText("");
    await page.keyboard.press("Delete");
    await expect.poll(() => markdown(page)).not.toContain("| 3 |");
    await expect(page.locator('tr[data-swt-row="2"] > td.swt-selected')).toHaveCount(2);
  });

  test("a column deleted: the column that came left is selected whole", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| A | B | C |\n|---|---|---|\n| 1 | | x |\n| 2 | | y |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(cell(page, 2, 2)).toHaveText("y");
    await drag(page, header(page, 1), cell(page, 2, 1));
    await page.keyboard.press("Delete");
    await expect.poll(() => markdown(page)).not.toContain("| B |");
    await expect(header(page, 1)).toHaveText(/C/);
    await expect(page.locator(".swt-selected")).toHaveCount(3);
    await expect(cell(page, 1, 1)).toHaveClass(/swt-selected/);
  });
});
