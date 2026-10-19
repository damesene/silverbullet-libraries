// table-plus/src/bridge.ts
var SETTINGS = {
  enterKey: {
    path: "tablePlus.editor.enterKey",
    default: "moveDown",
    parse: (v) => v === "save" || v === "moveDown" ? v : void 0
  },
  smartFilters: {
    path: "tablePlus.filter.smart",
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
    path: "tablePlus.editor.selectOnClick",
    default: false,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Ctrl+Enter in a cell editor adds a row below; off: it is a plain Enter
  ctrlEnterAddsRow: {
    path: "tablePlus.editor.ctrlEnterAddsRow",
    default: true,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Write edited tables with aligned pipes; off: keep each table's own style
  autoFormat: {
    path: "tablePlus.autoFormat",
    default: true,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Milliseconds `${…}` cells wait after `page:index` for the indexers to write the index
  expressionsDelay: {
    path: "tablePlus.expressions.refreshDelay",
    default: 500,
    parse: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0
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
  if ("f" in meta || "n" in meta || "cn" in meta) return void 0;
  return meta;
}
function unescapeMetaValue(value) {
  return value.replace(/\\\|/g, "|").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&#92;/g, "\\").replace(/&amp;/g, "&");
}
function escapeMetaValue(value) {
  return value.replace(/&/g, "&amp;").replace(/\\/g, "&#92;").replace(/"/g, "&quot;").replace(/>/g, "&gt;").replace(/\|/g, "\\|");
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
  const pad2 = (cell, c) => {
    const gap = (widths[c] ?? 3) - charLength(cell);
    const align = table.align[c] ?? "";
    const left = align === "right" ? gap : align === "center" ? Math.floor(gap / 2) : 0;
    return " ".repeat(left) + cell + " ".repeat(gap - left);
  };
  const cellText2 = (cell, c) => table.padded ? ` ${pad2(cell, c)} ` : cell === "" ? " " : ` ${cell} `;
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
      const named2 = (table.rows[0]?.cells ?? []).filter((cell) => cell !== "").length;
      const rendered = table.rows.length + (table.meta ? 1 : 0);
      return rendered === shape.rows && named2 === shape.columns && named2 < table.align.length;
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

// table-plus/src/names.ts
var NAMES_TAG_RE = /\s*<meta((?:\s+c?n\s*=\s*(?:"[^"]*"|'[^']*'))+)\s*\/?>/gi;
var NAMES_ATTRIBUTE_RE = /(c?n)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
var CELL_RE = /^([A-Za-z]{1,3})([1-9]\d*)$/;
var NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function nameProblem(name, what) {
  if (!NAME_RE.test(name)) return `"${name}" is not a ${what} name: letters, digits and _, not starting with a digit`;
  if (CELL_RE.test(name) || /^(true|false)$/i.test(name)) return `"${name}" would read as a cell or a value`;
  return void 0;
}
function namesOf(cell) {
  const tag = Array.from(cell.matchAll(NAMES_TAG_RE)).pop();
  const names = {};
  for (const match of tag?.[1]?.matchAll(NAMES_ATTRIBUTE_RE) ?? []) {
    const value = unescapeMetaValue(match[2] ?? match[3] ?? "").trim();
    names[match[1].toLowerCase()] = value || void 0;
  }
  return names;
}
function nameOf(cell) {
  return namesOf(cell).n;
}
function cellNameOf(cell) {
  return namesOf(cell).cn;
}
function withoutName(cell) {
  return cell.replace(NAMES_TAG_RE, "").trim();
}
function named(text, { n, cn }) {
  const attributes = [...n ? [`n="${escapeMetaValue(n)}"`] : [], ...cn ? [`cn="${escapeMetaValue(cn)}"`] : []];
  return [text, ...attributes.length ? [`<meta ${attributes.join(" ")}>`] : []].filter((part) => part !== "").join(" ");
}
function withName(cell, name) {
  return named(withoutName(cell), { n: name, cn: cellNameOf(cell) });
}
function withCellName(cell, name) {
  return named(withoutName(cell), { n: nameOf(cell), cn: name });
}
function keepNames(cell, from) {
  return named(withoutName(cell), namesOf(from));
}
function rowNameIn(cells) {
  for (let column = 0; column < cells.length; column++) {
    const name = nameOf(cells[column]);
    if (name) return { name, column };
  }
  return void 0;
}
function namedRows(table) {
  const rows = /* @__PURE__ */ new Map();
  table.rows.forEach((r, row) => {
    const name = row === 0 ? void 0 : rowNameIn(r.cells)?.name.toLowerCase();
    if (name && !rows.has(name)) rows.set(name, row);
  });
  return rows;
}
function namedCells(table) {
  const cells = /* @__PURE__ */ new Map();
  table.rows.forEach((r, row) => {
    if (row === 0) return;
    r.cells.forEach((cell, column) => {
      const name = cellNameOf(cell)?.toLowerCase();
      if (name && !cells.has(name)) cells.set(name, { row, column });
    });
  });
  return cells;
}
function hasNames(table) {
  return table.rows.some((row) => row.cells.some((cell) => withoutName(cell) !== cell.trim()));
}
function withoutNames(table) {
  let result = table;
  table.rows.forEach(
    (row, r) => row.cells.forEach((cell, c) => {
      if (withoutName(cell) !== cell.trim()) result = setCell(result, r, c, withoutName(cell));
    })
  );
  return result;
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
var TYPE_TAG_CLASS = "tp-type-tag";
function cellText(cell) {
  let text = "";
  const walk = (parent) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node instanceof Element && (node.classList.contains(UI_CLASS) || node.classList.contains(TYPE_TAG_CLASS))) continue;
      if (node.nodeType === 3) text += node.textContent ?? "";
      else walk(node);
    }
  };
  walk(cell);
  return text.replace(/\s+/g, " ").trim();
}
var KEEP_CLASS = "tp-keep";
function keepIconsWithName(cell) {
  if (cell.querySelector(`:scope > .${KEEP_CLASS}`)) return;
  const nodes = Array.from(cell.childNodes);
  let last = nodes.length - 1;
  while (last >= 0 && !(nodes[last].nodeType === 3 && nodes[last].textContent.trim() !== "")) last--;
  if (last < 0) return;
  const after = nodes.slice(last + 1).filter((n) => !(n instanceof Element && n.classList.contains("tp-pin-mark")));
  if (!after.some((n) => n instanceof Element && n.classList.contains(UI_CLASS))) return;
  const text = nodes[last];
  const word = /\S+\s*$/.exec(text.data);
  const keep = cell.ownerDocument.createElement("span");
  keep.className = KEEP_CLASS;
  keep.append(text.data.slice(word.index), ...after);
  text.data = text.data.slice(0, word.index);
  cell.insertBefore(keep, text.nextSibling);
}
function cellValue(cell) {
  return cell.dataset.tpValue ?? cellText(cell);
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

// table-plus/src/core/layout.ts
var STICKY_GAP = 38;

// table-plus/src/core/structure.ts
var MOVE_BLOCKED = "Clear sorting and filters to move rows";
function rowAfterInsert(at) {
  return (r) => r >= at ? r + 1 : r;
}
function insertRowWith(host, widget, info, at, column, prepare = (t) => t) {
  const insert = insertRowAt(info.pins, info.rows, at);
  return host.write(
    widget,
    (t) => {
      const prepared = prepare(t);
      return prepared && insertRow(prepared, insert.at);
    },
    { focus: { row: insert.at, column }, pins: insert.pins, rowMap: rowAfterInsert(insert.at) }
  );
}
function duplicateRowAt(host, widget, info, row) {
  const insert = insertRowAt(info.pins, info.rows, row + 1);
  return host.write(
    widget,
    (t) => {
      const cells = t.rows[row]?.cells.map((cell) => withoutName(cell) === cell.trim() ? cell : withoutName(cell));
      return cells ? insertRow(t, insert.at, cells) : void 0;
    },
    { pins: insert.pins, rowMap: rowAfterInsert(insert.at) }
  );
}
function deleteRowAt(host, widget, info, row) {
  return host.write(widget, (t) => deleteRow(t, row), {
    pins: deleteRowPins(info.pins, info.rows, row),
    rowMap: (r) => r === row ? void 0 : r > row ? r - 1 : r
  });
}
function moveRowTo(host, widget, info, from, asked) {
  const to = clampRowMove(info.pins, info.rows, from, asked);
  if (to === from) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveRow(t, from, to), { rowMap: (r) => columnAfterMove(r, from, to) });
}
function insertColumnWith(host, widget, info, at) {
  const insert = insertColumnAt(info.pins, info.columns, at);
  return host.write(widget, (t) => insertColumn(t, insert.at), {
    focus: { row: 0, column: insert.at, select: true },
    columnMap: (c) => c >= insert.at ? c + 1 : c,
    pins: insert.pins
  });
}
function listed(names) {
  const shown = names.slice(0, 5);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown.join("");
}
async function deleteColumnAt(host, widget, info, column) {
  const body = parseTable(info.source).rows.slice(1);
  const rows = body.flatMap((r) => {
    const named2 = rowNameIn(r.cells);
    return named2 && named2.column === column ? [named2.name] : [];
  });
  const cells = body.flatMap((r) => {
    const name = cellNameOf(r.cells[column] ?? "");
    return name ? [name] : [];
  });
  if (rows.length || cells.length) {
    const lost = [
      ...rows.length ? [`the name${rows.length === 1 ? "" : "s"} of ${rows.length === 1 ? "the row" : `${rows.length} rows`} ${listed(rows)}`] : [],
      ...cells.length ? [`the name${cells.length === 1 ? "" : "s"} of ${cells.length === 1 ? "the cell" : `${cells.length} cells`} ${listed(cells)}`] : []
    ];
    const question = `Deleting this column also removes ${lost.join(" and ")}: formulas that use ${rows.length + cells.length === 1 ? "it" : "them"} show #REF! or #NAME?. Delete the column? Ctrl+Z brings it back.`;
    if (!await host.ask(question)) return "unchanged";
  }
  return host.write(widget, (t) => deleteColumn(t, column), {
    columnMap: (c) => c === column ? void 0 : c > column ? c - 1 : c,
    pins: deleteColumnPins(info.pins, info.columns, column)
  });
}
function moveColumnTo(host, widget, info, from, asked) {
  const to = clampColumnMove(info.pins, info.columns, from, asked);
  if (to === from) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveColumn(t, from, to), { columnMap: (c) => columnAfterMove(c, from, to) });
}
async function pinRowAt(host, widget, info, row, pin) {
  if (pin && !await host.setting("metadata")) return;
  const { to, pins } = pinRow(info.pins, info.rows, row, pin);
  await host.write(widget, (t) => moveRow(t, row, to), { pins, rowMap: (r) => columnAfterMove(r, row, to) });
}
async function pinColumnAt(host, widget, info, column, pin) {
  if (pin && !await host.setting("metadata")) return;
  const { to, pins } = pinColumn(info.pins, info.columns, column, pin);
  await host.write(widget, (t) => moveColumn(t, column, to), { columnMap: (c) => columnAfterMove(c, column, to), pins });
}

// table-plus/src/core/editor.ts
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
var CellEditing = class {
  constructor(host, context) {
    this.host = host;
    this.context = context;
  }
  host;
  context;
  editor;
  // A cell to edit once its table is rendered again (after a write)
  pending;
  // The selectOnClick setting: a plain click selects the cell's text
  selectOnClick = false;
  get active() {
    return this.editor;
  }
  /** After a write: edit `focus` in the table with `key` once it is rendered again */
  editAfterWrite(key, focus) {
    this.pending = { key, ...focus, until: Date.now() + 3e3 };
  }
  /** No cell waits to be edited (a write failed, or editing was cancelled) */
  dropPending() {
    this.pending = void 0;
  }
  open(widget, info, cell, select = false) {
    const ref = this.host.cellRef(info, cell);
    if (!ref || this.editor) return;
    const original = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";
    const bare = withoutName(original);
    const cellStyle = cell.getAttribute("style");
    const rect = cell.getBoundingClientRect();
    if (rect.width > 0) {
      cell.style.boxSizing = "border-box";
      cell.style.width = `${rect.width}px`;
      cell.style.minWidth = `${rect.width}px`;
      cell.style.maxWidth = `${rect.width}px`;
      cell.style.height = `${rect.height}px`;
    }
    const field = this.host.doc.createElement("input");
    field.type = "text";
    field.className = `${UI_CLASS} tp-cell-editor`;
    field.size = 1;
    field.spellcheck = true;
    field.value = this.context.features.reduce((text, f) => text ?? f.editorText?.(info, ref, bare), void 0) ?? unescapeCell(bare);
    const kept = this.host.doc.createDocumentFragment();
    while (cell.firstChild) kept.append(cell.firstChild);
    cell.classList.add("tp-editing");
    cell.append(field);
    this.editor = { widget, cell, ...ref, original, initial: field.value, field, kept, cellStyle };
    this.reveal(widget, cell);
    this.context.endHover();
    this.context.isolate(field);
    field.addEventListener("blur", () => {
      if (this.editor?.field === field && !this.context.movingRows()) void this.finish(true, void 0, false);
    });
    field.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      const editing = this.editor;
      if (editing?.field === field && this.context.features.some((f) => f.editorKeyDown?.(e, editing))) {
        e.preventDefault();
        return;
      }
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
        void this.finish(false);
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
    const opened = this.editor;
    for (const feature of this.context.features) feature.editorOpened?.(opened);
  }
  /** Puts the rendered cell back; returns what was being edited */
  close() {
    const active = this.editor;
    if (!active) return void 0;
    this.editor = void 0;
    for (const feature of this.context.features) feature.editorClosed?.(active);
    let value = this.cellValue(active);
    if (active.row === 0 && withoutName(value) === "" && active.original !== "") {
      value = active.original;
      void this.host.bridge.flash("Table Plus: a column needs a name; the old name was kept", "info");
    }
    active.field.remove();
    active.cell.classList.remove("tp-editing");
    if (active.cellStyle === null) active.cell.removeAttribute("style");
    else active.cell.setAttribute("style", active.cellStyle);
    active.cell.append(active.kept);
    return { ...active, value };
  }
  /**
   * The markdown for what the editor holds: the cell as it was when nothing was
   * changed, what a feature makes of it (a formula), else the text
   */
  cellValue(active) {
    const typed = active.field.value;
    if (typed === active.initial) return active.original;
    const value = this.context.features.reduce((v, f) => v ?? f.editorValue?.(active, typed), void 0) ?? escapeCell(typed);
    return keepNames(value, active.original);
  }
  /**
   * Ends editing, saving the cell if asked and changed, then opens `next`
   * (a cell of the same or another table) or hands the keyboard back to the editor.
   */
  async finish(save, next, refocus = true) {
    const closed = this.close();
    if (!closed) return;
    const changed = save && closed.value !== closed.original;
    const sameTable = next?.widget === closed.widget;
    let result = "unchanged";
    if (changed) {
      result = await this.host.write(closed.widget, (t) => this.withCellEdit(t, closed), { focus: sameTable ? next : void 0 });
    }
    if (next && (result === "unchanged" || !sameTable)) {
      const info = this.host.infoOf(next.widget);
      const cell = info && this.host.cellAt(info, next);
      if (info && cell) this.open(next.widget, info, cell, next.select);
      return;
    }
    if (!next && refocus) this.host.focusEditor(closed.widget);
  }
  withCellEdit(table, edit) {
    if ((table.rows[edit.row]?.cells[edit.column] ?? "") !== edit.original) return void 0;
    return setCell(table, edit.row, edit.column, edit.value);
  }
  /**
   * Ctrl+Enter: save the cell, add an empty row below its row and edit the
   * new row in the same column, as one edit. The ctrlEnterAddsRow setting off:
   * a plain Enter.
   */
  async ctrlEnter() {
    const active = this.editor;
    if (!active) return;
    if (!await this.host.setting("ctrlEnterAddsRow") || this.editor !== active) {
      if (this.editor === active) await this.enter(false);
      return;
    }
    const info = this.host.infoOf(active.widget);
    const closed = this.close();
    if (info) await insertRowWith(this.host, closed.widget, info, closed.row + 1, closed.column, (t) => this.withSaved(t, closed));
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
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    if (await this.host.setting("enterKey") !== "moveDown" || this.editor !== active) {
      if (this.editor === active) await this.finish(true);
      return;
    }
    const shown = this.host.shownRows(info);
    const target = shown[shown.indexOf(active.cell.parentElement) + 1];
    const cell = target?.cells[active.column];
    const ref = cell && this.host.cellRef(info, cell);
    await this.finish(true, ref ? { widget: active.widget, ...ref, select: this.selectsWith(shift) } : void 0);
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
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    const vertical = key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown";
    const step = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
    const from = vertical ? active.row : active.column;
    const asked = key === "Home" ? 0 : key === "End" ? info.columns - 1 : key === "PageUp" ? from - PAGE_ROWS : key === "PageDown" ? from + PAGE_ROWS : from + step;
    if (vertical) {
      if (from === 0) return;
      if (this.host.rearranged(info)) {
        void this.host.bridge.flash(`Table Plus: ${MOVE_BLOCKED.toLowerCase()}`, "info");
        return;
      }
    }
    const to = vertical ? clampRowMove(info.pins, info.rows, from, asked) : clampColumnMove(info.pins, info.columns, from, asked);
    if (to === from) return;
    const closed = this.close();
    await this.host.write(
      closed.widget,
      (t) => {
        const edited = this.withSaved(t, closed);
        if (!edited) return void 0;
        return vertical ? moveRow(edited, from, to) : moveColumn(edited, from, to);
      },
      vertical ? { focus: { row: to, column: closed.column }, rowMap: (r) => columnAfterMove(r, from, to) } : { focus: { row: closed.row, column: to }, columnMap: (c) => columnAfterMove(c, from, to) }
    );
  }
  /**
   * Ctrl+arrows: save and edit the neighbouring shown cell; Ctrl+Home / End:
   * the first / last cell of the row. Nothing happens at the table's edge.
   * With Shift the cell opens as on a Shift+click.
   */
  async navigate(key, shift) {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    const shown = this.host.shownRows(info);
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
    const ref = this.host.cellRef(info, target);
    if (ref) await this.finish(true, { widget: active.widget, ...ref, select: this.selectsWith(shift) });
  }
  /** Tab / Shift+Tab: save and move to the next / previous shown cell */
  async step(direction) {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    const shown = this.host.shownRows(info);
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
      await this.finish(true);
      return;
    }
    const target = shown[r];
    if (target) {
      const ref = this.host.cellRef(info, target.cells[column] ?? target.cells[0]);
      if (ref) await this.finish(true, { widget: active.widget, ...ref });
      return;
    }
    const closed = this.close();
    await insertRowWith(this.host, closed.widget, info, appendRowAt(info.pins, info.rows), 0, (t) => this.withSaved(t, closed));
  }
  takePending(widget, info) {
    const pending = this.pending;
    if (!pending || pending.key !== info.key) return;
    this.pending = void 0;
    if (Date.now() > pending.until || this.editor) return;
    const cell = this.host.cellAt(info, pending);
    if (cell) this.open(widget, info, cell, pending.select);
  }
  /**
   * Scrolls so that the cell is fully visible: a wide table sideways, the page
   * up or down, keeping a body cell clear of the header held at the top
   */
  reveal(widget, cell) {
    const box = this.host.innerBox(widget);
    let rect = cell.getBoundingClientRect();
    if (rect.right > box.right) widget.scrollLeft += rect.right - box.right;
    else if (rect.left < box.left) widget.scrollLeft -= box.left - rect.left;
    const head = this.host.infoOf(widget)?.table.tHead;
    const headHeight = head && !head.contains(cell) ? head.offsetHeight : 0;
    if (this.host.scrollsInside(widget)) {
      rect = cell.getBoundingClientRect();
      if (rect.top < box.top + headHeight) widget.scrollTop -= box.top + headHeight - rect.top;
      else if (rect.bottom > box.bottom) widget.scrollTop += rect.bottom - box.bottom;
    }
    const scroller = this.host.scrollParentOf(widget);
    if (!scroller) return;
    rect = cell.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const top = view.top + (headHeight ? STICKY_GAP + headHeight : 0);
    if (rect.top < top) scroller.scrollTop -= top - rect.top;
    else if (rect.bottom > view.bottom) scroller.scrollTop += rect.bottom - view.bottom;
  }
  // While Ctrl is held in a cell editor, arrows move between cells: the pointer shows it
  setNavigating(on) {
    this.host.doc.body.classList.toggle("tp-navigating", on);
  }
};

// table-plus/src/features/autoscroll.ts
var DEAD_ZONE = 12;
var Autoscroll = class {
  constructor(host) {
    this.host = host;
  }
  host;
  stopScrolling;
  stop() {
    this.stopScrolling?.();
  }
  mouseDown(e) {
    if (this.stopScrolling) {
      e.preventDefault();
      e.stopPropagation();
      this.stopScrolling();
      this.swallowNextClick();
      return true;
    }
    return e.button === 1 && this.begin(e);
  }
  begin(e) {
    const { doc } = this.host;
    const widget = this.host.enhancedWidgetOf(e.target)?.[0];
    const scrollsSideways = !!widget && widget.scrollWidth > widget.clientWidth;
    if (!widget || e.target.closest("a") || !scrollsSideways && !this.host.scrollsInside(widget)) return false;
    e.preventDefault();
    e.stopPropagation();
    const win = doc.defaultView;
    const page = this.host.scrollParentOf(widget) ?? doc.scrollingElement;
    const origin = { x: e.clientX, y: e.clientY };
    const pointer = { ...origin };
    let held = false;
    let carry = { x: 0, y: 0 };
    const marker = this.host.floating("div", "tp-autoscroll tp-visible");
    marker.style.left = `${origin.x - 12}px`;
    marker.style.top = `${origin.y - 12}px`;
    doc.body.classList.add("tp-autoscrolling");
    const speed = (d) => {
      const beyond = Math.abs(d) - DEAD_ZONE;
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
      if (Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > DEAD_ZONE) held = true;
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
      doc.body.classList.remove("tp-autoscrolling");
      this.stopScrolling = void 0;
    };
    this.stopScrolling = stop;
    setTimeout(() => {
      if (this.stopScrolling !== stop) return;
      win.addEventListener("mousemove", move, true);
      win.addEventListener("mouseup", up, true);
      win.addEventListener("keydown", end, true);
      win.addEventListener("wheel", end, { capture: true, passive: false });
    }, 0);
    frame = win.requestAnimationFrame(tick);
    return true;
  }
  swallowNextClick() {
    const win = this.host.doc.defaultView;
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
};

// table-plus/src/icons.ts
var svg = (body, fill = false) => `<svg viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;
var lineIcon = (body) => svg(body);
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
  // Two arrows round: calculate again
  recalculate: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>'),
  filter: svg('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
  // A padlock: a name that stays
  fixedName: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  columnType: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
  alignLeft: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  alignCenter: svg('<path d="M4 6h16M7 12h10M5.5 18h13"/>'),
  alignRight: svg('<path d="M4 6h16M10 12h10M7 18h13"/>'),
  // A pushpin with its needle pointing to the edge it pins to
  pinTop: PIN_POINT_UP,
  pinBottom: PIN_POINT_DOWN,
  pinLeft: PIN_POINT_LEFT,
  pinRight: PIN_POINT_RIGHT
};

// table-plus/src/columns.ts
var HASHTAG_RE = /(^|\s)#[^\s#]+/g;
function columnName(header) {
  return unescapeCell(header).replace(/<meta\b[^>]*>/gi, "").replace(HASHTAG_RE, "$1").trim().replace(/^[*_`]+|[*_`]+$/g, "").trim();
}
function columnKey(name) {
  return columnName(name).replace(/[\W_]+/g, "_").toLowerCase();
}
function findColumn(headers, id) {
  const fixed = fixedColumn(headers, id.name);
  if (fixed >= 0 && id.nth === 1) return fixed;
  const wanted = columnKey(id.name);
  let seen = fixed >= 0 ? 1 : 0;
  const index = headers.findIndex((header, c) => c !== fixed && columnKey(header) === wanted && ++seen === id.nth);
  return index < 0 ? void 0 : index;
}
function fixedColumn(headers, name) {
  const wanted = name.toLowerCase();
  return headers.findIndex((header) => nameOf(header)?.toLowerCase() === wanted);
}
function columnIdOf(headers, column) {
  const header = headers[column];
  if (header === void 0) return void 0;
  const fixed = nameOf(header);
  if (fixed) return { name: fixed, nth: 1, shared: false };
  const wanted = columnKey(header);
  const fixedOther = fixedColumn(headers, wanted);
  const counted = (h, c) => c !== fixedOther && columnKey(h) === wanted;
  const before = fixedOther >= 0 ? 1 : 0;
  const same = before + headers.filter(counted).length;
  const nth = before + headers.slice(0, column + 1).filter(counted).length;
  return { name: wanted, nth, shared: same > 1 };
}
function followColumn(before, after, id, map = (c) => c) {
  const column = findColumn(before, id);
  if (column === void 0) return void 0;
  const moved2 = map(column);
  if (moved2 === void 0) return null;
  return columnIdOf(after, moved2) ?? null;
}
function sameColumnId(a, b) {
  return columnKey(a.name) === columnKey(b.name) && a.nth === b.nth;
}

// table-plus/src/format.ts
function formatLuaNumber(n) {
  if (Number.isInteger(n)) return String(n);
  if (Number.isNaN(n)) return "-nan";
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  const [mantissa, exp] = n.toExponential(13).split("e");
  const exponent = Number(exp);
  if (exponent < -4 || exponent >= 14) {
    const digits = Math.abs(exponent) < 10 ? `0${Math.abs(exponent)}` : String(Math.abs(exponent));
    return `${trimZeros(mantissa)}e${exponent < 0 ? "-" : "+"}${digits}`;
  }
  return trimZeros(n.toFixed(13 - exponent));
}
function trimZeros(s) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
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

// table-plus/src/formula/values.ts
var ERROR_CODES = ["#VALUE!", "#DIV/0!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#CYCLE!", "#ERROR!"];
var FormulaError = class {
  constructor(code, detail) {
    this.code = code;
    this.detail = detail;
  }
  code;
  detail;
};
var TimeValue = class {
  constructor(seconds, text) {
    this.seconds = seconds;
    this.text = text;
  }
  seconds;
  text;
};
var DAY_SECONDS = 86400;
var CLOCK_RE = /^(-)?(\d+):([0-5]\d)(?::([0-5]\d))?$/;
function parseClock(text) {
  const m = CLOCK_RE.exec(text.trim());
  if (!m) return void 0;
  const seconds = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return new TimeValue(m[1] ? -seconds : seconds, text.trim());
}
function formatClock(seconds) {
  const total = Math.round(Math.abs(seconds));
  const two = (n) => String(n).padStart(2, "0");
  const rest = total % 60;
  const text = `${two(Math.floor(total / 3600))}:${two(Math.floor(total / 60) % 60)}${rest ? `:${two(rest)}` : ""}`;
  return seconds < 0 && total > 0 ? `-${text}` : text;
}
function asTime(value) {
  if (value instanceof TimeValue) return value;
  return typeof value === "string" ? parseClock(value) : void 0;
}
function isError(value) {
  return value instanceof FormulaError;
}
function isRange(value) {
  return Array.isArray(value);
}
function firstError(values) {
  for (const value of values) {
    for (const item of isRange(value) ? value : [value]) {
      if (isError(item)) return item;
    }
  }
  return void 0;
}
function single(value) {
  if (!isRange(value)) return value;
  return value.length === 1 ? value[0] : new FormulaError("#VALUE!", "a range where one value is expected");
}
function toNumber(value) {
  const v = single(value);
  if (isError(v) || typeof v === "number") return v;
  if (v === null) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof TimeValue) return v.seconds / DAY_SECONDS;
  if (v.trim() === "") return 0;
  const time = parseClock(v);
  return asNumber(v) ?? (time ? time.seconds / DAY_SECONDS : new FormulaError("#VALUE!", `"${v}" is not a number`));
}
function toText(value) {
  const v = single(value);
  if (isError(v)) return v;
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return formatNumber(v);
  if (v instanceof TimeValue) return v.text ?? formatClock(v.seconds);
  return v;
}
function toBoolean(value) {
  const v = single(value);
  if (isError(v) || typeof v === "boolean") return v;
  if (v === null) return false;
  if (typeof v === "number") return v !== 0;
  if (v instanceof TimeValue) return v.seconds !== 0;
  const upper = v.trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  const n = asNumber(v);
  return n !== void 0 ? n !== 0 : new FormulaError("#VALUE!", `"${v}" is not TRUE or FALSE`);
}
function numbers(args) {
  const result = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const item of arg) {
        if (isError(item)) return item;
        if (typeof item === "number") result.push(item);
        else if (item instanceof TimeValue) result.push(item.seconds / DAY_SECONDS);
        else if (typeof item === "string") {
          const n = asNumber(item);
          if (n !== void 0) result.push(n);
        }
      }
    } else if (arg !== null) {
      const n = toNumber(arg);
      if (isError(n)) return n;
      result.push(n);
    }
  }
  return result;
}
function allTimes(args) {
  let times = 0;
  for (const arg of args) {
    for (const item of isRange(arg) ? arg : [arg]) {
      if (asTime(item)) times++;
      else if (typeof item === "number" || typeof item === "string" && asNumber(item) !== void 0) return false;
      else if (!isRange(arg) && typeof item === "boolean") return false;
    }
  }
  return times > 0;
}
function timeArithmetic(op, left, right) {
  const a = asTime(left);
  const b = asTime(right);
  if (!a && !b) return void 0;
  const days = (v) => toNumber(v);
  if (op === "+" || op === "-") {
    if (a && b) return new TimeValue(op === "+" ? a.seconds + b.seconds : a.seconds - b.seconds);
    const d = days(a ? right : left);
    if (isError(d)) return d;
    const s = d * DAY_SECONDS;
    if (op === "+") return new TimeValue(Math.round((a ?? b).seconds + s));
    return new TimeValue(Math.round(a ? a.seconds - s : s - b.seconds));
  }
  if (op === "*" && !(a && b)) {
    const k = days(a ? right : left);
    return isError(k) ? k : new TimeValue(Math.round((a ?? b).seconds * k));
  }
  if (op === "/" && a && !b) {
    const k = days(right);
    if (isError(k)) return k;
    return k === 0 ? new FormulaError("#DIV/0!", "division by zero") : new TimeValue(Math.round(a.seconds / k));
  }
  return void 0;
}
function flatten(args) {
  return args.flatMap((arg) => isRange(arg) ? [...arg] : [arg]);
}
function formatNumber(n) {
  return formatLuaNumber(n);
}
function sameValue(a, b) {
  if (isError(a) || isError(b)) return false;
  const emptyA = a === null || typeof a === "string" && a.trim() === "";
  const emptyB = b === null || typeof b === "string" && b.trim() === "";
  if (emptyA || emptyB) return emptyA && emptyB;
  if (typeof a !== "boolean" && typeof b !== "boolean") {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (!isError(na) && !isError(nb)) return na === nb;
  }
  return toText(a).toLowerCase() === toText(b).toLowerCase();
}

// table-plus/src/formula/dates.ts
var DAY = 864e5;
function timeOfDay(ms) {
  return (ms % DAY + DAY) % DAY;
}
function utc(year, month, day, ms = 0) {
  const date = new Date(Date.UTC(2e3, month, day) + ms);
  date.setUTCFullYear(date.getUTCFullYear() - 2e3 + year);
  return date.getTime();
}
var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
function parseDate(text) {
  const m = DATE_RE.exec(text.trim());
  if (!m) return void 0;
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1).map((part) => part === void 0 ? void 0 : Number(part));
  if (h > 23 || mi > 59 || s > 59) return void 0;
  const ms = utc(y, mo - 1, d, ((h * 60 + mi) * 60 + s) * 1e3);
  const date = new Date(ms);
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return void 0;
  return { ms, time: m[4] !== void 0 };
}
function formatDate({ ms, time }) {
  const year = new Date(ms).getUTCFullYear();
  if (!(year >= 0 && year <= 9999)) return new FormulaError("#NUM!", "the date is not in the years 0 to 9999");
  const iso = new Date(ms).toISOString();
  const date = iso.slice(0, 10);
  if (!time && timeOfDay(ms) === 0) return date;
  const seconds = iso.slice(17, 19);
  return `${date} ${iso.slice(11, 16)}${seconds === "00" ? "" : `:${seconds}`}`;
}
function toClock(value) {
  const v = single(value);
  const time = asTime(v);
  if (time) return { ms: time.seconds * 1e3, time: true };
  return typeof v === "number" ? { ms: Math.round(v * DAY_SECONDS) * 1e3, time: true } : toDate(value);
}
function now(time) {
  const d = /* @__PURE__ */ new Date();
  const ms = time ? Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return { ms, time };
}
function toDate(value) {
  const v = single(value);
  if (isError(v)) return v;
  const date = typeof v === "string" ? parseDate(v) : void 0;
  return date ?? new FormulaError("#VALUE!", `${v === null ? "an empty cell" : `"${toText(v)}"`} is not a date written as 2025-11-06`);
}
var UNIT_NAMES = {
  s: "s",
  sec: "s",
  second: "s",
  seconds: "s",
  min: "min",
  minute: "min",
  minutes: "min",
  h: "h",
  hour: "h",
  hours: "h",
  d: "d",
  day: "d",
  days: "d",
  w: "w",
  week: "w",
  weeks: "w",
  m: "m",
  month: "m",
  months: "m",
  y: "y",
  year: "y",
  years: "y"
};
var UNITS_HELP = `"s", "min", "h", "d", "w", "m" (months) or "y"`;
function toUnit(value) {
  const v = single(value);
  if (isError(v)) return v;
  const unit = typeof v === "string" ? UNIT_NAMES[v.trim().toLowerCase()] : void 0;
  return unit ?? new FormulaError("#VALUE!", `"${toText(v)}" is not a unit of time: ${UNITS_HELP}`);
}
var UNIT_MS = { s: 1e3, min: 6e4, h: 36e5, d: DAY, w: 7 * DAY };
function addUnits(date, amount, unit) {
  const ms = UNIT_MS[unit];
  if (ms !== void 0) {
    const added = date.ms + Math.round(amount * ms);
    return { ms: added, time: date.time || timeOfDay(added) !== 0 };
  }
  const months = Math.trunc(amount) * (unit === "y" ? 12 : 1);
  const d = new Date(date.ms);
  const target = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(target / 12);
  const month = (target % 12 + 12) % 12;
  const lastDay = new Date(utc(year, month + 1, 1) - DAY).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return { ms: utc(year, month, day, timeOfDay(date.ms)), time: date.time };
}
function unitsBetween(from, to, unit) {
  const ms = UNIT_MS[unit];
  if (ms !== void 0) return Math.trunc((to.ms - from.ms) / ms);
  const a = new Date(from.ms);
  const b = new Date(to.ms);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (months > 0 && addUnits(from, months, "m").ms > to.ms) months--;
  if (months < 0 && addUnits(from, months, "m").ms < to.ms) months++;
  return unit === "y" ? Math.trunc(months / 12) : months;
}
function dateArithmetic(op, left, right) {
  const a = typeof left === "string" ? parseDate(left) : void 0;
  const b = typeof right === "string" ? parseDate(right) : void 0;
  if (!a && !b) return void 0;
  if (a && b) {
    return op === "-" ? (a.ms - b.ms) / DAY : new FormulaError("#VALUE!", "two dates cannot be added: subtract them for the days between");
  }
  if (b && op === "-") return new FormulaError("#VALUE!", "a date cannot be subtracted from a number");
  const other = a ? right : left;
  const time = asTime(other);
  const days = other === null ? 0 : typeof other === "number" ? other : time ? time.seconds / DAY_SECONDS : void 0;
  if (days === void 0) return new FormulaError("#VALUE!", `"${typeof other === "string" ? other : String(other)}" is not a number of days or a time to add to a date`);
  return formatDate(addUnits(a ?? b, op === "-" ? -days : days, "d"));
}
function partOf(date, part) {
  const d = new Date(date.ms);
  switch (part) {
    case "year":
      return d.getUTCFullYear();
    case "month":
      return d.getUTCMonth() + 1;
    case "day":
      return d.getUTCDate();
    case "hour":
      return d.getUTCHours();
    case "minute":
      return d.getUTCMinutes();
    case "second":
      return d.getUTCSeconds();
    case "weekday":
      return d.getUTCDay();
  }
}

// table-plus/src/formula/functions/helpers.ts
function withNumbers(args, f, keepTime = false) {
  const ns = numbers(args);
  if (isError(ns)) return ns;
  const result = f(ns);
  return keepTime && typeof result === "number" && allTimes(args) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
}
function extremeDate(args, latest) {
  let best;
  for (const item of flatten(args)) {
    if (item === null) continue;
    if (isError(item)) return item;
    const date = typeof item === "string" ? parseDate(item) : void 0;
    if (!date) return void 0;
    if (!best || (latest ? date.ms > best.ms : date.ms < best.ms)) best = { ms: date.ms, text: item.trim() };
  }
  return best?.text;
}
function booleans(args) {
  const result = [];
  for (const arg of args) {
    for (const item of isRange(arg) ? arg : [arg]) {
      if (item === null || isRange(arg) && typeof item === "string") continue;
      const b = toBoolean(item);
      if (isError(b)) return b;
      result.push(b);
    }
  }
  return result;
}

// table-plus/src/formula/functions/sum.ts
var sum_default = {
  name: "SUM",
  syntax: "SUM(number1, [number2], \u2026)",
  description: "Adds numbers, cells and ranges; times add up to a time (14:00 and 20:00 are 34:00).",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => ns.reduce((a, b) => a + b, 0), true)
};

// table-plus/src/formula/functions/average.ts
var average_default = {
  name: "AVERAGE",
  syntax: "AVERAGE(number1, [number2], \u2026)",
  description: "The arithmetic mean of the numbers, or of the times.",
  minArgs: 1,
  call: (args) => withNumbers(
    args,
    (ns) => ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : new FormulaError("#DIV/0!", "no numbers to average"),
    true
  )
};

// table-plus/src/formula/functions/min.ts
var min_default = {
  name: "MIN",
  syntax: "MIN(number1, [number2], \u2026)",
  description: "The smallest of the numbers (0 if there are none), the shortest of the times, or the earliest of the dates.",
  minArgs: 1,
  call: (args) => extremeDate(args, false) ?? withNumbers(args, (ns) => ns.length ? Math.min(...ns) : 0, true)
};

// table-plus/src/formula/functions/max.ts
var max_default = {
  name: "MAX",
  syntax: "MAX(number1, [number2], \u2026)",
  description: "The largest of the numbers (0 if there are none), the longest of the times, or the latest of the dates.",
  minArgs: 1,
  call: (args) => extremeDate(args, true) ?? withNumbers(args, (ns) => ns.length ? Math.max(...ns) : 0, true)
};

// table-plus/src/formula/functions/product.ts
var product_default = {
  name: "PRODUCT",
  syntax: "PRODUCT(number1, [number2], \u2026)",
  description: "Multiplies the numbers.",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => ns.reduce((a, b) => a * b, 1))
};

// table-plus/src/formula/functions/count.ts
var count_default = {
  name: "COUNT",
  syntax: "COUNT(value1, [value2], \u2026)",
  description: "How many of the values are numbers.",
  minArgs: 1,
  call: (args) => {
    let count = 0;
    for (const arg of args) {
      for (const item of isRange(arg) ? arg : [arg]) {
        if (item === null || isError(item) || typeof item === "boolean") continue;
        if (!isError(toNumber(item))) count++;
      }
    }
    return count;
  }
};

// table-plus/src/formula/functions/counta.ts
var counta_default = {
  name: "COUNTA",
  syntax: "COUNTA(value1, [value2], \u2026)",
  description: "How many of the values are not empty.",
  minArgs: 1,
  call: (args) => flatten(args).filter((v) => v !== null && v !== "").length
};

// table-plus/src/formula/functions/round.ts
var round_default = {
  name: "ROUND",
  syntax: "ROUND(number, [digits])",
  description: "Rounds to the given number of decimal places (default 0), halves away from zero.",
  minArgs: 1,
  maxArgs: 2,
  call: ([number, digits = 0]) => {
    const n = toNumber(number);
    const d = toNumber(digits);
    if (isError(n)) return n;
    if (isError(d)) return d;
    const factor = 10 ** Math.trunc(d);
    return Math.sign(n) * Math.round(Math.abs(n) * factor * (1 + Number.EPSILON)) / factor;
  }
};

// table-plus/src/formula/functions/abs.ts
var abs_default = {
  name: "ABS",
  syntax: "ABS(number)",
  description: "The number without its sign.",
  minArgs: 1,
  maxArgs: 1,
  call: ([number]) => {
    const n = toNumber(number);
    return isError(n) ? n : Math.abs(n);
  }
};

// table-plus/src/formula/functions/if.ts
var if_default = {
  name: "IF",
  syntax: "IF(condition, value_if_true, [value_if_false])",
  description: "One value if the condition is true, another if it is false (default FALSE).",
  minArgs: 2,
  maxArgs: 3,
  call: ([condition, ifTrue, ifFalse = false]) => {
    const c = toBoolean(condition);
    if (isError(c)) return c;
    return single(c ? ifTrue : ifFalse);
  }
};

// table-plus/src/formula/functions/iferror.ts
var iferror_default = {
  name: "IFERROR",
  syntax: "IFERROR(value, value_if_error)",
  description: "The value, or the second value if the first is an error.",
  minArgs: 2,
  maxArgs: 2,
  call: ([value, ifError]) => {
    const v = single(value);
    return isError(v) ? single(ifError) : v;
  }
};

// table-plus/src/formula/functions/and.ts
var and_default = {
  name: "AND",
  syntax: "AND(logical1, [logical2], \u2026)",
  description: "TRUE if all of the values are true.",
  minArgs: 1,
  call: (args) => {
    const bs = booleans(args);
    return isError(bs) ? bs : bs.every(Boolean);
  }
};

// table-plus/src/formula/functions/or.ts
var or_default = {
  name: "OR",
  syntax: "OR(logical1, [logical2], \u2026)",
  description: "TRUE if any of the values is true.",
  minArgs: 1,
  call: (args) => {
    const bs = booleans(args);
    return isError(bs) ? bs : bs.some(Boolean);
  }
};

// table-plus/src/formula/functions/not.ts
var not_default = {
  name: "NOT",
  syntax: "NOT(logical)",
  description: "TRUE if the value is false, FALSE if it is true.",
  minArgs: 1,
  maxArgs: 1,
  call: ([value]) => {
    const b = toBoolean(value);
    return isError(b) ? b : !b;
  }
};

// table-plus/src/formula/functions/concat.ts
var concat_default = {
  name: "CONCAT",
  syntax: "CONCAT(text1, [text2], \u2026)",
  description: "Joins the values into one text.",
  minArgs: 1,
  call: (args) => {
    const error = firstError(args);
    if (error) return error;
    return flatten(args).map((v) => toText(v)).join("");
  }
};

// table-plus/src/formula/functions/today.ts
var today_default = {
  name: "TODAY",
  syntax: "TODAY()",
  description: "Today's date, e.g. 2025-11-06. The result is written when the table is calculated: the next day, Recalculate updates it.",
  minArgs: 0,
  maxArgs: 0,
  call: () => formatDate(now(false))
};

// table-plus/src/formula/functions/now.ts
var now_default = {
  name: "NOW",
  syntax: "NOW()",
  description: "The date and time now, e.g. 2025-11-06 14:30:15. The result is written when the table is calculated: Recalculate updates it.",
  minArgs: 0,
  maxArgs: 0,
  call: () => formatDate(now(true))
};

// table-plus/src/formula/functions/date.ts
var date_default = {
  name: "DATE",
  syntax: "DATE(year, month, day)",
  description: "The date of a year, month and day; a month or day past its end carries over (DATE(2025, 13, 1) is 2026-01-01).",
  minArgs: 3,
  maxArgs: 3,
  call: ([year, month, day]) => {
    const parts = [toNumber(year), toNumber(month), toNumber(day)];
    const error = parts.find(isError);
    if (error) return error;
    const [y, m, d] = parts.map((n) => Math.trunc(n));
    if (y < 0 || y > 9999) return new FormulaError("#NUM!", `${y} is not a year from 0 to 9999`);
    const ms = Date.UTC(y, m - 1, d);
    return Number.isNaN(ms) ? new FormulaError("#NUM!", "not a date") : formatDate({ ms, time: false });
  }
};

// table-plus/src/formula/functions/time.ts
var time_default = {
  name: "TIME",
  syntax: "TIME(hour, [minute], [second])",
  description: "A time of day, e.g. 14:30; past midnight it starts again (TIME(25, 0) is 01:00). Added to a date it gives the date with that time: DATE(2025, 11, 6) + TIME(14, 30) is 2025-11-06 14:30.",
  minArgs: 1,
  maxArgs: 3,
  call: ([hour, minute = 0, second = 0]) => {
    const parts = [toNumber(hour), toNumber(minute), toNumber(second)];
    const error = parts.find(isError);
    if (error) return error;
    const [h, m, s] = parts;
    const total = Math.round(h * 3600 + m * 60 + s);
    return total < 0 ? new FormulaError("#NUM!", "a time before midnight") : new TimeValue(total % DAY_SECONDS);
  }
};

// table-plus/src/formula/functions/int.ts
var int_default = {
  name: "INT",
  syntax: "INT(number)",
  description: "The number rounded down to a whole number; for a time, its whole days (INT(SUM(A1:A2)) of 14:00 and 20:00 is 1).",
  minArgs: 1,
  maxArgs: 1,
  call: ([number]) => {
    const time = asTime(single(number));
    if (time) return Math.floor(time.seconds / DAY_SECONDS);
    const n = toNumber(number);
    return isError(n) ? n : Math.floor(n);
  }
};

// table-plus/src/formula/functions/text.ts
function parseFormat(format) {
  const parts = [];
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    if (c === '"') {
      const close = format.indexOf('"', i + 1);
      if (close < 0) return new FormulaError("#VALUE!", "a text in the format is missing its closing quote");
      parts.push({ text: format.slice(i + 1, close) });
      i = close + 1;
    } else if (c === "\\") {
      parts.push({ text: format[i + 1] ?? "" });
      i += 2;
    } else if (c === "[") {
      const close = format.indexOf("]", i);
      const inner = close < 0 ? "" : format.slice(i + 1, close).toLowerCase();
      const unit = /^(h+|m+|s+)$/.exec(inner)?.[1]?.[0];
      if (!unit) return new FormulaError("#VALUE!", `"${format.slice(i, close + 1 || void 0)}" is not a code of TEXT: [h], [m] or [s]`);
      parts.push({ code: `[${unit}]`, length: inner.length });
      i = close + 1;
    } else if (/[ymdhs]/i.test(c)) {
      let j = i;
      while (j < format.length && format[j].toLowerCase() === c.toLowerCase()) j++;
      parts.push({ code: c.toLowerCase(), length: j - i });
      i = j;
    } else {
      parts.push({ text: c });
      i++;
    }
  }
  const codes = parts.filter((p) => "code" in p);
  return parts.map((part) => {
    if (!("code" in part) || part.code !== "m") return part;
    const at = codes.indexOf(part);
    const before = codes[at - 1]?.code;
    const after = codes[at + 1]?.code;
    return before === "h" || before === "[h]" || after === "s" || after === "[s]" ? { code: "min", length: part.length } : part;
  });
}
var pad = (n, length) => String(n).padStart(Math.min(length, 2), "0");
var text_default = {
  name: "TEXT",
  syntax: "TEXT(value, format)",
  description: 'A date or a time as text in a format: TEXT(A1, "dd.mm.yyyy hh:mm"), TEXT(A1, "[h]:mm") for all the hours of a length of time. Codes: yyyy, yy, m, mm, d, dd, h, hh, m, mm (minutes), s, ss, [h], [m], [s]; text in quotes as it is.',
  minArgs: 2,
  maxArgs: 2,
  call: ([value, format]) => {
    const v = single(value);
    const f = toText(format);
    if (isError(v)) return v;
    if (isError(f)) return f;
    const parts = parseFormat(f);
    if (isError(parts)) return parts;
    if (!parts.some((part) => "code" in part)) {
      return new FormulaError("#VALUE!", `"${f}" has no date or time code: yyyy, mm, dd, hh, mm, ss, [h], [m] or [s]`);
    }
    const date = typeof v === "string" ? parseDate(v) : void 0;
    const time = date ? void 0 : asTime(v);
    const seconds = time ? time.seconds : typeof v === "number" && !date ? Math.round(v * DAY_SECONDS) : void 0;
    if (!date && seconds === void 0) return new FormulaError("#VALUE!", `"${toText(v)}" is not a date or a time`);
    const d = date && new Date(date.ms);
    const ofDay = d ? d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() : (seconds % DAY_SECONDS + DAY_SECONDS) % DAY_SECONDS;
    let out = "";
    for (const part of parts) {
      if ("text" in part) {
        out += part.text;
        continue;
      }
      const { code, length } = part;
      if ((code === "y" || code === "m" || code === "d") && !d) {
        return new FormulaError("#VALUE!", "a time has no year, month or day: INT gives its whole days");
      }
      if ((code === "[h]" || code === "[m]" || code === "[s]") && d) {
        return new FormulaError("#VALUE!", `${code} is for a length of time, not a date: use hh, mm or ss`);
      }
      if ((code === "m" || code === "d") && length > 2) return new FormulaError("#VALUE!", "names of months and days are not supported");
      switch (code) {
        case "y":
          out += length <= 2 ? pad(d.getUTCFullYear() % 100, 2) : String(d.getUTCFullYear());
          break;
        case "m":
          out += pad(d.getUTCMonth() + 1, length);
          break;
        case "d":
          out += pad(d.getUTCDate(), length);
          break;
        case "h":
          out += pad(Math.floor(ofDay / 3600), length);
          break;
        case "min":
          out += pad(Math.floor(ofDay / 60) % 60, length);
          break;
        case "s":
          out += pad(ofDay % 60, length);
          break;
        case "[h]":
          out += pad(Math.trunc(seconds / 3600), length);
          break;
        case "[m]":
          out += pad(Math.trunc(seconds / 60), length);
          break;
        case "[s]":
          out += pad(seconds, length);
          break;
      }
    }
    return out;
  }
};

// table-plus/src/formula/functions/xlookup.ts
var xlookup_default = {
  name: "XLOOKUP",
  syntax: "XLOOKUP(value, lookup_range, result_range, [if_not_found])",
  description: 'Finds the value in one range or column and gives the value in the same place of another, e.g. XLOOKUP("Pear", prices![Name], prices![Price]); text is found ignoring case. Not found: if_not_found, else #N/A.',
  minArgs: 3,
  maxArgs: 4,
  call: ([value, lookIn, results, notFound]) => {
    const v = single(value);
    if (isError(v)) return v;
    if (isError(lookIn)) return lookIn;
    if (isError(results)) return results;
    const keys = isRange(lookIn) ? lookIn : [lookIn];
    const found = isRange(results) ? results : [results];
    if (keys.length !== found.length) {
      return new FormulaError("#VALUE!", `the ranges are not the same size (${keys.length} and ${found.length} cells)`);
    }
    const index = keys.findIndex((key) => sameValue(v, key));
    if (index < 0) return notFound === void 0 ? new FormulaError("#N/A", `"${toText(v)}" is not in the range`) : single(notFound);
    return found[index] ?? null;
  }
};

// table-plus/src/formula/functions/dateadd.ts
var dateadd_default = {
  name: "DATEADD",
  syntax: "DATEADD(date, amount, unit)",
  description: `The date plus an amount of a unit: "s", "min", "h", "d", "w", "m" (months) or "y" (or their names, "hours"). A negative amount goes back. Months and years keep the day or take the month's last.`,
  minArgs: 3,
  maxArgs: 3,
  call: ([date, amount, unit]) => {
    const d = toDate(date);
    const n = toNumber(amount);
    const u = toUnit(unit);
    if (isError(d)) return d;
    if (isError(n)) return n;
    if (isError(u)) return u;
    return formatDate(addUnits(d, n, u));
  }
};

// table-plus/src/formula/functions/datedif.ts
var datedif_default = {
  name: "DATEDIF",
  syntax: "DATEDIF(start, end, unit)",
  description: 'How many whole units lie from one date to another, in "s", "min", "h", "d", "w", "m" (months) or "y"; negative when the end is earlier. For days with a fraction, subtract the dates: end - start.',
  minArgs: 3,
  maxArgs: 3,
  call: ([start, end, unit]) => {
    const a = toDate(start);
    const b = toDate(end);
    const u = toUnit(unit);
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (isError(u)) return u;
    return unitsBetween(a, b, u);
  }
};

// table-plus/src/formula/functions/year.ts
var year_default = {
  name: "YEAR",
  syntax: "YEAR(date)",
  description: "The year of a date.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date);
    return isError(d) ? d : partOf(d, "year");
  }
};

// table-plus/src/formula/functions/month.ts
var month_default = {
  name: "MONTH",
  syntax: "MONTH(date)",
  description: "The month of a date, 1 to 12.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date);
    return isError(d) ? d : partOf(d, "month");
  }
};

// table-plus/src/formula/functions/day.ts
var day_default = {
  name: "DAY",
  syntax: "DAY(date)",
  description: "The day of a date's month, 1 to 31.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date);
    return isError(d) ? d : partOf(d, "day");
  }
};

// table-plus/src/formula/functions/hour.ts
var hour_default = {
  name: "HOUR",
  syntax: "HOUR(time)",
  description: "The hour of a time, or of a date's time, 0 to 23 (0 for a date without a time).",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date);
    return isError(d) ? d : partOf(d, "hour");
  }
};

