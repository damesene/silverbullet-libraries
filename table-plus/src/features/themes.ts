// The themes module: how tables look (header, lines, stripes, spacing), from
// CSS for tables marked data-tp-theme (the library page's "Themes", or a
// space-style block of the user's). Every table takes the theme of the
// setting (tablePlus.modules.themes.theme); a table's metadata row may choose
// another one (theme="slate"), from Theme in its ⋯ menu. Whether a theme
// shows light or dark is SilverBullet's (html[data-theme]), not the table's.
// Stripes are not the theme's: a theme gives their color, the setting
// (tablePlus.modules.themes.stripes) or the table (stripes="columns") whether
// every other row is tinted (SilverBullet's own), every other column, or none
// (data-tp-stripes="none" / "columns"; rows: no mark).
//
// The marks go on a table as SilverBullet puts it into the page, before the
// browser lays it out (tableAdded, from the <meta> of its metadata row as
// rendered), so a table rendered anew after an edit does not show
// SilverBullet's look for a moment; once enhanced, its markdown confirms them.
import type { Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { WIDGET_SELECTOR } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { parseTable, type Table } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { withMeta } from "../meta.ts";
import { allThemes, NATIVE_THEME, STRIPES, type Stripes, stripesName, themeLabel, themeName } from "../themes.ts";

// The stripes' icons and what they do, in the Theme list
const STRIPES_ICONS: Readonly<Record<Stripes, string>> = { none: ICONS.stripesNone, rows: ICONS.stripesRows, columns: ICONS.stripesColumns };
const STRIPES_TITLES: Readonly<Record<Stripes, string>> = {
  none: "No stripes",
  rows: "Striped rows: every other row tinted",
  columns: "Striped columns: every other column tinted",
};

/** A table's own theme, from its metadata row (theme="…"), if it chose one */
export function metaTheme(table: Table): string | undefined {
  return themeName(table.meta?.theme);
}

/** A table's own stripes, from its metadata row (stripes="none" / "rows" / "columns"), if it chose them */
export function metaStripes(table: Table): Stripes | undefined {
  return stripesName(table.meta?.stripes);
}

export class Themes implements Feature {
  // The settings, read when Table Plus starts and again as tables are enhanced
  private theme = NATIVE_THEME;
  private stripes: Stripes = "rows";

  constructor(private readonly host: TableHost) {}

  start(): void {
    void this.readSettings();
  }

  stop(): void {
    for (const widget of this.widgets()) {
      delete widget.dataset.tpTheme;
      delete widget.dataset.tpStripes;
    }
  }

  // Before the browser lays the table out: its metadata row's choices as rendered (<meta theme="…" stripes="…">), else the settings'
  tableAdded(widget: HTMLElement, _table: HTMLTableElement, rows: readonly HTMLTableRowElement[]): void {
    const meta = rows[rows.length - 1]?.querySelector("meta");
    this.mark(widget, themeName(meta?.getAttribute("theme")) ?? this.theme, stripesName(meta?.getAttribute("stripes")) ?? this.stripes);
  }

  enhanced(widget: HTMLElement, info: WidgetInfo): void {
    this.markFor(widget, info);
    // A change of the settings applies to every table
    void this.readSettings();
  }

  private markFor(widget: HTMLElement, info: WidgetInfo): void {
    const table = parseTable(info.source);
    this.mark(widget, metaTheme(table) ?? this.theme, metaStripes(table) ?? this.stripes);
  }

  private async readSettings(): Promise<void> {
    const [theme, stripes] = await Promise.all([this.host.setting("theme"), this.host.setting("stripes")]);
    if (theme === this.theme && stripes === this.stripes) return;
    this.theme = theme;
    this.stripes = stripes;
    for (const widget of this.widgets()) {
      const info = this.host.infoOf(widget);
      if (info) this.markFor(widget, info);
    }
  }

  /** The theme on the table (native: none, SilverBullet's own look), and its stripes unless they are the rows (SilverBullet's own) */
  private mark(widget: HTMLElement, theme: string, stripes: Stripes): void {
    if (theme === NATIVE_THEME) delete widget.dataset.tpTheme;
    else if (widget.dataset.tpTheme !== theme) widget.dataset.tpTheme = theme;
    if (stripes === "rows") delete widget.dataset.tpStripes;
    else if (widget.dataset.tpStripes !== stripes) widget.dataset.tpStripes = stripes;
  }

  private widgets(): HTMLElement[] {
    return Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`));
  }

  /**
   * Theme in the table's ⋯ menu: Global theme first (the table's own theme
   * and stripes go: it follows the settings), the stripes (three icons: none,
   * rows, columns), then every theme; a stripes or a theme picked is stored in
   * the table's metadata row, also the settings' one (kept whatever the
   * settings become). As names are, only where the table can have metadata.
   */
  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    if (!info.metaRow && !this.host.metadataEnabled) return [];
    const table = parseTable(info.source);
    const own = metaTheme(table);
    const ownStripes = metaStripes(table);
    const set = (choices: Readonly<Record<string, string | undefined>>) => () => void this.choose(widget, info, choices);
    const item = (label: string, checked: boolean, run: () => void, hint?: string): MenuEntry => ({ kind: "item", label, icon: "", checked, run, ...(hint ? { hint } : {}) });
    // Made as the list opens: finding the themes reads every style rule of the page
    const themes = (): MenuEntry[] => [
      // First the global theme (as "No type" leads the column types): the table's own theme and stripes go, it follows the settings
      item(
        "Global theme",
        own === undefined && ownStripes === undefined,
        set({ theme: undefined, stripes: undefined }),
        `The table takes the Theme and Stripes settings (now ${themeLabel(this.theme)}, ${STRIPES_TITLES[this.stripes].toLowerCase()}), and changes with them`,
      ),
      { kind: "separator" },
      stripesRow,
      { kind: "separator" },
      // Then every theme, the setting's marked (default): one picked is the table's own, the setting's one too, whatever the setting becomes
      ...allThemes(this.host.doc).map((theme) =>
        item(`${themeLabel(theme)}${theme === this.theme ? " (default)" : ""}`, own === theme, set({ theme }), "This table keeps this theme, whatever the setting"),
      ),
    ];
    const stripesRow: MenuEntry = {
      kind: "segmented",
      label: "Stripes",
      // The table's own marked, none while it follows the setting (as a theme picked is; Global theme: the setting's again)
      options: STRIPES.map((s) => ({ icon: STRIPES_ICONS[s], title: STRIPES_TITLES[s], active: s === ownStripes, run: set({ stripes: s }) })),
    };
    return [
      {
        label: "Theme",
        title: "How this table looks: the Theme and Stripes settings (Global theme), or a theme and stripes of its own (stored in the table)",
        icon: ICONS.theme,
        value: own ? themeLabel(own) : `${themeLabel(this.theme)} (global)`,
        // Not used: the item opens its choices
        run: () => {},
        choices: { title: "Table theme", entries: themes },
      },
    ];
  }

  /** The table's own choices written into its metadata row, as one edit (undefined: the setting's again) */
  private async choose(shownWidget: HTMLElement, shownInfo: WidgetInfo, choices: Readonly<Record<string, string | undefined>>): Promise<void> {
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (table) => Object.entries(choices).reduce((t, [name, value]) => withMeta(t, name, value), table));
    this.host.focusEditor(widget);
  }
}
