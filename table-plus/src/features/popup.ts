// The cell's popup: a cell whose text does not fit (cut by the cells settings:
// wrapped up to the maximum height, or cut with an ellipsis), or a cell being
// edited whose text does not fit its field (a long formula), gets a small
// expand button at its top right corner. It opens the cell's editor in its
// popup (core/editor.ts): the whole text, wrapped, to read and edit.
import type { CellEditor, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";

export class CellPopup implements Feature {
  private readonly button: HTMLButtonElement;
  // The cell the button is for
  private target: { readonly widget: HTMLElement; readonly info: WidgetInfo; readonly cell: HTMLTableCellElement } | undefined;

  constructor(private readonly host: TableHost) {
    this.button = host.floating("button", "tp-expand");
    this.button.type = "button";
    this.button.tabIndex = -1;
    this.button.title = "Show the whole text (F2 while editing)";
    this.button.setAttribute("aria-label", "Show the whole text");
    this.button.innerHTML = ICONS.expand;
  }

  start(): void {
    this.button.addEventListener("click", () => this.open());
  }

  stop(): void {
    this.button.remove();
  }

  owns(node: Node): boolean {
    return this.button.contains(node);
  }

  cellHovered(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    const editing = this.host.editing;
    if (editing) {
      this.showFor(editing);
      return;
    }
    this.target = cell.classList.contains("tp-cut") ? { widget, info, cell } : undefined;
    this.place();
  }

  hoverEnded(): void {
    const editing = this.host.editing;
    if (editing) this.showFor(editing);
    else this.hide();
  }

  editorOpened(editor: CellEditor): void {
    this.showFor(editor);
    // Typed past the field's end: the button shows
    editor.field.addEventListener("input", () => {
      if (this.host.editing === editor) this.showFor(editor);
    });
  }

  editorClosed(): void {
    this.hide();
  }

  layoutChanged(): void {
    this.place();
  }

  /** While a cell is edited in it: when its text does not fit, or the cell's did not */
  private showFor(editor: CellEditor): void {
    const info = this.host.infoOf(editor.widget);
    const field = editor.field;
    const overflows = field.scrollWidth > field.clientWidth + 1 || editor.cell.classList.contains("tp-cut");
    this.target = !editor.popup && info && overflows ? { widget: editor.widget, info, cell: editor.cell } : undefined;
    this.place();
  }

  private place(): void {
    const target = this.target;
    if (!target || !target.cell.isConnected) {
      this.hide();
      return;
    }
    const rect = target.cell.getBoundingClientRect();
    this.host.place(this.button, rect.right - this.button.offsetWidth - 2, rect.top + 2);
  }

  private hide(): void {
    this.target = undefined;
    this.button.classList.remove("tp-visible");
  }

  private open(): void {
    const target = this.target;
    if (!target) return;
    this.hide();
    if (this.host.editing) {
      this.host.editInPopup();
      return;
    }
    const ref = this.host.cellRef(target.info, target.cell);
    if (ref) this.host.editCell(target.info, ref, undefined, true);
  }
}