// table-plus/src/formula/functions/minute.ts
var minute_default = {
  name: "MINUTE",
  syntax: "MINUTE(time)",
  description: "The minute of a time, or of a date's time, 0 to 59.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date);
    return isError(d) ? d : partOf(d, "minute");
  }
};

// table-plus/src/formula/functions/second.ts
var second_default = {
  name: "SECOND",
  syntax: "SECOND(time)",
  description: "The second of a time, or of a date's time, 0 to 59.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date);
    return isError(d) ? d : partOf(d, "second");
  }
};

// table-plus/src/formula/functions/weekday.ts
var weekday_default = {
  name: "WEEKDAY",
  syntax: "WEEKDAY(date, [type])",
  description: "The day of the week as a number: Sunday 1 to Saturday 7 (type 1, the default), or Monday 1 to Sunday 7 (type 2).",
  minArgs: 1,
  maxArgs: 2,
  call: ([date, type = 1]) => {
    const d = toDate(date);
    const t = toNumber(type);
    if (isError(d)) return d;
    if (isError(t)) return t;
    const day = partOf(d, "weekday");
    if (t === 1) return day + 1;
    if (t === 2) return day === 0 ? 7 : day;
    return new FormulaError("#NUM!", `${t} is not a type of WEEKDAY: 1 or 2`);
  }
};

