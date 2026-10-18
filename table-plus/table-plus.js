// table-plus/src/bridge.ts
var REQUIRED = [
  "getText",
  "replaceRange",
  "moveCursor",
  "getCurrentPage",
  "flash"
];
function missingBridgeFunctions(bridge) {
  return REQUIRED.filter((name) => typeof bridge?.[name] !== "function");
}

// table-plus/src/dom.ts
var WIDGET_SELECTOR = ".sb-table-widget";
var EDITOR_SELECTOR = ".cm-content";
var NATIVE_ACTION_SELECTOR = "a[data-ref], [data-mention-name], button[data-onclick], span.sb-task-state";
var INTERACTIVE_SELECTOR = "a, button, input, select, textarea, label";
var UI_CLASS = "tp-ui";
function renderedTable(widget) {
  return widget.querySelector("table");
}
function positionHint(table) {
  const element = table.dataset.pos !== void 0 ? table : table.querySelector("[data-pos]");
  const pos = element instanceof HTMLElement ? Number(element.dataset.pos) : NaN;
  return Number.isFinite(pos) ? pos : void 0;
}
function cellText(cell) {
  let text = "";
  for (const node of Array.from(cell.childNodes)) {
    if (node instanceof Element && node.classList.contains(UI_CLASS)) continue;
    text += node.textContent ?? "";
  }
  return text.replace(/\s+/g, " ").trim();
}
function caretTextOffset(cell, x, y) {
  const doc = cell.ownerDocument;
  let node;
  let offset = 0;
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    node = position?.offsetNode;
    offset = position?.offset ?? 0;
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    node = range?.startContainer;
    offset = range?.startOffset ?? 0;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !cell.contains(node)) return void 0;
  let before = "";
  const walker = doc.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.parentElement?.closest(`.${UI_CLASS}`)) continue;
    if (text === node) {
      before += (text.textContent ?? "").slice(0, offset);
      break;
    }
    before += text.textContent ?? "";
  }
  return before.replace(/\s+/g, " ").trimStart().length;
}

// table-plus/src/markdown.ts
var DELIMITER_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
var FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
function splitRow(line) {
  return cellRanges(line).map((r) => line.slice(r.from, r.to));
}
function cellRanges(line) {
  let start = 0;
  let end = line.length;
  while (start < end && /\s/.test(line[start])) start++;
  while (end > start && /\s/.test(line[end - 1])) end--;
  if (line[start] === "|") start++;
  if (end > start && line[end - 1] === "|" && !isEscaped(line, end - 1)) end--;
  const ranges = [];
  const push = (from, to) => {
    while (from < to && /\s/.test(line[from])) from++;
    while (to > from && /\s/.test(line[to - 1])) to--;
    ranges.push({ from, to });
  };
  let cellStart = start;
  for (let i = start; i < end; i++) {
    if (line[i] === "\\" && i + 1 < end) {
      i++;
      continue;
    }
    if (line[i] === "|") {
      push(cellStart, i);
      cellStart = i + 1;
    }
  }
  push(cellStart, end);
  return ranges;
}
function cellSourceOffset(tableText, row, column, within = 0) {
  const lines = tableText.split("\n");
  const index = Math.min(row === 0 ? 0 : row + 1, lines.length - 1);
  let offset = 0;
  for (let i = 0; i < index; i++) offset += lines[i].length + 1;
  const line = (lines[index] ?? "").replace(/\r$/, "");
  const range = cellRanges(line)[column];
  if (!range) return offset + line.length;
  return offset + range.from + Math.max(0, Math.min(within, range.to - range.from));
}
function isEscaped(s, index) {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && s[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}
function hasUnescapedPipe(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") {
      i++;
      continue;
    }
    if (line[i] === "|") return true;
  }
  return false;
}
function isDelimiterRow(line) {
  return DELIMITER_RE.test(line);
}
function alignOf(delimiterCell) {
  const left = delimiterCell.startsWith(":");
  const right = delimiterCell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}
