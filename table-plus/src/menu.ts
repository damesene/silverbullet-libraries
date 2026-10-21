// A small popup menu: icon items, separators, a row of icon buttons after a
// label (Align, Move: a choice or a pair of actions) and a bar of actions with
// a caption under each icon (the clipboard's), operable with the mouse or the
// keyboard (arrows, Home/End, Enter).

/** What an item is about, shown in a bubble beside the menu while it is hovered or focused */
export type MenuDetail = {
  readonly title: string;
  // Ways to write it, shown as code
  readonly code?: readonly string[];
  // What it does (none: the title and content alone, a theme's preview)
  readonly text?: string;
  // Lines after the text, less prominent
  readonly notes?: readonly string[];
  // An element after them, made (or set) as the bubble shows: a theme's preview
  readonly content?: () => HTMLElement;
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
        // A choice: whether it is the one set (Align); none: an action (Move up)
        readonly active?: boolean;
        readonly run: () => void;
        // Why it cannot be used now; shown as its tooltip
        readonly disabled?: string;
      }[];
    }
  | {
      // Actions side by side, a caption under each icon (Copy, Cut, Paste)
      readonly kind: "actions";
      readonly options: readonly {
        readonly icon: string;
        readonly caption: string;
        // Its full name (Copy 3 rows), the tooltip and what assistive technology reads
        readonly title: string;
        readonly run: () => void;
        readonly disabled?: string;
      }[];
    };

/** The entries with every run wrapped (a menu closing before its entry runs): items', and the buttons' of rows and bars */
export function wrapRuns(entries: readonly MenuEntry[], wrap: (run: () => void) => () => void): MenuEntry[] {
  return entries.map((entry): MenuEntry =>
    entry.kind === "item"
      ? { ...entry, run: wrap(entry.run) }
      : entry.kind === "segmented" || entry.kind === "actions"
        ? ({ ...entry, options: entry.options.map((option) => ({ ...option, run: wrap(option.run) })) } as MenuEntry)
        : entry,
  );
}

/** A submenu's way back to the menu it replaced: an arrow before its title (and the Left key) */
export type MenuBack = { readonly icon: string; readonly run: () => void };

/**
 * What the menu is about can be named in its title: a pencil after it turns
 * the title into a field (Enter saves, Esc leaves it as it was); `save` gives
 * why a name is refused (shown under the field), or nothing once it is saved
 */
export type MenuNaming = {
  readonly name?: string;
  // What the pencil does (Name this row), its tooltip
  readonly label: string;
  // Why it cannot be named now
  readonly disabled?: string;
  readonly save: (name: string) => Promise<string | undefined>;
};

/** A press in a menu keeps the focus where it is (on its button, in the page), but in its field (a name typed) */
export function keepFocus(menu: HTMLElement): void {
  menu.addEventListener("mousedown", (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  });
}

/** The menu's title as a field, its name to type (the pencil pressed) */
export function startNaming(menu: HTMLElement): void {
  menu.querySelector<HTMLButtonElement>(".tp-menu-rename:not([aria-disabled])")?.click();
}