// table-plus/src/formula/functions/index.ts
var ALL = [
  sum_default,
  average_default,
  min_default,
  max_default,
  product_default,
  count_default,
  counta_default,
  round_default,
  abs_default,
  if_default,
  iferror_default,
  and_default,
  or_default,
  not_default,
  concat_default,
  today_default,
  now_default,
  date_default,
  time_default,
  dateadd_default,
  datedif_default,
  year_default,
  month_default,
  day_default,
  hour_default,
  minute_default,
  second_default,
  weekday_default,
  int_default,
  text_default,
  xlookup_default
];
var FUNCTIONS = Object.fromEntries(ALL.map((f) => [f.name, f]));

// table-plus/src/formula/index.ts
var FORMULA_TAG_RE = /<meta\s+f\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\/?>/gi;
function formulaOf(cell) {
  const match = Array.from(cell.matchAll(FORMULA_TAG_RE)).pop();
  if (!match) return void 0;
  const formula = unescapeMetaValue(match[1] ?? match[2] ?? "").trim();
  const rest = cell.slice(0, match.index) + cell.slice(match.index + match[0].length);
  const name = cellNameOf(rest);
  return { formula: formula.startsWith("=") ? formula : `=${formula}`, value: withoutName(rest), ...name ? { name } : {} };
}
function formulaCell(value, formula, name) {
  const tag = `<meta f="${escapeMetaValue(formula)}">`;
  const shown = escapeCell(value);
  return withCellName(shown === "" ? tag : `${shown} ${tag}`, name);
}
function isFormulaInput(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("=") && trimmed.length > 1;
}
function isErrorText(text) {
  return ERROR_CODES.includes(text.trim());
}
function columnLetters(column) {
  let s = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + (n - 1) % 26) + s;
  }
  return s;
}
function columnIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function cellName(row, column) {
  return `${columnLetters(column)}${row + 1}`;
}
function areaText(area) {
  const start = cellName(area.top, area.left);
  return area.top === area.bottom && area.left === area.right ? start : `${start}:${cellName(area.bottom, area.right)}`;
}
function columnRefText(id, thisRow) {
  const name = id && columnKey(id.name);
  if (!id || !name) return void 0;
  return `[${thisRow ? "@" : ""}${name}${id.nth > 1 ? `:${id.nth}` : ""}]`;
}
function withColumnKeys(formula, headers) {
  let result = formula;
  for (const ref of references(formula).reverse()) {
    if (ref.kind !== "column" || ref.table) continue;
    const column = referencedColumn(headers, ref.name);
    const text = column === void 0 ? void 0 : columnRefText(columnIdOf(headers, column), ref.thisRow);
    if (text) result = result.slice(0, ref.from) + text + result.slice(ref.to);
  }
  return result;
}
function referencedColumnId(headers, written) {
  const exact = { name: written, nth: 1 };
  if (findColumn(headers, exact) !== void 0) return exact;
  const match = /^(.*\S)\s*:\s*([1-9]\d*)$/.exec(written);
  return match ? { name: match[1], nth: Number(match[2]) } : exact;
}
function referencedColumn(headers, written) {
  return findColumn(headers, referencedColumnId(headers, written));
}
function parseCellName(text) {
  const m = CELL_RE.exec(text);
  return m ? { row: Number(m[2]) - 1, column: columnIndex(m[1]) } : void 0;
}
var REF_ERROR = "#REF!";
var OPERATORS = ["<=", ">=", "<>", "+", "-", "*", "/", "^", "&", "=", "<", ">", "(", ")", ",", ";", ":", "%"];
function tokenize(formula) {
  const tokens = [];
  let i = formula.startsWith("=") ? 1 : 0;
  const fail = (detail) => ({ tokens, error: new FormulaError("#ERROR!", detail) });
  while (i < formula.length) {
    const ch = formula[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(formula.slice(i));
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]), from: i, to: i + number[0].length });
      i += number[0].length;
      continue;
    }
    if (formula.startsWith("[[", i)) {
      const close = formula.indexOf("]]", i + 2);
      const after = close < 0 ? null : /^([A-Za-z_][A-Za-z0-9_]*)(!?)/.exec(formula.slice(close + 2));
      if (close < 0) return fail("a page name is missing its closing ]]");
      if (!after || !after[2] && (CELL_RE.test(after[1]) || /^(true|false)$/i.test(after[1]))) {
        return fail("[[Page]] is followed by a table's name and !, as in [[Page]]prices!A1, or a cell's name");
      }
      const page = formula.slice(i + 2, close).trim();
      const to = close + 2 + after[0].length;
      tokens.push(after[2] ? { kind: "table", name: after[1], page, from: i, to } : { kind: "named", name: after[1], page, from: i, to });
      i = to;
      continue;
    }
    const table = /^([A-Za-z_][A-Za-z0-9_]*)!/.exec(formula.slice(i));
    if (table) {
      tokens.push({ kind: "table", name: table[1], from: i, to: i + table[0].length });
      i += table[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(formula.slice(i));
    if (name) {
      tokens.push({ kind: "name", text: name[0], from: i, to: i + name[0].length });
      i += name[0].length;
      continue;
    }
    if (ch === '"') {
      let value = "";
      let j = i + 1;
      for (; ; ) {
        if (j >= formula.length) return fail("a text is missing its closing quote");
        if (formula[j] === '"') {
          if (formula[j + 1] !== '"') break;
          value += '"';
          j += 2;
        } else value += formula[j++];
      }
      tokens.push({ kind: "string", value, from: i, to: j + 1 });
      i = j + 1;
      continue;
    }
    if (formula.startsWith(REF_ERROR, i)) {
      tokens.push({ kind: "ref-error", from: i, to: i + REF_ERROR.length });
      i += REF_ERROR.length;
      continue;
    }
    if (ch === "[") {
      const end = formula.indexOf("]", i);
      if (end < 0) return fail("a column name is missing its closing ]");
      const inner = formula.slice(i + 1, end);
      const thisRow = inner.startsWith("@");
      tokens.push({ kind: "column", name: (thisRow ? inner.slice(1) : inner).trim(), thisRow, from: i, to: end + 1 });
      i = end + 1;
      continue;
    }
    const op = OPERATORS.find((o) => formula.startsWith(o, i));
    if (!op) return fail(`unexpected "${ch}"`);
    tokens.push({ kind: "op", text: op, from: i, to: i + op.length });
    i += op.length;
  }
  return { tokens };
}
function references(formula) {
  const { tokens } = tokenize(formula);
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const previous = tokens[i - 1];
    const table = previous?.kind === "table" ? { table: tableRefOf(previous) } : {};
    if (token.kind === "column") {
      const row = previous?.kind === "name" && isRowName(tokens, i - 1) ? previous.text : void 0;
      const rowTable = row && tokens[i - 2]?.kind === "table" ? { table: tableRefOf(tokens[i - 2]) } : {};
      result.push({ kind: "column", name: token.name, thisRow: token.thisRow, from: token.from, to: token.to, ...row ? { row, ...rowTable } : table });
      continue;
    }
    if (token.kind !== "name") continue;
    const next = tokens[i + 1];
    if (next?.kind === "op" && next.text === "(") continue;
    const start = parseCellName(token.text);
    if (!start) continue;
    const colon = tokens[i + 1];
    const endToken = tokens[i + 2];
    const end = colon?.kind === "op" && colon.text === ":" && endToken?.kind === "name" ? parseCellName(endToken.text) : void 0;
    const area = end ? {
      top: Math.min(start.row, end.row),
      left: Math.min(start.column, end.column),
      bottom: Math.max(start.row, end.row),
      right: Math.max(start.column, end.column)
    } : { top: start.row, left: start.column, bottom: start.row, right: start.column };
    result.push({ kind: "area", area, from: token.from, to: end ? endToken.to : token.to, ...table });
    if (end) i += 2;
  }
  return result;
}
function isRowName(tokens, i) {
  const token = tokens[i];
  return token?.kind === "name" && tokens[i + 1]?.kind === "column" && !parseCellName(token.text) && !/^(true|false)$/i.test(token.text);
}
function tableRefOf(token) {
  return token.page === void 0 ? { name: token.name } : { name: token.name, page: token.page };
}
var Parser = class {
  constructor(formula, tokens) {
    this.formula = formula;
    this.tokens = tokens;
  }
  formula;
  tokens;
  at = 0;
  parse() {
    const node = this.comparison();
    const rest = this.tokens[this.at];
    if (rest) throw new FormulaError("#ERROR!", `unexpected "${this.text(rest)}"`);
    return node;
  }
  text(token) {
    return this.formula.slice(token.from, token.to);
  }
  peekOp(...ops) {
    const token = this.tokens[this.at];
    return token?.kind === "op" && ops.includes(token.text) ? token.text : void 0;
  }
  binary(next, ...ops) {
    let left = next();
    for (let op = this.peekOp(...ops); op; op = this.peekOp(...ops)) {
      this.at++;
      left = { kind: "binary", op, left, right: next() };
    }
    return left;
  }
  comparison = () => this.binary(this.concat, "=", "<>", "<", ">", "<=", ">=");
  concat = () => this.binary(this.additive, "&");
  additive = () => this.binary(this.multiplicative, "+", "-");
  multiplicative = () => this.binary(this.power, "*", "/");
  power = () => this.binary(this.unary, "^");
  unary = () => {
    const op = this.peekOp("-", "+");
    if (op) {
      this.at++;
      return { kind: "unary", op, arg: this.unary() };
    }
    let node = this.primary();
    while (this.peekOp("%")) {
      this.at++;
      node = { kind: "unary", op: "%", arg: node };
    }
    return node;
  };
  primary() {
    const token = this.tokens[this.at++];
    if (!token) throw new FormulaError("#ERROR!", "the formula ends too early");
    switch (token.kind) {
      case "number":
        return { kind: "literal", value: token.value };
      case "string":
        return { kind: "literal", value: token.value };
      case "column":
        return { kind: "column", name: token.name, thisRow: token.thisRow };
      case "ref-error":
        return { kind: "literal", value: new FormulaError("#REF!", "a reference to deleted cells") };
      case "named":
        return { kind: "named", name: token.name, page: token.page };
      case "table": {
        const next = this.tokens[this.at];
        const prefix = this.text(token);
        if (next?.kind === "ref-error") {
          this.at++;
          return { kind: "literal", value: new FormulaError("#REF!", `a reference to deleted cells of ${token.name}`) };
        }
        if (next?.kind === "column") {
          this.at++;
          if (next.thisRow) {
            throw new FormulaError("#ERROR!", `[@${next.name}] is a cell of the formula's own row: ${prefix}[${next.name}] is the other table's column`);
          }
          return { kind: "column", name: next.name, thisRow: false, table: tableRefOf(token) };
        }
        if (next?.kind === "name" && isRowName(this.tokens, this.at)) {
          this.at++;
          return { ...this.rowCell(next.text), table: tableRefOf(token) };
        }
        if (next?.kind === "name" && parseCellName(next.text) && !(this.tokens[this.at + 1]?.kind === "op" && this.text(this.tokens[this.at + 1]) === "(")) {
          this.at++;
          const area = this.name(next.text);
          if (area.kind === "area") return { ...area, table: tableRefOf(token) };
        }
        throw new FormulaError("#ERROR!", `${prefix} is followed by a cell, a range or a [column], as in ${prefix}A1`);
      }
      case "op":
        if (token.text === "(") {
          const inner = this.comparison();
          if (!this.peekOp(")")) throw new FormulaError("#ERROR!", "a ( is missing its )");
          this.at++;
          return inner;
        }
        throw new FormulaError("#ERROR!", `unexpected "${this.text(token)}"`);
      case "name":
        return this.name(token.text);
    }
  }
  /** The named row `row`'s cell in the [column] that follows (the token at `at`) */
  rowCell(row) {
    const column = this.tokens[this.at++];
    if (column.thisRow) throw new FormulaError("#ERROR!", `${row}[@${column.name}]: a row's cell is written ${row}[${column.name}]`);
    return { kind: "rowCell", row, column: column.name };
  }
  name(text) {
    if (this.peekOp("(")) {
      this.at++;
      const args = [];
      if (this.peekOp(")")) this.at++;
      else {
        for (; ; ) {
          args.push(this.comparison());
          if (this.peekOp(",", ";")) {
            this.at++;
            continue;
          }
          if (!this.peekOp(")")) throw new FormulaError("#ERROR!", `${text}( is missing its )`);
          this.at++;
          break;
        }
      }
      return { kind: "call", name: text.toUpperCase(), args };
    }
    const upper = text.toUpperCase();
    if (upper === "TRUE" || upper === "FALSE") return { kind: "literal", value: upper === "TRUE" };
    const start = parseCellName(text);
    if (isRowName(this.tokens, this.at - 1)) return this.rowCell(text);
    if (!start) return { kind: "named", name: text };
    if (!this.peekOp(":")) {
      return { kind: "area", area: { top: start.row, left: start.column, bottom: start.row, right: start.column }, range: false };
    }
    this.at++;
    const endToken = this.tokens[this.at++];
    const end = endToken?.kind === "name" ? parseCellName(endToken.text) : void 0;
    if (!end) throw new FormulaError("#ERROR!", `${text}: must be followed by a cell, as in ${text}:B3`);
    return {
      kind: "area",
      area: {
        top: Math.min(start.row, end.row),
        left: Math.min(start.column, end.column),
        bottom: Math.max(start.row, end.row),
        right: Math.max(start.column, end.column)
      },
      range: true
    };
  }
};
var parsed = /* @__PURE__ */ new Map();
function parse(formula) {
  let result = parsed.get(formula);
  if (result) return result;
  const { tokens, error } = tokenize(formula);
  if (error) result = error;
  else if (tokens.length === 0) result = new FormulaError("#ERROR!", "the formula is empty");
  else {
    try {
      result = new Parser(formula, tokens).parse();
    } catch (e) {
      if (!(e instanceof FormulaError)) throw e;
      result = e;
    }
  }
  if (parsed.size > 500) parsed.clear();
  parsed.set(formula, result);
  return result;
}
function autofixFormula(formula) {
  const unchanged = { formula, fixes: [] };
  if (!isError(parse(formula))) return unchanged;
  let depth = 0;
  let quote = false;
  let bracket = false;
  const extra = [];
  for (let i = formula.startsWith("=") ? 1 : 0; i < formula.length; i++) {
    const ch = formula[i];
    if (quote) {
      if (ch === '"') {
        if (formula[i + 1] === '"') i++;
        else quote = false;
      }
    } else if (bracket) {
      if (ch === "]") bracket = false;
    } else if (ch === '"') quote = true;
    else if (ch === "[") bracket = true;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth > 0) depth--;
      else extra.push(i);
    }
  }
  let fixed = formula;
  const fixes = [];
  if (extra.length) {
    const end = formula.trimEnd();
    if (!end.endsWith(")".repeat(extra.length)) || extra[0] !== end.length - extra.length) return unchanged;
    fixed = end.slice(0, extra[0]);
    fixes.push(`removed ${")".repeat(extra.length)}`);
  }
  if (quote) {
    fixed += '"';
    fixes.push('closed the text with "');
  }
  if (bracket) {
    fixed = `${fixed.trimEnd()}]`;
    fixes.push("closed the column name with ]");
  }
  if (depth > 0) {
    fixed = `${quote ? fixed : fixed.trimEnd()}${")".repeat(depth)}`;
    fixes.push(`added ${")".repeat(depth)}`);
  }
  if (fixes.length === 0 || isError(parse(fixed))) return unchanged;
  return { formula: fixed, fixes };
}
function wholeColumnNames(node, names) {
  switch (node.kind) {
    case "column":
      if (!node.thisRow && !node.table) names.add(node.name);
      break;
    case "call":
      for (const arg of node.args) wholeColumnNames(arg, names);
      break;
    case "unary":
      wholeColumnNames(node.arg, names);
      break;
    case "binary":
      wholeColumnNames(node.left, names);
      wholeColumnNames(node.right, names);
      break;
  }
  return names;
}
var DECIMAL_COMMA_RE = /\d,\d/;
var Book = class {
  constructor(source) {
    this.source = source;
  }
  source;
  sheets = /* @__PURE__ */ new Map();
  // The sheets by table, whether reached by the table's name or a named cell's
  tableSheets = /* @__PURE__ */ new Map();
  /** The cell named so on `page` (undefined: the formulas' page), in its table's sheet */
  cell(name, page) {
    const found = this.source?.cell?.(name, page);
    if (!found || found.row < 1) return void 0;
    return { sheet: this.sheetOf(found.table, page), row: found.row - 1, column: found.column };
  }
  /** The table's sheet, made on its first use (by its name or by a named cell's) */
  sheetOf(table, page) {
    let sheet = this.tableSheets.get(table);
    if (!sheet) {
      sheet = new Sheet(table, this, page);
      this.tableSheets.set(table, sheet);
    }
    return sheet;
  }
  /** The sheet a reference from `from` is to: the other table, or `from` itself when it is named so */
  sheet(ref, from) {
    const page = ref.page ?? from.page;
    if (page === from.page && from.name !== void 0 && from.name.toLowerCase() === ref.name.toLowerCase()) return from;
    const key = `${page ?? ""}\0${ref.name.toLowerCase()}`;
    let sheet = this.sheets.get(key);
    if (!sheet) {
      const table = this.source?.(ref.name, page);
      if (!table) return new FormulaError("#REF!", `there is no table named ${ref.name}${page === void 0 ? " on this page" : ` on ${page}`}`);
      sheet = this.sheetOf(table, page);
      this.sheets.set(key, sheet);
    }
    return sheet;
  }
};
var Sheet = class {
  /** `page`: the page the table is on, when it is not the formulas' own (its unnamed references are to tables there) */
  constructor(table, book = new Book(void 0), page) {
    this.table = table;
    this.book = book;
    this.page = page;
    this.name = table.meta?.name?.trim() || void 0;
    this.headers = table.rows[0]?.cells ?? [];
    this.body = table.rows.slice(1).map((r) => r.cells);
    let comma = 0;
    let point = 0;
    for (const cells of this.body) {
      for (const cell of cells) {
        if (formulaOf(cell)) continue;
        const text = unescapeCell(cell).trim();
        if (asNumber(text) === void 0) continue;
        if (DECIMAL_COMMA_RE.test(text)) comma++;
        else if (/\d\.\d/.test(text)) point++;
      }
    }
    this.decimalComma = comma > point;
  }
  table;
  book;
  page;
  headers;
  body;
  results = /* @__PURE__ */ new Map();
  evaluating = /* @__PURE__ */ new Set();
  // Numbers in the table are written with a decimal comma: results are too
  decimalComma;
  // The table's name, by which formulas refer to it
  name;
  totals;
  cellNames;
  rowNames;
  get rows() {
    return this.body.length;
  }
  get columns() {
    return this.headers.length;
  }
  /** A cell's value: a plain cell's text (a number if it reads as one), a formula cell's result */
  value(row, column) {
    const cell = this.body[row]?.[column];
    if (cell === void 0 || column >= this.columns) {
      return new FormulaError("#REF!", `${cellName(row, column)} is outside the table`);
    }
    const stored = formulaOf(cell);
    if (!stored) {
      const text = unescapeCell(withoutName(cell)).trim();
      if (text === "") return null;
      return asNumber(text) ?? parseClock(text) ?? text;
    }
    return this.result(row, column, stored.formula);
  }
  /** The result of the formula in a cell */
  result(row, column, formula) {
    const key = `${row},${column}`;
    const known = this.results.get(key);
    if (known !== void 0) return known;
    if (this.evaluating.has(key)) {
      return new FormulaError("#CYCLE!", `${cellName(row, column)} depends on its own result`);
    }
    this.evaluating.add(key);
    let result;
    try {
      const tree = parse(formula);
      result = isError(tree) ? tree : single(this.evaluate(tree, row, column));
      if (typeof result === "number" && !Number.isFinite(result) || result instanceof TimeValue && !Number.isFinite(result.seconds)) {
        result = new FormulaError("#NUM!", "the result is not a finite number");
      }
    } finally {
      this.evaluating.delete(key);
    }
    this.results.set(key, result);
    return result;
  }
  /** The text a formula cell shows for its result */
  text(row, column, formula) {
    const result = this.result(row, column, formula);
    if (isError(result)) return result.code;
    const text = toText(result);
    return typeof result === "number" && this.decimalComma ? text.replace(".", ",") : text;
  }
  /** Whether the cell holds a formula that refers to the whole column `target` */
  refersToColumn(row, column, target) {
    const stored = formulaOf(this.body[row]?.[column] ?? "");
    const tree = stored && parse(stored.formula);
    if (!tree || isError(tree)) return false;
    return Array.from(wholeColumnNames(tree, /* @__PURE__ */ new Set())).some((name) => referencedColumn(this.headers, name) === target);
  }
  /** The cell of the row named `row` in the column `column` */
  rowCellValue(row, column, prefix = "") {
    this.rowNames ??= namedRows(this.table);
    const r = this.rowNames.get(row.toLowerCase());
    if (r === void 0) return new FormulaError("#REF!", `there is no row named ${row}${prefix ? ` in ${prefix.slice(0, -1)}` : ""}`);
    const c = referencedColumn(this.headers, column);
    if (c === void 0) return new FormulaError("#REF!", `there is no column named "${column}"${prefix ? ` in ${prefix.slice(0, -1)}` : ""}`);
    return this.value(r - 1, c);
  }
  /** The values of an area: one cell's value, or a range's (`range`) */
  areaValue(area, range, prefix = "") {
    const { top, left, bottom, right } = area;
    if (bottom >= this.rows || right >= this.columns) {
      return new FormulaError("#REF!", `${prefix}${areaText(area)} is outside the table`);
    }
    const values = [];
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) values.push(this.value(r, c));
    }
    return range ? values : values[0];
  }
  /**
   * A column's values, without the table's total rows (see totalRows), so the
   * columns of a table line up: XLOOKUP over one gives the value beside it in another
   */
  columnValue(name, prefix = "") {
    const index = referencedColumn(this.headers, name);
    if (index === void 0) return new FormulaError("#REF!", `there is no column named "${name}"${prefix ? ` in ${prefix.slice(0, -1)}` : ""}`);
    const totals = this.totalRows();
    const values = [];
    for (let r = 0; r < this.rows; r++) {
      if (!totals.has(r)) values.push(this.value(r, index));
    }
    return values;
  }
  /**
   * The total rows: those with a cell that refers to its own whole column, as
   * =SUM([qty]) under Qty. A cell that refers to another column ([@qty] /
   * SUM([qty]) in a Share column) does not make its row one.
   */
  totalRows() {
    if (this.totals) return this.totals;
    const totals = /* @__PURE__ */ new Set();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.columns; c++) if (this.refersToColumn(r, c, c)) totals.add(r);
    }
    this.totals = totals;
    return totals;
  }
  /** A named cell's value: in this table, else on this table's page (or `page`) */
  named(name, page) {
    if (page === void 0 || page === this.page) {
      const own = this.cellNamed(name);
      if (own) return this.value(own.row, own.column);
    }
    const found = this.book.cell(name, page ?? this.page);
    if (!found) return new FormulaError("#NAME?", `there is no cell named ${name}${page ? ` on ${page}` : " on this page"}`);
    return found.sheet.value(found.row, found.column);
  }
  /** The body cell of this table named so (ignoring case), if any */
  cellNamed(name) {
    this.cellNames ??= namedCells(this.table);
    const found = this.cellNames.get(name.toLowerCase());
    return found && { row: found.row - 1, column: found.column };
  }
  /** The sheet a reference's table is: this one, or another the book has */
  sheetOf(table) {
    return table ? this.book.sheet(table, this) : this;
  }
  evaluate(node, row, column) {
    switch (node.kind) {
      case "literal":
        return node.value;
      case "area": {
        const sheet = this.sheetOf(node.table);
        if (isError(sheet)) return sheet;
        return sheet.areaValue(node.area, node.range, node.table ? `${node.table.name}!` : "");
      }
      case "column": {
        const sheet = this.sheetOf(node.table);
        if (isError(sheet)) return sheet;
        if (node.thisRow) {
          const index = referencedColumn(this.headers, node.name);
          return index === void 0 ? new FormulaError("#REF!", `there is no column named "${node.name}"`) : this.value(row, index);
        }
        return sheet.columnValue(node.name, node.table ? `${node.table.name}!` : "");
      }
      case "named":
        return this.named(node.name, node.page);
      case "rowCell": {
        const sheet = this.sheetOf(node.table);
        if (isError(sheet)) return sheet;
        return sheet.rowCellValue(node.row, node.column, node.table ? `${node.table.name}!` : "");
      }
      case "call": {
        const f = FUNCTIONS[node.name];
        if (!f) return new FormulaError("#NAME?", `there is no function ${node.name}`);
        if (node.args.length < f.minArgs || f.maxArgs !== void 0 && node.args.length > f.maxArgs) {
          return new FormulaError("#VALUE!", `wrong number of arguments: ${f.syntax}`);
        }
        return f.call(
          node.args.map((arg) => {
            const value = this.evaluate(arg, row, column);
            const reference = arg.kind === "area" || arg.kind === "column" && arg.thisRow;
            return reference && !isRange(value) && !isError(value) ? [value] : value;
          })
        );
      }
      case "unary": {
        const arg = this.evaluate(node.arg, row, column);
        const time = isRange(arg) ? void 0 : asTime(arg);
        if (time && node.op !== "%") return node.op === "-" ? new TimeValue(-time.seconds) : time;
        const n = toNumber(arg);
        if (isError(n)) return n;
        return node.op === "-" ? -n : node.op === "%" ? n / 100 : n;
      }
      case "binary":
        return this.binary(node.op, this.evaluate(node.left, row, column), this.evaluate(node.right, row, column));
    }
  }
  binary(op, leftValue, rightValue) {
    const left = single(leftValue);
    const right = single(rightValue);
    if (isError(left)) return left;
    if (isError(right)) return right;
    if (op === "&") return toText(left) + toText(right);
    const comparison = COMPARISONS[op];
    if (comparison) return comparison(compare(left, right));
    const dated = op === "+" || op === "-" ? dateArithmetic(op, left, right) : void 0;
    if (dated !== void 0) return dated;
    const timed = timeArithmetic(op, left, right);
    if (timed !== void 0) return timed;
    const a = toNumber(left);
    const b = toNumber(right);
    if (isError(a)) return a;
    if (isError(b)) return b;
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return b === 0 ? new FormulaError("#DIV/0!", "division by zero") : a / b;
      default:
        return a ** b;
    }
  }
};
var COMPARISONS = {
  "=": (o) => o === 0,
  "<>": (o) => o !== 0,
  "<": (o) => o < 0,
  ">": (o) => o > 0,
  "<=": (o) => o <= 0,
  ">=": (o) => o >= 0
};
function compare(a, b) {
  const da = typeof a === "string" ? parseDate(a) : void 0;
  const db = da && typeof b === "string" ? parseDate(b) : void 0;
  if (da && db) return da.ms - db.ms;
  const na = a === null ? 0 : toNumber(a);
  const nb = b === null ? 0 : toNumber(b);
  if (!isError(na) && !isError(nb) && typeof a !== "boolean" && typeof b !== "boolean") return na - nb;
  const ta = toText(a).toLowerCase();
  const tb = toText(b).toLowerCase();
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}
function hasFormulas(table) {
  return table.rows.some((row, r) => r > 0 && row.cells.some((cell) => formulaOf(cell) !== void 0));
}
function recalculate(table, tables) {
  if (!hasFormulas(table)) return table;
  const sheet = new Sheet(table, new Book(tables));
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      if (!stored) return;
      const updated = keepNames(formulaCell(sheet.text(r - 1, c, stored.formula), stored.formula), cell);
      if (updated !== cell) result = setCell(result, r, c, updated);
    });
  });
  return result;
}
function calculatedFormula(table, column, except) {
  let formula;
  for (let r = 1; r < table.rows.length; r++) {
    if (r === except || isTotalRow(table.rows[r].cells)) continue;
    const stored = formulaOf(table.rows[r].cells[column] ?? "");
    if (!stored || formula !== void 0 && formula !== stored.formula) return void 0;
    formula = stored.formula;
  }
  return formula;
}
function isTotalRow(cells) {
  return cells.some((cell) => {
    const stored = formulaOf(cell);
    const tree = stored && parse(stored.formula);
    return !!tree && !isError(tree) && wholeColumnNames(tree, /* @__PURE__ */ new Set()).size > 0;
  });
}
function withCalculatedCells(table, row) {
  let result = table;
  table.rows[row]?.cells.forEach((cell, column) => {
    if (cell.trim() !== "") return;
    const formula = calculatedFormula(table, column, row);
    if (formula) result = setCell(result, row, column, formulaCell("", formula));
  });
  return result;
}
function formulaCount(table) {
  return table.rows.reduce((n, row, r) => n + (r === 0 ? 0 : row.cells.filter((cell) => formulaOf(cell)).length), 0);
}
function withoutFormulas(table) {
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      if (stored) result = setCell(result, r, c, keepNames(stored.value, cell));
    });
  });
  return result;
}
function formulasAfterEdit(before, after, edit) {
  let table = after;
  if (edit.rowMap) {
    const kept = /* @__PURE__ */ new Set();
    for (let r = 0; r < before.rows.length; r++) {
      const moved2 = edit.rowMap(r);
      if (moved2 !== void 0) kept.add(moved2);
    }
    for (let r = 1; r < after.rows.length; r++) if (!kept.has(r)) table = withCalculatedCells(table, r);
  }
  return recalculate(shiftReferences(before, table, edit.rowMap, edit.columnMap), edit.tables);
}
function namedReferences(formula) {
  const { tokens } = tokenize(formula);
  const result = [];
  tokens.forEach((token, i) => {
    if (token.kind === "named") {
      result.push({ name: token.name, page: token.page });
      return;
    }
    if (token.kind !== "name" || parseCellName(token.text) || /^(true|false)$/i.test(token.text)) return;
    const next = tokens[i + 1];
    if (next?.kind === "op" && next.text === "(" || next?.kind === "column") return;
    const previous = tokens[i - 1];
    if (previous?.kind === "table" || previous?.kind === "op" && previous.text === ":") return;
    result.push({ name: token.text });
  });
  return result;
}
function referredCellNames(table) {
  const names = /* @__PURE__ */ new Set();
  forFormulas(table, (formula) => {
    for (const ref of namedReferences(formula)) if (ref.page === void 0) names.add(ref.name.toLowerCase());
  });
  return names;
}
function cellNamesOf(table) {
  return new Set(namedCells(table).keys());
}
function forFormulas(table, each) {
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    for (const cell of row.cells) {
      const stored = formulaOf(cell);
      if (stored) each(stored.formula);
    }
  });
}
function referredPages(table) {
  const pages = /* @__PURE__ */ new Set();
  forFormulas(table, (formula) => {
    for (const ref of references(formula)) if (ref.table?.page) pages.add(ref.table.page);
    for (const ref of namedReferences(formula)) if (ref.page) pages.add(ref.page);
  });
  return pages;
}
function referredTableNames(table) {
  const names = /* @__PURE__ */ new Set();
  forFormulas(table, (formula) => {
    for (const token of tokenize(formula).tokens) {
      if (token.kind === "table" && token.page === void 0) names.add(token.name.toLowerCase());
    }
  });
  return names;
}
function formulaErrors(table, tables) {
  const errors = /* @__PURE__ */ new Map();
  if (!hasFormulas(table)) return errors;
  const sheet = new Sheet(table, new Book(tables));
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      const result = stored && sheet.result(r - 1, c, stored.formula);
      if (isError(result)) errors.set(`${r},${c}`, `${result.code} ${result.detail}`);
    });
  });
  return errors;
}
function mapSpan(a, b, map) {
  const mapped = [];
  for (let i = a; i <= b; i++) {
    const m = map(i);
    if (m !== void 0) mapped.push(m);
  }
  if (mapped.length === 0) return void 0;
  const lo = Math.min(...mapped);
  const hi = Math.max(...mapped);
  const ordered = mapped.every((m, i) => i === 0 || m > mapped[i - 1]);
  if (ordered || hi - lo + 1 === mapped.length) return [lo, hi];
  const sorted = [...mapped].sort((x, y) => x - y);
  let best = [sorted[0], sorted[0]];
  let start = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue;
    const end = sorted[i - 1];
    if (end - start > best[1] - best[0]) best = [start, end];
    if (i < sorted.length) start = sorted[i];
  }
  return best;
}
function followedReference(formula, ref, edit) {
  const { rowMap, columnMap } = edit;
  if (ref.kind === "area") {
    if (!rowMap && !columnMap) return void 0;
    const bodyMap = (b) => {
      const r = rowMap ? rowMap(b + 1) : b + 1;
      return r === void 0 || r < 1 ? void 0 : r - 1;
    };
    const rows = mapSpan(ref.area.top, ref.area.bottom, bodyMap);
    const cols = mapSpan(ref.area.left, ref.area.right, columnMap ?? ((c) => c));
    const written = formula.slice(ref.from, ref.to);
    const text = rows && cols ? written.includes(":") ? `${cellName(rows[0], cols[0])}:${cellName(rows[1], cols[1])}` : cellName(rows[0], cols[0]) : REF_ERROR;
    return text === written.toUpperCase() ? void 0 : text;
  }
  const headersBefore = edit.before.rows[0]?.cells ?? [];
  const id = referencedColumnId(headersBefore, ref.name);
  const followed = followColumn(headersBefore, edit.after.rows[0]?.cells ?? [], id, columnMap ?? ((c) => c));
  if (followed === void 0) return void 0;
  if (followed === null) return REF_ERROR;
  return sameColumnId(followed, id) ? void 0 : columnRefText(followed, ref.thisRow);
}
function withFormulas(table, rewrite) {
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      if (!stored) return;
      const formula = rewrite(stored.formula);
      if (formula !== stored.formula) result = setCell(result, r, c, keepNames(formulaCell(stored.value, formula), cell));
    });
  });
  return result;
}
function rewriteReferences(formula, follows, edit) {
  let result = formula;
  for (const ref of references(formula).reverse()) {
    if (!follows(ref)) continue;
    const text = followedReference(formula, ref, edit);
    if (text !== void 0) result = result.slice(0, ref.from) + text + result.slice(ref.to);
  }
  return result;
}
function newName(edit) {
  const from = edit.before.meta?.name?.trim();
  const to = edit.after.meta?.name?.trim();
  return from && to && from.toLowerCase() !== to.toLowerCase() ? to : void 0;
}
function isTo(ref, name) {
  return !!ref.table && ref.table.page === void 0 && !!name && ref.table.name.toLowerCase() === name.toLowerCase();
}
function shiftReferences(before, after, rowMap, columnMap) {
  if (!hasFormulas(after)) return after;
  const edit = { before, after, rowMap, columnMap };
  const own = before.meta?.name?.trim();
  const renamed = newName(edit);
  return withFormulas(after, (formula) => renameIn(rewriteReferences(formula, (ref) => !ref.table || isTo(ref, own), edit), own, renamed));
}
function renameIn(formula, own, renamed) {
  if (!renamed || !own) return formula;
  let result = formula;
  for (const token of tokenize(formula).tokens.reverse()) {
    if (token.kind === "table" && token.page === void 0 && token.name.toLowerCase() === own.toLowerCase()) {
      result = `${result.slice(0, token.from)}${renamed}!${result.slice(token.to)}`;
    }
  }
  return result;
}
function followTable(table, before, after, rowMap, columnMap) {
  const name = before.meta?.name?.trim();
  if (!name || !hasFormulas(table)) return table;
  const edit = { before, after, rowMap, columnMap };
  const renamed = newName(edit);
  return withFormulas(table, (formula) => renameIn(rewriteReferences(formula, (ref) => isTo(ref, name), edit), name, renamed));
}
var REFERENCE_HELP = {
  syntax: "A1 \xB7 A1:B3 \xB7 [Column] \xB7 [@Column] \xB7 table!A1 \xB7 table![Column] \xB7 cell_name",
  description: "A cell (A1 is the first row under the header), a range, a whole column by its name, that column in this row, a cell, range or column of another table on the page by its name, or a named cell. Click or drag in the table to insert one, click a header for its column."
};
var BEFORE_OPERAND = /* @__PURE__ */ new Set(["=", "(", ",", ";", "+", "-", "*", "/", "^", "&", "<", ">"]);
function referenceSlot(formula, start, end, pointed) {
  if (!formula.trimStart().startsWith("=")) return void 0;
  if (pointed && start === pointed.to && end === pointed.to && formula.slice(pointed.from, pointed.to) === pointed.text) {
    return { from: pointed.from, to: pointed.to };
  }
  if (tokenize(formula.slice(0, start)).error) return void 0;
  const before = formula.slice(0, start).trimEnd();
  const after = formula.slice(end).trimStart();
  if (/^[A-Za-z0-9_.["#(]/.test(after)) return void 0;
  return BEFORE_OPERAND.has(before[before.length - 1] ?? "") ? { from: start, to: end } : void 0;
}
function completeFunction(text, start, end) {
  if (start !== end || !text.trimStart().startsWith("=")) return void 0;
  const before = text.slice(0, start);
  const typing = /([A-Za-z][A-Za-z0-9_.]*)$/.exec(before)?.[1];
  if (!typing || /[0-9]/.test(typing) || text[start] === "(" || /[A-Za-z0-9_.]/.test(text[start] ?? "")) return void 0;
  if (tokenize(before).error) return void 0;
  const prefix = typing.toUpperCase();
  const names = Object.keys(FUNCTIONS).filter((name2) => name2.startsWith(prefix));
  const name = names.length === 1 ? names[0] : names.find((n) => n === prefix);
  return name ? { from: start - typing.length, to: start, text: `${name}(` } : void 0;
}
function formulaHelp(text, caret) {
  if (!text.trimStart().startsWith("=")) return [];
  const before = text.slice(0, caret);
  const typing = /([A-Za-z][A-Za-z0-9_.]*)$/.exec(before)?.[1];
  if (typing && !/[0-9]/.test(typing) && text[caret] !== "(") {
    const prefix = typing.toUpperCase();
    const matches = Object.entries(FUNCTIONS).filter(([name]) => name.startsWith(prefix));
    if (matches.length) return matches.map(([, f]) => ({ syntax: f.syntax, description: f.description }));
  }
  const { tokens } = tokenize(before);
  const open = [];
  tokens.forEach((token, i) => {
    if (token.kind !== "op") return;
    if (token.text === "(") {
      const previous = tokens[i - 1];
      open.push(previous?.kind === "name" ? previous.text.toUpperCase() : void 0);
    } else if (token.text === ")") open.pop();
  });
  for (let i = open.length - 1; i >= 0; i--) {
    const f = open[i] && FUNCTIONS[open[i]];
    if (f) return [{ syntax: f.syntax, description: f.description }];
  }
  return [REFERENCE_HELP];
}

// table-plus/src/types/helpers.ts
function numberOf(text) {
  return asNumber(text);
}
function notANumber(text) {
  return numberOf(text) === void 0 ? `"${text}" is not a number` : void 0;
}
function formatNumber2(n, locale, options = {}) {
  return new Intl.NumberFormat(locale, options).format(n);
}

// table-plus/src/types/check.ts
var YES = /* @__PURE__ */ new Set(["yes", "y", "true", "x", "\u2713", "\u2714", "\u2705", "done", "ok"]);
var NO = /* @__PURE__ */ new Set(["no", "n", "false", "\u2717", "\u274C", "-"]);
function yesOrNo(text) {
  const t = text.trim().toLowerCase();
  if (YES.has(t)) return true;
  if (NO.has(t)) return false;
  const n = numberOf(t);
  return n === void 0 ? void 0 : n > 0;
}
var check_default = {
  name: "check",
  syntax: "#check",
  description: "Yes or no as a check mark: yes, true, x, \u2705 or a number above 0 shows \u2705; no, false, \u274C, 0 or a number below it shows \u274C.",
  icon: lineIcon('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>'),
  aliases: { logical: "" },
  check: (text) => yesOrNo(text) === void 0 ? `"${text}" is not yes, no or a number` : void 0,
  format: (text) => yesOrNo(text) ? "\u2705" : "\u274C",
  sortValue: (text) => yesOrNo(text) ? "1" : "0",
  choices: () => [
    { value: "yes", label: "\u2705 yes" },
    { value: "no", label: "\u274C no" }
  ]
};

// table-plus/src/types/currency.ts
function homeOf(code) {
  if (code === "EUR") return "de";
  try {
    return new Intl.Locale("und", { region: code.slice(0, 2) }).maximize().baseName;
  } catch {
    return "en";
  }
}
function formatMoney(n, code, locale) {
  const options = { style: "currency", currency: code, currencyDisplay: "narrowSymbol" };
  const own = new Intl.NumberFormat(locale, options).formatToParts(n);
  const home = new Intl.NumberFormat(homeOf(code), options).formatToParts(n);
  const symbol = own.find((p) => p.type === "currency")?.value ?? code;
  const sign = own.filter((p) => p.type === "minusSign" || p.type === "plusSign").map((p) => p.value).join("");
  const digits = own.filter((p) => !["currency", "minusSign", "plusSign", "literal"].includes(p.type)).map((p) => p.value).join("");
  const symbolFirst = home.findIndex((p) => p.type === "currency") < home.findIndex((p) => p.type === "integer");
  const gap = home.find((p) => p.type === "literal" && /^\s+$/.test(p.value))?.value ?? "";
  return symbolFirst ? `${sign}${symbol}${gap}${digits}` : `${sign}${digits}${gap}${symbol}`;
}
var currency_default = {
  name: "currency",
  syntax: "#currency, #currency-usd",
  description: "An amount of money: the currency's three-letter code after the dash (default EUR). Its sign goes where the currency's country writes it: $12.99, 12.99 \u20AC, 12.99 K\u010D.",
  icon: lineIcon('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  param: /^[a-z]{3}$/i,
  aliases: { euro: "eur", eur: "eur", usd: "usd", czk: "czk", gbp: "gbp" },
  check: notANumber,
  format: (text, param, locale) => formatMoney(numberOf(text), (param ?? "eur").toUpperCase(), locale)
};

// table-plus/src/types/date.ts
var date_default2 = {
  name: "date",
  syntax: "#date, #date-long",
  description: "A date written as 2025-11-06 (with a time: 2025-11-06 14:30), shown as the locale writes it: short, medium (default) or long after the dash.",
  icon: lineIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  param: /^(short|medium|long)$/i,
  // Read as formulas read dates
  check: (text) => parseDate(text) ? void 0 : `"${text}" is not a date written as 2025-11-06`,
  format: (text, param, locale) => {
    const { ms, time } = parseDate(text);
    const dateStyle = param?.toLowerCase() ?? "medium";
    const timeStyle = ms % 6e4 !== 0 ? "medium" : "short";
    return new Intl.DateTimeFormat(locale, { dateStyle, ...time ? { timeStyle } : {}, timeZone: "UTC" }).format(new Date(ms));
  }
};

// table-plus/src/types/link.ts
var link_default = {
  name: "link",
  syntax: "#link",
  description: "A web address as a link, shown without its https://.",
  icon: lineIcon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  check: (text) => /^https?:\/\/\S+$/.test(text.trim()) ? void 0 : `"${text}" is not a web address starting with http:// or https://`,
  format: (text) => ({ text: text.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), href: text.trim() })
};

// table-plus/src/types/number.ts
var number_default = {
  name: "number",
  syntax: "#number, #number-2",
  description: "A number with thousands separators: the decimal places after the dash (default: as written).",
  icon: lineIcon('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>'),
  param: /^\d$/,
  aliases: { int: "0", float: "2" },
  check: notANumber,
  format: (text, param, locale) => {
    const digits = param === void 0 ? void 0 : Number(param);
    return formatNumber2(numberOf(text), locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits ?? 10
    });
  }
};

// table-plus/src/types/percent.ts
function fraction(text) {
  const n = numberOf(text);
  return text.includes("%") ? n / 100 : n;
}
var percent_default = {
  name: "percent",
  syntax: "#percent, #percent-1",
  description: "A fraction as a percentage, 0.15 is 15 % (15 % stays 15 %): the decimal places after the dash (default 0).",
  icon: lineIcon('<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
  param: /^\d$/,
  check: notANumber,
  format: (text, param, locale) => {
    const digits = Number(param ?? 0);
    return formatNumber2(fraction(text), locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  sortValue: (text) => String(fraction(text))
};

// table-plus/src/types/progress.ts
var most = (param) => Number(param ?? 100);
var progress_default = {
  name: "progress",
  syntax: "#progress, #progress-10",
  description: "Progress as a bar: a number from 0 to the maximum after the dash (default 100).",
  icon: lineIcon('<rect x="2" y="8" width="20" height="8" rx="4"/><path d="M6 12h5"/>'),
  param: /^[1-9]\d*$/,
  aliases: { gauge: "100" },
  check: (text, param) => {
    const n = numberOf(text);
    return n !== void 0 && n >= 0 && n <= most(param) ? void 0 : `"${text}" is not a number from 0 to ${most(param)}`;
  },
  format: (text, param, locale) => {
    const share = numberOf(text) / most(param);
    const filled = Math.round(share * 10);
    return `${"\u25B0".repeat(filled)}${"\u25B1".repeat(10 - filled)} ${formatNumber2(share, locale, { style: "percent" })}`;
  }
};

// table-plus/src/types/stars.ts
var most2 = (param) => Number(param ?? 5);
var stars_default = {
  name: "stars",
  syntax: "#stars, #stars-10",
  description: "A rating as stars: a whole number from 0 to the most stars after the dash (default 5).",
  icon: lineIcon('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>'),
  param: /^[1-9]\d?$/,
  aliases: { evaluation: "5" },
  check: (text, param) => {
    const n = numberOf(text);
    return n !== void 0 && Number.isInteger(n) && n >= 0 && n <= most2(param) ? void 0 : `"${text}" is not a whole number from 0 to ${most2(param)}`;
  },
  format: (text, param) => {
    const n = numberOf(text);
    return "\u2605".repeat(n) + "\u2606".repeat(most2(param) - n);
  },
  choices: (param) => Array.from({ length: most2(param) + 1 }, (_, n) => ({
    value: String(n),
    label: `${n} ${"\u2605".repeat(n)}${"\u2606".repeat(most2(param) - n)}`
  }))
};

// table-plus/src/types/time.ts
function secondsOf(text) {
  const seconds = parseClock(text)?.seconds ?? fractionSeconds(text);
  return seconds !== void 0 && seconds >= 0 && seconds < DAY_SECONDS ? seconds : void 0;
}
function fractionSeconds(text) {
  const fraction2 = numberOf(text);
  return fraction2 === void 0 ? void 0 : Math.round(fraction2 * DAY_SECONDS);
}
var time_default2 = {
  name: "time",
  syntax: "#time",
  description: "A time of day written as 14:30 or 14:30:15 (or as a fraction of a day, 0.5 is 12:00), shown as the locale writes times.",
  icon: lineIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  check: (text) => secondsOf(text) !== void 0 ? void 0 : `"${text}" is not a time written as 14:30`,
  format: (text, _param, locale) => {
    const seconds = secondsOf(text);
    return new Intl.DateTimeFormat(locale, { timeStyle: seconds % 60 ? "medium" : "short", timeZone: "UTC" }).format(
      new Date(seconds * 1e3)
    );
  },
  // The time written in full (09:05, 12:00 for 0.5): sorts by the time, and filters and copies still find 9:05
  sortValue: (text) => formatClock(secondsOf(text))
};

// table-plus/src/types/trend.ts
var ARROWS = { "+": "\u{1F53C}", "-": "\u{1F53D}", "=": "\u27A1\uFE0F" };
function arrowOf(text) {
  const t = text.trim();
  if (ARROWS[t]) return ARROWS[t];
  const n = numberOf(t);
  return n === void 0 ? void 0 : n > 0 ? ARROWS["+"] : n < 0 ? ARROWS["-"] : ARROWS["="];
}
var trend_default = {
  name: "trend",
  syntax: "#trend",
  description: "A trend as an arrow: + or a number above 0 shows \u{1F53C}, - or one below 0 shows \u{1F53D}, = or 0 shows \u27A1\uFE0F.",
  icon: lineIcon('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  check: (text) => arrowOf(text) ? void 0 : `"${text}" is not +, -, = or a number`,
  format: (text) => arrowOf(text),
  choices: () => Object.entries(ARROWS).map(([value, arrow]) => ({ value, label: `${arrow} ${value}` }))
};

// table-plus/src/types/unit.ts
var unit_default = {
  name: "unit",
  syntax: "#unit-kg",
  description: "A number with a unit: the unit after the dash.",
  icon: lineIcon('<path d="M3 16 16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>'),
  param: /^[^\s#]+$/,
  aliases: { kg: "kg", km: "km", watt: "W" },
  check: (text, param) => param === void 0 ? "#unit needs a unit, e.g. #unit-kg" : notANumber(text),
  format: (text, param, locale) => `${formatNumber2(numberOf(text), locale, { maximumFractionDigits: 10 })} ${param}`
};

// table-plus/src/types/index.ts
var ALL2 = [currency_default, number_default, percent_default, unit_default, stars_default, check_default, date_default2, time_default2, trend_default, progress_default, link_default];
var TYPES = new Map(ALL2.map((t) => [t.name, t]));
var ALIASES = new Map(
  ALL2.flatMap((t) => Object.entries(t.aliases ?? {}).map(([alias, param]) => [alias, { type: t, param: param || void 0 }]))
);
var HASHTAG_RE2 = /(^|\s)#([^\s#]+)/g;
function typeOfTag(tag) {
  const lower = tag.toLowerCase();
  const alias = ALIASES.get(lower);
  if (alias) return { ...alias, tag };
  const dash = lower.indexOf("-");
  const type = TYPES.get(dash < 0 ? lower : lower.slice(0, dash));
  const param = dash < 0 ? void 0 : tag.slice(dash + 1);
  if (!type || param !== void 0 && !type.param?.test(param)) return void 0;
  return { type, param, tag };
}
function columnTypeOf(header) {
  for (const match of header.matchAll(HASHTAG_RE2)) {
    const typed = typeOfTag(match[2]);
    if (typed) return typed;
  }
  return void 0;
}
function withColumnType(header, tag) {
  const rest = header.replace(HASHTAG_RE2, (all, space, name2) => typeOfTag(name2) ? space : all);
  const name = rest.replace(/\s+/g, " ").trim();
  return tag ? `${name} #${tag}` : name;
}
function typeTagPatterns() {
  return {
    exact: [...ALL2.map((t) => t.name), ...ALIASES.keys()],
    prefixes: ALL2.filter((t) => t.param).map((t) => `${t.name}-`)
  };
}

// table-plus/src/features/types.ts
function iconOf(type) {
  return type.icon ?? ICONS.columnType;
}
function typeLabel(name) {
  return name[0].toUpperCase() + name.slice(1);
}
function typeDetail(type, tag) {
  const aliases = Object.keys(type.aliases ?? {}).map((alias) => `#${alias}`);
  return {
    title: tag ? `${typeLabel(type.name)}: #${tag}` : typeLabel(type.name),
    code: type.syntax.split(",").map((form) => form.trim()),
    text: type.description,
    notes: aliases.length ? [`Also written as ${aliases.join(", ")}`] : void 0
  };
}
function hiddenTagsCss() {
  const { exact, prefixes } = typeTagPatterns();
  const selectors = [
    ...exact.map((tag) => `.sb-table-widget thead [data-tag-name="${tag}" i]`),
    ...prefixes.map((prefix) => `.sb-table-widget thead [data-tag-name^="${prefix}" i]`)
  ];
  return `${selectors.join(",\n")} {
  display: none;
}
`;
}
var ColumnTypes = class {
  constructor(host) {
    this.host = host;
    this.style = host.doc.createElement("style");
    this.style.dataset.tablePlus = "types";
    this.style.textContent = hiddenTagsCss();
    host.doc.head.append(this.style);
    this.picker = host.floating("div", "tp-choices");
    this.picker.setAttribute("role", "listbox");
  }
  host;
  style;
  // A list of the type's values under the cell editor (a datalist would offer
  // only the values that start with what the field holds: none to change to)
  picker;
  picking;
  stop() {
    this.style.remove();
    this.picker.remove();
  }
  owns(node) {
    return this.picker.contains(node);
  }
  layoutChanged() {
    if (this.picking && this.picker.classList.contains("tp-visible")) this.placePicker(this.picking.editor);
  }
  // ---- the column menu ----------------------------------------------------------
  /** "Type: …" in a column's menu: picks the column's type, written as a hashtag in its header */
  columnMenuEntries(widget, info, column, open) {
    const header = parseTable(info.source).rows[0]?.cells[column] ?? "";
    const current = columnTypeOf(unescapeCell(header));
    const setType = (tag) => () => void this.host.write(widget, (t) => setCell(t, 0, column, withColumnType(t.rows[0]?.cells[column] ?? "", tag)));
    const choices = [
      { kind: "item", label: "No type", icon: ICONS.clear, checked: !current, run: setType(void 0) },
      { kind: "separator" },
      ...Array.from(TYPES.values()).map((type) => {
        const first = type.syntax.split(",")[0].trim();
        return {
          kind: "item",
          label: typeLabel(type.name),
          icon: iconOf(type),
          checked: current?.type === type,
          detail: typeDetail(type),
          run: setType(current?.type === type ? current.tag : first.slice(1))
        };
      })
    ];
    return [
      {
        kind: "item",
        // The same icon whatever the type, so the item is easy to find; the type's own after its name
        label: "Type",
        icon: ICONS.columnType,
        ...current ? { value: { text: typeLabel(current.type.name), icon: iconOf(current.type) } } : {},
        ...current ? { detail: typeDetail(current.type, current.tag) } : { hint: "How the column's cells show" },
        run: () => open("Column type", choices)
      }
    ];
  }
  // ---- the cell editor ------------------------------------------------------------
  /** A header is edited as the column's name: its type's hashtag is the menu's business */
  editorText(info, cell, original) {
    if (cell.row !== 0 || !columnTypeOf(unescapeCell(original))) return void 0;
    return unescapeCell(withColumnType(original, void 0));
  }
  /** The type of the edited cell's column, if any (header cells have none) */
  typeOfEdited(editor) {
    if (editor.row === 0) return void 0;
    const header = parseTable(this.host.infoOf(editor.widget)?.source ?? "").rows[0]?.cells[editor.column];
    return header === void 0 ? void 0 : columnTypeOf(unescapeCell(header));
  }
  /** A type with values to offer: a list of them under the cell, picked with the mouse or the arrows and Enter */
  editorOpened(editor) {
    const typed = this.typeOfEdited(editor);
    const choices = typed?.type.choices?.(typed.param);
    if (!choices?.length) return;
    this.picking = { editor, choices, shown: [], active: -1 };
    editor.field.addEventListener("input", () => {
      if (this.picking?.editor === editor) this.showChoices();
    });
    this.showChoices();
  }
  editorClosed() {
    this.picking = void 0;
    this.picker.classList.remove("tp-visible");
  }
  /** Arrows move along the list, Enter takes the value they are on (and then saves as Enter does) */
  editorKeyDown(e, editor) {
    const picking = this.picking;
    if (!picking || picking.editor !== editor || !this.picker.classList.contains("tp-visible")) return false;
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const count = picking.shown.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      picking.active = e.key === "ArrowDown" ? (picking.active + 1) % count : (picking.active - 1 + count) % count;
      this.renderChoices();
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey && picking.active >= 0) editor.field.value = picking.shown[picking.active].value;
    return false;
  }
  /**
   * The values for what the field holds: all of them while it holds what the
   * cell had (even a value not of the type), is empty or is one of them (to
   * change it to another), else those that contain what is typed
   */
  showChoices() {
    const picking = this.picking;
    if (!picking) return;
    const field = picking.editor.field;
    const typed = field.value.trim().toLowerCase();
    const isChoice = picking.choices.some((c) => c.value.toLowerCase() === typed);
    picking.shown = typed === "" || isChoice || field.value === picking.editor.initial ? picking.choices : picking.choices.filter((c) => c.value.toLowerCase().includes(typed) || c.label.toLowerCase().includes(typed));
    picking.active = picking.shown.findIndex((c) => c.value.toLowerCase() === typed);
    if (!picking.shown.length || typed.startsWith("=")) {
      this.picker.classList.remove("tp-visible");
      return;
    }
    this.renderChoices();
    this.placePicker(picking.editor);
  }
  renderChoices() {
    const picking = this.picking;
    if (!picking) return;
    const typed = picking.editor.field.value.trim().toLowerCase();
    this.picker.replaceChildren(
      ...picking.shown.map((choice, index) => {
        const option = this.host.doc.createElement("div");
        option.className = "tp-choice";
        option.setAttribute("role", "option");
        option.textContent = choice.label;
        option.classList.toggle("tp-current", choice.value.toLowerCase() === typed);
        option.classList.toggle("tp-active", index === picking.active);
        option.setAttribute("aria-selected", String(index === picking.active));
        option.addEventListener("click", () => {
          if (this.picking !== picking) return;
          picking.editor.field.value = choice.value;
          this.picker.classList.remove("tp-visible");
          picking.editor.field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        });
        return option;
      })
    );
    const active = this.picker.querySelector(".tp-active");
    if (active && active.offsetTop < this.picker.scrollTop) this.picker.scrollTop = active.offsetTop;
    else if (active && active.offsetTop + active.offsetHeight > this.picker.scrollTop + this.picker.clientHeight) {
      this.picker.scrollTop = active.offsetTop + active.offsetHeight - this.picker.clientHeight;
    }
  }
  /** Under the cell, or above it where the window has no room below */
  placePicker(editor) {
    const rect = editor.cell.getBoundingClientRect();
    this.picker.style.minWidth = `${Math.round(rect.width)}px`;
    this.host.place(this.picker, rect.left, rect.bottom + 2);
    const viewHeight = this.host.doc.defaultView.innerHeight;
    const height = this.picker.offsetHeight;
    if (rect.bottom + 2 + height > viewHeight && rect.top - 2 - height >= 0) this.host.place(this.picker, rect.left, rect.top - 2 - height);
  }
  /**
   * A header keeps its type's hashtag after the name typed (an emptied name
   * stays the old one: a column needs a name). A value that is not of the
   * column's type is saved as typed, and said so.
   */
  editorValue(editor, typed) {
    if (editor.row === 0) {
      const kept = columnTypeOf(unescapeCell(editor.original));
      return kept && typed.trim() !== "" ? withColumnType(escapeCell(typed), kept.tag) : void 0;
    }
    const column = this.typeOfEdited(editor);
    const text = typed.trim();
    if (!column || text === "" || text.startsWith("=")) return void 0;
    const error = column.type.check(text, column.param);
    if (error) void this.host.bridge.flash(`Table Plus: ${error} (#${column.tag}); saved as typed`, "info");
    return void 0;
  }
  decorate(_widget, info) {
    const model = parseTable(info.source);
    const header = info.table.rows[0];
    model.rows[0]?.cells.forEach((name, column) => {
      const typed = columnTypeOf(unescapeCell(name));
      if (!typed) return;
      const headerCell = header?.cells[column];
      for (const tag of Array.from(headerCell?.querySelectorAll("[data-tag-name]") ?? [])) {
        if (typeOfTag(tag.dataset.tagName ?? "")) tag.classList.add(TYPE_TAG_CLASS);
      }
      if (headerCell && !headerCell.querySelector(".tp-type-icon")) {
        const icon = this.host.doc.createElement("span");
        icon.className = `${UI_CLASS} tp-type-icon`;
        icon.title = `${typeLabel(typed.type.name)} (#${typed.tag}): ${typed.type.description}`;
        icon.innerHTML = iconOf(typed.type);
        headerCell.insertBefore(icon, headerCell.querySelector(`:scope > .${UI_CLASS}`));
      }
      for (const tr of Array.from(info.table.querySelectorAll("tr[data-tp-row]"))) {
        const raw = model.rows[Number(tr.dataset.tpRow)]?.cells[column];
        const cell = tr.cells[column];
        if (raw === void 0 || !cell) continue;
        const text = unescapeCell(formulaOf(raw)?.value ?? withoutName(raw)).trim();
        if (text === "" || cellText(cell) !== text) continue;
        const { type, param } = typed;
        const error = type.check(text, param);
        cell.dataset.tpValue = error ? text : type.sortValue?.(text, param) ?? text;
        if (error) {
          cell.classList.add("tp-type-invalid");
          cell.title = cell.title ? `${cell.title}
${error}` : error;
          continue;
        }
        this.show(cell, type.format(text, param));
      }
    });
  }
  /** Puts what a typed cell shows in place of its text, Table Plus' own elements kept */
  show(cell, shown) {
    for (const node of Array.from(cell.childNodes)) {
      if (!(node instanceof Element && node.classList.contains(UI_CLASS))) node.remove();
    }
    if (typeof shown === "string") {
      cell.prepend(this.host.doc.createTextNode(shown));
      return;
    }
    const link = this.host.doc.createElement("a");
    link.href = shown.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = shown.text;
    cell.prepend(link);
  }
};

// table-plus/src/features/expressions.ts
var Expressions = class {
  constructor(host) {
    this.host = host;
  }
  host;
  timer;
  stopped = false;
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
  /** SilverBullet's `page:index` event for a page */
  async pageIndexed(name) {
    const { bridge } = this.host;
    if (this.stopped || !bridge.evalExpression) return;
    if (name !== await bridge.getCurrentPage()) return;
    const delay = await this.host.setting("expressionsDelay");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), delay);
  }
  async refresh() {
    const { bridge, doc } = this.host;
    for (const widget of Array.from(doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
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
            value = await bridge.evalExpression(expression.replaceAll("\\|", "|"));
          } catch {
            continue;
          }
          const text = value === null || value === void 0 ? "" : typeof value === "number" ? formatLuaNumber(value) : typeof value === "string" || typeof value === "boolean" ? String(value) : void 0;
          const cell = this.host.cellAt(info, { row, column }, true);
          if (text === void 0 || !cell || cell === this.host.editing?.cell || renderedTable(widget) !== info.table) continue;
          if (cellText(cell) === text) continue;
          for (const node of Array.from(cell.childNodes)) {
            if (!(node instanceof Element && node.classList.contains(UI_CLASS))) node.remove();
          }
          cell.prepend(doc.createTextNode(text));
          changed = true;
        }
      }
      if (changed && renderedTable(widget) === info.table) this.host.applyView(widget, info);
    }
  }
};

// table-plus/src/features/formulas.ts
var FORMULAS_NEED_METADATA = "Formulas are stored in the table: turn on the Store table metadata setting to add them (existing ones keep working)";
var REFERENCE_COLORS = ["#3b6fd4", "#d0453a", "#8a55c9", "#2f9a4a", "#d9771c", "#1c9c9c"];
var Formulas = class {
  constructor(host) {
    this.host = host;
    this.formulaHint = host.floating("div", "tp-formula-hint");
  }
  host;
  formulaHint;
  referenceMarks = [];
  stopReferenceDrag;
  // The reference last inserted by pointing at the table, and the cell its range started at
  pointed;
  stopPointing;
  // Tables whose formula cells show results from before a change made outside Table Plus
  stale = /* @__PURE__ */ new WeakSet();
  // Tables (as rendered) with formulas: their toolbar can recalculate them
  withFormulas = /* @__PURE__ */ new WeakSet();
  stop() {
    this.stopPointing?.();
    this.hideFormulaUi();
    this.formulaHint.remove();
  }
  // ---- the cell editor ----------------------------------------------------------
  /** A formula cell is edited as its formula; a text starting with "=" as '=…, so it stays text */
  editorText(_info, cell, original) {
    if (cell.row === 0) return void 0;
    const stored = formulaOf(original);
    if (stored) return stored.formula;
    const text = unescapeCell(original);
    return text.startsWith("=") ? `'${text}` : void 0;
  }
  editorOpened(editor) {
    const field = editor.field;
    for (const type of ["input", "keyup", "click", "focus"]) {
      field.addEventListener(type, () => {
        if (this.host.editing?.field === field && !this.stopReferenceDrag) this.updateFormulaUi();
      });
    }
    field.addEventListener("keydown", (e) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) this.pointed = void 0;
    });
    this.updateFormulaUi();
  }
  /** Tab while a function name is typed completes it (the editor stays) */
  editorKeyDown(e, editor) {
    if (!this.allowed(editor)) return false;
    return e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && this.completeFunctionName();
  }
  /**
   * Whether the edited cell may hold a formula: with the metadata setting on,
   * or when it holds one already (a table with formulas keeps using them, as
   * one with a metadata row keeps its sorting)
   */
  allowed(editor) {
    return this.host.metadataEnabled || formulaOf(editor.original) !== void 0;
  }
  /**
   * What a typed formula is saved as: fixed where only one fix is possible
   * (said so), its column references written by the columns' keys, as a
   * formula cell whose result the write fills in. A text typed as '=… is that
   * text, and so is a formula where formulas are not allowed (said so).
   * Undefined for anything else.
   */
  editorValue(editor, typed) {
    if (editor.row === 0) return void 0;
    if (isFormulaInput(typed) && !this.allowed(editor)) {
      void this.host.bridge.flash(`Table Plus: ${FORMULAS_NEED_METADATA}; saved as text`, "info");
      return escapeCell(typed);
    }
    if (isFormulaInput(typed)) {
      const { formula, fixes } = autofixFormula(typed.trim());
      if (fixes.length) void this.host.bridge.flash(`Table Plus: formula fixed: ${fixes.join(", ")}`, "info");
      const headers = parseTable(this.host.infoOf(editor.widget)?.source ?? "").rows[0]?.cells ?? [];
      return formulaCell("", withColumnKeys(formula, headers));
    }
    return typed.startsWith("'=") ? escapeCell(typed.slice(1)) : void 0;
  }
  editorClosed() {
    this.stopPointing?.();
    this.pointed = void 0;
    this.hideFormulaUi();
  }
  // While a formula waits for a reference, a press in its table inserts one
  beforeCellPress(widget, info, cell, e) {
    return this.pointReference(widget, info, cell, e);
  }
  // The outlines follow the table when it scrolls or moves
  layoutChanged() {
    if (this.host.editing && !this.stopReferenceDrag) this.updateFormulaUi();
  }
  // ---- formula cells in the table -------------------------------------------------
  /** Formula cells show that they hold one, and their formula (or error) on hover */
  decorate(_widget, info) {
    const model = parseTable(info.source);
    if (formulaCount(model) > 0) this.withFormulas.add(info.table);
    const tables = this.host.tableSource();
    if (recalculate(model, tables) !== model) this.stale.add(info.table);
    const errors = formulaErrors(model, tables);
    for (const tr of Array.from(info.table.querySelectorAll("tr[data-tp-row]"))) {
      const row = Number(tr.dataset.tpRow);
      model.rows[row]?.cells.forEach((raw, column) => {
        const stored = formulaOf(raw);
        const cell = tr.cells[column];
        if (!stored || !cell) return;
        const error = isErrorText(stored.value) ? errors.get(`${row},${column}`) : void 0;
        cell.classList.add("tp-formula");
        cell.classList.toggle("tp-formula-error", !!error);
        cell.title = error ? `${stored.formula}
${error}` : stored.formula;
      });
    }
  }
  /**
   * A table rendered anew (it changed) may be one that others refer to: their
   * results are checked again, as SilverBullet keeps their widgets as they were
   */
  enhanced(widget) {
    this.recheck(widget);
  }
  /** Another page whose tables formulas read was changed */
  tablesChanged() {
    this.recheck();
  }
  /** Checks again whether the tables that refer to other tables (but `except`) are out of date */
  recheck(except) {
    const tables = this.host.tableSource();
    for (const other of Array.from(this.host.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = other === except ? void 0 : this.host.infoOf(other);
      if (!info || !this.withFormulas.has(info.table)) continue;
      const model = parseTable(info.source);
      if (referredTableNames(model).size === 0 && referredPages(model).size === 0 && referredCellNames(model).size === 0) continue;
      if (recalculate(model, tables) !== model) this.stale.add(info.table);
      else this.stale.delete(info.table);
    }
    this.host.toolbarChanged();
  }
  /** Recalculate, first in the toolbar of a table with formulas; highlighted when results are out of date */
  toolbarButtons(widget, info) {
    if (!this.withFormulas.has(info.table)) return [];
    const stale = this.stale.has(info.table);
    return [
      {
        label: "Recalculate",
        icon: ICONS.recalculate,
        attention: stale,
        title: stale ? "Recalculate: some formula results are out of date (the table was changed outside Table Plus, or TODAY() moved on)" : "Recalculate the formulas (their results are up to date)",
        // A write recalculates: an edit that changes nothing else
        run: () => void this.host.write(this.host.widgetForKey(info.key) ?? widget, (t) => t)
      }
    ];
  }
  // ---- help and references while a formula is edited ------------------------
  /**
   * While a formula is edited: the help for what is typed under the cell, and
   * each reference outlined in the table in its own color, as in a spreadsheet.
   * An outline's edge moves the reference, its corner resizes a range.
   */
  updateFormulaUi() {
    const active = this.host.editing;
    const info = active && this.host.infoOf(active.widget);
    const formula = active?.field.value ?? "";
    if (!active || !info || active.row === 0 || !formula.trimStart().startsWith("=")) {
      this.hideFormulaUi();
      return;
    }
    if (!this.allowed(active)) {
      this.hideFormulaUi();
      this.formulaHint.replaceChildren(
        Object.assign(this.host.doc.createElement("div"), { className: "tp-formula-help", textContent: FORMULAS_NEED_METADATA })
      );
      const rect = active.cell.getBoundingClientRect();
      this.host.place(this.formulaHint, rect.left, rect.bottom + 4);
      return;
    }
    const refs = references(formula);
    active.widget.classList.toggle("tp-pointing", this.pointingSlot(active) !== void 0);
    this.showFormulaHint(active, formula, refs);
    for (const mark of this.referenceMarks) mark.remove();
    this.referenceMarks = [];
    const table = parseTable(info.source);
    refs.forEach((ref, index) => {
      const area = this.referenceArea(info, table, ref, active.row - 1);
      if (!area) return;
      const color = REFERENCE_COLORS[index % REFERENCE_COLORS.length];
      const boxes = this.areaBoxes(active.widget, info, area);
      boxes.forEach((box, b) => {
        const mark = this.host.floating("div", "tp-ref-mark");
        mark.style.setProperty("--tp-ref-color", color);
        Object.assign(mark.style, {
          left: `${box.left}px`,
          top: `${box.top}px`,
          width: `${box.right - box.left}px`,
          height: `${box.bottom - box.top}px`
        });
        for (const side of ["top", "right", "bottom", "left"]) {
          const edge = this.host.doc.createElement("div");
          edge.className = `tp-ref-edge tp-ref-${side}`;
          edge.title = "Drag to move the reference";
          edge.addEventListener("pointerdown", (e) => this.dragReference(e, index, "move"));
          mark.append(edge);
        }
        if (ref.kind === "area" && b === boxes.length - 1) {
          const corner = this.host.doc.createElement("div");
          corner.className = "tp-ref-corner";
          corner.title = "Drag to resize the range";
          corner.addEventListener("pointerdown", (e) => this.dragReference(e, index, "resize"));
          mark.append(corner);
        }
        mark.classList.add("tp-visible");
        this.referenceMarks.push(mark);
      });
    });
  }
  /**
   * Pointing, as in a spreadsheet: while a formula is edited and its caret is
   * where a reference can go, a click on a cell of the same table inserts the
   * cell (A1), a drag the range (A1:B3), a click on a header the column
   * ([Qty]). Pointing again replaces the reference just inserted. Returns
   * whether the click was taken.
   */
  pointReference(widget, info, cell, e) {
    const active = this.host.editing;
    if (!active || active.widget !== widget) return false;
    const slot = this.pointingSlot(active);
    if (!slot) return false;
    this.stopPointing?.();
    const field = active.field;
    let span = slot;
    const put = (text, anchor2) => {
      this.replaceInField(field, span.from, span.to, text);
      span = { from: span.from, to: span.from + text.length };
      field.setSelectionRange(span.to, span.to);
      this.pointed = { field, ...span, text, anchor: anchor2 };
      this.updateFormulaUi();
    };
    if (cell.row === 0) {
      const headers = parseTable(info.source).rows[0]?.cells ?? [];
      const text = columnRefText(columnIdOf(headers, cell.column), false);
      if (text) put(text);
      return true;
    }
    const last = this.pointed;
    const anchor = e.shiftKey && last?.field === field && last.anchor && last.from === slot.from ? last.anchor : { row: cell.row - 1, column: cell.column };
    const areaTo = (to) => ({
      top: Math.min(anchor.row, to.row),
      left: Math.min(anchor.column, to.column),
      bottom: Math.max(anchor.row, to.row),
      right: Math.max(anchor.column, to.column)
    });
    put(areaText(areaTo({ row: cell.row - 1, column: cell.column })), anchor);
    const win = this.host.doc.defaultView;
    const end = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      win.removeEventListener("keydown", end, true);
      win.removeEventListener("blur", end);
      this.stopPointing = void 0;
    };
    const move = (ev) => {
      if (this.host.editing?.field !== field || ev.buttons === 0) {
        end();
        return;
      }
      const to = this.bodyCellAt(info, ev.clientX, ev.clientY);
      const text = to && areaText(areaTo(to));
      if (text && text !== field.value.slice(span.from, span.to)) put(text, anchor);
    };
    const up = () => {
      end();
      if (this.host.editing?.field === field) field.focus({ preventScroll: true });
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", up, true);
    win.addEventListener("keydown", end, true);
    win.addEventListener("blur", end);
    this.stopPointing = end;
    return true;
  }
  /** Tab while a function name is typed in a formula: completes it with its "(" */
  completeFunctionName() {
    const active = this.host.editing;
    const completion = active && active.row > 0 ? this.functionCompletion(active) : void 0;
    if (!active || !completion) return false;
    const field = active.field;
    this.replaceInField(field, completion.from, completion.to, completion.text);
    const caret = completion.from + completion.text.length;
    field.setSelectionRange(caret, caret);
    this.updateFormulaUi();
    return true;
  }
  functionCompletion(active) {
    const field = active.field;
    const length = field.value.length;
    const completion = completeFunction(field.value, field.selectionStart ?? length, field.selectionEnd ?? length);
    const typed = completion && field.value.slice(completion.from, completion.to);
    return typed && this.host.tableSource().cell?.(typed) ? void 0 : completion;
  }
  /** Where a reference pointed at in the table would go in the edited formula, if anywhere */
  pointingSlot(active) {
    if (active.row === 0 || !this.allowed(active)) return void 0;
    const field = active.field;
    const length = field.value.length;
    const pointed = this.pointed?.field === field ? this.pointed : void 0;
    return referenceSlot(field.value, field.selectionStart ?? length, field.selectionEnd ?? length, pointed);
  }
  /**
   * Replaces part of the field's text, as typing would where the browser
   * allows it (so Ctrl+Z in the field undoes it), else directly
   */
  replaceInField(field, from, to, text) {
    const expected = field.value.slice(0, from) + text + field.value.slice(to);
    field.setSelectionRange(from, to);
    try {
      if (typeof this.host.doc.execCommand === "function") this.host.doc.execCommand("insertText", false, text);
    } catch {
    }
    if (field.value !== expected) field.value = expected;
  }
  /** The formula with its references in their colors, and help for what is typed */
  showFormulaHint(active, formula, refs) {
    const hint = this.formulaHint;
    hint.replaceChildren();
    if (refs.length) {
      const line = this.host.doc.createElement("div");
      line.className = "tp-formula-preview";
      let at = 0;
      refs.forEach((ref, index) => {
        line.append(formula.slice(at, ref.from));
        const span = this.host.doc.createElement("span");
        span.style.color = REFERENCE_COLORS[index % REFERENCE_COLORS.length];
        span.textContent = formula.slice(ref.from, ref.to);
        line.append(span);
        at = ref.to;
      });
      line.append(formula.slice(at));
      hint.append(line);
    }
    for (const help of formulaHelp(formula, active.field.selectionStart ?? formula.length).slice(0, 6)) {
      const item = this.host.doc.createElement("div");
      item.className = "tp-formula-help";
      const syntax = this.host.doc.createElement("code");
      syntax.textContent = help.syntax;
      const description = this.host.doc.createElement("span");
      description.textContent = help.description;
      item.append(syntax, description);
      hint.append(item);
    }
    const completion = this.functionCompletion(active);
    if (completion) {
      const tab = this.host.doc.createElement("div");
      tab.className = "tp-formula-tab";
      tab.textContent = `Tab: ${completion.text}`;
      hint.append(tab);
    }
    const rect = active.cell.getBoundingClientRect();
    this.host.place(hint, rect.left, rect.bottom + 4);
    const viewHeight = this.host.doc.defaultView.innerHeight;
    if (rect.bottom + 4 + hint.offsetHeight > viewHeight && rect.top - 4 - hint.offsetHeight >= 0) {
      this.host.place(hint, rect.left, rect.top - 4 - hint.offsetHeight);
    }
  }
  hideFormulaUi() {
    this.stopReferenceDrag?.();
    for (const widget of Array.from(this.host.doc.querySelectorAll(".tp-pointing"))) widget.classList.remove("tp-pointing");
    this.formulaHint.classList.remove("tp-visible");
    for (const mark of this.referenceMarks) mark.remove();
    this.referenceMarks = [];
  }
  /** The body rows and columns a reference covers, within the table; undefined if none */
  referenceArea(info, table, ref, row) {
    if (ref.table) return void 0;
    const lastRow = info.rows - 2;
    const lastColumn = info.columns - 1;
    if (ref.kind === "column") {
      const column = referencedColumn(table.rows[0]?.cells ?? [], ref.name);
      if (column === void 0 || lastRow < 0) return void 0;
      if (ref.row) {
        const named2 = namedRows(table).get(ref.row.toLowerCase());
        return named2 === void 0 ? void 0 : { top: named2 - 1, left: column, bottom: named2 - 1, right: column };
      }
      return ref.thisRow ? { top: row, left: column, bottom: row, right: column } : { top: 0, left: column, bottom: lastRow, right: column };
    }
    const { top, left, bottom, right } = ref.area;
    if (top > lastRow || left > lastColumn) return void 0;
    return { top, left, bottom: Math.min(bottom, lastRow), right: Math.min(right, lastColumn) };
  }
  /** The body rows as shown (header and filter row excluded), with their row in the markdown minus one */
  shownBodyRows(info) {
    return Array.from(info.table.rows).filter((tr) => tr.dataset.tpRow !== void 0 && !tr.classList.contains("tp-hidden")).map((tr) => ({ tr, row: Number(tr.dataset.tpRow) - 1 }));
  }
  /**
   * Screen boxes outlining an area: one per run of its rows that are shown
   * next to each other (sorting and filters can split an area), clipped to
   * the table's visible box
   */
  areaBoxes(widget, info, area) {
    const clip = this.host.innerBox(widget);
    const boxes = [];
    let run = [];
    const flush = () => {
      const first = run[0]?.cells[area.left];
      const last = run[run.length - 1]?.cells[area.right];
      run = [];
      if (!first || !last) return;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      const box = {
        left: Math.max(Math.min(a.left, b.left), clip.left),
        top: Math.max(Math.min(a.top, b.top), clip.top),
        right: Math.min(Math.max(a.right, b.right), clip.right),
        bottom: Math.min(Math.max(a.bottom, b.bottom), clip.bottom)
      };
      if (box.right > box.left && box.bottom > box.top) boxes.push(box);
    };
    for (const { tr, row } of this.shownBodyRows(info)) {
      if (row >= area.top && row <= area.bottom) run.push(tr);
      else flush();
    }
    flush();
    return boxes;
  }
  /** The body cell (row in the markdown minus one, column) under a point, if any */
  bodyCellAt(info, x, y) {
    for (const { tr, row } of this.shownBodyRows(info)) {
      const rect = tr.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom) continue;
      const column = Array.from(tr.cells).findIndex((cell) => {
        const r = cell.getBoundingClientRect();
        return x >= r.left && x <= r.right;
      });
      return column < 0 ? void 0 : { row, column };
    }
    return void 0;
  }
  /**
   * Dragging an outline's edge moves the reference to the cells under the
   * pointer (a column reference to another column); dragging a range's corner
   * resizes it. The formula in the editor changes as the pointer moves; Esc
   * puts it back.
   */
  dragReference(e, index, mode) {
    const active = this.host.editing;
    const info = active && this.host.infoOf(active.widget);
    if (e.button !== 0 || !active || !info) return;
    e.stopPropagation();
    const handle = e.currentTarget;
    const field = active.field;
    const originalFormula = field.value;
    const ref = references(originalFormula)[index];
    const table = parseTable(info.source);
    const headers = table.rows[0]?.cells ?? [];
    const start = this.bodyCellAt(info, e.clientX, e.clientY);
    const startArea = ref && this.referenceArea(info, table, ref, active.row - 1);
    if (!ref || !start || !startArea) return;
    const lastRow = info.rows - 2;
    const lastColumn = info.columns - 1;
    const clamp = (n, max) => Math.max(0, Math.min(n, max));
    this.stopReferenceDrag?.();
    this.host.doc.body.classList.add("tp-ref-dragging");
    const textFor = (cell) => {
      const dRow = cell.row - start.row;
      const dColumn = cell.column - start.column;
      if (ref.kind === "column") {
        const column = clamp(startArea.left + dColumn, lastColumn);
        return columnRefText(columnIdOf(headers, column), ref.thisRow);
      }
      if (mode === "resize") {
        return areaText({
          top: Math.min(startArea.top, cell.row),
          left: Math.min(startArea.left, cell.column),
          bottom: Math.max(startArea.top, cell.row),
          right: Math.max(startArea.left, cell.column)
        });
      }
      const height = startArea.bottom - startArea.top;
      const width = startArea.right - startArea.left;
      const top = clamp(startArea.top + dRow, lastRow - height);
      const left = clamp(startArea.left + dColumn, lastColumn - width);
      return areaText({ top, left, bottom: top + height, right: left + width });
    };
    const win = this.host.doc.defaultView;
    const move = (ev) => {
      const cell = this.bodyCellAt(info, ev.clientX, ev.clientY);
      const current = references(field.value)[index];
      const text = cell && current && textFor(cell);
      if (!text || !current || field.value.slice(current.from, current.to) === text) return;
      this.replaceInField(field, current.from, current.to, text);
      const caret = current.from + text.length;
      field.setSelectionRange(caret, caret);
      this.updateFormulaUi();
    };
    const escape = (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      field.value = originalFormula;
      finish();
    };
    const finish = () => {
      this.stopReferenceDrag?.();
      if (this.host.editing?.field === field) {
        field.focus({ preventScroll: true });
        this.updateFormulaUi();
      }
    };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
    }
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", finish);
    win.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    win.addEventListener("keydown", escape, true);
    this.stopReferenceDrag = () => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", finish);
      win.removeEventListener("pointercancel", finish);
      handle.removeEventListener("lostpointercapture", finish);
      win.removeEventListener("keydown", escape, true);
      this.host.doc.body.classList.remove("tp-ref-dragging");
      this.stopReferenceDrag = void 0;
    };
  }
};

