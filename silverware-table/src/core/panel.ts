// Panels: floating containers of the features' own UI (TableHost.panel), each
// placed by what it is anchored to in model terms (the cell editor, a cell, a
// point). The core asks where the anchor is (`anchorRect`, from the adapter
// and the cell editor) and places the panel below it, or above where the
// window has no room below; again after every layout change (scrolling), and
// hidden while its anchor is out of view.
import type { Panel, PanelAnchor, PanelOptions, Rect } from "./feature.ts";

export type PanelContext = {
  readonly doc: Document;
  /** A floating element in the page (TableHost.floating) */
  floating(className: string): HTMLElement;
  /** Places a floating element at a point, kept inside the window sideways, and shows it (TableHost.place) */
  place(element: HTMLElement, left: number, top: number): void;
  /** Where an anchor is in the window, if in view */
  anchorRect(anchor: PanelAnchor): Rect | undefined;
  /** Where the page is in view around an anchor (above an on-screen keyboard) */
  view(anchor: PanelAnchor): Rect;
};

const GAP = 2;

class FloatingPanel implements Panel {
  readonly element: HTMLElement;
  private at: { readonly anchor: PanelAnchor; readonly options: PanelOptions } | undefined;

  constructor(
    private readonly context: PanelContext,
    className: string,
    private readonly removed: (panel: FloatingPanel) => void,
  ) {
    this.element = context.floating(className);
  }

  get shown(): boolean {
    return this.at !== undefined;
  }

  show(anchor: PanelAnchor, options: PanelOptions = {}): void {
    this.at = { anchor, options };
    this.place();
  }

  hide(): void {
    this.at = undefined;
    this.element.classList.remove("swt-visible");
  }

  remove(): void {
    this.hide();
    this.element.remove();
    this.removed(this);
  }

  /** Where its anchor is now; out of view: hidden until it is back */
  place(): void {
    const at = this.at;
    if (!at) return;
    const rect = this.context.anchorRect(at.anchor);
    if (!rect) {
      this.element.classList.remove("swt-visible");
      return;
    }
    const gap = at.options.gap ?? GAP;
    const left = rect.left + (at.options.offsetX ?? 0);
    if (at.options.minWidth === "anchor") this.element.style.minWidth = `${Math.round(rect.right - rect.left)}px`;
    this.context.place(this.element, left, rect.bottom + gap);
    const height = this.element.offsetHeight;
    // The page in view (cut to what an on-screen keyboard leaves): above where it does not fit below and there is more room above
    const view = this.context.view(at.anchor);
    const roomBelow = view.bottom - (rect.bottom + gap);
    const roomAbove = rect.top - gap - view.top;
    const above = at.options.place === "above" ? roomAbove >= height || roomAbove > roomBelow : height > roomBelow && roomAbove > roomBelow;
    this.element.classList.toggle("swt-above", above);
    if (above) this.context.place(this.element, left, rect.top - gap - height);
  }
}

/** The panels of the features, placed anew together after a layout change */
export class Panels {
  private readonly panels = new Set<FloatingPanel>();

  constructor(private readonly context: PanelContext) {}

  create(className: string): Panel {
    const panel = new FloatingPanel(this.context, className, (p) => this.panels.delete(p));
    this.panels.add(panel);
    return panel;
  }

  /** The page or a table scrolled, a table was rendered anew: each panel shown follows its anchor */
  placeAll(): void {
    for (const panel of this.panels) panel.place();
  }

  removeAll(): void {
    for (const panel of [...this.panels]) panel.remove();
  }
}