export function renderMenu(doc: Document, title: string, entries: readonly MenuEntry[], back?: MenuBack, naming?: MenuNaming): HTMLElement {
  const menu = doc.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);

  // A list to pick from (a submenu: Type, a table's Theme): focusMenu starts at its choice
  if (back) menu.dataset.tpList = "";
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
  if (naming) addNaming(doc, menu, heading, naming);

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
    if (detail.text) {
      const text = doc.createElement("p");
      text.textContent = detail.text;
      parts.push(text);
    }
    for (const note of detail.notes ?? []) {
      const p = doc.createElement("p");
      p.className = "tp-menu-detail-note";
      p.textContent = note;
      parts.push(p);
    }
    if (detail.content) parts.push(detail.content());
    bubble.replaceChildren(...parts);
    bubble.hidden = false;
    bubble.classList.remove("tp-left");
    bubble.style.top = `${item.offsetTop}px`;
    const view = doc.defaultView;
    if (view && bubble.getBoundingClientRect().right > view.innerWidth - 8) bubble.classList.add("tp-left");
    // Inside the window: a tall bubble (a theme's preview) beside an item low in the menu goes up
    const below = view ? bubble.getBoundingClientRect().bottom - (view.innerHeight - 8) : 0;
    if (below > 0) bubble.style.top = `${item.offsetTop - below}px`;
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
    } else if (entry.kind === "actions") {
      const bar = doc.createElement("div");
      bar.className = "tp-menu-actions";
      bar.setAttribute("role", "group");
      for (const option of entry.options) {
        const b = button("tp-action", option.run, option.disabled);
        b.setAttribute("role", "menuitem");
        b.setAttribute("aria-label", option.title);
        // As a row's buttons say it: the action, and why it cannot be used now
        b.title = option.disabled ? `${option.title}: ${option.disabled}` : option.title;
        b.innerHTML = `<span class="tp-icon">${option.icon}</span>`;
        const caption = doc.createElement("span");
        caption.className = "tp-action-caption";
        caption.textContent = option.caption;
        b.append(caption);
        bar.append(b);
      }
      menu.append(bar);
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
        const b = button("tp-segment", option.run, option.disabled);
        if (option.active === undefined) b.setAttribute("role", "menuitem");
        else {
          b.setAttribute("role", "menuitemradio");
          b.setAttribute("aria-checked", String(option.active));
        }
        b.title = option.disabled ? `${option.title}: ${option.disabled}` : option.title;
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
    // A name typed in the title: its keys are the field's
    if (e.target instanceof HTMLInputElement) return;
    // The title's buttons (the pencil) are Tab's, the arrows go along the entries
    const buttons = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button:not([aria-disabled]):not(.tp-menu-rename)"),
    );
    const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
    const focus = (i: number) =>
      buttons[(i + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    // Left and right go along a row of buttons too
    const inRow = index >= 0 && (buttons[index]!.classList.contains("tp-segment") || buttons[index]!.classList.contains("tp-action"));
    if (e.key === "ArrowDown" || (e.key === "ArrowRight" && inRow)) {
      e.preventDefault();
      focus(index + 1);
    } else if (e.key === "ArrowUp" || (e.key === "ArrowLeft" && inRow)) {
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

/** The pencil after the title, and the field it turns the title into */
function addNaming(doc: Document, menu: HTMLElement, heading: HTMLElement, naming: MenuNaming): void {
  const pencil = doc.createElement("button");
  pencil.type = "button";
  pencil.className = "tp-menu-rename";
  pencil.innerHTML = PENCIL;
  pencil.setAttribute("aria-label", naming.label);
  pencil.title = naming.disabled ? `${naming.label}: ${naming.disabled}` : naming.label;
  if (naming.disabled) pencil.setAttribute("aria-disabled", "true");
  heading.append(pencil);
  // One save at a time, whichever field asked for it (Esc and the pencil again make a new one)
  let saving = false;
  pencil.addEventListener("click", (e) => {
    e.preventDefault();
    if (naming.disabled) return;
    const field = doc.createElement("input");
    field.type = "text";
    field.className = "tp-menu-name";
    field.value = naming.name ?? "";
    field.placeholder = "name";
    field.setAttribute("aria-label", naming.label);
    field.autocomplete = "off";
    field.spellcheck = false;
    const problem = doc.createElement("div");
    problem.className = "tp-menu-name-problem";
    problem.id = `tp-menu-name-problem-${++problemIds}`;
    problem.setAttribute("role", "alert");
    problem.hidden = true;
    field.setAttribute("aria-describedby", problem.id);
    const titled = Array.from(heading.childNodes);
    heading.replaceChildren(field);
    heading.after(problem);
    heading.classList.add("tp-naming");
    const leave = () => {
      heading.classList.remove("tp-naming");
      heading.replaceChildren(...titled);
      problem.remove();
      menu.focus({ preventScroll: true });
    };
    field.addEventListener("keydown", (ev) => {
      // Keys composing a character (an IME; Safari ends one with an Enter not marked composing) are the composition's
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        leave();
      } else if (ev.key === "Enter" && !saving) {
        ev.preventDefault();
        ev.stopPropagation();
        saving = true;
        problem.hidden = true;
        field.removeAttribute("aria-invalid");
        void naming.save(field.value.trim()).then((why) => {
          saving = false;
          // Left meanwhile (Esc, the menu closed): nothing to show
          if (why === undefined || !field.isConnected) return;
          problem.textContent = why;
          problem.hidden = false;
          field.setAttribute("aria-invalid", "true");
          field.focus();
        });
      }
    });
    field.focus();
    field.select();
  });
}

// Ids tying a name field to its refusal (aria-describedby)
let problemIds = 0;

// A pencil: what names
const PENCIL =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>';

/**
 * Focuses the menu itself: arrow keys then reach its entries, none looks
 * selected yet. A list to pick from starts at its choice instead (the item
 * checked): focused and highlighted, while the item that came under the
 * pointer as the list opened in the menu's place is not, until the pointer moves.
 */
export function focusMenu(menu: HTMLElement): void {
  const current = menu.dataset.tpList !== undefined ? menu.querySelector<HTMLElement>('.tp-menu-item[aria-checked="true"]') : null;
  if (!current) {
    menu.tabIndex = -1;
    menu.focus({ preventScroll: true });
    return;
  }
  menu.classList.add("tp-menu-still");
  current.classList.add("tp-menu-current");
  current.focus({ preventScroll: true });
  menu.addEventListener("pointermove", () => menu.classList.remove("tp-menu-still"), { once: true });
  current.addEventListener("blur", () => current.classList.remove("tp-menu-current"), { once: true });
}