function linesOf(text) {
  const lines = [];
  let from = 0;
  while (from <= text.length) {
    const end = text.indexOf("\n", from);
    const to = end === -1 ? text.length : end;
    const raw = text.slice(from, to);
    const lineText = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    lines.push({ text: lineText, from, to: from + lineText.length });
    if (end === -1) break;
    from = end + 1;
  }
  return lines;
}
function findTables(text) {
  const lines = linesOf(text);
  const tables = [];
  let fence;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text;
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = void 0;
      }
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }
    const next = lines[i + 1];
    if (!next || !hasUnescapedPipe(line) || !isDelimiterRow(next.text)) continue;
    if (splitRow(line).length !== splitRow(next.text).length) continue;
    let last = i + 1;
    while (last + 1 < lines.length) {
      const candidate = lines[last + 1].text;
      if (candidate.trim() === "" || !hasUnescapedPipe(candidate)) break;
      last++;
    }
    const from = lines[i].from;
    const to = lines[last].to;
    tables.push({ from, to, text: text.slice(from, to), ordinal: tables.length });
    i = last;
  }
  return tables;
}
function parseTable(text) {
  const lines = text.split(/\r?\n/);
  const header = lines[0] ?? "";
  const delimiter = lines[1] ?? "";
  const align = splitRow(delimiter).map(alignOf);
  const rows = [header, ...lines.slice(2)].map((line) => {
    const cells = splitRow(line);
    while (cells.length < align.length) cells.push("");
    return { cells, source: line, sourceCells: cells };
  });
  const widths = lines.map((l) => charLength(l));
  const padded2 = lines.length > 2 && widths.every((w) => w === widths[0]) && lines.some((l) => /\S {2,}\|/.test(l));
  return {
    indent: /^\s*/.exec(header)[0],
    align,
    rows,
    padded: padded2,
    delimiterSource: delimiter,
    alignSource: align
  };
}
function charLength(s) {
  return Array.from(s).length;
}
var DELIMITER_CELL = {
  "": "---",
  left: ":---",
  center: ":---:",
  right: "---:"
};
function sameCells(a, b) {
  return !!b && a.length === b.length && a.every((cell, i) => cell === b[i]);
}
function serializeTable(table) {
  const columns = table.align.length;
  const widths = [];
  for (const row of table.rows) {
    row.cells.forEach((cell, c) => {
      widths[c] = Math.max(widths[c] ?? 3, charLength(cell));
    });
  }
  const pad = (cell, c) => {
    const gap = (widths[c] ?? 3) - charLength(cell);
    const align = table.align[c] ?? "";
    const left = align === "right" ? gap : align === "center" ? Math.floor(gap / 2) : 0;
    return " ".repeat(left) + cell + " ".repeat(gap - left);
  };
  const cellText2 = (cell, c) => table.padded ? ` ${pad(cell, c)} ` : cell === "" ? " " : ` ${cell} `;
  const rowText = (row) => !table.padded && row.source !== void 0 && sameCells(row.cells, row.sourceCells) ? row.source : `${table.indent}|${row.cells.map(cellText2).join("|")}|`;
  const delimiterCell = (align, c) => {
    if (!table.padded) return DELIMITER_CELL[align];
    const dashes = "-".repeat(
      Math.max(1, (widths[c] ?? 3) - (align === "center" ? 2 : align ? 1 : 0))
    );
    const left = align === "center" || align === "left" ? ":" : "";
    const right = align === "center" || align === "right" ? ":" : "";
    return ` ${left}${dashes}${right} `;
  };
  const delimiterText = !table.padded && table.delimiterSource !== void 0 && sameCells(table.align, table.alignSource) ? table.delimiterSource : `${table.indent}|${table.align.slice(0, columns).map(delimiterCell).join("|")}|`;
  const [header, ...body] = table.rows;
  return [header ? rowText(header) : "", delimiterText, ...body.map(rowText)].join("\n");
}
function escapeCell(value) {
  return value.replace(/\r?\n/g, " ").trim().replace(
    /(\\*)\|/g,
    (match, backslashes) => backslashes.length % 2 === 1 ? match : `${backslashes}\\|`
  );
}
function unescapeCell(cell) {
  return cell.replace(/\\\|/g, "|");
}
function plainText(markdown) {
  return markdown.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~=\\]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function shapeOf(range) {
  const table = parseTable(range.text);
  return {
    rows: table.rows.length,
    columns: table.align.length,
    headers: (table.rows[0]?.cells ?? []).map(plainText)
  };
}
function distance(range, hint) {
  if (hint >= range.from && hint <= range.to) return 0;
  return Math.min(Math.abs(hint - range.from), Math.abs(hint - range.to));
}
function nearest(ranges, hint) {
  let best;
  for (const range of ranges) {
    if (!best || distance(range, hint) < distance(best, hint)) best = range;
  }
  return best;
}
function locateByShape(text, hint, shape) {
  const candidates = findTables(text).filter((range) => {
    const s = shapeOf(range);
    return s.rows === shape.rows && s.columns === shape.columns;
  });
  const headers = shape.headers?.map((h) => h.replace(/\s+/g, " ").trim().toLowerCase());
  const sameHeaders = headers ? candidates.filter((range) => {
    const s = shapeOf(range);
    return s.headers.every((h, i) => h === headers[i]);
  }) : [];
  return nearest(sameHeaders.length ? sameHeaders : candidates, hint);
}
function locateBySource(text, hint, source) {
  return nearest(
    findTables(text).filter((range) => range.text === source),
    hint
  );
}
function minimalEdit(before, after) {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end++;
  }
  return {
    from: start,
    to: before.length - end,
    insert: after.slice(start, after.length - end)
  };
}

