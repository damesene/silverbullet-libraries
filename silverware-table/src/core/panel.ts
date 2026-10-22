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
    if (at.options.minWidth === "anchor") this.element.style.minWidth = `${Math.round(rect.right - rect.left)}px`;
    const below = rect.bottom + gap;
    this.context.place(this.element, rect.left, below);
    const height = this.element.offsetHeight;
    const above = rect.top - gap - height;
    const viewHeight = this.context.doc.defaultView!.innerHeight;
    const wantsAbove = at.options.place === "above" ? above >= 0 : below + height > viewHeight && above >= 0;
    if (wantsAbove) this.context.place(this.element, rect.left, above);
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

  /** Whether a node is in one of the panels */
  owns(node: Node): boolean {
    for (const panel of this.panels) if (panel.element.contains(node)) return true;
    return false;
  }

  removeAll(): void {
    for (const panel of [...this.panels]) panel.remove();
  }
}
