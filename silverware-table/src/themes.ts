// Table themes: a theme is CSS for tables marked data-swt-theme="<name>", which
// sets --swt-* variables (the library page's CSS turns them into the table's
// look, see "Themes" there). The built-in ones are on the library page; a
// space-style block of the user's adds more, without anything registered:
// a theme is found by its selector in the page's styles.

/** The built-in themes, in the order offered; native: SilverBullet's own look (no theme) */
export const BUILT_IN_THEMES = ["native", "plain", "playground", "minimal", "slate", "grid", "ocean", "paper", "contrast", "compact", "bold", "soft", "ledger"] as const;

export const NATIVE_THEME = "native";

// A theme's name, as written in data-swt-theme and in a table's metadata
const THEME_NAME_RE = /^[\w-]+$/;
const THEME_SELECTOR_RE = /data-swt-theme\s*=\s*["']?([\w-]+)["']?\s*\]/g;

/** A theme's name as it may be written (letters, digits, - and _), else undefined */
export function themeName(value: unknown): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return THEME_NAME_RE.test(name) ? name : undefined;
}

/** How a theme is called in menus: its name, capitalized, dashes as spaces */
export function themeLabel(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The themes the page's styles define (built-in and the user's), by their selectors */
export function themesInStyles(doc: Document): string[] {
  const found = new Set<string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if ("selectorText" in rule && typeof rule.selectorText === "string") {
        for (const match of rule.selectorText.matchAll(THEME_SELECTOR_RE)) found.add(match[1]!);
      }
      // Rules inside @media, @supports, @layer
      if ("cssRules" in rule && rule.cssRules) visit(rule.cssRules as CSSRuleList);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // A style sheet of another origin cannot be read: no themes of ours in it
    }
  }
  return [...found];
}

/** Which lines are striped (every other one tinted, in the theme's color): none, the rows (SilverBullet's own) or the columns */
export const STRIPES = ["none", "rows", "columns"] as const;
export type Stripes = (typeof STRIPES)[number];

export function stripesName(value: unknown): Stripes | undefined {
  return STRIPES.find((s) => s === value);
}

export function stripesLabel(stripes: Stripes): string {
  return themeLabel(stripes);
}

/** Every theme to offer: the built-in ones first, then the others the styles define */
export function allThemes(doc: Document): string[] {
  return [...new Set<string>([...BUILT_IN_THEMES, ...themesInStyles(doc)])];
}
