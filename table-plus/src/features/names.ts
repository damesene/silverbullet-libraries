// Names kept in cells (names.ts): a column's fixed name, set in the column's
// menu. Formulas and the stored sorting name the column by it, so renaming the
// header (also in the markdown) does not break them, nor references from
// other pages. Setting or removing it rewrites the references to the column on
// the page (the write steps follow the column's new name).
import { columnIdOf, columnKey } from "../columns.ts";
import type { Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { nameOf, nameProblem, withName } from "../names.ts";
import { setCell } from "../ops.ts";

export class Names implements Feature {
  constructor(private readonly host: TableHost) {}

  /** "Fixed name" in a column's menu */
  columnMenuEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    const fixed = nameOf(parseTable(info.source).rows[0]?.cells[column] ?? "");
    // A name is metadata: with the setting off, only one already there can be changed or removed
    const allowed = this.host.metadataEnabled || fixed !== undefined;
    return [
      {
        kind: "item",
        label: "Fixed name",
        icon: ICONS.fixedName,
        ...(fixed ? { value: { text: fixed } } : {}),
        ...(allowed
          ? {
              hint: fixed
                ? `Formulas refer to this column as [${fixed}], whatever its header says. Click to change or remove it`
                : "Give the column a name formulas refer to it by, which stays when its header is renamed (also from other pages)",
            }
          : { disabled: "Needs the Store table metadata setting" }),
        run: () => void this.rename(widget, info, column),
      },
    ];
  }

  private async rename(shownWidget: HTMLElement, shownInfo: WidgetInfo, column: number): Promise<void> {
    const headers = parseTable(shownInfo.source).rows[0]?.cells ?? [];
    const current = nameOf(headers[column] ?? "") ?? "";
    const answer = await this.host.promptText("Fixed name of the column (letters, digits and _; empty: none)", current || columnKey(headers[column] ?? ""));
    if (answer === undefined) return;
    const name = answer.trim();
    if (name === current) return;
    const problem = name === "" ? undefined : nameProblem(name, "column");
    // Another column already answers to it: [name] would be ambiguous
    const taken =
      name !== "" &&
      headers.some((header, c) => c !== column && (nameOf(header)?.toLowerCase() === name.toLowerCase() || columnIdOf(headers, c)?.name === name.toLowerCase()));
    if (problem || taken) {
      void this.host.bridge.flash(`Table Plus: ${problem ?? `another column of this table is named ${name}`}`, "error");
      return;
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => setCell(t, 0, column, withName(t.rows[0]?.cells[column] ?? "", name || undefined)));
    this.host.focusEditor(widget);
  }
}
