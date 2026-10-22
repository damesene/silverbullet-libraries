// The sheet view: the table over the window with empty cells past it, which grow it
import type { Page } from "@playwright/test";
import { cell, expect, hoverCell, markdown, rendersAnew, table, test } from "./playground.ts";

/** The table the sheet shows: the one it drew itself (in SilverBullet's form), standing for the page's */
const sheetTable = (page: Page) => page.locator(".sb-table-widget.swt-table.swt-drawn");

/** A body cell of the sheet's table by its row in the markdown and its column */
const sheetCell = (page: Page, row: number, column: number) => sheetTable(page).locator(`tr[data-swt-row="${row}"] > td`).nth(column);

/** As rendersAnew, for the sheet's table: drawn anew from the markdown written, and enhanced */
async function sheetRendersAnew(page: Page, action: () => Promise<unknown>): Promise<void> {
  await sheetTable(page).locator("table").evaluate((t) => t.setAttribute("data-test-old", ""));
  await action();
  await expect(page.locator(".swt-drawn table[data-test-old]")).toHaveCount(0);
  await expect(sheetTable(page).locator("table:not([data-test-old]) tr[data-swt-row]").first()).toBeAttached();
}

/** Shows the first table as a sheet, from its toolbar */
async function openSheet(page: Page): Promise<void> {
  await hoverCell(page, cell(page, 1, 0));
  await page.locator('.swt-bar button[aria-label="Sheet view"]').click();
  await expect(sheetTable(page)).toHaveClass(/swt-sheet/);
}

/** A point in the empty cells: `right` empty columns right of the table at a row's middle, or `below` empty rows under it in a column */
async function emptyCell(page: Page, at: { right?: number; below?: number; row?: number; column?: number }): Promise<{ x: number; y: number }> {
  const box = (await sheetTable(page).locator("table").boundingBox())!;
  // The empty rows are as high as the table's body rows
  const rowHeight = (await sheetCell(page, 1, 0).boundingBox())!.height;
  const rowBox = at.row !== undefined ? (await sheetCell(page, at.row, 0).boundingBox())! : undefined;
  const columnBox = at.column !== undefined ? (await sheetCell(page, 1, at.column).boundingBox())! : undefined;
  const x = at.right !== undefined ? box.x + box.width + 100 * at.right + 50 : columnBox!.x + columnBox!.width / 2;
  const y = at.below !== undefined ? box.y + box.height + rowHeight * at.below + rowHeight / 2 : rowBox!.y + rowBox!.height / 2;
  return { x, y };
}

