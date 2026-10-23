// The sheet view: the table over the window with empty cells past it, which grow it
import type { Page } from "@playwright/test";
import { cell, expect, hoverCell, markdown, rendersAnew, table, tableIcon, test } from "./playground.ts";

/** The table the sheet shows: the one it drew itself (in SilverBullet's form), standing for the page's */
const sheetTable = (page: Page) => page.locator(".sb-table-widget.swt-table.swt-drawn:not(.swt-stand-in)");

/** A body cell of the sheet's table by its row in the markdown and its column */
const sheetCell = (page: Page, row: number, column: number) => sheetTable(page).locator(`tr[data-swt-row="${row}"] > td`).nth(column);

/** As rendersAnew, for a table of the sheet (index: the first): drawn anew from the markdown written, and enhanced */
async function sheetRendersAnew(page: Page, action: () => Promise<unknown>, index = 0): Promise<void> {
  await sheetTable(page).nth(index).locator("table").evaluate((t) => t.setAttribute("data-test-old", ""));
  await action();
  await expect(page.locator(".swt-drawn:not(.swt-stand-in) table[data-test-old]")).toHaveCount(0);
  await expect(sheetTable(page).locator("table:not([data-test-old]) tr[data-swt-row]").first()).toBeAttached();
}

/** Shows the first table as a sheet, from its toolbar */
async function openSheet(page: Page): Promise<void> {
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  await expect(sheetTable(page).first()).toHaveClass(/swt-sheet/);
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

test.describe("Ctrl+arrows out of a table on the sheet", () => {
  test("a cell selected at the table's right edge: Ctrl+ArrowRight selects the empty cell past it", async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem("silverware.table.editMode"));
    await page.reload();
    await openSheet(page);
    const last = sheetTable(page).locator("tr[data-swt-row='1'] > td").last();
    await last.click();
    await expect(last).toHaveClass(/swt-selected/);
    await page.keyboard.press("Control+ArrowRight");
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await expect(last).not.toHaveClass(/swt-selected/);
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
  });

  test("a cell edited at the table's right edge: Ctrl+ArrowRight saves it and edits the empty cell past it", async ({ page }) => {
    await openSheet(page);
    const last = sheetTable(page).locator("tr[data-swt-row='1'] > td").last();
    await last.dblclick();
    const field = page.locator(".swt-cell-editor");
    await expect(field).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("77");
    await page.keyboard.press("Control+ArrowRight");
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toBeFocused();
    await expect.poll(() => markdown(page)).toMatch(/\| 77 +\|\n/);
  });
});

test.describe("Ctrl+arrows in the sheet's empty cells", () => {
  test("an empty cell selected: Ctrl+arrows move to the next cell as arrows do (the page gets no key)", async ({ page }) => {
    await openSheet(page);
    const point = await emptyCell(page, { right: 2, row: 1 });
    await page.mouse.click(point.x, point.y);
    const empty = page.locator(".swt-sheet-cell");
    await expect(empty).toBeVisible();
    const at = (await empty.boundingBox())!;
    await page.keyboard.press("Control+ArrowRight");
    await expect.poll(async () => Math.round((await empty.boundingBox())!.x)).toBeGreaterThan(Math.round(at.x));
    await page.keyboard.press("Control+ArrowDown");
    await expect.poll(async () => Math.round((await empty.boundingBox())!.y)).toBeGreaterThan(Math.round(at.y));
    await expect(page.locator(".swt-sheet-board")).toBeVisible();
  });

  test("an empty cell edited: Ctrl+ArrowDown saves what was typed and edits the cell under it", async ({ page }) => {
    await openSheet(page);
    const point = await emptyCell(page, { right: 3, row: 1 });
    await page.mouse.dblclick(point.x, point.y);
    const field = page.locator(".swt-sheet-cell .swt-cell-editor");
    await expect(field).toBeFocused();
    await page.keyboard.type("Quince");
    await page.keyboard.press("Control+ArrowDown");
    await expect.poll(() => markdown(page)).toMatch(/\| Quince +\|/);
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toBeFocused();
    // The cell under the value: a new table's, the value its first body cell
    const value = (await page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)", { hasText: "Quince" }).locator("tr[data-swt-row='1'] > td").first().boundingBox())!;
    const editor = (await page.locator(".swt-sheet-cell").boundingBox())!;
    expect(Math.round(editor.y)).toBeGreaterThan(Math.round(value.y));
    expect(Math.abs(editor.x - value.x)).toBeLessThan(2);
  });
});

test.describe("A table far down the sheet", () => {
  test("edited, drawn anew: the board stays scrolled where it is (the table placed at once, the next cell focused there)", async ({ page }) => {
    await page.locator("#source").fill(
      "# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta name='a' sheet='Plan' at='A1'> |\n\n| City | N |\n|---|---|\n| Brno | 1 |\n| Praha | 2 |\n| <meta name='b' sheet='Plan' at='B25'> |\n",
    );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(2);
    await openSheet(page);
    const board = page.locator(".swt-sheet-board");
    await board.evaluate((b) => (b.scrollTop = 1500));
    const b = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)", { hasText: "Brno" });
    await expect(b).toBeVisible();
    const before = await board.evaluate((x) => x.scrollTop);
    // Every frame's scroll, from here on
    await board.evaluate((x) => {
      const tops: number[] = [];
      (window as unknown as { tops: number[] }).tops = tops;
      const log = () => {
        tops.push(Math.round(x.scrollTop));
        requestAnimationFrame(log);
      };
      requestAnimationFrame(log);
    });
    await sheetRendersAnew(
      page,
      async () => {
        await b.locator("tr[data-swt-row='1'] > td").nth(1).dblclick();
        await page.keyboard.press("Control+a");
        await page.keyboard.type("7");
        await page.keyboard.press("Enter");
      },
      1,
    );
    await expect(page.locator(".swt-cell-editor")).toBeFocused();
    await page.waitForTimeout(200);
    expect([...new Set(await page.evaluate(() => (window as unknown as { tops: number[] }).tops))]).toEqual([Math.round(before)]);
  });
});

test.describe("Long text on the sheet", () => {
  test("a narrow column: its header and its cells stay within it, cut with an ellipsis", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("silverwarePlayground.settings", JSON.stringify({ "silverware.table.metadata": true, "silverware.table.modules.longText.overflow": "ellipsis" })));
    await page.reload();
    await page.locator("#source").fill("# Test\n\n| Item with a long header name | Note |\n|---|---|\n| A very long value that does not fit | short |\n| <meta name='t' sheet='S' at='A1' sheet.width.A='90'> |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    const t = sheetTable(page);
    const fits = (selector: string) =>
      t.locator(selector).first().evaluate((box) => {
        const cell = box.closest("td")!.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        return { inside: b.left >= cell.left - 0.5 && b.right <= cell.right + 0.5, cut: box.scrollWidth > box.clientWidth, ellipsis: getComputedStyle(box).textOverflow };
      });
    expect(await fits("thead .swt-head-name")).toEqual({ inside: true, cut: true, ellipsis: "ellipsis" });
    expect(await fits("tr[data-swt-row='1'] > td > .swt-cell-content")).toEqual({ inside: true, cut: true, ellipsis: "ellipsis" });
  });
});

