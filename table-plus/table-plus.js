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

// table-plus/src/icons.ts
var svg = (body, fill = false) => `<svg viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;
var ICONS = {
  grip: svg(
    '<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>',
    true
  ),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  rowAbove: svg('<rect x="3" y="13" width="18" height="7" rx="1"/><path d="M12 3v7M8.5 6.5h7"/>'),
  rowBelow: svg('<rect x="3" y="4" width="18" height="7" rx="1"/><path d="M12 14v7M8.5 17.5h7"/>'),
  columnLeft: svg('<rect x="13" y="3" width="7" height="18" rx="1"/><path d="M3 12h7M6.5 8.5v7"/>'),
  columnRight: svg('<rect x="4" y="3" width="7" height="18" rx="1"/><path d="M14 12h7M17.5 8.5v7"/>'),
  duplicate: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  arrowLeft: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  arrowRight: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  sortAsc: svg('<path d="M7 18V6M3 10l4-4 4 4M14 7h7M14 12h5M14 17h3"/>'),
  sortDesc: svg('<path d="M7 6v12M3 14l4 4 4-4M14 7h3M14 12h5M14 17h7"/>'),
  clear: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  filter: svg('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
  alignLeft: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  alignCenter: svg('<path d="M4 6h16M7 12h10M5.5 18h13"/>'),
  alignRight: svg('<path d="M4 6h16M10 12h10M7 18h13"/>')
};

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
function locateWithEmptyHeaders(text, hint, shape) {
  return nearest(
    findTables(text).filter((range) => {
      const table = parseTable(range.text);
      const named = (table.rows[0]?.cells ?? []).filter((cell) => cell !== "").length;
      return table.rows.length === shape.rows && named === shape.columns && named < table.align.length;
    }),
    hint
  );
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

// table-plus/src/menu.ts
function renderMenu(doc, title, entries) {
  const menu = doc.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);
  const heading = doc.createElement("div");
  heading.className = "tp-menu-title";
  heading.textContent = title;
  menu.append(heading);
  const button = (className, run, disabled) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = className;
    if (disabled) {
      b.setAttribute("aria-disabled", "true");
      b.title = disabled;
    }
    b.addEventListener("click", (e) => {
      e.preventDefault();
      if (!disabled) run();
    });
    return b;
  };
  for (const entry of entries) {
    if (entry.kind === "separator") {
      const separator = doc.createElement("div");
      separator.className = "tp-menu-separator";
      separator.setAttribute("role", "separator");
      menu.append(separator);
    } else if (entry.kind === "item") {
      const item = button("tp-menu-item", entry.run, entry.disabled);
      item.setAttribute("role", entry.checked === void 0 ? "menuitem" : "menuitemcheckbox");
      if (entry.checked !== void 0) item.setAttribute("aria-checked", String(entry.checked));
      if (entry.danger) item.classList.add("tp-danger");
      item.innerHTML = `<span class="tp-icon">${entry.icon}</span>`;
      const label = doc.createElement("span");
      label.className = "tp-label";
      label.textContent = entry.label;
      item.append(label);
      menu.append(item);
    } else {
      const row = doc.createElement("div");
      row.className = "tp-menu-segmented";
      const label = doc.createElement("span");
      label.className = "tp-label";
      label.textContent = entry.label;
      const group = doc.createElement("div");
      group.className = "tp-segments";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", entry.label);
      for (const option of entry.options) {
        const b = button("tp-segment", option.run);
        b.setAttribute("role", "menuitemradio");
        b.setAttribute("aria-checked", String(option.active));
        b.title = option.title;
        b.setAttribute("aria-label", option.title);
        b.innerHTML = option.icon;
        group.append(b);
      }
      row.append(label, group);
      menu.append(row);
    }
  }
  menu.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const buttons = Array.from(
      menu.querySelectorAll("button:not([aria-disabled])")
    );
    const index = buttons.indexOf(doc.activeElement);
    const focus = (i) => buttons[(i + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    if (e.key === "ArrowDown" || e.key === "ArrowRight" && index >= 0 && buttons[index].classList.contains("tp-segment")) {
      e.preventDefault();
      focus(index + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" && index >= 0 && buttons[index].classList.contains("tp-segment")) {
      e.preventDefault();
      focus(index < 0 ? -1 : index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focus(-1);
    }
  });
  return menu;
}
function focusMenu(menu) {
  menu.tabIndex = -1;
  menu.focus({ preventScroll: true });
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
function duplicateRow(table, row) {
  const original = table.rows[row];
  if (row < 1 || !original) return table;
  const rows = [...table.rows];
  rows.splice(row + 1, 0, { cells: [...original.cells] });
  return withRows(table, rows);
}
function moveRow(table, from, to) {
  const last = table.rows.length - 1;
  if (from < 1 || from > last || to < 1 || to > last || from === to) return table;
  return withRows(table, moved(table.rows, from, to));
}
function newColumnName(table) {
  const names = new Set(table.rows[0]?.cells ?? []);
  let n = table.align.length + 1;
  while (names.has(`Column ${n}`)) n++;
  return `Column ${n}`;
}
function nameEmptyHeaders(table) {
  const header = table.rows[0];
  if (!header) return table;
  const names = new Set(header.cells);
  const cells = header.cells.map((cell, i) => {
    if (cell !== "") return cell;
    let n = i + 1;
    while (names.has(`Column ${n}`)) n++;
    const name = `Column ${n}`;
    names.add(name);
    return name;
  });
  return { ...table, rows: [{ ...header, cells }, ...table.rows.slice(1)] };
}
function insertColumn(table, at) {
  const column = Math.max(0, Math.min(at, table.align.length));
  const header = newColumnName(table);
  const align = [...table.align];
  align.splice(column, 0, "");
  return {
    ...table,
    align,
    rows: table.rows.map((r, i) => {
      const cells = padded(r.cells, column);
      cells.splice(column, 0, i === 0 ? header : "");
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
var DRAG_THRESHOLD = 4;
var NAVIGATION_KEYS = /* @__PURE__ */ new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);
var NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";
var MOVE_BLOCKED = "Clear sorting and filters to move rows";
var Controller = class {
  constructor(doc, bridge) {
    this.doc = doc;
    this.bridge = bridge;
    this.bar = this.floating("div", "tp-bar");
    this.rowGrip = this.floatingButton("tp-handle tp-grip", "Row: click for actions, drag to move", ICONS.grip);
    this.columnGrip = this.floatingButton(
      "tp-handle tp-grip tp-grip-column",
      "Column: click for actions, drag to move",
      ICONS.grip
    );
    this.addRow = this.floatingButton("tp-add tp-add-row", "Add a row at the end", ICONS.plus);
    this.addRow.insertAdjacentText("beforeend", "Row");
    this.addColumn = this.floatingButton("tp-add tp-add-column", "Add a column at the end", ICONS.plus);
  }
  doc;
  bridge;
  infos = /* @__PURE__ */ new WeakMap();
  enhancing = /* @__PURE__ */ new WeakSet();
  views = /* @__PURE__ */ new Map();
  // Sideways scroll of each wide table, carried over to its next rendering
  scrollLefts = /* @__PURE__ */ new Map();
  editor;
  pendingFocus;
  hoverWidget;
  hoverCell;
  handleTarget;
  menu;
  dragging = false;
  hideTimer;
  scanQueued = false;
  stickyQueued = false;
  warnedIncompatible = false;
  observer;
  bar;
  rowGrip;
  columnGrip;
  addRow;
  addColumn;
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
    win.addEventListener("keyup", this.onKeyUp, true);
    win.addEventListener("blur", () => this.setNavigating(false));
    this.doc.addEventListener("mousemove", this.onMouseMove, { passive: true });
    this.rowGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "column"));
    this.addRow.addEventListener("click", () => this.appendRow());
    this.addColumn.addEventListener("click", () => this.appendColumn());
    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    void this.scan();
  }
  // ---- discovering rendered tables --------------------------------------
  queueScan() {
    if (this.scanQueued) return;
    this.scanQueued = true;
    const run = () => {
      this.scanQueued = false;
      void this.scan();
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
        const broken = locateWithEmptyHeaders(text, hint, shape);
        if (broken) this.offerHeaderFix(widget, broken.text, broken.from);
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
      const scrollLeft = this.scrollLefts.get(info.key);
      if (scrollLeft) widget.scrollLeft = scrollLeft;
      this.takePendingFocus(widget, info);
      this.queueStickyUpdate();
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
  /**
   * A table with unnamed columns renders with its header shifted against its
   * data, so Table Plus leaves it alone and offers to name those columns
   */
  offerHeaderFix(widget, source, hint) {
    if (widget.querySelector(".tp-notice")) return;
    const notice = this.doc.createElement("div");
    notice.className = `${UI_CLASS} tp-notice`;
    notice.textContent = "Some columns of this table have no name, so SilverBullet shifts the header against the data. ";
    const button = this.doc.createElement("button");
    button.type = "button";
    button.textContent = "Name them";
    for (const type of ["mousedown", "mouseup", "click"]) {
      button.addEventListener(type, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (type === "click") void this.fixHeaders(source, hint);
      });
    }
    notice.append(button);
    widget.prepend(notice);
  }
  async fixHeaders(source, hint) {
    try {
      const range = locateBySource(await this.bridge.getText(), hint, source);
      if (!range) {
        void this.bridge.flash(NOT_SAVED, "error");
        return;
      }
      const edit = minimalEdit(range.text, serializeTable(nameEmptyHeaders(parseTable(range.text))));
      await this.bridge.replaceRange(range.from + edit.from, range.from + edit.to, edit.insert);
    } catch (e) {
      console.error("Table Plus: could not name the columns", e);
      void this.bridge.flash(`Table Plus: could not name the columns (${String(e)})`, "error");
    }
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
    if (this.hoverWidget === widget) this.showTableControls(widget, info);
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
  tableCellOf(info, target) {
    if (!(target instanceof Element)) return void 0;
    const cell = target.closest("td, th");
    if (!cell || cell.closest("table") !== info.table) return void 0;
    return cell.parentElement?.classList.contains("tp-filter-row") ? void 0 : cell;
  }
  onMouseDown = (e) => {
    const target = e.target instanceof Node ? e.target : null;
    if (this.menu && target && !this.isFloating(target)) this.closeMenu(false);
    if (e.button !== 0) return;
    if (e.altKey) {
      this.onAltMouseDown(e);
      return;
    }
    const hit = this.enhancedWidgetOf(e.target);
    if (!hit) return;
    const [widget, info] = hit;
    const element = e.target;
    if (element.closest(NATIVE_ACTION_SELECTOR)) return;
    e.stopPropagation();
    if (element.closest("[data-tp-action]")) {
      e.preventDefault();
      return;
    }
    if (element.closest(".tp-cell-editor, .tp-filter-row") || element.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    e.preventDefault();
    const cell = this.tableCellOf(info, element);
    if (!cell || this.editor?.cell === cell) return;
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
  onClick = (e) => {
    const hit = this.enhancedWidgetOf(e.target);
    if (!hit) return;
    const [widget, info] = hit;
    const target = e.target;
    if (e.altKey) {
      if (this.tableCellOf(info, target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
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
  onScroll = (e) => {
    this.queueStickyUpdate();
    const scrolled = e.target instanceof HTMLElement ? this.infos.get(e.target) : void 0;
    if (scrolled && e.target instanceof HTMLElement) this.scrollLefts.set(scrolled.key, e.target.scrollLeft);
    if (this.dragging || e.target instanceof Node && this.menu?.element.contains(e.target)) return;
    this.closeMenu(false);
    this.hideFloating();
  };
  // ---- sticky header -----------------------------------------------------
  queueStickyUpdate() {
    if (this.stickyQueued) return;
    this.stickyQueued = true;
    const run = () => {
      this.stickyQueued = false;
      this.updateStickyHeaders();
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }
  /**
   * Keeps each table's header in view while the page scrolls past the table.
   * CSS `position: sticky` cannot do it: the table sits in a sideways
   * scrolling box, which captures sticky positioning. So the header is moved
   * down with a transform, never past the table's last row.
   */
  updateStickyHeaders() {
    for (const widget of Array.from(this.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      const head = info?.table.tHead;
      if (!info || !head || renderedTable(widget) !== info.table) continue;
      const viewTop = this.scrollParentOf(widget)?.getBoundingClientRect().top ?? 0;
      const table = info.table.getBoundingClientRect();
      const offset = Math.max(0, Math.min(viewTop - table.top, table.height - head.offsetHeight));
      head.style.transform = offset > 0 ? `translateY(${offset}px)` : "";
      head.classList.toggle("tp-stuck", offset > 0);
    }
  }
  scrollParentOf(element) {
    const win = this.doc.defaultView;
    for (let el = element.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(win.getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el;
    }
    return void 0;
  }
  onKeyDown = (e) => {
    if (e.key === "Escape" && this.menu) {
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu(true);
    }
  };
  onKeyUp = (e) => {
    if (e.key === "Control") this.setNavigating(false);
  };
  // While Ctrl is held in a cell editor, arrows move between cells: the pointer shows it
  setNavigating(on) {
    this.doc.body.classList.toggle("tp-navigating", on);
  }
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
      this.showTableControls(widget, info);
    }
    const cell = this.tableCellOf(info, target);
    if (!cell || this.editor) {
      this.hideHandles();
      return;
    }
    if (cell !== this.hoverCell) this.showHandles(widget, info, cell);
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
  openEditor(widget, info, cell, select = false) {
    const ref = this.cellRef(info, cell);
    if (!ref || this.editor) return;
    const original = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";
    const cellStyle = cell.getAttribute("style");
    const rect = cell.getBoundingClientRect();
    if (rect.width > 0) {
      cell.style.boxSizing = "border-box";
      cell.style.width = `${rect.width}px`;
      cell.style.minWidth = `${rect.width}px`;
      cell.style.maxWidth = `${rect.width}px`;
      cell.style.height = `${rect.height}px`;
    }
    const field = this.doc.createElement("input");
    field.type = "text";
    field.className = `${UI_CLASS} tp-cell-editor`;
    field.size = 1;
    field.spellcheck = true;
    field.value = unescapeCell(original);
    const kept = this.doc.createDocumentFragment();
    while (cell.firstChild) kept.append(cell.firstChild);
    cell.classList.add("tp-editing");
    cell.append(field);
    this.editor = { widget, cell, ...ref, original, field, kept, cellStyle };
    this.reveal(widget, cell);
    this.hideHandles();
    this.isolate(field);
    field.addEventListener("blur", () => {
      if (this.editor?.field === field) void this.finishEditing(true, void 0, false);
    });
    field.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Control") this.setNavigating(true);
      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && NAVIGATION_KEYS.has(e.key)) {
        e.preventDefault();
        void this.navigate(e.key);
      } else if (e.key === "Escape") {
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
    field.focus({ preventScroll: true });
    if (select) field.select();
    else field.setSelectionRange(field.value.length, field.value.length);
  }
  /** Puts the rendered cell back; returns what was being edited */
  closeEditor() {
    const active = this.editor;
    if (!active) return void 0;
    this.editor = void 0;
    let value = escapeCell(active.field.value);
    if (active.row === 0 && value === "" && active.original !== "") {
      value = active.original;
      void this.bridge.flash("Table Plus: a column needs a name; the old name was kept", "info");
    }
    active.field.remove();
    active.cell.classList.remove("tp-editing");
    if (active.cellStyle === null) active.cell.removeAttribute("style");
    else active.cell.setAttribute("style", active.cellStyle);
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
      result = await this.write(closed.widget, (t) => this.withCellEdit(t, closed), sameTable ? next : void 0);
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
  /** The header row and the shown body rows, in display order */
  shownRows(info) {
    return [
      info.table.rows[0],
      ...Array.from(info.table.querySelectorAll("tr[data-tp-row]:not(.tp-hidden)"))
    ];
  }
  /**
   * Ctrl+arrows: save and edit the neighbouring shown cell; Ctrl+Home / End:
   * the first / last cell of the row. Nothing happens at the table's edge.
   */
  async navigate(key) {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const shown = this.shownRows(info);
    let r = shown.indexOf(active.cell.parentElement);
    let column = active.column;
    if (key === "ArrowLeft") column--;
    else if (key === "ArrowRight") column++;
    else if (key === "ArrowUp") r--;
    else if (key === "ArrowDown") r++;
    else if (key === "Home") column = 0;
    else if (key === "End") column = info.columns - 1;
    const target = shown[r]?.cells[column];
    if (!target || target === active.cell) return;
    const ref = this.cellRef(info, target);
    if (ref) await this.finishEditing(true, { widget: active.widget, ...ref });
  }
  async step(direction) {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const shown = this.shownRows(info);
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
    if (cell) this.openEditor(widget, info, cell, pending.select);
  }
  /** Scrolls a wide table sideways so that the cell is fully visible */
  /**
   * Scrolls so that the cell is fully visible: a wide table sideways, the page
   * up or down, keeping a body cell clear of the header held at the top
   */
  reveal(widget, cell) {
    const box = widget.getBoundingClientRect();
    let rect = cell.getBoundingClientRect();
    if (rect.right > box.right) widget.scrollLeft += rect.right - box.right;
    else if (rect.left < box.left) widget.scrollLeft -= box.left - rect.left;
    const scroller = this.scrollParentOf(widget);
    if (!scroller) return;
    rect = cell.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const head = this.infos.get(widget)?.table.tHead;
    const top = view.top + (head && !head.contains(cell) ? head.offsetHeight : 0);
    if (rect.top < top) scroller.scrollTop -= top - rect.top;
    else if (rect.bottom > view.bottom) scroller.scrollTop += rect.bottom - view.bottom;
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
      this.scrollLefts.set(info.key, widget.scrollLeft);
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
    this.closeMenu(false);
    const offset = at ? cellSourceOffset(range.text, at.row, at.column, at.within) : 0;
    await this.bridge.moveCursor(range.from + offset);
  }
  appendRow() {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info) return;
    const rows = parseTable(info.source).rows.length;
    void this.write(widget, (t) => insertRow(t, t.rows.length), {
      row: rows,
      column: this.firstVisibleColumn(widget, info)
    });
  }
  /** The leftmost column in view, so editing a new row does not scroll a wide table back */
  firstVisibleColumn(widget, info) {
    const left = widget.getBoundingClientRect().left;
    const cells = Array.from(info.table.rows[0].cells);
    const index = cells.findIndex((cell) => cell.getBoundingClientRect().left >= left - 1);
    return Math.max(0, index);
  }
  appendColumn() {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info) return;
    void this.write(widget, (t) => insertColumn(t, t.align.length), { row: 0, column: info.columns, select: true });
  }
  // ---- floating UI: toolbar, grips, add buttons --------------------------
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
    button.setAttribute("aria-label", title);
    button.innerHTML = icon;
    return button;
  }
  isFloating(node) {
    return [this.bar, this.rowGrip, this.columnGrip, this.addRow, this.addColumn].some((el) => el.contains(node)) || !!this.menu?.element.contains(node);
  }
  place(element, left, top) {
    const win = this.doc.defaultView;
    const maxLeft = Math.max(4, win.innerWidth - element.offsetWidth - 4);
    element.style.left = `${Math.round(Math.max(4, Math.min(left, maxLeft)))}px`;
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
    for (const el of [this.rowGrip, this.columnGrip]) el.classList.remove("tp-visible");
    this.hoverCell = void 0;
    this.handleTarget = void 0;
  }
  hideFloating() {
    this.hideHandles();
    for (const el of [this.bar, this.addRow, this.addColumn]) el.classList.remove("tp-visible");
    this.hoverWidget = void 0;
  }
  /** The toolbar above the table and the add-row / add-column buttons */
  showTableControls(widget, info) {
    const view = this.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    if (view.sort) {
      const { column, direction } = view.sort;
      const name = cellText(info.table.rows[0].cells[column]) || `column ${column + 1}`;
      const chip = this.doc.createElement("span");
      chip.className = "tp-status tp-chip";
      chip.textContent = `Sorted by ${name} ${direction === "asc" ? "\u2191" : "\u2193"}`;
      const clear = this.doc.createElement("button");
      clear.type = "button";
      clear.tabIndex = -1;
      clear.className = "tp-chip-clear";
      clear.title = "Clear sorting: show the rows as written";
      clear.setAttribute("aria-label", clear.title);
      clear.innerHTML = ICONS.clear;
      clear.addEventListener("click", (e) => {
        e.preventDefault();
        this.setView(widget, info, withoutSort(this.viewOf(info)));
      });
      chip.append(clear);
      bar.append(chip);
    }
    const rows = this.bodyRows(info);
    const shown = rows.filter((tr) => !tr.classList.contains("tp-hidden")).length;
    if (shown !== rows.length) {
      const status = this.doc.createElement("span");
      status.className = "tp-status";
      status.textContent = `${shown} of ${rows.length} rows`;
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
    button(
      "Filter",
      "Show or hide the filter row",
      () => {
        const current = this.viewOf(info);
        this.setView(
          widget,
          info,
          current.showFilters ? { ...current, filters: [], showFilters: false } : { ...current, showFilters: true }
        );
      },
      view.showFilters
    );
    button("Edit markdown", "Show this table as markdown", () => void this.showMarkdown(info));
    const rect = widget.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    const headerRect = info.table.rows[0].getBoundingClientRect();
    const viewTop = this.scrollParentOf(widget)?.getBoundingClientRect().top ?? 0;
    bar.classList.add("tp-visible");
    const above = headerRect.top - bar.offsetHeight - 14;
    const top = above >= viewTop + 4 ? above : headerRect.top + (headerRect.height - bar.offsetHeight) / 2;
    this.place(bar, rect.right - bar.offsetWidth - (above >= viewTop + 4 ? 0 : 6), top);
    this.addRow.classList.add("tp-visible");
    this.place(this.addRow, this.shownRect(widget, info).left, tableRect.bottom + 4);
    this.addColumn.classList.add("tp-visible");
    this.place(
      this.addColumn,
      Math.min(tableRect.right, rect.right) + 4,
      headerRect.top + (headerRect.height - this.addColumn.offsetHeight) / 2
    );
  }
  showHandles(widget, info, cell) {
    this.hoverCell = cell;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    this.handleTarget = { widget, info, column: ref.column, ...ref.row > 0 ? { row: ref.row } : {} };
    const tr = cell.parentElement;
    const shown = this.shownRect(widget, info);
    const rearranged = isRearranged(this.viewOf(info));
    if (ref.row > 0) {
      const rowRect = tr.getBoundingClientRect();
      this.rowGrip.classList.toggle("tp-no-drag", rearranged);
      this.rowGrip.title = rearranged ? `Row: click for actions (${MOVE_BLOCKED.toLowerCase()})` : "Row: click for actions, drag to move";
      this.place(this.rowGrip, shown.left - 22, rowRect.top + (rowRect.height - 18) / 2);
    } else {
      this.rowGrip.classList.remove("tp-visible");
    }
    const headerCell = info.table.rows[0].cells[ref.column];
    if (headerCell) {
      const h = headerCell.getBoundingClientRect();
      const center = Math.max(shown.left + 9, Math.min(h.left + h.width / 2, shown.right - 9));
      this.place(this.columnGrip, center - 9, h.top - 9);
    }
  }
  /** Where a table is in view: the table, cut to the box that scrolls it sideways */
  shownRect(widget, info) {
    const box = widget.getBoundingClientRect();
    const table = info.table.getBoundingClientRect();
    return { left: Math.max(box.left, table.left), right: Math.min(box.right, table.right) };
  }
  // ---- grips: click opens a menu, drag moves -----------------------------
  onGripPointerDown(e, axis) {
    const target = this.handleTarget;
    if (e.button !== 0 || !target || axis === "row" && target.row === void 0) return;
    e.preventDefault();
    const grip = axis === "row" ? this.rowGrip : this.columnGrip;
    const canDrag = axis === "column" || !isRearranged(this.viewOf(target.info));
    const win = this.doc.defaultView;
    const startX = e.clientX;
    const startY = e.clientY;
    let drag;
    const move = (ev) => {
      if (!drag) {
        if (!canDrag || Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        this.closeMenu(false);
        drag = this.beginDrag(target, axis);
      }
      drag.move(ev);
    };
    const cleanup = () => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", up);
      win.removeEventListener("keydown", escape, true);
    };
    const up = () => {
      cleanup();
      if (drag) drag.finish(true);
      else this.toggleMenu(axis, target, grip);
    };
    const escape = (ev) => {
      if (ev.key !== "Escape" || !drag) return;
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
      drag.finish(false);
    };
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", up);
    win.addEventListener("keydown", escape, true);
  }
  beginDrag(target, axis) {
    const { widget, info } = target;
    const from = axis === "row" ? target.row : target.column;
    const table = info.table;
    const header = table.rows[0];
    const bodyRows = this.bodyRows(info);
    const carried = axis === "row" ? bodyRows.filter((tr) => Number(tr.dataset.tpRow) === from) : [header, ...bodyRows].map((tr) => tr.cells[from]).filter((c) => !!c);
    carried.forEach((el) => el.classList.add("tp-dragged"));
    const line = this.floating("div", "tp-drop tp-visible");
    this.doc.body.classList.add("tp-dragging");
    this.dragging = true;
    let slot = from;
    const move = (ev) => {
      const tableRect = table.getBoundingClientRect();
      const shown = this.shownRect(widget, info);
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
          left: `${shown.left}px`,
          top: `${y - 1}px`,
          width: `${shown.right - shown.left}px`,
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
    const finish = (commit) => {
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
    return { move, finish };
  }
  // ---- menus -------------------------------------------------------------
  toggleMenu(axis, target, anchor) {
    if (this.menu?.axis === axis) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu(false);
    const { widget, info } = target;
    const element = axis === "row" ? renderMenu(this.doc, `Row ${target.row}`, this.rowMenu(widget, info, target.row, target.column)) : renderMenu(
      this.doc,
      `Column: ${cellText(info.table.rows[0].cells[target.column]) || target.column + 1}`,
      this.columnMenu(widget, info, target.column)
    );
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    element.addEventListener("mousedown", (e) => e.preventDefault());
    this.doc.body.append(element);
    this.menu = { element, axis, widget };
    const win = this.doc.defaultView;
    const a = anchor.getBoundingClientRect();
    const m = element.getBoundingClientRect();
    let left = axis === "row" ? a.right + 4 : a.left + a.width / 2 - m.width / 2;
    let top = axis === "row" ? a.top - 6 : a.bottom + 4;
    left = Math.max(4, Math.min(left, win.innerWidth - m.width - 4));
    if (top + m.height > win.innerHeight - 4) top = Math.max(4, win.innerHeight - m.height - 4);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    anchor.classList.add("tp-active");
    focusMenu(element);
  }
  closeMenu(refocus) {
    const menu = this.menu;
    if (!menu) return;
    this.menu = void 0;
    const hadFocus = menu.element.contains(this.doc.activeElement);
    menu.element.remove();
    this.rowGrip.classList.remove("tp-active");
    this.columnGrip.classList.remove("tp-active");
    this.hideHandles();
    if (refocus && hadFocus) this.focusEditor(menu.widget);
  }
  runAndClose(run) {
    return () => {
      this.closeMenu(false);
      run();
    };
  }
  // `column`: the hovered column, where editing a new row starts
  rowMenu(widget, info, row, column) {
    const rows = parseTable(info.source).rows.length;
    const rearranged = isRearranged(this.viewOf(info));
    const edit = (change, focus) => this.runAndClose(() => void this.write(widget, change, focus));
    return [
      { kind: "item", label: "Insert row above", icon: ICONS.rowAbove, run: edit((t) => insertRow(t, row), { row, column }) },
      {
        kind: "item",
        label: "Insert row below",
        icon: ICONS.rowBelow,
        run: edit((t) => insertRow(t, row + 1), { row: row + 1, column })
      },
      { kind: "item", label: "Duplicate row", icon: ICONS.duplicate, run: edit((t) => duplicateRow(t, row)) },
      { kind: "separator" },
      {
        kind: "item",
        label: "Move up",
        icon: ICONS.arrowUp,
        run: edit((t) => moveRow(t, row, row - 1)),
        disabled: rearranged ? MOVE_BLOCKED : row <= 1 ? "Already the first row" : void 0
      },
      {
        kind: "item",
        label: "Move down",
        icon: ICONS.arrowDown,
        run: edit((t) => moveRow(t, row, row + 1)),
        disabled: rearranged ? MOVE_BLOCKED : row >= rows - 1 ? "Already the last row" : void 0
      },
      { kind: "separator" },
      { kind: "item", label: "Delete row", icon: ICONS.trash, danger: true, run: edit((t) => deleteRow(t, row)) }
    ];
  }
  columnMenu(widget, info, column) {
    const view = this.viewOf(info);
    const sorted = view.sort?.column === column ? view.sort.direction : void 0;
    const align = parseTable(info.source).align[column] ?? "";
    const edit = (change, focus, columnMap) => this.runAndClose(() => void this.write(widget, change, focus, columnMap));
    const sortBy = (next) => this.runAndClose(() => this.setView(widget, info, next));
    const alignTo = (target) => edit((t) => setAlign(t, column, align === target ? "" : target));
    const entries = [
      {
        kind: "item",
        label: "Sort ascending",
        icon: ICONS.sortAsc,
        checked: sorted === "asc",
        run: sortBy(withSort(view, column, "asc"))
      },
      {
        kind: "item",
        label: "Sort descending",
        icon: ICONS.sortDesc,
        checked: sorted === "desc",
        run: sortBy(withSort(view, column, "desc"))
      }
    ];
    if (view.sort) {
      entries.push({ kind: "item", label: "Clear sorting", icon: ICONS.clear, run: sortBy(withoutSort(view)) });
    }
    entries.push(
      {
        kind: "item",
        label: "Filter",
        icon: ICONS.filter,
        run: this.runAndClose(() => {
          this.setView(widget, info, { ...this.viewOf(info), showFilters: true });
          info.table.querySelector(`.tp-filter[data-tp-column="${column}"]`)?.focus();
        })
      },
      { kind: "separator" },
      {
        kind: "segmented",
        label: "Align",
        options: [
          { icon: ICONS.alignLeft, title: "Align left", active: align === "left", run: alignTo("left") },
          { icon: ICONS.alignCenter, title: "Align center", active: align === "center", run: alignTo("center") },
          { icon: ICONS.alignRight, title: "Align right", active: align === "right", run: alignTo("right") }
        ]
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Insert column left",
        icon: ICONS.columnLeft,
        run: edit((t) => insertColumn(t, column), { row: 0, column, select: true }, (c) => c >= column ? c + 1 : c)
      },
      {
        kind: "item",
        label: "Insert column right",
        icon: ICONS.columnRight,
        run: edit(
          (t) => insertColumn(t, column + 1),
          { row: 0, column: column + 1, select: true },
          (c) => c > column ? c + 1 : c
        )
      },
      {
        kind: "item",
        label: "Move left",
        icon: ICONS.arrowLeft,
        run: edit((t) => moveColumn(t, column, column - 1), void 0, (c) => columnAfterMove(c, column, column - 1)),
        disabled: column === 0 ? "Already the first column" : void 0
      },
      {
        kind: "item",
        label: "Move right",
        icon: ICONS.arrowRight,
        run: edit((t) => moveColumn(t, column, column + 1), void 0, (c) => columnAfterMove(c, column, column + 1)),
        disabled: column >= info.columns - 1 ? "Already the last column" : void 0
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Delete column",
        icon: ICONS.trash,
        danger: true,
        run: edit((t) => deleteColumn(t, column), void 0, (c) => c === column ? void 0 : c > column ? c - 1 : c),
        disabled: info.columns <= 1 ? "A table needs at least one column" : void 0
      }
    );
    return entries;
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
