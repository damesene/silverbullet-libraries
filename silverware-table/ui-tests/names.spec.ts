// The toolbar's row of names: what holds the table (its sheet) and the table, each after its icon button
import { cell, expect, hoverCell, markdown, table, tableIcon, test } from "./playground.ts";

const name = (page: import("@playwright/test").Page, slot: "container" | "table") => page.locator(`.swt-bar.swt-visible .swt-bar-name-${slot} .swt-bar-name`);

/** The toolbarNames setting on (the playground's store, as its settings dialog keeps it), the page loaded anew */
async function namesInToolbar(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem("silverwarePlayground.settings") ?? "{}");
    // (Metadata on, as the playground starts with it)
    localStorage.setItem("silverwarePlayground.settings", JSON.stringify({ "silverware.table.metadata": true, ...store, "silverware.table.toolbarNames": "always" }));
  });
  await page.reload();
}

test.describe("Names in the ⋯ menu", () => {
  test("the first row of the ⋯ menu: the sheet's and the table's names, each after its icon; a click on one its field", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
    await hoverCell(page, cell(page, 1, 0));
    // Not in the toolbar (the setting's default), nor their icons: the menu has them
    await expect(page.locator(".swt-bar.swt-visible .swt-bar-names")).toHaveCount(0);
    await expect(page.locator('.swt-bar.swt-visible button[aria-label="Sheet view"]')).toHaveCount(0);
    await expect(page.locator('.swt-bar.swt-visible button[aria-label="Full screen"]')).toHaveCount(0);
    await page.locator(".swt-bar.swt-visible .swt-bar-more").click();
    const names = page.locator(".swt-menu .swt-menu-names");
    // The sheet's name in the first row; the table's in the title, its pencil its field
    await expect(names.locator(".swt-menu-name-button")).toHaveText(["No sheet"]);
    await expect(page.locator(".swt-menu .swt-menu-title-text")).toHaveText("Table");
    // The table's icon before the title, in line with the sheet's icon under it
    const tableIcon = (await page.locator(".swt-menu .swt-menu-title-icon svg").boundingBox())!;
    const sheetIcon = (await names.locator(".swt-menu-name-icon svg").boundingBox())!;
    expect(Math.abs(tableIcon.x - sheetIcon.x)).toBeLessThan(1);
    expect(tableIcon.width).toBe(sheetIcon.width);
    await page.locator(".swt-menu .swt-menu-rename").click();
    const field = page.locator(".swt-menu .swt-menu-name");
    await expect(field).toBeFocused();
    await field.fill("fruit");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("<meta name='fruit'>");
  });
});

test("by default the toolbar shows the names while Shift alone is held; the setting offers never, always and Shift", async ({ page }) => {
  await hoverCell(page, cell(page, 1, 0));
  const names = page.locator(".swt-bar.swt-visible .swt-bar-names");
  await expect(names).toHaveCount(0);
  await page.keyboard.down("Shift");
  await expect(names).toBeVisible();
  await expect(page.locator('.swt-bar.swt-visible .swt-bar-name-container button[aria-label="Sheet view"]')).toBeVisible();
  await page.keyboard.up("Shift");
  await expect(names).toHaveCount(0);
  // The setting in its (styled) dialog: a choice of three, Shift chosen
  await page.getByRole("button", { name: "Settings" }).click();
  const backdrop = page.locator(".swt-settings-backdrop");
  expect(await backdrop.evaluate((b) => getComputedStyle(b).position)).toBe("fixed");
  const select = page.locator(".swt-settings-row", { hasText: "Names in the toolbar" }).locator("select");
  await expect(select.locator("option")).toHaveText(["Never", "Always", "While Shift is held"]);
  await expect(select).toHaveValue("shift");
});

test("Shift pressed over a table with a long name: the names beside the icons, the toolbar where it is without them", async ({ page }) => {
  await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta name='averyveryverylongtablenameindeed'> |\n");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
  await hoverCell(page, cell(page, 1, 0));
  const bar = page.locator(".swt-bar.swt-visible");
  const before = (await bar.boundingBox())!;
  await page.keyboard.down("Shift");
  await expect(bar.locator(".swt-bar-names")).toBeVisible();
  // (Placed in the next frame)
  await expect.poll(async () => (await bar.boundingBox())!.y).toBe(before.y);
  const names = (await bar.locator(".swt-bar-names").boundingBox())!;
  const main = (await bar.locator(".swt-bar-main").boundingBox())!;
  expect(names.y).toBe(main.y);
  expect(names.x + names.width).toBeLessThanOrEqual(main.x);
  expect(main.x + main.width).toBeCloseTo(before.x + before.width, 0);
});