test.describe("Column widths by the sheet's letters", () => {
  test("a column no table has: its letter's edge dragged sets its width in the first table's metadata; a double click takes it off", async ({ page }) => {
    await openSheet(page);
    const letters = page.locator(".swt-sheet-letters > span:not([hidden])");
    // A column in view past the table (not the last, which the view's edge may cut)
    const letter = letters.nth((await letters.count()) - 2);
    const name = (await letter.textContent())!;
    const before = (await letter.boundingBox())!;
    const edge = letter.locator(".swt-sheet-width");
    const at = (await edge.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 60, at.y + at.height / 2, { steps: 4 });
    // Shown as it is dragged
    await expect.poll(async () => Math.round((await letter.boundingBox())!.width)).toBe(Math.round(before.width) + 60);
    await page.mouse.up();
    await expect.poll(() => markdown(page)).toMatch(new RegExp(`sheet\\.width\\.${name}='${Math.round(before.width) + 60}'`));
    await page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: new RegExp(`^${name}$`) }).locator(".swt-sheet-width").dblclick();
    await expect.poll(() => markdown(page)).not.toContain(`sheet.width.${name}=`);
  });
});

test.describe("Middle-button autoscroll on the sheet", () => {
  test("from an empty cell, as from a table's: the board scrolls both ways", async ({ page }) => {
    await openSheet(page);
    const board = page.locator(".swt-sheet-board");
    const point = await emptyCell(page, { right: 1, row: 1 });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(point.x + 120, point.y + 120, { steps: 4 });
    await expect.poll(() => board.evaluate((b) => [b.scrollLeft > 0, b.scrollTop > 0])).toEqual([true, true]);
    await page.mouse.up({ button: "middle" });
    // Held and dragged: let go, it ends
    const at = await board.evaluate((b) => [b.scrollLeft, b.scrollTop]);
    await page.waitForTimeout(150);
    expect(await board.evaluate((b) => [b.scrollLeft, b.scrollTop])).toEqual(at);
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
  });
});

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

  test("one left empty adds nothing; a value two rows under the table makes a table of its own, the table alone made a sheet with it", async ({ page }) => {
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
    // Two rows under the table (not right under it, as a spreadsheet's table grows): a table of its own
    const point = await emptyCell(page, { below: 1, column: 0 });
    await page.mouse.click(point.x, point.y);
    await page.keyboard.type("Plum");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
    await expect(page.locator("#flash > div", { hasText: "on the sheet Sheet1 now" })).toBeVisible();
    const text = await markdown(page);
    // The table on the sheet Sheet1 at A1, named; the new one at A8 (the table takes rows 1 to 7), in the same edit
    expect(text).toMatch(/\| Šípek .*\|\n\| <meta name='table1' sheet='Sheet1' at='A1'> \|/);
    expect(text).toMatch(/\| Column 1 +\|\n\| -+ \|\n\| Plum +\|\n\| <meta name='table2' sheet='Sheet1' at='A8'> \|/);
    await expect(page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)")).toHaveCount(2);
  });

  test("a click elsewhere: on a table's cell selects it, on another empty cell selects that one, an edit saved first", async ({ page }) => {
    await openSheet(page);
    const first = await emptyCell(page, { right: 0, row: 2 });
    await page.mouse.click(first.x, first.y);
    await page.mouse.click(first.x, first.y);
    await page.keyboard.type("a");
    // Another empty cell (right under the table): the edit is saved (the table grows by a column), that cell selected
    const second = await emptyCell(page, { below: 0, column: 1 });
    await sheetRendersAnew(page, () => page.mouse.click(second.x, second.y));
    await expect(page.locator(".swt-sheet-cell")).toBeVisible();
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
    expect(await markdown(page)).toMatch(/\| Origin +\| Column 5 +\|/);
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

  test("cells pasted into an empty cell no table grows to make a table there, their first row its header", async ({ page }) => {
    await openSheet(page);
    const point = await emptyCell(page, { right: 2, row: 1 });
    await page.mouse.click(point.x, point.y);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.keyboard.press("Control+v");
    const field = page.locator(".swt-sheet-cell .swt-cell-editor");
    await expect(field).toBeFocused();
    await field.evaluate((input) => {
      const data = new DataTransfer();
      data.setData("text/plain", "Fruit\tQty\nPear\t3\nFig\t\n");
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)")).toHaveCount(2);
    const text = await markdown(page);
    expect(text).toMatch(/\| Fruit +\| Qty +\|\n\|[- |]+\|\n\| Pear +\| 3 +\|\n\| Fig +\| +\|\n\| <meta name='table2' sheet='Sheet1' at='\w+2'> \|/);
    await expect(page.locator(".swt-sheet-cell")).toHaveCount(0);
    await expect(page.locator(".swt-cell-editor")).toHaveCount(0);
  });

  test("one row pasted into an empty cell: its values in that cell's row, the header above them; the keys stay the board's", async ({ page }) => {
    await openSheet(page);
    const point = await emptyCell(page, { below: 3, column: 0 });
    await page.mouse.click(point.x, point.y);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.keyboard.press("Control+v");
    const field = page.locator(".swt-sheet-cell .swt-cell-editor");
    await expect(field).toBeFocused();
    await field.evaluate((input) => {
      const data = new DataTransfer();
      data.setData("text/plain", "a\tb");
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => markdown(page)).toMatch(/\| Column 1 +\| Column 2 +\|\n\|[- |]+\|\n\| a +\| b +\|\n\| <meta name='table2' sheet='Sheet1' at='A(\d+)'> \|/);
    // The first table takes the sheet's rows 1 to N (its header and body), the cell pasted into is row N + 4 (three
    // empty rows under it): the new table starts on the row above, so its value is in that cell
    const first = await sheetTable(page).first().locator("tr[data-swt-row], thead tr").count();
    const at = Number(/name='table2' sheet='Sheet1' at='A(\d+)'/.exec(await markdown(page))![1]);
    expect(at).toBe(first + 4 - 1);
    expect(await page.evaluate(() => document.activeElement?.classList.contains("swt-sheet-board"))).toBe(true);
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
    const icon = (label: string) => tableIcon(page, label);
    await hoverCell(page, cell(page, 1, 0));
    await (await icon("Full screen")).click();
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
    await hoverCell(page, cell(page, 1, 0));
    await (await icon("Sheet view")).click();
    await expect(sheetTable(page)).toHaveClass(/swt-sheet/);
    await expect(table(page)).not.toHaveClass(/swt-fullscreen/);
    await hoverCell(page, sheetCell(page, 1, 0));
    await expect(await icon("Full screen")).toHaveAttribute("aria-pressed", "false");
    await expect(await icon("Exit sheet view")).toHaveAttribute("aria-pressed", "true");
    // Esc closes the ⋯ menu the icons are in (without the toolbarNames setting), then the view
    if (await page.locator(".swt-menu").count()) {
      await page.keyboard.press("Escape");
      await expect(page.locator(".swt-menu")).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await expect(sheetTable(page)).toHaveCount(0);
    await expect(table(page)).not.toHaveClass(/swt-over-window/);
    // Full screen as before: over the window, no empty cells
    await hoverCell(page, cell(page, 1, 0));
    await (await icon("Full screen")).click();
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
    await expect(page.locator(".swt-sheet-grid")).toHaveCount(0);
  });

  test("full screen from the sheet's toolbar: the sheet ends, the page's table shows over the window", async ({ page }) => {
    await openSheet(page);
    await hoverCell(page, sheetCell(page, 1, 0));
    await (await tableIcon(page, "Full screen")).click();
    await expect(sheetTable(page)).toHaveCount(0);
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
    await expect(table(page)).toBeVisible();
  });

  test("full screen keeps room right of the table: the + of a new column there, clear of the toolbar, the rows numbered on both sides", async ({ page }) => {
    await hoverCell(page, cell(page, 1, 0));
    await (await tableIcon(page, "Full screen")).click();
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
    await (await tableIcon(page, "Full screen")).click();
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
    // The page's text read again: the board ends
    await expect(sheetTable(page)).toHaveCount(0);
    await expect(page.locator(".swt-sheet-board")).toHaveCount(0);
  });

  test("drawn anew with the table moved in the page: its place follows", async ({ page }) => {
    await openSheet(page);
    const before = Number(await sheetTable(page).locator("table").getAttribute("data-pos"));
    await page.locator("#source").fill(`A paragraph before.\n\n${await markdown(page)}`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(sheetTable(page).locator("table")).toHaveAttribute("data-pos", String(before + "A paragraph before.\n\n".length));
  });

  test("a cell being edited in it stays edited while the table is drawn anew from a change elsewhere", async ({ page }) => {
    await openSheet(page);
    await sheetCell(page, 1, 0).dblclick();
    const field = sheetTable(page).locator(".swt-cell-editor");
    await expect(field).toBeFocused();
    await page.keyboard.type("typed");
    // Another cell changed in the markdown (another client, a formula elsewhere)
    await page.evaluate(() => {
      const source = document.querySelector<HTMLTextAreaElement>("#source")!;
      source.value = source.value.replace("Šípek", "Šípky");
      source.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(/typed$/);
    // Left with Esc: the table drawn anew shows the change
    await page.keyboard.press("Escape");
    await expect(sheetTable(page)).toContainText("Šípky");
  });

  test("scrolled past the table, a value written there keeps the box where it was", async ({ page }) => {
    await openSheet(page);
    const box = page.locator(".swt-sheet-board");
    await box.evaluate((w) => (w.scrollLeft = 400));
    const scrolled = await box.evaluate((w) => w.scrollLeft);
    expect(scrolled).toBeGreaterThan(300);
    const point = await emptyCell(page, { right: 6, row: 1 });
    await page.mouse.click(point.x, point.y);
    await page.keyboard.type("far");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
    expect(Math.abs((await box.evaluate((w) => w.scrollLeft)) - scrolled)).toBeLessThan(2);
  });

  test("a sheet of two tables shows both at their places; a growth into the other moves it as far as it reaches", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta sheet='Plan' at='A1'> |\n\nText between.\n\n| City | Zip |\n|---|---|\n| Brno | 602 |\n| <meta sheet='Plan' at='B4'> |\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    await expect(drawn).toHaveCount(2);
    const letter = (text: string) => page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: new RegExp(`^${text}$`) });
    // The second at B4: under the letter B, three rows below the first's top
    const first = (await drawn.nth(0).boundingBox())!;
    const second = (await drawn.nth(1).boundingBox())!;
    const rowHeight = (await drawn.nth(0).locator("tr[data-swt-row='1'] > td").first().boundingBox())!.height;
    expect(Math.abs(second.x - (await letter("B").boundingBox())!.x)).toBeLessThan(1);
    expect(Math.abs(second.y - (first.y + 3 * rowHeight))).toBeLessThan(1);
    const a = (await letter("A").boundingBox())!;
    const x = a.x + a.width / 2;
    // A3, right below the first table: it takes the empty row, nothing moves
    await page.mouse.click(x, first.y + 2 * rowHeight + rowHeight / 2);
    await page.keyboard.type("Fig");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
    expect(await markdown(page)).toMatch(/\| Pear +\| 3 +\|\n\| Fig +\| +\|/);
    expect(await markdown(page)).toContain("<meta sheet='Plan' at='B4'>");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    // A4, right under it again: the first table grown to row 4 reaches into the second (B4:C5) by a row: it moves down one,
    // in the same edit
    await page.mouse.click(x, first.y + 3 * rowHeight + rowHeight / 2);
    await page.keyboard.type("Kiwi");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
    const text = await markdown(page);
    expect(text).toMatch(/\| Fig +\| +\|\n\| Kiwi +\| +\|/);
    expect(text).toContain("<meta sheet='Plan' at='B5'>");
    await expect.poll(async () => Math.round(((await drawn.nth(1).boundingBox())!.y - first.y) / rowHeight)).toBe(4);
  });

  test("a row added to a table with Tab moves the tables under it down by one, those beside it stay", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta name='a' sheet='Plan' at='A1'> |\n\n| Side |\n|---|\n| 1 |\n| 2 |\n| 3 |\n| <meta name='side' sheet='Plan' at='D1'> |\n\n| City |\n|---|\n| Brno |\n| <meta name='under' sheet='Plan' at='A4'> |\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 2).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    await expect(page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)")).toHaveCount(3);
    // Tab on the last cell of the last row: a new row (inserted), then Esc leaves its editor
    await sheetCell(page, 1, 1).dblclick();
    await sheetRendersAnew(page, () => page.keyboard.press("Tab"));
    const text = await markdown(page);
    expect(text).toContain("<meta name='under' sheet='Plan' at='A5'>");
    expect(text).toContain("<meta name='side' sheet='Plan' at='D1'>");
  });

  test("a formula reads in the sheet's addresses there and is stored in its table's", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Price |\n|---|---|\n| Pear | 12 |\n| Fig | 25 |\n| <meta name='prices' sheet='Plan' at='A1'> |\n\n| Item | Total |\n|---|---|\n| Pear | 24 <meta f='=prices!B1*2'> |\n| <meta name='totals' sheet='Plan' at='D1'> |\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    const totals = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)").nth(1);
    const total = totals.locator("tr[data-swt-row='1'] > td").nth(1);
    // prices!B1 (its first row, under its header in row 1 of the sheet) is B2 there
    await expect(total).toHaveAttribute("title", "=B2*2");
    await total.dblclick();
    const field = totals.locator(".swt-cell-editor");
    await expect(field).toHaveValue("=B2*2");
    // B3: Fig's price; D2: the formula's own table's Pear
    await field.fill("=B3*2&D2");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"), 1);
    expect(await markdown(page)).toContain("<meta f='=prices!B2*2&amp;A1'>");
    // Pointing at a cell of the table inserts its sheet's address, its outline on it
    await totals.locator("tr[data-swt-row='1'] > td").nth(1).dblclick();
    await totals.locator(".swt-cell-editor").fill("=");
    const pear = totals.locator("tr[data-swt-row='1'] > td").first();
    await pear.click();
    await expect(totals.locator(".swt-cell-editor")).toHaveValue("=D2");
    const outline = (await page.locator(".swt-ref-mark.swt-visible").first().boundingBox())!;
    const cellBox = (await pear.boundingBox())!;
    expect(Math.abs(outline.x - cellBox.x)).toBeLessThan(3);
    expect(Math.abs(outline.y - cellBox.y)).toBeLessThan(3);
    // A cell no table holds: #REF!, said so
    await totals.locator(".swt-cell-editor").fill("=H9");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"), 1);
    await expect(page.locator("#flash > div", { hasText: "H9 is no table's cells here" })).toBeVisible();
    await expect.poll(() => markdown(page)).toContain("<meta f='=#REF!'>");
  });

  test("a row typed under a table with a row pinned to the bottom goes above it, Enter goes on under the value", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| Total | 3 |\n| <meta pin-bottom='1'> |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(2);
    await openSheet(page);
    const point = await emptyCell(page, { below: 0, column: 0 });
    await page.mouse.click(point.x, point.y);
    await page.keyboard.type("Fig");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
    expect(await markdown(page)).toMatch(/\| Pear +\| 3 +\|\n\| Fig +\| +\|\n\| Total +\| 3 +\|/);
    // Fig went above Total: the cell under it is Total's, edited
    await expect(sheetTable(page).locator(".swt-cell-editor")).toBeFocused();
    await expect(sheetTable(page).locator(".swt-cell-editor")).toHaveValue("Total");
  });

  test("a press on the sheet over the band of the page's table under it inserts nothing there", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(2);
    // The page's table, under the board once it opens: its band of the + left of its rows
    const under = (await table(page).locator("table").boundingBox())!;
    const row = (await cell(page, 1, 0).boundingBox())!;
    await openSheet(page);
    const before = await markdown(page);
    await page.mouse.move(under.x - 12, row.y + row.height);
    await page.mouse.move(under.x - 10, row.y + row.height, { steps: 2 });
    await page.mouse.click(under.x - 10, row.y + row.height);
    await page.waitForTimeout(300);
    expect(await markdown(page)).toBe(before);
    await expect(page.locator(".swt-sheet-board")).toHaveCount(1);
  });

  test("under one table and right of another: the nearer one grows", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Price |\n|---|---|\n| Pear | 12 |\n| Fig | 25 |\n| <meta name='prices' sheet='Plan' at='A1'> |\n\n| Item | Total |\n|---|---|\n| Pear | 24 |\n| <meta name='totals' sheet='Plan' at='D1'> |\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    await expect(drawn).toHaveCount(2);
    const letter = (text: string) => page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: new RegExp(`^${text}$`) });
    const second = (await drawn.nth(1).boundingBox())!;
    const rowHeight = (await drawn.nth(1).locator("tr[data-swt-row='1'] > td").first().boundingBox())!.height;
    const d = (await letter("D").boundingBox())!;
    // D3: right of prices (two columns on, into totals) and right under totals: totals grows
    await page.mouse.click(d.x + d.width / 2, second.y + second.height + rowHeight / 2);
    await page.keyboard.type("Kiwi");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"), 1);
    expect(await markdown(page)).toMatch(/\| Pear +\| 24 +\|\n\| Kiwi +\| +\|\n\| <meta name='totals'/);
    // Enter went on to the cell under Kiwi: Esc leaves it selected, a second Esc unselects it
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toBeFocused();
  });

  test("sorted on the sheet: a formula's title follows the rows' new places at once", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Qty | Double |\n|---|--:|--:|\n| Pear | 5 | 10 <meta f='=B1*2'> |\n| Fig | 3 | 6 <meta f='=B2*2'> |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(2);
    await openSheet(page);
    // The table alone at A1: its header in row 1, Pear's row 2
    await expect(sheetCell(page, 1, 2)).toHaveAttribute("title", "=B2*2");
    await sheetTable(page).locator("thead tr > *").nth(1).hover();
    await sheetTable(page).locator("thead tr > *").nth(1).locator(".swt-sort").click();
    // Sorted by Qty: Fig first, Pear in row 3
    await expect(sheetTable(page).locator("tbody tr").first()).toContainText("Fig");
    await expect(sheetCell(page, 1, 2)).toHaveAttribute("title", "=B3*2");
    await expect(sheetCell(page, 2, 2)).toHaveAttribute("title", "=B2*2");
  });

  test("sorted on the sheet: a range dragged over says why it is not pointed at, a header click gives the column", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Qty | Double |\n|---|--:|--:|\n| Pear | 5 | 10 |\n| Fig | 3 | 6 |\n| Kiwi | 4 | 8 |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(3);
    await openSheet(page);
    await sheetTable(page).locator("thead tr > *").nth(1).hover();
    await sheetTable(page).locator("thead tr > *").nth(1).locator(".swt-sort").click();
    await expect(sheetTable(page).locator("tbody tr").first()).toContainText("Fig");
    // Pear's Double (the last row shown): a new formula
    await sheetCell(page, 1, 2).dblclick();
    const field = sheetTable(page).locator(".swt-cell-editor");
    await field.fill("=SUM(");
    // Shown: Fig, Kiwi (row 3), Pear (row 4); dragged over Kiwi's and Pear's Qty: the markdown's third and first rows, not one range
    const from = (await sheetCell(page, 3, 1).boundingBox())!;
    const to = (await sheetCell(page, 1, 1).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
    await page.mouse.up();
    // The first cell pointed at stays, the hint says why the range is not
    await expect(field).toHaveValue("=SUM(B3");
    await expect(page.locator(".swt-formula-note")).toContainText("A range cannot be pointed at in a sorted or filtered table");
    await expect(page.locator(".swt-formula-note")).toContainText("[qty]");
    // The header: the whole column, in place of the cell just pointed at
    await sheetTable(page).locator("thead tr > *").nth(1).click();
    await expect(field).toHaveValue("=SUM([qty]");
  });

  test("pointing at another table of the sheet: its header gives its column, its cell the sheet's address, stored by its name", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Price |\n|---|---|\n| Pear | 12 |\n| Fig | 25 |\n| <meta name='prices' sheet='Plan' at='A1'> |\n\n| Item | Total |\n|---|---|\n| Pear | 1 |\n| <meta name='totals' sheet='Plan' at='D1'> |\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    await expect(drawn).toHaveCount(2);
    const prices = drawn.nth(0);
    const totals = drawn.nth(1);
    // Both tables can be pointed at while the formula waits for a reference
    await totals.locator("tr[data-swt-row='1'] > td").nth(1).dblclick();
    const field = totals.locator(".swt-cell-editor");
    await field.fill("=");
    await expect(prices).toHaveClass(/\bswt-pointing\b/);
    await expect(totals).toHaveClass(/\bswt-pointing\b/);
    // The other table's header: its column, by its name
    await prices.locator("thead tr > *").nth(1).click();
    await expect(field).toHaveValue("=prices![price]");
    // Its cell, in place of the reference just pointed at: the sheet's address (Fig's price, row 3), outlined there
    const fig = prices.locator("tr[data-swt-row='2'] > td").nth(1);
    await fig.click();
    await expect(field).toHaveValue("=B3");
    const outline = (await page.locator(".swt-ref-mark.swt-visible").first().boundingBox())!;
    const box = (await fig.boundingBox())!;
    expect(Math.abs(outline.x - box.x)).toBeLessThan(3);
    expect(Math.abs(outline.y - box.y)).toBeLessThan(3);
    await page.keyboard.type("*2");
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"), 1);
    expect(await markdown(page)).toMatch(/\| Pear +\| 50 <meta f='=prices!B2\*2'> +\|/);
  });

  test("a value typed far from the tables makes a table of its own there, a formula as text", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Price |\n|---|---|\n| Pear | 12 |\n| <meta name='prices' sheet='Plan' at='A3'> |\n\nText after.\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    const letter = (text: string) => page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: new RegExp(`^${text}$`) });
    const prices = (await drawn.nth(0).boundingBox())!;
    const rowHeight = (await drawn.nth(0).locator("tr[data-swt-row='1'] > td").first().boundingBox())!.height;
    const d = (await letter("D").boundingBox())!;
    // D8: right of no table's rows, under no table's columns
    await page.mouse.click(d.x + d.width / 2, prices.y + 5 * rowHeight + rowHeight / 2);
    await page.keyboard.type("Brno");
    await page.keyboard.press("Enter");
    await expect(drawn).toHaveCount(2);
    let text = await markdown(page);
    // After the sheet's last table, its header above the cell typed into: D7
    expect(text).toMatch(/\| <meta name='prices' sheet='Plan' at='A3'> \|\n\n\| Column 1 +\|\n\| -+ \|\n\| Brno +\|\n\| <meta name='table1' sheet='Plan' at='D7'> \|\n\nText after\./);
    // Enter went on under the value: the cell there grows the new table
    await expect(page.locator(".swt-sheet-cell .swt-cell-editor")).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    // A1: on the sheet's first row the table starts there, the value under it; a formula is text
    const a = (await letter("A").boundingBox())!;
    await page.mouse.click(a.x + a.width / 2, prices.y - 2 * rowHeight + rowHeight / 2);
    await page.keyboard.type("=B4*2");
    await page.keyboard.press("Enter");
    await expect(page.locator("#flash > div", { hasText: "saved as text" })).toBeVisible();
    await expect(drawn).toHaveCount(3);
    text = await markdown(page);
    expect(text).toMatch(/\| Column 1 +\|\n\| -+ \|\n\| =B4\*2 +\|\n\| <meta name='table2' sheet='Plan' at='A1'> \|/);
    // Edited in its table now: shown as text ('=), the ' removed it is a formula, B4 read in the sheet's addresses (Pear's price)
    const made = drawn.filter({ hasText: '=B4*2' });
    await made.locator("tr[data-swt-row='1'] > td").first().dblclick();
    const field = page.locator(".swt-cell-editor");
    await expect(field).toHaveValue("'=B4*2");
    await field.fill("=B4*2");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toMatch(/\| 24 <meta f='=prices!B1\*2'> +\|\n\| <meta name='table2'/);
  });

  test("far from the tables: '= is text as elsewhere, and a cell pressed meanwhile is pressed once the table is made", async ({ page }) => {
    await page
      .locator("#source")
      .fill("# Test\n\n| Item | Price |\n|---|---|\n| Pear | 12 |\n| <meta name='prices' sheet='Plan' at='A3'> |\n\n| Other |\n|---|\n| x |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    const letter = (text: string) => page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: new RegExp(`^${text}$`) });
    const prices = (await drawn.nth(0).boundingBox())!;
    const rowHeight = (await drawn.nth(0).locator("tr[data-swt-row='1'] > td").first().boundingBox())!.height;
    const d = (await letter("D").boundingBox())!;
    await page.mouse.click(d.x + d.width / 2, prices.y + 5 * rowHeight + rowHeight / 2);
    await page.keyboard.type("'=total");
    // A press on Pear's price while it is edited: the table made, then the press acts on Pear's price (select mode: selected)
    await drawn.nth(0).locator("tr[data-swt-row='1'] > td").nth(1).click();
    await expect(drawn).toHaveCount(2);
    const text = await markdown(page);
    // Its text =total, without the '; written after the page's last table (Other), no flash about a formula
    expect(text).toMatch(/\| Other \|\n\|---\|\n\| x \|\n\n\| Column 1 +\|\n\| -+ \|\n\| =total +\|\n\| <meta name='table1' sheet='Plan' at='D7'> \|/);
    await expect(page.locator("#flash > div", { hasText: "saved as text" })).toHaveCount(0);
    await expect(drawn.nth(0).locator("tr[data-swt-row='1'] > td").nth(1)).toHaveClass(/swt-selected/);
  });

  test("far from a table on no sheet without the metadata setting: nothing made, said why, the keys reach no page", async ({ page }) => {
    // The setting off (the playground's settings, as its dialog keeps them)
    await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem("silverwarePlayground.settings") ?? "{}");
      localStorage.setItem("silverwarePlayground.settings", JSON.stringify({ ...store, "silverware.table.metadata": false }));
    });
    await page.reload();
    await openSheet(page);
    const before = await markdown(page);
    const box = (await sheetTable(page).locator("table").boundingBox())!;
    await page.mouse.click(box.x + box.width + 250, box.y + box.height + 200);
    await page.keyboard.type("lost");
    await expect(page.locator("#flash > div", { hasText: "Store table metadata" })).toBeVisible();
    // What is typed goes nowhere: not into the page under the board, which keeps the focus
    await page.waitForTimeout(200);
    expect(await markdown(page)).toBe(before);
    await expect(page.locator(".swt-sheet-board")).toBeFocused();
  });

  test("cells pasted into a far cell go into no table (the one its editor belongs to, past its end, either): a table of their own", async ({ page }) => {
    await openSheet(page);
    const before = (await markdown(page)).split("\n").filter((line) => line.startsWith("|") && !line.includes("<meta")).map((line) => line.replace(/ +/g, "").replace(/-+/g, "-"));
    const box = (await sheetTable(page).locator("table").boundingBox())!;
    await page.mouse.click(box.x + box.width + 250, box.y + box.height + 200);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.keyboard.press("Control+v");
    const field = page.locator(".swt-sheet-cell .swt-cell-editor");
    await expect(field).toBeFocused();
    await field.evaluate((input) => {
      const data = new DataTransfer();
      data.setData("text/plain", "x\ty\n1\t2");
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => markdown(page)).toMatch(/\| x +\| y +\|\n\|[- |]+\|\n\| 1 +\| 2 +\|/);
    // The table's rows as they were (aligned anew: written with its sheet), before the new table
    const after = (await markdown(page)).split("\n").filter((line) => line.startsWith("|") && !line.includes("<meta")).map((line) => line.replace(/ +/g, "").replace(/-+/g, "-"));
    expect(after.slice(0, before.length)).toEqual(before);
  });

  test("AutoFill on the sheet: the fill handle in a cell's corner can be dragged", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|--:|\n| Pear | 1 |\n| Fig | 2 |\n| Kiwi | |\n| Plum | |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(4);
    await openSheet(page);
    // Pear's and Fig's Qty selected, the handle dragged down to Plum's: 3, 4
    const from = (await sheetCell(page, 1, 1).boundingBox())!;
    const to = (await sheetCell(page, 2, 1).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
    await page.mouse.up();
    const handle = page.locator(".swt-fill-handle");
    await expect(handle).toBeVisible();
    const h = (await handle.boundingBox())!;
    const plum = (await sheetCell(page, 4, 1).boundingBox())!;
    // The handle is what is under the pointer at its centre (not cut off by its cell)
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".swt-fill-handle"), { x: h.x + h.width / 2, y: h.y + h.height / 2 })).toBe(true);
    await sheetRendersAnew(page, async () => {
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(plum.x + plum.width / 2, plum.y + plum.height / 2, { steps: 6 });
      await page.mouse.up();
    });
    expect(await markdown(page)).toMatch(/\| Kiwi +\| +3 \|\n\| Plum +\| +4 \|/);
  });

  test("a column's width dragged on the sheet is the sheet's column's, for every table in it", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Price |\n|---|---|\n| Pear | 12 |\n| <meta name='prices' sheet='Plan' at='A1'> |\n\n| City | Zip |\n|---|---|\n| Brno | 602 |\n| <meta name='cities' sheet='Plan' at='A5'> |\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await openSheet(page);
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    await expect(drawn).toHaveCount(2);
    const letterA = page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: /^A$/ });
    const head = drawn.nth(0).locator("thead tr > *").first();
    const startWidth = (await head.boundingBox())!.width;
    await head.hover();
    const handle = drawn.nth(0).locator(".swt-col-resize").first();
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 60, h.y + h.height / 2, { steps: 5 });
    await page.mouse.up();
    // Stored as the sheet's column A, in its first table; the table's own width is not written
    await expect.poll(() => markdown(page)).toMatch(/<meta name='prices' sheet='Plan' at='A1' sheet\.width\.A='\d+'>/);
    expect(await markdown(page)).not.toContain("width.item");
    const width = Number((await markdown(page)).match(/sheet\.width\.A='(\d+)'/)![1]);
    expect(Math.abs(width - (startWidth + 60))).toBeLessThan(3);
    // Both tables' first columns, and the letter A, that wide
    await expect.poll(async () => Math.round((await drawn.nth(1).locator("thead tr > *").first().boundingBox())!.width)).toBe(width);
    expect(Math.round((await letterA.boundingBox())!.width)).toBe(width);
    // A double-click on the handle: automatic again
    await head.hover();
    const again = (await handle.boundingBox())!;
    await page.mouse.dblclick(again.x + again.width / 2, again.y + again.height / 2);
    await expect.poll(() => markdown(page)).not.toContain("sheet.width.A");
  });

  test("a column's width dragged on a table alone is its sheet view's column's, as on a sheet", async ({ page }) => {
    await openSheet(page);
    const head = sheetTable(page).locator("thead tr > *").first();
    await head.hover();
    const h = (await sheetTable(page).locator(".swt-col-resize").first().boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 50, h.y + h.height / 2, { steps: 5 });
    await page.mouse.up();
    // Kept in the table as a sheet's first table keeps it; its own width (the page's) is not written
    await expect.poll(() => markdown(page)).toMatch(/sheet\.width\.A='\d+'/);
    expect(await markdown(page)).not.toMatch(/ width\.name=/);
    const width = Number((await markdown(page)).match(/sheet\.width\.A='(\d+)'/)![1]);
    await expect.poll(async () => Math.round((await head.boundingBox())!.width)).toBe(width);
  });

  test("cells pasted into another table of the sheet, and a filter that hides rows of its own table only", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 5 |\n| Kiwi | 4 |\n| <meta name='a' sheet='Plan' at='A1'> |\n\n| City | Zip |\n|---|---|\n| Brno | 602 |\n| Zlín | 760 |\n| <meta name='b' sheet='Plan' at='D1'> |\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(2);
    await openSheet(page);
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    await expect(drawn).toHaveCount(2);
    // Into b's Zip of Brno: two lines, two rows
    await drawn.nth(1).locator("tr[data-swt-row='1'] > td").nth(1).click();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.keyboard.press("Control+v");
    const field = page.locator(".swt-cell-editor");
    await expect(field).toBeFocused();
    await sheetRendersAnew(
      page,
      () =>
        field.evaluate((input) => {
          const data = new DataTransfer();
          data.setData("text/plain", "100\n200");
          input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
        }),
      1,
    );
    expect(await markdown(page)).toMatch(/\| Brno +\| 100 +\|\n\| Zlín +\| 200 +\|/);
    // a filtered (Fig only): a shows one row; b stays where it was, its rows all shown
    const bTop = (await drawn.nth(1).boundingBox())!.y;
    await drawn.nth(0).locator("tr[data-swt-row='2'] > td").first().click({ button: "right" });
    await page.locator(".swt-menu.swt-visible").getByText("Filter: = Fig").first().click();
    await expect(drawn.nth(0).locator("tbody tr:visible")).toHaveCount(1);
    await expect(drawn.nth(1).locator("tbody tr:visible")).toHaveCount(2);
    // (Drawn anew while a write of the filter is read: no box for a moment)
    await expect.poll(async () => (await drawn.nth(1).boundingBox())?.y).toBe(bTop);
  });

  test("a row pinned to the bottom stays last on the sheet, sorted or not", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|--:|\n| Pear | 3 |\n| Fig | 5 |\n| Total | 8 |\n| <meta pin-bottom='1'> |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(3);
    await openSheet(page);
    // Rows pinned to the bottom are in the table's foot: every body row, in the order shown
    const rows = sheetTable(page).locator("tr[data-swt-row]:not([data-swt-row='0'])");
    await expect(rows.last()).toContainText("Total");
    const head = sheetTable(page).locator("thead tr > *").nth(1);
    await head.hover();
    await head.locator(".swt-sort").click();
    await head.locator(".swt-sort").click();
    // Descending by Qty: Fig, Pear, then Total, pinned
    await expect(rows.first()).toContainText("Fig");
    await expect(rows.last()).toContainText("Total");
  });

  test("Esc closes it", async ({ page }) => {
    await openSheet(page);
    await page.keyboard.press("Escape");
    await expect(sheetTable(page)).toHaveCount(0);
    await expect(table(page)).not.toHaveClass(/swt-over-window/);
  });
});

