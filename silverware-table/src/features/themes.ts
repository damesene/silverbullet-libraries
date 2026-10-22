// The themes module: how tables look (header, lines, stripes, spacing), from
// CSS for tables marked data-swt-theme (the library page's "Themes", or a
// space-style block of the user's). Every table takes the theme of the
// setting (silverware.table.modules.themes.theme); a table's metadata row may choose
// another one (theme="slate"), from Theme in its ⋯ menu. Whether a theme
// shows light or dark is SilverBullet's (html[data-theme]), not the table's.
// Stripes are not the theme's: a theme gives their color, the setting
// (silverware.table.modules.themes.stripes) or the table (stripes="columns") whether
// every other row is tinted (SilverBullet's own), every other column, or none
// (data-swt-stripes="none" / "columns"; rows: no mark).
//
// A table's look as a whole (Feature.tableLook): the core asks for it as soon
// as the table is rendered (its metadata as rendered, before the browser lays
// it out), so a table rendered anew after an edit does not show SilverBullet's
// look for a moment; once its markdown is read, again from it.
import type { Feature, ModelHost, TableLook, TablePreview, ToolbarButton, TableInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { parseTable, type Table, type TableMeta } from "../markdown.ts";
import type { MenuDetail, MenuEntry } from "../menu.ts";

type MenuItem = Extract<MenuEntry, { readonly kind: "item" }>;
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
  // The settings, read when Silverware Table starts and again as tables are enhanced
  private theme = NATIVE_THEME;
  private stripes: Stripes = "rows";

  constructor(private readonly host: ModelHost) {}

  start(): void {
    void this.readSettings();
  }

  /** The table's own theme and stripes (its metadata row), else the settings'; native and rows are SilverBullet's own look: no attribute */
  tableLook(meta: TableMeta | undefined): TableLook {
    const theme = themeName(meta?.theme) ?? this.theme;
    const stripes = stripesName(meta?.stripes) ?? this.stripes;
    return { theme: theme === NATIVE_THEME ? undefined : theme, stripes: stripes === "rows" ? undefined : stripes };
  }

  // A change of the settings applies to every table
  enhanced(): void {
    void this.readSettings();
  }

  private async readSettings(): Promise<void> {
    const [theme, stripes] = await Promise.all([this.host.setting("theme"), this.host.setting("stripes")]);
    if (theme === this.theme && stripes === this.stripes) return;
    this.theme = theme;
    this.stripes = stripes;
    this.host.tableLooksChanged();
  }

  /**
   * Theme in the table's ⋯ menu: Global theme first (the table's own theme
   * and stripes go: it follows the settings), the stripes (three icons: none,
   * rows, columns), then every theme; a stripes or a theme picked is stored in
   * the table's metadata row, also the settings' one (kept whatever the
   * settings become). As names are, only where the table can have metadata.
   */
  toolbarButtons(info: TableInfo): ToolbarButton[] {
    if (!info.metaRow && !this.host.metadataEnabled) return [];
    const table = parseTable(info.source);
    const own = metaTheme(table);
    const ownStripes = metaStripes(table);
    const set = (choices: Readonly<Record<string, string | undefined>>) => () => void this.choose(info, choices);
    const item = (label: string, checked: boolean, run: () => void, detail?: MenuDetail): MenuItem => ({ kind: "item", label, icon: "", checked, run, ...(detail ? { detail } : {}) });
    // Made as the list opens: finding the themes reads every style rule of the page
    const themes = (): MenuEntry[] => {
      // One preview for the list, beside the item hovered (or focused), in its theme and the table's stripes
      const preview = this.preview(ownStripes ?? this.stripes);
      const stripes = ownStripes ?? this.stripes;
      const showing = (theme: string) => () => {
        preview.setLook({ theme: theme === NATIVE_THEME ? undefined : theme, stripes: stripes === "rows" ? undefined : stripes });
        return preview.element;
      };
      const detail = (theme: string): MenuDetail => ({ title: themeLabel(theme), content: showing(theme) });
      return [
      // First the global theme (as "No type" leads the column types): the table's own theme and stripes go, it follows the settings
      // The settings' theme after it, no preview (it is listed below, marked default)
      { ...item("Global theme", own === undefined && ownStripes === undefined, set({ theme: undefined, stripes: undefined })), value: { text: themeLabel(this.theme) } },
      { kind: "separator" },
      stripesRow,
      { kind: "separator" },
      // Then every theme, the setting's marked (default): one picked is the table's own, the setting's one too, whatever the setting becomes
      ...allThemes(this.host.doc).map((theme) =>
        item(
          `${themeLabel(theme)}${theme === this.theme ? " (default)" : ""}`,
          own === theme,
          set({ theme }),
          detail(theme),
        ),
      ),
      ];
    };
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

  /** A small table to preview themes on (in a menu's bubble: not one of the page's), with these stripes */
  private preview(stripes: Stripes): TablePreview {
    const preview = this.host.previewTable(["Name", "Qty", "Price"], [["Pear", "3", "12.99"], ["Apple", "10", "4.50"], ["Fig", "2", "25.00"], ["Kiwi", "7", "6.10"]], { stripes: stripes === "rows" ? undefined : stripes });
    preview.element.classList.add("swt-theme-preview");
    return preview;
  }

  /** The table's own choices written into its metadata row, as one edit (undefined: the setting's again) */
  private async choose(shownInfo: TableInfo, choices: Readonly<Record<string, string | undefined>>): Promise<void> {
    const info = this.host.tableFor(shownInfo.key) ?? shownInfo;
    await this.host.writeTable(info, (table) => Object.entries(choices).reduce((t, [name, value]) => withMeta(t, name, value), table));
    this.host.focusPage();
  }
}
