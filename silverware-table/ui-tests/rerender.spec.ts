import { cell, expect, markdown, rendersAnew, test } from "./playground.ts";

test.describe("A table rendered anew after a write", () => {
  test("keeps its toolbar and grips at the cell the pointer is on", async ({ page }) => {
    for (const value of ["11", "12", "13"]) {
      await cell(page, 2, 1).hover();
      await rendersAnew(page, async () => {
        await cell(page, 2, 1).dblclick();
        await page.keyboard.press("Control+a");
        await page.keyboard.type(value);
        // Tab saves (and opens the next cell's editor, which Esc leaves)
        await page.keyboard.press("Tab");
        await page.keyboard.press("Escape");
      });
      await expect(cell(page, 2, 1)).toHaveText(value);
      expect(await markdown(page)).toMatch(new RegExp(`\\| apple +\\| +${value} \\|`));
      // The controls of the new rendering, at the cell under the pointer
      await expect(page.locator(".swt-bar.swt-visible")).toBeVisible();
      const grip = page.locator(".swt-grip:not(.swt-grip-column).swt-visible");
      const row = await cell(page, 2, 1).boundingBox();
      const at = await grip.boundingBox();
      expect(at && row && at.y >= row.y - 1 && at.y + at.height <= row.y + row.height + 1, "the row grip beside the row hovered").toBe(true);
    }
  });
});