test("a write on the sheet lays out the sheet's table only: the page's under the board is decorated again once the sheet ends", async ({ page }) => {
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)").first();
  const first = drawn.locator("tr[data-swt-row='1'] > td").first();
  await first.dblclick();
  await page.locator(".swt-cell-editor").fill("Quince");
  await page.keyboard.press("Enter");
  await expect(drawn).toContainText("Quince");
  // SilverBullet's table of that key, rendered anew under the board: not decorated meanwhile
  const underneath = page.locator(".sb-table-widget:not(.swt-drawn)", { hasText: "Quince" });
  await expect(underneath).toHaveCount(1);
  await expect(underneath).not.toHaveClass(/swt-table/);
  // (Enter edits the cell below: its editor left first)
  await page.keyboard.press("Escape");
  await drawn.locator("tr[data-swt-row='2'] > td").first().hover();
  await (await tableIcon(page, "Exit sheet view")).click();
  await expect(page.locator(".swt-sheet-board")).toHaveCount(0);
  await expect(underneath).toHaveClass(/swt-table/);
  await expect(underneath.locator(".swt-cell-content", { hasText: "Quince" })).toHaveCount(1);
});

test("a formula's result on the sheet is marked as in the page: its underline is not cut off", async ({ page }) => {
  await page.locator("#source").fill("# Test\n\n| Item | Qty | Double |\n|---|---|---|\n| Pear | 3 | 6 <meta f='=B1*2'> |\n");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  const result = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in) tr[data-swt-row='1'] > td").nth(2);
  await expect(result).toHaveClass(/swt-formula/);
  // The box its overflow clips to reaches past the underline (0.3em under the text, 2px thick)
  const room = await result.locator(".swt-cell-content").evaluate((box) => {
    const range = document.createRange();
    range.selectNodeContents(box);
    return box.getBoundingClientRect().bottom - range.getBoundingClientRect().bottom;
  });
  expect(room).toBeGreaterThanOrEqual(5);
});

