// The open menu of a table's toolbar (⋯, below its button) or of cells (at
// the pointer): one at a time. Its items close it when run; Esc, its × or a
// press elsewhere close it (the controller routes those).
import { type MenuBack, type MenuEntry, type MenuNaming, namingThatCloses, wrapRuns } from "../menu.ts";
import { focusMenu, startNaming } from "./menu.ts";

export type MenuKind = "table" | "cell";

/** Where a menu shows: below its anchor (the ⋯ button), else at a point */
export type MenuPlace = { readonly kind: MenuKind; readonly anchor?: HTMLElement; readonly point?: { readonly x: number; readonly y: number } };

export class TableMenu {
  private open: (MenuPlace & { readonly element: HTMLElement; readonly widget: HTMLElement; anchor?: HTMLElement }) | undefined;

  constructor(
    private readonly doc: Document,
    // Hands the keyboard back to SilverBullet's editor (a menu closed from the keyboard)
    private readonly focusEditor: (widget: HTMLElement) => void,
    // A floating menu, made by the core (TableHost.floatingMenu)
    private readonly floatingMenu: (title: string, entries: readonly MenuEntry[], options: { readonly back?: MenuBack; readonly naming?: MenuNaming; readonly close: () => void; readonly owner?: object }) => HTMLElement,
  ) {}

  /** Which menu is open, if any */
  get kind(): MenuKind | undefined {
    return this.open?.kind;
  }

  owns(node: Node): boolean {
    return !!this.open?.element.contains(node);
  }

  /** Shows a menu (the one open before goes); `naming`: its title named, a save closing it */
  show(widget: HTMLElement, title: string, entries: readonly MenuEntry[], place: MenuPlace, back?: MenuBack, naming?: MenuNaming): void {
    this.close(false);
    const closing = wrapRuns(entries, (run) => () => {
      this.close(false);
      run();
    });
    const element = this.floatingMenu(title, closing, {
      owner: this,
      back,
      naming: namingThatCloses(naming, () => this.close(false)),
      close: () => this.close(true),
    });
    this.open = { element, widget, ...place };
    place.anchor?.classList.add("swt-active");
    this.position();
    focusMenu(element);
  }

  /** The menu's title as a field, its name to type */
  startNaming(): void {
    if (this.open) startNaming(this.open.element);
  }

  /** The toolbar's ⋯ menu stays open at its button shown anew (the toolbar is made again on each change) */
  reanchor(anchor: HTMLElement): void {
    if (this.open?.kind !== "table") return;
    anchor.classList.add("swt-active");
    this.open.anchor = anchor;
  }

  /** Below the ⋯ button, its right edge at the button's; at the pointer; always inside the window */
  position(): void {
    if (!this.open) return;
    const { element, anchor, point } = this.open;
    const win = this.doc.defaultView!;
    const m = element.getBoundingClientRect();
    let left: number;
    let top: number;
    if (anchor) {
      const a = anchor.getBoundingClientRect();
      left = a.right - m.width;
      top = a.bottom + 4;
      if (top + m.height > win.innerHeight - 4) top = a.top - m.height - 4;
    } else {
      left = point?.x ?? 0;
      top = point?.y ?? 0;
      if (top + m.height > win.innerHeight - 4) top -= m.height;
      if (left + m.width > win.innerWidth - 4) left -= m.width;
    }
    element.style.left = `${Math.round(Math.max(4, Math.min(left, win.innerWidth - m.width - 4)))}px`;
    element.style.top = `${Math.round(Math.max(4, top))}px`;
  }

  /** Closes the open menu; `refocus`: the editor gets the keyboard back if the menu had it */
  close(refocus: boolean): void {
    const menu = this.open;
    if (!menu) return;
    this.open = undefined;
    const hadFocus = menu.element.contains(this.doc.activeElement);
    menu.element.remove();
    menu.anchor?.classList.remove("swt-active");
    if (refocus && hadFocus) this.focusEditor(menu.widget);
  }
}