// table-plus/src/ops.ts
function withRows(table, rows) {
  return { ...table, rows };
}
function emptyRow(columns) {
  return { cells: Array.from({ length: columns }, () => "") };
}
function withCells(row, cells) {
  return { ...row, cells };
}
function padded(cells, length) {
  const result = [...cells];
  while (result.length < length) result.push("");
  return result;
}
function moved(items, from, to) {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
function setCell(table, row, column, value) {
  return withRows(
    table,
    table.rows.map((r, i) => {
      if (i !== row) return r;
      const cells = padded(r.cells, column + 1);
      cells[column] = value;
      return withCells(r, cells);
    })
  );
}
function insertRow(table, at) {
  const rows = [...table.rows];
  rows.splice(Math.max(1, Math.min(at, rows.length)), 0, emptyRow(table.align.length));
  return withRows(table, rows);
}
function deleteRow(table, row) {
  if (row < 1 || row >= table.rows.length) return table;
  return withRows(
    table,
    table.rows.filter((_, i) => i !== row)
  );
}
function moveRow(table, from, to) {
  const last = table.rows.length - 1;
  if (from < 1 || from > last || to < 1 || to > last || from === to) return table;
  return withRows(table, moved(table.rows, from, to));
}
function insertColumn(table, at) {
  const column = Math.max(0, Math.min(at, table.align.length));
  const align = [...table.align];
  align.splice(column, 0, "");
  return {
    ...table,
    align,
    rows: table.rows.map((r) => {
      const cells = padded(r.cells, column);
      cells.splice(column, 0, "");
      return withCells(r, cells);
    })
  };
}
function deleteColumn(table, column) {
  if (table.align.length <= 1 || column < 0 || column >= table.align.length) return table;
  return {
    ...table,
    align: table.align.filter((_, i) => i !== column),
    rows: table.rows.map(
      (r) => withCells(
        r,
        r.cells.filter((_, i) => i !== column)
      )
    )
  };
}
function moveColumn(table, from, to) {
  const columns = table.align.length;
  if (from < 0 || from >= columns || to < 0 || to >= columns || from === to) return table;
  return {
    ...table,
    align: moved(table.align, from, to),
    rows: table.rows.map((r) => withCells(r, moved(padded(r.cells, columns), from, to)))
  };
}
function setAlign(table, column, align) {
  return {
    ...table,
    align: table.align.map((a, i) => i === column ? align : a)
  };
}
function columnAfterMove(c, from, to) {
  if (c === from) return to;
  if (from < to && c > from && c <= to) return c - 1;
  if (from > to && c >= to && c < from) return c + 1;
  return c;
}

// table-plus/src/view.ts
var DEFAULT_VIEW = { filters: [], showFilters: false };
function isRearranged(view) {
  return !!view.sort || view.filters.some((f) => f.trim() !== "");
}
function cycleSort(view, column) {
  if (view.sort?.column !== column) return { ...view, sort: { column, direction: "asc" } };
  if (view.sort.direction === "asc") return { ...view, sort: { column, direction: "desc" } };
  return withoutSort(view);
}
function withSort(view, column, direction) {
  return { ...view, sort: { column, direction } };
}
function withoutSort(view) {
  const { sort: _sort, ...rest } = view;
  return rest;
}
function withFilter(view, column, value) {
  const filters = [...view.filters];
  while (filters.length <= column) filters.push("");
  filters[column] = value;
  return { ...view, filters };
}
function resetView(view) {
  return { filters: [], showFilters: view.showFilters };
}
function remapColumns(view, map) {
  const filters = [];
  view.filters.forEach((value, column) => {
    const target = map(column);
    if (target === void 0 || value === "") return;
    while (filters.length <= target) filters.push("");
    filters[target] = value;
  });
  const sortColumn = view.sort ? map(view.sort.column) : void 0;
  const result = { filters, showFilters: view.showFilters };
  return view.sort && sortColumn !== void 0 ? { ...result, sort: { column: sortColumn, direction: view.sort.direction } } : result;
}
function normalizeForFilter(s) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
var NUMBER_RE = /^[-+]?(\d{1,3}([  ]\d{3})+|\d+)([.,]\d+)?\s*%?$/;
function asNumber(s) {
  const t = s.trim();
  if (!NUMBER_RE.test(t)) return void 0;
  return Number(t.replace(/[  %]/g, "").replace(",", "."));
}
var collator = new Intl.Collator(void 0, { numeric: true, sensitivity: "base" });
function compareValues(a, b) {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== void 0 && nb !== void 0) return na - nb;
  return collator.compare(a.trim(), b.trim());
}
function visibleRows(values, view) {
  const filters = view.filters.map((f) => normalizeForFilter(f.trim()));
  const indexes = values.map((_, i) => i).filter(
    (i) => filters.every(
      (filter, column) => filter === "" || normalizeForFilter(values[i][column] ?? "").includes(filter)
    )
  );
  const sort = view.sort;
  if (!sort) return indexes;
  const sign = sort.direction === "asc" ? 1 : -1;
  return indexes.sort((a, b) => {
    const va = values[a][sort.column] ?? "";
    const vb = values[b][sort.column] ?? "";
    const ea = va.trim() === "";
    const eb = vb.trim() === "";
    if (ea !== eb) return ea ? 1 : -1;
    return sign * compareValues(va, vb) || a - b;
  });
}