test("a cell's text on the sheet sits in the middle of its row, not pushed to its bottom", async ({ page }) => {
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  const td = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)").first().locator("tr[data-swt-row='1'] > td").first();
  await expect(td).toBeVisible();
  const box = (await td.boundingBox())!;
  const content = (await td.locator(".swt-cell-content").boundingBox())!;
  expect(Math.abs(content.y + content.height / 2 - (box.y + box.height / 2))).toBeLessThan(2);
});

test("the controls of the table clicked do not stay over the sheet or the full screen, nor after either ends", async ({ page }) => {
  // Shown and visible: the toolbar, the grips, the + a pointer brought up, a menu (the quiet + of a cell selected: apart)
  const controls = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".swt-floating.swt-visible"))
        .filter((e) => e.getBoundingClientRect().width > 0 && /swt-bar|swt-grip|swt-insert|swt-menu/.test(e.className) && !e.classList.contains("swt-quiet"))
        .map((e) => e.className),
    );
  const quiet = page.locator(".swt-insert.swt-quiet.swt-visible");
  for (const [open, exit] of [
    ["Sheet view", "Exit sheet view"],
    ["Full screen", "Exit full screen"],
  ] as const) {
    // The table's last cell selected: its quiet + of the last row and column shows, as long as the table is in sight
    await cell(page, 2, 1).click();
    await page.keyboard.press("Control+End");
    await hoverCell(page, cell(page, 2, 1));
    expect((await controls()).length).toBeGreaterThan(0);
    await expect(quiet.first()).toBeVisible();
    // The pointer stays where the icon was: nothing moved over what is shown now
    await (await tableIcon(page, open)).click();
    await expect.poll(controls).toEqual([]);
    // Over the sheet the table is out of sight, its cell still selected; in full screen it is the table shown
    if (open === "Sheet view") await expect(quiet).toHaveCount(0);
    else await expect(quiet.first()).toBeVisible();
    await page.locator(".swt-over-window, .swt-sheet-board").first().locator("td").first().hover();
    await (await tableIcon(page, exit)).click();
    await expect.poll(controls).toEqual([]);
    // Back in the page, its cell selected
    await expect(quiet.first()).toBeVisible();
  }
});