// table-plus/src/menu.ts
function renderMenu(doc, title, entries, back) {
  const menu = doc.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);
  const heading = doc.createElement("div");
  heading.className = "tp-menu-title";
  if (back) {
    const arrow = doc.createElement("button");
    arrow.type = "button";
    arrow.className = "tp-menu-back";
    arrow.title = "Back";
    arrow.setAttribute("aria-label", "Back");
    arrow.innerHTML = back.icon;
    arrow.addEventListener("click", (e) => {
      e.preventDefault();
      back.run();
    });
    heading.append(arrow);
  }
  const titleText = doc.createElement("span");
  titleText.className = "tp-menu-title-text";
  titleText.textContent = title;
  heading.append(titleText);
  menu.append(heading);
  let bubble;
  const showDetail = (item, detail) => {
    if (!bubble) {
      bubble = doc.createElement("div");
      bubble.className = "tp-menu-detail";
      bubble.setAttribute("role", "tooltip");
      menu.append(bubble);
    }
    const title2 = doc.createElement("div");
    title2.className = "tp-menu-detail-title";
    title2.textContent = detail.title;
    const parts = [title2];
    if (detail.code?.length) {
      const code = doc.createElement("div");
      code.className = "tp-menu-detail-code";
      for (const form of detail.code) {
        const c = doc.createElement("code");
        c.textContent = form;
        code.append(c);
      }
      parts.push(code);
    }
    const text = doc.createElement("p");
    text.textContent = detail.text;
    parts.push(text);
    for (const note of detail.notes ?? []) {
      const p = doc.createElement("p");
      p.className = "tp-menu-detail-note";
      p.textContent = note;
      parts.push(p);
    }
    bubble.replaceChildren(...parts);
    bubble.hidden = false;
    bubble.classList.remove("tp-left");
    bubble.style.top = `${item.offsetTop}px`;
    const view = doc.defaultView;
    if (view && bubble.getBoundingClientRect().right > view.innerWidth - 8) bubble.classList.add("tp-left");
  };
  const hideDetail = () => {
    if (bubble) bubble.hidden = true;
  };
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
      const detail = entry.detail;
      if (detail && !entry.disabled) {
        item.addEventListener("mouseenter", () => showDetail(item, detail));
        item.addEventListener("focus", () => showDetail(item, detail));
        item.addEventListener("mouseleave", hideDetail);
        item.addEventListener("blur", hideDetail);
      } else if (entry.hint && !entry.disabled) item.title = entry.hint;
      item.innerHTML = `<span class="tp-icon">${entry.icon}</span>`;
      const label = doc.createElement("span");
      label.className = "tp-label";
      label.textContent = entry.label;
      if (entry.value) {
        label.append(": ");
        if (entry.value.icon) {
          const icon = doc.createElement("span");
          icon.className = "tp-menu-value-icon";
          icon.innerHTML = entry.value.icon;
          label.append(icon);
        }
        label.append(entry.value.text);
      }
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
    } else if (e.key === "ArrowLeft" && back) {
      e.preventDefault();
      back.run();
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

// table-plus/src/features/grips.ts
var DRAG_THRESHOLD = 4;
var PIN_NEEDS_METADATA = "Pinning is stored in the table: turn on the Store table metadata setting (unpinning always works)";
var Grips = class {
  constructor(host) {
    this.host = host;
    this.rowGrip = this.gripButton("tp-handle tp-grip", "Row: click for actions, drag to move");
    this.columnGrip = this.gripButton("tp-handle tp-grip tp-grip-column", "Column: click for actions, drag to move");
  }
  host;
  rowGrip;
  columnGrip;
  target;
  menu;
  dragging = false;
  start() {
    this.rowGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "column"));
  }
  stop() {
    this.closeMenu(false);
    this.rowGrip.remove();
    this.columnGrip.remove();
  }
  owns(node) {
    return this.rowGrip.contains(node) || this.columnGrip.contains(node) || !!this.menu?.element.contains(node);
  }
  // While a grip is dragged the hover controls stay; a menu keeps them too
  pointerBusy() {
    return this.dragging ? "drag" : this.menu ? "menu" : void 0;
  }
  // A press outside an open menu closes it
  mouseDown(e) {
    if (this.menu && e.target instanceof Node && !this.host.isFloating(e.target)) this.closeMenu(false);
    return false;
  }
  keyDown(e) {
    if (e.key !== "Escape" || !this.menu) return false;
    e.preventDefault();
    e.stopPropagation();
    this.closeMenu(true);
    return true;
  }
  /** The pointer is over a cell (or the page moved under it): the grips go to its row and column */
  cellHovered(widget, info, cell) {
    const ref = this.host.cellRef(info, cell);
    if (!ref) return;
    this.target = { widget, info, column: ref.column, ...ref.row > 0 ? { row: ref.row } : {} };
    const tr = cell.parentElement;
    const shown = this.host.shownRect(widget, info);
    const rearranged = this.host.rearranged(info);
    if (ref.row > 0) {
      const rowRect = tr.getBoundingClientRect();
      this.rowGrip.classList.toggle("tp-no-drag", rearranged);
      this.rowGrip.title = rearranged ? `Row: click for actions (${MOVE_BLOCKED.toLowerCase()})` : "Row: click for actions, drag to move";
      this.host.place(this.rowGrip, shown.left - 22, rowRect.top + (rowRect.height - 18) / 2);
    } else {
      this.rowGrip.classList.remove("tp-visible");
    }
    const headerCell = info.table.rows[0].cells[ref.column];
    if (headerCell) {
      const h = headerCell.getBoundingClientRect();
      const center = Math.max(shown.left + 9, Math.min(h.left + h.width / 2, shown.right - 9));
      this.host.place(this.columnGrip, center - 9, h.top - 9);
    }
    this.positionMenu();
  }
  /** No cell is hovered (editing, or the table left the view): the grips go, and with `closeMenus` an open menu */
  hoverEnded(closeMenus) {
    if (closeMenus) this.closeMenu(false);
    this.hideGrips();
  }
  gripButton(className, title) {
    const button = this.host.floating("button", className);
    button.type = "button";
    button.tabIndex = -1;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = ICONS.grip;
    return button;
  }
  hideGrips() {
    for (const el of [this.rowGrip, this.columnGrip]) el.classList.remove("tp-visible");
    this.target = void 0;
  }
  // ---- a press on a grip: a click opens its menu, a drag moves -------------
  onGripPointerDown(e, axis) {
    const target = this.target;
    if (e.button !== 0 || !target || axis === "row" && target.row === void 0) return;
    e.preventDefault();
    const grip = axis === "row" ? this.rowGrip : this.columnGrip;
    const canDrag = axis === "column" || !this.host.rearranged(target.info);
    const win = this.host.doc.defaultView;
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
      win.removeEventListener("pointercancel", cancel);
      win.removeEventListener("keydown", escape, true);
    };
    const cancel = () => {
      cleanup();
      drag?.finish(false);
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
    win.addEventListener("pointercancel", cancel);
    win.addEventListener("keydown", escape, true);
  }
  beginDrag(target, axis) {
    const { widget, info } = target;
    const { doc } = this.host;
    const from = axis === "row" ? target.row : target.column;
    const table = info.table;
    const header = table.rows[0];
    const bodyRows = this.host.bodyRows(info);
    const carried = axis === "row" ? bodyRows.filter((tr) => Number(tr.dataset.tpRow) === from) : [header, ...bodyRows].map((tr) => tr.cells[from]).filter((c) => !!c);
    carried.forEach((el) => el.classList.add("tp-dragged"));
    const line = this.host.floating("div", "tp-drop tp-visible");
    doc.body.classList.add("tp-dragging");
    this.dragging = true;
    let slot = from;
    const move = (ev) => {
      const tableRect = table.getBoundingClientRect();
      const shown = this.host.shownRect(widget, info);
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
      doc.body.classList.remove("tp-dragging");
      this.dragging = false;
      this.hideGrips();
      const to = slot > from ? slot - 1 : slot;
      if (!commit || to === from) return;
      if (axis === "row") void moveRowTo(this.host, widget, info, from, to);
      else void moveColumnTo(this.host, widget, info, from, to);
    };
    return { move, finish };
  }
  // ---- menus ----------------------------------------------------------------------
  toggleMenu(axis, target, anchor) {
    if (this.menu?.axis === axis) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu(false);
    const { doc } = this.host;
    const { widget, info } = target;
    const element = axis === "row" ? renderMenu(doc, `Row ${target.row}`, this.rowMenu(widget, info, target.row, target.column)) : renderMenu(
      doc,
      `Column: ${cellText(info.table.rows[0].cells[target.column]) || target.column + 1}`,
      this.columnMenu(widget, info, target.column)
    );
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    element.addEventListener("mousedown", (e) => e.preventDefault());
    doc.body.append(element);
    this.menu = { element, axis, widget, anchor };
    this.positionMenu();
    anchor.classList.add("tp-active");
    focusMenu(element);
  }
  /**
   * Shows other entries in the open menu's place, in the same dropdown: they
   * close it when run, and the arrow before the title (Back) shows the menu they replaced
   */
  replaceMenu(title, entries) {
    const menu = this.menu;
    if (!menu) return;
    const previous = menu.element;
    const closing = entries.map((entry) => entry.kind === "item" ? { ...entry, run: this.runAndClose(entry.run) } : entry);
    const element = renderMenu(this.host.doc, title, closing, { icon: ICONS.arrowLeft, run: () => this.swapMenu(previous) });
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    element.addEventListener("mousedown", (e) => e.preventDefault());
    this.swapMenu(element);
  }
  /** Puts `element` in the open menu's place */
  swapMenu(element) {
    const menu = this.menu;
    if (!menu) return;
    menu.element.replaceWith(element);
    this.menu = { ...menu, element };
    this.positionMenu();
    focusMenu(element);
  }
  /** Rows: to the right of the grip; columns: below it; always inside the window */
  positionMenu() {
    if (!this.menu) return;
    const { element, axis, anchor } = this.menu;
    const win = this.host.doc.defaultView;
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
    const hadFocus = menu.element.contains(this.host.doc.activeElement);
    menu.element.remove();
    this.rowGrip.classList.remove("tp-active");
    this.columnGrip.classList.remove("tp-active");
    this.hideGrips();
    if (refocus && hadFocus) this.host.focusEditor(menu.widget);
  }
  runAndClose(run) {
    return () => {
      this.closeMenu(false);
      run();
    };
  }
  // `column`: the hovered column, where editing a new row starts
  rowMenu(widget, info, row, column) {
    const host = this.host;
    const rearranged = host.rearranged(info);
    const zone = rowZone(info.pins, info.rows, row);
    const act = (run) => this.runAndClose(() => void run());
    const moveBlocked = (to) => rearranged ? MOVE_BLOCKED : clampRowMove(info.pins, info.rows, row, to) === row ? zone ? "Pinned rows stay with the other pinned rows" : "Already at the edge" : void 0;
    const pinBlocked = (to) => host.metadataEnabled || zone === to ? void 0 : PIN_NEEDS_METADATA;
    const insertBlocked = (at) => insertRowAt(info.pins, info.rows, at).at === at ? void 0 : zone === "top" ? "Rows pinned to the top stay at the top" : "Rows pinned to the bottom stay at the bottom";
    return [
      {
        kind: "item",
        label: "Insert row above",
        icon: ICONS.rowAbove,
        run: act(() => insertRowWith(host, widget, info, row, column)),
        disabled: insertBlocked(row)
      },
      {
        kind: "item",
        label: "Insert row below",
        icon: ICONS.rowBelow,
        run: act(() => insertRowWith(host, widget, info, row + 1, column)),
        disabled: insertBlocked(row + 1)
      },
      { kind: "item", label: "Duplicate row", icon: ICONS.duplicate, run: act(() => duplicateRowAt(host, widget, info, row)) },
      { kind: "separator" },
      {
        kind: "item",
        label: "Move up",
        icon: ICONS.arrowUp,
        run: act(() => moveRowTo(host, widget, info, row, row - 1)),
        disabled: moveBlocked(row - 1)
      },
      {
        kind: "item",
        label: "Move down",
        icon: ICONS.arrowDown,
        run: act(() => moveRowTo(host, widget, info, row, row + 1)),
        disabled: moveBlocked(row + 1)
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Pin to top",
        icon: ICONS.pinTop,
        checked: zone === "top",
        run: act(() => pinRowAt(host, widget, info, row, zone === "top" ? void 0 : "top")),
        disabled: pinBlocked("top")
      },
      {
        kind: "item",
        label: "Pin to bottom",
        icon: ICONS.pinBottom,
        checked: zone === "bottom",
        run: act(() => pinRowAt(host, widget, info, row, zone === "bottom" ? void 0 : "bottom")),
        disabled: pinBlocked("bottom")
      },
      ...this.featureRowEntries(widget, info, row, column),
      { kind: "separator" },
      { kind: "item", label: "Delete row", icon: ICONS.trash, danger: true, run: act(() => deleteRowAt(host, widget, info, row)) }
    ];
  }
  /** The entries features add for the row's cell, after a separator, closing the menu when run */
  featureRowEntries(widget, info, row, column) {
    const entries = this.host.rowMenuEntries(widget, info, row, column);
    if (entries.length === 0) return [];
    return [
      { kind: "separator" },
      ...entries.map((entry) => entry.kind === "item" ? { ...entry, run: this.runAndClose(entry.run) } : entry)
    ];
  }
  columnMenu(widget, info, column) {
    const host = this.host;
    const view = host.viewOf(info);
    const sorted = view.sort?.column === column ? view.sort.direction : void 0;
    const align = parseTable(info.source).align[column] ?? "";
    const edit = (change) => this.runAndClose(() => void host.write(widget, change));
    const sortBy = (next) => this.runAndClose(() => host.setSort(widget, info, next));
    const alignTo = (target) => edit((t) => setAlign(t, column, align === target ? "" : target));
    const act = (run) => this.runAndClose(() => void run());
    const zone = columnZone(info.pins, info.columns, column);
    const columnMoveBlocked = (to) => clampColumnMove(info.pins, info.columns, column, to) === column ? zone ? "Pinned columns stay with the other pinned columns" : "Already at the edge" : void 0;
    const pinBlocked = (to) => host.metadataEnabled || zone === to ? void 0 : PIN_NEEDS_METADATA;
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
          host.setView(widget, info, { ...host.viewOf(info), showFilters: true });
          info.table.querySelector(`.tp-filter[data-tp-column="${column}"]`)?.focus();
        })
      },
      ...host.columnMenuEntries(widget, info, column, (title, entries2) => this.replaceMenu(title, entries2)),
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
        run: act(() => insertColumnWith(host, widget, info, column)),
        disabled: insertBlocked(column)
      },
      {
        kind: "item",
        label: "Insert column right",
        icon: ICONS.columnRight,
        run: act(() => insertColumnWith(host, widget, info, column + 1)),
        disabled: insertBlocked(column + 1)
      },
      {
        kind: "item",
        label: "Move left",
        icon: ICONS.arrowLeft,
        run: act(() => moveColumnTo(host, widget, info, column, column - 1)),
        disabled: columnMoveBlocked(column - 1)
      },
      {
        kind: "item",
        label: "Move right",
        icon: ICONS.arrowRight,
        run: act(() => moveColumnTo(host, widget, info, column, column + 1)),
        disabled: columnMoveBlocked(column + 1)
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Pin left",
        icon: ICONS.pinLeft,
        checked: zone === "left",
        run: act(() => pinColumnAt(host, widget, info, column, zone === "left" ? void 0 : "left")),
        disabled: pinBlocked("left")
      },
      {
        kind: "item",
        label: "Pin right",
        icon: ICONS.pinRight,
        checked: zone === "right",
        run: act(() => pinColumnAt(host, widget, info, column, zone === "right" ? void 0 : "right")),
        disabled: pinBlocked("right")
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Delete column",
        icon: ICONS.trash,
        danger: true,
        run: act(() => deleteColumnAt(host, widget, info, column)),
        disabled: info.columns <= 1 ? "A table needs at least one column" : void 0
      }
    );
    return entries;
  }
};

