import type { Page } from "@playwright/test";
import { cell, center, columnCells, drag, expect, header, hoverCell, markdown, menu, menuTitle, rendersAnew, table, test } from "./playground.ts";

test("one menu at a time: a column's menu open, the ⋯ menu closes it, and the reverse", async ({ page }) => {
  // The column's menu: a right click on its header
  await header(page, 1).click({ button: "right" });
  await expect(menu(page)).toHaveCount(1);
  await expect(menuTitle(page)).toContainText("Column");
  await hoverCell(page, cell(page, 1, 0));
  await page.locator(".swt-bar.swt-visible .swt-bar-more").click();
  await expect(menu(page)).toHaveCount(1);
  await expect(menuTitle(page)).toContainText("Table");
  await header(page, 1).click({ button: "right" });
  await expect(menu(page)).toHaveCount(1);
  await expect(menuTitle(page)).toContainText("Column");
});

test("Copy as Markdown in the ⋯ menu: the table as plain markdown in the clipboard, no hidden tags", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|--:|\n| **Pear** | 3 <meta formulas.f='=1+2'> |\n| <meta core.table core.name='fruit'> |\n");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
  await hoverCell(page, cell(page, 1, 0));
  await page.locator(".swt-bar.swt-visible .swt-bar-more").click();
  await menu(page).locator(".swt-menu-item", { hasText: "Copy as Markdown" }).click();
  // (The system's clipboard on Windows gives its line breaks as CRLF)
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll("\r\n", "\n"))).toBe("| Item | Qty |\n|---|---:|\n| **Pear** | 3 |\n");
});

test.describe("Toolbar and menus", () => {
  test("the toolbar shows over the table hovered; its ⋯ menu has the core's items and closes with Esc", async ({ page }) => {
    await hoverCell(page, cell(page, 2, 1));
    await expect(page.locator(".swt-bar.swt-visible")).toBeVisible();
    await page.locator(".swt-bar .swt-bar-more").click();
    const items = menu(page).locator(".swt-menu-item");
    await expect(items.filter({ hasText: "Format table" })).toHaveCount(1);
    await expect(items.filter({ hasText: "Edit markdown" })).toHaveCount(1);
    await expect(items.filter({ hasText: "Silverware Table settings…" })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
  });

  test("a right click opens the cell's menu; a press elsewhere closes it", async ({ page }) => {
    await cell(page, 2, 1).click({ button: "right" });
    await expect(menuTitle(page)).toHaveText("Cell: Qty, row 2");
    await page.mouse.click(5, 5);
    await expect(menu(page)).toHaveCount(0);
  });

  test("a header's menu asked for while a cell is edited opens on the table rendered anew", async ({ page }) => {
    await cell(page, 1, 0).dblclick();
    await page.keyboard.type("x");
    // The right click saves the edit: the table is rendered anew under the menu
    await rendersAnew(page, () => header(page, 1).click({ button: "right" }));
    await expect(menuTitle(page)).toHaveText("Column: Qty");
    await expect(menu(page)).toHaveCount(1);
    expect(await markdown(page)).toMatch(/\| Pearx +\| +3 \|/);
    // Its items act on the table as it is now
    await menu(page).locator('.swt-segment[aria-label="Sort descending"]').click();
    await expect(columnCells(page, 1)).toHaveText(["24", "10", "7", "3", "2", "1"]);
  });
});

test.describe("Grips", () => {
  const rowGrip = (page: Page) => page.locator(".swt-grip:not(.swt-grip-column)");

  test("a row's grip selects the row, a second click opens its menu", async ({ page }) => {
    await hoverCell(page, cell(page, 2, 1));
    await rowGrip(page).click();
    await expect(table(page).locator(".swt-selected")).toHaveCount(4);
    await rowGrip(page).click();
    await expect(menuTitle(page)).toHaveText("Row 2");
  });

  /** The first row dragged by its grip to the bottom edge of the third */
  async function dragFirstRowDown(page: Page, release = true): Promise<void> {
    await hoverCell(page, cell(page, 1, 1));
    const grip = await center(rowGrip(page));
    const third = (await cell(page, 3, 1).boundingBox())!;
    await drag(page, rowGrip(page), { x: grip.x, y: third.y + third.height - 2 }, { release });
  }

  test("a row dragged by its grip moves in the markdown", async ({ page }) => {
    await rendersAnew(page, () => dragFirstRowDown(page));
    await expect(columnCells(page, 0)).toHaveText(["apple", "Fig", "Pear", "Banana", "Kiwi", "Šípek"]);
    expect(await markdown(page)).toMatch(/\| Fig[^\n]*\n\| Pear/);
  });

  test("a row dragged in a table scrolled sideways keeps the table where it is scrolled", async ({ page }) => {
    const widget = table(page);
    // Wider than its box (style set here: no table of the sample is): once the
    // layout is followed (a scroll), the box scrolls sideways, not clipped as one that fits
    await widget.evaluate((w) => {
      w.style.maxWidth = "250px";
      w.querySelector("table")!.style.minWidth = "600px";
      w.ownerDocument.defaultView!.dispatchEvent(new Event("scroll"));
    });
    await expect(widget).not.toHaveClass(/swt-sticky-native/);
    await widget.evaluate((w) => (w.scrollLeft = 60));
    await expect.poll(() => widget.evaluate((w) => w.scrollLeft)).toBe(60);
    // While dragging: the row grip is near the box's left edge, which scrolls nothing sideways.
    // (Once let go, the table rendered anew has not the style set here: its scroll is not checked.)
    await dragFirstRowDown(page, false);
    expect(await widget.evaluate((w) => w.scrollLeft)).toBe(60);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
});

test("Delete table, last in the ⋯ menu, asks and takes the table out of the page; No keeps it", async ({ page }) => {
  await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n\nBetween.\n\n| City |\n|---|\n| Brno |\n");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
  const asked: string[] = [];
  const answer = (yes: boolean) =>
    page.once("dialog", (dialog) => {
      asked.push(dialog.message());
      void (yes ? dialog.accept() : dialog.dismiss());
    });
  const deleteFirst = async () => {
    await hoverCell(page, cell(page, 1, 0));
    await page.locator(".swt-bar.swt-visible .swt-bar-more").click();
    const items = page.locator(".swt-menu .swt-menu-item");
    await expect(items.last()).toHaveText("Delete table");
    await items.last().click();
  };
  answer(false);
  await deleteFirst();
  await expect.poll(() => asked.length).toBe(1);
  expect(await markdown(page)).toContain("| Pear | 3 |");
  answer(true);
  await deleteFirst();
  await expect.poll(() => markdown(page)).toBe("# Test\n\nBetween.\n\n| City |\n|---|\n| Brno |\n");
  expect(asked[1]).toBe("Delete the table (1 row) from the page? Ctrl+Z brings it back.");
  // The toolbar and menu of the table deleted do not stay
  await expect(page.locator(".swt-menu")).toHaveCount(0);
});