// table-plus/src/controller.ts
var STOPPED_EVENTS = [
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "paste",
  "cut",
  "copy",
  "compositionstart",
  "compositionupdate",
  "compositionend"
];
var SORT_GLYPH = { asc: "\u25B2", desc: "\u25BC", none: "\u21C5" };
var MENU_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
var GRIP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
var NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";
var Controller = class {
  constructor(doc, bridge) {
    this.doc = doc;
    this.bridge = bridge;
    this.bar = this.floating("div", "tp-bar");
    this.cellHandle = this.floatingButton("tp-handle", "Row and column actions", MENU_ICON);
    this.rowGrip = this.floatingButton("tp-handle tp-grip", "Drag to move the row", GRIP_ICON);
    this.columnGrip = this.floatingButton(
      "tp-handle tp-grip tp-grip-column",
      "Drag to move the column",
      GRIP_ICON
    );
  }
  doc;
  bridge;
  infos = /* @__PURE__ */ new WeakMap();
  enhancing = /* @__PURE__ */ new WeakSet();
  views = /* @__PURE__ */ new Map();
  editor;
  pendingFocus;
  hoverWidget;
  hoverCell;
  menu;
  dragging = false;
  hideTimer;
  scanQueued = false;
  warnedIncompatible = false;
  observer;
  bar;
  cellHandle;
  rowGrip;
  columnGrip;
  setBridge(bridge) {
    this.bridge = bridge;
  }
  start() {
    const win = this.doc.defaultView;
    win.addEventListener("mousedown", this.onMouseDown, true);
    win.addEventListener("click", this.onClick, true);
    win.addEventListener("dblclick", this.onDoubleClick, true);
    win.addEventListener("scroll", this.onScroll, true);
    win.addEventListener("keydown", this.onKeyDown, true);
    this.doc.addEventListener("mousemove", this.onMouseMove, { passive: true });
    this.cellHandle.addEventListener("click", this.onCellHandleClick);
    this.rowGrip.addEventListener("pointerdown", (e) => this.startDrag(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.startDrag(e, "column"));
    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    this.scan();
  }
  // ---- discovering rendered tables --------------------------------------
  queueScan() {
    if (this.scanQueued) return;
    this.scanQueued = true;
    const run = () => {
      this.scanQueued = false;
      this.scan();
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }
  /** Enhances every rendered table that is not enhanced yet */
  scan() {
    const pending = [];
    for (const widget of Array.from(this.doc.querySelectorAll(WIDGET_SELECTOR))) {
      const table = renderedTable(widget);
      if (!table || table.rows.length === 0) continue;
      if (this.infos.get(widget)?.table === table || widget.dataset.tpUnsupported) continue;
      pending.push(this.enhance(widget, table));
    }
    return Promise.all(pending).then(() => void 0);
  }
  async enhance(widget, table) {
    if (this.enhancing.has(widget)) return;
    this.enhancing.add(widget);
    try {
      const hint = positionHint(table);
      if (hint === void 0) {
        this.markUnsupported(widget, true);
        return;
      }
      const header = table.rows[0];
      const shape = {
        rows: table.rows.length,
        columns: header.cells.length,
        headers: Array.from(header.cells).map(cellText)
      };
      const text = await this.bridge.getText();
      if (renderedTable(widget) !== table) return;
      const range = locateByShape(text, hint, shape);
      if (!range) {
        this.markUnsupported(widget, false);
        return;
      }
      const page = await this.bridge.getCurrentPage();
      const info = {
        table,
        source: range.text,
        hint: range.from,
        key: `${page}#${range.ordinal}`,
        columns: shape.columns
      };
      this.infos.set(widget, info);
      this.decorate(widget, info);
      this.applyView(widget, info);
      this.takePendingFocus(widget, info);
    } catch (e) {
      console.error("Table Plus: could not enhance a table", e);
    } finally {
      this.enhancing.delete(widget);
    }
  }
  markUnsupported(widget, incompatible) {
    widget.dataset.tpUnsupported = "true";
    if (!incompatible || this.warnedIncompatible) return;
    this.warnedIncompatible = true;
    const message = "Table Plus is inactive: this SilverBullet version renders tables differently than expected";
    console.warn(message);
    void this.bridge.flash(message, "error");
  }
  decorate(widget, info) {
    widget.classList.add("tp-table");
    const rows = Array.from(info.table.rows);
    rows.slice(1).forEach((tr, i) => {
      tr.dataset.tpRow = String(i + 1);
    });
    Array.from(rows[0].cells).forEach((cell, column) => {
      const button = this.doc.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.className = `${UI_CLASS} tp-sort`;
      button.dataset.tpAction = "sort";
      button.dataset.tpColumn = String(column);
      cell.append(button);
    });
  }
  // ---- view: sort and filter --------------------------------------------
  viewOf(info) {
    return this.views.get(info.key) ?? DEFAULT_VIEW;
  }
  setView(widget, info, view) {
    this.views.set(info.key, view);
    this.applyView(widget, info);
  }
  bodyRows(info) {
    return Array.from(info.table.querySelectorAll("tr[data-tp-row]")).sort(
      (a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow)
    );
  }
  applyView(widget, info) {
    const view = this.viewOf(info);
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellText));
    const order = visibleRows(values, view);
    const shown = new Set(order);
    const parent = rows[0]?.parentElement;
    if (parent) {
      for (const i of order) parent.append(rows[i]);
      rows.forEach((tr, i) => {
        tr.classList.toggle("tp-hidden", !shown.has(i));
        if (!shown.has(i)) parent.append(tr);
      });
    }
    const header = info.table.rows[0];
    Array.from(header.cells).forEach((cell, column) => {
      const direction = view.sort?.column === column ? view.sort.direction : void 0;
      const button = cell.querySelector(".tp-sort");
      if (button) {
        button.textContent = SORT_GLYPH[direction ?? "none"];
        button.classList.toggle("tp-active", !!direction);
        button.title = direction === "asc" ? "Sorted ascending" : direction === "desc" ? "Sorted descending" : "Sort";
      }
      if (direction) cell.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
      else cell.removeAttribute("aria-sort");
    });
    this.applyFilterRow(widget, info, view);
    widget.classList.toggle("tp-rearranged", isRearranged(view));
    if (this.hoverWidget === widget) this.renderBar(widget, info);
  }
  applyFilterRow(widget, info, view) {
    let row = info.table.querySelector("tr.tp-filter-row");
    if (!view.showFilters) {
      row?.remove();
      return;
    }
    if (!row) {
      row = this.doc.createElement("tr");
      row.className = `${UI_CLASS} tp-filter-row`;
      for (let column = 0; column < info.columns; column++) {
        const cell = this.doc.createElement("td");
        const input = this.doc.createElement("input");
        input.type = "search";
        input.className = "tp-filter";
        input.placeholder = "Filter";
        input.dataset.tpColumn = String(column);
        this.isolate(input);
        input.addEventListener("input", () => {
          const current = this.infos.get(widget);
          if (current) this.setView(widget, current, withFilter(this.viewOf(current), column, input.value));
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            input.blur();
          }
        });
        cell.append(input);
        row.append(cell);
      }
      info.table.rows[0].after(row);
    }
    for (const input of Array.from(row.querySelectorAll("input"))) {
      const value = view.filters[Number(input.dataset.tpColumn)] ?? "";
      if (input.value !== value && this.doc.activeElement !== input) input.value = value;
    }
  }
  // ---- event routing -----------------------------------------------------
  // Keyboard and input events from Table Plus' own fields must not reach the editor
  isolate(element) {
    for (const type of STOPPED_EVENTS) element.addEventListener(type, (e) => e.stopPropagation());
  }
  enhancedWidgetOf(target) {
    if (!(target instanceof Element)) return void 0;
    const widget = target.closest(WIDGET_SELECTOR);
    const info = widget && this.infos.get(widget);
    return widget && info && renderedTable(widget) === info.table ? [widget, info] : void 0;
  }
  onMouseDown = (e) => {
    if (this.menu && !(e.target instanceof Node && this.menu.contains(e.target))) this.closeMenu();
    if (e.button !== 0) return;
    if (e.altKey) {
      this.onAltMouseDown(e);
      return;
    }
    const hit = this.enhancedWidgetOf(e.target);
    if (!hit) return;
    const [widget, info] = hit;
    const target = e.target;
    if (target.closest(NATIVE_ACTION_SELECTOR)) return;
    e.stopPropagation();
    if (target.closest("[data-tp-action]")) {
      e.preventDefault();
      return;
    }
    if (target.closest(".tp-cell-editor, .tp-filter-row") || target.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    e.preventDefault();
    const cell = target.closest("td, th");
    if (!cell || cell.closest("table") !== info.table || cell.parentElement?.classList.contains("tp-filter-row")) {
      return;
    }
    if (this.editor?.cell === cell) return;
    this.closeMenu();
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    if (this.editor) void this.finishEditing(true, { widget, ...ref });
    else this.openEditor(widget, info, cell);
  };
  /**
   * Alt+click shows the markdown, as in SilverBullet, but with the cursor in
   * the clicked cell instead of at the start of the table
   */
  onAltMouseDown(e) {
    const hit = this.enhancedWidgetOf(e.target);
    const cell = hit && this.tableCellOf(hit[1], e.target);
    if (!hit || !cell) return;
    e.preventDefault();
    e.stopPropagation();
    const info = hit[1];
    if (this.editor) {
      void this.finishEditing(true, void 0, false);
      return;
    }
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    const source = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";
    const within = cellText(cell) === source ? caretTextOffset(cell, e.clientX, e.clientY) : void 0;
    void this.showMarkdown(info, { ...ref, within: within ?? 0 });
  }
  tableCellOf(info, target) {
    if (!(target instanceof Element)) return void 0;
    const cell = target.closest("td, th");
    if (!cell || cell.closest("table") !== info.table) return void 0;
    return cell.parentElement?.classList.contains("tp-filter-row") ? void 0 : cell;
  }
  onClick = (e) => {
    if (e.altKey) {
      const hit2 = this.enhancedWidgetOf(e.target);
      if (hit2 && this.tableCellOf(hit2[1], e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const hit = this.enhancedWidgetOf(e.target);
    if (!hit) return;
    const [widget, info] = hit;
    const target = e.target;
    if (target.closest(NATIVE_ACTION_SELECTOR)) return;
    e.stopPropagation();
    const action = target.closest("[data-tp-action]");
    if (action?.dataset.tpAction === "sort") {
      e.preventDefault();
      this.setView(widget, info, cycleSort(this.viewOf(info), Number(action.dataset.tpColumn)));
    }
  };
  onDoubleClick = (e) => {
    if (e.altKey) return;
    const hit = this.enhancedWidgetOf(e.target);
    if (hit && !e.target.closest(NATIVE_ACTION_SELECTOR)) e.stopPropagation();
  };
  onScroll = () => {
    if (this.dragging) return;
    this.closeMenu();
    this.hideFloating();
  };
  onKeyDown = (e) => {
    if (e.key === "Escape" && this.menu) {
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu();
    }
  };
  onMouseMove = (e) => {
    if (this.dragging || this.menu) return;
    const target = e.target;
    if (target instanceof Node && this.isFloating(target)) {
      this.cancelHide();
      return;
    }
    const hit = this.enhancedWidgetOf(target);
    if (!hit) {
      this.scheduleHide();
      return;
    }
    const [widget, info] = hit;
    this.cancelHide();
    if (this.hoverWidget !== widget) {
      this.hoverWidget = widget;
      this.renderBar(widget, info);
    }
    const cell = target.closest("td, th");
    if (!cell || this.editor || cell.closest("table") !== info.table || cell.parentElement?.classList.contains("tp-filter-row")) {
      this.hideHandles();
      return;
    }
    if (cell !== this.hoverCell) this.showHandles(info, cell);
  };
  // ---- cell editing ------------------------------------------------------
  cellRef(info, cell) {
    const tr = cell.parentElement;
    if (!tr) return void 0;
    const row = tr === info.table.rows[0] ? 0 : Number(tr.dataset.tpRow);
    return Number.isInteger(row) ? { row, column: cell.cellIndex } : void 0;
  }
  cellAt(info, ref) {
    const tr = ref.row === 0 ? info.table.rows[0] : info.table.querySelector(`tr[data-tp-row="${ref.row}"]`);
    if (!tr || tr.classList.contains("tp-hidden")) return void 0;
    return tr.cells[ref.column];
  }
  openEditor(widget, info, cell) {
    const ref = this.cellRef(info, cell);
    if (!ref || this.editor) return;
    const original = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";
    const textarea = this.doc.createElement("textarea");
    textarea.className = `${UI_CLASS} tp-cell-editor`;
    textarea.rows = 1;
    textarea.value = unescapeCell(original);
    const kept = this.doc.createDocumentFragment();
    while (cell.firstChild) kept.append(cell.firstChild);
    cell.classList.add("tp-editing");
    cell.append(textarea);
    this.editor = { widget, cell, ...ref, original, textarea, kept };
    this.hideHandles();
    const fit = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    this.isolate(textarea);
    textarea.addEventListener("input", fit);
    textarea.addEventListener("blur", () => {
      if (this.editor?.textarea === textarea) void this.finishEditing(true, void 0, false);
    });
    textarea.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        void this.finishEditing(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.finishEditing(true);
      } else if (e.key === "Tab") {
        e.preventDefault();
        void this.step(e.shiftKey ? -1 : 1);
      }
    });
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fit();
  }
  /** Puts the rendered cell back; returns what was being edited */
  closeEditor() {
    const active = this.editor;
    if (!active) return void 0;
    this.editor = void 0;
    const value = escapeCell(active.textarea.value);
    active.textarea.remove();
    active.cell.classList.remove("tp-editing");
    active.cell.append(active.kept);
    return { ...active, value };
  }
  /**
   * Ends editing, saving the cell if asked and changed, then opens `next`
   * (a cell of the same or another table) or hands the keyboard back to the editor.
   */
  async finishEditing(save, next, refocus = true) {
    const closed = this.closeEditor();
    if (!closed) return;
    const changed = save && closed.value !== closed.original;
    const sameTable = next?.widget === closed.widget;
    let result = "unchanged";
    if (changed) {
      result = await this.write(
        closed.widget,
        (t) => this.withCellEdit(t, closed),
        sameTable ? next : void 0
      );
    }
    if (next && (result === "unchanged" || !sameTable)) {
      const info = this.infos.get(next.widget);
      const cell = info && this.cellAt(info, next);
      if (info && cell) this.openEditor(next.widget, info, cell);
      return;
    }
    if (!next && refocus) this.focusEditor(closed.widget);
  }
  withCellEdit(table, edit) {
    if ((table.rows[edit.row]?.cells[edit.column] ?? "") !== edit.original) return void 0;
    return setCell(table, edit.row, edit.column, edit.value);
  }
  /** Tab / Shift+Tab: save and move to the next / previous shown cell */
  async step(direction) {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const shown = [
      info.table.rows[0],
      ...Array.from(info.table.querySelectorAll("tr[data-tp-row]:not(.tp-hidden)"))
    ];
    const rowIndex = shown.indexOf(active.cell.parentElement);
    let r = rowIndex;
    let column = active.column + direction;
    if (column >= info.columns) {
      column = 0;
      r++;
    } else if (column < 0) {
      column = info.columns - 1;
      r--;
    }
    if (r < 0) {
      await this.finishEditing(true);
      return;
    }
    const target = shown[r];
    if (target) {
      const ref = this.cellRef(info, target.cells[column] ?? target.cells[0]);
      if (ref) await this.finishEditing(true, { widget: active.widget, ...ref });
      return;
    }
    const closed = this.closeEditor();
    const rowsBefore = parseTable(info.source).rows.length;
    await this.write(
      closed.widget,
      (t) => {
        const edited = closed.value !== closed.original ? this.withCellEdit(t, closed) : t;
        return edited && insertRow(edited, edited.rows.length);
      },
      { row: rowsBefore, column: 0 }
    );
  }
  takePendingFocus(widget, info) {
    const pending = this.pendingFocus;
    if (!pending || pending.key !== info.key) return;
    this.pendingFocus = void 0;
    if (Date.now() > pending.until || this.editor) return;
    const cell = this.cellAt(info, pending);
    if (cell) this.openEditor(widget, info, cell);
  }
  focusEditor(widget) {
    widget.closest(EDITOR_SELECTOR)?.focus({ preventScroll: true });
  }
  // ---- writing markdown --------------------------------------------------
  /**
   * Re-reads the table from the page, applies `change` and writes the result
   * back as one edit. `change` returns undefined to abort.
   */
  async write(widget, change, focus, columnMap) {
    const info = this.infos.get(widget);
    if (!info) return "failed";
    try {
      const text = await this.bridge.getText();
      const range = locateBySource(text, info.hint, info.source);
      const changed = range && change(parseTable(range.text));
      if (!range || !changed) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      const markdown = serializeTable(changed);
      if (markdown === range.text) return "unchanged";
      if (columnMap) this.views.set(info.key, remapColumns(this.viewOf(info), columnMap));
      if (focus) this.pendingFocus = { key: info.key, ...focus, until: Date.now() + 3e3 };
      const edit = minimalEdit(range.text, markdown);
      await this.bridge.replaceRange(range.from + edit.from, range.from + edit.to, edit.insert);
      return "written";
    } catch (e) {
      this.pendingFocus = void 0;
      console.error("Table Plus: could not save the table", e);
      void this.bridge.flash(`Table Plus: could not save the table (${String(e)})`, "error");
      return "failed";
    }
  }
  /** Shows the table's markdown by moving the cursor into it: to its start, or into a cell */
  async showMarkdown(info, at) {
    const range = locateBySource(await this.bridge.getText(), info.hint, info.source);
    if (!range) {
      void this.bridge.flash(NOT_SAVED.replace(", nothing was saved", ""), "error");
      return;
    }
    this.hideFloating();
    this.closeMenu();
    const offset = at ? cellSourceOffset(range.text, at.row, at.column, at.within) : 0;
    await this.bridge.moveCursor(range.from + offset);
  }
  // ---- floating UI: toolbar, handles, menu, drag -------------------------
  floating(tag, className) {
    const element = this.doc.createElement(tag);
    element.className = `tp-floating ${className}`;
    element.addEventListener("mousedown", (e) => {
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    });
    this.doc.body.append(element);
    return element;
  }
  floatingButton(className, title, icon) {
    const button = this.floating("button", className);
    button.type = "button";
    button.tabIndex = -1;
    button.title = title;
    button.innerHTML = icon;
    return button;
  }
  isFloating(node) {
    return [this.bar, this.cellHandle, this.rowGrip, this.columnGrip].some((el) => el.contains(node)) || !!this.menu?.contains(node);
  }
  place(element, left, top) {
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.classList.add("tp-visible");
  }
  cancelHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = void 0;
  }
  scheduleHide() {
    if (!this.hoverWidget || this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = void 0;
      this.hideFloating();
    }, 300);
  }
  hideHandles() {
    for (const el of [this.cellHandle, this.rowGrip, this.columnGrip]) el.classList.remove("tp-visible");
    this.hoverCell = void 0;
  }
  hideFloating() {
    this.hideHandles();
    this.bar.classList.remove("tp-visible");
    this.hoverWidget = void 0;
  }
  renderBar(widget, info) {
    const view = this.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    if (isRearranged(view)) {
      const rows = this.bodyRows(info);
      const shown = rows.filter((tr) => !tr.classList.contains("tp-hidden")).length;
      const status = this.doc.createElement("span");
      status.className = "tp-status";
      const parts = [];
      if (view.sort) {
        const name = cellText(info.table.rows[0].cells[view.sort.column]) || `column ${view.sort.column + 1}`;
        parts.push(`Sorted by ${name} ${view.sort.direction === "asc" ? "\u2191" : "\u2193"}`);
      }
      if (shown !== rows.length) parts.push(`${shown} of ${rows.length} rows`);
      status.textContent = parts.join(" \xB7 ");
      bar.append(status);
    }
    const button = (label, title, run, pressed) => {
      const b = this.doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.textContent = label;
      b.title = title;
      if (pressed !== void 0) b.setAttribute("aria-pressed", String(pressed));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        run();
      });
      bar.append(b);
    };
    button("Filter", "Show or hide the filter row", () => {
      const current = this.viewOf(info);
      this.setView(
        widget,
        info,
        current.showFilters ? { ...current, filters: [], showFilters: false } : { ...current, showFilters: true }
      );
    }, view.showFilters);
    if (isRearranged(view)) {
      button(
        "Original order",
        "Clear sorting and filters: show the rows as written",
        () => this.setView(widget, info, resetView(this.viewOf(info)))
      );
    }
    button("Edit markdown", "Show this table as markdown", () => void this.showMarkdown(info));
    const rect = widget.getBoundingClientRect();
    bar.classList.add("tp-visible");
    const height = bar.offsetHeight;
    const width = bar.offsetWidth;
    const above = rect.top - height - 14;
    this.place(bar, Math.max(4, rect.right - width), above >= 4 ? above : rect.bottom + 4);
  }
  showHandles(info, cell) {
    this.hoverCell = cell;
    const tr = cell.parentElement;
    const cellRect = cell.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    this.place(this.cellHandle, cellRect.right - 9, cellRect.top + (cellRect.height - 18) / 2);
    const rearranged = isRearranged(this.viewOf(info));
    if (tr !== info.table.rows[0] && !rearranged) {
      const rowRect = tr.getBoundingClientRect();
      this.place(this.rowGrip, tableRect.left - 20, rowRect.top + (rowRect.height - 18) / 2);
    } else {
      this.rowGrip.classList.remove("tp-visible");
    }
    const headerCell = info.table.rows[0].cells[cell.cellIndex];
    if (headerCell) {
      const h = headerCell.getBoundingClientRect();
      this.place(this.columnGrip, h.left + (h.width - 18) / 2, h.top - 9);
    }
  }
  onCellHandleClick = (e) => {
    e.preventDefault();
    const cell = this.hoverCell;
    const hit = cell && this.enhancedWidgetOf(cell);
    if (!cell || !hit) return;
    const [widget, info] = hit;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    const rect = this.cellHandle.getBoundingClientRect();
    this.openMenu(widget, info, ref, rect.right, rect.bottom + 2);
  };
  menuItems(widget, info, ref) {
    const { row, column } = ref;
    const rows = parseTable(info.source).rows.length;
    const view = this.viewOf(info);
    const rearranged = isRearranged(view);
    const header = row === 0;
    const run = (change, focus, columnMap) => () => {
      this.closeMenu();
      void this.write(widget, change, focus, columnMap);
    };
    const items = [
      { heading: "Row" },
      !header && { label: "Insert row above", run: run((t) => insertRow(t, row), { row, column }) },
      { label: "Insert row below", run: run((t) => insertRow(t, row + 1), { row: row + 1, column }) },
      !header && !rearranged && row > 1 && { label: "Move row up", run: run((t) => moveRow(t, row, row - 1)) },
      !header && !rearranged && row < rows - 1 && { label: "Move row down", run: run((t) => moveRow(t, row, row + 1)) },
      !header && { label: "Delete row", danger: true, run: run((t) => deleteRow(t, row)) },
      { heading: "Column" },
      {
        label: "Insert column left",
        run: run((t) => insertColumn(t, column), { row: 0, column }, (c) => c >= column ? c + 1 : c)
      },
      {
        label: "Insert column right",
        run: run(
          (t) => insertColumn(t, column + 1),
          { row: 0, column: column + 1 },
          (c) => c > column ? c + 1 : c
        )
      },
      column > 0 && {
        label: "Move column left",
        run: run((t) => moveColumn(t, column, column - 1), void 0, (c) => columnAfterMove(c, column, column - 1))
      },
      column < info.columns - 1 && {
        label: "Move column right",
        run: run((t) => moveColumn(t, column, column + 1), void 0, (c) => columnAfterMove(c, column, column + 1))
      },
      info.columns > 1 && {
        label: "Delete column",
        danger: true,
        run: run((t) => deleteColumn(t, column), void 0, (c) => c === column ? void 0 : c > column ? c - 1 : c)
      },
      { heading: "Sort (view only)" },
      {
        label: "Sort ascending",
        checked: view.sort?.column === column && view.sort.direction === "asc",
        run: () => {
          this.closeMenu();
          this.setView(widget, info, withSort(this.viewOf(info), column, "asc"));
        }
      },
      {
        label: "Sort descending",
        checked: view.sort?.column === column && view.sort.direction === "desc",
        run: () => {
          this.closeMenu();
          this.setView(widget, info, withSort(this.viewOf(info), column, "desc"));
        }
      },
      !!view.sort && {
        label: "Original order",
        run: () => {
          this.closeMenu();
          this.setView(widget, info, withoutSort(this.viewOf(info)));
        }
      },
      { heading: "Align column" }
    ];
    const current = parseTable(info.source).align[column] ?? "";
    const aligns = [
      ["Default", ""],
      ["Left", "left"],
      ["Center", "center"],
      ["Right", "right"]
    ];
    for (const [label, align] of aligns) {
      items.push({ label, checked: align === current, run: run((t) => setAlign(t, column, align)) });
    }
    return items.filter((item) => !!item);
  }
  openMenu(widget, info, ref, x, y) {
    this.closeMenu();
    const menu = this.floating("div", "tp-menu");
    menu.setAttribute("role", "menu");
    for (const item of this.menuItems(widget, info, ref)) {
      if ("heading" in item) {
        const heading = this.doc.createElement("div");
        heading.className = "tp-menu-heading";
        heading.textContent = item.heading;
        menu.append(heading);
        continue;
      }
      const button = this.doc.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = item.label;
      if (item.danger) button.classList.add("tp-danger");
      if (item.checked) button.classList.add("tp-checked");
      button.addEventListener("click", (e) => {
        e.preventDefault();
        item.run();
      });
      menu.append(button);
    }
    this.menu = menu;
    const win = this.doc.defaultView;
    menu.classList.add("tp-visible");
    const rect = menu.getBoundingClientRect();
    const left = Math.max(4, Math.min(x - rect.width, win.innerWidth - rect.width - 4));
    const top = y + rect.height > win.innerHeight - 4 ? Math.max(4, y - rect.height - 24) : y;
    this.place(menu, left, top);
    this.cellHandle.classList.add("tp-visible");
  }
  closeMenu() {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = void 0;
    this.hideHandles();
  }
  startDrag(e, axis) {
    const cell = this.hoverCell;
    const hit = cell && this.enhancedWidgetOf(cell);
    if (e.button !== 0 || !cell || !hit) return;
    e.preventDefault();
    const [widget, info] = hit;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    if (axis === "row" && (ref.row === 0 || isRearranged(this.viewOf(info)))) return;
    const from = axis === "row" ? ref.row : ref.column;
    const table = info.table;
    const header = table.rows[0];
    const bodyRows = this.bodyRows(info);
    const carried = axis === "row" ? [cell.parentElement] : [header, ...bodyRows].map((tr) => tr.cells[from]).filter((c) => !!c);
    carried.forEach((el) => el.classList.add("tp-dragged"));
    const line = this.floating("div", "tp-drop tp-visible");
    this.doc.body.classList.add("tp-dragging");
    this.dragging = true;
    let slot = from;
    const move = (ev) => {
      const tableRect = table.getBoundingClientRect();
      if (axis === "row") {
        slot = bodyRows.length + 1;
        for (let i = 0; i < bodyRows.length; i++) {
          const r = bodyRows[i].getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) {
            slot = i + 1;
            break;
          }
        }
        const y = slot <= bodyRows.length ? bodyRows[slot - 1].getBoundingClientRect().top : tableRect.bottom;
        Object.assign(line.style, {
          left: `${tableRect.left}px`,
          top: `${y - 1}px`,
          width: `${tableRect.width}px`,
          height: "2px"
        });
      } else {
        const cells = Array.from(header.cells);
        slot = cells.length;
        for (let i = 0; i < cells.length; i++) {
          const r = cells[i].getBoundingClientRect();
          if (ev.clientX < r.left + r.width / 2) {
            slot = i;
            break;
          }
        }
        const x = slot < cells.length ? cells[slot].getBoundingClientRect().left : tableRect.right;
        Object.assign(line.style, {
          left: `${x - 1}px`,
          top: `${tableRect.top}px`,
          width: "2px",
          height: `${tableRect.height}px`
        });
      }
    };
    const win = this.doc.defaultView;
    const finish = (commit) => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", up);
      win.removeEventListener("keydown", escape, true);
      carried.forEach((el) => el.classList.remove("tp-dragged"));
      line.remove();
      this.doc.body.classList.remove("tp-dragging");
      this.dragging = false;
      this.hideHandles();
      const to = slot > from ? slot - 1 : slot;
      if (!commit || to === from) return;
      if (axis === "row") void this.write(widget, (t) => moveRow(t, from, to));
      else void this.write(widget, (t) => moveColumn(t, from, to), void 0, (c) => columnAfterMove(c, from, to));
    };
    const up = () => finish(true);
    const escape = (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    };
    move(e);
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", up);
    win.addEventListener("keydown", escape, true);
  }
};

// table-plus/src/index.ts
var version = "0.1.0";
var GLOBAL_KEY = "__tablePlus";
function init(bridge) {
  const missing = missingBridgeFunctions(bridge);
  if (missing.length) {
    console.error(`Table Plus: missing editor functions: ${missing.join(", ")}`);
    return;
  }
  const global = globalThis;
  const existing = global[GLOBAL_KEY];
  if (existing) {
    existing.setBridge(bridge);
    return;
  }
  const controller = new Controller(document, bridge);
  global[GLOBAL_KEY] = controller;
  controller.start();
}
export {
  init,
  version
};
