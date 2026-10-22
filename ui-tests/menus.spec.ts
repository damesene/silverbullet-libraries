import type { Page } from "@playwright/test";
import { bodyRows, cell, center, expect, header, hoverCell, markdown, menu, menuTitle, table, test } from "./playground.ts";

test.describe("Toolbar and menus", () => {
  test("the toolbar shows over the table hovered; its ⋯ menu has the core's items and closes with Esc", async ({ page }) => {
    await hoverCell(page, cell(page, 2, 1));
    await expect(page.locator(".tp-bar.tp-visible")).toBeVisible();
    await page.locator(".tp-bar .tp-bar-more").click();
    const items = menu(page).locator(".tp-menu-item");
    await expect(items.filter({ hasText: "Format table" })).toHaveCount(1);
    await expect(items.filter({ hasText: "Edit markdown" })).toHaveCount(1);
    await expect(items.filter({ hasText: "Table Plus settings…" })).toHaveCount(1);
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
    await header(page, 1).click({ button: "right" });
    await expect(menuTitle(page)).toHaveText("Column: Qty");
    await expect(menu(page)).toHaveCount(1);
    expect(await markdown(page)).toContain("x");
    // Its items act on the table as it is now
    await menu(page).locator('.tp-segment[aria-label="Sort descending"]').click();
    await expect(bodyRows(page).first().locator("td").nth(1)).toHaveText("24");
  });
});

test.describe("Grips", () => {
  const rowGrip = (page: Page) => page.locator(".tp-grip:not(.tp-grip-column)");

  test("a row's grip selects the row, a second click opens its menu", async ({ page }) => {
    await hoverCell(page, cell(page, 2, 1));
    await rowGrip(page).click();
    await expect(table(page).locator(".tp-selected")).toHaveCount(4);
    await rowGrip(page).click();
    await expect(menuTitle(page)).toHaveText("Row 2");
  });

  test("a row dragged by its grip moves in the markdown", async ({ page }) => {
    await hoverCell(page, cell(page, 1, 1));
    const grip = await center(rowGrip(page));
    const below = await cell(page, 3, 1).boundingBox();
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x, below!.y + below!.height - 2, { steps: 10 });
    await page.mouse.up();
    await expect(bodyRows(page).locator("td:first-child")).toHaveText(["apple", "Fig", "Pear", "Banana", "Kiwi", "Šípek"]);
    expect(await markdown(page)).toMatch(/\| Fig[^\n]*\n\| Pear/);
  });

  test("a row dragged in a table scrolled sideways keeps the table where it is scrolled", async ({ page }) => {
    const widget = table(page);
    // Wider than its box: once the layout is followed (a scroll), the box scrolls sideways (not clipped as one that fits)
    await widget.evaluate((w) => {
      w.style.maxWidth = "250px";
      w.querySelector("table")!.style.minWidth = "600px";
      w.ownerDocument.defaultView!.dispatchEvent(new Event("scroll"));
    });
    await expect(widget).not.toHaveClass(/tp-sticky-native/);
    await widget.evaluate((w) => (w.scrollLeft = 60));
    expect(await widget.evaluate((w) => w.scrollLeft)).toBe(60);
    await hoverCell(page, cell(page, 1, 1));
    const grip = await center(rowGrip(page));
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(grip.x, grip.y + i * 6);
    expect(await widget.evaluate((w) => w.scrollLeft)).toBe(60);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
});