test("the sheet's scrollbars stay as they are through writes that widen a column", async ({ page }) => {
  const rows = Array.from({ length: 60 }, (_, i) => `| item ${i} | ${i} | note ${i} |`).join("\n");
  await page.locator("#source").fill(`# Test\n\n| Name | A | Note |\n|---|---|---|\n${rows}\n`);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(60);
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)").first();
  await expect(drawn).toBeVisible();
  const board = page.locator(".swt-sheet-board");
  await board.evaluate((b) => {
    b.scrollTop = 400;
    b.scrollLeft = 30;
  });
  const size = () => board.evaluate((b) => [b.scrollTop, b.scrollLeft, b.scrollWidth, b.scrollHeight]);
  await expect.poll(size).toEqual([400, 30, expect.any(Number), expect.any(Number)]);
  const before = await size();
  await drawn.locator("tr[data-swt-row='15'] > td").nth(1).dblclick();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.type(`a much longer value than before ${i}`);
    await sheetRendersAnew(page, () => page.keyboard.press("Tab"));
    expect(await size()).toEqual(before);
  }
});

test("editing a table placed lower on the sheet scrolls nothing, its column as wide as before (the cell edited next does not widen it)", async ({ page }) => {
  await page
    .locator("#source")
    .fill(
      "# Test\n\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 |\n| <meta sheet='Plan' at='A1' name='fruit'> |\n\n| Column 1 | Column 2 |\n|---|---|\n| a | sdf |\n| fdsddda | |\n| <meta sheet='Plan' at='G4' name='table1'> |\n",
    );
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(2);
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  const second = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)", { hasText: "Column 1" });
  await expect(second).toBeVisible();
  const board = page.locator(".swt-sheet-board");
  const header = second.locator("tr").first().locator("th, td").first();
  const width = (await header.boundingBox())!.width;
  for (const [row, value] of [
    [1, "edited"],
    [2, "edited2"],
  ] as const) {
    await second.locator(`tr[data-swt-row='${row}'] > td`).first().dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(value);
    await sheetRendersAnew(page, () => page.keyboard.press("Enter"), 1);
    await expect(second).toContainText(value);
    expect(await board.evaluate((b) => b.scrollTop)).toBe(0);
    expect(Math.abs((await header.boundingBox())!.width - width)).toBeLessThan(30);
  }
});

