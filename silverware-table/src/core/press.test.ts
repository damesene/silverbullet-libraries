// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, TAP_MOVE, TAP_MS, watchPress } from "./press.ts";

const pointer = (type: string, x = 0, y = 0) => new PointerEvent(type, { bubbles: true, clientX: x, clientY: y });

describe("watchPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls tap for a short press that does not move", () => {
    const tap = vi.fn();
    watchPress(window, pointer("pointerdown"), { tap });
    window.dispatchEvent(pointer("pointermove", TAP_MOVE, 0));
    window.dispatchEvent(pointer("pointerup"));
    expect(tap).toHaveBeenCalledOnce();
  });

  it("is no tap when the press moved further (a scroll) or was held too long", () => {
    const tap = vi.fn();
    watchPress(window, pointer("pointerdown"), { tap });
    window.dispatchEvent(pointer("pointermove", 0, TAP_MOVE + 1));
    window.dispatchEvent(pointer("pointerup"));
    watchPress(window, pointer("pointerdown"), { tap });
    vi.advanceTimersByTime(TAP_MS);
    window.dispatchEvent(pointer("pointerup"));
    expect(tap).not.toHaveBeenCalled();
  });

  it("calls longPress once held still long enough, and no tap after it", () => {
    const tap = vi.fn();
    const longPress = vi.fn();
    watchPress(window, pointer("pointerdown"), { tap, longPress });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    window.dispatchEvent(pointer("pointerup"));
    expect(longPress).toHaveBeenCalledOnce();
    expect(tap).not.toHaveBeenCalled();
  });

  it("calls nothing once stopped or cancelled", () => {
    const tap = vi.fn();
    const longPress = vi.fn();
    const stop = watchPress(window, pointer("pointerdown"), { tap, longPress });
    stop();
    stop();
    window.dispatchEvent(pointer("pointerup"));
    watchPress(window, pointer("pointerdown"), { tap, longPress });
    window.dispatchEvent(pointer("pointercancel"));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    window.dispatchEvent(pointer("pointerup"));
    expect(tap).not.toHaveBeenCalled();
    expect(longPress).not.toHaveBeenCalled();
  });
});
