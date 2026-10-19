// Names kept in cells (names.ts): a column's fixed name, set in the column's
// menu. Formulas and the stored sorting name the column by it, so renaming the
// header (also in the markdown) does not break them, nor references from
// other pages. Setting or removing it rewrites the references to the column on
// the page (the write steps follow the column's new name). And a cell's name,
// set in its row's menu, by which formulas on the page (vat) and on other
// pages ([[Page]]vat) use the cell wherever it is moved.
import { columnIdOf, columnKey } from "../columns.ts";
import type { Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { FUNCTIONS } from "../formula/functions/index.ts";
import { ICONS } from "../icons.ts";
import { findTables, locateBySource, parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { nameOf, nameProblem, withName } from "../names.ts";
import { setCell } from "../ops.ts";

export class Names implements Feature {
  constructor(private readonly host: TableHost) {}

  /** Named cells show a mark in their corner, and their name on hover */
  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    const model = parseTable(info.source);
    for (const tr of Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]"))) {
      model.rows[Number(tr.dataset.tpRow)]?.cells.forEach((raw, column) => {
        const name = nameOf(raw);
        const cell = tr.cells[column];
        if (!name || !cell) return;
        cell.classList.add("tp-named");
        cell.title = cell.title ? `${cell.title}\nName: ${name}` : `Name: ${name}`;
      });
    }
  }

  /** "Name cell" in a row's menu, for its cell in `column` */
  rowMenuEntries(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[] {
    const name = nameOf(parseTable(info.source).rows[row]?.cells[column] ?? "");
    const allowed = this.host.metadataEnabled || name !== undefined;
    return [
      {
        kind: "item",
        label: "Name cell",
        icon: ICONS.fixedName,
        ...(name ? { value: { text: name } } : {}),
        ...(allowed
          ? {
              hint: name
                ? `Formulas use this cell as ${name} (on other pages [[Page]]${name}), wherever it is moved. Click to rename it`
                : "Name this cell, so formulas use it by its name (vat), wherever it is moved",
            }
          : { disabled: "Needs the Store table metadata setting" }),
        run: () => void this.nameCell(widget, info, row, column),
      },
    ];
  }

  private async nameCell(shownWidget: HTMLElement, shownInfo: WidgetInfo, row: number, column: number): Promise<void> {
    const current = nameOf(parseTable(shownInfo.source).rows[row]?.cells[column] ?? "") ?? "";
    const answer = await this.host.promptText("Name of the cell (letters, digits and _; empty: none)", current);
    if (answer === undefined) return;
    const name = answer.trim();
    if (name === current) return;
    let problem = name === "" ? undefined : nameProblem(name, "cell");
    if (!problem && name && FUNCTIONS[name.toUpperCase()]) problem = `${name} is a function's name`;
    if (!problem && name) {
      // The name is the page's: no other cell on it may have it
      const text = await this.host.bridge.getText();
      const own = locateBySource(text, shownInfo.hint, shownInfo.source);
      const taken = findTables(text).some((range) =>
        parseTable(range.text).rows.some((r, ri) =>
          ri > 0 && r.cells.some((cell, ci) => nameOf(cell)?.toLowerCase() === name.toLowerCase() && !(own && range.from === own.from && ri === row && ci === column)),
        ),
      );
      if (taken) problem = `another cell on this page is named ${name}`;
    }
    if (problem) {
      void this.host.bridge.flash(`Table Plus: ${problem}`, "error");
      return;
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => setCell(t, row, column, withName(t.rows[row]?.cells[column] ?? "", name || undefined)));
    this.host.focusEditor(widget);
  }

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
