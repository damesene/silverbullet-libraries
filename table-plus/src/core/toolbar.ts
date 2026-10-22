// The toolbar above the table hovered: at its left what the table is (its
// name) and how it is shown (chips: its sorting, the features' filters, each
// with a × ending it); at its right the features' icons and the ⋯ menu (the
// table's actions not used all the time, the destructive ones last). Built at
// once on each change, placed above the header (or over its right end) in the
// next frame after a change: placing it measures the table.
import { cellText, renderedTable } from "../dom.ts";
import { ICONS } from "../icons.ts";
import type { MenuEntry } from "../menu.ts";
import { hasPins, NO_PINS, withoutSort } from "../view.ts";
import type { TableHost, ToolbarButton, WidgetInfo } from "./feature.ts";
import { oncePerFrame } from "./frame.ts";
import type { TableMenu } from "./tablemenu.ts";

// Toolbar distance above the header: clear of the column grip on the header's top edge
const BAR_GAP = 12;
// How far the toolbar keeps left of the table's right edge: clear of the +
// adding a column there (in its lane above the header, as high as the toolbar)
const BAR_CLEAR = 15;

/** What the toolbar needs of the controller beside the host */
export type ToolbarContext = {
  readonly host: TableHost;
  readonly menu: TableMenu;
  /** The table the toolbar is for (hovered) */
  readonly hovered: () => HTMLElement | undefined;
  readonly stopped: () => boolean;
  /** The features' buttons for a table */
  readonly buttons: (widget: HTMLElement, info: WidgetInfo) => ToolbarButton[];
  /** The table as rendered now (a write rendered it anew since the toolbar was made) */
  readonly current: (widget: HTMLElement, info: WidgetInfo) => [HTMLElement, WidgetInfo];
  /** The sorting shown written into the markdown */
  readonly applySort: (widget: HTMLElement, info: WidgetInfo) => void;
  readonly showMarkdown: (info: WidgetInfo) => void;
  readonly openSettings: () => void;
};

export class Toolbar {
  private readonly bar: HTMLElement;
  // The ⋯ menu of the toolbar shown last, for a feature to open (TableHost.openTableMenu)
  private openMore: { readonly widget: HTMLElement; readonly open: (naming: boolean) => void } | undefined;
  private readonly queuePlace: () => void;

  constructor(private readonly context: ToolbarContext) {
    this.bar = context.host.floating("div", "tp-bar");
    this.queuePlace = oncePerFrame(context.host.doc, () => this.placeHovered());
  }

  remove(): void {
    this.bar.remove();
  }

  owns(node: Node): boolean {
    return this.bar.contains(node);
  }

  get shown(): boolean {
    return this.bar.classList.contains("tp-visible");
  }

  hide(): void {
    this.bar.classList.remove("tp-visible");
  }

  /** What a feature's buttons show changed: the toolbar in view is made again */
  changed(): void {
    const widget = this.context.hovered();
    const info = widget && this.context.host.infoOf(widget);
    if (widget && info && this.shown) this.show(widget, info, false);
  }

  /** Opens the table's ⋯ menu (its toolbar shown), with its title's name field open */
  openMenu(widget: HTMLElement, naming: boolean): void {
    if (this.openMore?.widget === widget) this.openMore.open(naming);
  }

