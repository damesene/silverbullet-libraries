// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboard } from "./clipboard.ts";

describe("writeClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { clipboard?: unknown }).clipboard;
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it("writes with the Clipboard API where the page has it", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await writeClipboard(document, "a\tb");
    expect(writeText).toHaveBeenCalledWith("a\tb");
  });

  it("copies with the copy command without it (a page over http), text and HTML, the focus kept", async () => {
    const data: Record<string, string> = {};
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: (command: string) => {
        const event = new Event("copy", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: { setData: (type: string, value: string) => (data[type] = value) } });
        document.activeElement!.dispatchEvent(event);
        return command === "copy";
      },
    });
    await writeClipboard(document, "a\tb", "<table></table>");
    expect(data).toEqual({ "text/plain": "a\tb", "text/html": "<table></table>" });
    expect(document.activeElement).toBe(button);
    expect(document.querySelector("textarea")).toBeNull();
    // The browser refusing: an error to show
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
    await expect(writeClipboard(document, "x")).rejects.toThrow("the browser did not copy");
    button.remove();
  });
});