test("long names in the ⋯ menu are cut, whole in their tooltips, the table's in the title", async ({ page }) => {
  await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta name='asdasdasdasdasdasdasdasdasda' sheet='Sheet1withaverylongnameindeed' at='A1'> |\n");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
  await hoverCell(page, cell(page, 1, 0));
  await page.locator(".swt-bar.swt-visible .swt-bar-more").click();
  const title = page.locator(".swt-menu .swt-menu-title-text");
  await expect(title).toHaveText("asdasdasdasdasdasdasdasdasda");
  await expect(title).toHaveAttribute("title", "asdasdasdasdasdasdasdasdasda");
  const sheet = page.locator(".swt-menu .swt-menu-name-button");
  await expect(sheet).toHaveCount(1);
  expect(await sheet.evaluate((b) => b.scrollWidth > b.clientWidth)).toBe(true);
  expect(await sheet.getAttribute("title")).toContain("Sheet1withaverylongnameindeed");
  // The title cut too: the menu as wide as its items
  expect(await title.evaluate((s) => s.scrollWidth > s.clientWidth)).toBe(true);
});

test.describe("Names in the toolbar", () => {
  test.beforeEach(async ({ page }) => namesInToolbar(page));

  test("a table without a name nor a sheet shows both muted; typed into their fields, it is named and put on a sheet", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(1);
    await hoverCell(page, cell(page, 1, 0));
    await expect(name(page, "table")).toHaveText("Table");
    await expect(name(page, "table")).toHaveClass(/swt-muted/);
    await expect(name(page, "container")).toHaveText("No sheet");
    await expect(name(page, "container")).toHaveClass(/swt-muted/);
    // The table's name: its field opens at once
    await name(page, "table").click();
    const field = page.locator(".swt-menu .swt-menu-name");
    await expect(field).toBeFocused();
    await field.fill("fruit");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("<meta name='fruit'>");
    await hoverCell(page, cell(page, 1, 0));
    await expect(name(page, "table")).toHaveText("fruit");
    await expect(name(page, "table")).not.toHaveClass(/swt-muted/);
    // The sheet's: a new one
    await name(page, "container").click();
    await expect(field).toBeFocused();
    await field.fill("Plan");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("<meta name='fruit' sheet='Plan' at='A1'>");
    await hoverCell(page, cell(page, 1, 0));
    await expect(name(page, "container")).toHaveText("Plan");
    // Empty: off the sheet, its name kept
    await name(page, "container").click();
    await field.fill("");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("<meta name='fruit'>");
    expect(await markdown(page)).not.toContain("sheet=");
  });

  test("over a table narrower than the toolbar on the sheet: no name wraps, nothing is cut off, the names above", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Name | Qty |\n|---|--:|\n| Apple | 10 |\n| Plum | 6 |\n| Pear | 3 |\n| Total | 19 |\n| <meta pin-bottom='1'> |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page).locator("tr[data-swt-row]")).toHaveCount(4);
    await hoverCell(page, cell(page, 1, 0));
    await (await tableIcon(page, "Sheet view")).click();
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    await expect(drawn).toHaveCount(1);
    // Sorted (a chip in the toolbar): the toolbar wider than the table
    const head = drawn.locator("thead tr > *").nth(1);
    await head.hover();
    await head.locator(".swt-sort").click();
    await drawn.locator("tr[data-swt-row='1'] > td").first().hover();
    const bar = page.locator(".swt-bar.swt-visible");
    await expect(bar.locator(".swt-chip")).toBeVisible();
    // Each row on one line, its own height
    for (const button of await bar.locator(".swt-bar-name").all()) expect((await button.boundingBox())!.height).toBeLessThan(23);
    // The names above the rest (they do not fit beside it), the whole toolbar in the window
    const names = (await bar.locator(".swt-bar-names").boundingBox())!;
    const main = (await bar.locator(".swt-bar-main").boundingBox())!;
    expect(names.y + names.height).toBeLessThanOrEqual(main.y + 1);
    expect(Math.min(names.x, main.x)).toBeGreaterThanOrEqual(0);
    const chip = (await bar.locator(".swt-chip").boundingBox())!;
    expect(chip.x).toBeGreaterThanOrEqual(0);
  });

  test("the icons before the names open the sheet view and the full screen", async ({ page }) => {
    await hoverCell(page, cell(page, 1, 0));
    await page.locator('.swt-bar-name-container button[aria-label="Sheet view"]').click();
    await expect(page.locator(".swt-sheet-board")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".swt-sheet-board")).toHaveCount(0);
    await hoverCell(page, cell(page, 1, 0));
    await page.locator('.swt-bar-name-table button[aria-label="Full screen"]').click();
    await expect(table(page)).toHaveClass(/swt-fullscreen/);
  });

  test("a table of a sheet view moved to another sheet by its name: the view shows that sheet", async ({ page }) => {
    await page
      .locator("#source")
      .fill(
        "# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta name='a' sheet='Plan' at='A1'> |\n\n| City |\n|---|\n| Brno |\n| <meta name='b' sheet='Plan' at='D1'> |\n",
      );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await hoverCell(page, cell(page, 1, 0));
    await (await tableIcon(page, "Sheet view")).click();
    const drawn = page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
    await expect(drawn).toHaveCount(2);
    // b's sheet named Other: b moves there (its place kept, free there), the view follows it
    await drawn.nth(1).locator("tr[data-swt-row='1'] > td").first().hover();
    await name(page, "container").click();
    await page.locator(".swt-menu .swt-menu-name").fill("Other");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("<meta name='b' sheet='Other' at='D1'>");
    await expect(drawn).toHaveCount(1);
    await expect(drawn.first()).toContainText("Brno");
  });
});