test("a table shown as a sheet but on none says so in its toolbar, red, its name a click away", async ({ page }) => {
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)").first();
  await drawn.locator("tr[data-swt-row='1'] > td").first().hover();
  // In the toolbar whatever the names setting (Shift not held), in the danger color
  const missing = page.locator(".swt-bar.swt-visible .swt-bar-name-container .swt-bar-name");
  await expect(missing).toHaveText("No sheet");
  await expect(missing).toHaveClass(/swt-attention/);
  await missing.click();
  const field = page.locator(".swt-menu .swt-menu-name");
  await expect(field).toBeFocused();
  await field.fill("Plan");
  await page.keyboard.press("Enter");
  await expect.poll(() => markdown(page)).toMatch(/sheet='Plan' at='A1'/);
  // On a sheet now: no longer asking (the names back to the setting: hidden until Shift)
  await drawn.locator("tr[data-swt-row='1'] > td").first().hover();
  await expect(page.locator(".swt-bar.swt-visible .swt-bar-names")).toHaveCount(0);
});

test("Enter in the last row's cell editor on the sheet adds a row under it", async ({ page }) => {
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)").first();
  const rows = drawn.locator("tbody tr[data-swt-row]");
  const count = await rows.count();
  await rows.last().locator("td").first().dblclick();
  await expect(page.locator(".swt-cell-editor")).toBeFocused();
  await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
  await expect(rows).toHaveCount(count + 1);
  await expect(page.locator(".swt-cell-editor")).toBeFocused();
});