  /** The toolbar for a table; placed now, or (`placeNow` false: after a change of the table) in the next frame */
  show(widget: HTMLElement, info: WidgetInfo, placeNow = true): void {
    const { host, menu } = this.context;
    const doc = host.doc;
    const view = host.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    // A button with its label, or (with an icon) the icon alone, the label its accessible name
    const button = (item: ToolbarButton, className?: string): HTMLButtonElement => {
      const b = doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.title = item.title;
      if (className) b.className = className;
      if (item.place === "icon" && item.icon) {
        b.classList.add("tp-bar-icon");
        b.setAttribute("aria-label", item.label);
        b.innerHTML = item.icon;
      } else b.textContent = item.label;
      if (item.attention) b.classList.add("tp-attention");
      if (item.pressed !== undefined) b.setAttribute("aria-pressed", String(item.pressed));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        item.run();
      });
      bar.append(b);
      return b;
    };
    const featureButtons = this.context.buttons(widget, info);
    // At the left, what the table is and how it is shown: its name, its sorting, its rows filtered
    for (const item of featureButtons.filter((b) => b.place === "label")) button(item, "tp-bar-label");
    // How the table is shown, each a chip whose × ends it: the sorting, the features' (filters)
    const chips: ToolbarButton[] = [];
    if (view.sort) {
      const { column, direction } = view.sort;
      const name = cellText(info.table.rows[0]!.cells[column]!) || `column ${column + 1}`;
      chips.push({
        label: `Sorted by ${name} ${direction === "asc" ? "↑" : "↓"}`,
        title: "Clear sorting: show the rows as written",
        place: "chip",
        run: () => {
          const [w, i] = this.context.current(widget, info);
          host.setSort(w, i, withoutSort(host.viewOf(i)));
        },
        // Apply: the rows are sorted in the markdown, and the sorting view ends
        actions: [{ icon: ICONS.applySort, title: "Sort the rows in the markdown this way", run: () => this.context.applySort(widget, info) }],
      });
    }
    for (const item of [...chips, ...featureButtons.filter((b) => b.place === "chip")]) {
      const chip = doc.createElement("span");
      chip.className = "tp-status tp-chip";
      if (item.icon) chip.innerHTML = item.icon;
      chip.append(item.label);
      const small = (className: string, title: string, icon: string, run: () => void) => {
        const b = doc.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.className = className;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.innerHTML = icon;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          run();
        });
        return b;
      };
      for (const action of item.actions ?? []) chip.append(small("tp-chip-apply", action.title, action.icon, action.run));
      chip.append(small("tp-chip-clear", item.title, ICONS.clear, item.run));
      bar.append(chip);
    }
    // At the right, icons always in the same places: the features' (Recalculate, Filter), and the menu
    for (const item of featureButtons.filter((b) => b.place === "icon")) button(item);
    const menuItems = [...featureButtons.filter((b) => (b.place ?? "menu") === "menu"), ...this.coreMenuItems(widget, info)];
    const more = button(
      {
        label: "More",
        title: "More for this table",
        place: "icon",
        icon: ICONS.more,
        run: () => (menu.kind === "table" ? menu.close(true) : this.showMenu(widget, more, menuItems)),
      },
      "tp-bar-more",
    );
    // A feature opens it too (the table's name at the toolbar's left: its name to type)
    this.openMore = { widget, open: (naming) => this.showMenu(widget, more, menuItems, naming) };
    // Shown again (a write, a change of the table's state): the open menu stays, at the new button
    menu.reanchor(more);
    // Shown already: it stays where it is until placed
    if (placeNow || !this.shown) this.place(widget, info);
    else this.queuePlace();
  }

  /** The core's items of the ⋯ menu, after the features' */
  private coreMenuItems(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    const { host } = this.context;
    return [
      // Pinned rows and columns are at the edges already: unpinned, they stay where they are
      ...(hasPins(info.pins)
        ? [
            {
              label: "Unpin all",
              title: "Unpin all rows and columns: they stay where they are, and scroll and sort with the others",
              icon: ICONS.unpin,
              run: () => {
                const [w] = this.context.current(widget, info);
                void host.write(w, (t) => t, { pins: NO_PINS });
              },
            },
          ]
        : []),
      // Aligned already, it writes nothing
      {
        label: "Format table",
        title: "Align the table's markdown: its columns padded to one width",
        icon: ICONS.format,
        run: () => {
          const [w] = this.context.current(widget, info);
          void host.write(w, (t) => ({ ...t, padded: true }));
        },
      },
      {
        label: "Edit markdown",
        title: "Show this table as markdown",
        icon: ICONS.markdown,
        run: () => this.context.showMarkdown(this.context.current(widget, info)[1]),
      },
      // Last before the destructive ones: not about this table
      {
        label: "Table Plus settings…",
        title: "Settings for every table in the space (not just this one): SilverBullet's configuration",
        icon: ICONS.settings,
        run: () => this.context.openSettings(),
      },
    ];
  }

  /** The toolbar placed again, if it is shown for the table hovered */
  private placeHovered(): void {
    const widget = this.context.hovered();
    const info = widget && this.context.host.infoOf(widget);
    if (this.context.stopped() || !widget || !info || renderedTable(widget) !== info.table || !this.shown) return;
    this.place(widget, info);
  }

  /** The toolbar placed above the table's header (or over its right end), and the open table menu with it */
  place(widget: HTMLElement, info: WidgetInfo): void {
    const { host } = this.context;
    const bar = this.bar;
    const rect = widget.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    // The header as shown, which may be held at the top of the view
    const headerRect = info.table.rows[0]!.getBoundingClientRect();
    // The page's view: below SilverBullet's top bar, also on a page too short to scroll
    const shown = host.viewBounds(widget);
    bar.classList.add("tp-visible");
    const above = headerRect.top - bar.offsetHeight - BAR_GAP;
    // No room above the header: over the header's right end instead. A header
    // held at the top of the view has the room (STICKY_GAP): the toolbar goes
    // there, so it never covers a column's name while the page scrolls
    const held = info.table.tHead?.classList.contains("tp-stuck") ?? false;
    const fits = held || above >= shown.top + 2;
    const top = fits ? Math.max(above, shown.top) : headerRect.top + (headerRect.height - bar.offsetHeight) / 2;
    // At the table's right edge, or its box's when the table scrolls in it,
    // as far as it is in view: the page around a wide table may scroll
    // sideways too, taking the box's edge along. A box wider than its table
    // (a renderer's block) does not take the toolbar past the table.
    host.place(bar, Math.min(rect.right, tableRect.right, shown.right) - bar.offsetWidth - (fits ? BAR_CLEAR : 6), top);
    this.context.menu.position();
  }

  /**
   * The toolbar's ⋯ menu: the table's actions that are not used all the time,
   * the destructive ones last, after a separator
   */
  private showMenu(widget: HTMLElement, anchor: HTMLElement, items: readonly ToolbarButton[], startNamed = false): void {
    const { host, menu } = this.context;
    const place = { kind: "table" as const, anchor };
    // An item with choices shows them in the menu's place, the back arrow (or ArrowLeft) the menu again
    const back = { icon: ICONS.arrowLeft, run: () => this.showMenu(widget, anchor, items) };
    const entry = (item: ToolbarButton): MenuEntry => ({
      kind: "item",
      label: item.label,
      icon: item.icon ?? "",
      hint: item.title,
      ...(item.value ? { value: { text: item.value } } : {}),
      ...(item.danger ? { danger: true } : {}),
      run: item.choices ? () => menu.show(widget, item.choices!.title, item.choices!.entries(), place, back) : item.run,
    });
    const safe = items.filter((item) => !item.danger).map(entry);
    const danger = items.filter((item) => item.danger).map(entry);
    // The table's name in the title, a pencil to change it (the names module's)
    const info = host.infoOf(widget);
    const naming = info && host.menuNaming(widget, info, { kind: "table" });
    const title = naming?.name ? `Table: ${naming.name}` : "Table";
    menu.show(widget, title, [...safe, ...(safe.length && danger.length ? [{ kind: "separator" as const }] : []), ...danger], place, undefined, naming);
    if (startNamed) menu.startNaming();
  }
}