// table-plus/src/features/history.ts
var History = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // Editor cursor positions set before table edits
  markers = /* @__PURE__ */ new Set();
  async beforeWrite(text, from, to) {
    const { bridge } = this.host;
    if (!bridge.setSelection) return void 0;
    const marker = to < text.length ? to + 1 : from > 0 ? from - 1 : void 0;
    if (marker === void 0) return void 0;
    await bridge.setSelection(marker, marker);
    this.remember(marker);
    return (editFrom, lengthChange) => this.remember(marker + (marker > editFrom ? lengthChange : 0));
  }
  keyDown(e) {
    const { bridge } = this.host;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = e.key.toLowerCase();
    const step = mod && key === "z" ? e.shiftKey ? "redo" : "undo" : mod && key === "y" && !e.shiftKey ? "redo" : void 0;
    const inEditor = e.target instanceof Element && !!e.target.closest(EDITOR_SELECTOR);
    if (!step || !inEditor || !bridge[step] || !bridge.getCursor) return false;
    e.preventDefault();
    e.stopPropagation();
    void this.step(step);
    return true;
  }
  remember(marker) {
    this.markers.add(marker);
    if (this.markers.size > 500) this.markers.delete(this.markers.values().next().value);
  }
  async step(step) {
    const { bridge, doc } = this.host;
    const editor = doc.querySelector(EDITOR_SELECTOR);
    const scroller = editor && this.host.scrollParentOf(editor);
    const top = scroller?.scrollTop;
    await bridge[step]();
    const cursor = await bridge.getCursor();
    if (!scroller || top === void 0 || !this.markers.has(cursor)) return;
    const restore = () => {
      scroller.scrollTop = top;
    };
    const win = doc.defaultView;
    restore();
    if (!win.requestAnimationFrame) return;
    win.requestAnimationFrame(() => {
      restore();
      win.requestAnimationFrame(restore);
    });
  }
};

