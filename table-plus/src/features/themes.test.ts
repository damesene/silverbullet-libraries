// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { settingChoices } from "../bridge.ts";
import { PAGE, controller, editor, flush, setup, tableMenuItem, text, useTablePage } from "../testing/page.ts";
import { allThemes, themeLabel, themeName } from "../themes.ts";

describe("Themes", () => {
  useTablePage();
  afterEach(() => document.getElementById("own-theme")?.remove());

  const widget = () => editor.querySelector<HTMLElement>(".sb-table-widget")!;
  const menuLabels = () => Array.from(document.querySelectorAll(".tp-menu .tp-menu-item, .tp-menu .tp-menu-separator")).map((e) => e.textContent || "—");
  const checked = () => Array.from(document.querySelectorAll('.tp-menu .tp-menu-item[aria-checked="true"]')).map((e) => e.textContent);
  const META = '| Name | Qty |\n|---|---|\n| Pear | 3 |\n| <meta theme="ocean"> |\n';

  it("marks every table with the setting's theme; native leaves it unmarked", async () => {
    await setup(PAGE, { "tablePlus.modules.themes.theme": "slate" });
    await flush();
    expect(widget().dataset.tpTheme).toBe("slate");
    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE);
    await flush();
    expect(widget().dataset.tpTheme).toBeUndefined();
  });

  it("takes a table's own theme from its metadata row, before and after it is enhanced", async () => {
    await setup(META, { "tablePlus.modules.themes.theme": "slate" });
    await flush();
    expect(widget().dataset.tpTheme).toBe("ocean");
  });

  it("chooses a table's own theme in its ⋯ menu, stored in the table, the global theme's too; Global theme follows the setting again", async () => {
    await setup(PAGE, { "tablePlus.metadata": true, "tablePlus.modules.themes.theme": "minimal" });
    await flush();
    const item = tableMenuItem(/^Theme/)!;
    expect(item.textContent).toBe("Theme: Minimal (global)");
    item.click();
    // The list in the menu's place
    expect(document.querySelector(".tp-menu-title")!.textContent).toContain("Table theme");
    expect(menuLabels()).toEqual(["Global theme: Minimal", "—", "—", "Native", "Playground", "Minimal (default)", "Slate", "Grid", "Ocean", "Paper", "Contrast", "Compact", "Bold", "Soft", "Ledger"]);
    expect(checked()).toEqual(["Global theme: Minimal"]);
    Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-item")).find((b) => b.textContent === "Paper")!.click();
    await flush();
    await controller.scan();
    expect(text).toBe(`${PAGE}| <meta theme="paper"> |\n`);
    expect(widget().dataset.tpTheme).toBe("paper");
    // Native for this table, though the setting's is another
    tableMenuItem(/^Theme/)!.click();
    expect(checked()).toEqual(["Paper"]);
    Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-item")).find((b) => b.textContent === "Native")!.click();
    await flush();
    await controller.scan();
    expect(widget().dataset.tpTheme).toBeUndefined();
    tableMenuItem(/^Theme/)!.click();
    Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-item")).find((b) => b.textContent?.startsWith("Global theme"))!.click();
    await flush();
    await controller.scan();
    expect(text).toBe(PAGE);
    expect(widget().dataset.tpTheme).toBe("minimal");
  });

  it("stripes rows, columns or nothing as the setting says, any theme, native too; a table's metadata says otherwise", async () => {
    await setup(PAGE, { "tablePlus.modules.themes.stripes": "none" });
    await flush();
    expect(widget().dataset.tpStripes).toBe("none");
    expect(widget().dataset.tpTheme).toBeUndefined();
    controller.stop();
    document.body.replaceChildren();
    await setup('| A |\n|---|\n| 1 |\n| <meta stripes="rows" theme="grid"> |\n', { "tablePlus.modules.themes.stripes": "none" });
    await flush();
    // Rows: SilverBullet's own, no mark
    expect(widget().dataset.tpStripes).toBeUndefined();
    expect(widget().dataset.tpTheme).toBe("grid");
    controller.stop();
    document.body.replaceChildren();
    await setup('| A |\n|---|\n| 1 |\n| <meta stripes="columns"> |\n');
    await flush();
    expect(widget().dataset.tpStripes).toBe("columns");
  });

  it("sets a table's stripes with the icons in its Theme list; Global theme takes them and the theme away", async () => {
    await setup(PAGE, { "tablePlus.metadata": true });
    await flush();
    const segments = () => Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-segmented button"));
    const active = () => segments().map((b) => b.getAttribute("aria-checked") === "true");
    const pick = (label: string) => Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-item")).find((b) => b.textContent === label)!.click();
    tableMenuItem(/^Theme/)!.click();
    expect(segments().map((b) => b.title)).toEqual(["No stripes", "Striped rows: every other row tinted", "Striped columns: every other column tinted"]);
    // Following the setting (Global theme): none marked
    expect(active()).toEqual([false, false, false]);
    segments()[2]!.click(); // columns
    await flush();
    await controller.scan();
    expect(document.querySelector(".tp-menu")).toBeNull();
    expect(text).toBe(`${PAGE}| <meta stripes="columns"> |\n`);
    expect(widget().dataset.tpStripes).toBe("columns");
    // Rows, as the setting: kept as the table's own
    tableMenuItem(/^Theme/)!.click();
    expect(active()).toEqual([false, false, true]);
    expect(checked()).toEqual([]);
    segments()[1]!.click();
    await flush();
    await controller.scan();
    expect(text).toBe(`${PAGE}| <meta stripes="rows"> |\n`);
    tableMenuItem(/^Theme/)!.click();
    pick("Ocean");
    await flush();
    await controller.scan();
    expect(text).toBe(`${PAGE}| <meta stripes="rows" theme="ocean"> |\n`);
    // Global theme: both go, in one edit
    tableMenuItem(/^Theme/)!.click();
    Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-item")).find((b) => b.textContent?.startsWith("Global theme"))!.click();
    await flush();
    await controller.scan();
    expect(text).toBe(PAGE);
    expect(widget().dataset.tpTheme).toBeUndefined();
    expect(widget().dataset.tpStripes).toBeUndefined();
  });

  it("opens the Theme list at the table's theme: focused and highlighted, not the item under the pointer until it moves", async () => {
    await setup(PAGE, { "tablePlus.metadata": true, "tablePlus.modules.themes.theme": "grid" });
    await flush();
    tableMenuItem(/^Theme/)!.click();
    const menu = document.querySelector<HTMLElement>(".tp-menu")!;
    const current = document.activeElement as HTMLElement;
    expect(current.textContent).toBe("Global theme: Grid");
    expect(current.classList.contains("tp-menu-current")).toBe(true);
    expect(menu.classList.contains("tp-menu-still")).toBe(true);
    menu.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(menu.classList.contains("tp-menu-still")).toBe(false);
  });

  it("previews a theme beside the item hovered, one table for the list, not taken for one of the page's", async () => {
    await setup(PAGE, { "tablePlus.metadata": true, "tablePlus.modules.themes.theme": "slate", "tablePlus.modules.themes.stripes": "columns" });
    await flush();
    tableMenuItem(/^Theme/)!.click();
    const items = () => Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-item"));
    const preview = () => document.querySelector<HTMLElement>(".tp-menu .tp-menu-detail .tp-theme-preview");
    // Opened at the table's choice, Global theme: no bubble there (its theme is listed, marked default)
    expect(preview()).toBeNull();
    items().find((b) => b.textContent === "Slate (default)")!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(preview()!.dataset.tpTheme).toBe("slate");
    expect(preview()!.dataset.tpStripes).toBe("columns");
    const first = preview();
    items().find((b) => b.textContent === "Ocean")!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(preview()!.dataset.tpTheme).toBe("ocean");
    items().find((b) => b.textContent === "Native")!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(preview()!.dataset.tpTheme).toBeUndefined();
    expect(preview()).toBe(first);
    expect(preview()!.querySelectorAll("tbody tr").length).toBe(4);
    // Table Plus' own: not enhanced as a table of the page
    await controller.scan();
    expect(preview()!.classList.contains("tp-table")).toBe(false);
    expect(preview()!.dataset.tpUnsupported).toBeUndefined();
  });

  it("offers a theme the page's styles define, in the menu and the setting", async () => {
    const style = Object.assign(document.createElement("style"), {
      id: "own-theme",
      textContent: '.sb-table-widget[data-tp-theme="sand-dune"] { --tp-head-bg: #f3ead8; }',
    });
    document.head.append(style);
    expect(allThemes(document)).toContain("sand-dune");
    expect(settingChoices("theme", document, "native").map((c) => c.label)).toContain("Sand dune");
    await setup(PAGE, { "tablePlus.metadata": true });
    await flush();
    tableMenuItem(/^Theme/)!.click();
    expect(menuLabels()).toContain("Sand dune");
  });

  it("leaves tables unmarked with the module off, a theme stored in one kept", async () => {
    await setup(META, { "tablePlus.metadata": true, "tablePlus.modules.themes.enabled": false });
    await flush();
    expect(widget().dataset.tpTheme).toBeUndefined();
    expect(tableMenuItem(/^Theme/)).toBeUndefined();
    expect(text).toBe(META);
  });

  it("reads theme names as written, and names them for menus", () => {
    expect(themeName(" slate ")).toBe("slate");
    expect(themeName("my theme")).toBeUndefined();
    expect(themeName('x"]')).toBeUndefined();
    expect(themeLabel("sand-dune")).toBe("Sand dune");
    // A theme set that no style defines is still shown, as set
    expect(settingChoices("theme", document, "gone").at(-1)).toEqual({ value: "gone", label: "Gone" });
  });
});
