// A small popup menu: icon items, separators, a row of icon buttons after a
// label (Align, Move: a choice or a pair of actions) and a bar of actions with
// a caption under each icon (the clipboard's), operable with the mouse or the
// keyboard (arrows, Home/End, Enter). The core's: modules give its entries
// (src/menu.ts) and get it through TableHost.floatingMenu.
import { el, pressed, type ElementChild, type ElementProps } from "../elements.ts";
import type { MenuBack, MenuDetail, MenuEntry, MenuNaming, MenuTitleIcon } from "../menu.ts";

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
  options: { readonly back?: MenuBack; readonly naming?: MenuNaming; readonly close: () => void; readonly titleIcon?: MenuTitleIcon },
): HTMLElement {
  const menu = renderMenu(doc, title, entries, options.back, options.naming, options.titleIcon);
  menu.classList.add("swt-floating", "swt-menu", "swt-visible");
  keepFocus(menu);
  onMenuClose(menu, options.close);
  return menu;
}

export function renderMenu(doc: Document, title: string, entries: readonly MenuEntry[], back?: MenuBack, naming?: MenuNaming, titleIcon?: MenuTitleIcon): HTMLElement {
  // A list to pick from (a submenu: Type, a table's Theme): focusMenu starts at its choice
  const menu = el(doc, "div", { attrs: { role: "menu", "aria-label": title, "data-swt-list": back ? "" : undefined } });
  const heading = el(
    doc,
    "div",
    // An icon before the title, which it acts on: the title starts at it
    titleIcon ? "swt-menu-title swt-menu-title-start" : "swt-menu-title",
    back && el(doc, "button", { class: "swt-menu-back", title: "Back", attrs: { "aria-label": "Back" }, html: back.icon, run: back.run }),
    titleIcon &&
      el(doc, "button", {
        class: "swt-menu-name-icon swt-menu-title-icon",
        title: titleIcon.title,
        attrs: { "aria-label": titleIcon.label, "aria-pressed": pressed(titleIcon.pressed) },
        html: titleIcon.icon,
        run: titleIcon.run,
      }),
    // Cut where long: whole in its tooltip
    el(doc, "span", { class: "swt-menu-title-text", text: title, title }),
  );
  menu.append(heading);
  if (naming) addNaming(doc, menu, heading, naming);
  // A × closing it, as Esc or a press beside it do (on a touch screen a tap beside it may land on something)
  heading.append(
    el(doc, "button", { class: "swt-menu-close", title: "Close", attrs: { "aria-label": "Close" }, html: CLOSE, run: () => menu.dispatchEvent(new Event(MENU_CLOSE)) }),
  );

  // One bubble for the menu's details, beside it: right, or left where the right has no room
  let bubble: HTMLElement | undefined;
  const showDetail = (item: HTMLElement, detail: MenuDetail) => {
    if (!bubble) {
      bubble = el(doc, "div", { class: "swt-menu-detail", attrs: { role: "tooltip" } });
      menu.append(bubble);
    }
    const parts = [
      el(doc, "div", { class: "swt-menu-detail-title", text: detail.title }),
      detail.code?.length && el(doc, "div", "swt-menu-detail-code", ...detail.code.map((form) => el(doc, "code", { text: form }))),
      detail.text && el(doc, "p", { text: detail.text }),
      ...(detail.notes ?? []).map((note) => el(doc, "p", { class: "swt-menu-detail-note", text: note })),
      detail.content?.(),
    ];
    bubble.replaceChildren(...parts.filter((part): part is HTMLElement => part instanceof Node));
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

  // An entry's button; a disabled one says why in its title and does nothing
  const button = (className: string, run: () => void, disabled?: string, props: Omit<ElementProps, "class" | "run"> = {}, ...children: ElementChild[]) =>
    el(
      doc,
      "button",
      {
        ...props,
        class: className,
        ...(disabled ? { title: props.title ?? disabled } : {}),
        attrs: { ...props.attrs, "aria-disabled": disabled ? "true" : undefined },
        run: () => {
          if (!disabled) run();
        },
      },
      ...children,
    );
  const icon = (svg: string) => el(doc, "span", { class: "swt-icon", html: svg });

  for (const entry of entries) {
    if (entry.kind === "separator") {
      menu.append(el(doc, "div", { class: "swt-menu-separator", attrs: { role: "separator" } }));
    } else if (entry.kind === "item") {
      const detail = entry.detail;
      const shows = detail && !entry.disabled;
      const value = entry.value;
      const item = button(
        `swt-menu-item${entry.danger ? " swt-danger" : ""}`,
        entry.run,
        entry.disabled,
        {
          ...(!shows && entry.hint && !entry.disabled ? { title: entry.hint } : {}),
          attrs: { role: entry.checked === undefined ? "menuitem" : "menuitemcheckbox", "aria-checked": pressed(entry.checked) },
        },
        icon(entry.icon),
        el(
          doc,
          "span",
          "swt-label",
          entry.label,
          value && ": ",
          value?.icon && el(doc, "span", { class: "swt-menu-value-icon", html: value.icon }),
          value?.text,
        ),
      );
      const highlight = entry.highlight;
      if (highlight) {
        item.addEventListener("mouseenter", () => highlight(true));
        item.addEventListener("focus", () => highlight(true));
        item.addEventListener("mouseleave", () => highlight(false));
        item.addEventListener("blur", () => highlight(false));
      }
      if (shows) {
        item.addEventListener("mouseenter", () => showDetail(item, detail));
        item.addEventListener("focus", () => showDetail(item, detail));
        item.addEventListener("mouseleave", hideDetail);
        item.addEventListener("blur", hideDetail);
      }
      menu.append(item);
    } else if (entry.kind === "names") {
      menu.append(
        el(
          doc,
          "div",
          { class: "swt-menu-names", attrs: { role: "group" } },
          ...entry.names.map((n) =>
            el(
              doc,
              "span",
              `swt-menu-name-slot${n.key ? ` swt-menu-name-${n.key}` : ""}`,
              n.icon &&
                button("swt-menu-name-icon", n.icon.run, undefined, {
                  title: n.icon.title,
                  attrs: { role: "menuitem", "aria-label": n.icon.label, "aria-pressed": pressed(n.icon.pressed) },
                  html: n.icon.icon,
                }),
              n.name !== undefined &&
                n.run &&
                button(`swt-menu-name-button${n.muted ? " swt-muted" : ""}${n.attention ? " swt-attention" : ""}`, n.run, undefined, { title: n.title ?? n.name, attrs: { role: "menuitem" }, text: n.name }),
            ),
          ),
        ),
      );
    } else if (entry.kind === "actions") {
      menu.append(
        el(
          doc,
          "div",
          { class: "swt-menu-actions", attrs: { role: "group" } },
          ...entry.options.map((option) =>
            button(
              "swt-action",
              option.run,
              option.disabled,
              // As a row's buttons say it: the action, and why it cannot be used now
              { title: option.disabled ? `${option.title}: ${option.disabled}` : option.title, attrs: { role: "menuitem", "aria-label": option.title } },
              icon(option.icon),
              el(doc, "span", { class: "swt-action-caption", text: option.caption }),
            ),
          ),
        ),
      );
    } else {
      menu.append(
        el(
          doc,
          "div",
          "swt-menu-segmented",
          el(doc, "span", { class: "swt-label", text: entry.label }),
          el(
            doc,
            "div",
            { class: "swt-segments", attrs: { role: "group", "aria-label": entry.label } },
            ...entry.options.map((option) =>
              button("swt-segment", option.run, option.disabled, {
                title: option.disabled ? `${option.title}: ${option.disabled}` : option.title,
                attrs: {
                  role: option.active === undefined ? "menuitem" : "menuitemradio",
                  "aria-checked": pressed(option.active),
                  "aria-label": option.title,
                },
                html: option.icon,
              }),
            ),
          ),
        ),
      );
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
    const inRow =
      index >= 0 &&
      ["swt-segment", "swt-action", "swt-menu-name-icon", "swt-menu-name-button"].some((c) => buttons[index]!.classList.contains(c));
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
  const pencil = el(doc, "button", {
    class: "swt-menu-rename",
    html: PENCIL,
    title: naming.disabled ? `${naming.label}: ${naming.disabled}` : naming.label,
    attrs: { "aria-label": naming.label, "aria-disabled": naming.disabled ? "true" : undefined },
  });
  heading.append(pencil);
  // One save at a time, whichever field asked for it (Esc and the pencil again make a new one)
  let saving = false;
  pencil.addEventListener("click", (e) => {
    e.preventDefault();
    if (naming.disabled) return;
    const problem = el(doc, "div", { class: "swt-menu-name-problem", attrs: { id: `swt-menu-name-problem-${++problemIds}`, role: "alert", hidden: "" } });
    const field = el(doc, "input", {
      class: "swt-menu-name",
      attrs: { type: "text", placeholder: "name", "aria-label": naming.label, autocomplete: "off", spellcheck: "false", "aria-describedby": problem.id },
    });
    field.value = naming.name ?? "";
    const titled = Array.from(heading.childNodes);
    heading.replaceChildren(field);
    heading.after(problem);
    heading.classList.add("swt-naming");
    const save = (name: string) => {
      saving = true;
      problem.hidden = true;
      field.removeAttribute("aria-invalid");
      void naming.save(name).then((why) => {
        saving = false;
        // Left meanwhile (Esc, the menu closed): nothing to show
        if (why === undefined || !field.isConnected) return;
        problem.textContent = why;
        problem.hidden = false;
        field.setAttribute("aria-invalid", "true");
        field.focus();
      });
    };
    const clear =
      naming.clear && naming.name
        ? el(
            doc,
            "button",
            { class: "swt-menu-item swt-danger swt-menu-name-clear", title: naming.clear.title, run: () => !saving && save("") },
            el(doc, "span", { class: "swt-icon", html: CLOSE }),
            el(doc, "span", "swt-label", naming.clear.label),
          )
        : undefined;
    if (clear) problem.after(clear);
    const leave = () => {
      heading.classList.remove("swt-naming");
      heading.replaceChildren(...titled);
      problem.remove();
      clear?.remove();
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
        save(field.value.trim());
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
