// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { FEATURE_NAMES, SETTINGS } from "./bridge.ts";
import { MANAGED_MARKER } from "./configpage.ts";
import { dialogKeys, moduleTabs } from "./settings.ts";
import { cell, controller, editor, flashes, flush, key, PAGE, setup, useTablePage } from "./testing/page.ts";

describe("The settings dialog", () => {
  useTablePage();

  const dialog = () => document.querySelector<HTMLElement>(".swt-settings");
  const setting = (path: string) => dialog()!.querySelector<HTMLElement>(`[data-swt-setting="${path}"]`)!;
  const box = (path: string) => setting(path).querySelector<HTMLInputElement>("input")!;
  const module = (name: string) => dialog()!.querySelector<HTMLInputElement>(`input[data-swt-module="${name}"]`)!;
  const button = (cls: string) => dialog()!.querySelector<HTMLButtonElement>(`.${cls}`)!;
  const tick = (input: HTMLInputElement, checked: boolean) => {
    input.checked = checked;
    input.dispatchEvent(new Event("change"));
  };

  it("says it sets every table, not the one it was opened from", async () => {
    await setup(PAGE);
    await controller.openSettings();
    expect(dialog()!.querySelector(".swt-settings-title")!.textContent).toBe("Silverware Table settings");
    expect(dialog()!.querySelector(".swt-settings-scope")!.textContent).toContain("every table in the space");
  });

  it("shows the settings as configured; saves what changed, each value as it is; Cancel and Esc save nothing", async () => {
    const saved: Record<string, unknown>[] = [];
    await setup(PAGE, { "silverware.table.maxHeight": 300 }, { saveSettings: (values) => void saved.push(values), confirm: () => true });
    await controller.openSettings();
    expect(box("silverware.table.metadata").checked).toBe(false);
    expect(box("silverware.table.maxHeight").value).toBe("300");
    // Nothing changed: nothing to save
    expect(button("swt-settings-save").disabled).toBe(true);
    tick(box("silverware.table.metadata"), true);
    expect(button("swt-settings-save").disabled).toBe(false);
    expect(button("swt-settings-save").textContent).toBe("Save");
    // Cancel: closed, nothing saved
    button("swt-settings-cancel").click();
    expect(dialog()).toBeNull();
    expect(saved).toEqual([]);
    // Esc too
    await controller.openSettings();
    tick(box("silverware.table.metadata"), true);
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    expect(dialog()).toBeNull();
    expect(saved).toEqual([]);
    // Saved: what changed
    await controller.openSettings();
    tick(box("silverware.table.metadata"), true);
    box("silverware.table.maxHeight").value = "0";
    box("silverware.table.maxHeight").dispatchEvent(new Event("input"));
    button("swt-settings-save").click();
    await flush();
    // Written as it is, the default too: the value shown may come from elsewhere, which the managed block overrides
    expect(saved).toEqual([{ "silverware.table.metadata": true, "silverware.table.maxHeight": 0 }]);
    expect(dialog()).toBeNull();
  });

  it("puts each module on the tab of the kind it declares, after General", async () => {
    expect(moduleTabs().flatMap((tab) => tab.modules).sort()).toEqual([...FEATURE_NAMES].sort());
    await setup(PAGE);
    await controller.openSettings();
    const tabs = [...dialog()!.querySelectorAll<HTMLElement>(".swt-settings-tab")].map((tab) => tab.textContent);
    expect(tabs).toEqual(["General", "Editing", "Data", "Look", "View", "Export"]);
    for (const tab of moduleTabs()) {
      const panel = dialog()!.querySelector(`[data-swt-panel="${tab.id}"]`)!;
      expect([...panel.querySelectorAll<HTMLInputElement>("input[data-swt-module]")].map((box) => box.dataset.swtModule)).toEqual(tab.modules);
    }
  });

  it("lists the modules with what they do, their own settings under them while on; turning one off saves and reloads", async () => {
    const saved: Record<string, unknown>[] = [];
    let reloaded = 0;
    await setup(PAGE, {}, { saveSettings: (values) => void saved.push(values), reloadUI: () => void reloaded++ });
    await controller.openSettings();
    expect(dialog()!.querySelectorAll("input[data-swt-module]").length).toBe(FEATURE_NAMES.length);
    // Large tables is off until turned on, the others on
    expect(module("largeTables").checked).toBe(false);
    expect(module("formulas").checked).toBe(true);
    const longText = module("longText").closest(".swt-settings-module")!;
    expect(longText.querySelector(".swt-settings-hint")!.textContent).toContain("maximum column width");
    const own = longText.querySelector<HTMLElement>(".swt-settings-module-settings")!;
    expect(own.hidden).toBe(false);
    expect(own.querySelector('[data-swt-setting="silverware.table.modules.longText.maxWidth"]')).not.toBeNull();
    tick(module("longText"), false);
    expect(own.hidden).toBe(true);
    expect(button("swt-settings-save").textContent).toBe("Save and reload");
    button("swt-settings-save").click();
    await flush();
    expect(saved).toEqual([{ "silverware.table.modules.longText.enabled": false }]);
    expect(reloaded).toBe(1);
  });

  it("writes nothing where the configuration page cannot be read (it would replace it)", async () => {
    const pages: string[] = [];
    await setup(PAGE, {}, {
      readPage: () => {
        throw new Error("network error");
      },
      saveConfigPage: (text) => void pages.push(text),
    });
    await controller.openSettings();
    tick(box("silverware.table.metadata"), true);
    button("swt-settings-save").click();
    for (let i = 0; i < 3; i++) await flush();
    expect(pages).toEqual([]);
    expect(dialog()).not.toBeNull();
  });

  it("writes nothing over a sync conflict left in the configuration page", async () => {
    const pages: string[] = [];
    const conflicted = ["```space-lua", MANAGED_MARKER, "<<<<<<< SB sha256:1", 'config.set("silverware.table.metadata", true)', "=======", 'config.set("silverware.table.metadata", false)', ">>>>>>> SB sha256:2", "```", ""].join("\n");
    await setup(PAGE, {}, { readPage: () => conflicted, saveConfigPage: (text) => void pages.push(text) });
    await controller.openSettings();
    tick(box("silverware.table.metadata"), true);
    button("swt-settings-save").click();
    for (let i = 0; i < 3; i++) await flush();
    expect(pages).toEqual([]);
    expect(flashes.at(-1)).toContain("sync conflict");
    expect(dialog()).not.toBeNull();
  });

  it("saves in SilverBullet's configuration page, in the Configuration Manager's block, other lines kept", async () => {
    let page = "# Configuration\n\n```space-lua\n" + MANAGED_MARKER + '\nconfig.set("theme", "dark")\n```\n';
    const pages: string[] = [];
    await setup(PAGE, {}, {
      readPage: (name) => (name === "CONFIG" ? page : ""),
      saveConfigPage: (text) => {
        pages.push(text);
        page = text;
      },
    });
    await controller.openSettings();
    tick(box("silverware.table.metadata"), true);
    button("swt-settings-save").click();
    for (let i = 0; i < 3; i++) await flush();
    expect(pages).toEqual(["# Configuration\n\n```space-lua\n" + MANAGED_MARKER + '\nconfig.set("theme", "dark")\nconfig.set("silverware.table.metadata", true)\n```\n']);
  });

  it("shows every setting, each with what it does", async () => {
    expect(new Set(dialogKeys())).toEqual(new Set(Object.keys(SETTINGS)));
    await setup(PAGE);
    await controller.openSettings();
    for (const key of Object.keys(SETTINGS) as (keyof typeof SETTINGS)[]) {
      expect(setting(SETTINGS[key].path).querySelector(".swt-settings-hint")!.textContent).toBe(SETTINGS[key].hint);
    }
  });

  it("waits for a valid number to save, and asks before Esc drops changes", async () => {
    const saved: Record<string, unknown>[] = [];
    let asked = 0;
    let answer = false;
    await setup(PAGE, {}, { saveSettings: (values) => void saved.push(values), confirm: () => (asked++, answer) });
    await controller.openSettings();
    const height = box("silverware.table.maxHeight");
    height.value = "-5";
    height.dispatchEvent(new Event("input"));
    expect(button("swt-settings-save").disabled).toBe(true);
    expect(dialog()!.querySelector(".swt-settings-note")!.textContent).toContain("not valid");
    height.value = "120";
    height.dispatchEvent(new Event("input"));
    expect(button("swt-settings-save").disabled).toBe(false);
    // Esc with a change: asked; no: it stays open
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    expect(asked).toBe(1);
    expect(dialog()).not.toBeNull();
    answer = true;
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    expect(dialog()).toBeNull();
    expect(saved).toEqual([]);
  });

  it("keeps its keys from the tables: Enter on Save with a cell selected saves, it edits no cell", async () => {
    localStorage.removeItem("silverware.table.editMode");
    const saved: Record<string, unknown>[] = [];
    await setup(PAGE, {}, { saveSettings: (values) => void saved.push(values) });
    cell(1, 0).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    cell(1, 0).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(cell(1, 0).classList.contains("swt-selected")).toBe(true);
    await controller.openSettings();
    tick(box("silverware.table.metadata"), true);
    key(button("swt-settings-save"), "Enter");
    key(button("swt-settings-save"), "x");
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
  });

  it("only shows the settings where they cannot be saved", async () => {
    await setup(PAGE);
    await controller.openSettings();
    tick(box("silverware.table.metadata"), true);
    expect(button("swt-settings-save").disabled).toBe(true);
    expect(dialog()!.querySelector(".swt-settings-note")!.textContent).toContain("cannot be saved");
  });
});
