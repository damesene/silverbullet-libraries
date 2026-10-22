// Middle-button autoscroll over a table that scrolls sideways or inside its
// own box. The browser's own autoscroll locks onto one scrolling box, so it
// moves either the table sideways or the page up and down; this one moves
// both. Hold and drag, or click and move; the next click, key or wheel turn
// ends it.
import type { Feature, TableHost } from "../../feature.ts";

// No movement within this distance of the start point
const DEAD_ZONE = 12;

export class Autoscroll implements Feature {
  private stopScrolling: (() => void) | undefined;

  constructor(private readonly host: TableHost) {}

  stop(): void {
    this.stopScrolling?.();
  }

  mouseDown(e: MouseEvent): boolean {
    if (this.stopScrolling) {
      // Any click ends the autoscroll and does nothing else
      e.preventDefault();
      e.stopPropagation();
      this.stopScrolling();
      this.swallowNextClick();
      return true;
    }
    return e.button === 1 && this.begin(e);
  }

  private begin(e: MouseEvent): boolean {
    const { doc } = this.host;
    const widget = this.host.enhancedWidgetOf(e.target)?.[0];
    // A middle click on a link opens it in a new tab
    const scrollsSideways = !!widget && widget.scrollWidth > widget.clientWidth;
    if (!widget || (e.target as Element).closest("a") || (!scrollsSideways && !this.host.scrollsInside(widget))) return false;
    e.preventDefault();
    e.stopPropagation();
    const win = doc.defaultView!;
    const page = this.host.scrollParentOf(widget) ?? doc.scrollingElement;
    const origin = { x: e.clientX, y: e.clientY };
    const pointer = { ...origin };
    let held = false;
    let carry = { x: 0, y: 0 };
    const marker = this.host.floating("div", "swt-autoscroll swt-visible");
    marker.style.left = `${origin.x - 12}px`;
    marker.style.top = `${origin.y - 12}px`;
    doc.body.classList.add("swt-autoscrolling");

    // Pixels per frame: grows with the distance from the start point
    const speed = (d: number) => {
      const beyond = Math.abs(d) - DEAD_ZONE;
      return beyond > 0 ? Math.sign(d) * (beyond / 16) ** 1.3 : 0;
    };
    let frame = 0;
    const tick = () => {
      carry = { x: carry.x + speed(pointer.x - origin.x), y: carry.y + speed(pointer.y - origin.y) };
      const dx = Math.trunc(carry.x);
      const dy = Math.trunc(carry.y);
      carry = { x: carry.x - dx, y: carry.y - dy };
      if (dx) widget.scrollLeft += dx;
      if (dy) {
        // A table scrolled inside its box takes the vertical movement first
        const before = widget.scrollTop;
        widget.scrollTop += dy;
        const rest = dy - (widget.scrollTop - before);
        if (rest && page) page.scrollTop += rest;
      }
      frame = win.requestAnimationFrame(tick);
    };
    const move = (ev: MouseEvent) => {
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      if (Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > DEAD_ZONE) held = true;
    };
    const up = (ev: MouseEvent) => {
      // Released after dragging: hold-and-drag ends here; a plain click keeps it going
      if (ev.button === 1 && held) stop();
    };
    const end = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      stop();
    };
    const stop = () => {
      win.cancelAnimationFrame(frame);
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      win.removeEventListener("keydown", end, true);
      win.removeEventListener("wheel", end, true);
      marker.remove();
      doc.body.classList.remove("swt-autoscrolling");
      this.stopScrolling = undefined;
    };
    this.stopScrolling = stop;
    // Listeners start after this press, so it does not end the autoscroll at once
    setTimeout(() => {
      if (this.stopScrolling !== stop) return;
      win.addEventListener("mousemove", move, true);
      win.addEventListener("mouseup", up, true);
      win.addEventListener("keydown", end, true);
      win.addEventListener("wheel", end, { capture: true, passive: false });
    }, 0);
    frame = win.requestAnimationFrame(tick);
    return true;
  }

  private swallowNextClick(): void {
    const win = this.host.doc.defaultView!;
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      clear();
    };
    const clear = () => {
      win.removeEventListener("click", swallow, true);
      win.removeEventListener("auxclick", swallow, true);
    };
    win.addEventListener("click", swallow, true);
    win.addEventListener("auxclick", swallow, true);
    setTimeout(clear, 500);
  }
}
