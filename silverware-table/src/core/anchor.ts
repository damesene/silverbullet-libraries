// A table written stays where it was in the page's view. The editor renders
// it anew and may scroll the page while it measures the new rendering (a long
// table scrolled down jumped), which would leave the user elsewhere: its top's
// offset in the scroller is restored once it is rendered anew, then after the
// cell to edit next is revealed, in the next frames and on the scroller's
// scroll events, for up to ANCHOR_MS or until the user wheels, touches,
// presses or types (`drop`).
import { scrollParentOf } from "./geometry.ts";
import type { TableKey } from "./tables.ts";

// How long a table rendered anew is kept where it was, against the editor's own scrolling
const ANCHOR_MS = 1000;

export class ViewAnchor {
  // The table being written (its key), its scroller and its top's offset below the scroller's top
  private anchor: { readonly key: TableKey; readonly scroller: HTMLElement; offset: number; readonly until: number } | undefined;

  constructor(
    private readonly doc: Document,
    private readonly widgetForKey: (key: TableKey) => HTMLElement | undefined,
  ) {}

  /** A table about to be written: where it is in the page's view */
  set(widget: HTMLElement, key: TableKey): void {
    const scroller = widget.isConnected ? scrollParentOf(widget) : undefined;
    this.anchor = scroller && {
      key,
      scroller,
      offset: widget.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
      until: Date.now() + ANCHOR_MS,
    };
  }

  /** The table rendered anew is scrolled to where it was, so the row edited stays under the user's eyes */
  keep(key: TableKey, widget = this.widgetForKey(key)): void {
    const anchor = this.anchor;
    if (!anchor || anchor.key !== key || !widget) return;
    if (Date.now() > anchor.until || !anchor.scroller.isConnected) {
      this.anchor = undefined;
      return;
    }
    const offset = widget.getBoundingClientRect().top - anchor.scroller.getBoundingClientRect().top;
    if (Math.abs(offset - anchor.offset) >= 1) anchor.scroller.scrollTop += offset - anchor.offset;
  }

  /**
   * After the table's own scrolling (the cell to edit next revealed): kept
   * there, also once the editor has measured the new rendering, in the next
   * frames
   */
  again(widget: HTMLElement, key: TableKey): void {
    const anchor = this.anchor;
    if (!anchor || anchor.key !== key) return;
    anchor.offset = widget.getBoundingClientRect().top - anchor.scroller.getBoundingClientRect().top;
    const keep = () => this.keep(key);
    const win = this.doc.defaultView!;
    win.requestAnimationFrame?.(() => {
      keep();
      win.requestAnimationFrame(keep);
    });
    setTimeout(keep, 100);
  }

  /** Something scrolled: the editor scrolling the page while it measured a table written, which goes back */
  scrolled(target: EventTarget | null): void {
    if (this.anchor && target === this.anchor.scroller) this.keep(this.anchor.key);
  }

  /** The user scrolls, presses or types: the table is no longer kept in place (a listener) */
  readonly drop = (): void => {
    this.anchor = undefined;
  };
}