// table-plus/src/meta.ts
function withMeta(table, name, value) {
  const current = table.meta ?? {};
  if (current[name] === value) return table;
  const meta = { ...current };
  if (value === void 0) delete meta[name];
  else meta[name] = value;
  return { ...table, meta };
}
function parseSort(value) {
  const match = /^(.*):(asc|desc)(?::(\d+))?$/.exec(value);
  return match ? { name: match[1], direction: match[2], nth: Number(match[3] ?? 1) } : void 0;
}
function metaSort(table) {
  const sort = table.meta?.sort === void 0 ? void 0 : parseSort(table.meta.sort);
  const column = sort && findColumn(table.rows[0]?.cells ?? [], sort);
  return sort && column !== void 0 ? { column, direction: sort.direction } : void 0;
}
function withMetaSort(table, sort) {
  const id = sort && columnIdOf(table.rows[0]?.cells ?? [], sort.column);
  if (!sort || !id) return withMeta(table, "sort", void 0);
  return withMeta(table, "sort", `${id.name}:${sort.direction}${id.shared ? `:${id.nth}` : ""}`);
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
function tableNameProblem(name) {
  return nameProblem(name, "table");
}
function metaName(table) {
  const name = table.meta?.name?.trim();
  return name && !tableNameProblem(name) ? name : void 0;
}
function withMetaName(table, name) {
  return withMeta(table, "name", name);
}
function sameTableName(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}
function followMetaSort(before, after, map) {
  if (after.meta?.sort === void 0 || after.meta.sort !== before.meta?.sort) return after;
  const sort = metaSort(before);
  const column = sort && map(sort.column);
  return withMetaSort(after, sort && column !== void 0 ? { column, direction: sort.direction } : void 0);
}
function metadataAfterEdit(before, after, edit) {
  const followed = followMetaSort(before, after, edit.columnMap ?? ((c) => c));
  return edit.pins ? withMetaPins(followed, edit.pins) : followed;
}

// table-plus/src/features/metadata.ts
function withoutMetadata(table) {
  const { meta: _meta, metaSource: _source, ...rest } = withoutNames(withoutFormulas(table));
  return rest;
}
function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
var Metadata = class {
  constructor(host) {
    this.host = host;
  }
  host;
  toolbarButtons(widget, info) {
    const table = parseTable(info.source);
    if (!info.metaRow && formulaCount(table) === 0 && !hasNames(table)) return [];
    return [
      {
        label: "Remove metadata",
        title: "Remove this table's <meta> tags: its stored settings (sorting, pinning, name), the formulas of its cells, which keep their results, and the names of its columns and cells",
        run: () => void this.removeFromTable(widget, info)
      }
    ];
  }
  /**
   * Removes a table's metadata, once confirmed: its metadata row (a sorting
   * stored there goes with it: the rows show as written) and the formulas of
   * its cells, which keep their results as plain values
   */
  async removeFromTable(shownWidget, shownInfo) {
    const shown = parseTable(shownInfo.source);
    const formulas = formulaCount(shown);
    const removed = [
      ...shownInfo.metaRow ? ["its stored settings (sorting, pinning, name)"] : [],
      ...formulas ? [`its ${plural(formulas, "formula")}: those cells keep their current results as plain values`] : [],
      ...hasNames(shown) ? ["the names of its columns and cells"] : []
    ];
    if (!await this.host.ask(`Remove this table's metadata, ${removed.join(", and ")}? Ctrl+Z brings it back.`)) return;
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    if (metaSort(parseTable(info.source))) this.host.forgetStoredSort(info.key);
    await this.host.write(widget, withoutMetadata);
    this.host.focusEditor(widget);
  }
  /** Removes the metadata of all tables on the current page, once confirmed */
  async removeFromPage() {
    const { bridge } = this.host;
    const text = await bridge.getText();
    const tables = findTables(text).filter((range) => {
      const table = parseTable(range.text);
      return table.meta !== void 0 || formulaCount(table) > 0 || hasNames(table);
    }).reverse();
    if (tables.length === 0) {
      void bridge.flash("Table Plus: no table on this page has metadata", "info");
      return;
    }
    const formulas = tables.reduce((n, range) => n + formulaCount(parseTable(range.text)), 0);
    const question = `Remove the metadata of ${tables.length === 1 ? "the 1 table" : `all ${tables.length} tables`} on this page` + (formulas ? `, including ${plural(formulas, "formula")} (those cells keep their current results as plain values)` : "") + "? Ctrl+Z brings it back.";
    if (!await this.host.ask(question)) return;
    const from = tables[tables.length - 1].from;
    const to = tables[0].to;
    let span = text.slice(from, to);
    const page = await bridge.getCurrentPage();
    for (const range of tables) {
      const table = parseTable(range.text);
      if (metaSort(table)) this.host.forgetStoredSort(`${page}#${range.ordinal}`);
      span = span.slice(0, range.from - from) + serializeTable(withoutMetadata(table)) + span.slice(range.to - from);
    }
    const edit = minimalEdit(text.slice(from, to), span);
    await bridge.replaceRange(from + edit.from, from + edit.to, edit.insert);
    this.host.doc.querySelector(EDITOR_SELECTOR)?.focus({ preventScroll: true });
    void bridge.flash(`Table Plus: removed the metadata of ${tables.length} table(s)`, "info");
  }
};

// table-plus/src/features/names.ts
var Names = class {
  constructor(host) {
    this.host = host;
  }
  host;
  /** Named cells show a mark in their corner, and their name on hover */
  decorate(_widget, info) {
    const model = parseTable(info.source);
    model.rows[0]?.cells.forEach((raw, column) => {
      const name = nameOf(raw);
      const cell = info.table.rows[0]?.cells[column];
      if (!name || !cell) return;
      cell.classList.add("tp-named");
      cell.title = cell.title ? `${cell.title}
Fixed name: ${name}` : `Fixed name: ${name}`;
    });
    for (const tr of Array.from(info.table.querySelectorAll("tr[data-tp-row]"))) {
      const cells = model.rows[Number(tr.dataset.tpRow)]?.cells ?? [];
      cells.forEach((raw, column) => {
        const name = cellNameOf(raw);
        const cell = tr.cells[column];
        if (!name || !cell) return;
        cell.classList.add("tp-named");
        cell.title = cell.title ? `${cell.title}
Name: ${name}` : `Name: ${name}`;
      });
      const row = rowNameIn(cells)?.name;
      const first = tr.cells[0];
      if (row && first) {
        first.classList.add("tp-row-named");
        first.title = first.title ? `${first.title}
Row name: ${row}` : `Row name: ${row}`;
      }
    }
  }
  /** "Name" in the toolbar: the table's name */
  toolbarButtons(widget, info) {
    const name = metaName(parseTable(info.source));
    if (!info.metaRow && !this.host.metadataEnabled) return [];
    return [
      {
        label: name ? `Name: ${name}` : "Name",
        title: name ? `This table is named ${name}: formulas in other tables refer to it as ${name}!A1. Click to rename it` : "Name this table, so formulas in other tables can refer to it (name!A1)",
        run: () => void this.renameTable(widget, info)
      }
    ];
  }
  /**
   * Names, renames or (with an empty name) unnames a table, asking for the
   * name; refused when it is not a valid name or another table on the page has it
   */
  async renameTable(shownWidget, shownInfo) {
    const shown = parseTable(shownInfo.source);
    const answer = await this.host.promptText("Table name (letters, digits and _; empty: no name)", metaName(shown) ?? "");
    if (answer === void 0) return;
    const name = answer.trim();
    if (name === (shown.meta?.name?.trim() ?? "")) return;
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    const problem = name === "" ? void 0 : tableNameProblem(name);
    if (problem) {
      void this.host.bridge.flash(`Table Plus: ${problem}`, "error");
      return;
    }
    if (name !== "") {
      const text = await this.host.bridge.getText();
      const self = locateBySource(text, info.hint, info.source);
      const taken = findTables(text).some((range) => {
        if (range.from === self?.from) return false;
        const other = metaName(parseTable(range.text));
        return other !== void 0 && sameTableName(other, name);
      });
      if (taken) {
        void this.host.bridge.flash(`Table Plus: another table on this page is named ${name}`, "error");
        return;
      }
    }
    await this.host.write(widget, (t) => withMetaName(t, name === "" ? void 0 : name));
    this.host.focusEditor(widget);
  }
  /** "Name row" and "Name cell" in a row's menu, the cell being the one in `column` */
  rowMenuEntries(widget, info, row, column) {
    const cells = parseTable(info.source).rows[row]?.cells ?? [];
    const name = cellNameOf(cells[column] ?? "");
    const allowed = this.host.metadataEnabled || name !== void 0;
    const rowName = rowNameIn(cells)?.name;
    const rowAllowed = this.host.metadataEnabled || rowName !== void 0;
    return [
      {
        kind: "item",
        label: "Name row",
        icon: ICONS.fixedName,
        ...rowName ? { value: { text: rowName } } : {},
        ...rowAllowed ? {
          hint: rowName ? `Formulas use this row's cells as ${rowName}[column] (from other tables table!${rowName}[column]), wherever it is moved. Click to rename it` : "Name this row, so formulas use its cells as name[column], wherever it is moved or sorted"
        } : { disabled: "Needs the Store table metadata setting" },
        run: () => void this.nameRow(widget, info, row)
      },
      {
        kind: "item",
        label: "Name cell",
        icon: ICONS.fixedName,
        ...name ? { value: { text: name } } : {},
        ...allowed ? {
          hint: name ? `Formulas use this cell as ${name} (on other pages [[Page]]${name}), wherever it is moved. Click to rename it` : "Name this cell, so formulas use it by its name (vat), wherever it is moved"
        } : { disabled: "Needs the Store table metadata setting" },
        run: () => void this.nameCell(widget, info, row, column)
      }
    ];
  }
  async nameRow(shownWidget, shownInfo, row) {
    const table = parseTable(shownInfo.source);
    const current = rowNameIn(table.rows[row]?.cells ?? [])?.name ?? "";
    const answer = await this.host.promptText("Name of the row (letters, digits and _; empty: none)", current);
    if (answer === void 0) return;
    const name = answer.trim();
    if (name === current) return;
    let problem = name === "" ? void 0 : nameProblem(name, "row");
    const other = name ? namedRows(table).get(name.toLowerCase()) : void 0;
    if (!problem && other !== void 0 && other !== row) problem = `another row of this table is named ${name}`;
    if (problem) {
      void this.host.bridge.flash(`Table Plus: ${problem}`, "error");
      return;
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => {
      const column = rowNameIn(t.rows[row]?.cells ?? [])?.column ?? 0;
      return setCell(t, row, column, withName(t.rows[row]?.cells[column] ?? "", name || void 0));
    });
    this.host.focusEditor(widget);
  }
  async nameCell(shownWidget, shownInfo, row, column) {
    const current = cellNameOf(parseTable(shownInfo.source).rows[row]?.cells[column] ?? "") ?? "";
    const answer = await this.host.promptText("Name of the cell (letters, digits and _; empty: none)", current);
    if (answer === void 0) return;
    const name = answer.trim();
    if (name === current) return;
    let problem = name === "" ? void 0 : nameProblem(name, "cell");
    if (!problem && name && FUNCTIONS[name.toUpperCase()]) problem = `${name} is a function's name`;
    if (!problem && name) {
      const text = await this.host.bridge.getText();
      const own = locateBySource(text, shownInfo.hint, shownInfo.source);
      const taken = findTables(text).some(
        (range) => parseTable(range.text).rows.some(
          (r, ri) => ri > 0 && r.cells.some((cell, ci) => cellNameOf(cell)?.toLowerCase() === name.toLowerCase() && !(own && range.from === own.from && ri === row && ci === column))
        )
      );
      if (taken) problem = `another cell on this page is named ${name}`;
    }
    if (problem) {
      void this.host.bridge.flash(`Table Plus: ${problem}`, "error");
      return;
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => setCell(t, row, column, withCellName(t.rows[row]?.cells[column] ?? "", name || void 0)));
    this.host.focusEditor(widget);
  }
  /** "Fixed name" in a column's menu */
  columnMenuEntries(widget, info, column) {
    const fixed = nameOf(parseTable(info.source).rows[0]?.cells[column] ?? "");
    const allowed = this.host.metadataEnabled || fixed !== void 0;
    return [
      {
        kind: "item",
        label: "Fixed name",
        icon: ICONS.fixedName,
        ...fixed ? { value: { text: fixed } } : {},
        ...allowed ? {
          hint: fixed ? `Formulas refer to this column as [${fixed}], whatever its header says. Click to change or remove it` : "Give the column a name formulas refer to it by, which stays when its header is renamed (also from other pages)"
        } : { disabled: "Needs the Store table metadata setting" },
        run: () => void this.rename(widget, info, column)
      }
    ];
  }
  async rename(shownWidget, shownInfo, column) {
    const headers = parseTable(shownInfo.source).rows[0]?.cells ?? [];
    const current = nameOf(headers[column] ?? "") ?? "";
    const answer = await this.host.promptText("Fixed name of the column (letters, digits and _; empty: none)", current || columnKey(headers[column] ?? ""));
    if (answer === void 0) return;
    const name = answer.trim();
    if (name === current) return;
    const problem = name === "" ? void 0 : nameProblem(name, "column");
    const taken = name !== "" && headers.some((header, c) => c !== column && (nameOf(header)?.toLowerCase() === name.toLowerCase() || columnIdOf(headers, c)?.name === name.toLowerCase()));
    if (problem || taken) {
      void this.host.bridge.flash(`Table Plus: ${problem ?? `another column of this table is named ${name}`}`, "error");
      return;
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => setCell(t, 0, column, withName(t.rows[0]?.cells[column] ?? "", name || void 0)));
    this.host.focusEditor(widget);
  }
};

// table-plus/src/paste.ts
function parseClipboardCells(text) {
  const s = text.replace(/\r\n?/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let start = true;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (start && ch === '"') {
      let j = i + 1;
      let value = "";
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] !== '"') break;
          value += '"';
          j += 2;
        } else value += s[j++];
      }
      if (j < s.length && (j + 1 === s.length || s[j + 1] === "	" || s[j + 1] === "\n")) {
        cell = value;
        i = j;
        start = false;
        continue;
      }
    }
    start = false;
    if (ch === "	") {
      row.push(cell);
      cell = "";
      start = true;
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      start = true;
    } else cell += ch;
  }
  if (!start || cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length === 0 || rows.length === 1 && rows[0].length === 1) return void 0;
  return rows;
}
function along(start, count, length, pinnedAtEnd) {
  const tail = length - pinnedAtEnd;
  const inTail = pinnedAtEnd > 0 && start >= tail;
  const end = inTail ? length : tail;
  const existing = [];
  for (let i = start; i < end && existing.length < count; i++) existing.push(i);
  const missing = count - existing.length;
  if (missing > 0 && inTail) return void 0;
  const added = Array.from({ length: missing }, (_, k) => tail + k);
  return { targets: [...existing, ...added], at: tail, count: missing };
}
function planPaste(table, pins, at, data, insert) {
  const width = Math.max(...data.map((r) => r.length));
  const columns = along(at.column, width, table.align.length, pins.right);
  if (!columns) return { error: "there are no columns after the columns pinned to the right to paste into" };
  if (insert) {
    const first = Math.max(1, at.row);
    let p = pins;
    let rows = table.rows.length;
    let index = first;
    const targets = [];
    for (let k = 0; k < data.length; k++) {
      const placed = insertRowAt(p, rows, index);
      targets.push(placed.at);
      p = placed.pins;
      rows++;
      index = placed.at + 1;
    }
    return {
      rows: targets,
      columns: columns.targets,
      newRows: { at: targets[0], count: data.length },
      newColumns: { at: columns.at, count: columns.count },
      pins: p
    };
  }
  const header = at.row === 0 ? [0] : [];
  const body = along(Math.max(1, at.row), data.length - header.length, table.rows.length, pins.bottom);
  if (!body) return { error: "there are no rows below the rows pinned to the bottom to paste into" };
  return {
    rows: [...header, ...body.targets],
    columns: columns.targets,
    newRows: { at: body.at, count: body.count },
    newColumns: { at: columns.at, count: columns.count },
    pins
  };
}
function pasteCells(table, plan, data) {
  let result = table;
  for (let k = 0; k < plan.newColumns.count; k++) result = insertColumn(result, plan.newColumns.at + k);
  for (let k = 0; k < plan.newRows.count; k++) result = insertRow(result, plan.newRows.at + k);
  for (let k = 0; k < plan.newRows.count; k++) result = withCalculatedCells(result, plan.newRows.at + k);
  let skipped = 0;
  data.forEach((values, i) => {
    const row = plan.rows[i];
    values.forEach((value, j) => {
      const column = plan.columns[j];
      const current = result.rows[row]?.cells[column] ?? "";
      const cell = escapeCell(value);
      if (formulaOf(current)) {
        if (cell !== "") skipped++;
        return;
      }
      if (row === 0 && cell === "") return;
      result = setCell(result, row, column, keepNames(cell, current));
    });
  });
  return { table: result, skipped };
}

