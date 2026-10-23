// The settings dialog: Silverware Table's settings (bridge.ts SETTINGS) and modules
// (FEATURE_NAMES, each with what it does and its own settings) for every
// table, from the table's ⋯ menu or the "Silverware Table: Settings" command. It
// reads them from SilverBullet's configuration when it opens (one source: what
// Ctrl-, shows, too) and changes nothing until Save: then they are written
// where SilverBullet keeps them (the CONFIG page's managed block,
// configpage.ts) and the configuration is loaded again. Modules are created
// when Silverware Table starts, so turning one on or off saves and reloads the page.
import { type Bridge, FEATURE_NAMES, type FeatureName, MODULE_DESCRIPTIONS, MODULE_LABELS, moduleOnByDefault, settingChoices, SETTINGS } from "./bridge.ts";
import { UI_CLASS } from "./dom.ts";
import { ICONS } from "./icons.ts";

type Key = keyof typeof SETTINGS;

export type SettingsContext = {
  readonly doc: Document;
  readonly bridge: Bridge;
  // Whether the settings can be saved here (else the dialog only shows them)
  readonly canSave: boolean;
  // Saves settings by path
  save(values: Readonly<Record<string, unknown>>): Promise<void>;
  // Saved (no module changed): the tables take the settings now
  saved(): void;
};

// The settings that are not a module's, by tab and group
const TABS: readonly { readonly id: string; readonly title: string; readonly groups: readonly { readonly title: string; readonly keys: readonly Key[] }[] }[] = [
  {
    id: "general",
    title: "General",
    groups: [
      { title: "Tables", keys: ["metadata", "autoFormat", "maxHeight", "toolbarNames"] },
      { title: "Cell editor", keys: ["enterKey", "selectOnClick", "ctrlEnterAddsRow"] },
      { title: "Cells with Lua expressions", keys: ["expressionsDelay"] },
    ],
  },
];

const moduleOf = (key: Key): FeatureName | undefined =>
  /^silverware\.table\.modules\.([^.]+)\./.exec(SETTINGS[key].path)?.[1] as FeatureName | undefined;
const enabledPath = (name: FeatureName) => `silverware.table.modules.${name}.enabled`;

/** Every setting the dialog shows: those of its tabs, and the modules' (a test checks none is left out) */
export function dialogKeys(): Key[] {
  return [...TABS.flatMap((tab) => tab.groups.flatMap((group) => group.keys)), ...(Object.keys(SETTINGS) as Key[]).filter((key) => moduleOf(key))];
}

export class SettingsDialog {
  private readonly initial = new Map<string, unknown>();
  private readonly values = new Map<string, unknown>();
  // Number fields whose text is no valid value: Save waits for them
  private readonly invalid = new Set<string>();
  private backdrop: HTMLElement | undefined;
  private saveButton: HTMLButtonElement | undefined;
  private note: HTMLElement | undefined;
  private readonly moduleSettings = new Map<FeatureName, HTMLElement>();
  private saving = false;
  // Where the focus was before the dialog took it
  private returnFocus: Element | null = null;

  constructor(private readonly context: SettingsContext) {}

  get isOpen(): boolean {
    return !!this.backdrop?.isConnected;
  }

  /** Whether a node is the dialog's (its keys are not the tables') */
  contains(node: Node): boolean {
    return !!this.backdrop?.contains(node);
  }

  /** Reads the settings as configured now and shows them */
  async open(): Promise<void> {
    if (this.isOpen) return;
    const { bridge } = this.context;
    const read = async (path: string, fallback: unknown) => {
      try {
        return (await bridge.getConfig?.(path, fallback)) ?? fallback;
      } catch {
        return fallback;
      }
    };
    for (const key of Object.keys(SETTINGS) as Key[]) {
      const setting = SETTINGS[key];
      const value = (setting.parse as (v: unknown) => unknown)(await read(setting.path, setting.default)) ?? setting.default;
      this.initial.set(setting.path, value);
    }
    for (const name of FEATURE_NAMES) {
      const value = await read(enabledPath(name), moduleOnByDefault(name));
      this.initial.set(enabledPath(name), typeof value === "boolean" ? value : moduleOnByDefault(name));
    }
    for (const [path, value] of this.initial) this.values.set(path, value);
    this.returnFocus = this.context.doc.activeElement;
    this.render();
  }

  close(): void {
    this.backdrop?.remove();
    this.backdrop = undefined;
    if (this.returnFocus instanceof HTMLElement && this.returnFocus.isConnected) this.returnFocus.focus({ preventScroll: true });
  }

