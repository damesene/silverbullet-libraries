// Moving a table on the sheet: its handle dragged or clicked, Move table…, the whole table selected and dragged by its edge
import type { Page } from "@playwright/test";
import { center, cell, drag, expect, hoverCell, markdown, table, tableIcon, test } from "./playground.ts";

// a at A1 (its header and one row, two columns), b at D1
const PAGE = "# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta core.table core.name='a' sheet.name='Plan' sheet.at='A1'> |\n\n| City |\n|---|\n| Brno |\n| <meta core.table core.name='b' sheet.name='Plan' sheet.at='D1'> |\n";

const drawn = (page: Page, text: string) => page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)", { hasText: text });
const grab = (page: Page) => page.locator(".swt-sheet-grab.swt-visible");
const preview = (page: Page) => page.locator(".swt-sheet-move:not([hidden])");

async function openPlan(page: Page, more = ""): Promise<number> {
  await page.locator("#source").fill(PAGE + more);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  await expect(page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)")).toHaveCount(2);
  // The sheet's rows are of one height
  return (await drawn(page, "Pear").locator("tr[data-swt-row='1'] > td").first().boundingBox())!.height;
}

/** The middle of a sheet's cell: its column's letter, its row as far below the sheet's first row (a's header, A1) */
async function sheetPoint(page: Page, letter: string, row: number, rowHeight: number): Promise<{ x: number; y: number }> {
  const l = (await page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: new RegExp(`^${letter}$`) }).boundingBox())!;
  const top = (await drawn(page, "Pear").locator("table").boundingBox())!.y;
  return { x: l.x + l.width / 2, y: top + (row - 1) * rowHeight + rowHeight / 2 };
}

