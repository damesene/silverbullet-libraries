// The cell's popup: a cell whose text does not fit (cut by the cells settings:
// wrapped up to the maximum height, or cut with an ellipsis), or a cell being
// edited whose text does not fit its field (a long formula), gets a small
// expand button at its top right corner. It opens the cell's editor in its
// popup (core/editor.ts): the whole text, wrapped, to read and edit.
import type { AdapterFeature, RenderedEditor, TableHost, WidgetInfo } from "../../feature.ts";
import { ICONS } from "../../../icons.ts";

export class CellPopup implements AdapterFeature {
  private readonly button: HTMLButtonElement;
  // The cell the button is for
  private target: { readonly widget: HTMLElement; readonly info: WidgetInfo; readonly cell: HTMLTableCellElement } | undefined;

  constructor(private readonly host: TableHost) {
    this.button = host.floating("button", "swt-expand");
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

  cellHovered(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    const editing = this.host.editing;
    if (editing) {
      this.showFor(editing);
      return;
    }
    this.target = cell.classList.contains("swt-cut") ? { widget, info, cell } : undefined;
    this.place();
  }

  hoverEnded(): void {
    const editing = this.host.editing;
    if (editing) this.showFor(editing);
    else this.hide();
  }

  editorOpened(editor: RenderedEditor): void {
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
  private showFor(editor: RenderedEditor): void {
    const info = this.host.infoOf(editor.widget);
    const field = editor.field;
    const overflows = field.scrollWidth > field.clientWidth + 1 || editor.cell.classList.contains("swt-cut");
    this.target = !editor.popup && info && overflows ? { widget: editor.widget, info, cell: editor.cell } : undefined;
    this.place();
  }

  /**
   * At the top right corner of the part of the cell in view: the table's box
   * may be scrolled sideways, the page up or down, and a body cell may be
   * partly under what is held over the body (the header, pinned rows and
   * columns: `shownPart`). Where too little of it shows,
   * the button waits (hidden) for the cell to come into view.
   */
  private place(): void {
    const target = this.target;
    if (!target || !target.cell.isConnected) {
      this.hide();
      return;
    }
    const { widget, info, cell } = target;
    const rect = cell.getBoundingClientRect();
    const part = this.host.shownPart(widget, info, cell);
    // Shown before it is measured: hidden, it has no size (it would sit its width too far right)
    this.button.classList.add("swt-visible");
    const size = Math.max(this.button.offsetWidth, this.button.offsetHeight);
    // Not laid out (in tests): no size to compare, the cell's box
    if (rect.width > 0 && (!part || part.right - part.left < size + 4 || part.bottom - part.top < size + 4)) {
      this.button.classList.remove("swt-visible");
      return;
    }
    const { right, top } = part ?? rect;
    this.host.place(this.button, right - this.button.offsetWidth - 2, top + 2);
  }

  private hide(): void {
    this.target = undefined;
    this.button.classList.remove("swt-visible");
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
