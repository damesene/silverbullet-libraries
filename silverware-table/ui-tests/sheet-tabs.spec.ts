// The sheets' tabs at the sheet view's bottom: going to another sheet, a new one, renaming and removing one
import type { Page } from "@playwright/test";
import { cell, expect, hoverCell, markdown, table, tableIcon, test } from "./playground.ts";

const PAGE =
  "# Test\n\n| Item | Qty |\n|---|---|\n| Pear | 3 |\n| <meta core.table core.name='a' sheet.name='Plan' sheet.at='A1' sheet.width.A='120'> |\n\n" +
  "| City |\n|---|\n| Brno |\n| <meta core.table core.name='b' sheet.name='Plan' sheet.at='D1'> |\n\n| Code |\n|---|\n| X1 |\n| <meta core.table core.name='c' sheet.name='Q3' sheet.at='B2'> |\n";

const drawn = (page: Page) => page.locator(".sb-table-widget.swt-drawn.swt-sheet-table:not(.swt-stand-in)");
const tab = (page: Page, name: string) => page.locator(".swt-sheet-tabs .swt-sheet-tab", { hasText: new RegExp(`^${name}$`) });

async function openPlan(page: Page): Promise<void> {
  await page.locator("#source").fill(PAGE);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(table(page, 2).locator("tr[data-swt-row]")).toHaveCount(1);
  await hoverCell(page, cell(page, 1, 0));
  await (await tableIcon(page, "Sheet view")).click();
  await expect(drawn(page)).toHaveCount(2);
}

test.describe("The sheets' tabs", () => {
  test("one tab per sheet of the page, the one shown selected; a click on another, or Ctrl+Shift+PageDown / PageUp, goes there", async ({ page }) => {
    await openPlan(page);
    await expect(page.locator(".swt-sheet-tabs .swt-sheet-tab")).toHaveText(["Plan", "Q3"]);
    await expect(tab(page, "Plan")).toHaveAttribute("aria-selected", "true");
    await tab(page, "Q3").click();
    await expect(drawn(page)).toHaveCount(1);
    await expect(drawn(page)).toContainText("X1");
    await expect(tab(page, "Q3")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Control+Shift+PageUp");
    await expect(drawn(page)).toHaveCount(2);
    await page.keyboard.press("Control+Shift+PageDown");
    await expect(drawn(page)).toHaveCount(1);
  });

  test("+ shows a new empty sheet; a value typed there makes its table, and the sheet stays; one left empty goes", async ({ page }) => {
    await openPlan(page);
    await page.locator(".swt-sheet-tabs .swt-sheet-tab-add").click();
    await expect(tab(page, "Sheet1")).toHaveAttribute("aria-selected", "true");
    await expect(drawn(page)).toHaveCount(0);
    // Left empty: gone
    await tab(page, "Plan").click();
    await expect(tab(page, "Sheet1")).toHaveCount(0);
    await page.locator(".swt-sheet-tabs .swt-sheet-tab-add").click();
    await expect(drawn(page)).toHaveCount(0);
    // A value typed into B3: its table there, its header above it
    const letter = (await page.locator(".swt-sheet-letters > span:not([hidden])", { hasText: /^B$/ }).boundingBox())!;
    const number = (await page.locator(".swt-sheet-numbers > span:not([hidden])", { hasText: /^3$/ }).boundingBox())!;
    await page.mouse.click(letter.x + letter.width / 2, number.y + number.height / 2);
    await page.keyboard.type("Plum");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toMatch(/\| Plum +\|\n\| <meta core.table core.name='\w+' sheet.name='Sheet1' sheet.at='B2'> \|/);
    await expect(drawn(page)).toHaveCount(1);
    await tab(page, "Plan").click();
    await expect(page.locator(".swt-sheet-tabs .swt-sheet-tab")).toHaveText(["Plan", "Q3", "Sheet1"]);
  });

  test("the shown tab's menu: its name renamed in every table of the sheet at once, its widths kept; Remove sheet takes them off it", async ({ page }) => {
    await openPlan(page);
    await tab(page, "Plan").click();
    await page.locator(".swt-menu .swt-menu-rename").click();
    await page.locator(".swt-menu .swt-menu-name").fill("Budget");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("<meta core.table core.name='a' sheet.name='Budget' sheet.at='A1' sheet.width.A='120'>");
    expect(await markdown(page)).toContain("<meta core.table core.name='b' sheet.name='Budget' sheet.at='D1'>");
    await expect(page.locator(".swt-sheet-tabs .swt-sheet-tab")).toHaveText(["Budget", "Q3"]);
    await expect(tab(page, "Budget")).toHaveAttribute("aria-selected", "true");
    await expect(drawn(page)).toHaveCount(2);
    // (The menu closed as the name was saved)
    await expect(page.locator(".swt-menu")).toHaveCount(0);
    await tab(page, "Budget").click();
    await page.locator(".swt-menu .swt-menu-item", { hasText: "Remove sheet" }).click();
    await expect.poll(() => markdown(page)).toContain("| <meta core.table core.name='a'> |");
    expect(await markdown(page)).toContain("| <meta core.table core.name='b'> |");
    // On to the page's other sheet; the table the view was opened with, now on no sheet, has its tab again
    await expect(page.locator(".swt-sheet-tabs .swt-sheet-tab")).toHaveText(["Table", "Q3"]);
    await expect(tab(page, "Q3")).toHaveAttribute("aria-selected", "true");
    await expect(drawn(page)).toContainText("X1");
  });

  test("a table alone's board: its table's tab first, there to go back to from the page's sheets", async ({ page }) => {
    await page.locator("#source").fill("# Test\n\n| Item |\n|---|\n| Pear |\n\n| Code |\n|---|\n| X1 |\n| <meta core.table core.name='c' sheet.name='Q3' sheet.at='B2'> |\n");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(table(page, 1).locator("tr[data-swt-row]")).toHaveCount(1);
    await hoverCell(page, cell(page, 1, 0));
    await (await tableIcon(page, "Sheet view")).click();
    await expect(page.locator(".swt-sheet-tabs .swt-sheet-tab")).toHaveText(["Table", "Q3"]);
    await tab(page, "Q3").click();
    await expect(drawn(page)).toContainText("X1");
    await expect(page.locator(".swt-sheet-tabs .swt-sheet-tab")).toHaveText(["Table", "Q3"]);
    await tab(page, "Table").click();
    await expect(drawn(page)).toContainText("Pear");
  });

  test("a sheet renamed in another case only is renamed", async ({ page }) => {
    await openPlan(page);
    await tab(page, "Plan").click();
    await page.locator(".swt-menu .swt-menu-rename").click();
    await page.locator(".swt-menu .swt-menu-name").fill("PLAN");
    await page.keyboard.press("Enter");
    await expect.poll(() => markdown(page)).toContain("<meta core.table core.name='b' sheet.name='PLAN' sheet.at='D1'>");
  });

  test("a name another sheet has is refused under the field", async ({ page }) => {
    await openPlan(page);
    await tab(page, "Plan").click();
    await page.locator(".swt-menu .swt-menu-rename").click();
    await page.locator(".swt-menu .swt-menu-name").fill("q3");
    await page.keyboard.press("Enter");
    await expect(page.locator(".swt-menu .swt-menu-name-problem")).toHaveText("another sheet of this page is named q3");
  });
});