test.describe("Moving a table on the sheet", () => {
  test("the handle at its top left corner, dragged, shows where it goes and moves it there", async ({ page }) => {
    const rowHeight = await openPlan(page);
    await drawn(page, "Pear").locator("tr[data-swt-row='1'] > td").first().hover();
    await expect(grab(page)).toBeVisible();
    const from = await center(grab(page));
    await drag(page, grab(page), { x: from.x, y: from.y + 3 * rowHeight }, { release: false });
    await expect(preview(page)).toBeVisible();
    await expect(preview(page).locator(".swt-sheet-move-tip")).toHaveText("A4");
    await page.mouse.up();
    await expect.poll(() => markdown(page)).toContain("<meta core.table core.name='a' sheet.name='Plan' sheet.at='A4'>");
    await expect(preview(page)).toHaveCount(0);
  });

  test("dragged onto another table, it is red with the reason, and let go nothing is written", async ({ page }) => {
    await openPlan(page);
    await drawn(page, "Pear").locator("tr[data-swt-row='1'] > td").first().hover();
    const from = await center(grab(page));
    const d = await sheetPoint(page, "D", 1, 0);
    const a = await sheetPoint(page, "A", 1, 0);
    await drag(page, grab(page), { x: from.x + d.x - a.x, y: from.y }, { release: false });
    await expect(preview(page)).toHaveClass(/swt-invalid/);
    // (Its two columns from C or D on: over b either way)
    await expect(preview(page).locator(".swt-sheet-move-tip")).toHaveText(/^[CD]1: b is there$/);
    await page.mouse.up();
    await expect(page.locator("#flash > div", { hasText: /cannot go to [CD]1: b is there/ })).toBeVisible();
    expect(await markdown(page)).toContain("<meta core.table core.name='a' sheet.name='Plan' sheet.at='A1'>");
  });

  test("a click on the handle selects the whole table; dragged by the selection's edge, the table moves", async ({ page }) => {
    const rowHeight = await openPlan(page);
    const a = drawn(page, "Pear");
    await a.locator("tr[data-swt-row='1'] > td").first().hover();
    await grab(page).click();
    await expect(a.locator(".swt-selected")).toHaveCount(4);
    // The selection's edge (a mouse's): the band under its last row (the row grips are at its left)
    const edge = a.locator("tr[data-swt-row='1'] .swt-select-edge-bottom").first();
    await expect(edge).toBeAttached();
    // Its half inside the table (the table's box clips the rest)
    const box = (await edge.boundingBox())!;
    const e = { x: box.x + box.width / 2, y: box.y + 1 };
    await page.mouse.move(e.x, e.y);
    await page.mouse.down();
    await page.mouse.move(e.x, e.y + 2 * rowHeight, { steps: 8 });
    await expect(preview(page).locator(".swt-sheet-move-tip")).toHaveText("A3");
    await page.mouse.up();
    await expect.poll(() => markdown(page)).toContain("<meta core.table core.name='a' sheet.name='Plan' sheet.at='A3'>");
  });

  test("Esc while the handle is dragged cancels the drag only: the sheet stays, the table where it was", async ({ page }) => {
    const rowHeight = await openPlan(page);
    await drawn(page, "Pear").locator("tr[data-swt-row='1'] > td").first().hover();
    const from = await center(grab(page));
    await drag(page, grab(page), { x: from.x, y: from.y + 3 * rowHeight }, { release: false });
    await expect(preview(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(preview(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator(".swt-sheet-board")).toHaveCount(1);
    expect(await markdown(page)).toContain("<meta core.table core.name='a' sheet.name='Plan' sheet.at='A1'>");
  });

  test("Move table… from a cell's menu: one Esc ends it, the cell staying selected", async ({ page }) => {
    const rowHeight = await openPlan(page);
    const first = drawn(page, "Pear").locator("tr[data-swt-row='1'] > td").first();
    await first.click({ button: "right" });
    await page.locator(".swt-menu .swt-menu-item", { hasText: "Move table…" }).click();
    const f6 = await sheetPoint(page, "F", 6, rowHeight);
    await page.mouse.move(f6.x, f6.y);
    await expect(preview(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(preview(page)).toHaveCount(0);
    await expect(drawn(page, "Pear").locator(".swt-selected")).toHaveCount(1);
    // Ended: a click on the sheet moves nothing
    await page.mouse.click(f6.x, f6.y);
    expect(await markdown(page)).toContain("<meta core.table core.name='a' sheet.name='Plan' sheet.at='A1'>");
  });

  test("Move table… in the ⋯ menu: the next click on the sheet places its top left corner; Esc cancels", async ({ page }) => {
    const rowHeight = await openPlan(page);
    const pick = async () => {
      await drawn(page, "Pear").locator("tr[data-swt-row='1'] > td").first().hover();
      await page.locator(".swt-bar.swt-visible .swt-bar-more").click();
      await page.locator(".swt-menu .swt-menu-item", { hasText: "Move table…" }).click();
    };
    await pick();
    const f6 = await sheetPoint(page, "F", 6, rowHeight);
    await page.mouse.move(f6.x, f6.y);
    await expect(preview(page).locator(".swt-sheet-move-tip")).toHaveText("F6");
    await page.keyboard.press("Escape");
    await expect(preview(page)).toHaveCount(0);
    await expect(page.locator(".swt-sheet-board")).toHaveCount(1);
    await pick();
    await page.mouse.move(f6.x, f6.y);
    await page.mouse.click(f6.x, f6.y);
    await expect.poll(() => markdown(page)).toContain("<meta core.table core.name='a' sheet.name='Plan' sheet.at='F6'>");
  });
});

test.describe("Deleting a table on the sheet", () => {
  test("the whole table selected: a Delete empties it, a second deletes it, unasked", async ({ page }) => {
    await openPlan(page);
    page.on("dialog", (dialog) => {
      throw new Error(`asked: ${dialog.message()}`);
    });
    await drawn(page, "Brno").locator("tr[data-swt-row='1'] > td").first().hover();
    await grab(page).click();
    await expect(drawn(page, "Brno").locator(".swt-selected")).toHaveCount(2);
    await drawn(page, "Brno").locator("table").evaluate((t) => t.setAttribute("data-test-old", ""));
    await page.keyboard.press("Delete");
    await expect.poll(() => markdown(page)).toMatch(/\| City +\|\n\|[- |]+\|\n\| +\|\n\| <meta core.table core.name='b'/);
    // Drawn anew, emptied, the selection shown on it again
    await expect(page.locator("table[data-test-old]")).toHaveCount(0);
    await expect(drawn(page, "City").locator(".swt-selected")).toHaveCount(2);
    await page.keyboard.press("Delete");
    await expect.poll(() => markdown(page)).not.toContain("City");
    await expect(page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)")).toHaveCount(1);
    // Its cell (D1) selected where it was, the keyboard going on from there
    const empty = page.locator(".swt-sheet-cell");
    await expect(empty).toBeVisible();
    const d1 = (await empty.boundingBox())!;
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => Math.round((await empty.boundingBox())!.y)).toBeGreaterThan(Math.round(d1.y));
  });
});

test.describe("Adding a table of the page to the sheet", () => {
  // A table of the page on no sheet: two columns, two rows
  const CODES = "\n| Code | Kind |\n|---|---|\n| X1 | a |\n";

  test("a right click on an empty cell: Add table here lists the page's other tables, hovered outlined; one picked goes there", async ({ page }) => {
    const rowHeight = await openPlan(page, CODES);
    const point = await sheetPoint(page, "F", 4, rowHeight);
    await page.mouse.click(point.x, point.y, { button: "right" });
    const menu = page.locator(".swt-menu");
    await expect(menu.locator(".swt-menu-title-text")).toHaveText("Cell F4");
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Add table here" }).click();
    const item = page.locator(".swt-menu").getByRole("menuitem", { name: "Code, Kind" });
    await item.hover();
    await expect(preview(page)).toBeVisible();
    await expect(preview(page).locator(".swt-sheet-move-tip")).toHaveText("F4");
    await item.click();
    await expect.poll(() => markdown(page)).toMatch(/\| X1 +\| a +\|\n\| <meta core.table core.name='\w+' sheet.name='Plan' sheet.at='F4'> \|/);
    await expect(page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)")).toHaveCount(3);
    await expect(page.locator(".swt-menu")).toHaveCount(0);
  });

  test("on a table alone's board, both go on a new sheet in one edit: it at A1, the one added at the cell", async ({ page }) => {
    await page.locator("#source").fill(`# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n${CODES}`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await hoverCell(page, cell(page, 1, 0));
    await (await tableIcon(page, "Sheet view")).click();
    await expect(page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)")).toHaveCount(1);
    const rowHeight = (await drawn(page, "Pear").locator("tr[data-swt-row='1'] > td").first().boundingBox())!.height;
    const point = await sheetPoint(page, "D", 2, rowHeight);
    await page.mouse.click(point.x, point.y, { button: "right" });
    await page.locator(".swt-menu").getByRole("menuitem", { name: "Add table here" }).click();
    await page.locator(".swt-menu").getByRole("menuitem", { name: "Code, Kind" }).click();
    await expect.poll(() => markdown(page)).toMatch(/\| Pear +\| 3 +\|\n\| <meta core.table core.name='table1' sheet.name='Sheet1' sheet.at='A1'> \|/);
    expect(await markdown(page)).toMatch(/\| X1 +\| a +\|\n\| <meta core.table core.name='table2' sheet.name='Sheet1' sheet.at='D2'> \|/);
    await expect(page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)")).toHaveCount(2);
  });

  test("Esc closes the empty cell's menu, the cell still selected and the sheet open", async ({ page }) => {
    const rowHeight = await openPlan(page, CODES);
    const point = await sheetPoint(page, "F", 4, rowHeight);
    await page.mouse.click(point.x, point.y, { button: "right" });
    await expect(page.locator(".swt-menu")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".swt-menu")).toHaveCount(0);
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await expect(page.locator(".swt-sheet-board")).toBeVisible();
  });

  test("a table that would cover another there is offered disabled, its outline marked", async ({ page }) => {
    const rowHeight = await openPlan(page, CODES);
    // C1: two columns reach b at D1
    const point = await sheetPoint(page, "C", 1, rowHeight);
    await page.mouse.click(point.x, point.y, { button: "right" });
    await page.locator(".swt-menu").getByRole("menuitem", { name: "Add table here" }).click();
    const item = page.locator(".swt-menu").getByRole("menuitem", { name: "Code, Kind" });
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await item.hover();
    await expect(preview(page)).toHaveClass(/swt-invalid/);
  });
});