// table-plus/src/features/paste.ts
var PASTE_BLOCKED = "Clear sorting and filters to paste cells: the rows shown are not where they would go";
function plural2(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
var Paste = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // The paste on its way was asked for with Ctrl+Shift+V: as new rows
  inserts = false;
  editorOpened(editor) {
    const field = editor.field;
    field.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") this.inserts = e.shiftKey;
    });
    field.addEventListener("paste", (e) => {
      const insert = this.inserts;
      this.inserts = false;
      const data = parseClipboardCells(e.clipboardData?.getData("text/plain") ?? "");
      if (!data || this.host.editing?.field !== field) return;
      e.preventDefault();
      void this.paste(data, insert);
    });
  }
  /**
   * Pastes the cells from the edited cell, as one edit: over the cells there
   * (insert false), or as new rows at the cell's row. Cells with formulas keep
   * them. Not while the table is sorted or filtered: the rows shown are not
   * where the cells would go.
   */
  async paste(data, insert) {
    const active = this.host.editing;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    if (this.host.rearranged(info)) {
      void this.host.bridge.flash(`Table Plus: ${PASTE_BLOCKED.toLowerCase()}`, "info");
      return;
    }
    const plan = planPaste(parseTable(info.source), info.pins, active, data, insert);
    if ("error" in plan) {
      void this.host.bridge.flash(`Table Plus: cannot paste here: ${plan.error}`, "error");
      return;
    }
    const closed = this.host.takeEditor();
    let skipped = 0;
    const { newRows, newColumns } = plan;
    const result = await this.host.write(
      closed.widget,
      (t) => {
        const edited = closed.save(t);
        if (!edited) return void 0;
        const pasted = pasteCells(edited, plan, data);
        skipped = pasted.skipped;
        return pasted.table;
      },
      {
        columnMap: newColumns.count ? (c) => c >= newColumns.at ? c + newColumns.count : c : void 0,
        pins: plan.pins,
        rowMap: newRows.count ? (r) => r >= newRows.at ? r + newRows.count : r : void 0
      }
    );
    if (result !== "written") return;
    const width = Math.max(...data.map((r) => r.length));
    const added = [
      ...newRows.count && !insert ? [`added ${plural2(newRows.count, "row")}`] : [],
      ...newColumns.count ? [`added ${plural2(newColumns.count, "column")}`] : [],
      ...skipped ? [`kept ${plural2(skipped, "formula cell")}`] : []
    ];
    const what = insert ? `${plural2(data.length, "new row")}` : `${data.length} \xD7 ${width} cells`;
    void this.host.bridge.flash(`Table Plus: pasted ${what}${added.length ? ` (${added.join(", ")})` : ""}`, "info");
    this.host.focusEditor(closed.widget);
  }
};

