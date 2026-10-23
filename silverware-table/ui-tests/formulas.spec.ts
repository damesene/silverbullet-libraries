import { cell, expect, header, markdown, rendersAnew, test } from "./playground.ts";

test.describe("Formulas", () => {
  test("a formula with a comparison and texts shows its result and is written as typed", async ({ page }) => {
    // Pear (Qty 3): its Origin made a formula
    await cell(page, 1, 3).dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type('=IF([@qty]>5, "many", "few")');
    await rendersAnew(page, async () => {
      // Tab saves (and opens the next cell's editor, which Esc leaves)
      await page.keyboard.press("Tab");
      await page.keyboard.press("Escape");
    });
    await expect(cell(page, 1, 3)).toHaveText("few");
    // Its quotes as typed (the value in apostrophes), its > as &gt; (SilverBullet ends a tag at its first >)
    expect(await markdown(page)).toContain(`few <meta f='=IF([@qty]&gt;5, "many", "few")'>`);
    // Rendered again from the page as stored: the tag hides whole, no part of the formula shows
    await page.reload();
    await expect(cell(page, 1, 3)).toHaveText("few");
  });

  test("the list of names typed: Tab inserts the one picked, Enter saves the formula as typed", async ({ page }) => {
    const field = page.locator(".swt-cell-editor");
    const choices = page.locator(".swt-formula-choice code");
    await cell(page, 1, 3).dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("=su");
    await expect(choices.first()).toHaveText("SUBSTITUTE");
    await expect(choices.filter({ hasText: /^SUM$/ })).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await expect(field).toHaveValue("=SUM(");
    await expect(choices).toHaveCount(0);
    // A name the list offers things for, saved as typed with Enter: no function is put in its place
    await page.keyboard.press("Control+a");
    await page.keyboard.type("=ro");
    await expect(choices.first()).toBeVisible();
    await rendersAnew(page, () => page.keyboard.press("Enter"));
    expect(await markdown(page)).toContain(`<meta f='=ro'>`);
  });

  test("pointing at a header's sort button gives its column and sorts nothing", async ({ page }) => {
    const field = page.locator(".swt-cell-editor");
    await cell(page, 1, 3).dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("=SUM(");
    const before = await cell(page, 1, 0).textContent();
    await header(page, 1).hover();
    await header(page, 1).locator(".swt-sort").click();
    await expect(field).toHaveValue("=SUM([qty]");
    await expect(field).toBeFocused();
    // Not sorted: the first row is the one before
    await expect(cell(page, 1, 0)).toHaveText(before ?? "");
    await expect(header(page, 1).locator(".swt-sort.swt-active")).toHaveCount(0);
  });
});
