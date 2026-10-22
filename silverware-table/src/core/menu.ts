// A small popup menu: icon items, separators, a row of icon buttons after a
// label (Align, Move: a choice or a pair of actions) and a bar of actions with
// a caption under each icon (the clipboard's), operable with the mouse or the
// keyboard (arrows, Home/End, Enter). The core's: modules give its entries
// (src/menu.ts) and get it through TableHost.floatingMenu.
import type { MenuBack, MenuDetail, MenuEntry, MenuNaming } from "../menu.ts";

/** A press in a menu keeps the focus where it is (on its button, in the page), but in its field (a name typed) */
export function keepFocus(menu: HTMLElement): void {
  menu.addEventListener("mousedown", (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  });
}

// The event the × in a menu's title sends to the menu: whoever shows it closes it (onMenuClose)
const MENU_CLOSE = "swt-menu-close";

/** What closes the menu when its × is pressed (as Esc does: the one who shows it knows how) */
export function onMenuClose(menu: HTMLElement, close: () => void): void {
  menu.addEventListener(MENU_CLOSE, close);
}

/** The menu's title as a field, its name to type (the pencil pressed) */
export function startNaming(menu: HTMLElement): void {
  menu.querySelector<HTMLButtonElement>(".swt-menu-rename:not([aria-disabled])")?.click();
}

/**
 * A menu floating over the page (Silverware Table's controls, not SilverBullet's
 * content), to put into the page and focus (focusMenu) once placed: a press in
 * it keeps the focus where it is, its × closes it with `close`
 */
export function floatingMenu(
  doc: Document,
  title: string,
  entries: readonly MenuEntry[],
  options: { readonly back?: MenuBack; readonly naming?: MenuNaming; readonly close: () => void },
): HTMLElement {
  const menu = renderMenu(doc, title, entries, options.back, options.naming);
  menu.classList.add("swt-floating", "swt-menu", "swt-visible");
  keepFocus(menu);
  onMenuClose(menu, options.close);
  return menu;
}

