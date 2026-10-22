import { cell, expect, markdown, test } from "./playground.ts";

test.describe("A table rendered anew after a write", () => {
  test("keeps its toolbar and grips under the pointer through edits", async ({ page }) => {
    for (const value of ["11", "12", "13"]) {
      await cell(page, 2, 1).hover();
      await cell(page, 2, 1).dblclick();
      await page.keyboard.press("Control+a");
      await page.keyboard.type(value);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Escape");
      await expect.poll(() => markdown(page)).toMatch(new RegExp(`\\| apple +\\| +${value} \\|`));
      await expect(page.locator(".tp-bar.tp-visible")).toBeVisible();
      await expect(page.locator(".tp-grip.tp-visible")).toHaveCount(2);
    }
  });
});
