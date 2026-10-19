// A small popup menu: icon items, separators and a segmented button row,
// operable with the mouse or the keyboard (arrows, Home/End, Enter).

/** What an item is about, shown in a bubble beside the menu while it is hovered or focused */
export type MenuDetail = {
  readonly title: string;
  // Ways to write it, shown as code
  readonly code?: readonly string[];
  readonly text: string;
  // Lines after the text, less prominent
  readonly notes?: readonly string[];
};

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
      // What the item does, at more length: a bubble instead of the tooltip
      readonly detail?: MenuDetail;
      // What the item is set to, after its label and a colon (Type: ☆ Stars)
      readonly value?: { readonly text: string; readonly icon?: string };
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

/** A submenu's way back to the menu it replaced: an arrow before its title (and the Left key) */
export type MenuBack = { readonly icon: string; readonly run: () => void };

export function renderMenu(doc: Document, title: string, entries: readonly MenuEntry[], back?: MenuBack): HTMLElement {
  const menu = doc.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);

  const heading = doc.createElement("div");
  heading.className = "tp-menu-title";
  if (back) {
    const arrow = doc.createElement("button");
    arrow.type = "button";
    arrow.className = "tp-menu-back";
    arrow.title = "Back";
    arrow.setAttribute("aria-label", "Back");
    arrow.innerHTML = back.icon;
    arrow.addEventListener("click", (e) => {
      e.preventDefault();
      back.run();
    });
    heading.append(arrow);
  }
  const titleText = doc.createElement("span");
  titleText.className = "tp-menu-title-text";
  titleText.textContent = title;
  heading.append(titleText);
  menu.append(heading);

  // One bubble for the menu's details, beside it: right, or left where the right has no room
  let bubble: HTMLElement | undefined;
  const showDetail = (item: HTMLElement, detail: MenuDetail) => {
    if (!bubble) {
      bubble = doc.createElement("div");
      bubble.className = "tp-menu-detail";
      bubble.setAttribute("role", "tooltip");
      menu.append(bubble);
    }
    const title = doc.createElement("div");
    title.className = "tp-menu-detail-title";
    title.textContent = detail.title;
    const parts: HTMLElement[] = [title];
    if (detail.code?.length) {
      const code = doc.createElement("div");
      code.className = "tp-menu-detail-code";
      for (const form of detail.code) {
        const c = doc.createElement("code");
        c.textContent = form;
        code.append(c);
      }
      parts.push(code);
    }
    const text = doc.createElement("p");
    text.textContent = detail.text;
    parts.push(text);
    for (const note of detail.notes ?? []) {
      const p = doc.createElement("p");
      p.className = "tp-menu-detail-note";
      p.textContent = note;
      parts.push(p);
    }
    bubble.replaceChildren(...parts);
    bubble.hidden = false;
    bubble.classList.remove("tp-left");
    bubble.style.top = `${item.offsetTop}px`;
    const view = doc.defaultView;
    if (view && bubble.getBoundingClientRect().right > view.innerWidth - 8) bubble.classList.add("tp-left");
  };
  const hideDetail = () => {
    if (bubble) bubble.hidden = true;
  };

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
      const detail = entry.detail;
      if (detail && !entry.disabled) {
        item.addEventListener("mouseenter", () => showDetail(item, detail));
        item.addEventListener("focus", () => showDetail(item, detail));
        item.addEventListener("mouseleave", hideDetail);
        item.addEventListener("blur", hideDetail);
      } else if (entry.hint && !entry.disabled) item.title = entry.hint;
      item.innerHTML = `<span class="tp-icon">${entry.icon}</span>`;
      const label = doc.createElement("span");
      label.className = "tp-label";
      label.textContent = entry.label;
      if (entry.value) {
        label.append(": ");
        if (entry.value.icon) {
          const icon = doc.createElement("span");
          icon.className = "tp-menu-value-icon";
          icon.innerHTML = entry.value.icon;
          label.append(icon);
        }
        label.append(entry.value.text);
      }
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
    } else if (e.key === "ArrowLeft" && back) {
      e.preventDefault();
      back.run();
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