  /** Esc or ×: closed, after asking where changes would be lost */
  private async dismiss(): Promise<void> {
    if (this.saving) return;
    if (this.changed().length > 0) {
      const { bridge } = this.context;
      const question = "Close the Silverware Table settings without saving your changes?";
      const sure = bridge.confirm ? await bridge.confirm(question) : this.context.doc.defaultView!.confirm(question);
      if (!sure) return;
    }
    this.close();
  }

  // ---- the dialog --------------------------------------------------------------

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = this.context.doc.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private render(): void {
    const el = this.el.bind(this);
    const backdrop = el("div", `${UI_CLASS} swt-settings-backdrop`);
    const dialog = el("div", "swt-settings");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "swt-settings-title");

    const head = el("div", "swt-settings-head");
    const titles = el("div", "swt-settings-titles");
    const title = el("h2", "swt-settings-title", "Silverware Table settings");
    title.id = "swt-settings-title";
    titles.append(title, el("p", "swt-settings-scope", "For every table in the space: SilverBullet's configuration"));
    const close = el("button", "swt-settings-close");
    close.type = "button";
    close.title = "Close (Esc)";
    close.setAttribute("aria-label", close.title);
    close.innerHTML = ICONS.clear;
    close.addEventListener("click", () => void this.dismiss());
    head.append(titles, close);

    // Tabs: the settings, then the modules
    const tabs = el("div", "swt-settings-tabs");
    tabs.setAttribute("role", "tablist");
    const body = el("div", "swt-settings-body");
    const panels: HTMLElement[] = [];
    const tabButtons: HTMLButtonElement[] = [];
    const addTab = (id: string, name: string, panel: HTMLElement) => {
      const tab = el("button", "swt-settings-tab", name);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.dataset.swtTab = id;
      panel.setAttribute("role", "tabpanel");
      panel.dataset.swtPanel = id;
      tab.addEventListener("click", () => {
        tabButtons.forEach((b) => b.setAttribute("aria-selected", String(b === tab)));
        panels.forEach((p) => (p.hidden = p !== panel));
      });
      tabButtons.push(tab);
      panels.push(panel);
      tabs.append(tab);
      body.append(panel);
    };
    for (const tab of TABS) {
      const panel = el("div", "swt-settings-panel");
      for (const group of tab.groups) {
        if (group.title) panel.append(el("h3", "swt-settings-group", group.title));
        const card = el("div", "swt-settings-card");
        for (const key of group.keys) card.append(this.row(key));
        panel.append(card);
      }
      addTab(tab.id, tab.title, panel);
    }
    const modules = el("div", "swt-settings-panel");
    const card = el("div", "swt-settings-card");
    for (const name of FEATURE_NAMES) card.append(this.moduleRow(name));
    modules.append(card);
    addTab("modules", "Modules", modules);
    tabButtons.forEach((b, i) => b.setAttribute("aria-selected", String(i === 0)));
    panels.forEach((p, i) => (p.hidden = i !== 0));

