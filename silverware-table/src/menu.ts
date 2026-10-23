// What a menu holds (its entries, a detail, a submenu's way back, its naming),
// as the modules give it: data, made into a menu by the core (core/menu.ts,
// TableHost.floatingMenu).

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
      // While it is hovered or focused (true), and no longer (false): what it would do shown elsewhere (where a table goes)
      readonly highlight?: (on: boolean) => void;
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
      // Names side by side (the table's: its sheet's, its own), each after its icon button; a click on a name names it
      readonly kind: "names";
      readonly names: readonly {
        // What it names (a class of its own: swt-menu-name-<key>)
        readonly key?: string;
        readonly icon?: { readonly icon: string; readonly label: string; readonly title: string; readonly pressed?: boolean; readonly run: () => void };
        // None: the icon alone (what it names is named elsewhere: the table in the menu's title)
        readonly name?: string;
        readonly title?: string;
        // A stand-in for none (No sheet): muted; something missing (a table shown as a sheet on none): in the danger color
        readonly muted?: boolean;
        readonly attention?: boolean;
        readonly run?: () => void;
        // A × after the name taking it away (Remove from sheet): what an empty name does
        readonly clear?: { readonly title: string; readonly run: () => void };
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
        : entry.kind === "names"
          ? {
              ...entry,
              names: entry.names.map((n) => ({
                ...n,
                ...(n.run ? { run: wrap(n.run) } : {}),
                ...(n.icon ? { icon: { ...n.icon, run: wrap(n.icon.run) } } : {}),
                ...(n.clear ? { clear: { ...n.clear, run: wrap(n.clear.run) } } : {}),
              })),
            }
          : entry,
  );
}

/** An icon button before a menu's title, which it acts on (the table's: full screen); the title then starts at it */
export type MenuTitleIcon = { readonly icon: string; readonly label: string; readonly title: string; readonly pressed?: boolean; readonly run: () => void };

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
  // A button under the field saving no name, where it has one (Remove name, Remove from sheet): what an empty field does
  readonly clear?: { readonly label: string; readonly title: string };
  readonly save: (name: string) => Promise<string | undefined>;
};

/** A menu's naming whose save also closes the menu, once the name is saved */
export function namingThatCloses(naming: MenuNaming | undefined, close: () => void): MenuNaming | undefined {
  if (!naming) return undefined;
  return {
    ...naming,
    save: async (name) => {
      const why = await naming.save(name);
      if (why === undefined) close();
      return why;
    },
  };
}
