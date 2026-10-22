// The sheet view: the table over the window with empty cells past it, which grow it
import type { Page } from "@playwright/test";
import { cell, expect, hoverCell, markdown, rendersAnew, table, test } from "./playground.ts";

/** Shows the first table as a sheet, from its toolbar */
async function openSheet(page: Page): Promise<void> {
  await hoverCell(page, cell(page, 1, 0));
  await page.locator('.swt-bar button[aria-label="Sheet view"]').click();
  await expect(table(page)).toHaveClass(/swt-sheet/);
}

/** A point in the empty cells: `right` empty columns right of the table at a row's middle, or `below` empty rows under it in a column */
async function emptyCell(page: Page, at: { right?: number; below?: number; row?: number; column?: number }): Promise<{ x: number; y: number }> {
  const box = (await table(page).locator("table").boundingBox())!;
  // The empty rows are as high as the table's body rows
  const rowHeight = (await cell(page, 1, 0).boundingBox())!.height;
  const rowBox = at.row !== undefined ? (await cell(page, at.row, 0).boundingBox())! : undefined;
  const columnBox = at.column !== undefined ? (await cell(page, 1, at.column).boundingBox())! : undefined;
  const x = at.right !== undefined ? box.x + box.width + 100 * at.right + 50 : columnBox!.x + columnBox!.width / 2;
  const y = at.below !== undefined ? box.y + box.height + rowHeight * at.below + rowHeight / 2 : rowBox!.y + rowBox!.height / 2;
  return { x, y };
}

test.describe("Sheet view", () => {
  test("a value typed into an empty cell right of a row grows the table by a named column", async ({ page }) => {
    await openSheet(page);
    const columns = await table(page).locator("table tr").first().locator("th, td").count();
    const point = await emptyCell(page, { right: 0, row: 1 });
    // Select mode (the playground's): a click selects the empty cell, typing edits it
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
    await page.keyboard.type("note");
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toHaveValue("note");
    await rendersAnew(page, () => page.keyboard.press("Enter"));
    expect(await markdown(page)).toMatch(/\| Column \d+ \|/);
    await expect(table(page).locator("table tr").first().locator("th, td")).toHaveCount(columns + 1);
    await expect(table(page)).toHaveClass(/swt-sheet/);
  });

  test("a value typed two rows below the table adds those rows, one left empty adds nothing", async ({ page }) => {
    await openSheet(page);
    const before = await markdown(page);
    const empty = await emptyCell(page, { below: 0, column: 0 });
    // A second click on the cell selected edits it
    await page.mouse.click(empty.x, empty.y);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(0);
    expect(await markdown(page)).toBe(before);
    const point = await emptyCell(page, { below: 1, column: 0 });
    await page.mouse.click(point.x, point.y);
    await page.keyboard.type("Plum");
    await rendersAnew(page, () => page.keyboard.press("Enter"));
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
    await rendersAnew(page, () => page.mouse.click(second.x, second.y));
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
    expect(await markdown(page)).toMatch(/\| Column 5 \| Column 6 \|/);
    // A table's cell: selected, the empty cell no longer
    await cell(page, 1, 1).click();
    await expect(table(page).locator(".swt-selected")).toHaveCount(1);
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(0);
  });

  test("Esc unselects an empty cell, a second Esc closes the view", async ({ page }) => {
    await openSheet(page);
    const point = await emptyCell(page, { right: 0, row: 1 });
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(0);
    await expect(table(page)).toHaveClass(/swt-sheet/);
    await page.keyboard.press("Escape");
    await expect(table(page)).not.toHaveClass(/swt-sheet/);
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
    await expect(table(page)).toHaveClass(/swt-sheet/);
    await expect(table(page)).not.toHaveClass(/swt-fullscreen/);
    await hoverCell(page, cell(page, 1, 0));
    await expect(icon("Full screen")).toHaveAttribute("aria-pressed", "false");
    await expect(icon("Exit sheet view")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(table(page)).not.toHaveClass(/swt-over-window/);
    // Full screen as before: over the window, no empty cells
    await hoverCell(page, cell(page, 1, 0));
    await icon("Full screen").click();
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
    await expect(page.locator(".swt-sheet-grid")).toHaveCount(0);
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

  test("Esc closes it", async ({ page }) => {
    await openSheet(page);
    await page.keyboard.press("Escape");
    await expect(table(page)).not.toHaveClass(/swt-sheet/);
    await expect(table(page)).not.toHaveClass(/swt-over-window/);
  });
});
