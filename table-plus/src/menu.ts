// A small popup menu: icon items, separators and a segmented button row,
// operable with the mouse or the keyboard (arrows, Home/End, Enter).

export type MenuEntry =
  | {
      readonly kind: "item";
      readonly label: string;
      readonly icon: string;
      readonly run: () => void;
      readonly danger?: boolean;
      readonly checked?: boolean;
      // Why the item cannot be used now; shown as its tooltip
      readonly disabled?: string;
      // What the item does, as its tooltip
      readonly hint?: string;
    }
  | { readonly kind: "separator" }
  | {
      readonly kind: "segmented";
      readonly label: string;
      readonly options: readonly {
        readonly icon: string;
        readonly title: string;
        readonly active: boolean;
        readonly run: () => void;
      }[];
    };

export function renderMenu(doc: Document, title: string, entries: readonly MenuEntry[]): HTMLElement {
  const menu = doc.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);

  const heading = doc.createElement("div");
  heading.className = "tp-menu-title";
  heading.textContent = title;
  menu.append(heading);

  const button = (className: string, run: () => void, disabled?: string) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = className;
    if (disabled) {
      b.setAttribute("aria-disabled", "true");
      b.title = disabled;
    }
    b.addEventListener("click", (e) => {
      e.preventDefault();
      if (!disabled) run();
    });
    return b;
  };

  for (const entry of entries) {
    if (entry.kind === "separator") {
      const separator = doc.createElement("div");
      separator.className = "tp-menu-separator";
      separator.setAttribute("role", "separator");
      menu.append(separator);
    } else if (entry.kind === "item") {
      const item = button("tp-menu-item", entry.run, entry.disabled);
      item.setAttribute("role", entry.checked === undefined ? "menuitem" : "menuitemcheckbox");
      if (entry.checked !== undefined) item.setAttribute("aria-checked", String(entry.checked));
      if (entry.danger) item.classList.add("tp-danger");
      if (entry.hint && !entry.disabled) item.title = entry.hint;
      item.innerHTML = `<span class="tp-icon">${entry.icon}</span>`;
      const label = doc.createElement("span");
      label.className = "tp-label";
      label.textContent = entry.label;
      item.append(label);
      menu.append(item);
    } else {
      const row = doc.createElement("div");
      row.className = "tp-menu-segmented";
      const label = doc.createElement("span");
      label.className = "tp-label";
      label.textContent = entry.label;
      const group = doc.createElement("div");
      group.className = "tp-segments";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", entry.label);
      for (const option of entry.options) {
        const b = button("tp-segment", option.run);
        b.setAttribute("role", "menuitemradio");
        b.setAttribute("aria-checked", String(option.active));
        b.title = option.title;
        b.setAttribute("aria-label", option.title);
        b.innerHTML = option.icon;
        group.append(b);
      }
      row.append(label, group);
      menu.append(row);
    }
  }

  menu.addEventListener("keydown", (e) => {
    // SilverBullet hands stray keys back to the editor; keys in the menu stay here
    e.stopPropagation();
    const buttons = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button:not([aria-disabled])"),
    );
    const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
    const focus = (i: number) =>
      buttons[(i + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    if (e.key === "ArrowDown" || (e.key === "ArrowRight" && index >= 0 && buttons[index]!.classList.contains("tp-segment"))) {
      e.preventDefault();
      focus(index + 1);
    } else if (e.key === "ArrowUp" || (e.key === "ArrowLeft" && index >= 0 && buttons[index]!.classList.contains("tp-segment"))) {
      e.preventDefault();
      focus(index < 0 ? -1 : index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focus(-1);
    }
  });
  return menu;
}

/** Focuses the menu itself: arrow keys then reach its entries, none looks selected yet */
export function focusMenu(menu: HTMLElement): void {
  menu.tabIndex = -1;
  menu.focus({ preventScroll: true });
}
