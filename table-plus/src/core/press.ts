// Telling what a press is from its pointer events: a tap, a long press, or
// neither (a touch that moves scrolls the page). Told by pointer events, not
// mouse events: a browser may fire no mouse events for a tap after a touch
// drag or a scroll (verified in Chrome's touch emulation).

/** A press let go sooner than this, moved no further than TAP_MOVE pixels, is a tap */
export const TAP_MS = 500;
export const TAP_MOVE = 10;

/** A press held still this long is a long press (a touch screen's right click) */
export const LONG_PRESS_MS = 550;

/**
 * Watches a press from its pointerdown until it is let go, moves further than
 * a tap or is cancelled: `tap` when it was a tap, `longPress` once it was held
 * still long enough (then no tap follows). Returns what stops watching (it may
 * be called again, once stopped).
 */
export function watchPress(win: Window, down: PointerEvent, on: { readonly tap?: () => void; readonly longPress?: () => void }): () => void {
  const { clientX: x, clientY: y } = down;
  const at = Date.now();
  const timer = on.longPress
    ? setTimeout(() => {
        stop();
        on.longPress!();
      }, LONG_PRESS_MS)
    : undefined;
  const move = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - x, e.clientY - y) > TAP_MOVE) stop();
  };
  const up = () => {
    stop();
    if (Date.now() - at < TAP_MS) on.tap?.();
  };
  const stop = () => {
    clearTimeout(timer);
    win.removeEventListener("pointermove", move, true);
    win.removeEventListener("pointerup", up, true);
    win.removeEventListener("pointercancel", stop, true);
  };
  win.addEventListener("pointermove", move, true);
  win.addEventListener("pointerup", up, true);
  win.addEventListener("pointercancel", stop, true);
  return stop;
}