test("the + pressed again and again on a sheet's table adds a row each time, with the new row's editor open meanwhile", async ({ page }) => {
  await page.locator("#source").fill("# Test\n\n| A | B |\n|---|---|\n| 1 |  |\n| 2 |  |\n| <meta sheet='Sheet1' at='A1' name='t'> |\n");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(2);
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)").first();
  await drawn.locator("tr[data-swt-row='1'] > td").first().click();
  for (let i = 1; i <= 3; i++) {
    const first = drawn.locator("tr[data-swt-row='1'] > td").first();
    const box = (await first.boundingBox())!;
    await page.mouse.move(box.x - 20, box.y + 2, { steps: 4 });
    const plus = page.locator(".swt-insert:not(.swt-quiet).swt-visible");
    await expect(plus).toHaveCount(1);
    await plus.click();
    // (Its editor opens in the new row: the next press saves it first)
    await expect(drawn.locator("tbody tr[data-swt-row]")).toHaveCount(2 + i);
  }
  await expect(page.locator("#flash > div", { hasText: "changed in the meantime" })).toHaveCount(0);
});

test.describe("Pins on the sheet", () => {
  // A table on a sheet, at B2, its first row pinned to the top, its last (Total) to the bottom, its first column left
  const rows = Array.from({ length: 30 }, (_, i) => `| item ${i} | ${i} | ${i * 2} |`).join("\n");
  const PINNED = `# Test\n\n| Name | A | B |\n|---|---|---|\n${rows}\n| Total | 435 | 870 |\n| <meta name='t' sheet='Plan' at='B2' pin-top='1' pin-bottom='1' pin-left='1'> |\n`;

  const open = async (page: Page, source: string, rows: number) => {
    await page.locator("#source").fill(source);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(rows);
    await hoverCell(page, cell(page, 1, 0));
    await (await tableIcon(page, "Sheet view")).click();
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)").first();
    await expect(drawn).toBeVisible();
    return drawn;
  };

  test("pinned rows and columns are held at the board's edges while their table is in view, never past it", async ({ page }) => {
    const drawn = await open(page, PINNED, 31);
    const board = page.locator(".swt-sheet-board");
    await board.evaluate((b) => {
      b.scrollTop = 400;
      b.scrollLeft = 150;
    });
    await page.waitForTimeout(200);
    const view = await board.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const s = getComputedStyle(b);
      return { top: r.top + parseFloat(s.borderTopWidth), left: r.left + parseFloat(s.borderLeftWidth), bottom: r.top + parseFloat(s.borderTopWidth) + b.clientHeight };
    });
    // The header (with the row pinned to the top) at the board's top, the Total row at its bottom, the pinned column at its left
    expect((await drawn.locator("thead tr").first().boundingBox())!.y).toBeCloseTo(view.top, 0);
    const total = (await drawn.locator("tr[data-swt-row='31'] > td").first().boundingBox())!;
    expect(total.y + total.height).toBeCloseTo(view.bottom, 0);
    expect((await drawn.locator("tr[data-swt-row='15'] > td").first().boundingBox())!.x).toBeCloseTo(view.left, 0);
    // Scrolled to the end: the header held goes no farther than its table
    await board.evaluate((b) => {
      b.scrollTop = b.scrollHeight;
    });
    await page.waitForTimeout(200);
    const table = (await drawn.boundingBox())!;
    const head = (await drawn.locator("thead").boundingBox())!;
    expect(head.y + head.height).toBeLessThanOrEqual(table.y + table.height + 1);
  });

  test("a value under the row pinned to the bottom goes in a row above it, which stays last", async ({ page }) => {
    const drawn = await open(page, PINNED, 31);
    await page.locator(".swt-sheet-board").evaluate((b) => {
      b.scrollTop = 700;
    });
    const total = drawn.locator("tr[data-swt-row='31'] > td").nth(1);
    await expect(total).toBeInViewport();
    const box = (await total.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 1.5);
    await page.keyboard.type("new");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("| item 29 | 29  | 58  |\n|         | new |     |\n| Total   | 435 | 870 |");
  });

  test("a value right of the column pinned to the right goes in a column left of it, which stays last", async ({ page }) => {
    const drawn = await open(page, "# Test\n\n| Name | A | Sum |\n|---|---|---|\n| x | 1 | 1 |\n| y | 2 | 2 |\n| <meta name='t' sheet='Plan' at='A1' pin-right='1'> |\n", 2);
    const sum = drawn.locator("tr[data-swt-row='1'] > td").nth(2);
    const box = (await sum.boundingBox())!;
    await page.mouse.click(box.x + box.width * 1.5, box.y + box.height / 2);
    await page.keyboard.type("note");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("| Name | A   | Column 4 | Sum |");
    expect(await markdown(page)).toContain("| x    | 1   | note     | 1   |");
  });
});

test.describe("A sheet's table drawn anew", () => {
  test("shows only laid out on the grid and enhanced, its copy standing in meanwhile: no frame without them", async ({ page }) => {
    await openSheet(page);
    // Each frame as painted (after its callbacks): any table of the board seen unplaced, unsized or not enhanced
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { unplaced: string[] }).unplaced = seen;
      const look = () => {
        setTimeout(() => {
          for (const t of document.querySelectorAll<HTMLElement>(".swt-sheet-board .swt-sheet-table")) {
            if (getComputedStyle(t).opacity === "0") continue;
            if (!t.style.left || !t.classList.contains("swt-table") || !t.querySelector("colgroup.swt-sheet-cols")) seen.push(t.className);
          }
        });
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    for (const value of ["7", "8", "9"]) {
      await sheetCell(page, 1, 1).dblclick();
      await page.keyboard.press("Control+a");
      await page.keyboard.type(value);
      await sheetRendersAnew(page, () => page.keyboard.press("Enter"));
      await expect(page.locator(".swt-stand-in")).toHaveCount(0);
    }
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as unknown as { unplaced: string[] }).unplaced)).toEqual([]);
  });
});
