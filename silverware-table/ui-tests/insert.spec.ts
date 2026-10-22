import { bodyRows, cell, expect, hoverCell, markdown, rendersAnew, test } from "./playground.ts";

test.describe("Inserting rows with a +", () => {
  test("the + left of the table inserts a row at the border nearest the pointer", async ({ page }) => {
    await hoverCell(page, cell(page, 1, 0));
    const first = (await cell(page, 1, 0).boundingBox())!;
    // Left of the row grips, on the border under the first row
    await page.mouse.move(first.x - 20, first.y + first.height - 1, { steps: 4 });
    const plus = page.locator(".swt-insert:not(.swt-quiet).swt-visible");
    await expect(plus).toHaveCount(1);
    await rendersAnew(page, () => plus.click());
    await expect(bodyRows(page)).toHaveCount(7);
    // The new row under Pear, its first cell edited
    await expect(page.locator(".swt-cell-editor")).toBeFocused();
    expect(await markdown(page)).toMatch(/\| Pear[^\n]*\n\| +\| +\| +\| +\|\n\| apple/);
  });

  test("the quiet + under the last row adds a row at the end", async ({ page }) => {
    await hoverCell(page, bodyRows(page).last().locator("td").first());
    const quiet = page.locator(".swt-insert.swt-quiet.swt-visible");
    await expect(quiet.first()).toBeVisible();
    await rendersAnew(page, () => quiet.first().click());
    await expect(bodyRows(page)).toHaveCount(7);
    expect(await markdown(page)).toMatch(/\| Šípek[^\n]*\n\| +\| +\| +\| +\|\n/);
  });
});
