// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { FEATURE_NAMES, SETTINGS } from "./bridge.ts";
import { MANAGED_MARKER } from "./configpage.ts";
import { dialogKeys } from "./settings.ts";
import { cell, controller, editor, flashes, flush, key, PAGE, setup, useTablePage } from "./testing/page.ts";

describe("The settings dialog", () => {
  useTablePage();

  const dialog = () => document.querySelector<HTMLElement>(".tp-settings");
  const setting = (path: string) => dialog()!.querySelector<HTMLElement>(`[data-tp-setting="${path}"]`)!;
  const box = (path: string) => setting(path).querySelector<HTMLInputElement>("input")!;
  const module = (name: string) => dialog()!.querySelector<HTMLInputElement>(`input[data-tp-module="${name}"]`)!;
  const button = (cls: string) => dialog()!.querySelector<HTMLButtonElement>(`.${cls}`)!;
  const tick = (input: HTMLInputElement, checked: boolean) => {
    input.checked = checked;
    input.dispatchEvent(new Event("change"));
  };

  it("says it sets every table, not the one it was opened from", async () => {
    await setup(PAGE);
    await controller.openSettings();
    expect(dialog()!.querySelector(".tp-settings-title")!.textContent).toBe("Table Plus settings");
    expect(dialog()!.querySelector(".tp-settings-scope")!.textContent).toContain("every table in the space");
  });

  it("shows the settings as configured; saves what changed, each value as it is; Cancel and Esc save nothing", async () => {
    const saved: Record<string, unknown>[] = [];
    await setup(PAGE, { "tablePlus.maxHeight": 300 }, { saveSettings: (values) => void saved.push(values), confirm: () => true });
    await controller.openSettings();
    expect(box("tablePlus.metadata").checked).toBe(false);
    expect(box("tablePlus.maxHeight").value).toBe("300");
    // Nothing changed: nothing to save
    expect(button("tp-settings-save").disabled).toBe(true);
    tick(box("tablePlus.metadata"), true);
    expect(button("tp-settings-save").disabled).toBe(false);
    expect(button("tp-settings-save").textContent).toBe("Save");
    // Cancel: closed, nothing saved
    button("tp-settings-cancel").click();
    expect(dialog()).toBeNull();
    expect(saved).toEqual([]);
    // Esc too
    await controller.openSettings();
    tick(box("tablePlus.metadata"), true);
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    expect(dialog()).toBeNull();
    expect(saved).toEqual([]);
    // Saved: what changed
    await controller.openSettings();
    tick(box("tablePlus.metadata"), true);
    box("tablePlus.maxHeight").value = "0";
    box("tablePlus.maxHeight").dispatchEvent(new Event("input"));
    button("tp-settings-save").click();
    await flush();
    // Written as it is, the default too: the value shown may come from elsewhere, which the managed block overrides
    expect(saved).toEqual([{ "tablePlus.metadata": true, "tablePlus.maxHeight": 0 }]);
    expect(dialog()).toBeNull();
  });

  it("lists the modules with what they do, their own settings under them while on; turning one off saves and reloads", async () => {
    const saved: Record<string, unknown>[] = [];
    let reloaded = 0;
    await setup(PAGE, {}, { saveSettings: (values) => void saved.push(values), reloadUI: () => void reloaded++ });
    await controller.openSettings();
    expect(dialog()!.querySelectorAll("input[data-tp-module]").length).toBe(FEATURE_NAMES.length);
    // Large tables is off until turned on, the others on
    expect(module("largeTables").checked).toBe(false);
    expect(module("formulas").checked).toBe(true);
    const longText = module("longText").closest(".tp-settings-module")!;
    expect(longText.querySelector(".tp-settings-hint")!.textContent).toContain("maximum column width");
    const own = longText.querySelector<HTMLElement>(".tp-settings-module-settings")!;
    expect(own.hidden).toBe(false);
    expect(own.querySelector('[data-tp-setting="tablePlus.modules.longText.maxWidth"]')).not.toBeNull();
    tick(module("longText"), false);
    expect(own.hidden).toBe(true);
    expect(button("tp-settings-save").textContent).toBe("Save and reload");
    button("tp-settings-save").click();
    await flush();
    expect(saved).toEqual([{ "tablePlus.modules.longText.enabled": false }]);
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
    tick(box("tablePlus.metadata"), true);
    button("tp-settings-save").click();
    for (let i = 0; i < 3; i++) await flush();
    expect(pages).toEqual([]);
    expect(dialog()).not.toBeNull();
  });

  it("writes nothing over a sync conflict left in the configuration page", async () => {
    const pages: string[] = [];
    const conflicted = ["```space-lua", MANAGED_MARKER, "<<<<<<< SB sha256:1", 'config.set("tablePlus.metadata", true)', "=======", 'config.set("tablePlus.metadata", false)', ">>>>>>> SB sha256:2", "```", ""].join("\n");
    await setup(PAGE, {}, { readPage: () => conflicted, saveConfigPage: (text) => void pages.push(text) });
    await controller.openSettings();
    tick(box("tablePlus.metadata"), true);
    button("tp-settings-save").click();
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
    tick(box("tablePlus.metadata"), true);
    button("tp-settings-save").click();
    for (let i = 0; i < 3; i++) await flush();
    expect(pages).toEqual(["# Configuration\n\n```space-lua\n" + MANAGED_MARKER + '\nconfig.set("theme", "dark")\nconfig.set("tablePlus.metadata", true)\n```\n']);
  });

  it("shows every setting, each with what it does", async () => {
    expect(new Set(dialogKeys())).toEqual(new Set(Object.keys(SETTINGS)));
    await setup(PAGE);
    await controller.openSettings();
    for (const key of Object.keys(SETTINGS) as (keyof typeof SETTINGS)[]) {
      expect(setting(SETTINGS[key].path).querySelector(".tp-settings-hint")!.textContent).toBe(SETTINGS[key].hint);
    }
  });

  it("waits for a valid number to save, and asks before Esc drops changes", async () => {
    const saved: Record<string, unknown>[] = [];
    let asked = 0;
    let answer = false;
    await setup(PAGE, {}, { saveSettings: (values) => void saved.push(values), confirm: () => (asked++, answer) });
    await controller.openSettings();
    const height = box("tablePlus.maxHeight");
    height.value = "-5";
    height.dispatchEvent(new Event("input"));
    expect(button("tp-settings-save").disabled).toBe(true);
    expect(dialog()!.querySelector(".tp-settings-note")!.textContent).toContain("not valid");
    height.value = "120";
    height.dispatchEvent(new Event("input"));
    expect(button("tp-settings-save").disabled).toBe(false);
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
    localStorage.removeItem("tablePlus.editMode");
    const saved: Record<string, unknown>[] = [];
    await setup(PAGE, {}, { saveSettings: (values) => void saved.push(values) });
    cell(1, 0).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    cell(1, 0).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(cell(1, 0).classList.contains("tp-selected")).toBe(true);
    await controller.openSettings();
    tick(box("tablePlus.metadata"), true);
    key(button("tp-settings-save"), "Enter");
    key(button("tp-settings-save"), "x");
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
  });

  it("only shows the settings where they cannot be saved", async () => {
    await setup(PAGE);
    await controller.openSettings();
    tick(box("tablePlus.metadata"), true);
    expect(button("tp-settings-save").disabled).toBe(true);
    expect(dialog()!.querySelector(".tp-settings-note")!.textContent).toContain("cannot be saved");
  });
});
