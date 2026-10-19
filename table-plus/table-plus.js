// table-plus/src/bridge.ts
var SETTINGS = {
  enterKey: {
    path: "tablePlus.enterKey",
    default: "save",
    parse: (v) => v === "save" || v === "moveDown" ? v : void 0
  },
  smartFilters: {
    path: "tablePlus.smartFilters",
    default: true,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Store table settings (for now: sorting) in the table's metadata row
  metadata: {
    path: "tablePlus.metadata",
    default: false,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // A click on a cell selects its text (Shift+click does not); off: the reverse
  selectOnClick: {
    path: "tablePlus.selectOnClick",
    default: false,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Ctrl+Enter in a cell editor adds a row below; off: it is a plain Enter
  ctrlEnterAddsRow: {
    path: "tablePlus.ctrlEnterAddsRow",
    default: true,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Write edited tables with aligned pipes; off: keep each table's own style
  autoFormat: {
    path: "tablePlus.autoFormat",
    default: true,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Pixels; 0: no limit
  maxHeight: {
    path: "tablePlus.maxHeight",
    default: 0,
    parse: (v) => {
      const n = typeof v === "string" ? Number(v) : v;
      return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : void 0;
    }
  }
};
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
var PIN_POINT_RIGHT = svg('<path d="M21 12h-6M15 8.5v7l-4-1.5H7v-4h4z"/>');
var PIN_POINT_LEFT = svg('<path d="M3 12h6M9 8.5v7l4-1.5h4v-4h-4z"/>');
var PIN_POINT_DOWN = svg('<path d="M12 21v-6M8.5 15h7l-1.5-4V7h-4v4z"/>');
var PIN_POINT_UP = svg('<path d="M12 3v6M8.5 9h7l-1.5 4v4h-4v-4z"/>');
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
  // Sorted lines with a check: make the sorting the real order
  applySort: svg('<path d="M4 6h9M4 12h7M4 18h5M14 15l3 3 5-6"/>'),
  filter: svg('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
  alignLeft: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  alignCenter: svg('<path d="M4 6h16M7 12h10M5.5 18h13"/>'),
  alignRight: svg('<path d="M4 6h16M10 12h10M7 18h13"/>'),
  // A pushpin with its needle pointing to the edge it pins to
  pinTop: PIN_POINT_UP,
  pinBottom: PIN_POINT_DOWN,
  pinLeft: PIN_POINT_LEFT,
  pinRight: PIN_POINT_RIGHT
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
  let lines = text.split(/\r?\n/);
  const last = lines.length > 2 ? lines[lines.length - 1] : void 0;
  const meta = last === void 0 ? void 0 : parseMetaRow(last);
  if (meta) lines = lines.slice(0, -1);
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
    alignSource: align,
    ...meta && last !== void 0 ? { meta, metaSource: { line: last, meta } } : {}
  };
}
var META_TAG_RE = /^<meta\b([^>]*?)\/?>$/i;
var META_ATTRIBUTE_RE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
function parseMetaRow(line) {
  const [first, ...rest] = splitRow(line);
  const tag = META_TAG_RE.exec(first ?? "");
  if (!tag || rest.some((cell) => cell !== "")) return void 0;
  const meta = {};
  for (const match of tag[1].matchAll(META_ATTRIBUTE_RE)) {
    meta[match[1]] = unescapeMetaValue(match[2] ?? match[3] ?? "");
  }
  return meta;
}
function unescapeMetaValue(value) {
  return value.replace(/\\\|/g, "|").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function escapeMetaValue(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/>/g, "&gt;").replace(/\|/g, "\\|");
}
function metaRow(indent, meta) {
  const attributes = Object.entries(meta).map(([name, value]) => ` ${name}="${escapeMetaValue(value)}"`).join("");
  return `${indent}| <meta${attributes}> |`;
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
  const lines = [header ? rowText(header) : "", delimiterText, ...body.map(rowText)];
  if (table.meta && table.metaSource?.meta === table.meta) lines.push(table.metaSource.line);
  else if (table.meta && Object.keys(table.meta).length > 0) lines.push(metaRow(table.indent, table.meta));
  return lines.join("\n");
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
    // SilverBullet renders the metadata row too
    rows: table.rows.length + (table.meta ? 1 : 0),
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
      const rendered = table.rows.length + (table.meta ? 1 : 0);
      return rendered === shape.rows && named === shape.columns && named < table.align.length;
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

// table-plus/src/view.ts
var NO_PINS = { top: 0, bottom: 0, left: 0, right: 0 };
var DEFAULT_VIEW = { filters: [], showFilters: false };
function pinsOf(view) {
  return view.pins ?? NO_PINS;
}
function hasPins(pins) {
  return pins.top + pins.bottom + pins.left + pins.right > 0;
}
function withPins(view, pins) {
  if (hasPins(pins)) return { ...view, pins };
  const { pins: _pins, ...rest } = view;
  return rest;
}
var DEFAULT_FILTER_OPTIONS = { smart: true };
function isRearranged(view, options = DEFAULT_FILTER_OPTIONS) {
  return !!view.sort || view.filters.some((f) => filterMatcher(f, options) !== void 0);
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
  const result = view.pins ? { filters, showFilters: view.showFilters, pins: view.pins } : { filters, showFilters: view.showFilters };
  return view.sort && sortColumn !== void 0 ? { ...result, sort: { column: sortColumn, direction: view.sort.direction } } : result;
}
function normalizeForFilter(s) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
var NUMBER_RE = /^\p{Sc}?\s*([-+]?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,]\d+)?)\s*[\p{L}\p{Sc}%°]*$/u;
function asNumber(s) {
  const m = NUMBER_RE.exec(s.trim());
  return m ? Number(m[1].replace(/[ \u00a0]/g, "").replace(",", ".")) : void 0;
}
var collator = new Intl.Collator(void 0, { numeric: true, sensitivity: "base" });
function compareValues(a, b) {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== void 0 && nb !== void 0) return na - nb;
  return collator.compare(a.trim(), b.trim());
}
var REGEX_RE = /^\/(.*)\/([cimsu]*)$/s;
var COMPARISON_RE = /^(<=|>=|<|>)\s*(.*)$/s;
function parseFilter(filter, options = DEFAULT_FILTER_OPTIONS) {
  const text = filter.trim();
  if (text === "") return {};
  if (options.smart) {
    if (text.startsWith("!")) {
      const inner = parseFilter(text.slice(1), options);
      const match = inner.match;
      return match ? { match: (value) => !match(value) } : inner;
    }
    if (text.startsWith("=")) {
      const whole = normalizeForFilter(text.slice(1).trim());
      return whole === "" ? {} : { match: (value) => normalizeForFilter(value.trim()) === whole };
    }
    const regex = REGEX_RE.exec(text);
    if (regex) return parseRegex(regex[1], regex[2]);
    if (text.startsWith("/")) return {};
    const comparison = COMPARISON_RE.exec(text);
    if (comparison) {
      const [, operator, rest] = comparison;
      if (rest.trim() === "") return {};
      const limit = asNumber(rest);
      if (limit !== void 0) {
        return {
          match: (value) => {
            const n = asNumber(value);
            if (n === void 0) return false;
            if (operator === ">") return n > limit;
            if (operator === "<") return n < limit;
            if (operator === ">=") return n >= limit;
            return n <= limit;
          }
        };
      }
    }
  }
  const needle = normalizeForFilter(text);
  return { match: (value) => normalizeForFilter(value).includes(needle) };
}
function parseRegex(pattern, flags) {
  if (pattern === "") return {};
  const caseSensitive = flags.includes("c");
  const jsFlags = [...new Set(flags.replace(/[ci]/g, "") + (caseSensitive ? "" : "i"))].join("");
  try {
    const re = new RegExp(pattern, jsFlags);
    return { match: (value) => re.test(value) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
function filterMatcher(filter, options = DEFAULT_FILTER_OPTIONS) {
  return parseFilter(filter, options).match;
}
function visibleRows(values, view, options = DEFAULT_FILTER_OPTIONS) {
  const { top, bottom } = pinsOf(view);
  const matchers = view.filters.map((filter) => filterMatcher(filter, options));
  const indexes = values.map((_, i) => i).filter((i) => i >= top && i < values.length - bottom).filter((i) => matchers.every((match, column) => !match || match(values[i][column] ?? "")));
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

// table-plus/src/meta.ts
function withMeta(table, name, value) {
  const current = table.meta ?? {};
  if (current[name] === value) return table;
  const meta = { ...current };
  if (value === void 0) delete meta[name];
  else meta[name] = value;
  return { ...table, meta };
}
function headerNames(table) {
  return (table.rows[0]?.cells ?? []).map(unescapeCell);
}
function parseSort(value) {
  const match = /^(.*):(asc|desc)(?::(\d+))?$/.exec(value);
  return match ? { name: match[1], direction: match[2], nth: Number(match[3] ?? 1) } : void 0;
}
function metaSort(table) {
  const sort = table.meta?.sort === void 0 ? void 0 : parseSort(table.meta.sort);
  if (!sort) return void 0;
  let seen = 0;
  const column = headerNames(table).findIndex((name) => name === sort.name && ++seen === sort.nth);
  return column < 0 ? void 0 : { column, direction: sort.direction };
}
function withMetaSort(table, sort) {
  const names = headerNames(table);
  const name = sort ? names[sort.column] : void 0;
  if (!sort || name === void 0) return withMeta(table, "sort", void 0);
  const same = names.filter((n) => n === name).length;
  const nth = names.slice(0, sort.column + 1).filter((n) => n === name).length;
  return withMeta(table, "sort", `${name}:${sort.direction}${same > 1 ? `:${nth}` : ""}`);
}
var PIN_ATTRIBUTES = { top: "pin-top", bottom: "pin-bottom", left: "pin-left", right: "pin-right" };
function metaPins(table) {
  const count = (name) => {
    const n = Number(table.meta?.[name]);
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  const bodyRows = Math.max(0, table.rows.length - 1);
  const columns = table.align.length;
  const top = Math.min(count(PIN_ATTRIBUTES.top), bodyRows);
  const left = Math.min(count(PIN_ATTRIBUTES.left), columns);
  return {
    top,
    bottom: Math.min(count(PIN_ATTRIBUTES.bottom), bodyRows - top),
    left,
    right: Math.min(count(PIN_ATTRIBUTES.right), columns - left)
  };
}
function withMetaPins(table, pins) {
  let result = table;
  for (const edge of ["top", "bottom", "left", "right"]) {
    result = withMeta(result, PIN_ATTRIBUTES[edge], pins[edge] > 0 ? String(pins[edge]) : void 0);
  }
  return result;
}
function followMetaSort(before, after, map) {
  if (after.meta?.sort === void 0 || after.meta.sort !== before.meta?.sort) return after;
  const sort = metaSort(before);
  const column = sort && map(sort.column);
  return withMetaSort(after, sort && column !== void 0 ? { column, direction: sort.direction } : void 0);
}

// table-plus/src/pins.ts
function rowZone(pins, rows, row) {
  if (row >= 1 && row <= pins.top) return "top";
  if (row >= rows - pins.bottom && row <= rows - 1) return "bottom";
  return void 0;
}
function columnZone(pins, columns, column) {
  if (column >= 0 && column < pins.left) return "left";
  if (column >= columns - pins.right && column < columns) return "right";
  return void 0;
}
function clampRowMove(pins, rows, from, to) {
  const zone = rowZone(pins, rows, from);
  const [min, max] = zone === "top" ? [1, pins.top] : zone === "bottom" ? [rows - pins.bottom, rows - 1] : [pins.top + 1, rows - 1 - pins.bottom];
  return Math.max(min, Math.min(to, max));
}
function clampColumnMove(pins, columns, from, to) {
  const zone = columnZone(pins, columns, from);
  const [min, max] = zone === "left" ? [0, pins.left - 1] : zone === "right" ? [columns - pins.right, columns - 1] : [pins.left, columns - 1 - pins.right];
  return Math.max(min, Math.min(to, max));
}
function insertRowAt(pins, rows, at) {
  let index = Math.max(1, Math.min(at, rows));
  if (pins.top > 0) index = Math.max(index, 2);
  if (pins.bottom > 0) index = Math.min(index, rows - 1);
  return {
    at: index,
    pins: {
      ...pins,
      top: pins.top + (index <= pins.top ? 1 : 0),
      bottom: pins.bottom + (pins.bottom > 0 && index > rows - pins.bottom ? 1 : 0)
    }
  };
}
function appendRowAt(pins, rows) {
  return rows - pins.bottom;
}
function deleteRowPins(pins, rows, row) {
  const zone = rowZone(pins, rows, row);
  return { ...pins, top: pins.top - (zone === "top" ? 1 : 0), bottom: pins.bottom - (zone === "bottom" ? 1 : 0) };
}
function insertColumnAt(pins, columns, at) {
  let index = Math.max(0, Math.min(at, columns));
  if (pins.left > 0) index = Math.max(index, 1);
  if (pins.right > 0) index = Math.min(index, columns - 1);
  return {
    at: index,
    pins: {
      ...pins,
      left: pins.left + (index < pins.left ? 1 : 0),
      right: pins.right + (pins.right > 0 && index > columns - pins.right ? 1 : 0)
    }
  };
}
function appendColumnAt(pins, columns) {
  return columns - pins.right;
}
function deleteColumnPins(pins, columns, column) {
  const zone = columnZone(pins, columns, column);
  return { ...pins, left: pins.left - (zone === "left" ? 1 : 0), right: pins.right - (zone === "right" ? 1 : 0) };
}
function pinRow(pins, rows, row, pin) {
  const zone = rowZone(pins, rows, row);
  if (zone === pin) return { to: row, pins };
  let p = pins;
  let to = row;
  if (zone === "top") {
    to = pins.top;
    p = { ...p, top: p.top - 1 };
  } else if (zone === "bottom") {
    to = rows - pins.bottom;
    p = { ...p, bottom: p.bottom - 1 };
  }
  if (pin === "top") return { to: p.top + 1, pins: { ...p, top: p.top + 1 } };
  if (pin === "bottom") return { to: rows - 1 - p.bottom, pins: { ...p, bottom: p.bottom + 1 } };
  return { to, pins: p };
}
function pinColumn(pins, columns, column, pin) {
  const zone = columnZone(pins, columns, column);
  if (zone === pin) return { to: column, pins };
  let p = pins;
  let to = column;
  if (zone === "left") {
    to = pins.left - 1;
    p = { ...p, left: p.left - 1 };
  } else if (zone === "right") {
    to = columns - pins.right;
    p = { ...p, right: p.right - 1 };
  }
  if (pin === "left") return { to: p.left, pins: { ...p, left: p.left + 1 } };
  if (pin === "right") return { to: columns - 1 - p.right, pins: { ...p, right: p.right + 1 } };
  return { to, pins: p };
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
function insertRow(table, at, cells) {
  const rows = [...table.rows];
  rows.splice(Math.max(1, Math.min(at, rows.length)), 0, cells ? { cells: [...cells] } : emptyRow(table.align.length));
  return withRows(table, rows);
}
function deleteRow(table, row) {
  if (row < 1 || row >= table.rows.length) return table;
  return withRows(
    table,
    table.rows.filter((_, i) => i !== row)
  );
}
function reorderRows(table, order) {
  const body = order.map((i) => table.rows[i]).filter((r) => !!r);
  if (body.length !== table.rows.length - 1) return table;
  return withRows(table, [table.rows[0], ...body]);
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
var STICKY_GAP = 38;
var BAR_GAP = 10;
var STORE_SORT_DELAY_MS = 400;
var INDEX_SETTLE_MS = 500;
var AUTOSCROLL_DEAD_ZONE = 12;
var MOVE_KEYS = /* @__PURE__ */ new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
var NAVIGATION_KEYS = /* @__PURE__ */ new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown"
]);
var PAGE_ROWS = 10;
var FILTER_HINT = "Text to find. Also: >10 <10 >=10 <=10 (numbers), /pattern/ (regular expression; /pattern/c is case-sensitive), =text (whole cell), !filter (not)";
var NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";
var MOVE_BLOCKED = "Clear sorting and filters to move rows";
var PIN_NEEDS_METADATA = "Pinning is stored in the table: turn on the Store table metadata setting (unpinning always works)";
function placeAtEnd(parent, rows) {
  let next = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const tr = rows[i];
    if (tr.parentElement !== parent || tr.nextSibling !== next) parent.insertBefore(tr, next);
    next = tr;
  }
}
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
  filterOptions = DEFAULT_FILTER_OPTIONS;
  // The maximum table height setting, in pixels; 0: no limit
  maxHeight = 0;
  // The metadata setting, for menus that offer pinning
  metadataOn = false;
  // The selectOnClick setting: a plain click selects the cell's text
  selectOnClick = false;
  // Sideways scroll of each wide table, carried over to its next rendering
  scrollLefts = /* @__PURE__ */ new Map();
  // The same for tables taller than the maximum height setting, scrolled inside
  scrollTops = /* @__PURE__ */ new Map();
  // Editor cursor positions set before table edits (see placeHistoryMarker)
  historyMarkers = /* @__PURE__ */ new Set();
  editor;
  pendingFocus;
  hoverWidget;
  hoverCell;
  handleTarget;
  menu;
  dragging = false;
  stopAutoscroll;
  hideTimer;
  scanQueued = false;
  // Set by stop(): work already scheduled then does nothing
  stopped = false;
  // Rows are being rearranged: a cell editor losing its focus to that is not left
  movingRows = false;
  settingsTimer;
  settingsReadAt = 0;
  expressionTimer;
  sortTimers = /* @__PURE__ */ new Map();
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
    win.addEventListener("blur", this.onBlur);
    this.doc.addEventListener("mousemove", this.onMouseMove, { passive: true });
    this.rowGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "column"));
    this.addRow.addEventListener("click", () => this.appendRow());
    this.addColumn.addEventListener("click", () => this.appendColumn());
    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    void this.scan();
    void this.refreshSettings();
  }
  /** Detaches from the page: listeners, observer and floating controls */
  stop() {
    this.stopped = true;
    const win = this.doc.defaultView;
    win.removeEventListener("mousedown", this.onMouseDown, true);
    win.removeEventListener("click", this.onClick, true);
    win.removeEventListener("dblclick", this.onDoubleClick, true);
    win.removeEventListener("scroll", this.onScroll, true);
    win.removeEventListener("keydown", this.onKeyDown, true);
    win.removeEventListener("keyup", this.onKeyUp, true);
    win.removeEventListener("blur", this.onBlur);
    this.doc.removeEventListener("mousemove", this.onMouseMove);
    this.observer?.disconnect();
    clearTimeout(this.settingsTimer);
    clearTimeout(this.expressionTimer);
    for (const timer of this.sortTimers.values()) clearTimeout(timer);
    this.stopAutoscroll?.();
    this.closeMenu(false);
    for (const el of [this.bar, this.rowGrip, this.columnGrip, this.addRow, this.addColumn]) el.remove();
  }
  onBlur = () => this.setNavigating(false);
  /** Refreshes the settings at most once a second, the last request always served */
  queueSettingsRefresh() {
    if (this.settingsTimer !== void 0) return;
    const wait = Math.max(0, this.settingsReadAt + 1e3 - Date.now());
    this.settingsTimer = setTimeout(() => {
      this.settingsTimer = void 0;
      this.settingsReadAt = Date.now();
      if (!this.stopped) void this.refreshSettings();
    }, wait);
  }
  /**
   * Whether settings may be stored in this table: the metadata setting is on,
   * or the table already has a metadata row (which keeps being used and
   * updated with the setting off, until it is empty or removed).
   */
  async metadataAllowed(info) {
    return info.metaRow || await this.setting("metadata");
  }
  /** Asks before a destructive change, with SilverBullet's dialog (else the browser's) */
  async ask(question) {
    return this.bridge.confirm ? await this.bridge.confirm(question, { destructive: true }) : this.doc.defaultView.confirm(question);
  }
  /**
   * Sorts the rows in the markdown as the view sorts them (the shown values;
   * rows a filter hides too, pinned rows staying where they are), once
   * confirmed, then ends the sorting view: the table now is in that order.
   */
  async applySort(shownWidget, shownInfo) {
    const view = this.viewOf(shownInfo);
    if (!view.sort) return;
    const name = cellText(shownInfo.table.rows[0].cells[view.sort.column]) || `column ${view.sort.column + 1}`;
    const arrow = view.sort.direction === "asc" ? "\u2191" : "\u2193";
    const question = `Sort the rows in the markdown by ${name} ${arrow}? This changes the order of the rows in the file. Ctrl+Z brings it back.`;
    if (!await this.ask(question)) return;
    clearTimeout(this.sortTimers.get(shownInfo.key));
    this.sortTimers.delete(shownInfo.key);
    const [widget, info] = this.current(shownWidget, shownInfo);
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellText));
    const { top, bottom } = info.pins;
    const middle = visibleRows(values, withPins({ ...view, filters: [] }, info.pins), this.filterOptions);
    const order = [
      ...rows.slice(0, top).map((_, i) => i + 1),
      ...middle.map((i) => i + 1),
      ...rows.slice(rows.length - bottom).map((_, i) => rows.length - bottom + i + 1)
    ];
    this.views.set(info.key, withoutSort(view));
    await this.write(widget, (t) => withMetaSort(reorderRows(t, order), void 0));
    this.focusEditor(widget);
  }
  /** Removes a table's metadata row, once confirmed; its sorting stays as a view until reload */
  async removeMetadata(shownWidget, shownInfo) {
    if (!await this.ask("Remove this table's metadata? Ctrl+Z brings it back.")) return;
    const [widget] = this.current(shownWidget, shownInfo);
    await this.write(widget, (t) => {
      const { meta: _meta, metaSource: _source, ...rest } = t;
      return rest;
    });
    this.focusEditor(widget);
  }
  /**
   * The table as rendered now: a write (e.g. of a stored sorting) re-renders
   * it, so controls made for the earlier rendering look it up when used
   */
  current(widget, info) {
    const now = this.widgetForKey(info.key);
    const nowInfo = now && this.infos.get(now);
    return now && nowInfo ? [now, nowInfo] : [widget, info];
  }
  /** Removes the metadata rows of all tables on the current page, once confirmed */
  async removeAllMetadata() {
    const text = await this.bridge.getText();
    const tables = findTables(text).filter((range) => parseTable(range.text).meta !== void 0).reverse();
    if (tables.length === 0) {
      void this.bridge.flash("Table Plus: no table on this page has metadata", "info");
      return;
    }
    const question = `Remove the metadata of all ${tables.length} table${tables.length === 1 ? "" : "s"} on this page? Ctrl+Z brings it back.`;
    if (!await this.ask(question)) return;
    const from = tables[tables.length - 1].from;
    const to = tables[0].to;
    let span = text.slice(from, to);
    for (const range of tables) {
      const { meta: _meta, metaSource: _source, ...rest } = parseTable(range.text);
      span = span.slice(0, range.from - from) + serializeTable(rest) + span.slice(range.to - from);
    }
    const edit = minimalEdit(text.slice(from, to), span);
    await this.bridge.replaceRange(from + edit.from, from + edit.to, edit.insert);
    this.doc.querySelector(EDITOR_SELECTOR)?.focus({ preventScroll: true });
    void this.bridge.flash(`Table Plus: removed the metadata of ${tables.length} table(s)`, "info");
  }
  /** Re-reads settings the view depends on, and re-applies the views if they changed */
  async refreshSettings() {
    const smart = await this.setting("smartFilters") === true;
    const maxHeight = await this.setting("maxHeight");
    this.metadataOn = await this.setting("metadata");
    this.selectOnClick = await this.setting("selectOnClick");
    if (this.stopped || smart === this.filterOptions.smart && maxHeight === this.maxHeight) return;
    this.filterOptions = { smart };
    this.maxHeight = maxHeight;
    for (const widget of Array.from(this.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info && renderedTable(widget) === info.table) this.applyView(widget, info);
    }
    this.queueStickyUpdate();
  }
  rearranged(info) {
    return isRearranged(this.viewOf(info), this.filterOptions);
  }
  // ---- discovering rendered tables --------------------------------------
  queueScan() {
    if (this.scanQueued) return;
    this.scanQueued = true;
    const run = () => {
      this.scanQueued = false;
      void this.scan();
      this.queueSettingsRefresh();
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }
  /** Enhances every rendered table that is not enhanced yet */
  scan() {
    if (this.stopped) return Promise.resolve();
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
      if (this.stopped || renderedTable(widget) !== table) return;
      const range = locateByShape(text, hint, shape);
      if (!range) {
        const broken = locateWithEmptyHeaders(text, hint, shape);
        if (broken) this.offerHeaderFix(widget, broken.text, broken.from);
        this.markUnsupported(widget, false);
        return;
      }
      const page = await this.bridge.getCurrentPage();
      if (this.stopped || renderedTable(widget) !== table) return;
      const model = parseTable(range.text);
      const info = {
        table,
        source: range.text,
        hint: range.from,
        key: `${page}#${range.ordinal}`,
        columns: shape.columns,
        metaRow: model.meta !== void 0,
        rows: model.rows.length,
        pins: metaPins(model)
      };
      const stored = metaSort(model);
      if (stored && !this.views.has(info.key)) this.views.set(info.key, withSort(DEFAULT_VIEW, stored.column, stored.direction));
      const replaced = this.hoverWidget && !this.hoverWidget.isConnected && this.infos.get(this.hoverWidget)?.key === info.key;
      this.infos.set(widget, info);
      if (replaced) this.hoverWidget = widget;
      this.decorate(widget, info);
      this.applyView(widget, info);
      const scrollLeft = this.scrollLefts.get(info.key);
      if (scrollLeft) widget.scrollLeft = scrollLeft;
      const scrollTop = this.scrollTops.get(info.key);
      if (scrollTop) widget.scrollTop = scrollTop;
      this.takePendingFocus(widget, info);
      this.queueStickyUpdate();
      void this.refreshSettings();
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
    const metaRow2 = info.metaRow ? rows.pop() : void 0;
    metaRow2?.classList.add("tp-meta-row");
    const mark = (icon, title) => {
      const span = this.doc.createElement("span");
      span.className = `${UI_CLASS} tp-pin-mark`;
      span.title = title;
      span.innerHTML = icon;
      return span;
    };
    const { top, bottom, left, right } = info.pins;
    rows.slice(1).forEach((tr, i) => {
      const row = i + 1;
      tr.dataset.tpRow = String(row);
      if (row <= top) tr.cells[0]?.append(mark(ICONS.pinTop, "Pinned to the top"));
      else if (row > rows.length - 1 - bottom) tr.cells[0]?.append(mark(ICONS.pinBottom, "Pinned to the bottom"));
    });
    Array.from(rows[0].cells).forEach((cell, column) => {
      if (column < left) cell.append(mark(ICONS.pinLeft, "Pinned to the left"));
      else if (column >= info.columns - right) cell.append(mark(ICONS.pinRight, "Pinned to the right"));
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
  /**
   * A view change that may change the sorting. With the metadata setting on,
   * the sorting is also stored in the table, so it is the table's view next time.
   */
  setSort(widget, info, view) {
    this.setView(widget, info, view);
    clearTimeout(this.sortTimers.get(info.key));
    this.sortTimers.set(
      info.key,
      setTimeout(() => {
        this.sortTimers.delete(info.key);
        void this.storeSort(info.key);
      }, STORE_SORT_DELAY_MS)
    );
  }
  async storeSort(key) {
    const widget = this.widgetForKey(key);
    const info = widget && this.infos.get(widget);
    if (this.stopped || !widget || !info || !await this.metadataAllowed(info)) return;
    const view = this.views.get(key) ?? DEFAULT_VIEW;
    const sort = view.sort ? { column: view.sort.column, direction: view.sort.direction } : void 0;
    await this.write(widget, (t) => withMetaSort(t, sort));
  }
  /** The rendered table a view key belongs to, if it is enhanced and on screen */
  widgetForKey(key) {
    for (const widget of Array.from(this.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info?.key === key && renderedTable(widget) === info.table) return widget;
    }
    return void 0;
  }
  bodyRows(info) {
    return Array.from(info.table.querySelectorAll("tr[data-tp-row]")).sort(
      (a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow)
    );
  }
  applyView(widget, info) {
    const view = this.viewOf(info);
    const { top, bottom } = info.pins;
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellText));
    const order = visibleRows(values, withPins(view, info.pins), this.filterOptions);
    const shown = new Set(order);
    const body = info.table.tBodies[0] ?? info.table;
    rows.forEach((tr, i) => {
      const pinned = i < top || i >= rows.length - bottom;
      tr.classList.toggle("tp-hidden", !pinned && !shown.has(i));
    });
    const metaRow2 = info.table.querySelector("tr.tp-meta-row");
    const middle = rows.filter((_, i) => i >= top && i < rows.length - bottom);
    const bodyRows = [
      ...order.map((i) => rows[i]),
      ...middle.filter((tr) => tr.classList.contains("tp-hidden")),
      ...metaRow2 ? [metaRow2] : []
    ];
    const editing = this.editor?.widget === widget ? this.editor : void 0;
    const selection = editing && [editing.field.selectionStart, editing.field.selectionEnd];
    this.movingRows = true;
    try {
      const head = info.table.tHead;
      if (head) placeAtEnd(head, rows.slice(0, top));
      placeAtEnd(body, bodyRows);
      if (bottom > 0) placeAtEnd(info.table.tFoot ?? info.table.createTFoot(), rows.slice(rows.length - bottom));
    } finally {
      this.movingRows = false;
    }
    if (editing && this.editor === editing && this.doc.activeElement !== editing.field) {
      editing.field.focus({ preventScroll: true });
      if (selection) editing.field.setSelectionRange(selection[0] ?? null, selection[1] ?? null);
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
    this.pinColumns(info);
    widget.classList.toggle("tp-rearranged", isRearranged(view, this.filterOptions));
    widget.style.maxHeight = this.maxHeight > 0 ? `${this.maxHeight}px` : "";
    if (this.hoverWidget === widget) this.showTableControls(widget, info);
  }
  /**
   * Columns pinned to the left (right) stay at that edge while the table
   * scrolls sideways: CSS sticky, offset by the widths of the pinned columns
   * further out.
   */
  pinColumns(info) {
    for (const cell of Array.from(info.table.querySelectorAll(".tp-pin-left, .tp-pin-right"))) {
      cell.classList.remove("tp-pin-left", "tp-pin-right", "tp-pin-edge");
      cell.style.left = "";
      cell.style.right = "";
    }
    const { left, right } = info.pins;
    if (left + right === 0) return;
    const header = info.table.rows[0];
    const rows = Array.from(info.table.rows).filter((tr) => !tr.classList.contains("tp-meta-row"));
    const pin = (column, side, offset2, edge) => {
      for (const tr of rows) {
        const cell = tr.cells[column];
        if (!cell) continue;
        cell.classList.add(side === "left" ? "tp-pin-left" : "tp-pin-right");
        cell.classList.toggle("tp-pin-edge", edge);
        cell.style[side] = `${offset2}px`;
      }
    };
    let offset = 0;
    for (let c = 0; c < left; c++) {
      pin(c, "left", offset, c === left - 1);
      offset += header.cells[c]?.getBoundingClientRect().width ?? 0;
    }
    offset = 0;
    for (let c = info.columns - 1; c >= info.columns - right; c--) {
      pin(c, "right", offset, c === info.columns - right);
      offset += header.cells[c]?.getBoundingClientRect().width ?? 0;
    }
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
          void this.refreshSettings();
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
      const { error } = parseFilter(input.value, this.filterOptions);
      input.classList.toggle("tp-invalid", !!error);
      input.title = error ?? (this.filterOptions.smart ? FILTER_HINT : "Text to find");
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
    const row = cell.parentElement?.classList;
    return row?.contains("tp-filter-row") || row?.contains("tp-meta-row") ? void 0 : cell;
  }
  onMouseDown = (e) => {
    const target = e.target instanceof Node ? e.target : null;
    if (this.stopAutoscroll) {
      e.preventDefault();
      e.stopPropagation();
      this.stopAutoscroll();
      this.swallowNextClick();
      return;
    }
    if (this.menu && target && !this.isFloating(target)) this.closeMenu(false);
    if (e.button === 1) this.onMiddleMouseDown(e);
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
    const select = e.shiftKey !== this.selectOnClick;
    if (this.editor) void this.finishEditing(true, { widget, ...ref, select });
    else this.openEditor(widget, info, cell, select);
  };
  /**
   * Middle-button autoscroll over a table that scrolls sideways. The browser's
   * own autoscroll locks onto one scrolling box, so it moves either the table
   * sideways or the page up and down; this one moves both. Hold and drag, or
   * click and move; the next click, key or wheel turn ends it.
   */
  onMiddleMouseDown(e) {
    const hit = this.enhancedWidgetOf(e.target);
    const widget = hit?.[0];
    const scrollsSideways = !!widget && widget.scrollWidth > widget.clientWidth;
    if (!widget || e.target.closest("a") || !scrollsSideways && !this.scrollsInside(widget)) return;
    e.preventDefault();
    e.stopPropagation();
    const win = this.doc.defaultView;
    const page = this.scrollParentOf(widget) ?? this.doc.scrollingElement;
    const origin = { x: e.clientX, y: e.clientY };
    const pointer = { ...origin };
    let held = false;
    let carry = { x: 0, y: 0 };
    const marker = this.floating("div", "tp-autoscroll tp-visible");
    marker.style.left = `${origin.x - 12}px`;
    marker.style.top = `${origin.y - 12}px`;
    this.doc.body.classList.add("tp-autoscrolling");
    const speed = (d) => {
      const beyond = Math.abs(d) - AUTOSCROLL_DEAD_ZONE;
      return beyond > 0 ? Math.sign(d) * (beyond / 16) ** 1.3 : 0;
    };
    let frame = 0;
    const tick = () => {
      carry = { x: carry.x + speed(pointer.x - origin.x), y: carry.y + speed(pointer.y - origin.y) };
      const dx = Math.trunc(carry.x);
      const dy = Math.trunc(carry.y);
      carry = { x: carry.x - dx, y: carry.y - dy };
      if (dx) widget.scrollLeft += dx;
      if (dy) {
        const before = widget.scrollTop;
        widget.scrollTop += dy;
        const rest = dy - (widget.scrollTop - before);
        if (rest && page) page.scrollTop += rest;
      }
      frame = win.requestAnimationFrame(tick);
    };
    const move = (ev) => {
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      if (Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > AUTOSCROLL_DEAD_ZONE) held = true;
    };
    const up = (ev) => {
      if (ev.button === 1 && held) stop();
    };
    const end = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      stop();
    };
    const stop = () => {
      win.cancelAnimationFrame(frame);
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      win.removeEventListener("keydown", end, true);
      win.removeEventListener("wheel", end, true);
      marker.remove();
      this.doc.body.classList.remove("tp-autoscrolling");
      this.stopAutoscroll = void 0;
    };
    this.stopAutoscroll = stop;
    setTimeout(() => {
      if (this.stopAutoscroll !== stop) return;
      win.addEventListener("mousemove", move, true);
      win.addEventListener("mouseup", up, true);
      win.addEventListener("keydown", end, true);
      win.addEventListener("wheel", end, { capture: true, passive: false });
    }, 0);
    frame = win.requestAnimationFrame(tick);
  }
  swallowNextClick() {
    const win = this.doc.defaultView;
    const swallow = (e) => {
      e.preventDefault();
      e.stopPropagation();
      clear();
    };
    const clear = () => {
      win.removeEventListener("click", swallow, true);
      win.removeEventListener("auxclick", swallow, true);
    };
    win.addEventListener("click", swallow, true);
    win.addEventListener("auxclick", swallow, true);
    setTimeout(clear, 500);
  }
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
      this.setSort(widget, info, cycleSort(this.viewOf(info), Number(action.dataset.tpColumn)));
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
    if (scrolled && e.target instanceof HTMLElement) {
      this.scrollLefts.set(scrolled.key, e.target.scrollLeft);
      this.scrollTops.set(scrolled.key, e.target.scrollTop);
    }
  };
  /**
   * Keeps the toolbar, grips and an open menu on what they belong to while the
   * page or the table scrolls; hides them only once that is out of view
   */
  followScroll() {
    if (this.dragging) return;
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info || renderedTable(widget) !== info.table || !this.isShown(widget, info, info.table)) {
      this.closeMenu(false);
      this.hideFloating();
      return;
    }
    this.showTableControls(widget, info);
    const cell = this.hoverCell;
    if (cell && cell.isConnected && this.isShown(widget, info, cell)) this.showHandles(widget, info, cell);
    else {
      this.closeMenu(false);
      this.hideHandles();
    }
    if (this.menu) this.positionMenu();
  }
  /** Whether any of the element is in view: inside the page's scroll view and the table's sideways view */
  isShown(widget, info, element) {
    const rect = element.getBoundingClientRect();
    const view = this.scrollParentOf(widget)?.getBoundingClientRect();
    const box = this.innerBox(widget);
    const head = info.table.tHead;
    const top = Math.max(
      view?.top ?? 0,
      box.top,
      head && element.closest("tbody") ? head.getBoundingClientRect().bottom : -Infinity
    );
    const bottom = Math.min(view?.bottom ?? this.doc.defaultView.innerHeight, box.bottom);
    return rect.bottom > top && rect.top < bottom && rect.right > box.left && rect.left < box.right;
  }
  // ---- sticky header -----------------------------------------------------
  queueStickyUpdate() {
    if (this.stickyQueued) return;
    this.stickyQueued = true;
    const run = () => {
      this.stickyQueued = false;
      if (this.stopped) return;
      this.updateStickyHeaders();
      this.followScroll();
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
      const pageTop = (this.scrollParentOf(widget)?.getBoundingClientRect().top ?? 0) + STICKY_GAP;
      const boxTop = this.scrollsInside(widget) ? this.innerBox(widget).top : -Infinity;
      const table = info.table.getBoundingClientRect();
      const foot = info.table.tFoot;
      const footHeight = foot?.offsetHeight ?? 0;
      let footTop = table.bottom - footHeight;
      if (foot && footHeight > 0) {
        const pageBottom = this.scrollParentOf(widget)?.getBoundingClientRect().bottom ?? this.doc.defaultView.innerHeight;
        const boxBottom = this.scrollsInside(widget) ? this.innerBox(widget).bottom : Infinity;
        const lift = Math.min(
          0,
          Math.max(Math.min(pageBottom, boxBottom) - table.bottom, -(table.height - head.offsetHeight - footHeight))
        );
        foot.style.transform = lift < 0 ? `translateY(${lift}px)` : "";
        foot.classList.toggle("tp-stuck", lift < 0);
        footTop += lift;
      }
      const offset = Math.max(0, Math.min(Math.max(pageTop, boxTop), footTop - head.offsetHeight) - table.top);
      head.style.transform = offset > 0 ? `translateY(${offset}px)` : "";
      head.classList.toggle("tp-stuck", offset > 0);
    }
  }
  /** Where the table's box shows its content: without its border and scrollbars */
  innerBox(widget) {
    const rect = widget.getBoundingClientRect();
    const left = rect.left + widget.clientLeft;
    const top = rect.top + widget.clientTop;
    const width = widget.clientWidth || rect.width;
    const height = widget.clientHeight || rect.height;
    return { left, right: left + width, top, bottom: top + height };
  }
  /** Whether a table is taller than its box (the maximum height setting) and scrolls inside it */
  scrollsInside(widget) {
    return widget.scrollHeight > widget.clientHeight + 1;
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
      return;
    }
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = e.key.toLowerCase();
    const step = mod && key === "z" ? e.shiftKey ? "redo" : "undo" : mod && key === "y" && !e.shiftKey ? "redo" : void 0;
    const inEditor = e.target instanceof Element && !!e.target.closest(EDITOR_SELECTOR);
    if (step && inEditor && this.bridge[step] && this.bridge.getCursor) {
      e.preventDefault();
      e.stopPropagation();
      void this.historyStep(step);
    }
  };
  // ---- undo / redo of table edits ----------------------------------------
  /**
   * Undo moves the editor's cursor back to where it was before an edit and
   * scrolls to it. Table Plus edits away from that cursor, so before each edit
   * it puts the cursor right after the table (outside it, so the table stays
   * rendered) and remembers that position: an undo or redo that lands there
   * undid a table edit, and the page is scrolled back to where it was.
   */
  async placeHistoryMarker(text, from, to) {
    if (!this.bridge.setSelection) return void 0;
    const marker = to < text.length ? to + 1 : from > 0 ? from - 1 : void 0;
    if (marker === void 0) return void 0;
    await this.bridge.setSelection(marker, marker);
    this.historyMarkers.add(marker);
    if (this.historyMarkers.size > 500) this.historyMarkers.delete(this.historyMarkers.values().next().value);
    return marker;
  }
  async historyStep(step) {
    const editor = this.doc.querySelector(EDITOR_SELECTOR);
    const scroller = editor && this.scrollParentOf(editor);
    const top = scroller?.scrollTop;
    await this.bridge[step]();
    const cursor = await this.bridge.getCursor();
    if (!scroller || top === void 0 || !this.historyMarkers.has(cursor)) return;
    const restore = () => {
      scroller.scrollTop = top;
    };
    const win = this.doc.defaultView;
    restore();
    if (!win.requestAnimationFrame) return;
    win.requestAnimationFrame(() => {
      restore();
      win.requestAnimationFrame(restore);
    });
  }
  onKeyUp = (e) => {
    if (e.key === "Control") this.setNavigating(false);
  };
  // While Ctrl is held in a cell editor, arrows move between cells: the pointer shows it
  setNavigating(on) {
    this.doc.body.classList.toggle("tp-navigating", on);
  }
  onMouseMove = (e) => {
    if (this.dragging || this.menu || e.buttons !== 0) return;
    const target = e.target;
    if (target instanceof Node && this.isFloating(target)) {
      this.cancelHide();
      return;
    }
    const hit = this.enhancedWidgetOf(target);
    if (!hit) {
      if (!this.overScrollbar(e)) this.scheduleHide();
      return;
    }
    const [widget, info] = hit;
    this.cancelHide();
    if (this.hoverWidget !== widget) {
      this.hoverWidget = widget;
      this.showTableControls(widget, info);
    }
    if (this.editor) {
      this.hideHandles();
      return;
    }
    const cell = this.tableCellOf(info, target);
    if (cell && cell !== this.hoverCell) this.showHandles(widget, info, cell);
  };
  /** Whether the pointer is over the scrollbar of the element under it */
  overScrollbar(e) {
    const el = e.target;
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - el.clientLeft;
    const y = e.clientY - rect.top - el.clientTop;
    return el.clientWidth > 0 && x >= el.clientWidth || el.clientHeight > 0 && y >= el.clientHeight;
  }
  // ---- cell editing ------------------------------------------------------
  cellRef(info, cell) {
    const tr = cell.parentElement;
    if (!tr) return void 0;
    const row = tr === info.table.rows[0] ? 0 : Number(tr.dataset.tpRow);
    return Number.isInteger(row) ? { row, column: cell.cellIndex } : void 0;
  }
  // ---- `${…}` cells: re-evaluated once the page index is up to date --------
  /**
   * SilverBullet renders a table right after Table Plus writes it, before the
   * page is re-indexed, so a `${…}` cell that reads the index (e.g. a formula
   * from a spreadsheet library) shows a stale result until the table renders
   * again. Once the page is indexed, Table Plus has SilverBullet re-evaluate
   * such cells (lua.evalExpression) and shows the new values in place.
   * `page:index` is the event the indexers write the index on, not a signal
   * that they are done, so the evaluation waits a moment for them.
   */
  async pageIndexed(name) {
    if (this.stopped || !this.bridge.evalExpression) return;
    if (name !== await this.bridge.getCurrentPage()) return;
    clearTimeout(this.expressionTimer);
    this.expressionTimer = setTimeout(() => void this.refreshExpressions(), INDEX_SETTLE_MS);
  }
  async refreshExpressions() {
    for (const widget of Array.from(this.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (this.stopped || !info || !info.source.includes("${")) continue;
      const rows = parseTable(info.source).rows;
      let changed = false;
      for (let row = 0; row < rows.length; row++) {
        const cells = rows[row].cells;
        for (let column = 0; column < cells.length; column++) {
          const expression = /^\$\{([\s\S]+)\}$/.exec(cells[column].trim())?.[1];
          if (!expression) continue;
          let value;
          try {
            value = await this.bridge.evalExpression(expression.replaceAll("\\|", "|"));
          } catch {
            continue;
          }
          const text = value === null || value === void 0 ? "" : typeof value === "number" || typeof value === "string" || typeof value === "boolean" ? String(value) : void 0;
          const cell = this.cellAt(info, { row, column }, true);
          if (text === void 0 || !cell || cell === this.editor?.cell || renderedTable(widget) !== info.table) continue;
          if (cellText(cell) === text) continue;
          for (const node of Array.from(cell.childNodes)) {
            if (!(node instanceof Element && node.classList.contains(UI_CLASS))) node.remove();
          }
          cell.prepend(this.doc.createTextNode(text));
          changed = true;
        }
      }
      if (changed && renderedTable(widget) === info.table) this.applyView(widget, info);
    }
  }
  cellAt(info, ref, includeHidden = false) {
    const tr = ref.row === 0 ? info.table.rows[0] : info.table.querySelector(`tr[data-tp-row="${ref.row}"]`);
    if (!tr || tr.classList.contains("tp-hidden") && !includeHidden) return void 0;
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
      if (this.editor?.field === field && !this.movingRows) void this.finishEditing(true, void 0, false);
    });
    field.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Control") this.setNavigating(true);
      const ctrl = e.ctrlKey && !e.metaKey;
      if (ctrl && e.altKey && !e.shiftKey && MOVE_KEYS.has(e.key)) {
        e.preventDefault();
        void this.moveWithKeyboard(e.key);
      } else if (ctrl && !e.altKey && NAVIGATION_KEYS.has(e.key)) {
        e.preventDefault();
        void this.navigate(e.key, e.shiftKey);
      } else if (e.key === "Escape") {
        e.preventDefault();
        void this.finishEditing(false);
      } else if (e.key === "Enter" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        void this.ctrlEnter();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.enter(e.shiftKey);
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
      if (info && cell) this.openEditor(next.widget, info, cell, next.select);
      return;
    }
    if (!next && refocus) this.focusEditor(closed.widget);
  }
  withCellEdit(table, edit) {
    if ((table.rows[edit.row]?.cells[edit.column] ?? "") !== edit.original) return void 0;
    return setCell(table, edit.row, edit.column, edit.value);
  }
  /** A setting's value, falling back to its default when unset or not valid */
  async setting(name) {
    const { path, parse } = SETTINGS[name];
    const fallback = SETTINGS[name].default;
    try {
      const value = parse(
        await this.bridge.getConfig?.(path, fallback)
      );
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }
  /**
   * Enter saves the cell. With the "moveDown" setting it then edits
   * the cell below (Shift+Enter: above), as in a spreadsheet; at the table's
   * edge it just saves.
   */
  /**
   * Ctrl+Enter: save the cell, add an empty row below its row and edit the
   * new row in the same column, as one edit. The ctrlEnterAddsRow setting off:
   * a plain Enter.
   */
  async ctrlEnter() {
    const active = this.editor;
    if (!active) return;
    if (!await this.setting("ctrlEnterAddsRow") || this.editor !== active) {
      if (this.editor === active) await this.enter(false);
      return;
    }
    const info = this.infos.get(active.widget);
    const closed = this.closeEditor();
    if (info) await this.insertRowWith(closed.widget, info, closed.row + 1, closed.column, (t) => this.withSaved(t, closed));
  }
  /** The table with the closed editor's value saved, if it changed */
  withSaved(table, closed) {
    return closed.value !== closed.original ? this.withCellEdit(table, closed) : table;
  }
  /**
   * Whether a cell reached with the keyboard opens with its text selected:
   * with Shift as on a Shift+click (the selectOnClick setting swaps that),
   * without it with the cursor at the end
   */
  selectsWith(shift) {
    return shift && !this.selectOnClick;
  }
  /** Enter: save; with the moveDown setting also edit the cell below (Shift: as on a Shift+click) */
  async enter(shift) {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    if (await this.setting("enterKey") !== "moveDown" || this.editor !== active) {
      if (this.editor === active) await this.finishEditing(true);
      return;
    }
    const shown = this.shownRows(info);
    const target = shown[shown.indexOf(active.cell.parentElement) + 1];
    const cell = target?.cells[active.column];
    const ref = cell && this.cellRef(info, cell);
    await this.finishEditing(true, ref ? { widget: active.widget, ...ref, select: this.selectsWith(shift) } : void 0);
  }
  /** The header row and the shown body rows, in display order */
  shownRows(info) {
    return [
      info.table.rows[0],
      ...Array.from(info.table.querySelectorAll("tr[data-tp-row]:not(.tp-hidden)"))
    ];
  }
  /**
   * Ctrl+Alt+arrows: move the edited cell's row up / down, or its column
   * left / right; Ctrl+Alt+Home / End: its column to the first / last place;
   * Ctrl+Alt+PageUp / PageDown: its row 10 places up / down.
   * The cell is saved in the same edit and the editor stays on it. Rows cannot
   * move while sorted or filtered, nor the header row.
   */
  async moveWithKeyboard(key) {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const vertical = key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown";
    const step = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
    const from = vertical ? active.row : active.column;
    const asked = key === "Home" ? 0 : key === "End" ? info.columns - 1 : key === "PageUp" ? from - PAGE_ROWS : key === "PageDown" ? from + PAGE_ROWS : from + step;
    if (vertical) {
      if (from === 0) return;
      if (this.rearranged(info)) {
        void this.bridge.flash(`Table Plus: ${MOVE_BLOCKED.toLowerCase()}`, "info");
        return;
      }
    }
    const to = vertical ? clampRowMove(info.pins, info.rows, from, asked) : clampColumnMove(info.pins, info.columns, from, asked);
    if (to === from) return;
    const closed = this.closeEditor();
    await this.write(
      closed.widget,
      (t) => {
        const edited = this.withSaved(t, closed);
        if (!edited) return void 0;
        return vertical ? moveRow(edited, from, to) : moveColumn(edited, from, to);
      },
      vertical ? { row: to, column: closed.column } : { row: closed.row, column: to },
      vertical ? void 0 : (c) => columnAfterMove(c, from, to)
    );
  }
  /**
   * Ctrl+arrows: save and edit the neighbouring shown cell; Ctrl+Home / End:
   * the first / last cell of the row. Nothing happens at the table's edge.
   * With Shift the cell opens as on a Shift+click.
   */
  async navigate(key, shift) {
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
    else if (key === "PageUp") r = r === 0 ? 0 : Math.max(1, r - PAGE_ROWS);
    else if (key === "PageDown") r = Math.min(shown.length - 1, r + PAGE_ROWS);
    const target = shown[r]?.cells[column];
    if (!target || target === active.cell) return;
    const ref = this.cellRef(info, target);
    if (ref) await this.finishEditing(true, { widget: active.widget, ...ref, select: this.selectsWith(shift) });
  }
  /** Tab / Shift+Tab: save and move to the next / previous shown cell */
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
    await this.insertRowWith(closed.widget, info, appendRowAt(info.pins, info.rows), 0, (t) => this.withSaved(t, closed));
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
    const box = this.innerBox(widget);
    let rect = cell.getBoundingClientRect();
    if (rect.right > box.right) widget.scrollLeft += rect.right - box.right;
    else if (rect.left < box.left) widget.scrollLeft -= box.left - rect.left;
    const head = this.infos.get(widget)?.table.tHead;
    const headHeight = head && !head.contains(cell) ? head.offsetHeight : 0;
    if (this.scrollsInside(widget)) {
      rect = cell.getBoundingClientRect();
      if (rect.top < box.top + headHeight) widget.scrollTop -= box.top + headHeight - rect.top;
      else if (rect.bottom > box.bottom) widget.scrollTop += rect.bottom - box.bottom;
    }
    const scroller = this.scrollParentOf(widget);
    if (!scroller) return;
    rect = cell.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const top = view.top + (headHeight ? STICKY_GAP + headHeight : 0);
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
  async write(widget, change, focus, columnMap, pins) {
    const info = this.infos.get(widget);
    if (!info) return "failed";
    try {
      const text = await this.bridge.getText();
      const range = locateBySource(text, info.hint, info.source);
      const before = range && parseTable(range.text);
      const edited = before && change(before);
      if (!range || !before || !edited) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      const followed = followMetaSort(before, edited, columnMap ?? ((c) => c));
      const changed = pins ? withMetaPins(followed, pins) : followed;
      const format = await this.setting("autoFormat");
      const markdown = serializeTable(format ? { ...changed, padded: true } : changed);
      if (markdown === range.text) return "unchanged";
      if (columnMap) this.views.set(info.key, remapColumns(this.viewOf(info), columnMap));
      if (focus) this.pendingFocus = { key: info.key, ...focus, until: Date.now() + 3e3 };
      this.scrollLefts.set(info.key, widget.scrollLeft);
      this.scrollTops.set(info.key, widget.scrollTop);
      const edit = minimalEdit(range.text, markdown);
      const marker = await this.placeHistoryMarker(text, range.from, range.to);
      await this.bridge.replaceRange(range.from + edit.from, range.from + edit.to, edit.insert);
      if (marker !== void 0) {
        this.historyMarkers.add(marker + (marker > range.from + edit.from ? markdown.length - range.text.length : 0));
      }
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
    void this.insertRowWith(widget, info, appendRowAt(info.pins, info.rows), this.firstVisibleColumn(widget, info));
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
    void this.insertColumnWith(widget, info, appendColumnAt(info.pins, info.columns));
  }
  // ---- structural edits: pinned rows and columns keep the edges -------------
  /** Adds a row asked for at `at` (see insertRowAt) and edits it in `column` */
  insertRowWith(widget, info, at, column, prepare = (t) => t) {
    const insert = insertRowAt(info.pins, info.rows, at);
    return this.write(
      widget,
      (t) => {
        const prepared = prepare(t);
        return prepared && insertRow(prepared, insert.at);
      },
      { row: insert.at, column },
      void 0,
      insert.pins
    );
  }
  duplicateRowAt(widget, info, row) {
    const insert = insertRowAt(info.pins, info.rows, row + 1);
    return this.write(
      widget,
      (t) => {
        const cells = t.rows[row]?.cells;
        return cells ? insertRow(t, insert.at, cells) : void 0;
      },
      void 0,
      void 0,
      insert.pins
    );
  }
  deleteRowAt(widget, info, row) {
    return this.write(widget, (t) => deleteRow(t, row), void 0, void 0, deleteRowPins(info.pins, info.rows, row));
  }
  /** Moves a row, within its zone when pinned, outside the zones when not */
  moveRowTo(widget, info, from, asked) {
    const to = clampRowMove(info.pins, info.rows, from, asked);
    if (to === from) return Promise.resolve("unchanged");
    return this.write(widget, (t) => moveRow(t, from, to));
  }
  insertColumnWith(widget, info, at) {
    const insert = insertColumnAt(info.pins, info.columns, at);
    return this.write(
      widget,
      (t) => insertColumn(t, insert.at),
      { row: 0, column: insert.at, select: true },
      (c) => c >= insert.at ? c + 1 : c,
      insert.pins
    );
  }
  deleteColumnAt(widget, info, column) {
    return this.write(
      widget,
      (t) => deleteColumn(t, column),
      void 0,
      (c) => c === column ? void 0 : c > column ? c - 1 : c,
      deleteColumnPins(info.pins, info.columns, column)
    );
  }
  moveColumnTo(widget, info, from, asked) {
    const to = clampColumnMove(info.pins, info.columns, from, asked);
    if (to === from) return Promise.resolve("unchanged");
    return this.write(widget, (t) => moveColumn(t, from, to), void 0, (c) => columnAfterMove(c, from, to));
  }
  /** Pins a row to the top or bottom (moving it there), or unpins it; pinning needs the metadata setting */
  async pinRowAt(widget, info, row, pin) {
    if (pin && !await this.setting("metadata")) return;
    const { to, pins } = pinRow(info.pins, info.rows, row, pin);
    await this.write(widget, (t) => moveRow(t, row, to), void 0, void 0, pins);
  }
  async pinColumnAt(widget, info, column, pin) {
    if (pin && !await this.setting("metadata")) return;
    const { to, pins } = pinColumn(info.pins, info.columns, column, pin);
    await this.write(widget, (t) => moveColumn(t, column, to), void 0, (c) => columnAfterMove(c, column, to), pins);
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
        const [w, i] = this.current(widget, info);
        this.setSort(w, i, withoutSort(this.viewOf(i)));
      });
      const apply = this.doc.createElement("button");
      apply.type = "button";
      apply.tabIndex = -1;
      apply.className = "tp-chip-apply";
      apply.title = "Sort the rows in the markdown this way";
      apply.setAttribute("aria-label", apply.title);
      apply.innerHTML = ICONS.applySort;
      apply.addEventListener("click", (e) => {
        e.preventDefault();
        void this.applySort(widget, info);
      });
      chip.append(apply, clear);
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
        const [w, i] = this.current(widget, info);
        const now = this.viewOf(i);
        this.setView(w, i, now.showFilters ? { ...now, filters: [], showFilters: false } : { ...now, showFilters: true });
      },
      view.showFilters
    );
    if (info.metaRow) {
      button(
        "Remove metadata",
        "Remove this table's stored settings (sorting, pinning): its <meta> row",
        () => void this.removeMetadata(widget, info)
      );
    }
    button("Edit markdown", "Show this table as markdown", () => void this.showMarkdown(this.current(widget, info)[1]));
    const rect = widget.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    const headerRect = info.table.rows[0].getBoundingClientRect();
    const viewTop = this.scrollParentOf(widget)?.getBoundingClientRect().top ?? 0;
    bar.classList.add("tp-visible");
    const above = headerRect.top - bar.offsetHeight - BAR_GAP;
    const fits = above >= viewTop + 2;
    const top = fits ? above : headerRect.top + (headerRect.height - bar.offsetHeight) / 2;
    this.place(bar, rect.right - bar.offsetWidth - (fits ? 0 : 6), top);
    this.addRow.classList.add("tp-visible");
    const inView = this.shownRect(widget, info);
    this.place(this.addRow, inView.left, inView.bottom + 4);
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
    const rearranged = this.rearranged(info);
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
    const box = this.innerBox(widget);
    const table = info.table.getBoundingClientRect();
    return {
      left: Math.max(box.left, table.left),
      right: Math.min(box.right, table.right),
      top: Math.max(box.top, table.top),
      bottom: Math.min(box.bottom, table.bottom)
    };
  }
  // ---- grips: click opens a menu, drag moves -----------------------------
  onGripPointerDown(e, axis) {
    const target = this.handleTarget;
    if (e.button !== 0 || !target || axis === "row" && target.row === void 0) return;
    e.preventDefault();
    const grip = axis === "row" ? this.rowGrip : this.columnGrip;
    const canDrag = axis === "column" || !this.rearranged(target.info);
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
      if (axis === "row") void this.moveRowTo(widget, info, from, to);
      else void this.moveColumnTo(widget, info, from, to);
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
    this.menu = { element, axis, widget, anchor };
    this.positionMenu();
    anchor.classList.add("tp-active");
    focusMenu(element);
  }
  /** Rows: to the right of the grip; columns: below it; always inside the window */
  positionMenu() {
    if (!this.menu) return;
    const { element, axis, anchor } = this.menu;
    const win = this.doc.defaultView;
    const a = anchor.getBoundingClientRect();
    const m = element.getBoundingClientRect();
    let left = axis === "row" ? a.right + 4 : a.left + a.width / 2 - m.width / 2;
    let top = axis === "row" ? a.top - 6 : a.bottom + 4;
    left = Math.max(4, Math.min(left, win.innerWidth - m.width - 4));
    if (top + m.height > win.innerHeight - 4) top = Math.max(4, win.innerHeight - m.height - 4);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
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
    const rearranged = this.rearranged(info);
    const zone = rowZone(info.pins, info.rows, row);
    const act = (run) => this.runAndClose(() => void run());
    const moveBlocked = (to) => rearranged ? MOVE_BLOCKED : clampRowMove(info.pins, info.rows, row, to) === row ? zone ? "Pinned rows stay with the other pinned rows" : "Already at the edge" : void 0;
    const pinBlocked = (to) => this.metadataOn || zone === to ? void 0 : PIN_NEEDS_METADATA;
    const insertBlocked = (at) => insertRowAt(info.pins, info.rows, at).at === at ? void 0 : zone === "top" ? "Rows pinned to the top stay at the top" : "Rows pinned to the bottom stay at the bottom";
    return [
      {
        kind: "item",
        label: "Insert row above",
        icon: ICONS.rowAbove,
        run: act(() => this.insertRowWith(widget, info, row, column)),
        disabled: insertBlocked(row)
      },
      {
        kind: "item",
        label: "Insert row below",
        icon: ICONS.rowBelow,
        run: act(() => this.insertRowWith(widget, info, row + 1, column)),
        disabled: insertBlocked(row + 1)
      },
      { kind: "item", label: "Duplicate row", icon: ICONS.duplicate, run: act(() => this.duplicateRowAt(widget, info, row)) },
      { kind: "separator" },
      {
        kind: "item",
        label: "Move up",
        icon: ICONS.arrowUp,
        run: act(() => this.moveRowTo(widget, info, row, row - 1)),
        disabled: moveBlocked(row - 1)
      },
      {
        kind: "item",
        label: "Move down",
        icon: ICONS.arrowDown,
        run: act(() => this.moveRowTo(widget, info, row, row + 1)),
        disabled: moveBlocked(row + 1)
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Pin to top",
        icon: ICONS.pinTop,
        checked: zone === "top",
        run: act(() => this.pinRowAt(widget, info, row, zone === "top" ? void 0 : "top")),
        disabled: pinBlocked("top")
      },
      {
        kind: "item",
        label: "Pin to bottom",
        icon: ICONS.pinBottom,
        checked: zone === "bottom",
        run: act(() => this.pinRowAt(widget, info, row, zone === "bottom" ? void 0 : "bottom")),
        disabled: pinBlocked("bottom")
      },
      { kind: "separator" },
      { kind: "item", label: "Delete row", icon: ICONS.trash, danger: true, run: act(() => this.deleteRowAt(widget, info, row)) }
    ];
  }
  columnMenu(widget, info, column) {
    const view = this.viewOf(info);
    const sorted = view.sort?.column === column ? view.sort.direction : void 0;
    const align = parseTable(info.source).align[column] ?? "";
    const edit = (change, focus, columnMap) => this.runAndClose(() => void this.write(widget, change, focus, columnMap));
    const sortBy = (next) => this.runAndClose(() => this.setSort(widget, info, next));
    const alignTo = (target) => edit((t) => setAlign(t, column, align === target ? "" : target));
    const act = (run) => this.runAndClose(() => void run());
    const zone = columnZone(info.pins, info.columns, column);
    const columnMoveBlocked = (to) => clampColumnMove(info.pins, info.columns, column, to) === column ? zone ? "Pinned columns stay with the other pinned columns" : "Already at the edge" : void 0;
    const pinBlocked = (to) => this.metadataOn || zone === to ? void 0 : PIN_NEEDS_METADATA;
    const insertBlocked = (at) => insertColumnAt(info.pins, info.columns, at).at === at ? void 0 : zone === "left" ? "Columns pinned to the left stay at the left" : "Columns pinned to the right stay at the right";
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
        run: act(() => this.insertColumnWith(widget, info, column)),
        disabled: insertBlocked(column)
      },
      {
        kind: "item",
        label: "Insert column right",
        icon: ICONS.columnRight,
        run: act(() => this.insertColumnWith(widget, info, column + 1)),
        disabled: insertBlocked(column + 1)
      },
      {
        kind: "item",
        label: "Move left",
        icon: ICONS.arrowLeft,
        run: act(() => this.moveColumnTo(widget, info, column, column - 1)),
        disabled: columnMoveBlocked(column - 1)
      },
      {
        kind: "item",
        label: "Move right",
        icon: ICONS.arrowRight,
        run: act(() => this.moveColumnTo(widget, info, column, column + 1)),
        disabled: columnMoveBlocked(column + 1)
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Pin left",
        icon: ICONS.pinLeft,
        checked: zone === "left",
        run: act(() => this.pinColumnAt(widget, info, column, zone === "left" ? void 0 : "left")),
        disabled: pinBlocked("left")
      },
      {
        kind: "item",
        label: "Pin right",
        icon: ICONS.pinRight,
        checked: zone === "right",
        run: act(() => this.pinColumnAt(widget, info, column, zone === "right" ? void 0 : "right")),
        disabled: pinBlocked("right")
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Delete column",
        icon: ICONS.trash,
        danger: true,
        run: act(() => this.deleteColumnAt(widget, info, column)),
        disabled: info.columns <= 1 ? "A table needs at least one column" : void 0
      }
    );
    return entries;
  }
};

// table-plus/src/index.ts
var version = "0.1.0";
var GLOBAL_KEY = "__tablePlus";
function pageIndexed(name) {
  const controller = globalThis[GLOBAL_KEY];
  void controller?.pageIndexed(name);
}
function removeAllMetadata() {
  const controller = globalThis[GLOBAL_KEY];
  void controller?.removeAllMetadata();
}
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
  pageIndexed,
  removeAllMetadata,
  version
};