    const foot = el("div", "swt-settings-foot");
    const note = el("div", "swt-settings-note");
    this.note = note;
    const cancel = el("button", "swt-settings-cancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      if (!this.saving) this.close();
    });
    const save = el("button", "swt-settings-save", "Save");
    save.type = "button";
    save.addEventListener("click", () => void this.save());
    this.saveButton = save;
    foot.append(note, cancel, save);

    dialog.append(head, tabs, body, foot);
    backdrop.append(dialog);
    backdrop.addEventListener("keydown", (e) => this.onKeyDown(e, dialog));
    this.context.doc.body.append(backdrop);
    this.backdrop = backdrop;
    this.update();
    // The dialog takes the focus (no control marked), Tab goes on from there
    dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
  }

  // Esc closes (asking where changes would be lost); Tab stays in the dialog; no key reaches the page
  private onKeyDown(e: KeyboardEvent, dialog: HTMLElement): void {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      void this.dismiss();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select")).filter(
      (f) => !(f as HTMLButtonElement).disabled && f.offsetParent !== null,
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = this.context.doc.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /** A setting's name, and under it what it does where it says more than its name */
  private label(name: string, hint?: string): HTMLElement {
    const text = this.el("span", "swt-settings-label");
    text.append(this.el("span", "swt-settings-name", name));
    if (hint) text.append(this.el("span", "swt-settings-hint", hint));
    return text;
  }

  /** A setting's row: its name left, its control right (a switch, a choice, a number) */
  private row(key: Key): HTMLElement {
    const setting = SETTINGS[key];
    const value = this.values.get(setting.path);
    const row = this.el("label", "swt-settings-row");
    row.dataset.swtSetting = setting.path;
    row.append(this.label(setting.label, (setting as { hint?: string }).hint));
    if (typeof setting.default === "boolean") {
      row.append(this.switch(value === true, (on) => this.change(setting.path, on)));
      return row;
    }
    const choices = settingChoices(key, this.context.doc, value);
    if (choices.length) {
      const select = this.el("select");
      for (const choice of choices) select.append(new Option(choice.label, choice.value, false, choice.value === value));
      select.addEventListener("change", () => this.change(setting.path, select.value));
      row.append(select);
      return row;
    }
    const input = this.el("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = String(value);
    input.addEventListener("input", () => {
      const parsed = (setting.parse as (v: unknown) => unknown)(input.value.trim() === "" ? undefined : Number(input.value));
      input.classList.toggle("swt-settings-invalid", parsed === undefined);
      if (parsed === undefined) this.invalid.add(setting.path);
      else {
        this.invalid.delete(setting.path);
        this.values.set(setting.path, parsed);
      }
      this.update();
    });
    row.append(input);
    return row;
  }

  /** A module's row: its name and what it does, its switch; its own settings under it while it is on */
  private moduleRow(name: FeatureName): HTMLElement {
    const block = this.el("div", "swt-settings-module");
    const row = this.el("label", "swt-settings-row");
    const toggle = this.switch(this.values.get(enabledPath(name)) === true, (on) => this.change(enabledPath(name), on));
    toggle.querySelector("input")!.dataset.swtModule = name;
    row.append(this.label(MODULE_LABELS[name], MODULE_DESCRIPTIONS[name]), toggle);
    block.append(row);
    const keys = (Object.keys(SETTINGS) as Key[]).filter((key) => moduleOf(key) === name);
    if (keys.length > 0) {
      const own = this.el("div", "swt-settings-module-settings");
      for (const key of keys) own.append(this.row(key));
      block.append(own);
      this.moduleSettings.set(name, own);
    }
    return block;
  }

  /** A switch: a checkbox drawn as one */
  private switch(on: boolean, changed: (on: boolean) => void): HTMLElement {
    const wrap = this.el("span", "swt-settings-switch");
    const box = this.el("input");
    box.type = "checkbox";
    box.setAttribute("role", "switch");
    box.checked = on;
    box.addEventListener("change", () => changed(box.checked));
    wrap.append(box, this.el("span", "swt-settings-knob"));
    return wrap;
  }

  private change(path: string, value: unknown): void {
    this.values.set(path, value);
    this.update();
  }

  /** What Save does and whether it can, the note, the modules' settings */
  private update(): void {
    const changed = this.changed();
    const modules = this.modulesChanged();
    const save = this.saveButton;
    if (save) {
      save.textContent = this.saving ? "Saving…" : modules ? "Save and reload" : "Save";
      save.disabled = this.saving || !this.context.canSave || changed.length === 0 || this.invalid.size > 0;
      save.title = this.context.canSave ? "" : "Settings cannot be saved here";
    }
    if (this.note) {
      this.note.textContent = !this.context.canSave
        ? "Settings cannot be saved here."
        : this.invalid.size > 0
          ? "A number is not valid."
          : modules
            ? "Modules apply once the page reloads."
            : "";
    }
    // A module's own settings show while it is on
    for (const [name, own] of this.moduleSettings) own.hidden = this.values.get(enabledPath(name)) !== true;
    for (const input of Array.from(this.backdrop?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select") ?? [])) {
      input.disabled = this.saving;
    }
  }

  private changed(): string[] {
    return Array.from(this.values).filter(([path, value]) => this.initial.get(path) !== value).map(([path]) => path);
  }

  private modulesChanged(): boolean {
    return FEATURE_NAMES.some((name) => this.values.get(enabledPath(name)) !== this.initial.get(enabledPath(name)));
  }

  /**
   * Saves what changed, then closes; reloads for modules. Each value is written
   * as it is, its default too: the value shown may come from elsewhere (a part
   * set in one go, another block), which the managed block, coming last, overrides.
   */
  private async save(): Promise<void> {
    const changed = this.changed();
    if (this.saving || !this.context.canSave || changed.length === 0 || this.invalid.size > 0) return;
    const values: Record<string, unknown> = {};
    for (const path of changed) values[path] = this.values.get(path);
    const reload = this.modulesChanged();
    this.saving = true;
    this.update();
    try {
      await this.context.save(values);
    } catch (e) {
      this.saving = false;
      void this.context.bridge.flash(`Silverware Table: the settings could not be saved (${String(e)})`, "error");
      this.update();
      return;
    }
    this.saving = false;
    this.close();
    if (reload) {
      if (this.context.bridge.reloadUI) await this.context.bridge.reloadUI();
      else this.context.doc.defaultView?.location.reload();
      return;
    }
    this.context.saved();
  }
}