export function renderMenu(doc: Document, title: string, entries: readonly MenuEntry[], back?: MenuBack, naming?: MenuNaming): HTMLElement {
  const menu = doc.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);

  // A list to pick from (a submenu: Type, a table's Theme): focusMenu starts at its choice
  if (back) menu.dataset.swtList = "";
  const heading = doc.createElement("div");
  heading.className = "swt-menu-title";
  if (back) {
    const arrow = doc.createElement("button");
    arrow.type = "button";
    arrow.className = "swt-menu-back";
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
  titleText.className = "swt-menu-title-text";
  titleText.textContent = title;
  heading.append(titleText);
  menu.append(heading);
  if (naming) addNaming(doc, menu, heading, naming);
  // A × closing it, as Esc or a press beside it do (on a touch screen a tap beside it may land on something)
  const close = doc.createElement("button");
  close.type = "button";
  close.className = "swt-menu-close";
  close.title = "Close";
  close.setAttribute("aria-label", "Close");
  close.innerHTML = CLOSE;
  close.addEventListener("click", (e) => {
    e.preventDefault();
    menu.dispatchEvent(new Event(MENU_CLOSE));
  });
  heading.append(close);

  // One bubble for the menu's details, beside it: right, or left where the right has no room
  let bubble: HTMLElement | undefined;
  const showDetail = (item: HTMLElement, detail: MenuDetail) => {
    if (!bubble) {
      bubble = doc.createElement("div");
      bubble.className = "swt-menu-detail";
      bubble.setAttribute("role", "tooltip");
      menu.append(bubble);
    }
    const title = doc.createElement("div");
    title.className = "swt-menu-detail-title";
    title.textContent = detail.title;
    const parts: HTMLElement[] = [title];
    if (detail.code?.length) {
      const code = doc.createElement("div");
      code.className = "swt-menu-detail-code";
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
      p.className = "swt-menu-detail-note";
      p.textContent = note;
      parts.push(p);
    }
    if (detail.content) parts.push(detail.content());
    bubble.replaceChildren(...parts);
    bubble.hidden = false;
    bubble.classList.remove("swt-left");
    bubble.style.top = `${item.offsetTop}px`;
    const view = doc.defaultView;
    if (view && bubble.getBoundingClientRect().right > view.innerWidth - 8) bubble.classList.add("swt-left");
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
      separator.className = "swt-menu-separator";
      separator.setAttribute("role", "separator");
      menu.append(separator);
    } else if (entry.kind === "item") {
      const item = button("swt-menu-item", entry.run, entry.disabled);
      item.setAttribute("role", entry.checked === undefined ? "menuitem" : "menuitemcheckbox");
      if (entry.checked !== undefined) item.setAttribute("aria-checked", String(entry.checked));
      if (entry.danger) item.classList.add("swt-danger");
      const detail = entry.detail;
      if (detail && !entry.disabled) {
        item.addEventListener("mouseenter", () => showDetail(item, detail));
        item.addEventListener("focus", () => showDetail(item, detail));
        item.addEventListener("mouseleave", hideDetail);
        item.addEventListener("blur", hideDetail);
      } else if (entry.hint && !entry.disabled) item.title = entry.hint;
      item.innerHTML = `<span class="swt-icon">${entry.icon}</span>`;
      const label = doc.createElement("span");
      label.className = "swt-label";
      label.textContent = entry.label;
      if (entry.value) {
        label.append(": ");
        if (entry.value.icon) {
          const icon = doc.createElement("span");
          icon.className = "swt-menu-value-icon";
          icon.innerHTML = entry.value.icon;
          label.append(icon);
        }
        label.append(entry.value.text);
      }
      item.append(label);
      menu.append(item);
    } else if (entry.kind === "actions") {
      const bar = doc.createElement("div");
      bar.className = "swt-menu-actions";
      bar.setAttribute("role", "group");
      for (const option of entry.options) {
        const b = button("swt-action", option.run, option.disabled);
        b.setAttribute("role", "menuitem");
        b.setAttribute("aria-label", option.title);
        // As a row's buttons say it: the action, and why it cannot be used now
        b.title = option.disabled ? `${option.title}: ${option.disabled}` : option.title;
        b.innerHTML = `<span class="swt-icon">${option.icon}</span>`;
        const caption = doc.createElement("span");
        caption.className = "swt-action-caption";
        caption.textContent = option.caption;
        b.append(caption);
        bar.append(b);
      }
      menu.append(bar);
    } else {
      const row = doc.createElement("div");
      row.className = "swt-menu-segmented";
      const label = doc.createElement("span");
      label.className = "swt-label";
      label.textContent = entry.label;
      const group = doc.createElement("div");
      group.className = "swt-segments";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", entry.label);
      for (const option of entry.options) {
        const b = button("swt-segment", option.run, option.disabled);
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
      menu.querySelectorAll<HTMLButtonElement>("button:not([aria-disabled]):not(.swt-menu-rename):not(.swt-menu-close)"),
    );
    const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
    const focus = (i: number) =>
      buttons[(i + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    // Left and right go along a row of buttons too
    const inRow = index >= 0 && (buttons[index]!.classList.contains("swt-segment") || buttons[index]!.classList.contains("swt-action"));
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
  pencil.className = "swt-menu-rename";
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
    field.className = "swt-menu-name";
    field.value = naming.name ?? "";
    field.placeholder = "name";
    field.setAttribute("aria-label", naming.label);
    field.autocomplete = "off";
    field.spellcheck = false;
    const problem = doc.createElement("div");
    problem.className = "swt-menu-name-problem";
    problem.id = `swt-menu-name-problem-${++problemIds}`;
    problem.setAttribute("role", "alert");
    problem.hidden = true;
    field.setAttribute("aria-describedby", problem.id);
    const titled = Array.from(heading.childNodes);
    heading.replaceChildren(field);
    heading.after(problem);
    heading.classList.add("swt-naming");
    const leave = () => {
      heading.classList.remove("swt-naming");
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

// A ×: what closes
const CLOSE =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

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
  const current = menu.dataset.swtList !== undefined ? menu.querySelector<HTMLElement>('.swt-menu-item[aria-checked="true"]') : null;
  if (!current) {
    menu.tabIndex = -1;
    menu.focus({ preventScroll: true });
    return;
  }
  menu.classList.add("swt-menu-still");
  current.classList.add("swt-menu-current");
  current.focus({ preventScroll: true });
  menu.addEventListener("pointermove", () => menu.classList.remove("swt-menu-still"), { once: true });
  current.addEventListener("blur", () => current.classList.remove("swt-menu-current"), { once: true });
}
