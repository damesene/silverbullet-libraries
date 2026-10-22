// Column widths: the handle on a header's right edge dragged, double-clicked
import { expect, header, hoverCell, test } from "./playground.ts";

test.describe("Column widths", () => {
  test("a header's handle dragged widens its column by as much; a double click makes it automatic again", async ({ page }) => {
    await hoverCell(page, header(page, 0));
    const before = (await header(page, 0).boundingBox())!.width;
    const handle = (await header(page, 0).locator(".swt-col-resize").boundingBox())!;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(handle.x + handle.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 60, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await header(page, 0).boundingBox())!.width - before)).toBeGreaterThanOrEqual(58);
    expect(Math.round((await header(page, 0).boundingBox())!.width - before)).toBeLessThanOrEqual(62);
    // While dragging the handle was lit; let go, it is not
    await expect(header(page, 0).locator(".swt-col-resize.swt-active")).toHaveCount(0);
    await hoverCell(page, header(page, 0));
    const again = (await header(page, 0).locator(".swt-col-resize").boundingBox())!;
    await page.mouse.dblclick(again.x + again.width / 2, again.y + again.height / 2);
    await expect.poll(async () => Math.abs((await header(page, 0).boundingBox())!.width - before)).toBeLessThan(2);
  });
});