// table-plus/src/features/selection.ts
function clipboardText(values) {
  const quote = (v) => /[\t\n"]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  return values.map((row) => row.map(quote).join("	")).join("\n");
}
function clipboardHtml(values) {
  const escape = (v) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const rows = values.map((row) => `<tr>${row.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("");
  return `<table>${rows}</table>`;
}
var Selection = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // The cells selected (rows of the markdown, header 0), in the table with this key
  selection;
  stopSelecting;
  start() {
    this.host.doc.defaultView.addEventListener("copy", this.onCopy, true);
  }
  stop() {
    this.host.doc.defaultView.removeEventListener("copy", this.onCopy, true);
    this.stopSelecting?.();
  }
  // Any click ends a selection (one on Table Plus' own controls aside)
  beforeMouseDown(e) {
    if (this.selection && !(e.target instanceof Node && this.host.isFloating(e.target))) this.clear();
  }
  /**
   * After a press on a cell: dragging on to another cell of the table, with
   * the button held, selects the cells between the two as shown (sorting and
   * filters included), and closes the cell editor the press opened, unchanged
   */
  afterCellPress(info, anchor) {
    this.stopSelecting?.();
    const { key } = info;
    const win = this.host.doc.defaultView;
    const move = (ev) => {
      if (ev.buttons === 0) {
        end();
        return;
      }
      const hit = this.host.enhancedWidgetOf(ev.target);
      const cell = hit && hit[1].key === key ? this.host.tableCellOf(hit[1], ev.target) : void 0;
      const ref = hit && cell ? this.host.cellRef(hit[1], cell) : void 0;
      if (!ref) return;
      const current = this.selection;
      if (!current) {
        if (ref.row === anchor.row && ref.column === anchor.column) return;
        this.host.cancelEditing();
        this.selection = { key, anchor, focus: ref };
      } else if (current.focus.row === ref.row && current.focus.column === ref.column) return;
      else current.focus = ref;
      this.show();
    };
    const end = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", end, true);
      this.stopSelecting = void 0;
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", end, true);
    this.stopSelecting = end;
  }
  keyDown(e) {
    if (!this.selection) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      this.clear();
      return true;
    }
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (e.key === "Delete" && !inField && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      void this.emptyCells();
      return true;
    }
    return false;
  }
  // A table rendered again (after a write) shows the selection again
  enhanced(_widget, info) {
    if (this.selection?.key === info.key) this.show();
  }
  /** The selected cells as shown: rows top to bottom (the header first), columns left to right */
  cells() {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!selection || !info) return void 0;
    const shown = this.host.shownRows(info);
    const index = (row) => shown.findIndex((tr) => row === 0 ? tr === info.table.rows[0] : tr.dataset.tpRow === String(row));
    const a = index(selection.anchor.row);
    const b = index(selection.focus.row);
    if (a < 0 || b < 0) return void 0;
    const left = Math.min(selection.anchor.column, selection.focus.column);
    const right = Math.max(selection.anchor.column, selection.focus.column);
    return shown.slice(Math.min(a, b), Math.max(a, b) + 1).map((tr) => Array.from(tr.cells).slice(left, right + 1));
  }
  show() {
    this.unmark();
    for (const row of this.cells() ?? []) for (const cell of row) cell.classList.add("tp-selected");
  }
  clear() {
    this.selection = void 0;
    this.unmark();
  }
  unmark() {
    for (const cell of Array.from(this.host.doc.querySelectorAll(".tp-selected"))) cell.classList.remove("tp-selected");
  }
  /**
   * Empties the selected cells, formulas included, as one edit; header cells
   * keep their names (a column needs one). The selection stays.
   */
  async emptyCells() {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    const cells = this.cells();
    if (!widget || !info || !cells) return;
    const refs = cells.flat().map((cell) => this.host.cellRef(info, cell)).filter((ref) => ref !== void 0 && ref.row > 0);
    const emptied = (table, ref) => setCell(table, ref.row, ref.column, keepNames("", table.rows[ref.row]?.cells[ref.column] ?? ""));
    await this.host.write(widget, (t) => refs.reduce(emptied, t));
  }
  /**
   * Ctrl+C with cells selected copies them as a spreadsheet does: as text with
   * a tab between cells and a line break between rows, and as an HTML table,
   * so Excel and Google Sheets paste them into cells. Cells copy what they
   * show (a formula's result, a link's text), a typed cell its value.
   */
  onCopy = (e) => {
    const cells = this.selection && this.cells();
    const active = this.host.doc.activeElement;
    if (!cells || !e.clipboardData || active instanceof HTMLInputElement && active.selectionStart !== active.selectionEnd) return;
    const values = cells.map((row) => row.map(cellValue));
    e.clipboardData.setData("text/plain", clipboardText(values));
    e.clipboardData.setData("text/html", clipboardHtml(values));
    e.preventDefault();
    e.stopImmediatePropagation();
    void this.host.bridge.flash(`Table Plus: copied ${values.length} \xD7 ${values[0]?.length ?? 0} cells`, "info");
  };
};

// table-plus/src/features/sticky.ts
var Sticky = class {
  constructor(host) {
    this.host = host;
  }
  host;
  layoutChanged() {
    const { doc } = this.host;
    for (const widget of Array.from(doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
      const head = info?.table.tHead;
      if (!info || !head || renderedTable(widget) !== info.table) continue;
      const scroller = this.host.scrollParentOf(widget)?.getBoundingClientRect();
      const inside = this.host.scrollsInside(widget);
      const box = this.host.innerBox(widget);
      const pageTop = (scroller?.top ?? 0) + STICKY_GAP;
      const boxTop = inside ? box.top : -Infinity;
      const table = info.table.getBoundingClientRect();
      const foot = info.table.tFoot;
      const footHeight = foot?.offsetHeight ?? 0;
      let footTop = table.bottom - footHeight;
      if (foot && footHeight > 0) {
        const pageBottom = scroller?.bottom ?? doc.defaultView.innerHeight;
        const boxBottom = inside ? box.bottom : Infinity;
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
};

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
var BAR_GAP = 10;
var STORE_SORT_DELAY_MS = 400;
var FILTER_HINT = "Text to find. Also: >10 <10 >=10 <=10 (numbers), /pattern/ (regular expression; /pattern/c is case-sensitive), =text (whole cell), !filter (not)";
var NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";
function placeAtEnd(parent, rows) {
  let next = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const tr = rows[i];
    if (tr.parentElement !== parent || tr.nextSibling !== next) parent.insertBefore(tr, next);
    next = tr;
  }
}
function pageTablesOf(text) {
  return findTables(text).map((range) => ({ range, table: parseTable(range.text) }));
}
function pageTables(tables, replace, others) {
  const pages = /* @__PURE__ */ new Map();
  const namesOf2 = (page) => {
    const here = page === void 0 || page === others?.here;
    const key = here ? "" : page;
    let names = pages.get(key);
    if (!names) {
      const list = here ? tables() : others?.tables(page);
      if (!list) return void 0;
      names = { tables: /* @__PURE__ */ new Map(), cells: /* @__PURE__ */ new Map() };
      for (const { range, table: parsed2 } of list) {
        const table = here && replace && range.from === replace.from ? replace.table : parsed2;
        const own = metaName(table)?.toLowerCase();
        if (own && !names.tables.has(own)) names.tables.set(own, table);
        for (const [name, cell] of namedCells(table)) if (!names.cells.has(name)) names.cells.set(name, { table, ...cell });
      }
      pages.set(key, names);
    }
    return names;
  };
  return Object.assign((name, page) => namesOf2(page)?.tables.get(name.toLowerCase()), {
    cell: (name, page) => namesOf2(page)?.cells.get(name.toLowerCase())
  });
}
function affectedBy(...tables) {
  const affected = { tables: /* @__PURE__ */ new Set(), cells: /* @__PURE__ */ new Set() };
  for (const table of tables) addAffected(affected, table);
  return affected;
}
function addAffected(affected, table) {
  const name = metaName(table)?.toLowerCase();
  if (name) affected.tables.add(name);
  for (const cell of cellNamesOf(table)) affected.cells.add(cell);
}
function referredBy(table) {
  return { tables: referredTableNames(table), cells: referredCellNames(table) };
}
function isAffected(referred, affected) {
  return [...referred.tables].some((n) => affected.tables.has(n)) || [...referred.cells].some((n) => affected.cells.has(n));
}
function tablesWritten(all, source) {
  const own = all.find((t) => t.range.text === source)?.table;
  if (!own) return all.map((t) => t.table);
  const result = [own];
  const affected = affectedBy(own);
  const rest = all.filter((t) => t.table !== own).map((t) => ({ table: t.table, referred: referredBy(t.table) }));
  for (let found = true; found; ) {
    found = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (!isAffected(rest[i].referred, affected)) continue;
      result.push(rest[i].table);
      addAffected(affected, rest[i].table);
      rest.splice(i, 1);
      found = true;
    }
  }
  return result;
}
var MAX_OTHER_PAGES = 20;
var Controller = class {
  constructor(doc, bridge) {
    this.doc = doc;
    this.bridge = bridge;
    this.metadata = new Metadata(this);
    this.cellEditor = new CellEditing(this, {
      features: this.features,
      isolate: (element) => this.isolate(element),
      endHover: () => this.hoverEdited(),
      movingRows: () => this.movingRows
    });
    this.bar = this.floating("div", "tp-bar");
    this.addRow = this.floatingButton("tp-add tp-add-row", "Add a row at the end", ICONS.plus);
    this.addRow.insertAdjacentText("beforeend", "Row");
    this.addColumn = this.floatingButton("tp-add tp-add-column", "Add a column at the end", ICONS.plus);
  }
  doc;
  bridge;
  infos = /* @__PURE__ */ new WeakMap();
  // The page's text as last read, and its tables for formulas that refer to them
  pageText = "";
  pageSource;
  currentPage = "";
  // The other pages formulas refer to, as last read: their tables (null: the page could not be read)
  otherPages = /* @__PURE__ */ new Map();
  otherPagesRead = 0;
  // Tables being enhanced: a scan meanwhile waits for it instead of starting again
  enhancing = /* @__PURE__ */ new WeakMap();
  views = /* @__PURE__ */ new Map();
  filterOptions = DEFAULT_FILTER_OPTIONS;
  // The maximum table height setting, in pixels; 0: no limit
  maxHeight = 0;
  // The metadata setting, for menus that offer pinning
  metadataOn = false;
  // Sideways scroll of each wide table, carried over to its next rendering
  scrollLefts = /* @__PURE__ */ new Map();
  // The same for tables taller than the maximum height setting, scrolled inside
  scrollTops = /* @__PURE__ */ new Map();
  cellEditor;
  hoverWidget;
  hoverCell;
  hideTimer;
  scanQueued = false;
  // Set by stop(): work already scheduled then does nothing
  stopped = false;
  // Rows are being rearranged: a cell editor losing its focus to that is not left
  movingRows = false;
  settingsTimer;
  settingsReadAt = 0;
  sortTimers = /* @__PURE__ */ new Map();
  stickyQueued = false;
  warnedIncompatible = false;
  observer;
  bar;
  addRow;
  addColumn;
  // Features that keep their own state and work through this controller
  // (core/feature.ts): those turned on, filled in when Table Plus starts
  features = [];
  featuresStarted;
  metadata;
  expressions;
  // Steps every write goes through after the edit, in this order
  writeSteps = [formulasAfterEdit, metadataAfterEdit];
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
    this.addRow.addEventListener("click", () => this.appendRow());
    this.addColumn.addEventListener("click", () => this.appendColumn());
    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    this.featuresStarted = this.startFeatures();
    void this.scan();
    void this.refreshSettings();
  }
  /**
   * Creates and starts the features, but the modules turned off
   * (`tablePlus.modules.<name>.enabled`). Read once: a change applies when the
   * page is loaded again.
   */
  async startFeatures() {
    const optional = (name, create) => ({ name, create });
    const always = (create) => ({ name: void 0, create });
    const all = [
      // First: the header moves before what follows it
      optional("sticky", () => new Sticky(this)),
      optional("autoscroll", () => new Autoscroll(this)),
      optional("handles", () => new Grips(this)),
      optional("formulas", () => new Formulas(this)),
      // After formulas: a formula's result is shown in its column's type
      optional("columnTypes", () => new ColumnTypes(this)),
      // Before metadata: Name before Remove metadata in the toolbar
      optional("names", () => new Names(this)),
      always(() => this.metadata),
      optional("paste", () => new Paste(this)),
      optional("selection", () => new Selection(this)),
      always(() => this.expressions = new Expressions(this)),
      always(() => new History(this))
    ];
    const enabled = await Promise.all(all.map(({ name }) => name ? this.featureEnabled(name) : true));
    if (this.stopped) return;
    const features = all.filter((_, i) => enabled[i]).map(({ create }) => create());
    this.features.push(...features);
    for (const feature of features) feature.start?.();
  }
  async featureEnabled(name) {
    try {
      const value = await this.bridge.getConfig?.(`tablePlus.modules.${name}.enabled`, true);
      return typeof value === "boolean" ? value : true;
    } catch {
      return true;
    }
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
    for (const feature of this.features) feature.stop?.();
    win.removeEventListener("keyup", this.onKeyUp, true);
    win.removeEventListener("blur", this.onBlur);
    this.doc.removeEventListener("mousemove", this.onMouseMove);
    this.observer?.disconnect();
    clearTimeout(this.settingsTimer);
    for (const timer of this.sortTimers.values()) clearTimeout(timer);
    for (const el of [this.bar, this.addRow, this.addColumn]) el.remove();
  }
  onBlur = () => this.cellEditor.setNavigating(false);
  /**
   * A cell editor opened: the grips go to the edited cell and stay there while
   * it is edited, so its row's and column's menus are a click away (and on a
   * touch screen, where nothing hovers, the way to them)
   */
  hoverEdited() {
    const active = this.cellEditor.active;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) {
      this.endHover(false);
      return;
    }
    this.hoverCell = active.cell;
    for (const feature of this.features) feature.cellHovered?.(active.widget, info, active.cell);
  }
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
  /** The page's tables (as last read) that formulas can refer to by name, and those of the other pages read */
  tableSource() {
    const key = `${this.otherPagesRead}\0${this.currentPage}\0${this.pageText}`;
    if (this.pageSource?.key !== key) {
      const text = this.pageText;
      this.pageSource = { key, source: pageTables(() => pageTablesOf(text), void 0, this.others()) };
    }
    return this.pageSource.source;
  }
  toolbarChanged() {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (widget && info && this.bar.classList.contains("tp-visible")) this.showTableControls(widget, info);
  }
  others() {
    return { here: this.currentPage, tables: (page) => this.otherPages.get(page) };
  }
  /**
   * Reads the other pages these tables' formulas refer to, and in turn the
   * pages those pages' tables refer to; `fresh`: also those read before
   */
  async loadPages(tables, fresh) {
    if (!this.bridge.readPage) return;
    const queue = /* @__PURE__ */ new Set();
    for (const table of tables) for (const page of referredPages(table)) queue.add(page);
    const done = /* @__PURE__ */ new Set();
    for (const page of queue) {
      if (done.size >= MAX_OTHER_PAGES) break;
      done.add(page);
      if (page === this.currentPage) continue;
      if (fresh === true || fresh && fresh.has(page) || !this.otherPages.has(page)) await this.readOtherPage(page);
      for (const { table } of this.otherPages.get(page) ?? []) for (const next of referredPages(table)) queue.add(next);
    }
  }
  /** Reads another page's tables; the earlier ones stay until it is read, so formulas never see it missing meanwhile */
  async readOtherPage(page) {
    let tables;
    try {
      tables = pageTablesOf(await this.bridge.readPage(page));
    } catch {
      tables = null;
    }
    this.otherPages.set(page, tables);
    this.otherPagesRead++;
  }
  async promptText(message, value = "") {
    const answer = this.bridge.prompt ? await this.bridge.prompt(message, value) : this.doc.defaultView.prompt(message, value);
    return answer ?? void 0;
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
    const values = rows.map((tr) => Array.from(tr.cells).map(cellValue));
    const { top, bottom } = info.pins;
    const middle = visibleRows(values, withPins({ ...view, filters: [] }, info.pins), this.filterOptions);
    const order = [
      ...rows.slice(0, top).map((_, i) => i + 1),
      ...middle.map((i) => i + 1),
      ...rows.slice(rows.length - bottom).map((_, i) => rows.length - bottom + i + 1)
    ];
    this.views.set(info.key, withoutSort(view));
    const position = new Map(order.map((row, i) => [row, i + 1]));
    await this.write(widget, (t) => withMetaSort(reorderRows(t, order), void 0), {
      rowMap: (r) => r === 0 ? 0 : position.get(r)
    });
    this.focusEditor(widget);
  }
  /**
   * The sorting a table's metadata stored ends with the metadata, so the rows
   * show as written. Without filters the view is forgotten, so Ctrl+Z (the
   * metadata back) shows the stored sorting again.
   */
  forgetStoredSort(key) {
    clearTimeout(this.sortTimers.get(key));
    this.sortTimers.delete(key);
    const view = this.views.get(key);
    if (view && view.filters.some((f) => f !== "")) this.views.set(key, withoutSort(view));
    else this.views.delete(key);
  }
  /**
   * The table as rendered now: a write (e.g. of a stored sorting) re-renders
   * it, so controls made for the earlier rendering look it up when used
   */
  current(widget, info) {
    const now2 = this.widgetForKey(info.key);
    const nowInfo = now2 && this.infos.get(now2);
    return now2 && nowInfo ? [now2, nowInfo] : [widget, info];
  }
  /** Re-reads settings the view depends on, and re-applies the views if they changed */
  async refreshSettings() {
    const smart = await this.setting("smartFilters") === true;
    const maxHeight = await this.setting("maxHeight");
    this.metadataOn = await this.setting("metadata");
    this.cellEditor.selectOnClick = await this.setting("selectOnClick");
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
  async scan() {
    if (this.stopped) return;
    await this.featuresStarted;
    if (this.stopped) return;
    const pending = [];
    for (const widget of Array.from(this.doc.querySelectorAll(WIDGET_SELECTOR))) {
      const table = renderedTable(widget);
      if (!table || table.rows.length === 0) continue;
      if (this.infos.get(widget)?.table === table || widget.dataset.tpUnsupported) continue;
      pending.push(this.enhance(widget, table));
    }
    await Promise.all(pending);
  }
  enhance(widget, table) {
    const running = this.enhancing.get(widget);
    if (running) return running;
    const done = this.enhanceNow(widget, table).finally(() => this.enhancing.delete(widget));
    this.enhancing.set(widget, done);
    return done;
  }
  async enhanceNow(widget, table) {
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
      this.pageText = text;
      const range = locateByShape(text, hint, shape);
      if (!range) {
        const broken = locateWithEmptyHeaders(text, hint, shape);
        if (broken) this.offerHeaderFix(widget, broken.text, broken.from);
        this.markUnsupported(widget, false);
        return;
      }
      const page = await this.bridge.getCurrentPage();
      if (this.stopped || renderedTable(widget) !== table) return;
      this.currentPage = page;
      const model = parseTable(range.text);
      await this.loadPages([model], false);
      if (this.stopped || renderedTable(widget) !== table) return;
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
      this.cellEditor.takePending(widget, info);
      for (const feature of this.features) feature.enhanced?.(widget, info);
      this.queueStickyUpdate();
      void this.refreshSettings();
    } catch (e) {
      console.error("Table Plus: could not enhance a table", e);
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
    for (const feature of this.features) feature.decorate?.(widget, info);
    for (const cell of Array.from(rows[0].cells)) keepIconsWithName(cell);
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
  // ---- host API for features (core/feature.ts) ----------------------------
  infoOf(widget) {
    return this.infos.get(widget);
  }
  get editing() {
    return this.cellEditor.active;
  }
  columnMenuEntries(widget, info, column, open) {
    return this.features.flatMap((f) => f.columnMenuEntries?.(widget, info, column, open) ?? []);
  }
  rowMenuEntries(widget, info, row, column) {
    return this.features.flatMap((f) => f.rowMenuEntries?.(widget, info, row, column) ?? []);
  }
  get metadataEnabled() {
    return this.metadataOn;
  }
  takeEditor() {
    const closed = this.cellEditor.close();
    return closed && { widget: closed.widget, row: closed.row, column: closed.column, save: (t) => this.cellEditor.withSaved(t, closed) };
  }
  /** The "Table Plus: Remove table metadata" command */
  removeAllMetadata() {
    return this.metadata.removeFromPage();
  }
  /** SilverBullet's `page:index` event */
  async pageIndexed(name) {
    if (this.otherPages.has(name)) {
      if (name === this.currentPage) this.otherPages.delete(name);
      else {
        await this.loadPages(this.tablesShown(), /* @__PURE__ */ new Set([name]));
        for (const feature of this.features) feature.tablesChanged?.();
      }
    }
    await this.expressions?.pageIndexed(name);
  }
  /** The tables Table Plus shows, as last read */
  tablesShown() {
    return Array.from(this.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`)).flatMap((widget) => {
      const info = this.infos.get(widget);
      return info ? [parseTable(info.source)] : [];
    });
  }
  cancelEditing() {
    this.cellEditor.dropPending();
    if (this.cellEditor.active) void this.cellEditor.finish(false);
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
    const values = rows.map((tr) => Array.from(tr.cells).map(cellValue));
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
    const editing = this.cellEditor.active?.widget === widget ? this.cellEditor.active : void 0;
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
    if (editing && this.cellEditor.active === editing && this.doc.activeElement !== editing.field) {
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
    for (const feature of this.features) if (feature.mouseDown?.(e)) return;
    if (e.button !== 0) return;
    for (const feature of this.features) feature.beforeMouseDown?.(e);
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
    if (!cell || this.cellEditor.active?.cell === cell) return;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    for (const feature of this.features) if (feature.beforeCellPress?.(widget, info, ref, e)) return;
    const select = e.shiftKey !== this.cellEditor.selectOnClick;
    if (this.cellEditor.active) void this.cellEditor.finish(true, { widget, ...ref, select });
    else this.cellEditor.open(widget, info, cell, select);
    for (const feature of this.features) feature.afterCellPress?.(info, ref, e);
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
    if (this.cellEditor.active) {
      void this.cellEditor.finish(true, void 0, false);
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
    if (this.features.some((f) => f.pointerBusy?.() === "drag")) return;
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info || renderedTable(widget) !== info.table || !this.isShown(widget, info, info.table)) {
      this.hideFloating(true);
      return;
    }
    this.showTableControls(widget, info);
    const cell = this.hoverCell;
    if (cell && cell.isConnected && this.isShown(widget, info, cell)) {
      for (const feature of this.features) feature.cellHovered?.(widget, info, cell);
    } else this.endHover(true);
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
  // ---- layout: what follows scrolling ------------------------------------------
  /** Once per frame after scrolling or rendering: the sticky header, then what points at it */
  queueStickyUpdate() {
    if (this.stickyQueued) return;
    this.stickyQueued = true;
    const run = () => {
      this.stickyQueued = false;
      if (this.stopped) return;
      for (const feature of this.features) feature.layoutChanged?.();
      this.followScroll();
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
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
    for (const feature of this.features) if (feature.keyDown?.(e)) return;
  };
  onKeyUp = (e) => {
    if (e.key === "Control") this.cellEditor.setNavigating(false);
  };
  onMouseMove = (e) => {
    if (this.features.some((f) => f.pointerBusy?.()) || e.buttons !== 0) return;
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
    if (this.cellEditor.active) return;
    const cell = this.tableCellOf(info, target);
    if (cell && cell !== this.hoverCell) {
      this.hoverCell = cell;
      for (const feature of this.features) feature.cellHovered?.(widget, info, cell);
    }
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
  /** The header row and the shown body rows, in display order */
  shownRows(info) {
    return [
      info.table.rows[0],
      ...Array.from(info.table.querySelectorAll("tr[data-tp-row]:not(.tp-hidden)"))
    ];
  }
  /** A setting's value, falling back to its default when unset or not valid */
  async setting(name) {
    const { path, parse: parse2 } = SETTINGS[name];
    const fallback = SETTINGS[name].default;
    try {
      const value = parse2(
        await this.bridge.getConfig?.(path, fallback)
      );
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }
  cellAt(info, ref, includeHidden = false) {
    const tr = ref.row === 0 ? info.table.rows[0] : info.table.querySelector(`tr[data-tp-row="${ref.row}"]`);
    if (!tr || tr.classList.contains("tp-hidden") && !includeHidden) return void 0;
    return tr.cells[ref.column];
  }
  focusEditor(widget) {
    widget.closest(EDITOR_SELECTOR)?.focus({ preventScroll: true });
  }
  // ---- writing markdown --------------------------------------------------
  /**
   * Re-reads the table from the page, applies `change`, then the write steps
   * (formulas, metadata), and writes the result back as one edit. `change`
   * returns undefined to abort.
   */
  async write(widget, change, options = {}) {
    const { focus, columnMap } = options;
    const info = this.infos.get(widget);
    if (!info) return "failed";
    try {
      await this.loadPages(tablesWritten(pageTablesOf(this.pageText), info.source), true);
      const text = await this.bridge.getText();
      this.pageText = text;
      const range = locateBySource(text, info.hint, info.source);
      const before = range && parseTable(range.text);
      const edited = before && change(before);
      if (!range || !before || !edited) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      const all = pageTablesOf(text);
      await this.loadPages([...all.map((t) => t.table), edited], false);
      const steps = { ...options, tables: pageTables(() => all, { from: range.from, table: edited }, this.others()) };
      const changed = this.writeSteps.reduce((table, step) => step(before, table, steps), edited);
      const format = await this.setting("autoFormat");
      const serialize = (t) => serializeTable(format ? { ...t, padded: true } : t);
      const markdown = serialize(changed);
      if (markdown === range.text) return "unchanged";
      const updates = [{ range, markdown }];
      const now2 = pageTables(() => all, { from: range.from, table: changed }, this.others());
      const affected = affectedBy(before, changed);
      const oldName = metaName(before)?.toLowerCase();
      const others = all.filter((other) => other.range.from !== range.from).map((other) => ({ ...other, referred: referredBy(other.table) }));
      for (let found = true; found; ) {
        found = false;
        for (let i = others.length - 1; i >= 0; i--) {
          const { range: otherRange, table, referred } = others[i];
          if (!isAffected(referred, affected)) continue;
          others.splice(i, 1);
          found = true;
          addAffected(affected, table);
          const followed = oldName && referred.tables.has(oldName) ? followTable(table, before, changed, options.rowMap, options.columnMap) : table;
          const recalculated = recalculate(followed, now2);
          if (recalculated !== table) updates.push({ range: otherRange, markdown: serialize(recalculated) });
        }
      }
      if (columnMap) this.views.set(info.key, remapColumns(this.viewOf(info), columnMap));
      if (focus) this.cellEditor.editAfterWrite(info.key, focus);
      this.scrollLefts.set(info.key, widget.scrollLeft);
      this.scrollTops.set(info.key, widget.scrollTop);
      let written = text;
      for (const update of [...updates].sort((a, b) => b.range.from - a.range.from)) {
        written = written.slice(0, update.range.from) + update.markdown + written.slice(update.range.to);
      }
      const edit = minimalEdit(text, written);
      const spanFrom = Math.min(...updates.map((update) => update.range.from));
      const spanTo = Math.max(...updates.map((update) => update.range.to));
      const after = [];
      for (const feature of this.features) {
        const then = await feature.beforeWrite?.(text, spanFrom, spanTo);
        if (then) after.push(then);
      }
      await this.bridge.replaceRange(edit.from, edit.to, edit.insert);
      this.pageText = written;
      for (const then of after) then(edit.from, written.length - text.length);
      return "written";
    } catch (e) {
      this.cellEditor.dropPending();
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
    this.hideFloating(true);
    const offset = at ? cellSourceOffset(range.text, at.row, at.column, at.within) : 0;
    await this.bridge.moveCursor(range.from + offset);
  }
  appendRow() {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info) return;
    void insertRowWith(this, widget, info, appendRowAt(info.pins, info.rows), this.firstVisibleColumn(widget, info));
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
    void insertColumnWith(this, widget, info, appendColumnAt(info.pins, info.columns));
  }
  // ---- floating UI: toolbar and add buttons ---------------------------------
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
    return [this.bar, this.addRow, this.addColumn].some((el) => el.contains(node)) || this.features.some((f) => f.owns?.(node));
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
  /** No cell is hovered: the grips go, and with `closeMenus` an open menu */
  endHover(closeMenus) {
    this.hoverCell = void 0;
    for (const feature of this.features) feature.hoverEnded?.(closeMenus);
  }
  hideFloating(closeMenus = false) {
    this.endHover(closeMenus);
    for (const el of [this.bar, this.addRow, this.addColumn]) el.classList.remove("tp-visible");
    this.hoverWidget = void 0;
  }
  /** The toolbar above the table and the add-row / add-column buttons */
  showTableControls(widget, info) {
    const view = this.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    const button = (item) => {
      const b = this.doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.title = item.title;
      if (item.icon) {
        b.className = "tp-bar-icon";
        b.setAttribute("aria-label", item.label);
        b.innerHTML = item.icon;
      } else b.textContent = item.label;
      if (item.attention) b.classList.add("tp-attention");
      if (item.pressed !== void 0) b.setAttribute("aria-pressed", String(item.pressed));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        item.run();
      });
      bar.append(b);
    };
    const featureButtons = this.features.flatMap((feature) => feature.toolbarButtons?.(widget, info) ?? []);
    for (const item of featureButtons.filter((b) => b.icon)) button(item);
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
    button({
      label: "Filter",
      title: "Show or hide the filter row",
      run: () => {
        const [w, i] = this.current(widget, info);
        const now2 = this.viewOf(i);
        this.setView(w, i, now2.showFilters ? { ...now2, filters: [], showFilters: false } : { ...now2, showFilters: true });
      },
      pressed: view.showFilters
    });
    for (const item of featureButtons.filter((b) => !b.icon)) button(item);
    button({
      label: "Edit markdown",
      title: "Show this table as markdown",
      run: () => void this.showMarkdown(this.current(widget, info)[1])
    });
    const rect = widget.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    const headerRect = info.table.rows[0].getBoundingClientRect();
    const viewTop = this.scrollParentOf(widget)?.getBoundingClientRect().top ?? 0;
    bar.classList.add("tp-visible");
    const above = headerRect.top - bar.offsetHeight - BAR_GAP;
    const fits = above >= viewTop + 2;
    const top = fits ? above : headerRect.top + (headerRect.height - bar.offsetHeight) / 2;
    const viewRight = this.scrollParentOf(widget)?.getBoundingClientRect().right ?? this.doc.defaultView.innerWidth;
    this.place(bar, Math.min(rect.right, viewRight) - bar.offsetWidth - (fits ? 0 : 6), top);
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
