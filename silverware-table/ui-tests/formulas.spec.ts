import { cell, expect, markdown, rendersAnew, test } from "./playground.ts";

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
});
