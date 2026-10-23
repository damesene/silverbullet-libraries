// The toolbar above the table hovered: a row of names above the rest (what
// holds the table, the table itself: TOOLBAR_NAME_ORDER, each with a feature's
// icon button before it, a click on a name its field), then at its left how the
// table is shown (chips: its sorting, the features' filters, each with a ×
// ending it); at its right the features' icons and the ⋯ menu (the table's
// actions not used all the time, the destructive ones last). Built at once on
// each change, placed above the header (or over its right end) in the next
// frame after a change: placing it measures the table.
import { cellText, renderedTable } from "../dom.ts";
import { el, pressed } from "../elements.ts";
import { ICONS } from "../icons.ts";
import type { MenuEntry } from "../menu.ts";
import { hasPins, NO_PINS, withoutSort } from "../view.ts";
import { TOOLBAR_NAME_ORDER, type TableHost, type ToolbarButton, type ToolbarNameSlot, type WidgetInfo } from "./feature.ts";
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
  /** The table deleted from the page, asked first (Delete table) */
  readonly deleteTable: (info: WidgetInfo) => void;
  /** The names in the toolbar too (the toolbarNames setting), not only in the ⋯ menu */
  readonly namesShown: () => boolean;
};

export class Toolbar {
  private readonly bar: HTMLElement;
  // The ⋯ menu of the toolbar shown last, for a feature to open (TableHost.openTableMenu)
  private openMore: { readonly widget: HTMLElement; readonly open: (naming: boolean) => void } | undefined;
  // The name whose field is open (its menu), so the toolbar made anew keeps it at its name
  private openName: ToolbarNameSlot | undefined;
  private readonly queuePlace: () => void;

  constructor(private readonly context: ToolbarContext) {
    this.bar = context.host.floating("div", "swt-bar");
    this.queuePlace = oncePerFrame(context.host.doc, () => this.placeHovered());
  }

  remove(): void {
    this.bar.remove();
  }

  owns(node: Node): boolean {
    return this.bar.contains(node);
  }

  get shown(): boolean {
    return this.bar.classList.contains("swt-visible");
  }

