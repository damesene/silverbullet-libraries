// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cell, clickOn, controller, editor, setup, useTablePage } from "../../../testing/page.ts";

describe("${…} cells", () => {
  useTablePage();

  it("re-evaluates ${…} cells once the page is indexed", async () => {
    // the fake render shows the expression source; SilverBullet would show a stale value
    await setup("| N | Sum |\n|---|---|\n| a | 1 |\n| b | ${S()} |\n| c | x ${S()} |\n");
    let sum = 42;
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.evalExpression = (e: string) =>
      e === "S()" ? sum : undefined;
    vi.useFakeTimers();
    const indexed = async (page: string) => {
      await controller.pageIndexed(page);
      await vi.advanceTimersByTimeAsync(600); // the time given to the indexers
    };
    await indexed("Other page");
    expect(cell(2, 1).textContent).toBe("${S()}");
    await indexed("Test");
    expect(cell(2, 1).textContent).toBe("42");
    expect(cell(3, 1).textContent).toBe("x ${S()}"); // not a single expression: left alone
    sum = 7;
    await indexed("Test");
    expect(cell(2, 1).textContent).toBe("7");
    vi.useRealTimers();
  });

  it("keeps an open cell editor focused when ${…} cells are re-evaluated", async () => {
    await setup("| N | Sum |\n|---|---|\n| a | 1 |\n| b | 2 |\n| total | ${S()} |\n");
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.evalExpression = () => 3;
    clickOn(cell(2, 1)); // b's Sum
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    field.value = "25";
    field.setSelectionRange(1, 1);
    vi.useFakeTimers();
    await controller.pageIndexed("Test");
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    expect(cell(3, 1).textContent).toBe("3");
    expect(editor.querySelector(".swt-cell-editor")).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(1);
  });
});