test.describe("Sheet view", () => {
  test("a value typed into an empty cell right of a row grows the table by a named column", async ({ page }) => {
    await openSheet(page);
    const columns = await sheetTable(page).locator("table tr").first().locator("th, td").count();
    const point = await emptyCell(page, { right: 0, row: 1 });
    // Select mode (the playground's): a click selects the empty cell, typing edits it
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
    await page.keyboard.type("note");
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toHaveValue("note");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
    expect(await markdown(page)).toMatch(/\| Column \d+ \|/);
    await expect(sheetTable(page).locator("table tr").first().locator("th, td")).toHaveCount(columns + 1);
    await expect(sheetTable(page)).toHaveClass(/swt-sheet/);
  });

  test("a value typed two rows below the table adds those rows, one left empty adds nothing", async ({ page }) => {
    await openSheet(page);
    const before = await markdown(page);
    const empty = await emptyCell(page, { below: 0, column: 0 });
    // A second click on the cell selected edits it
    await page.mouse.click(empty.x, empty.y);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toBeFocused();
    // Enter on it left empty: nothing written, the cell below edited (as in a table); Esc leaves it selected, a second unselects it
    await page.keyboard.press("Enter");
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(0);
    expect(await markdown(page)).toBe(before);
    const point = await emptyCell(page, { below: 1, column: 0 });
    await page.mouse.click(point.x, point.y);
    await page.keyboard.type("Plum");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
    // An empty row, then Plum's, after the last one
    const lines = (await markdown(page)).split("\n");
    const last = lines.findIndex((line) => line.startsWith("| Šípek"));
    expect(lines[last + 1]).toMatch(/^[| ]+$/);
    expect(lines[last + 2]).toMatch(/^\| Plum +\|/);
  });

  test("a click elsewhere: on a table's cell selects it, on another empty cell selects that one, an edit saved first", async ({ page }) => {
    await openSheet(page);
    const first = await emptyCell(page, { right: 1, row: 2 });
    await page.mouse.click(first.x, first.y);
    await page.mouse.click(first.x, first.y);
    await page.keyboard.type("a");
    // Another empty cell: the edit is saved (the table grows), that cell selected
    const second = await emptyCell(page, { below: 2, column: 1 });
    await sheetRendersAnew(page, () => page.mouse.click(second.x, second.y));
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
    expect(await markdown(page)).toMatch(/\| Column 5 \| Column 6 \|/);
    // A table's cell: selected, the empty cell no longer
    await sheetCell(page, 1, 1).click();
    await expect(sheetTable(page).locator(".swt-selected")).toHaveCount(1);
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(0);
  });

  test("arrows go between the table's cells and the empty ones", async ({ page }) => {
    await openSheet(page);
    // Origin of Pear, the last column: right, an empty cell; left again, the table's
    await sheetCell(page, 1, 3).click();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await expect(sheetTable(page).locator(".swt-selected")).toHaveCount(0);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(0);
    await expect(sheetCell(page, 2, 3)).toHaveClass(/swt-selected/);
  });

  test("Enter in an empty cell saves it and edits the one below, Tab the next one", async ({ page }) => {
    await openSheet(page);
    const point = await emptyCell(page, { below: 0, column: 0 });
    await page.mouse.click(point.x, point.y);
    await page.keyboard.type("Plum");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
    const field = page.locator(".swt-sheet-cell .swt-cell-editor");
    await expect(field).toBeFocused();
    await page.keyboard.type("Lime");
    await sheetRendersAnew(page, () => page.keyboard.press("Tab"));
    // Lime's row is the table's now: Tab edits its next cell, a cell of the table
    await expect(page.locator(".swt-cell-editor")).toBeFocused();
    await page.keyboard.press("Escape");
    const lines = (await markdown(page)).split("\n");
    const last = lines.findIndex((line) => line.startsWith("| Šípek"));
    expect(lines[last + 1]).toMatch(/^\| Plum +\|/);
    expect(lines[last + 2]).toMatch(/^\| Lime +\|/);
  });

  test("cells pasted into an empty cell grow the table to hold them", async ({ page }) => {
    await openSheet(page);
    const point = await emptyCell(page, { right: 0, row: 1 });
    await page.mouse.click(point.x, point.y);
    // The system's clipboard is shared by the tests: what another test copied would be pasted by Ctrl+V itself
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.keyboard.press("Control+v");
    const field = page.locator(".swt-sheet-cell .swt-cell-editor");
    await expect(field).toBeFocused();
    // As a spreadsheet copies: tabs and lines
    await sheetRendersAnew(page, () =>
      field.evaluate((input) => {
        const data = new DataTransfer();
        data.setData("text/plain", "x\ty\n1\t2");
        input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      }),
    );
    const text = await markdown(page);
    expect(text).toMatch(/\| Column 5 +\| Column 6 +\|/);
    expect(text).toMatch(/\| Czechia +\| x +\| y +\|/);
    expect(text).toMatch(/\| Poland +\| 1 +\| 2 +\|/);
  });

  test("Esc unselects an empty cell, a second Esc closes the view", async ({ page }) => {
    await openSheet(page);
    const point = await emptyCell(page, { right: 0, row: 1 });
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(0);
    await expect(sheetTable(page)).toHaveClass(/swt-sheet/);
    await page.keyboard.press("Escape");
    await expect(sheetTable(page)).toHaveCount(0);
  });

  test("the rows past the table are numbered on, and every column has its letter", async ({ page }) => {
    await openSheet(page);
    // The sample's first table has 6 rows and 4 columns: the empty ones are 7 on, E on
    await expect(page.locator(".swt-over-window-rows > span:not([hidden])", { hasText: /^7$/ })).toBeVisible();
    await expect(page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: /^E$/ })).toBeVisible();
    await expect(page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: /^A$/ })).toBeVisible();
  });

  test("full screen and the sheet view: one table over the window at a time", async ({ page }) => {
    const icon = (label: string) => page.locator(`.swt-bar button[aria-label="${label}"]`);
    await hoverCell(page, cell(page, 1, 0));
    await icon("Full screen").click();
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
    await hoverCell(page, cell(page, 1, 0));
    await icon("Sheet view").click();
    await expect(sheetTable(page)).toHaveClass(/swt-sheet/);
    await expect(table(page)).not.toHaveClass(/swt-fullscreen/);
    await hoverCell(page, sheetCell(page, 1, 0));
    await expect(icon("Full screen")).toHaveAttribute("aria-pressed", "false");
    await expect(icon("Exit sheet view")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(sheetTable(page)).toHaveCount(0);
    await expect(table(page)).not.toHaveClass(/swt-over-window/);
    // Full screen as before: over the window, no empty cells
    await hoverCell(page, cell(page, 1, 0));
    await icon("Full screen").click();
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
    await expect(page.locator(".swt-sheet-grid")).toHaveCount(0);
  });

  test("full screen from the sheet's toolbar: the sheet ends, the page's table shows over the window", async ({ page }) => {
    await openSheet(page);
    await hoverCell(page, sheetCell(page, 1, 0));
    await page.locator('.swt-bar button[aria-label="Full screen"]').click();
    await expect(sheetTable(page)).toHaveCount(0);
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
    await expect(table(page)).toBeVisible();
  });

  test("full screen keeps room right of the table: the + of a new column there, clear of the toolbar, the rows numbered on both sides", async ({ page }) => {
    await hoverCell(page, cell(page, 1, 0));
    await page.locator('.swt-bar button[aria-label="Full screen"]').click();
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
    const columns = await table(page).locator("table tr").first().locator("th, td").count();
    await hoverCell(page, cell(page, 1, columns - 1));
    const plus = page.locator('.swt-insert.swt-quiet.swt-visible[aria-label="Add a column"]');
    await expect(plus).toBeVisible();
    const tableBox = (await table(page).locator("table").boundingBox())!;
    const plusBox = (await plus.boundingBox())!;
    const bar = (await page.locator(".swt-bar.swt-visible").boundingBox())!;
    const width = page.viewportSize()!.width;
    // On the table's right edge (as in the page), inside the window, beside the toolbar (not under it)
    expect(Math.abs(plusBox.x + plusBox.width / 2 - (tableBox.x + tableBox.width))).toBeLessThan(2);
    expect(plusBox.x + plusBox.width).toBeLessThanOrEqual(width);
    expect(plusBox.x).toBeGreaterThanOrEqual(bar.x + bar.width);
    // Its line on the table's edge, in view
    await plus.hover();
    const line = (await page.locator(".swt-insert-line.swt-visible").boundingBox())!;
    expect(line.x).toBeLessThan(width - 2);
    // The rows' numbers left and right of the table
    await expect(page.locator(".swt-over-window-rows:not(.swt-at-right) > span:not([hidden])").first()).toHaveText("1");
    await expect(page.locator(".swt-over-window-rows.swt-at-right > span:not([hidden])").first()).toHaveText("1");
  });

  test("stays over the window when a write renders the tables before it anew (a formula there refers to it)", async ({ page }) => {
    await page
      .locator("#source")
      .fill("# Test\n\n| A | B |\n|---|---|\n| 1 | 2 <meta f='=prices!B1'> |\n\nText\n\n| Item | Price |\n|---|---|\n| Pear | 2 |\n| <meta name='prices'> |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("table tr")).toHaveCount(3);
    await hoverCell(page, cell(page, 1, 0, 1));
    await page.locator('.swt-bar button[aria-label="Full screen"]').click();
    await expect(table(page, 1)).toHaveClass(/swt-fullscreen/);
    // Select mode: a click selects, typing replaces the text, a click elsewhere saves
    await cell(page, 1, 1, 1).click();
    await page.keyboard.type("5");
    await rendersAnew(page, () => cell(page, 1, 0, 1).click(), 1);
    // The first table recalculated in the same edit, so the second's start moved
    expect(await markdown(page)).toMatch(/\| 1 +\| 5 <meta f='=prices!B1'> +\|/);
    await page.waitForTimeout(2500);
    await expect(table(page, 1)).toHaveClass(/swt-fullscreen/);
  });

  test("draws the table itself, its cells rendered as the page's, a link followed by the editor's navigation", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Note |\n|---|---|\n| Pear | [[Fruit]] **ripe** #fresh |\n| Fig | plain |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(2);
    await openSheet(page);
    // Not SilverBullet's table over the window: one of its own, standing for it
    await expect(table(page)).not.toHaveClass(/swt-over-window/);
    const note = sheetCell(page, 1, 1);
    await expect(note.locator("a[data-ref='Fruit']")).toHaveText("Fruit");
    await expect(note.locator("strong")).toHaveText("ripe");
    await expect(note.locator("a.hashtag")).toHaveText("#fresh");
    await expect(sheetCell(page, 2, 1)).toHaveText("plain");
    // A link: the editor's navigation (the playground says so), the window not loaded anew
    await page.evaluate(() => ((window as unknown as { stillHere: boolean }).stillHere = true));
    await note.locator("a[data-ref='Fruit']").click();
    await expect(page.locator("#flash > div", { hasText: "would open Fruit" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
  });

  test("ends once the page's table is gone from the markdown (undone, removed)", async ({ page }) => {
    // The page's only table: no other table of the page takes its key (a table's key is its place among them)
    await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    await page.locator("#source").fill("# Test\n\nNo table now.\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    // Still shown for a moment (a table rendered anew is missing for as long), then gone
    await expect(sheetTable(page)).toHaveCount(1);
    await expect(sheetTable(page)).toHaveCount(0, { timeout: 5000 });
  });

  test("Esc closes it", async ({ page }) => {
    await openSheet(page);
    await page.keyboard.press("Escape");
    await expect(sheetTable(page)).toHaveCount(0);
    await expect(table(page)).not.toHaveClass(/swt-over-window/);
  });
});