  hide(): void {
    this.bar.classList.remove("swt-visible");
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
    const featureButtons = this.context.buttons(widget, info);
    // The row of names (each slot's icon button, then its name), with the setting; else the names and their icons are
    // in the ⋯ menu only (its first row, as always)
    // (A name asking for attention shows the row whatever the setting)
    const namesShown = this.context.namesShown() || featureButtons.some((b) => b.place === "name" && b.attention);
    const names = namesShown ? this.namesRow(widget, featureButtons) : undefined;
    if (names) bar.append(names.row);
    const main = el(doc, "div", "swt-bar-main");
    bar.append(main);
    // A button with its label, or (with an icon) the icon alone, the label its accessible name
    const button = (item: ToolbarButton, className?: string): HTMLButtonElement => {
      const iconOnly = item.place === "icon" && item.icon;
      const b = el(doc, "button", {
        class: [className, iconOnly && "swt-bar-icon", item.attention && "swt-attention"].filter(Boolean).join(" "),
        title: item.title,
        attrs: { tabindex: -1, "aria-label": iconOnly ? item.label : undefined, "aria-pressed": pressed(item.pressed) },
        ...(iconOnly ? { html: item.icon } : { text: item.label }),
        run: item.run,
      });
      main.append(b);
      return b;
    };
    // At the left, what the table is and how it is shown: its name, its sorting, its rows filtered
    for (const item of featureButtons.filter((b) => b.place === "label")) button(item, "swt-bar-label");
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
          const [, i] = this.context.current(widget, info);
          host.setSort(i, withoutSort(host.viewOf(i)));
        },
        // Apply: the rows are sorted in the markdown, and the sorting view ends
        actions: [{ icon: ICONS.applySort, title: "Sort the rows in the markdown this way", run: () => this.context.applySort(widget, info) }],
      });
    }
    for (const item of [...chips, ...featureButtons.filter((b) => b.place === "chip")]) {
      const small = (className: string, title: string, icon: string, run: () => void) =>
        el(doc, "button", { class: className, title, attrs: { tabindex: -1, "aria-label": title }, html: icon, run });
      main.append(
        el(
          doc,
          "span",
          { class: "swt-status swt-chip", ...(item.icon ? { html: item.icon } : {}) },
          item.label,
          ...(item.actions ?? []).map((action) => small("swt-chip-apply", action.title, action.icon, action.run)),
          small("swt-chip-clear", item.title, ICONS.clear, item.run),
        ),
      );
    }
    // At the right, icons always in the same places: the features' (Recalculate, Filter), and the menu
    main.append(el(doc, "span", "swt-bar-gap"));
    for (const item of featureButtons.filter((b) => b.place === "icon")) button(item);
    const menuItems = [...featureButtons.filter((b) => (b.place ?? "menu") === "menu"), ...this.coreMenuItems(widget, info)];
    const named = bySlot(featureButtons.filter((b) => b.place === "name" || b.place === "name-icon"));
    const more = button(
      {
        label: "More",
        title: "More for this table",
        place: "icon",
        icon: ICONS.more,
        run: () => (menu.kind === "table" ? menu.close(true) : this.showMenu(widget, more, menuItems, named)),
      },
      "swt-bar-more",
    );
    // A feature opens it too; with `naming`, the table's name's field (in the row of names) rather than the menu
    this.openMore = {
      widget,
      open: (naming) => {
        const name = names?.names.get("table");
        if (naming && name) name.click();
        else this.showMenu(widget, more, menuItems, named, naming);
      },
    };
    // Shown again (a write, a change of the table's state): the open menu stays, at the new button (a name's at its name)
    const openName = this.openName && menu.kind === "table" ? names?.names.get(this.openName) : undefined;
    menu.reanchor(openName ?? more);
    // Shown already: it stays where it is until placed
    if (placeNow || !this.shown) this.place(widget, info);
    else this.queuePlace();
  }

  /**
   * The row of names: for each slot (TOOLBAR_NAME_ORDER) a feature's icon
   * button, then the name (muted as a stand-in for none), a click on it its
   * field (a menu whose title it is); none without names nor their icons
   */
  private namesRow(widget: HTMLElement, buttons: readonly ToolbarButton[]): { row: HTMLElement; names: Map<ToolbarNameSlot, HTMLElement> } | undefined {
    const { host, menu } = this.context;
    const doc = host.doc;
    const named = buttons.filter((b) => (b.place === "name" || b.place === "name-icon") && b.slot);
    if (!named.length) return undefined;
    const row = el(doc, "div", "swt-bar-names");
    const names = new Map<ToolbarNameSlot, HTMLElement>();
    const slots = (Object.keys(TOOLBAR_NAME_ORDER) as ToolbarNameSlot[]).sort((a, b) => TOOLBAR_NAME_ORDER[a] - TOOLBAR_NAME_ORDER[b]);
    for (const slot of slots) {
      const icon = named.find((b) => b.place === "name-icon" && b.slot === slot);
      const name = named.find((b) => b.place === "name" && b.slot === slot);
      if (!icon && !name) continue;
      const group = el(
        doc,
        "span",
        `swt-bar-name-slot swt-bar-name-${slot}`,
        icon?.icon &&
          el(doc, "button", {
            class: "swt-bar-icon swt-bar-name-icon",
            title: icon.title,
            attrs: { tabindex: -1, "aria-label": icon.label, "aria-pressed": pressed(icon.pressed) },
            html: icon.icon,
            run: icon.run,
          }),
      );
      if (name) {
        const b: HTMLButtonElement = el(doc, "button", {
          class: `swt-bar-name${name.muted ? " swt-muted" : ""}${name.attention ? " swt-attention" : ""}`,
          text: name.label,
          title: name.title,
          attrs: { tabindex: -1 },
          run: () => (menu.kind === "table" && this.openName === slot ? menu.close(true) : this.showNaming(widget, b, name)),
        });
        group.append(b);
        names.set(slot, b);
      }
      row.append(group);
    }
    return { row, names };
  }

  /** A name's field: a menu that is its title, nothing else in it, at `anchor` (the name, or the ⋯ button) */
  private showNaming(widget: HTMLElement, anchor: HTMLElement, name: ToolbarButton): void {
    const { menu } = this.context;
    this.openName = anchor.classList.contains("swt-bar-name") ? name.slot : undefined;
    menu.show(widget, name.label, [], { kind: "table", anchor }, undefined, name.naming);
    menu.startNaming();
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
        label: "Silverware Table settings…",
        title: "Settings for every table in the space (not just this one): SilverBullet's configuration",
        icon: ICONS.settings,
        run: () => this.context.openSettings(),
      },
      // The last of the destructive ones (the modules' come before): it takes the whole table
      {
        label: "Delete table",
        title: "Delete this table from the page (asked first; Ctrl+Z brings it back)",
        icon: ICONS.trash,
        danger: true,
        run: () => this.context.deleteTable(this.context.current(widget, info)[1]),
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
    // As wide as the table in view at most: the names go above the icons where both do not fit side by side; but
    // never narrower than its widest row, which keeps its width (a table narrower than that has it stick out)
    const right = Math.min(rect.right, tableRect.right, shown.right) - BAR_CLEAR;
    const left = Math.max(rect.left, tableRect.left, shown.left);
    // Measured at the window's left edge: where it was (narrower without the names, at the right), a row put in since
    // would wrap for want of room, and the toolbar's height taken for two rows would place it too high
    bar.style.left = "0px";
    bar.style.maxWidth = "";
    bar.classList.add("swt-visible");
    const widest = Math.max(0, ...Array.from(bar.children, (row) => (row as HTMLElement).offsetWidth));
    bar.style.maxWidth = `${Math.ceil(Math.max(widest, right - left))}px`;
    const above = headerRect.top - bar.offsetHeight - BAR_GAP;
    // No room above the header: over the header's right end instead. A header
    // held at the top of the view has the room (STICKY_GAP): the toolbar goes
    // there, so it never covers a column's name while the page scrolls
    const held = info.table.tHead?.classList.contains("swt-stuck") ?? false;
    const fits = held || above >= shown.top + 2;
    const top = fits ? Math.max(above, shown.top) : headerRect.top + (headerRect.height - bar.offsetHeight) / 2;
    // At the table's right edge, or its box's when the table scrolls in it,
    // as far as it is in view: the page around a wide table may scroll
    // sideways too, taking the box's edge along. A box wider than its table
    // (a renderer's block) does not take the toolbar past the table.
    // Within the view: wider than the table, it goes out left of it, not out of the view
    host.place(bar, Math.max(shown.left + 2, Math.min(rect.right, tableRect.right, shown.right) - bar.offsetWidth - (fits ? BAR_CLEAR : 6)), top);
    this.context.menu.position();
  }

  /**
   * The toolbar's ⋯ menu: the table's actions that are not used all the time,
   * the destructive ones last, after a separator
   */
  private showMenu(widget: HTMLElement, anchor: HTMLElement, items: readonly ToolbarButton[], named: readonly ToolbarButton[] = [], startNamed = false): void {
    const { host, menu } = this.context;
    this.openName = undefined;
    const place = { kind: "table" as const, anchor };
    // An item with choices shows them in the menu's place, the back arrow (or ArrowLeft) the menu again
    const back = { icon: ICONS.arrowLeft, run: () => this.showMenu(widget, anchor, items, named) };
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
    // The table's name as the title (Table without one), a pencil to change it (as every menu of what can be named)
    const info = host.infoOf(widget);
    const naming = info && host.menuNaming(info, { kind: "table" });
    const title = naming?.name ?? "Table";
    // First the ways the table is shown (the table's own: full screen; what holds it: the sheet view) as items, then
    // what holds it (its sheet) in a row as a column's type is in its menu: its name, a button naming another (its
    // field, in the menu's place), a × taking it away
    const icons = named.filter((b) => b.place === "name-icon" && b.icon);
    const views = [...icons.filter((b) => b.slot === "table"), ...icons.filter((b) => b.slot !== "table")].map(
      (b): MenuEntry => ({ kind: "item", label: b.label, icon: b.icon!, hint: b.title, run: b.run }),
    );
    const rows = named
      .filter((b) => b.place === "name" && b.slot !== "table")
      .map((n): MenuEntry => {
        const clear = n.naming?.clear;
        return {
          kind: "segmented",
          ...(n.slot ? { key: n.slot } : {}),
          label: n.caption ? (n.muted || n.attention ? n.caption : `${n.caption}: ${n.label}`) : n.label,
          ...(n.title ? { hint: n.title } : {}),
          ...(n.attention ? { attention: true } : {}),
          options: [
            { icon: ICONS.rename, title: n.naming?.label ?? n.title ?? n.label, run: () => this.showNaming(widget, anchor, n), ...(n.naming?.disabled ? { disabled: n.naming.disabled } : {}) },
            ...(clear && n.naming
              ? [
                  {
                    icon: ICONS.clear,
                    title: clear.label,
                    // (The menu closed: a refusal said as a notification, as its field would show it)
                    run: () => void n.naming!.save("").then((why) => why && host.bridge.flash(`Silverware Table: ${why}`, "info")),
                    ...(n.naming.name && !n.naming.disabled ? {} : { disabled: n.naming.disabled ?? n.label }),
                  },
                ]
              : []),
          ],
        };
      });
    const head: MenuEntry[] = views.length || rows.length ? [...views, ...rows, { kind: "separator" }] : [];
    menu.show(widget, title, [...head, ...safe, ...(safe.length && danger.length ? [{ kind: "separator" as const }] : []), ...danger], place, undefined, naming);
    if (startNamed) menu.startNaming();
  }
}

/** Names and their icons in the order of their slots (TOOLBAR_NAME_ORDER) */
function bySlot(buttons: readonly ToolbarButton[]): ToolbarButton[] {
  return [...buttons].sort((a, b) => TOOLBAR_NAME_ORDER[a.slot ?? "table"] - TOOLBAR_NAME_ORDER[b.slot ?? "table"]);
}
