// On a touch screen (the "touch" project: a phone's viewport, touch events)
import { cell, expect, longPress, markdown, menu, menuTitle, table, tableIcon, tap, test } from "./playground.ts";

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

test.describe("Touch: moving a table on the sheet", () => {
  test("a tap on a table's cell shows its move handle; Move table… in the cell's menu, then a tap, moves it", async ({ page }) => {
    // The markdown's pane, hidden on a phone: shown to write the page, then hidden again
    const pane = page.getByRole("button", { name: "M↓" });
    await pane.click();
    await page
      .locator("#source")
      .fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta name='a' sheet='Plan' at='A1'> |\n\n| City |\n|---|\n| Brno |\n| <meta name='b' sheet='Plan' at='D1'> |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await pane.click();
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await tap(page, cell(page, 1, 0));
    await (await tableIcon(page, "Sheet view")).click();
    const a = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table", { hasText: "Pear" });
    await expect(a).toBeVisible();
    // (Not the cell selected in the page, which a tap would edit)
    const first = a.locator("tr[data-swt-row='1'] > td").nth(1);
    await tap(page, first);
    await expect(page.locator(".swt-sheet-grab.swt-visible")).toBeVisible();
    await longPress(page, first);
    await tap(page, page.locator(".swt-menu .swt-menu-item", { hasText: "Move table…" }));
    // Four rows under a's last row, in its second column: B6
    const box = (await first.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 4.5);
    await expect.poll(() => markdown(page)).toContain("<meta name='a' sheet='Plan' at='B6'>");
  });
});
