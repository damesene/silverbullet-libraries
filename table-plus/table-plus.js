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
var PARSED_KEPT = 16;
var parsed = /* @__PURE__ */ new Map();
function parseTable(text) {
  const kept = parsed.get(text);
  if (kept) {
    parsed.delete(text);
    parsed.set(text, kept);
    return kept;
  }
  const table = parseTableText(text);
  parsed.set(text, table);
  if (parsed.size > PARSED_KEPT) parsed.delete(parsed.keys().next().value);
  return table;
}
function parseTableText(text) {
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
  const widths = lines.map((l) => shownLength(l));
  const padded3 = lines.length > 2 && widths.every((w) => w === widths[0]) && lines.some((l) => /\S {2,}\|/.test(l));
  return {
    indent: /^\s*/.exec(header)[0],
    align,
    rows,
    padded: padded3,
    delimiterSource: delimiter,
    alignSource: align,
    ...meta && last !== void 0 ? { meta, metaSource: { line: last, meta } } : {}
  };
}
var META_TAG_RE = /^<meta\b([^>]*?)\/?>$/i;
var META_ATTRIBUTE_RE = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
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
function pageTablesOf(text) {
  return findTables(text).map((range) => ({ range, table: parseTable(range.text) }));
}
function metaRow(indent, meta) {
  const attributes = Object.entries(meta).map(([name, value]) => ` ${name}="${escapeMetaValue(value)}"`).join("");
  return `${indent}| <meta${attributes}> |`;
}
function charLength(s) {
  return Array.from(s).length;
}
var HIDDEN_TAG_RE = /<meta\b[^>]*>/gi;
function shownLength(cell) {
  return charLength(cell.replace(HIDDEN_TAG_RE, ""));
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
      widths[c] = Math.max(widths[c] ?? 3, shownLength(cell));
    });
  }
  const pad2 = (cell, c) => {
    const gap = (widths[c] ?? 3) - shownLength(cell);
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
  return movedBlock(items, from, from, to);
}
function movedBlock(items, first, last, to) {
  const result = [...items];
  const block = result.splice(first, last - first + 1);
  result.splice(to, 0, ...block);
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
function reorderRows(table, order2) {
  const body = order2.map((i) => table.rows[i]).filter((r) => !!r);
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
function moveRows(table, first, last, to) {
  const end = table.rows.length - 1;
  const size = last - first + 1;
  if (first < 1 || last > end || size < 1 || to < 1 || to + size - 1 > end || first === to) return table;
  return withRows(table, movedBlock(table.rows, first, last, to));
}
function moveColumns(table, first, last, to) {
  const columns = table.align.length;
  const size = last - first + 1;
  if (first < 0 || last >= columns || size < 1 || to < 0 || to + size - 1 >= columns || first === to) return table;
  return {
    ...table,
    align: movedBlock(table.align, first, last, to),
    rows: table.rows.map((r) => withCells(r, movedBlock(padded(r.cells, columns), first, last, to)))
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
function lineAfterBlockMove(i, first, last, to) {
  const size = last - first + 1;
  if (i >= first && i <= last) return to + i - first;
  const closed = i > last ? i - size : i;
  return closed >= to ? closed + size : closed;
}
function columnAfterMove(c, from, to) {
  if (c === from) return to;
  if (from < to && c > from && c <= to) return c - 1;
  if (from > to && c >= to && c < from) return c + 1;
  return c;
}

// table-plus/src/tags.ts
var TAG_RE = /\s*<meta\b[^>]*>/gi;
var ATTRIBUTE_RE = /([\w.:-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g;
function cellTags(cell) {
  return Array.from(cell.matchAll(TAG_RE), (match) => match[0].trim());
}
function withoutTags(cell) {
  return cell.replace(TAG_RE, "").trim();
}
function attributesOf(tag) {
  return Array.from(tag.matchAll(ATTRIBUTE_RE), (match) => match[1].toLowerCase());
}
function withoutTagsWith(cell, attributes) {
  const kept = cellTags(cell).filter((tag) => !attributesOf(tag).some((name) => attributes.has(name)));
  return [withoutTags(cell), ...kept].filter((part) => part !== "").join(" ");
}
function keepTags(value, from, taken = /* @__PURE__ */ new Set()) {
  const own = new Set(cellTags(value).flatMap(attributesOf));
  const kept = cellTags(from).filter((tag) => !attributesOf(tag).some((name) => own.has(name) || taken.has(name)));
  return [value.trim(), ...kept].filter((part) => part !== "").join(" ");
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
var DEFAULT_VIEW = {};
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
function remapColumns(view, map) {
  const column = view.sort ? map(view.sort.column) : void 0;
  const result = withoutSort(view);
  return view.sort && column !== void 0 ? { ...result, sort: { column, direction: view.sort.direction } } : result;
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
function visibleRows(values, view, hidden = /* @__PURE__ */ new Set()) {
  const { top, bottom } = pinsOf(view);
  const indexes = values.map((_, i) => i).filter((i) => i >= top && i < values.length - bottom && !hidden.has(i));
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

// table-plus/src/formulas/values.ts
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

// table-plus/src/formulas/dates.ts
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
function dayNumber(date) {
  return Math.floor(date.ms / DAY);
}
function dayDate(day) {
  return formatDate({ ms: day * DAY, time: false });
}
function weekdayOf(day) {
  return ((day + 4) % 7 + 7) % 7;
}
function holidayDays(value) {
  const days = /* @__PURE__ */ new Set();
  if (value === void 0 || value === null) return days;
  for (const item of isRange(value) ? value : [value]) {
    if (item === null || typeof item === "string" && item.trim() === "") continue;
    const date = toDate(item);
    if (isError(date)) return date;
    days.add(dayNumber(date));
  }
  return days;
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

// table-plus/src/autofill/builtin/dates.ts
var DAY2 = 864e5;
var DOTTED_RE = /^(\d{1,2})\.(\s?)(\d{1,2})\.(\s?)(\d{4})$/;
var ISO = {
  read: parseDate,
  // A date past the years 0 to 9999 cannot be written: shown as the error a formula gives
  write: (date) => {
    const written = formatDate(date);
    return typeof written === "string" ? written : written.code;
  }
};
function dotted(first) {
  const m = DOTTED_RE.exec(first.trim());
  if (!m) return void 0;
  const pad2 = (n, as) => String(n).padStart(as.length, "0");
  return {
    read: (text) => {
      const d = DOTTED_RE.exec(text.trim());
      return d ? parseDate(`${d[5]}-${d[3].padStart(2, "0")}-${d[1].padStart(2, "0")}`) : void 0;
    },
    write: (date) => {
      const d = new Date(date.ms);
      return `${pad2(d.getUTCDate(), m[1])}.${m[2]}${pad2(d.getUTCMonth() + 1, m[3])}.${m[4]}${d.getUTCFullYear()}`;
    }
  };
}
function monthOf(date) {
  const d = new Date(date.ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
var dates_default = {
  name: "dates",
  match: (values) => {
    if (values.length === 0) return void 0;
    const written = dotted(values[0]) ?? ISO;
    const dates = values.map((v) => written.read(v));
    if (!dates.every((d) => d)) return void 0;
    const all = dates;
    const first = all[0];
    const text = written.write;
    if (all.length === 1) return (i) => text({ ms: first.ms + i * DAY2, time: first.time });
    const months = monthOf(all[1]) - monthOf(first);
    const byMonths = months !== 0 && all.every((d, i) => d.ms === addUnits(first, i * months, "m").ms);
    if (byMonths) return (i) => text(addUnits(first, i * months, "m"));
    const step = all[1].ms - first.ms;
    if (step === 0 || !all.every((d, i) => d.ms === first.ms + i * step)) return void 0;
    return (i) => text({ ms: first.ms + i * step, time: all.some((d) => d.time) });
  }
};

// table-plus/src/autofill/builtin/lists.ts
var LISTS = [
  { words: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], alone: true },
  { words: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], alone: true },
  { words: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], alone: true },
  { words: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], alone: true },
  { words: ["pond\u011Bl\xED", "\xFAter\xFD", "st\u0159eda", "\u010Dtvrtek", "p\xE1tek", "sobota", "ned\u011Ble"], alone: true },
  { words: ["po", "\xFAt", "st", "\u010Dt", "p\xE1", "so", "ne"], alone: false },
  { words: ["leden", "\xFAnor", "b\u0159ezen", "duben", "kv\u011Bten", "\u010Derven", "\u010Dervenec", "srpen", "z\xE1\u0159\xED", "\u0159\xEDjen", "listopad", "prosinec"], alone: true },
  { words: ["led", "\xFAno", "b\u0159e", "dub", "kv\u011B", "\u010Dvn", "\u010Dvc", "srp", "z\xE1\u0159", "\u0159\xEDj", "lis", "pro"], alone: false }
];
function key(word) {
  return plain(word.trim().toLowerCase());
}
function plain(word) {
  return word.normalize("NFD").replace(/\p{M}/gu, "");
}
function inCase(word, as) {
  if (as.length > 1 && as === as.toUpperCase() && as !== as.toLowerCase()) return word.toUpperCase();
  if (as[0] === as[0].toUpperCase() && as[0] !== as[0].toLowerCase()) return word[0].toUpperCase() + word.slice(1).toLowerCase();
  return word.toLowerCase();
}
function listSeries(name, lists) {
  return {
    name,
    match: (values) => {
      if (values.length === 0) return void 0;
      for (const { words: list, alone } of lists) {
        if (!alone && values.length < 2) continue;
        const keys = list.map(key);
        const indexes = values.map((v) => keys.indexOf(key(v)));
        if (indexes.some((i) => i < 0)) continue;
        const n = list.length;
        const step = indexes.length === 1 ? 1 : ((indexes[1] - indexes[0]) % n + n) % n;
        if (step === 0 || !indexes.every((index, i) => index === ((indexes[0] + i * step) % n + n) % n)) continue;
        const bare2 = values.every((v) => plain(v) === v) && values.some((_, i) => plain(list[indexes[i]]) !== list[indexes[i]]);
        const first = values[0].trim();
        const asListed = values.every((v, i) => v.trim() === list[indexes[i]]);
        return (i) => {
          const word = list[((indexes[0] + i * step) % n + n) % n];
          return asListed ? word : inCase(bare2 ? plain(word) : word, first);
        };
      }
      return void 0;
    }
  };
}
var lists_default = listSeries("lists", LISTS);

// table-plus/src/autofill/builtin/numbers.ts
var NUMBER_RE2 = /^([-+]?)(\d+)(?:([.,])(\d+))?$/;
var MAX_DIGITS = 15;
var numbers_default = {
  name: "numbers",
  match: (values) => {
    const parts = values.map((v) => NUMBER_RE2.exec(v.trim()));
    if (parts.length < 2 || !parts.every((m) => m)) return void 0;
    const all = parts;
    if (all.some((m) => m[2].length + (m[4]?.length ?? 0) > MAX_DIGITS)) return void 0;
    const numbers2 = all.map((m) => Number(`${m[1]}${m[2]}.${m[4] ?? "0"}`));
    const comma = all.find((m) => m[3])?.[3] === ",";
    const decimals = Math.max(...all.map((m) => m[4]?.length ?? 0));
    const width = Math.max(0, ...all.filter((m) => m[2].length > 1 && m[2].startsWith("0")).map((m) => m[2].length));
    const n = numbers2.length;
    const meanX = (n - 1) / 2;
    const meanY = numbers2.reduce((a, b) => a + b, 0) / n;
    const slope = numbers2.reduce((sum, y, x) => sum + (x - meanX) * (y - meanY), 0) / numbers2.reduce((sum, _, x) => sum + (x - meanX) ** 2, 0);
    const steps = numbers2.slice(1).map((y, x) => y - numbers2[x]);
    const even = steps.every((s) => Math.abs(s - steps[0]) < 1e-9);
    const places = even ? decimals : decimals + 2;
    return (i) => {
      const value = even ? numbers2[0] + i * steps[0] : meanY + (i - meanX) * slope;
      let text = (Math.round(value * 10 ** places) / 10 ** places).toFixed(places);
      if (!even && places > decimals) text = text.replace(/0+$/, "").replace(/\.$/, "");
      const [sign, digits] = text.startsWith("-") ? ["-", text.slice(1)] : ["", text];
      const [whole, fraction2] = digits.split(".");
      const padded3 = whole.padStart(width, "0");
      return `${sign}${padded3}${fraction2 ? `${comma ? "," : "."}${fraction2}` : ""}`;
    };
  }
};

// table-plus/src/autofill/builtin/numbered.ts
var NUMBERED_RE = /^(.*?)(\d+)(\D*)$/s;
var numbered_default = {
  name: "numbered text",
  match: (values) => {
    if (values.some((v) => NUMBER_RE2.test(v.trim()))) return void 0;
    const parts = values.map((v) => NUMBERED_RE.exec(v));
    if (parts.length === 0 || !parts.every((m) => m)) return void 0;
    const all = parts;
    const [, prefix, , suffix] = all[0];
    if (prefix.trim() === "" && suffix.trim() === "") return void 0;
    if (!all.every((m) => m[1] === prefix && m[3] === suffix)) return void 0;
    if (all.some((m) => m[2].length > 15)) return void 0;
    const numbers2 = all.map((m) => Number(m[2]));
    const step = numbers2.length === 1 ? 1 : numbers2[1] - numbers2[0];
    if (step === 0 || !numbers2.every((n, i) => n === numbers2[0] + i * step)) return void 0;
    const width = all[0][2].startsWith("0") ? all[0][2].length : 0;
    return (i) => {
      const n = numbers2[0] + i * step;
      return `${prefix}${String(Math.abs(n)).padStart(width, "0")}${suffix}`;
    };
  }
};

// table-plus/src/autofill/builtin/times.ts
var DAY3 = 86400;
var times_default = {
  name: "times",
  match: (values) => {
    const times = values.map((v) => parseClock(v)?.seconds);
    if (times.length === 0 || !times.every((t) => t !== void 0)) return void 0;
    const all = times;
    const first = all[0];
    const step = all.length === 1 ? 3600 : all[1] - first;
    if (step === 0 || !all.every((t, i) => t === first + i * step)) return void 0;
    const ofDay = all.every((t) => t >= 0 && t < DAY3);
    return (i) => {
      const seconds = first + i * step;
      return formatClock(ofDay ? (seconds % DAY3 + DAY3) % DAY3 : seconds);
    };
  }
};

// table-plus/src/autofill/builtin/index.ts
var BUILT_IN_SERIES = [dates_default, times_default, numbers_default, lists_default, numbered_default];

// table-plus/src/autofill/registry.ts
var custom = [];
var anew = false;
function allSeries() {
  const replacing = new Map(custom.map((s) => [s.name, s]));
  return [...custom.filter((s) => !BUILT_IN_SERIES.some((b) => b.name === s.name)), ...BUILT_IN_SERIES.map((s) => replacing.get(s.name) ?? s)];
}
function seriesFor(values) {
  for (const series of allSeries()) {
    const next = series.match(values);
    if (next) return { name: series.name, next };
  }
  const k = values.length;
  return { name: "repeat", next: (i) => values[(i % k + k) % k] ?? "" };
}
function defineCustomSeries(series) {
  custom = Array.from(new Map([...anew ? [] : custom, ...series].map((s) => [s.name, s])).values());
  anew = false;
}
function customSeriesAnew() {
  anew = true;
}

// table-plus/src/autofill/fill.ts
function cellValue(cell) {
  return unescapeCell(withoutTags(cell)).trim();
}
function fillLine(table, line, cells) {
  const raw = (cell) => table.rows[cell.row]?.cells[cell.column] ?? "";
  const { sources, targets, backward } = line;
  const k = sources.length;
  if (k === 0) return targets.map(() => "");
  const sourceOf = (j) => backward ? sources[k - 1 - j % k] : sources[j % k];
  if (sources.some((s) => cells.claim(raw(s), s, s) !== void 0)) {
    return targets.map((target, j) => {
      const source = sourceOf(j);
      const copy = cells.claim(raw(source), source, target) ?? escapeCell(cellValue(raw(source)));
      return cells.keepTags(copy, raw(target));
    });
  }
  const { next } = seriesFor(sources.map((s) => cellValue(raw(s))));
  return targets.map((target, j) => cells.keepTags(escapeCell(next(backward ? -1 - j : k + j)), raw(target)));
}
function filled(table, lines, cells) {
  let result = table;
  for (const line of lines) {
    fillLine(table, line, cells).forEach((cell, j) => {
      const target = line.targets[j];
      result = setCell(result, target.row, target.column, cell);
    });
  }
  return result;
}

// table-plus/src/autofill/custom.ts
var HELPERS = {
  parseDate,
  // A date as formulas write it, or the error code of one past the years 0 to 9999
  formatDate: (date) => {
    const written = formatDate(date);
    return typeof written === "string" ? written : written.code;
  }
};
var NAME_RE = /^[a-z][a-z0-9_ ]*$/i;
function customSeries(definitions) {
  let list = definitions;
  if (isObject(list) && !Array.isArray(list) && "default" in list) list = list.default;
  if (typeof list === "function") {
    try {
      list = list(HELPERS);
    } catch (e) {
      return { series: [], problems: [`the definitions failed: ${message(e)}`] };
    }
  }
  if (!Array.isArray(list)) return { series: [], problems: ["the definitions are not a list of series (or a function returning one)"] };
  const series = [];
  const problems = [];
  list.forEach((definition, i) => {
    const one = customOne(definition);
    if (typeof one === "string") problems.push(`series ${i + 1}: ${one}`);
    else series.push(one);
  });
  return { series, problems };
}
function customOne(definition) {
  if (!isObject(definition)) return "not an object";
  const { name, words, alone, match } = definition;
  if (typeof name !== "string" || !NAME_RE.test(name)) return `its name ${JSON.stringify(name)} is not letters, digits, _ and spaces starting with a letter`;
  const lower = name.toLowerCase();
  if (words === void 0 === (match === void 0)) return `${name}: it has words (a list to go round) or match (a series), one of them`;
  if (words !== void 0) {
    if (!Array.isArray(words) || words.length < 2 || !words.every((w) => typeof w === "string" && w.trim() !== "")) return `${name}: its words are not a list of two or more texts`;
    const keys = words.map(key);
    if (new Set(keys).size < keys.length) return `${name}: a word is in its words twice (case and diacritics aside)`;
    if (alone !== void 0 && typeof alone !== "boolean") return `${name}: alone is not true or false`;
    return listSeries(lower, [{ words: words.map((w) => w.trim()), alone: alone ?? true }]);
  }
  if (typeof match !== "function") return `${name}: match is not a function`;
  return { name: lower, match: (values) => checkedGenerator(name, values, match) };
}
function checkedGenerator(name, values, match) {
  let next;
  try {
    next = match(values);
  } catch (e) {
    warn(`the series ${name} failed: ${message(e)}`);
    return void 0;
  }
  if (next === void 0 || next === null) return void 0;
  if (typeof next !== "function") {
    warn(`the series ${name}: match gave ${kindOf(next)}, not a function of the index (or nothing)`);
    return void 0;
  }
  const k = values.length;
  return (i) => {
    let text;
    try {
      text = next(i);
      if (typeof text === "number" && Number.isFinite(text)) return String(text);
      if (typeof text === "string") return text;
      throw new Error(`it gave ${kindOf(text)}: a text or a number`);
    } catch (e) {
      warn(`the series ${name}: ${message(e)}`);
      return values[(i % k + k) % k] ?? "";
    }
  };
}
var warned = /* @__PURE__ */ new Set();
function warn(text) {
  if (warned.has(text)) return;
  warned.add(text);
  console.warn(`Table Plus: ${text}`);
}
function kindOf(value) {
  if (isObject(value) && typeof value.then === "function") return "a promise";
  return value === null ? "null" : Array.isArray(value) ? "a list" : typeof value === "object" ? "an object" : `a ${typeof value}`;
}
function isObject(value) {
  return typeof value === "object" && value !== null;
}
function message(e) {
  return e instanceof Error ? e.message : String(e);
}

// table-plus/src/themes.ts
var BUILT_IN_THEMES = ["native", "playground", "minimal", "slate", "grid", "ocean", "paper", "contrast", "compact", "bold", "soft", "ledger"];
var NATIVE_THEME = "native";
var THEME_NAME_RE = /^[\w-]+$/;
var THEME_SELECTOR_RE = /data-tp-theme\s*=\s*["']?([\w-]+)["']?\s*\]/g;
function themeName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return THEME_NAME_RE.test(name) ? name : void 0;
}
function themeLabel(name) {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function themesInStyles(doc) {
  const found = /* @__PURE__ */ new Set();
  const visit = (rules) => {
    for (const rule of Array.from(rules)) {
      if ("selectorText" in rule && typeof rule.selectorText === "string") {
        for (const match of rule.selectorText.matchAll(THEME_SELECTOR_RE)) found.add(match[1]);
      }
      if ("cssRules" in rule && rule.cssRules) visit(rule.cssRules);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
    }
  }
  return [...found];
}
var STRIPES = ["none", "rows", "columns"];
function stripesName(value) {
  return STRIPES.find((s) => s === value);
}
function stripesLabel(stripes) {
  return themeLabel(stripes);
}
function allThemes(doc) {
  return [.../* @__PURE__ */ new Set([...BUILT_IN_THEMES, ...themesInStyles(doc)])];
}

// table-plus/src/bridge.ts
var pixels = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : void 0;
};
var FEATURE_NAMES = [
  "formulas",
  "names",
  "pageLinks",
  "filters",
  "columnTypes",
  "selection",
  "autofill",
  "lazy",
  "themes",
  "export",
  "excel",
  "paste",
  "handles",
  "widths",
  "longText",
  "sticky",
  "autoscroll",
  "largeTables",
  "fullScreen"
];
var MODULES_OFF_BY_DEFAULT = /* @__PURE__ */ new Set(["largeTables"]);
function moduleOnByDefault(name) {
  return !MODULES_OFF_BY_DEFAULT.has(name);
}
var MODULE_LABELS = {
  formulas: "Formulas",
  names: "Names",
  pageLinks: "Links to other pages",
  filters: "Filters",
  columnTypes: "Column types",
  selection: "Cell selection",
  autofill: "AutoFill",
  lazy: "Lazy saving",
  themes: "Themes",
  export: "Export",
  excel: "Excel",
  paste: "Copy, cut and paste",
  handles: "Row and column handles",
  widths: "Column widths",
  longText: "Long text in cells",
  sticky: "Sticky header",
  autoscroll: "Middle-button scrolling",
  largeTables: "Large tables",
  fullScreen: "Full screen"
};
var MODULE_DESCRIPTIONS = {
  formulas: "Formulas in cells (=SUM(B1:B3)), recalculated on every edit",
  names: "Name tables, columns, rows and cells, to refer to them in formulas",
  pageLinks: "Formulas can refer to tables and named cells on other pages",
  filters: "Show only the rows whose cells match what you type under a header",
  columnTypes: "A header's hashtag formats its column (#currency, #stars\u2026)",
  selection: "A click selects a cell, as in a spreadsheet; drag or Shift to select more, to copy, paste over or empty them",
  autofill: "A square at the corner of the cells selected: drag it to fill the cells after them (1, 2 \u2192 3, 4; Mon \u2192 Tue; formulas with their references moved), double-click it to fill down",
  lazy: "An icon in a table's toolbar switches it to saving its cells edited together, a moment after editing stops: quicker typing in large tables",
  themes: "How tables look (header, lines, stripes, spacing): a theme for every table, another one for a table from its \u22EF menu",
  export: "Copy as CSV in a table's \u22EF menu",
  excel: "Export to Excel\u2026 in a table's \u22EF menu: copy for Excel (numbers and dates as Excel's), or download an .xlsx file with the formulas",
  paste: "Copy, Cut and Paste in the cell menu; Ctrl+X cuts cells (they move where they are pasted); Ctrl+V pastes cells copied from a spreadsheet over the table, Ctrl+Shift+V as new rows",
  handles: "Handles beside rows and above columns: drag to move them, click for their menu",
  widths: "Drag the right edge of a header to set its column's width",
  longText: "Text wider than a maximum column width wraps or is cut, the expand button shows it whole",
  sticky: "A table's header stays in view while the page scrolls past it",
  autoscroll: "The middle mouse button over a table scrolls it in the direction the pointer moves",
  largeTables: "Tables with many rows scroll in a box of their own (Maximum table height, else the window's height), and only the rows in view are in the page: editing stays quick",
  fullScreen: "An icon in the table's toolbar shows the table over the whole window; the same icon or Esc closes it"
};
var SETTINGS = {
  enterKey: {
    path: "tablePlus.editor.enterKey",
    label: "Enter in a cell editor",
    hint: "What Enter does while a cell is edited",
    default: "moveDown",
    choices: ["save", "moveDown"],
    choiceLabels: ["Save", "Save, edit the cell below"],
    parse: (v) => v === "save" || v === "moveDown" ? v : void 0
  },
  smartFilters: {
    path: "tablePlus.modules.filters.smart",
    label: "Smart filters",
    hint: "Filters understand >10, /pattern/, =text, a|b and !text; off, what is typed is text to find",
    default: true,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Store table settings (sorting, filters, pins, names) in the table's metadata row
  metadata: {
    path: "tablePlus.metadata",
    label: "Store table metadata",
    hint: "Tables keep their sorting, filters, column widths, pins, names and formulas in a hidden last row; pinning and new formulas need it. Off, sorting and filters are only a view",
    default: false,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // A click, Enter, Tab and Ctrl+arrows open a cell with its text selected (Shift+Enter does not); off: the reverse
  selectOnClick: {
    path: "tablePlus.editor.selectOnClick",
    label: "Click selects the cell's text",
    hint: "A cell opened for editing (a click, Enter, Tab, Ctrl+arrows) has its whole text selected; off, the cursor is at its end",
    default: false,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Ctrl+Enter in a cell editor adds a row below; off: it is a plain Enter
  ctrlEnterAddsRow: {
    path: "tablePlus.editor.ctrlEnterAddsRow",
    label: "Ctrl+Enter adds a row",
    hint: "While a cell is edited, Ctrl+Enter saves it, adds an empty row below and edits it; off, it works like Enter",
    default: true,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Write edited tables with aligned pipes; off: keep each table's own style
  autoFormat: {
    path: "tablePlus.autoFormat",
    label: "Format tables",
    hint: "A table edited with Table Plus is written with its columns aligned; off, each table keeps its own style",
    default: true,
    parse: (v) => typeof v === "boolean" ? v : void 0
  },
  // Milliseconds `${…}` cells wait after `page:index` for the indexers to write the index
  expressionsDelay: {
    path: "tablePlus.expressions.refreshDelay",
    label: "Delay before refreshing (ms)",
    hint: "After an edit, cells with ${\u2026} (a query, a sum) are evaluated again once SilverBullet has indexed the page: how long to wait for that; raise it if they still show old values",
    default: 500,
    parse: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0
  },
  // How long after editing stops a table in lazy saving writes its cells (the lazy module)
  lazyDelay: {
    path: "tablePlus.modules.lazy.delay",
    label: "Saves after (ms)",
    hint: "In lazy saving, the cells edited are saved this long after no cell is being edited",
    default: 500,
    parse: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0
  },
  // The tables' theme (the themes module); a table's metadata may choose another
  theme: {
    path: "tablePlus.modules.themes.theme",
    label: "Theme",
    hint: "How tables look: their header, lines, stripes and spacing. Native leaves them as SilverBullet shows them; a table's \u22EF menu can choose another theme for it",
    default: NATIVE_THEME,
    choices: BUILT_IN_THEMES,
    choiceLabels: BUILT_IN_THEMES.map(themeLabel),
    moreChoices: themesInStyles,
    moreLabel: themeLabel,
    parse: themeName
  },
  // Every other row or column tinted, in the theme's color (the themes module); a table's metadata may say otherwise
  stripes: {
    path: "tablePlus.modules.themes.stripes",
    label: "Stripes",
    hint: "Every other row (or column) is tinted, in the theme's color; the icons in Theme in a table's \u22EF menu can choose otherwise for that table",
    default: "rows",
    choices: STRIPES,
    choiceLabels: STRIPES.map(stripesLabel),
    parse: stripesName
  },
  // Pixels; 0: no limit
  maxHeight: {
    path: "tablePlus.maxHeight",
    label: "Maximum table height (px)",
    hint: "A taller table gets its own scrollbar; 0: no limit",
    default: 0,
    parse: pixels
  },
  // Text longer than a cell's maximum width: wrapped onto more lines, or cut with an ellipsis (…)
  cellOverflow: {
    path: "tablePlus.modules.longText.overflow",
    label: "Text that does not fit",
    hint: "What text wider than the maximum column width does",
    default: "wrap",
    choices: ["wrap", "ellipsis"],
    choiceLabels: ["Wrap", "Cut with an ellipsis (\u2026)"],
    parse: (v) => v === "wrap" || v === "ellipsis" ? v : void 0
  },
  // A column's maximum width in pixels; 0: no limit
  cellMaxWidth: {
    path: "tablePlus.modules.longText.maxWidth",
    label: "Maximum column width (px)",
    hint: "Text wider than this wraps or is cut, as set above; 0: no limit",
    default: 500,
    parse: pixels
  },
  // From how many rows a table is a large one (the largeTables module)
  largeTablesMinRows: {
    path: "tablePlus.modules.largeTables.minRows",
    label: "Applies from (rows)",
    hint: "A table with at least this many rows gets its own box, and only the rows in view are kept in the page",
    default: 200,
    parse: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : void 0
  },
  // A wrapped cell's maximum height in pixels, the rest cut; 0: no limit
  cellMaxHeight: {
    path: "tablePlus.modules.longText.maxHeight",
    label: "Maximum cell height (px)",
    hint: "Wrapped text grows a cell up to this height, the rest is cut (the expand button shows it whole); 0: no limit",
    default: 200,
    parse: pixels
  }
};
function settingChoices(key2, doc, current) {
  const setting = SETTINGS[key2];
  if (!setting.choices) return [];
  const options = setting.choices.map((value, i) => ({ value, label: setting.choiceLabels?.[i] ?? value }));
  const more = (value) => ({ value, label: setting.moreLabel?.(value) ?? value });
  for (const value of setting.moreChoices?.(doc) ?? []) if (!options.some((o) => o.value === value)) options.push(more(value));
  if (typeof current === "string" && current !== "" && !options.some((o) => o.value === current)) options.push(more(current));
  return options;
}
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
var SCROLLER_SELECTOR = ".cm-scroller";
var NATIVE_ACTION_SELECTOR = "a[data-ref], [data-mention-name], button[data-onclick], span.sb-task-state";
var INTERACTIVE_SELECTOR = "a, button, input, select, textarea, label";
var UI_CLASS = "tp-ui";
var OUT_OF_LINE_CLASS = "tp-out-of-line";
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
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node instanceof Element && (node.classList.contains(UI_CLASS) || node.classList.contains(TYPE_TAG_CLASS))) continue;
      if (node.nodeType === 3) text += node.textContent ?? "";
      else walk(node);
    }
  };
  walk(cell);
  return text.replace(/\s+/g, " ").trim();
}
var HEAD_CLASS = "tp-head";
var HEAD_NAME_CLASS = "tp-head-name";
function layOutHeaderCell(cell) {
  if (cell.querySelector(`:scope > .${HEAD_CLASS}`)) return;
  const doc = cell.ownerDocument;
  const head = doc.createElement("span");
  head.className = HEAD_CLASS;
  const name = doc.createElement("span");
  name.className = HEAD_NAME_CLASS;
  head.append(name);
  for (const node of Array.from(cell.childNodes)) {
    const ui = node instanceof Element && node.classList.contains(UI_CLASS);
    if (ui && node.classList.contains(OUT_OF_LINE_CLASS)) continue;
    (ui ? head : name).append(node);
  }
  cell.prepend(head);
}
function cellValue2(cell) {
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

// table-plus/src/icons.ts
var svg = (body, fill = false) => `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;
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
  columnWidth: svg('<path d="M4 4v16M20 4v16M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3"/>'),
  expand: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  fullScreen: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  exitFullScreen: svg('<path d="M9 4v5H4M15 4v5h5M15 20v-5h5M9 20v-5H4"/>'),
  rowAbove: svg('<rect x="3" y="13" width="18" height="7" rx="1"/><path d="M12 3v7M8.5 6.5h7"/>'),
  rowBelow: svg('<rect x="3" y="4" width="18" height="7" rx="1"/><path d="M12 14v7M8.5 17.5h7"/>'),
  columnLeft: svg('<rect x="13" y="3" width="7" height="18" rx="1"/><path d="M3 12h7M6.5 8.5v7"/>'),
  columnRight: svg('<rect x="4" y="3" width="7" height="18" rx="1"/><path d="M14 12h7M17.5 8.5v7"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  // Two sheets: copied to the clipboard
  copy: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  // A row and its copy under it
  duplicate: svg('<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1" stroke-dasharray="2 2"/>'),
  // No stripes: an empty table, struck through (rows and columns: its tinted lines)
  stripesNone: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M5 18L19 6"/>'),
  stripesRows: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 14.5h18"/><path d="M4 10h16v4H4z" fill="currentColor" stroke="none" opacity="0.4"/>'),
  stripesColumns: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/><path d="M9.5 5h5v14h-5z" fill="currentColor" stroke="none" opacity="0.4"/>'),
  theme: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.8l-.3-.8a1.7 1.7 0 0 1 1.6-2.4H17a4 4 0 0 0 4-4c0-4.9-4-9-9-9z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  lazy: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  editMode: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  selectRows: svg('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 15h18" stroke-dasharray="2 2"/><path d="M12 9v6"/>'),
  selectColumns: svg('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 3v18M15 3v18" stroke-dasharray="2 2"/><path d="M9 12h6"/>'),
  arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  // AutoFill: a cell, its fill handle, and the way it fills
  autofill: svg('<rect x="3" y="3" width="11" height="9" rx="1"/><rect x="12" y="10" width="4" height="4" fill="currentColor"/><path d="M14 16v5M11.5 18.5l2.5 2.5 2.5-2.5"/>'),
  arrowLeft: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  arrowRight: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  sortAsc: svg('<path d="M7 18V6M3 10l4-4 4 4M14 7h7M14 12h5M14 17h3"/>'),
  sortDesc: svg('<path d="M7 6v12M3 14l4 4 4-4M14 7h3M14 12h5M14 17h7"/>'),
  clear: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  // Arrows four ways: cells moved
  moveCells: svg('<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  // Scissors
  cut: svg('<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.2 16 18 4M15.8 16 6 4"/>'),
  // A clipboard
  paste: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>'),
  // The clipboard and a +: pasted as new rows
  pasteRows: svg('<rect x="3" y="4" width="13" height="17" rx="2"/><path d="M7 4V3h5v1M7 11h5M7 15h3M19.5 14v7M16 17.5h7"/>'),
  // Sorted lines with a check: make the sorting the real order
  applySort: svg('<path d="M4 6h9M4 12h7M4 18h5M14 15l3 3 5-6"/>'),
  // Two arrows round: calculate again
  // fx: a formula's function (the Functions dialog)
  function: svg('<path d="M8 20c2 0 2.6-1.4 3-3.5l2-10C13.4 4.4 14 3 16 3M8 9h7M14 13l6 7M20 13l-6 7"/>'),
  recalculate: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>'),
  filter: svg('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  markdown: svg('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>'),
  // A padlock: a name that stays
  fixedName: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  columnType: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
  format: svg('<path d="M4 6h16M4 12h16M4 18h16M9 4v16M15 4v16"/>'),
  alignLeft: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  alignCenter: svg('<path d="M4 6h16M7 12h10M5.5 18h13"/>'),
  alignRight: svg('<path d="M4 6h16M10 12h10M7 18h13"/>'),
  // A pushpin with its needle pointing to the edge it pins to
  pinTop: PIN_POINT_UP,
  unpin: svg('<path d="M12 3v6M8.5 9h7l-1.5 4v4h-4v-4z"/><path d="M4 4l16 16"/>'),
  pinBottom: PIN_POINT_DOWN,
  pinLeft: PIN_POINT_LEFT,
  pinRight: PIN_POINT_RIGHT
};

// table-plus/src/core/dialog.ts
var Dialogs = class {
  constructor(doc) {
    this.doc = doc;
  }
  doc;
  shown;
  get isOpen() {
    return !!this.shown?.backdrop.isConnected;
  }
  /** Whether a node is the open dialog's */
  contains(node) {
    return !!this.shown?.backdrop.contains(node);
  }
  open(options) {
    this.close();
    const { doc } = this;
    const el = (tag, className, text) => {
      const e = doc.createElement(tag);
      e.className = className;
      if (text !== void 0) e.textContent = text;
      return e;
    };
    const backdrop = el("div", `${UI_CLASS} tp-dialog-backdrop`);
    const dialog = el("div", `tp-dialog${options.className ? ` ${options.className}` : ""}`);
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", options.title);
    dialog.tabIndex = -1;
    const head = el("div", "tp-dialog-head");
    const titles = el("div", "tp-dialog-titles");
    titles.append(el("h2", "tp-dialog-title", options.title));
    if (options.subtitle) titles.append(el("p", "tp-dialog-subtitle", options.subtitle));
    const close = el("button", "tp-dialog-close");
    close.type = "button";
    close.title = "Close (Esc)";
    close.setAttribute("aria-label", close.title);
    close.innerHTML = ICONS.clear;
    close.addEventListener("click", () => this.close());
    head.append(titles, close);
    const body = el("div", "tp-dialog-body");
    body.append(options.content);
    dialog.append(head, body);
    if (options.footer) {
      const foot = el("div", "tp-dialog-foot");
      foot.append(options.footer);
      dialog.append(foot);
    }
    backdrop.append(dialog);
    backdrop.addEventListener("keydown", (e) => this.onKeyDown(e, dialog));
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        this.close();
      }
    });
    this.shown = { backdrop, returnFocus: doc.activeElement, ...options.closed ? { closed: options.closed } : {} };
    doc.body.append(backdrop);
    (options.focus ?? dialog).focus({ preventScroll: true });
    return { element: dialog, close: () => this.close() };
  }
  close() {
    const shown = this.shown;
    if (!shown) return;
    this.shown = void 0;
    shown.backdrop.remove();
    if (shown.returnFocus instanceof HTMLElement && shown.returnFocus.isConnected) shown.returnFocus.focus({ preventScroll: true });
    shown.closed?.();
  }
  // Esc closes; Tab stays in the dialog; no key goes on to the page
  onKeyDown(e, dialog) {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll("button, input, select, [tabindex='0']")).filter(
      (f) => !f.disabled && f.offsetParent !== null
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.doc.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
};

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

// table-plus/src/core/layout.ts
var STICKY_GAP = 42;

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
function pasteCells(table, plan, data, rules) {
  let result = table;
  for (let k = 0; k < plan.newColumns.count; k++) result = insertColumn(result, plan.newColumns.at + k);
  for (let k = 0; k < plan.newRows.count; k++) result = insertRow(result, plan.newRows.at + k);
  const skipped = /* @__PURE__ */ new Map();
  data.forEach((values, i) => {
    const row = plan.rows[i];
    values.forEach((value, j) => {
      const column = plan.columns[j];
      const current = result.rows[row]?.cells[column] ?? "";
      const cell = escapeCell(value);
      const kept = rules.keptBy(current);
      if (kept) {
        if (cell !== "") skipped.set(kept, (skipped.get(kept) ?? 0) + 1);
        return;
      }
      if (row === 0 && cell === "") return;
      const named2 = row === 0 && rules.headerRenamed ? rules.headerRenamed(cell, current) : cell;
      result = setCell(result, row, column, rules.keepTags(named2, current));
    });
  });
  return { table: result, skipped };
}
function moveCells(table, sources, plan, rules) {
  const moved2 = sources.map((row) => row.map((ref) => table.rows[ref.row]?.cells[ref.column] ?? ""));
  let result = table;
  for (const row of sources) for (const ref of row) if (ref.row > 0) result = setCell(result, ref.row, ref.column, rules.emptied(result.rows[ref.row]?.cells[ref.column] ?? ""));
  for (let k = 0; k < plan.newColumns.count; k++) result = insertColumn(result, plan.newColumns.at + k);
  for (let k = 0; k < plan.newRows.count; k++) result = insertRow(result, plan.newRows.at + k);
  moved2.forEach((cells, i) => {
    cells.forEach((cell, j) => {
      const row = plan.rows[i];
      const column = plan.columns[j];
      result = setCell(result, row, column, rules.placed(cell, result.rows[row]?.cells[column] ?? ""));
    });
  });
  return result;
}

// table-plus/src/core/structure.ts
function cellMoveRules(host) {
  const unmanaged = (cell) => new Set(cellTags(host.keepTags("", cell)));
  return {
    emptied: (cell) => host.keepTags("", cell),
    placed: (moved2, over) => {
      const stay = unmanaged(moved2);
      const content = [withoutTags(moved2), ...cellTags(moved2).filter((tag) => !stay.has(tag))].filter((part) => part !== "").join(" ");
      return host.keepTags(content, over);
    }
  };
}
function moveCellsTo(host, widget, info, cells, to, copy) {
  const rows = cells.map((_, i) => to.row + i);
  const columns = (cells[0] ?? []).map((_, j) => to.column + j);
  if (to.row < 1 || rows[rows.length - 1] >= info.rows || columns[columns.length - 1] >= info.columns) return Promise.resolve("unchanged");
  const plan = { rows, columns, newRows: { at: 0, count: 0 }, newColumns: { at: 0, count: 0 }, pins: info.pins };
  if (!copy) return host.write(widget, (t) => moveCells(t, cells, plan, cellMoveRules(host)));
  return host.write(widget, (t) => {
    const raw = cells.map((row) => row.map((ref) => t.rows[ref.row]?.cells[ref.column] ?? ""));
    let result = t;
    cells.forEach(
      (row, i) => row.forEach((from, j) => {
        const dest = { row: rows[i], column: columns[j] };
        const cell = raw[i][j];
        const value = host.fillCell(info, cell, from, dest) ?? withoutTags(cell);
        result = setCell(result, dest.row, dest.column, host.keepTags(value, result.rows[dest.row]?.cells[dest.column] ?? ""));
      })
    );
    return result;
  });
}
var MOVE_BLOCKED = "Clear sorting and filters to move rows";
function rowAfterInsert(at) {
  return (r) => r >= at ? r + 1 : r;
}
function insertRowWith(host, widget, info, at, column, prepare = (t) => t, beside = {}) {
  const insert = insertRowAt(info.pins, info.rows, at);
  const rowMap = rowAfterInsert(insert.at);
  const hold = {
    ...beside.after !== void 0 ? { after: rowMap(beside.after) } : {},
    ...beside.before !== void 0 ? { before: rowMap(beside.before) } : {}
  };
  return host.write(
    widget,
    (t) => {
      const prepared = prepare(t);
      return prepared && insertRow(prepared, insert.at);
    },
    { focus: { row: insert.at, column }, pins: insert.pins, rowMap, hold }
  );
}
function duplicateRowAt(host, widget, info, row) {
  const insert = insertRowAt(info.pins, info.rows, row + 1);
  return host.write(
    widget,
    (t) => {
      const unique = host.uniqueTags();
      const cells = t.rows[row]?.cells.map((cell) => {
        const copy = withoutTagsWith(cell, unique);
        return copy === cell.trim() ? cell : copy;
      });
      return cells ? insertRow(t, insert.at, cells) : void 0;
    },
    { pins: insert.pins, rowMap: rowAfterInsert(insert.at) }
  );
}
function deleteRowsAt(host, widget, info, rows) {
  const doomed = [...new Set(rows.filter((r) => r > 0))].sort((a, b) => b - a);
  if (doomed.length === 0) return Promise.resolve("unchanged");
  let pins = info.pins;
  doomed.forEach((row, i) => pins = deleteRowPins(pins, info.rows - i, row));
  return host.write(widget, (t) => doomed.reduce((table, row) => deleteRow(table, row), t), {
    pins,
    rowMap: (r) => doomed.includes(r) ? void 0 : r - doomed.filter((d) => d < r).length
  });
}
function blockTo(clamp, first, last, asked) {
  const min = clamp(first, -Infinity);
  const max = clamp(last, Infinity);
  if (clamp(first, Infinity) !== max) return first;
  return Math.max(min, Math.min(asked, max - (last - first)));
}
function rowBlockTo(info, first, last, asked) {
  return blockTo((from, at) => clampRowMove(info.pins, info.rows, from, at), first, last, asked);
}
function columnBlockTo(info, first, last, asked) {
  return blockTo((from, at) => clampColumnMove(info.pins, info.columns, from, at), first, last, asked);
}
function moveRowsTo(host, widget, info, first, last, asked) {
  const to = rowBlockTo(info, first, last, asked);
  if (to === first) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveRows(t, first, last, to), { rowMap: (r) => lineAfterBlockMove(r, first, last, to) });
}
function moveColumnsTo(host, widget, info, first, last, asked) {
  const to = columnBlockTo(info, first, last, asked);
  if (to === first) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveColumns(t, first, last, to), { columnMap: (c) => lineAfterBlockMove(c, first, last, to) });
}
function insertColumnWith(host, widget, info, at) {
  const insert = insertColumnAt(info.pins, info.columns, at);
  return host.write(widget, (t) => insertColumn(t, insert.at), {
    focus: { row: 0, column: insert.at, select: true },
    columnMap: (c) => c >= insert.at ? c + 1 : c,
    pins: insert.pins
  });
}
async function deleteColumnsAt(host, widget, info, columns) {
  const doomed = [...new Set(columns)].sort((a, b) => b - a);
  if (doomed.length === 0) return "unchanged";
  if (doomed.length >= info.columns) {
    void host.bridge.flash("Table Plus: a table keeps at least one column", "info");
    return "unchanged";
  }
  const lost = [...doomed].reverse().flatMap((column) => host.columnDeleteWarnings(info, column));
  if (lost.length) {
    const what = doomed.length === 1 ? "this column" : "these columns";
    const question = `Deleting ${what} also removes ${lost.join(", and ")}. Delete ${doomed.length === 1 ? "the column" : `the ${doomed.length} columns`}? Ctrl+Z brings it back.`;
    if (!await host.ask(question)) return "unchanged";
  }
  let pins = info.pins;
  doomed.forEach((column, i) => pins = deleteColumnPins(pins, info.columns - i, column));
  return host.write(widget, (t) => doomed.reduce((table, column) => deleteColumn(table, column), t), {
    columnMap: (c) => doomed.includes(c) ? void 0 : c - doomed.filter((d) => d < c).length,
    pins
  });
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
var POPUP_MIN_WIDTH = 420;
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
  // The selectOnClick setting: a plain click, Enter, Tab and Ctrl+arrows select the cell's text
  selectOnClick = false;
  get active() {
    return this.editor;
  }
  /** After a write: edit `focus` in the table with `key` once it is rendered again */
  editAfterWrite(key2, focus) {
    this.pending = { key: key2, ...focus, until: Date.now() + 3e3 };
  }
  /** No cell waits to be edited (a write failed, or editing was cancelled) */
  dropPending() {
    this.pending = void 0;
  }
  open(widget, info, cell, select = this.selectOnClick, replace = false, popup) {
    const ref = this.host.cellRef(info, cell);
    if (!ref || this.editor) return;
    if (ref.row > 0) this.host.rowNeeded(info, cell.parentElement);
    this.context.holdRow(widget, info, ref.row);
    const original = this.host.tableOf(info).rows[ref.row]?.cells[ref.column] ?? "";
    const bare2 = withoutTags(original);
    const initial = popup?.initial ?? this.context.features.reduce((text, f) => text ?? f.editorText?.(info, ref, original), void 0) ?? unescapeCell(bare2);
    const cellStyle = cell.getAttribute("style");
    const kept = this.host.doc.createDocumentFragment();
    let field;
    let panel;
    if (popup) {
      const area = this.host.doc.createElement("textarea");
      area.className = `${UI_CLASS} tp-cell-editor tp-cell-popup-field`;
      area.rows = 1;
      area.spellcheck = true;
      panel = this.host.floating("div", "tp-cell-popup tp-visible");
      const font = this.host.doc.defaultView.getComputedStyle(cell);
      Object.assign(panel.style, { fontFamily: font.fontFamily, fontSize: font.fontSize, fontWeight: font.fontWeight, lineHeight: font.lineHeight });
      panel.append(area);
      field = area;
    } else {
      const rect = cell.getBoundingClientRect();
      if (rect.width > 0) {
        cell.style.boxSizing = "border-box";
        cell.style.width = `${rect.width}px`;
        cell.style.minWidth = `${rect.width}px`;
        cell.style.maxWidth = `${rect.width}px`;
        cell.style.height = `${rect.height}px`;
      }
      const input = this.host.doc.createElement("input");
      input.type = "text";
      input.className = `${UI_CLASS} tp-cell-editor`;
      input.size = 1;
      input.spellcheck = true;
      for (const node of Array.from(cell.childNodes)) {
        if (!(node instanceof Element && node.classList.contains(OUT_OF_LINE_CLASS))) kept.append(node);
      }
      cell.append(input);
      field = input;
    }
    field.value = popup?.value ?? initial;
    cell.classList.add("tp-editing");
    this.editor = { widget, cell, ...ref, original, initial, field, kept, cellStyle, popup: !!popup, ...panel ? { panel } : {} };
    if (replace) field.value = "";
    this.reveal(widget, cell);
    if (panel) {
      this.placePopup();
      field.addEventListener("input", () => this.placePopup());
    }
    this.context.endHover();
    this.context.isolate(field);
    field.addEventListener("blur", () => {
      if (this.editor?.field === field && !this.context.movingRows() && !this.context.dialogOpen()) void this.finish(true, void 0, false);
    });
    field.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      const editing = this.editor;
      if (editing?.field === field && this.context.features.some((f) => f.editorKeyDown?.(e, editing))) {
        e.preventDefault();
        return;
      }
      const inText = editing?.popup === true;
      if (e.key === "Control" && !inText) this.setNavigating(true);
      const ctrl = e.ctrlKey && !e.metaKey;
      if (ctrl && e.altKey && !e.shiftKey && MOVE_KEYS.has(e.key)) {
        if (inText) return;
        e.preventDefault();
        void this.moveWithKeyboard(e.key);
      } else if (ctrl && !e.altKey && NAVIGATION_KEYS.has(e.key)) {
        if (inText) return;
        e.preventDefault();
        void this.navigate(e.key, e.shiftKey);
      } else if (e.key === "Escape") {
        e.preventDefault();
        void this.cancel();
      } else if (e.key === "Enter" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !inText) {
        e.preventDefault();
        void this.ctrlEnter();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.enter(e.shiftKey);
      } else if (e.key === "Tab") {
        e.preventDefault();
        void this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === "F2" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && !this.editor?.popup) {
        e.preventDefault();
        this.toPopup();
      }
    });
    this.context.editingStarted();
    field.focus({ preventScroll: true });
    if (popup?.selection) field.setSelectionRange(popup.selection[0], popup.selection[1]);
    else if (select) field.select();
    else field.setSelectionRange(field.value.length, field.value.length);
    const opened = this.editor;
    for (const feature of this.context.features) feature.editorOpened?.(opened);
  }
  /** Whether a node is the editor's (its popup) */
  owns(node) {
    return !!this.editor?.panel?.contains(node);
  }
  /**
   * F2 (or the expand button): the cell edited in its editor in the cell goes
   * on in its popup, with what was typed and where the cursor was; nothing is
   * saved meanwhile
   */
  toPopup() {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info || active.popup) return;
    const { field, widget, cell, initial } = active;
    const value = field.value;
    const selection = [field.selectionStart ?? value.length, field.selectionEnd ?? value.length];
    this.close(true);
    this.open(widget, info, cell, false, false, { value, initial, selection });
  }
  /**
   * The popup over its cell: left-aligned with it, as wide as the cell (at
   * least POPUP_MIN_WIDTH, at most what the view has), its field as tall as
   * its text (the CSS caps it, then it scrolls)
   */
  placePopup() {
    const active = this.editor;
    const panel = active?.panel;
    if (!active || !panel || !active.cell.isConnected) return;
    const rect = active.cell.getBoundingClientRect();
    const view = this.host.viewBounds(active.widget);
    const width = Math.max(120, Math.min(Math.max(rect.width, POPUP_MIN_WIDTH), view.right - view.left - 16));
    panel.style.width = `${Math.round(width)}px`;
    const field = active.field;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
    const left = Math.max(view.left + 8, Math.min(rect.left, view.right - width - 8));
    const top = Math.min(rect.top, view.bottom - panel.offsetHeight - 4);
    this.host.place(panel, left, top);
    const info = this.host.infoOf(active.widget);
    const part = info && (rect.width > 0 || rect.height > 0) ? this.host.shownPart(active.widget, info, active.cell) : rect;
    const cutTop = part && part.top > rect.top ? part.top - top : 0;
    const cutLeft = part && part.left > rect.left ? part.left - left : 0;
    panel.style.clipPath = !part ? "inset(50%)" : cutTop > 0 || cutLeft > 0 ? `inset(${Math.round(cutTop)}px 0 0 ${Math.round(cutLeft)}px)` : "";
  }
  /** Puts the rendered cell back; returns what was being edited. `reopening`: it opens again at once (in its popup), its table not left */
  close(reopening = false) {
    const active = this.editor;
    if (!active) return void 0;
    this.editor = void 0;
    for (const feature of this.context.features) feature.editorClosed?.(active);
    let value = reopening ? active.field.value : this.cellValue(active);
    if (!reopening && active.row === 0 && withoutTags(value) === "" && active.original !== "") {
      value = active.original;
      void this.host.bridge.flash("Table Plus: a column needs a name; the old name was kept", "info");
    }
    active.field.remove();
    active.panel?.remove();
    active.cell.classList.remove("tp-editing");
    if (active.cellStyle === null) active.cell.removeAttribute("style");
    else active.cell.setAttribute("style", active.cellStyle);
    active.cell.append(active.kept);
    if (!reopening) this.context.editingEnded(active.widget);
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
    return this.host.keepTags(value, active.original);
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
    if (!(sameTable && next?.row === closed.row)) this.context.releaseRow();
    let result = "unchanged";
    const info = changed && closed.row > 0 ? this.host.infoOf(closed.widget) : void 0;
    const edit = { row: closed.row, column: closed.column, original: closed.original, value: closed.value };
    const held = !!info && this.context.features.some((f) => f.holdCellEdit?.(closed.widget, info, edit));
    if (changed && !held) {
      result = await this.host.write(closed.widget, (t) => this.withCellEdit(t, closed), { focus: sameTable ? next : void 0 });
    }
    if (next && (result === "unchanged" || !sameTable)) {
      const info2 = this.host.infoOf(next.widget);
      const cell = info2 && this.host.cellAt(info2, next);
      if (info2 && cell) this.open(next.widget, info2, cell, next.select);
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
    if (info) await insertRowWith(this.host, closed.widget, info, closed.row + 1, closed.column, (t) => this.withSaved(t, closed), { after: closed.row });
  }
  /** The table with the closed editor's value saved, if it changed */
  withSaved(table, closed) {
    return closed.value !== closed.original ? this.withCellEdit(table, closed) : table;
  }
  /**
   * Whether a cell reached with the keyboard opens with its text selected:
   * as the selectOnClick setting says, with Shift (Shift+Enter) the reverse
   */
  selectsWith(shift) {
    return shift !== this.selectOnClick;
  }
  /** Esc: the edit is dropped, the cell stays selected (marked) where a feature selects; a second Esc ends that */
  async cancel() {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    await this.finish(false);
    if (active && info && this.host.selectsCells()) {
      const at = { row: active.row, column: active.column };
      this.host.selectCells(info, at, at);
    }
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
  async moveWithKeyboard(key2) {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    const vertical = key2 === "ArrowUp" || key2 === "ArrowDown" || key2 === "PageUp" || key2 === "PageDown";
    const step = key2 === "ArrowUp" || key2 === "ArrowLeft" ? -1 : 1;
    const from = vertical ? active.row : active.column;
    const asked = key2 === "Home" ? 0 : key2 === "End" ? info.columns - 1 : key2 === "PageUp" ? from - PAGE_ROWS : key2 === "PageDown" ? from + PAGE_ROWS : from + step;
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
   * With Shift the cells from the edited one to that one are selected (the
   * editor closes, saving); where no feature selects, the cell opens with its text selected.
   */
  async navigate(key2, shift) {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    const shown = this.host.shownRows(info);
    let r = shown.indexOf(active.cell.parentElement);
    let column = active.column;
    if (key2 === "ArrowLeft") column--;
    else if (key2 === "ArrowRight") column++;
    else if (key2 === "ArrowUp") r--;
    else if (key2 === "ArrowDown") r++;
    else if (key2 === "Home") column = 0;
    else if (key2 === "End") column = info.columns - 1;
    else if (key2 === "PageUp") r = r === 0 ? 0 : Math.max(1, r - PAGE_ROWS);
    else if (key2 === "PageDown") r = Math.min(shown.length - 1, r + PAGE_ROWS);
    const target = shown[r]?.cells[column];
    if (!target || target === active.cell) return;
    const ref = this.host.cellRef(info, target);
    if (!ref) return;
    if (shift && this.host.selectsCells()) {
      await this.finish(true);
      this.host.selectCells(info, { row: active.row, column: active.column }, ref);
      return;
    }
    await this.finish(true, { widget: active.widget, ...ref, select: this.selectsWith(shift) });
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
    await insertRowWith(this.host, closed.widget, info, appendRowAt(info.pins, info.rows), 0, (t) => this.withSaved(t, closed), { after: closed.row });
  }
  takePending(widget, info) {
    const pending = this.pending;
    if (!pending || pending.key !== info.key) return;
    this.pending = void 0;
    if (Date.now() > pending.until || this.editor) return;
    const cell = this.host.cellAt(info, pending);
    if (cell) this.open(widget, info, cell, pending.select);
  }
  /** The view changed its size (an on-screen keyboard showed): the cell being edited is scrolled into it again */
  revealActive() {
    const active = this.editor;
    if (active?.cell.isConnected) this.reveal(active.widget, active.cell);
    this.placePopup();
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
    const view = this.host.viewBounds(widget);
    const top = view.top + (headHeight ? STICKY_GAP + headHeight : 0);
    if (rect.top < top) scroller.scrollTop -= top - rect.top;
    else if (rect.bottom > view.bottom) scroller.scrollTop += rect.bottom - view.bottom;
  }
  // While Ctrl is held in a cell editor, arrows move between cells: the pointer shows it
  setNavigating(on) {
    this.context.navigating(on);
  }
};

// table-plus/src/core/touch-keyboard.ts
var HOLD_MS = 600;
function virtualKeyboard(win) {
  return win.navigator.virtualKeyboard;
}
var TouchKeyboard = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // The last press was a touch: SilverBullet's editor's focus would bring up the keyboard
  pressedByTouch = false;
  // Until when the cell being edited is brought back into view (HOLD_MS)
  heldUntil = 0;
  start() {
    const win = this.host.doc.defaultView;
    win.addEventListener("pointerdown", this.onPointerDown, true);
    win.addEventListener("scroll", this.onScroll, true);
    for (const type of ["touchstart", "wheel", "mousedown"]) win.addEventListener(type, this.userScrolls, { capture: true, passive: true });
    win.addEventListener("resize", this.onViewResize);
    win.visualViewport?.addEventListener("resize", this.onViewResize);
    virtualKeyboard(win)?.addEventListener("geometrychange", this.onViewResize);
  }
  stop() {
    const win = this.host.doc.defaultView;
    win.removeEventListener("pointerdown", this.onPointerDown, true);
    win.removeEventListener("scroll", this.onScroll, true);
    for (const type of ["touchstart", "wheel", "mousedown"]) win.removeEventListener(type, this.userScrolls, true);
    win.removeEventListener("resize", this.onViewResize);
    win.visualViewport?.removeEventListener("resize", this.onViewResize);
    virtualKeyboard(win)?.removeEventListener("geometrychange", this.onViewResize);
  }
  /** A cell's editor opened: its field's focus makes SilverBullet scroll to its cursor */
  editorOpened() {
    this.hold();
  }
  /**
   * Instead of handing the focus back to SilverBullet's editor after a touch:
   * let go of it (the keyboard goes). True when it did.
   */
  letGoOfFocus() {
    if (!this.pressedByTouch) return false;
    const active = this.host.doc.activeElement;
    if (active instanceof HTMLElement && active !== this.host.doc.body) active.blur();
    return true;
  }
  hold() {
    this.heldUntil = Date.now() + HOLD_MS;
  }
  onPointerDown = (e) => {
    this.pressedByTouch = e.pointerType === "touch";
    if (!this.pressedByTouch || !this.host.inTable(e.target)) return;
    const active = this.host.doc.activeElement;
    if (active instanceof HTMLElement && active.matches(EDITOR_SELECTOR)) active.blur();
  };
  // A scroll that is not the user's while the cell is held: the cell comes back
  onScroll = () => {
    if (Date.now() < this.heldUntil && this.host.editing()) this.host.revealEditing();
  };
  // The user scrolls or presses (a touch, a wheel, a press on a scrollbar): the
  // page is theirs (a press that opens a cell's editor holds it again)
  userScrolls = () => {
    this.heldUntil = 0;
  };
  onViewResize = () => {
    if (this.host.editing()) {
      this.host.viewResized();
      this.hold();
    }
    this.host.revealEditing();
    this.host.doc.defaultView.requestAnimationFrame?.(() => this.host.revealEditing());
  };
};

// table-plus/src/configpage.ts
var CONFIG_PAGE = "CONFIG";
var MANAGED_MARKER = "-- managed-by: configuration-manager";
function toLua(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
}
function pathOf(line) {
  const m = /^\s*config\.set\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*,.*\)\s*$/.exec(line);
  return m ? m[2].replace(/\\(.)/g, "$1") : void 0;
}
function withConfigSettings(text, values) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const fence = /^```space-lua[ \t]*\r?\n([\s\S]*?)^```[ \t]*(?=\r?$)/gm;
  let block;
  for (let m = fence.exec(text); m; m = fence.exec(text)) {
    if (m[1].trimStart().startsWith(MANAGED_MARKER)) {
      block = { start: m.index, end: m.index + m[0].length, inner: m[1] };
      break;
    }
  }
  const lines = block ? block.inner.replace(/\r?\n$/, "").split(/\r?\n/) : [MANAGED_MARKER];
  const pending = new Map(Object.entries(values));
  const kept = [];
  for (const line of lines) {
    const path = pathOf(line);
    if (path === void 0 || !pending.has(path)) {
      kept.push(line);
      continue;
    }
    const value = pending.get(path);
    pending.delete(path);
    if (value !== void 0) kept.push(`config.set(${toLua(path)}, ${toLua(value)})`);
  }
  for (const [path, value] of pending) {
    if (value !== void 0) kept.push(`config.set(${toLua(path)}, ${toLua(value)})`);
  }
  const empty = kept.every((line) => line.trim() === "" || line.trim() === MANAGED_MARKER);
  if (!block) {
    if (empty) return text;
    const separator = text === "" || text.endsWith(eol + eol) ? "" : text.endsWith(eol) ? eol : eol + eol;
    return `${text}${separator}\`\`\`space-lua${eol}${kept.join(eol)}${eol}\`\`\`${eol}`;
  }
  if (empty) {
    const end = text.startsWith(eol, block.end) ? block.end + eol.length : block.end;
    return text.slice(0, block.start) + text.slice(end);
  }
  return `${text.slice(0, block.start)}\`\`\`space-lua${eol}${kept.join(eol)}${eol}\`\`\`${text.slice(block.end)}`;
}

// table-plus/src/settings.ts
var TABS = [
  {
    id: "general",
    title: "General",
    groups: [
      { title: "Tables", keys: ["metadata", "autoFormat", "maxHeight"] },
      { title: "Cell editor", keys: ["enterKey", "selectOnClick", "ctrlEnterAddsRow"] },
      { title: "Cells with Lua expressions", keys: ["expressionsDelay"] }
    ]
  }
];
var moduleOf = (key2) => /^tablePlus\.modules\.([^.]+)\./.exec(SETTINGS[key2].path)?.[1];
var enabledPath = (name) => `tablePlus.modules.${name}.enabled`;
var SettingsDialog = class {
  constructor(context) {
    this.context = context;
  }
  context;
  initial = /* @__PURE__ */ new Map();
  values = /* @__PURE__ */ new Map();
  // Number fields whose text is no valid value: Save waits for them
  invalid = /* @__PURE__ */ new Set();
  backdrop;
  saveButton;
  note;
  moduleSettings = /* @__PURE__ */ new Map();
  saving = false;
  // Where the focus was before the dialog took it
  returnFocus = null;
  get isOpen() {
    return !!this.backdrop?.isConnected;
  }
  /** Whether a node is the dialog's (its keys are not the tables') */
  contains(node) {
    return !!this.backdrop?.contains(node);
  }
  /** Reads the settings as configured now and shows them */
  async open() {
    if (this.isOpen) return;
    const { bridge } = this.context;
    const read = async (path, fallback) => {
      try {
        return await bridge.getConfig?.(path, fallback) ?? fallback;
      } catch {
        return fallback;
      }
    };
    for (const key2 of Object.keys(SETTINGS)) {
      const setting = SETTINGS[key2];
      const value = setting.parse(await read(setting.path, setting.default)) ?? setting.default;
      this.initial.set(setting.path, value);
    }
    for (const name of FEATURE_NAMES) {
      const value = await read(enabledPath(name), moduleOnByDefault(name));
      this.initial.set(enabledPath(name), typeof value === "boolean" ? value : moduleOnByDefault(name));
    }
    for (const [path, value] of this.initial) this.values.set(path, value);
    this.returnFocus = this.context.doc.activeElement;
    this.render();
  }
  close() {
    this.backdrop?.remove();
    this.backdrop = void 0;
    if (this.returnFocus instanceof HTMLElement && this.returnFocus.isConnected) this.returnFocus.focus({ preventScroll: true });
  }
  /** Esc or ×: closed, after asking where changes would be lost */
  async dismiss() {
    if (this.saving) return;
    if (this.changed().length > 0) {
      const { bridge } = this.context;
      const question = "Close the Table Plus settings without saving your changes?";
      const sure = bridge.confirm ? await bridge.confirm(question) : this.context.doc.defaultView.confirm(question);
      if (!sure) return;
    }
    this.close();
  }
  // ---- the dialog --------------------------------------------------------------
  el(tag, className, text) {
    const e = this.context.doc.createElement(tag);
    if (className) e.className = className;
    if (text !== void 0) e.textContent = text;
    return e;
  }
  render() {
    const el = this.el.bind(this);
    const backdrop = el("div", `${UI_CLASS} tp-settings-backdrop`);
    const dialog = el("div", "tp-settings");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "tp-settings-title");
    const head = el("div", "tp-settings-head");
    const titles = el("div", "tp-settings-titles");
    const title = el("h2", "tp-settings-title", "Table Plus settings");
    title.id = "tp-settings-title";
    titles.append(title, el("p", "tp-settings-scope", "For every table in the space: SilverBullet's configuration"));
    const close = el("button", "tp-settings-close");
    close.type = "button";
    close.title = "Close (Esc)";
    close.setAttribute("aria-label", close.title);
    close.innerHTML = ICONS.clear;
    close.addEventListener("click", () => void this.dismiss());
    head.append(titles, close);
    const tabs = el("div", "tp-settings-tabs");
    tabs.setAttribute("role", "tablist");
    const body = el("div", "tp-settings-body");
    const panels = [];
    const tabButtons = [];
    const addTab = (id, name, panel) => {
      const tab = el("button", "tp-settings-tab", name);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.dataset.tpTab = id;
      panel.setAttribute("role", "tabpanel");
      panel.dataset.tpPanel = id;
      tab.addEventListener("click", () => {
        tabButtons.forEach((b) => b.setAttribute("aria-selected", String(b === tab)));
        panels.forEach((p) => p.hidden = p !== panel);
      });
      tabButtons.push(tab);
      panels.push(panel);
      tabs.append(tab);
      body.append(panel);
    };
    for (const tab of TABS) {
      const panel = el("div", "tp-settings-panel");
      for (const group of tab.groups) {
        if (group.title) panel.append(el("h3", "tp-settings-group", group.title));
        const card2 = el("div", "tp-settings-card");
        for (const key2 of group.keys) card2.append(this.row(key2));
        panel.append(card2);
      }
      addTab(tab.id, tab.title, panel);
    }
    const modules = el("div", "tp-settings-panel");
    const card = el("div", "tp-settings-card");
    for (const name of FEATURE_NAMES) card.append(this.moduleRow(name));
    modules.append(card);
    addTab("modules", "Modules", modules);
    tabButtons.forEach((b, i) => b.setAttribute("aria-selected", String(i === 0)));
    panels.forEach((p, i) => p.hidden = i !== 0);
    const foot = el("div", "tp-settings-foot");
    const note = el("div", "tp-settings-note");
    this.note = note;
    const cancel = el("button", "tp-settings-cancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      if (!this.saving) this.close();
    });
    const save = el("button", "tp-settings-save", "Save");
    save.type = "button";
    save.addEventListener("click", () => void this.save());
    this.saveButton = save;
    foot.append(note, cancel, save);
    dialog.append(head, tabs, body, foot);
    backdrop.append(dialog);
    backdrop.addEventListener("keydown", (e) => this.onKeyDown(e, dialog));
    this.context.doc.body.append(backdrop);
    this.backdrop = backdrop;
    this.update();
    dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
  }
  // Esc closes (asking where changes would be lost); Tab stays in the dialog; no key reaches the page
  onKeyDown(e, dialog) {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      void this.dismiss();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll("button, input, select")).filter(
      (f) => !f.disabled && f.offsetParent !== null
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.context.doc.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
  /** A setting's name, and under it what it does where it says more than its name */
  label(name, hint) {
    const text = this.el("span", "tp-settings-label");
    text.append(this.el("span", "tp-settings-name", name));
    if (hint) text.append(this.el("span", "tp-settings-hint", hint));
    return text;
  }
  /** A setting's row: its name left, its control right (a switch, a choice, a number) */
  row(key2) {
    const setting = SETTINGS[key2];
    const value = this.values.get(setting.path);
    const row = this.el("label", "tp-settings-row");
    row.dataset.tpSetting = setting.path;
    row.append(this.label(setting.label, setting.hint));
    if (typeof setting.default === "boolean") {
      row.append(this.switch(value === true, (on) => this.change(setting.path, on)));
      return row;
    }
    const choices = settingChoices(key2, this.context.doc, value);
    if (choices.length) {
      const select = this.el("select");
      for (const choice of choices) select.append(new Option(choice.label, choice.value, false, choice.value === value));
      select.addEventListener("change", () => this.change(setting.path, select.value));
      row.append(select);
      return row;
    }
    const input = this.el("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = String(value);
    input.addEventListener("input", () => {
      const parsed3 = setting.parse(input.value.trim() === "" ? void 0 : Number(input.value));
      input.classList.toggle("tp-settings-invalid", parsed3 === void 0);
      if (parsed3 === void 0) this.invalid.add(setting.path);
      else {
        this.invalid.delete(setting.path);
        this.values.set(setting.path, parsed3);
      }
      this.update();
    });
    row.append(input);
    return row;
  }
  /** A module's row: its name and what it does, its switch; its own settings under it while it is on */
  moduleRow(name) {
    const block = this.el("div", "tp-settings-module");
    const row = this.el("label", "tp-settings-row");
    const toggle = this.switch(this.values.get(enabledPath(name)) === true, (on) => this.change(enabledPath(name), on));
    toggle.querySelector("input").dataset.tpModule = name;
    row.append(this.label(MODULE_LABELS[name], MODULE_DESCRIPTIONS[name]), toggle);
    block.append(row);
    const keys = Object.keys(SETTINGS).filter((key2) => moduleOf(key2) === name);
    if (keys.length > 0) {
      const own = this.el("div", "tp-settings-module-settings");
      for (const key2 of keys) own.append(this.row(key2));
      block.append(own);
      this.moduleSettings.set(name, own);
    }
    return block;
  }
  /** A switch: a checkbox drawn as one */
  switch(on, changed) {
    const wrap = this.el("span", "tp-settings-switch");
    const box = this.el("input");
    box.type = "checkbox";
    box.setAttribute("role", "switch");
    box.checked = on;
    box.addEventListener("change", () => changed(box.checked));
    wrap.append(box, this.el("span", "tp-settings-knob"));
    return wrap;
  }
  change(path, value) {
    this.values.set(path, value);
    this.update();
  }
  /** What Save does and whether it can, the note, the modules' settings */
  update() {
    const changed = this.changed();
    const modules = this.modulesChanged();
    const save = this.saveButton;
    if (save) {
      save.textContent = this.saving ? "Saving\u2026" : modules ? "Save and reload" : "Save";
      save.disabled = this.saving || !this.context.canSave || changed.length === 0 || this.invalid.size > 0;
      save.title = this.context.canSave ? "" : "Settings cannot be saved here";
    }
    if (this.note) {
      this.note.textContent = !this.context.canSave ? "Settings cannot be saved here." : this.invalid.size > 0 ? "A number is not valid." : modules ? "Modules apply once the page reloads." : "";
    }
    for (const [name, own] of this.moduleSettings) own.hidden = this.values.get(enabledPath(name)) !== true;
    for (const input of Array.from(this.backdrop?.querySelectorAll("input, select") ?? [])) {
      input.disabled = this.saving;
    }
  }
  changed() {
    return Array.from(this.values).filter(([path, value]) => this.initial.get(path) !== value).map(([path]) => path);
  }
  modulesChanged() {
    return FEATURE_NAMES.some((name) => this.values.get(enabledPath(name)) !== this.initial.get(enabledPath(name)));
  }
  /**
   * Saves what changed, then closes; reloads for modules. Each value is written
   * as it is, its default too: the value shown may come from elsewhere (a part
   * set in one go, another block), which the managed block, coming last, overrides.
   */
  async save() {
    const changed = this.changed();
    if (this.saving || !this.context.canSave || changed.length === 0 || this.invalid.size > 0) return;
    const values = {};
    for (const path of changed) values[path] = this.values.get(path);
    const reload = this.modulesChanged();
    this.saving = true;
    this.update();
    try {
      await this.context.save(values);
    } catch (e) {
      this.saving = false;
      void this.context.bridge.flash(`Table Plus: the settings could not be saved (${String(e)})`, "error");
      this.update();
      return;
    }
    this.saving = false;
    this.close();
    if (reload) {
      if (this.context.bridge.reloadUI) await this.context.bridge.reloadUI();
      else this.context.doc.defaultView?.location.reload();
      return;
    }
    this.context.saved();
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

// table-plus/src/core/feature.ts
function editorRect(editor) {
  return (editor.popup ? editor.field.closest(".tp-cell-popup") ?? editor.cell : editor.cell).getBoundingClientRect();
}

// table-plus/src/columntypes/format.ts
function numberOf(text) {
  return asNumber(text);
}
function notANumber(text) {
  return numberOf(text) === void 0 ? `"${text}" is not a number` : void 0;
}
var numberFormats = /* @__PURE__ */ new Map();
var dateFormats = /* @__PURE__ */ new Map();
function numberFormat(locale, options = {}) {
  const key2 = `${locale ?? ""}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key2);
  if (!format) numberFormats.set(key2, format = new Intl.NumberFormat(locale, options));
  return format;
}
function dateTimeFormat(locale, options) {
  const key2 = `${locale ?? ""}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key2);
  if (!format) dateFormats.set(key2, format = new Intl.DateTimeFormat(locale, options));
  return format;
}
function formatNumber2(n, locale, options = {}) {
  return numberFormat(locale, options).format(n);
}

// table-plus/src/columntypes/type.ts
function columnType(type) {
  return type;
}

// table-plus/src/columntypes/builtin/check.ts
var YES = /* @__PURE__ */ new Set(["yes", "y", "true", "x", "\u2713", "\u2714", "\u2705", "done", "ok"]);
var NO = /* @__PURE__ */ new Set(["no", "n", "false", "\u2717", "\u274C", "-"]);
function yesOrNo(text) {
  const t = text.trim().toLowerCase();
  if (YES.has(t)) return true;
  if (NO.has(t)) return false;
  const n = numberOf(t);
  return n === void 0 ? void 0 : n > 0;
}
var check_default = columnType({
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
});

// table-plus/src/columntypes/builtin/currency.ts
var homes = /* @__PURE__ */ new Map();
function homeOf(code) {
  if (code === "EUR") return "de";
  let home = homes.get(code);
  if (home === void 0) {
    try {
      home = new Intl.Locale("und", { region: code.slice(0, 2) }).maximize().baseName;
    } catch {
      home = "en";
    }
    homes.set(code, home);
  }
  return home;
}
function formatMoney(n, code, locale) {
  const options = { style: "currency", currency: code, currencyDisplay: "narrowSymbol" };
  const own = numberFormat(locale, options).formatToParts(n);
  const home = numberFormat(homeOf(code), options).formatToParts(n);
  const symbol = own.find((p) => p.type === "currency")?.value ?? code;
  const sign = own.filter((p) => p.type === "minusSign" || p.type === "plusSign").map((p) => p.value).join("");
  const digits = own.filter((p) => !["currency", "minusSign", "plusSign", "literal"].includes(p.type)).map((p) => p.value).join("");
  const symbolFirst = home.findIndex((p) => p.type === "currency") < home.findIndex((p) => p.type === "integer");
  const gap = home.find((p) => p.type === "literal" && /^\s+$/.test(p.value))?.value ?? "";
  return symbolFirst ? `${sign}${symbol}${gap}${digits}` : `${sign}${digits}${gap}${symbol}`;
}
var currency_default = columnType({
  name: "currency",
  syntax: "#currency, #currency-usd",
  description: "An amount of money: the currency's three-letter code after the dash (default EUR). Its sign goes where the currency's country writes it: $12.99, 12.99 \u20AC, 12.99 K\u010D.",
  icon: lineIcon('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  params: { code: { kind: "text", pattern: /^[a-z]{3}$/i, default: "eur" } },
  aliases: { euro: "eur", eur: "eur", usd: "usd", czk: "czk", gbp: "gbp" },
  check: notANumber,
  format: (text, { code }, locale) => formatMoney(numberOf(text), code.toUpperCase(), locale)
});

// table-plus/src/columntypes/builtin/date.ts
var date_default = columnType({
  name: "date",
  syntax: "#date, #date-long",
  description: "A date written as 2025-11-06 (with a time: 2025-11-06 14:30), shown as the locale writes it: short, medium (default) or long after the dash.",
  icon: lineIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  params: { style: { kind: "choice", values: ["short", "medium", "long"], default: "medium" } },
  // Read as formulas read dates
  check: (text) => parseDate(text) ? void 0 : `"${text}" is not a date written as 2025-11-06`,
  format: (text, { style }, locale) => {
    const { ms, time } = parseDate(text);
    const timeStyle = ms % 6e4 !== 0 ? "medium" : "short";
    return dateTimeFormat(locale, { dateStyle: style, ...time ? { timeStyle } : {}, timeZone: "UTC" }).format(new Date(ms));
  }
});

// table-plus/src/columntypes/builtin/link.ts
var link_default = columnType({
  name: "link",
  syntax: "#link",
  description: "A web address as a link, shown without its https://.",
  icon: lineIcon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  check: (text) => /^https?:\/\/\S+$/.test(text.trim()) ? void 0 : `"${text}" is not a web address starting with http:// or https://`,
  format: (text) => ({ text: text.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), href: text.trim() })
});

// table-plus/src/columntypes/builtin/number.ts
var number_default = columnType({
  name: "number",
  syntax: "#number, #number-2",
  description: "A number with thousands separators: the decimal places after the dash (default: as written).",
  icon: lineIcon('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>'),
  params: { digits: { kind: "number", integer: true, min: 0, max: 9 } },
  aliases: { int: "0", float: "2" },
  check: notANumber,
  format: (text, { digits }, locale) => formatNumber2(numberOf(text), locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits ?? 10
  })
});

// table-plus/src/columntypes/builtin/percent.ts
function fraction(text) {
  const n = numberOf(text);
  return text.includes("%") ? n / 100 : n;
}
var percent_default = columnType({
  name: "percent",
  syntax: "#percent, #percent-1",
  description: "A fraction as a percentage, 0.15 is 15 % (15 % stays 15 %): the decimal places after the dash (default 0).",
  icon: lineIcon('<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
  params: { digits: { kind: "number", integer: true, min: 0, max: 9, default: 0 } },
  check: notANumber,
  format: (text, { digits }, locale) => formatNumber2(fraction(text), locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }),
  sortValue: (text) => String(fraction(text))
});

// table-plus/src/columntypes/builtin/progress.ts
var progress_default = columnType({
  name: "progress",
  syntax: "#progress, #progress-10",
  description: "Progress as a bar: a number from 0 to the maximum after the dash (default 100).",
  icon: lineIcon('<rect x="2" y="8" width="20" height="8" rx="4"/><path d="M6 12h5"/>'),
  params: { max: { kind: "number", integer: true, min: 1, default: 100 } },
  aliases: { gauge: "100" },
  check: (text, { max }) => {
    const n = numberOf(text);
    return n !== void 0 && n >= 0 && n <= max ? void 0 : `"${text}" is not a number from 0 to ${max}`;
  },
  format: (text, { max }, locale) => {
    const share = numberOf(text) / max;
    const filled2 = Math.round(share * 10);
    return `${"\u25B0".repeat(filled2)}${"\u25B1".repeat(10 - filled2)} ${formatNumber2(share, locale, { style: "percent" })}`;
  }
});

// table-plus/src/columntypes/builtin/stars.ts
var stars_default = columnType({
  name: "stars",
  syntax: "#stars, #stars-10",
  description: "A rating as stars: a whole number from 0 to the most stars after the dash (default 5).",
  icon: lineIcon('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>'),
  params: { max: { kind: "number", integer: true, min: 1, max: 99, default: 5 } },
  aliases: { evaluation: "5" },
  check: (text, { max }) => {
    const n = numberOf(text);
    return n !== void 0 && Number.isInteger(n) && n >= 0 && n <= max ? void 0 : `"${text}" is not a whole number from 0 to ${max}`;
  },
  format: (text, { max }) => {
    const n = numberOf(text);
    return "\u2605".repeat(n) + "\u2606".repeat(max - n);
  },
  choices: ({ max }) => Array.from({ length: max + 1 }, (_, n) => ({
    value: String(n),
    label: `${n} ${"\u2605".repeat(n)}${"\u2606".repeat(max - n)}`
  }))
});

// table-plus/src/columntypes/builtin/time.ts
function secondsOf(text) {
  const seconds = parseClock(text)?.seconds ?? fractionSeconds(text);
  return seconds !== void 0 && seconds >= 0 && seconds < DAY_SECONDS ? seconds : void 0;
}
function fractionSeconds(text) {
  const fraction2 = numberOf(text);
  return fraction2 === void 0 ? void 0 : Math.round(fraction2 * DAY_SECONDS);
}
var time_default = columnType({
  name: "time",
  syntax: "#time",
  description: "A time of day written as 14:30 or 14:30:15 (or as a fraction of a day, 0.5 is 12:00), shown as the locale writes times.",
  icon: lineIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  check: (text) => secondsOf(text) !== void 0 ? void 0 : `"${text}" is not a time written as 14:30`,
  format: (text, _param, locale) => {
    const seconds = secondsOf(text);
    return dateTimeFormat(locale, { timeStyle: seconds % 60 ? "medium" : "short", timeZone: "UTC" }).format(
      new Date(seconds * 1e3)
    );
  },
  // The time written in full (09:05, 12:00 for 0.5): sorts by the time, and filters and copies still find 9:05
  sortValue: (text) => formatClock(secondsOf(text))
});

// table-plus/src/columntypes/builtin/trend.ts
var ARROWS = { "+": "\u{1F53C}", "-": "\u{1F53D}", "=": "\u27A1\uFE0F" };
function arrowOf(text) {
  const t = text.trim();
  if (ARROWS[t]) return ARROWS[t];
  const n = numberOf(t);
  return n === void 0 ? void 0 : n > 0 ? ARROWS["+"] : n < 0 ? ARROWS["-"] : ARROWS["="];
}
var trend_default = columnType({
  name: "trend",
  syntax: "#trend",
  description: "A trend as an arrow: + or a number above 0 shows \u{1F53C}, - or one below 0 shows \u{1F53D}, = or 0 shows \u27A1\uFE0F.",
  icon: lineIcon('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  check: (text) => arrowOf(text) ? void 0 : `"${text}" is not +, -, = or a number`,
  format: (text) => arrowOf(text),
  choices: () => Object.entries(ARROWS).map(([value, arrow]) => ({ value, label: `${arrow} ${value}` }))
});

// table-plus/src/columntypes/builtin/unit.ts
var unit_default = columnType({
  name: "unit",
  syntax: "#unit-kg",
  description: "A number with a unit: the unit after the dash.",
  icon: lineIcon('<path d="M3 16 16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>'),
  params: { unit: { kind: "text" } },
  aliases: { kg: "kg", km: "km", watt: "W" },
  check: (text, { unit }) => unit === void 0 ? "#unit needs a unit, e.g. #unit-kg" : notANumber(text),
  format: (text, { unit }, locale) => `${formatNumber2(numberOf(text), locale, { maximumFractionDigits: 10 })} ${unit}`
});

// table-plus/src/columntypes/builtin/index.ts
var BUILT_IN_TYPES = [currency_default, number_default, percent_default, unit_default, stars_default, check_default, date_default, time_default, trend_default, progress_default, link_default];

// table-plus/src/columntypes/registry.ts
function knownOf(custom4) {
  const replacing = new Map(custom4.map((t) => [t.name, t]));
  const all = [...BUILT_IN_TYPES.map((t) => replacing.get(t.name) ?? t), ...custom4.filter((t) => !BUILT_IN_TYPES.some((b) => b.name === t.name))];
  return {
    all,
    byName: new Map(all.map((t) => [t.name, t])),
    aliases: new Map(
      [...all.filter((t) => !custom4.includes(t)), ...custom4].flatMap(
        (t) => Object.entries(t.aliases ?? {}).map(([alias, written]) => [alias, { type: t, written: written || void 0 }])
      )
    )
  };
}
var custom2 = [];
var known = knownOf(custom2);
var anew2 = false;
function allTypes() {
  return known.all;
}
function defineCustomTypes(types) {
  custom2 = Array.from(new Map([...anew2 ? [] : custom2, ...types].map((t) => [t.name, t])).values());
  known = knownOf(custom2);
  anew2 = false;
}
function customTypesAnew() {
  anew2 = true;
}
var HASHTAG_RE = /(^|\s)#([^\s#]+)/g;
function typeOfTag(tag) {
  const lower = tag.toLowerCase();
  const alias = known.byName.has(lower) ? void 0 : known.aliases.get(lower);
  const dash = lower.indexOf("-");
  const type = alias?.type ?? known.byName.get(dash < 0 ? lower : lower.slice(0, dash));
  if (!type) return void 0;
  const params = readParams(type.params ?? {}, alias ? alias.written : dash < 0 ? void 0 : tag.slice(dash + 1));
  return params && { type, params, tag };
}
function readParams(specs, written) {
  const names = Object.keys(specs);
  if (written !== void 0 && names.length === 0) return void 0;
  const parts = written === void 0 ? [] : written.split("-");
  if (parts.length > names.length) parts.splice(names.length - 1, Infinity, parts.slice(names.length - 1).join("-"));
  const params = {};
  for (const [i, name] of names.entries()) {
    const spec = specs[name];
    const part = parts[i];
    if (part === void 0) {
      params[name] = spec.default;
      continue;
    }
    const value = paramValue(spec, part);
    if (value === void 0) return void 0;
    params[name] = value;
  }
  return params;
}
function paramValue(spec, part) {
  switch (spec.kind) {
    case "number": {
      const n = (spec.integer ? /^(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)(\.\d+)?$/).test(part) ? Number(part) : NaN;
      const fits = Number.isFinite(n) && (!spec.integer || Number.isInteger(n)) && n >= (spec.min ?? -Infinity) && n <= (spec.max ?? Infinity);
      return fits ? n : void 0;
    }
    case "choice":
      return spec.values.find((value) => value.toLowerCase() === part.toLowerCase());
    case "text":
      return part !== "" && (!spec.pattern || spec.pattern.test(part)) ? part : void 0;
  }
}
function columnTypeOf(header) {
  for (const match of header.matchAll(HASHTAG_RE)) {
    const typed = typeOfTag(match[2]);
    if (typed) return typed;
  }
  return void 0;
}
function withColumnType(header, tag) {
  const rest = header.replace(HASHTAG_RE, (all, space, name2) => typeOfTag(name2) ? space : all);
  const name = rest.replace(/\s+/g, " ").trim();
  return tag ? `${name} #${tag}` : name;
}
function typeTagPatterns() {
  return {
    exact: [...known.all.map((t) => t.name), ...known.aliases.keys()],
    prefixes: known.all.filter((t) => Object.keys(t.params ?? {}).length > 0).map((t) => `${t.name}-`)
  };
}

// table-plus/src/features/columntypes.ts
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
function attempt(typed, call2) {
  try {
    return call2();
  } catch (e) {
    return `#${typed.tag} failed: ${e instanceof Error ? e.message : String(e)}`;
  }
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
  /** Custom types were defined anew: their hashtags are hidden too (tables rendered from now on show them typed) */
  tablesChanged() {
    this.style.textContent = hiddenTagsCss();
  }
  owns(node) {
    return this.picker.contains(node);
  }
  layoutChanged() {
    if (this.picking && this.picker.classList.contains("tp-visible")) this.placePicker(this.picking.editor);
  }
  // ---- the column menu ----------------------------------------------------------
  /** "Type: …" in a column's menu (first in its section of sorting and filtering): picks the column's type, written as a hashtag in its header */
  columnMenuLeadEntries(widget, info, column, open) {
    const header = parseTable(info.source).rows[0]?.cells[column] ?? "";
    const current = columnTypeOf(unescapeCell(header));
    const setType = (tag) => () => void this.host.write(widget, (t) => setCell(t, 0, column, withColumnType(t.rows[0]?.cells[column] ?? "", tag)));
    const choices = [
      { kind: "item", label: "No type", icon: ICONS.clear, checked: !current, run: setType(void 0) },
      { kind: "separator" },
      ...allTypes().map((type) => {
        const first = type.syntax.split(",")[0].trim().replace(/^#/, "");
        const tag = typeOfTag(first)?.type === type ? first : type.name;
        return {
          kind: "item",
          label: typeLabel(type.name),
          icon: iconOf(type),
          checked: current?.type === type,
          detail: typeDetail(type),
          run: setType(current?.type === type ? current.tag : tag)
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
    return unescapeCell(withoutTags(withColumnType(original, void 0)));
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
    const choices = typed && attempt(typed, () => typed.type.choices?.(typed.params));
    if (!choices || typeof choices === "string" || !choices.length) return;
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
    const rect = editorRect(editor);
    this.picker.style.minWidth = `${Math.round(editor.cell.getBoundingClientRect().width)}px`;
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
    const error = attempt(column, () => column.type.check(text, column.params));
    if (error) void this.host.bridge.flash(`Table Plus: ${error} (#${column.tag}); saved as typed`, "info");
    return void 0;
  }
  // A header renamed by a paste keeps its type's hashtag, as one renamed in its editor
  headerRenamed(name, original) {
    const kept = columnTypeOf(unescapeCell(original));
    return kept && name.trim() !== "" ? withColumnType(name, kept.tag) : void 0;
  }
  decorate(_widget, info) {
    const model = parseTable(info.source);
    const header = info.table.rows[0];
    const rows = this.host.bodyRows(info);
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
      for (const tr of rows) {
        const raw = model.rows[Number(tr.dataset.tpRow)]?.cells[column];
        const cell = tr.cells[column];
        if (raw === void 0 || !cell) continue;
        const text = unescapeCell(withoutTags(raw)).trim();
        if (text === "" || cellText(cell) !== text) continue;
        const { type, params } = typed;
        const shown = attempt(typed, () => {
          const error = type.check(text, params);
          return error === void 0 ? { value: type.sortValue?.(text, params) ?? text, shown: type.format(text, params) } : error;
        });
        if (typeof shown === "string") {
          cell.dataset.tpValue = text;
          cell.classList.add("tp-type-invalid");
          cell.title = cell.title ? `${cell.title}
${shown}` : shown;
          continue;
        }
        cell.dataset.tpValue = shown.value;
        this.show(cell, shown.shown);
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

// table-plus/src/clipboard.ts
function clipboardText(values) {
  const quote = (v) => /[\t\n"]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  return values.map((row) => row.map(quote).join("	")).join("\n");
}
function clipboardHtml(values) {
  const escape = (v) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const rows = values.map((row) => `<tr>${row.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("");
  return `<table>${rows}</table>`;
}
async function writeClipboard(doc, text, html) {
  const win = doc.defaultView;
  const clipboard = win?.navigator.clipboard;
  if (!clipboard?.writeText) {
    copyCommand(doc, text, html);
    return;
  }
  try {
    if (html !== void 0 && win?.ClipboardItem && clipboard.write) {
      const blob = (type, value) => new Blob([value], { type });
      await clipboard.write([new win.ClipboardItem({ "text/plain": blob("text/plain", text), "text/html": blob("text/html", html) })]);
    } else {
      await clipboard.writeText(text);
    }
  } catch (e) {
    try {
      copyCommand(doc, text, html);
    } catch {
      throw e;
    }
  }
}
var copying = false;
function copyingFromMenu() {
  return copying;
}
function copyCommand(doc, text, html) {
  const field = doc.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.setAttribute("aria-hidden", "true");
  Object.assign(field.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0" });
  field.addEventListener("copy", (e) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData("text/plain", text);
    if (html !== void 0) e.clipboardData.setData("text/html", html);
    e.preventDefault();
  });
  const before = doc.activeElement;
  doc.body.append(field);
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  copying = true;
  try {
    copied = typeof doc.execCommand === "function" && doc.execCommand("copy");
  } finally {
    copying = false;
    field.remove();
    if (before instanceof HTMLElement) before.focus({ preventScroll: true });
  }
  if (!copied) throw new Error("the browser did not copy");
}

// table-plus/src/names.ts
var NAMES_TAG_RE = /\s*<meta((?:\s+c?n\s*=\s*(?:"[^"]*"|'[^']*'))+)\s*\/?>/gi;
var NAMES_ATTRIBUTE_RE = /(c?n)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
var CELL_RE = /^([A-Za-z]{1,3})([1-9]\d*)$/;
var NAME_RE2 = /^[A-Za-z_][A-Za-z0-9_]*$/;
function nameProblem(name, what) {
  if (!NAME_RE2.test(name)) return `"${name}" is not a ${what} name: letters, digits and _, not starting with a digit`;
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

// table-plus/src/formulas/cell.ts
var FORMULA_TAG_RE = /<meta\s+f\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\/?>/gi;
function formulaOf(cell) {
  if (!cell.includes("<")) return void 0;
  const match = Array.from(cell.matchAll(FORMULA_TAG_RE)).pop();
  if (!match) return void 0;
  const formula = unescapeMetaValue(match[1] ?? match[2] ?? "").trim();
  const rest = cell.slice(0, match.index) + cell.slice(match.index + match[0].length);
  const name = cellNameOf(rest);
  return { formula: formula.startsWith("=") ? formula : `=${formula}`, value: withoutTags(rest), ...name ? { name } : {} };
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
function hasFormulas(table) {
  return table.rows.some((row, r) => r > 0 && row.cells.some((cell) => formulaOf(cell) !== void 0));
}
function formulaCount(table) {
  return table.rows.reduce((n, row, r) => n + (r === 0 ? 0 : row.cells.filter((cell) => formulaOf(cell)).length), 0);
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

// table-plus/src/columns.ts
var HASHTAG_RE2 = /(^|\s)#[^\s#]+/g;
function columnName(header) {
  return unescapeCell(header).replace(/<meta\b[^>]*>/gi, "").replace(HASHTAG_RE2, "$1").trim().replace(/^[*_`]+|[*_`]+$/g, "").trim();
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

// table-plus/src/formulas/arguments.ts
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
function tidy(n, like = n) {
  if (!Number.isFinite(n) || n === 0) return n;
  const decimals = 14 - Math.floor(Math.log10(Math.abs(like || n)));
  const result = decimals >= 0 && decimals <= 100 ? Number(n.toFixed(decimals)) : Number(n.toPrecision(15));
  return result === 0 ? 0 : result;
}
function toWhole(value) {
  const n = toNumber(value);
  return isError(n) ? n : Math.trunc(n);
}

// table-plus/src/formulas/builtin/sum.ts
var sum_default = {
  name: "SUM",
  syntax: "SUM(number1, [number2], \u2026)",
  description: "Adds numbers, cells and ranges; times add up to a time (14:00 and 20:00 are 34:00).",
  category: "math",
  example: "=SUM([qty])",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => ns.reduce((a, b) => a + b, 0), true)
};

// table-plus/src/formulas/builtin/average.ts
var average_default = {
  name: "AVERAGE",
  syntax: "AVERAGE(number1, [number2], \u2026)",
  description: "The arithmetic mean of the numbers, or of the times.",
  category: "math",
  example: "=AVERAGE(B1:B3)",
  minArgs: 1,
  call: (args) => withNumbers(
    args,
    (ns) => ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : new FormulaError("#DIV/0!", "no numbers to average"),
    true
  )
};

// table-plus/src/formulas/builtin/min.ts
var min_default = {
  name: "MIN",
  syntax: "MIN(number1, [number2], \u2026)",
  description: "The smallest of the numbers (0 if there are none), the shortest of the times, or the earliest of the dates.",
  category: "math",
  example: "=MIN([price])",
  minArgs: 1,
  call: (args) => extremeDate(args, false) ?? withNumbers(args, (ns) => ns.length ? Math.min(...ns) : 0, true)
};

// table-plus/src/formulas/builtin/max.ts
var max_default = {
  name: "MAX",
  syntax: "MAX(number1, [number2], \u2026)",
  description: "The largest of the numbers (0 if there are none), the longest of the times, or the latest of the dates.",
  category: "math",
  example: "=MAX([price])",
  minArgs: 1,
  call: (args) => extremeDate(args, true) ?? withNumbers(args, (ns) => ns.length ? Math.max(...ns) : 0, true)
};

// table-plus/src/formulas/builtin/product.ts
var product_default = {
  name: "PRODUCT",
  syntax: "PRODUCT(number1, [number2], \u2026)",
  description: "Multiplies the numbers.",
  category: "math",
  example: "=PRODUCT([@qty], [@price])",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => ns.reduce((a, b) => a * b, 1))
};

// table-plus/src/formulas/builtin/count.ts
var count_default = {
  name: "COUNT",
  syntax: "COUNT(value1, [value2], \u2026)",
  description: "How many of the values are numbers.",
  category: "math",
  example: "=COUNT([qty])",
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

// table-plus/src/formulas/builtin/counta.ts
var counta_default = {
  name: "COUNTA",
  syntax: "COUNTA(value1, [value2], \u2026)",
  description: "How many of the values are not empty.",
  category: "math",
  example: "=COUNTA([name])",
  minArgs: 1,
  call: (args) => flatten(args).filter((v) => v !== null && v !== "").length
};

// table-plus/src/formulas/builtin/round.ts
var round_default = {
  name: "ROUND",
  syntax: "ROUND(number, [digits])",
  description: "Rounds to the given number of decimal places (default 0), halves away from zero.",
  category: "math",
  example: "=ROUND([@price] * 1.21, 2)",
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

// table-plus/src/formulas/builtin/abs.ts
var abs_default = {
  name: "ABS",
  syntax: "ABS(number)",
  description: "The number without its sign.",
  category: "math",
  example: "=ABS([@change])",
  minArgs: 1,
  maxArgs: 1,
  call: ([number]) => {
    const n = toNumber(number);
    return isError(n) ? n : Math.abs(n);
  }
};

// table-plus/src/formulas/builtin/if.ts
var if_default = {
  name: "IF",
  syntax: "IF(condition, value_if_true, [value_if_false])",
  description: "One value if the condition is true, another if it is false (default FALSE).",
  category: "logic",
  example: '=IF([@qty] > 10, "bulk", "single")',
  minArgs: 2,
  maxArgs: 3,
  call: ([condition, ifTrue, ifFalse = false]) => {
    const c = toBoolean(condition);
    if (isError(c)) return c;
    return single(c ? ifTrue : ifFalse);
  }
};

// table-plus/src/formulas/builtin/iferror.ts
var iferror_default = {
  name: "IFERROR",
  syntax: "IFERROR(value, value_if_error)",
  description: "The value, or the second value if the first is an error.",
  category: "logic",
  example: "=IFERROR([@price] / [@qty], 0)",
  minArgs: 2,
  maxArgs: 2,
  call: ([value, ifError]) => {
    const v = single(value);
    return isError(v) ? single(ifError) : v;
  }
};

// table-plus/src/formulas/builtin/and.ts
var and_default = {
  name: "AND",
  syntax: "AND(logical1, [logical2], \u2026)",
  description: "TRUE if all of the values are true.",
  category: "logic",
  example: "=AND([@paid], [@sent])",
  minArgs: 1,
  call: (args) => {
    const bs = booleans(args);
    return isError(bs) ? bs : bs.every(Boolean);
  }
};

// table-plus/src/formulas/builtin/or.ts
var or_default = {
  name: "OR",
  syntax: "OR(logical1, [logical2], \u2026)",
  description: "TRUE if any of the values is true.",
  category: "logic",
  example: "=OR([@qty] = 0, [@price] = 0)",
  minArgs: 1,
  call: (args) => {
    const bs = booleans(args);
    return isError(bs) ? bs : bs.some(Boolean);
  }
};

// table-plus/src/formulas/builtin/not.ts
var not_default = {
  name: "NOT",
  syntax: "NOT(logical)",
  description: "TRUE if the value is false, FALSE if it is true.",
  category: "logic",
  example: "=NOT([@done])",
  minArgs: 1,
  maxArgs: 1,
  call: ([value]) => {
    const b = toBoolean(value);
    return isError(b) ? b : !b;
  }
};

// table-plus/src/formulas/builtin/concat.ts
var concat_default = {
  name: "CONCAT",
  syntax: "CONCAT(text1, [text2], \u2026)",
  description: "Joins the values into one text.",
  category: "text",
  example: '=CONCAT([@first], " ", [@last])',
  minArgs: 1,
  call: (args) => {
    const error = firstError(args);
    if (error) return error;
    return flatten(args).map((v) => toText(v)).join("");
  }
};

// table-plus/src/formulas/builtin/today.ts
var today_default = {
  name: "TODAY",
  syntax: "TODAY()",
  description: "Today's date, e.g. 2025-11-06. The result is written when the table is calculated: the next day, Recalculate updates it.",
  category: "date",
  example: "=TODAY()",
  minArgs: 0,
  maxArgs: 0,
  call: () => formatDate(now(false))
};

// table-plus/src/formulas/builtin/now.ts
var now_default = {
  name: "NOW",
  syntax: "NOW()",
  description: "The date and time now, e.g. 2025-11-06 14:30:15. The result is written when the table is calculated: Recalculate updates it.",
  category: "date",
  example: "=NOW()",
  minArgs: 0,
  maxArgs: 0,
  call: () => formatDate(now(true))
};

// table-plus/src/formulas/builtin/date.ts
var date_default2 = {
  name: "DATE",
  syntax: "DATE(year, month, day)",
  description: "The date of a year, month and day; a month or day past its end carries over (DATE(2025, 13, 1) is 2026-01-01).",
  category: "date",
  example: "=DATE(2025, 11, 6)",
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

// table-plus/src/formulas/builtin/time.ts
var time_default2 = {
  name: "TIME",
  syntax: "TIME(hour, [minute], [second])",
  description: "A time of day, e.g. 14:30; past midnight it starts again (TIME(25, 0) is 01:00). Added to a date it gives the date with that time: DATE(2025, 11, 6) + TIME(14, 30) is 2025-11-06 14:30.",
  category: "date",
  example: "=TIME(14, 30)",
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

// table-plus/src/formulas/builtin/int.ts
var int_default = {
  name: "INT",
  syntax: "INT(number)",
  description: "The number rounded down to a whole number; for a time, its whole days (INT(SUM(A1:A2)) of 14:00 and 20:00 is 1).",
  category: "math",
  example: "=INT([@hours])",
  minArgs: 1,
  maxArgs: 1,
  call: ([number]) => {
    const time = asTime(single(number));
    if (time) return Math.floor(time.seconds / DAY_SECONDS);
    const n = toNumber(number);
    return isError(n) ? n : Math.floor(n);
  }
};

// table-plus/src/formulas/builtin/text.ts
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
function piecesOf(format) {
  const pieces = [];
  for (let i = 0; i < format.length; i++) {
    const c = format[i];
    if (c === '"') {
      const close = format.indexOf('"', i + 1);
      if (close < 0) return void 0;
      pieces.push({ text: format.slice(i + 1, close) });
      i = close;
    } else if (c === "\\") pieces.push({ text: format[++i] ?? "" });
    else pieces.push({ code: c });
  }
  return pieces;
}
var isDigit = (p) => p?.code === "0" || p?.code === "#";
function numberSection(pieces, format) {
  const text = (from, to) => pieces.slice(from, to).map((p) => p.text ?? p.code).join("");
  const first = pieces.findIndex(isDigit);
  if (first < 0) return () => text(0, pieces.length);
  const inNumber = (p) => isDigit(p) || p?.code === "," || p?.code === ".";
  let start = first;
  while (inNumber(pieces[start - 1])) start--;
  let end = first;
  while (inNumber(pieces[end + 1])) end++;
  if (pieces.some((p, at) => isDigit(p) && (at < start || at > end))) {
    return new FormulaError("#VALUE!", `"${format}" has more than one number: TEXT writes one`);
  }
  const fullSpec = pieces.slice(start, end + 1).map((p) => p.code).join("");
  const spec = fullSpec.replace(/,+$/, "");
  const [wholeSpec = "", decimals, extra] = spec.split(".");
  if (extra !== void 0) return new FormulaError("#VALUE!", `"${format}" has more than one decimal point`);
  const whole = wholeSpec.replace(/,+$/, "");
  const thousands = fullSpec.length - spec.length + wholeSpec.length - whole.length;
  const minWhole = whole.split("0").length - 1;
  const grouped = whole.includes(",");
  const minDecimals = (decimals ?? "").split("0").length - 1;
  const maxDecimals = (decimals ?? "").replace(/,/g, "").length;
  const percent = pieces.filter((p) => p.code === "%").length;
  const before = text(0, start);
  const after = text(end + 1, pieces.length);
  return (n) => {
    const value = Math.abs(n) * 100 ** percent / 1e3 ** thousands;
    const scale = 10 ** maxDecimals;
    const rounded = Math.round(tidy(value * scale)) / scale;
    let [int = "", dec = ""] = rounded.toFixed(maxDecimals).split(".");
    dec = dec.replace(/0+$/, "").padEnd(minDecimals, "0");
    if (int === "0" && minWhole === 0) int = "";
    int = int.padStart(minWhole, "0");
    if (grouped) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${before}${decimals === void 0 ? int : `${int}.${dec}`}${after}`;
  };
}
function numberFormat2(format) {
  const pieces = piecesOf(format);
  if (!pieces?.some(isDigit)) return void 0;
  const sections = [[]];
  for (const piece of pieces) {
    if (piece.code === ";") sections.push([]);
    else sections.at(-1).push(piece);
  }
  if (sections.length > 3) return new FormulaError("#VALUE!", `"${format}" has more than three sections`);
  const writers = [];
  for (const section of sections) {
    const writer = numberSection(section, format);
    if (isError(writer)) return writer;
    writers.push(writer);
  }
  const [positive, negative, zero] = writers;
  return (n) => {
    if (n < 0 && negative) return negative(n);
    if (n === 0 && zero) return zero(n);
    const written = positive(n);
    return n < 0 && /[1-9]/.test(written) ? `-${written}` : written;
  };
}
var pad = (n, length) => String(n).padStart(Math.min(length, 2), "0");
var text_default = {
  name: "TEXT",
  syntax: "TEXT(value, format)",
  description: 'A number, a date or a time as text in a format: TEXT(A1, "#,##0.00"), TEXT(A1, "0%"), TEXT(A1, "dd.mm.yyyy hh:mm"), TEXT(A1, "[h]:mm") for all the hours of a length of time. Number codes: 0 (a digit), # (a digit where it counts), , (thousands), . (decimals), %, and ; between formats of positive;negative;zero numbers ("0.00;(0.00)"); date codes: yyyy, yy, m, mm, d, dd, h, hh, m, mm (minutes), s, ss, [h], [m], [s]; text in quotes as it is.',
  category: "text",
  example: '=TEXT([@due], "dd.mm.yyyy")',
  minArgs: 2,
  maxArgs: 2,
  call: ([value, format]) => {
    const v = single(value);
    const f = toText(format);
    if (isError(v)) return v;
    if (isError(f)) return f;
    const number = numberFormat2(f);
    if (number !== void 0) {
      if (isError(number)) return number;
      const n = toNumber(v);
      return isError(n) ? n : number(n);
    }
    const parts = parseFormat(f);
    if (isError(parts)) return parts;
    if (!parts.some((part) => "code" in part)) {
      return new FormulaError("#VALUE!", `"${f}" has no number, date or time code: 0, #, yyyy, mm, dd, hh, mm, ss, [h], [m] or [s]`);
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

// table-plus/src/formulas/criteria.ts
function wildcardRegExp(pattern, whole) {
  const literal = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "~" && (pattern[i + 1] === "*" || pattern[i + 1] === "?" || pattern[i + 1] === "~")) source += literal(pattern[++i]);
    else if (c === "*") source += "[\\s\\S]*";
    else if (c === "?") source += "[\\s\\S]";
    else source += literal(c);
  }
  return new RegExp(whole ? `^${source}$` : source, "iu");
}
function numberOf2(cell) {
  if (typeof cell === "number") return cell;
  if (cell instanceof TimeValue) return cell.seconds / DAY_SECONDS;
  if (typeof cell !== "string") return void 0;
  const n = asNumber(cell);
  if (n !== void 0) return n;
  const time = asTime(cell);
  return time ? time.seconds / DAY_SECONDS : void 0;
}
var isEmpty = (cell) => cell === null || typeof cell === "string" && cell.trim() === "";
var ORDER = {
  "=": (o) => o === 0,
  "<>": (o) => o !== 0,
  "<": (o) => o < 0,
  ">": (o) => o > 0,
  "<=": (o) => o <= 0,
  ">=": (o) => o >= 0
};
function criterion(value) {
  if (typeof value !== "string") return (cell) => !isError(cell) && sameValue(value, cell);
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(value);
  const op = m[1] ?? "=";
  const rest = m[2];
  const order2 = ORDER[op];
  if (rest === "") return op === "<>" ? (cell) => !isEmpty(cell) : op === "=" ? isEmpty : () => false;
  const date = parseDate(rest);
  if (date) {
    return (cell) => {
      const d = typeof cell === "string" ? parseDate(cell) : void 0;
      return d ? order2(d.ms - date.ms) : op === "<>";
    };
  }
  const n = numberOf2(rest);
  if (n !== void 0) {
    return (cell) => {
      const c = isError(cell) || typeof cell === "boolean" ? void 0 : numberOf2(cell);
      return c !== void 0 ? order2(c - n) : op === "<>";
    };
  }
  if (op === "=" || op === "<>") {
    const re = wildcardRegExp(rest, true);
    const text = (cell) => typeof cell === "boolean" ? cell ? "TRUE" : "FALSE" : typeof cell === "string" && !isEmpty(cell) ? cell.trim() : void 0;
    return (cell) => {
      const t = isError(cell) ? void 0 : text(cell);
      const matches = t !== void 0 && re.test(t);
      return op === "=" ? matches : !matches;
    };
  }
  const lower = rest.toLowerCase();
  return (cell) => {
    if (typeof cell !== "string" || isEmpty(cell) || numberOf2(cell) !== void 0) return false;
    const t = cell.trim().toLowerCase();
    return order2(t < lower ? -1 : t > lower ? 1 : 0);
  };
}
function cellsOf(value) {
  return isRange(value) ? value : [value];
}
function matchingPlaces(pairs, size) {
  if (pairs.length === 0 || pairs.length % 2 !== 0) {
    return new FormulaError("#VALUE!", "the conditions come in pairs: a range, then its condition");
  }
  const ranges = [];
  const tests = [];
  for (let i = 0; i < pairs.length; i += 2) {
    if (isError(pairs[i])) return pairs[i];
    const cells = cellsOf(pairs[i]);
    const condition = single(pairs[i + 1]);
    if (isError(condition)) return condition;
    const expected = size ?? ranges[0]?.length ?? cells.length;
    if (cells.length !== expected) {
      return new FormulaError("#VALUE!", `the ranges are not the same size (${expected} and ${cells.length} cells)`);
    }
    ranges.push(cells);
    tests.push(criterion(condition));
  }
  const places = [];
  for (let at = 0; at < ranges[0].length; at++) {
    if (ranges.every((cells, i) => tests[i](cells[at]))) places.push(at);
  }
  return places;
}
function matchingCells(values, pairs) {
  if (isError(values)) return values;
  const cells = cellsOf(values);
  const places = matchingPlaces(pairs, cells.length);
  return isError(places) ? places : places.map((at) => cells[at]);
}

// table-plus/src/formulas/builtin/xlookup.ts
function order(key2, value) {
  if (key2 === null || isError(key2) || typeof key2 === "boolean" || typeof value === "boolean") return void 0;
  if (typeof key2 === "string" && key2.trim() === "") return void 0;
  const dk = typeof key2 === "string" ? parseDate(key2) : void 0;
  const dv = typeof value === "string" ? parseDate(value) : void 0;
  if (dk || dv) return dk && dv ? dk.ms - dv.ms : void 0;
  const nk = toNumber(key2);
  const nv = toNumber(value);
  if (!isError(nk) || !isError(nv)) return !isError(nk) && !isError(nv) ? nk - nv : void 0;
  const tk = toText(key2).toLowerCase();
  const tv = toText(value).toLowerCase();
  return tk < tv ? -1 : tk > tv ? 1 : 0;
}
function find(value, keys, places, mode) {
  if (mode === 2) {
    const re = wildcardRegExp(toText(value), true);
    return places.find((at) => typeof keys[at] === "string" && re.test(keys[at].trim())) ?? -1;
  }
  const exact = places.find((at) => sameValue(value, keys[at]));
  if (exact !== void 0 || mode === 0) return exact ?? -1;
  let best = -1;
  for (const at of places) {
    const o = order(keys[at], value);
    if (o === void 0 || (mode < 0 ? o > 0 : o < 0)) continue;
    if (best < 0 || (mode < 0 ? order(keys[at], keys[best]) > 0 : order(keys[at], keys[best]) < 0)) best = at;
  }
  return best;
}
var xlookup_default = {
  name: "XLOOKUP",
  syntax: "XLOOKUP(value, lookup_range, result_range, [if_not_found], [match_mode], [search_mode])",
  description: 'Finds the value in one range or column and gives the value in the same place of another, e.g. XLOOKUP("Pear", prices![Name], prices![Price]); text is found ignoring case. Not found: if_not_found, else #N/A. match_mode: 0 the same value (the default), -1 or else the next smaller, 1 or else the next larger, 2 with wildcards (* any text, ? one character). search_mode: 1 from the first (the default), -1 from the last.',
  category: "lookup",
  example: "=XLOOKUP([@fruit], prices![name], prices![price])",
  minArgs: 3,
  maxArgs: 6,
  call: ([value, lookIn, results, notFound, matchMode, searchMode]) => {
    const v = single(value);
    if (isError(v)) return v;
    if (isError(lookIn)) return lookIn;
    if (isError(results)) return results;
    const mode = matchMode === void 0 || matchMode === null ? 0 : toNumber(matchMode);
    const search = searchMode === void 0 || searchMode === null ? 1 : toNumber(searchMode);
    if (isError(mode)) return mode;
    if (isError(search)) return search;
    if (![0, -1, 1, 2].includes(mode)) return new FormulaError("#VALUE!", `${mode} is not a match_mode: 0, -1, 1 or 2`);
    if (![1, -1, 2, -2].includes(search)) return new FormulaError("#VALUE!", `${search} is not a search_mode: 1 or -1`);
    const keys = isRange(lookIn) ? lookIn : [lookIn];
    const found = isRange(results) ? results : [results];
    if (keys.length !== found.length) {
      return new FormulaError("#VALUE!", `the ranges are not the same size (${keys.length} and ${found.length} cells)`);
    }
    const places = keys.map((_, at) => at);
    if (search < 0) places.reverse();
    const index = find(v, keys, places, mode);
    if (index < 0) {
      return notFound === void 0 || notFound === null ? new FormulaError("#N/A", `"${toText(v)}" is not in the range`) : single(notFound);
    }
    return found[index] ?? null;
  }
};

// table-plus/src/formulas/builtin/dateadd.ts
var dateadd_default = {
  name: "DATEADD",
  syntax: "DATEADD(date, amount, unit)",
  description: `The date plus an amount of a unit: "s", "min", "h", "d", "w", "m" (months) or "y" (or their names, "hours"). A negative amount goes back. Months and years keep the day or take the month's last.`,
  category: "date",
  example: '=DATEADD([@start], 7, "d")',
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

// table-plus/src/formulas/builtin/datedif.ts
var DAY4 = 864e5;
function partial(a, b, unit) {
  if (unit === "ym") return unitsBetween(a, b, "m") % 12;
  const months = unit === "md" ? unitsBetween(a, b, "m") : unitsBetween(a, b, "y") * 12;
  return Math.floor((b.ms - addUnits(a, months, "m").ms) / DAY4);
}
var datedif_default = {
  name: "DATEDIF",
  syntax: "DATEDIF(start, end, unit)",
  description: 'How many whole units lie from one date to another, in "s", "min", "h", "d", "w", "m" (months) or "y"; negative when the end is earlier. "md", "ym" and "yd" leave out the larger units: the days past the whole months, the months past the whole years, the days past the whole years. For days with a fraction, subtract the dates: end - start.',
  category: "date",
  example: '=DATEDIF([@born], TODAY(), "y")',
  minArgs: 3,
  maxArgs: 3,
  call: ([start, end, unit]) => {
    const a = toDate(start);
    const b = toDate(end);
    if (isError(a)) return a;
    if (isError(b)) return b;
    const u = single(unit);
    const name = typeof u === "string" ? u.trim().toLowerCase() : void 0;
    if (name === "md" || name === "ym" || name === "yd") {
      return b.ms < a.ms ? new FormulaError("#NUM!", `"${name}" needs the end after the start`) : partial(a, b, name);
    }
    const whole = toUnit(unit);
    return isError(whole) ? whole : unitsBetween(a, b, whole);
  }
};

// table-plus/src/formulas/builtin/year.ts
var year_default = {
  name: "YEAR",
  syntax: "YEAR(date)",
  description: "The year of a date.",
  category: "date",
  example: "=YEAR([@date])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date);
    return isError(d) ? d : partOf(d, "year");
  }
};

// table-plus/src/formulas/builtin/month.ts
var month_default = {
  name: "MONTH",
  syntax: "MONTH(date)",
  description: "The month of a date, 1 to 12.",
  category: "date",
  example: "=MONTH([@date])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date);
    return isError(d) ? d : partOf(d, "month");
  }
};

// table-plus/src/formulas/builtin/day.ts
var day_default = {
  name: "DAY",
  syntax: "DAY(date)",
  description: "The day of a date's month, 1 to 31.",
  category: "date",
  example: "=DAY([@date])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date);
    return isError(d) ? d : partOf(d, "day");
  }
};

// table-plus/src/formulas/builtin/hour.ts
var hour_default = {
  name: "HOUR",
  syntax: "HOUR(time)",
  description: "The hour of a time, or of a date's time, 0 to 23 (0 for a date without a time).",
  category: "date",
  example: "=HOUR([@at])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date);
    return isError(d) ? d : partOf(d, "hour");
  }
};

// table-plus/src/formulas/builtin/minute.ts
var minute_default = {
  name: "MINUTE",
  syntax: "MINUTE(time)",
  description: "The minute of a time, or of a date's time, 0 to 59.",
  category: "date",
  example: "=MINUTE([@at])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date);
    return isError(d) ? d : partOf(d, "minute");
  }
};

// table-plus/src/formulas/builtin/second.ts
var second_default = {
  name: "SECOND",
  syntax: "SECOND(time)",
  description: "The second of a time, or of a date's time, 0 to 59.",
  category: "date",
  example: "=SECOND([@at])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date);
    return isError(d) ? d : partOf(d, "second");
  }
};

// table-plus/src/formulas/builtin/weekday.ts
var weekday_default = {
  name: "WEEKDAY",
  syntax: "WEEKDAY(date, [type])",
  description: "The day of the week as a number: Sunday 1 to Saturday 7 (type 1, the default, and 17), Monday 1 to Sunday 7 (type 2 and 11), Monday 0 to Sunday 6 (type 3), or 1 from Tuesday (12), Wednesday (13), Thursday (14), Friday (15) or Saturday (16).",
  category: "date",
  example: "=WEEKDAY([@date], 2)",
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
    if (t === 3) return (day + 6) % 7;
    if (Number.isInteger(t) && t >= 11 && t <= 17) return (day - (t - 10) + 7) % 7 + 1;
    return new FormulaError("#NUM!", `${t} is not a type of WEEKDAY: 1, 2, 3 or 11 to 17`);
  }
};

// table-plus/src/formulas/builtin/row.ts
var row_default = {
  name: "ROW",
  syntax: "ROW()",
  description: "The row of the cell the formula is in, counted in the table as written: 1 is the first row under the header. =ROW() in every row of a column numbers the rows.",
  category: "lookup",
  example: "=ROW()",
  minArgs: 0,
  maxArgs: 0,
  call: (_args, { row }) => row
};

// table-plus/src/formulas/builtin/sumifs.ts
var sumifs_default = {
  name: "SUMIFS",
  syntax: "SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2, criteria2], \u2026)",
  description: 'Adds the cells of sum_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty).',
  category: "math",
  example: '=SUMIFS([amount], [status], "open", [due], "<"&TODAY())',
  minArgs: 3,
  call: ([values, ...conditions]) => {
    const cells = matchingCells(values, conditions);
    return isError(cells) ? cells : sum_default.call([cells]);
  }
};

// table-plus/src/formulas/builtin/countifs.ts
var countifs_default = {
  name: "COUNTIFS",
  syntax: "COUNTIFS(criteria_range1, criteria1, [criteria_range2, criteria2], \u2026)",
  description: 'How many places of the ranges have cells that meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty).',
  category: "math",
  example: '=COUNTIFS([status], "open", [qty], ">10")',
  minArgs: 2,
  call: (conditions) => {
    const places = matchingPlaces(conditions, void 0);
    return isError(places) ? places : places.length;
  }
};

// table-plus/src/formulas/builtin/averageifs.ts
var averageifs_default = {
  name: "AVERAGEIFS",
  syntax: "AVERAGEIFS(average_range, criteria_range1, criteria1, [criteria_range2, criteria2], \u2026)",
  description: 'The arithmetic mean of the cells of average_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: #DIV/0!.',
  category: "math",
  example: '=AVERAGEIFS([price], [fruit], "app*")',
  minArgs: 3,
  call: ([values, ...conditions]) => {
    const cells = matchingCells(values, conditions);
    return isError(cells) ? cells : average_default.call([cells]);
  }
};

// table-plus/src/formulas/builtin/maxifs.ts
var maxifs_default = {
  name: "MAXIFS",
  syntax: "MAXIFS(max_range, criteria_range1, criteria1, [criteria_range2, criteria2], \u2026)",
  description: 'The largest of the cells of max_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: 0.',
  category: "math",
  example: '=MAXIFS([score], [team], "red")',
  minArgs: 3,
  call: ([values, ...conditions]) => {
    const cells = matchingCells(values, conditions);
    return isError(cells) ? cells : max_default.call([cells]);
  }
};

// table-plus/src/formulas/builtin/minifs.ts
var minifs_default = {
  name: "MINIFS",
  syntax: "MINIFS(min_range, criteria_range1, criteria1, [criteria_range2, criteria2], \u2026)",
  description: 'The smallest of the cells of min_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: 0.',
  category: "math",
  example: '=MINIFS([price], [stock], ">0")',
  minArgs: 3,
  call: ([values, ...conditions]) => {
    const cells = matchingCells(values, conditions);
    return isError(cells) ? cells : min_default.call([cells]);
  }
};

// table-plus/src/formulas/builtin/sumproduct.ts
var sumproduct_default = {
  name: "SUMPRODUCT",
  syntax: "SUMPRODUCT(array1, [array2], \u2026)",
  description: "Multiplies the ranges' cells in the same places and adds the products; a cell that is not a number counts as 0.",
  category: "math",
  example: "=SUMPRODUCT([qty], [price])",
  minArgs: 1,
  call: (args) => {
    const error = firstError(args);
    if (error) return error;
    const arrays = args.map(cellsOf);
    const size = arrays[0].length;
    const other = arrays.find((cells) => cells.length !== size);
    if (other) return new FormulaError("#VALUE!", `the ranges are not the same size (${size} and ${other.length} cells)`);
    let total = 0;
    for (let at = 0; at < size; at++) {
      total += arrays.reduce((product, cells) => product * (numbers([[cells[at]]])[0] ?? 0), 1);
    }
    return total;
  }
};

// table-plus/src/formulas/builtin/median.ts
var median_default = {
  name: "MEDIAN",
  syntax: "MEDIAN(number1, [number2], \u2026)",
  description: "The middle of the numbers (or of the times) in order; of an even count, the mean of the two in the middle.",
  category: "math",
  example: "=MEDIAN([price])",
  minArgs: 1,
  call: (args) => withNumbers(
    args,
    (ns) => {
      if (!ns.length) return new FormulaError("#NUM!", "no numbers");
      const sorted = [...ns].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },
    true
  )
};

// table-plus/src/formulas/builtin/large.ts
var large_default = {
  name: "LARGE",
  syntax: "LARGE(array, k)",
  description: "The k-th largest of the numbers (or of the times): LARGE(A1:A9, 1) is the largest.",
  category: "math",
  example: "=LARGE([score], 2)",
  minArgs: 2,
  maxArgs: 2,
  call: ([array, k]) => {
    const at = toWhole(k);
    if (isError(at)) return at;
    return withNumbers(
      [array],
      (ns) => at >= 1 && at <= ns.length ? [...ns].sort((a, b) => b - a)[at - 1] : new FormulaError("#NUM!", `k is ${at}, not 1 to ${ns.length} (how many numbers there are)`),
      true
    );
  }
};

// table-plus/src/formulas/builtin/small.ts
var small_default = {
  name: "SMALL",
  syntax: "SMALL(array, k)",
  description: "The k-th smallest of the numbers (or of the times): SMALL(A1:A9, 1) is the smallest.",
  category: "math",
  example: "=SMALL([time], 1)",
  minArgs: 2,
  maxArgs: 2,
  call: ([array, k]) => {
    const at = toWhole(k);
    if (isError(at)) return at;
    return withNumbers(
      [array],
      (ns) => at >= 1 && at <= ns.length ? [...ns].sort((a, b) => a - b)[at - 1] : new FormulaError("#NUM!", `k is ${at}, not 1 to ${ns.length} (how many numbers there are)`),
      true
    );
  }
};

// table-plus/src/formulas/builtin/rank.ts
var rank_default = {
  name: "RANK",
  syntax: "RANK(number, ref, [order])",
  description: "The number's place among the numbers of ref: 1 for the largest (order 0, the default), or for the smallest (order 1); equal numbers share a place.",
  category: "math",
  example: "=RANK([@score], [score])",
  minArgs: 2,
  maxArgs: 3,
  call: ([number, ref, order2 = 0]) => {
    const n = toNumber(number);
    const ns = numbers([ref]);
    const ascending = toNumber(order2);
    if (isError(n)) return n;
    if (isError(ns)) return ns;
    if (isError(ascending)) return ascending;
    if (!ns.includes(n)) return new FormulaError("#N/A", `${formatNumber(n)} is not among the numbers ranked`);
    return 1 + ns.filter((x) => ascending ? x < n : x > n).length;
  }
};

// table-plus/src/formulas/builtin/stdev.ts
var stdev_default = {
  name: "STDEV",
  syntax: "STDEV(number1, [number2], \u2026)",
  description: "The standard deviation of the numbers as a sample (divided by their count less one); of times, a time.",
  category: "math",
  example: "=STDEV([score])",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => {
    if (ns.length < 2) return new FormulaError("#DIV/0!", "a standard deviation needs two numbers at least");
    const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
    return Math.sqrt(ns.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (ns.length - 1));
  }, true)
};

// table-plus/src/formulas/builtin/mod.ts
var mod_default = {
  name: "MOD",
  syntax: "MOD(number, divisor)",
  description: "The remainder after dividing the number by the divisor, with the divisor's sign. Of a time, a time: MOD([@end] - [@start], 1) is the length of a shift past midnight.",
  category: "math",
  example: "=MOD(ROW(), 2)",
  minArgs: 2,
  maxArgs: 2,
  call: ([number, divisor]) => {
    const n = toNumber(number);
    const d = toNumber(divisor);
    if (isError(n)) return n;
    if (isError(d)) return d;
    if (d === 0) return new FormulaError("#DIV/0!", "division by zero");
    if (Math.abs(n / d) >= 2 ** 53) return new FormulaError("#NUM!", "the number is too large for the divisor");
    const result = tidy(n - d * Math.floor(tidy(n / d)), n);
    return asTime(single(number)) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
  }
};

// table-plus/src/formulas/builtin/roundup.ts
var roundup_default = {
  name: "ROUNDUP",
  syntax: "ROUNDUP(number, [digits])",
  description: "Rounds away from zero to the given number of decimal places (default 0; negative: tens, hundreds\u2026).",
  category: "math",
  example: "=ROUNDUP([@hours], 0)",
  minArgs: 1,
  maxArgs: 2,
  call: ([number, digits = 0]) => {
    const n = toNumber(number);
    const d = toNumber(digits);
    if (isError(n)) return n;
    if (isError(d)) return d;
    const factor = 10 ** Math.trunc(d);
    return tidy(Math.sign(n) * Math.ceil(tidy(Math.abs(n) * factor)) / factor);
  }
};

// table-plus/src/formulas/builtin/rounddown.ts
var rounddown_default = {
  name: "ROUNDDOWN",
  syntax: "ROUNDDOWN(number, [digits])",
  description: "Rounds toward zero to the given number of decimal places (default 0; negative: tens, hundreds\u2026).",
  category: "math",
  example: "=ROUNDDOWN([@price] * 0.85, 2)",
  minArgs: 1,
  maxArgs: 2,
  call: ([number, digits = 0]) => {
    const n = toNumber(number);
    const d = toNumber(digits);
    if (isError(n)) return n;
    if (isError(d)) return d;
    const factor = 10 ** Math.trunc(d);
    return tidy(Math.sign(n) * Math.floor(tidy(Math.abs(n) * factor)) / factor);
  }
};

// table-plus/src/formulas/builtin/ceiling.ts
var ceiling_default = {
  name: "CEILING",
  syntax: "CEILING(number, [significance])",
  description: 'Rounds up to a multiple of the significance (default 1). Of a time, a time: CEILING("9:07", "0:15") is 09:15.',
  category: "math",
  example: "=CEILING([@price], 0.05)",
  minArgs: 1,
  maxArgs: 2,
  call: ([number, significance = 1]) => {
    const n = toNumber(number);
    const s = toNumber(significance);
    if (isError(n)) return n;
    if (isError(s)) return s;
    const step = Math.abs(s);
    const result = step === 0 ? 0 : tidy(Math.ceil(tidy(n / step)) * step);
    return asTime(single(number)) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
  }
};

// table-plus/src/formulas/builtin/floor.ts
var floor_default = {
  name: "FLOOR",
  syntax: "FLOOR(number, [significance])",
  description: 'Rounds down to a multiple of the significance (default 1). Of a time, a time: FLOOR("9:07", "0:15") is 09:00.',
  category: "math",
  example: '=FLOOR([@start], "0:15")',
  minArgs: 1,
  maxArgs: 2,
  call: ([number, significance = 1]) => {
    const n = toNumber(number);
    const s = toNumber(significance);
    if (isError(n)) return n;
    if (isError(s)) return s;
    const step = Math.abs(s);
    const result = step === 0 ? 0 : tidy(Math.floor(tidy(n / step)) * step);
    return asTime(single(number)) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
  }
};

// table-plus/src/formulas/builtin/mround.ts
var mround_default = {
  name: "MROUND",
  syntax: "MROUND(number, multiple)",
  description: 'Rounds to the nearest multiple, halves away from zero. Of a time, a time: MROUND("9:08", "0:15") is 09:15.',
  category: "math",
  example: "=MROUND([@price], 0.05)",
  minArgs: 2,
  maxArgs: 2,
  call: ([number, multiple]) => {
    const n = toNumber(number);
    const m = toNumber(multiple);
    if (isError(n)) return n;
    if (isError(m)) return m;
    if (n * m < 0) return new FormulaError("#NUM!", "the number and the multiple have different signs");
    const q = m === 0 ? 0 : tidy(n / m);
    const result = tidy(Math.sign(q) * Math.round(Math.abs(q)) * m);
    return asTime(single(number)) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
  }
};

// table-plus/src/formulas/builtin/len.ts
var len_default = {
  name: "LEN",
  syntax: "LEN(text)",
  description: "How many characters the text has.",
  category: "text",
  example: "=LEN([@code])",
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text);
    return isError(t) ? t : t.length;
  }
};

// table-plus/src/formulas/builtin/mid.ts
var mid_default = {
  name: "MID",
  syntax: "MID(text, start, count)",
  description: "The given count of characters of the text, from the start (1 is the first character).",
  category: "text",
  example: "=MID([@code], 4, 2)",
  minArgs: 3,
  maxArgs: 3,
  call: ([text, start, count]) => {
    const t = toText(text);
    const s = toWhole(start);
    const c = toWhole(count);
    if (isError(t)) return t;
    if (isError(s)) return s;
    if (isError(c)) return c;
    if (s < 1) return new FormulaError("#VALUE!", `the start is ${s}: the first character is 1`);
    if (c < 0) return new FormulaError("#VALUE!", "the count is less than 0");
    return t.substr(s - 1, c);
  }
};

// table-plus/src/formulas/builtin/upper.ts
var upper_default = {
  name: "UPPER",
  syntax: "UPPER(text)",
  description: "The text in capital letters.",
  category: "text",
  example: "=UPPER([@code])",
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text);
    return isError(t) ? t : t.toUpperCase();
  }
};

// table-plus/src/formulas/builtin/lower.ts
var lower_default = {
  name: "LOWER",
  syntax: "LOWER(text)",
  description: "The text in small letters.",
  category: "text",
  example: "=LOWER([@email])",
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text);
    return isError(t) ? t : t.toLowerCase();
  }
};

// table-plus/src/formulas/builtin/proper.ts
var proper_default = {
  name: "PROPER",
  syntax: "PROPER(text)",
  description: "The text with each word's first letter capital and the others small.",
  category: "text",
  example: "=PROPER([@name])",
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text);
    return isError(t) ? t : t.replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }
};

// table-plus/src/formulas/builtin/trim.ts
var trim_default = {
  name: "TRIM",
  syntax: "TRIM(text)",
  description: "The text without spaces at its start and end, and with one space where there were several.",
  category: "text",
  example: "=TRIM([@name])",
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text);
    return isError(t) ? t : t.replace(/^ +| +$/g, "").replace(/ {2,}/g, " ");
  }
};

// table-plus/src/formulas/builtin/substitute.ts
var substitute_default = {
  name: "SUBSTITUTE",
  syntax: "SUBSTITUTE(text, old_text, new_text, [instance])",
  description: "The text with old_text (matching case) replaced by new_text: everywhere, or only its instance-th occurrence.",
  category: "text",
  example: '=SUBSTITUTE([@phone], " ", "")',
  minArgs: 3,
  maxArgs: 4,
  call: ([text, oldText, newText, instance]) => {
    const t = toText(text);
    const from = toText(oldText);
    const to = toText(newText);
    if (isError(t)) return t;
    if (isError(from)) return from;
    if (isError(to)) return to;
    if (instance === void 0 || instance === null) return from === "" ? t : t.split(from).join(to);
    const n = toWhole(instance);
    if (isError(n)) return n;
    if (n < 1) return new FormulaError("#VALUE!", `the instance is ${n}: the first is 1`);
    if (from === "") return t;
    let at = -1;
    for (let i = 0; i < n; i++) {
      at = t.indexOf(from, at + (i ? from.length : 1));
      if (at < 0) return t;
    }
    return t.slice(0, at) + to + t.slice(at + from.length);
  }
};

// table-plus/src/formulas/builtin/search.ts
var search_default = {
  name: "SEARCH",
  syntax: "SEARCH(find_text, within_text, [start])",
  description: "Where find_text first is in within_text, from the start (default 1, the first character), ignoring case; * any text, ? one character, ~ before either for itself. Not found: #VALUE!.",
  category: "text",
  example: '=SEARCH("-", [@code])',
  minArgs: 2,
  maxArgs: 3,
  call: ([find2, within, start = 1]) => {
    const f = toText(find2);
    const w = toText(within);
    const s = toWhole(start);
    if (isError(f)) return f;
    if (isError(w)) return w;
    if (isError(s)) return s;
    if (s < 1 || s > w.length + 1) return new FormulaError("#VALUE!", `the start is ${s}: the text has ${w.length} characters`);
    const m = wildcardRegExp(f, false).exec(w.slice(s - 1));
    return m ? s + m.index : new FormulaError("#VALUE!", `"${f}" is not in "${w}"`);
  }
};

// table-plus/src/formulas/builtin/textjoin.ts
var textjoin_default = {
  name: "TEXTJOIN",
  syntax: "TEXTJOIN(delimiter, ignore_empty, text1, [text2], \u2026)",
  description: 'Joins the values (ranges too) into one text with the delimiter between them; with ignore_empty TRUE, empty ones are left out: TEXTJOIN(", ", TRUE, [name]).',
  category: "text",
  example: '=TEXTJOIN(", ", TRUE, [tag])',
  minArgs: 3,
  call: ([delimiter, ignoreEmpty, ...texts2]) => {
    const error = firstError(texts2);
    if (error) return error;
    const d = toText(delimiter);
    const ignore = toBoolean(ignoreEmpty);
    if (isError(d)) return d;
    if (isError(ignore)) return ignore;
    return flatten(texts2).map((v) => toText(v)).filter((t) => !ignore || t !== "").join(d);
  }
};

// table-plus/src/formulas/builtin/isnumber.ts
var isnumber_default = {
  name: "ISNUMBER",
  syntax: "ISNUMBER(value)",
  description: "TRUE if the value is a number, a time or text that reads as a number (12.5, 12,99 \u20AC, 15 %), as COUNT counts them; FALSE otherwise.",
  category: "logic",
  example: '=IF(ISNUMBER([@qty]), [@qty] * [@price], "")',
  minArgs: 1,
  maxArgs: 1,
  call: ([value]) => {
    const v = single(value);
    if (v === null || isError(v) || typeof v === "boolean" || typeof v === "string" && v.trim() === "") return false;
    return !isError(toNumber(v));
  }
};

// table-plus/src/formulas/builtin/networkdays.ts
var isWorkday = (day) => weekdayOf(day) !== 0 && weekdayOf(day) !== 6;
var networkdays_default = {
  name: "NETWORKDAYS",
  syntax: "NETWORKDAYS(start, end, [holidays])",
  description: "How many working days (Monday to Friday) there are from the start to the end, both counted, without the holidays (dates, a range of them); negative when the end is earlier.",
  category: "date",
  example: "=NETWORKDAYS([@start], [@end], holidays![date])",
  minArgs: 2,
  maxArgs: 3,
  call: ([start, end, holidays]) => {
    const a = toDate(start);
    const b = toDate(end);
    const off = holidayDays(holidays);
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (isError(off)) return off;
    const from = Math.min(dayNumber(a), dayNumber(b));
    const to = Math.max(dayNumber(a), dayNumber(b));
    const weeks = Math.floor((to - from + 1) / 7);
    let count = weeks * 5;
    for (let day = from + weeks * 7; day <= to; day++) if (isWorkday(day)) count++;
    for (const day of off) if (day >= from && day <= to && isWorkday(day)) count--;
    return dayNumber(a) <= dayNumber(b) ? count : -count;
  }
};

// table-plus/src/formulas/builtin/workday.ts
var MOST_DAYS = 27e5;
var workday_default = {
  name: "WORKDAY",
  syntax: "WORKDAY(start, days, [holidays])",
  description: "The date the given count of working days (Monday to Friday) after the start, leaving out the holidays (dates, a range of them); a negative count goes back.",
  category: "date",
  example: "=WORKDAY([@ordered], 5, holidays![date])",
  minArgs: 2,
  maxArgs: 3,
  call: ([start, days, holidays]) => {
    const a = toDate(start);
    const n = toWhole(days);
    const off = holidayDays(holidays);
    if (isError(a)) return a;
    if (isError(n)) return n;
    if (isError(off)) return off;
    if (Math.abs(n) > MOST_DAYS) return new FormulaError("#NUM!", "the date is not in the years 0 to 9999");
    const step = Math.sign(n);
    let day = dayNumber(a);
    for (let left = Math.abs(n); left > 0; ) {
      day += step;
      if (weekdayOf(day) !== 0 && weekdayOf(day) !== 6 && !off.has(day)) left--;
    }
    return dayDate(day);
  }
};

// table-plus/src/formulas/builtin/isoweeknum.ts
var isoweeknum_default = {
  name: "ISOWEEKNUM",
  syntax: "ISOWEEKNUM(date)",
  description: "The week of the year by ISO 8601, 1 to 53: weeks start on Monday, and week 1 is the one with the year's first Thursday.",
  category: "date",
  example: "=ISOWEEKNUM([@date])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date);
    if (isError(d)) return d;
    const day = dayNumber(d);
    const thursday = day + 3 - (weekdayOf(day) + 6) % 7;
    const yearStart = new Date(thursday * 864e5);
    yearStart.setUTCMonth(0, 1);
    return Math.floor((thursday - Math.floor(yearStart.getTime() / 864e5)) / 7) + 1;
  }
};

// table-plus/src/formulas/builtin/eomonth.ts
var eomonth_default = {
  name: "EOMONTH",
  syntax: "EOMONTH(start, months)",
  description: "The last day of the month the given count of months after the start's (0: its own month; negative: before).",
  category: "date",
  example: "=EOMONTH([@invoiced], 1)",
  minArgs: 2,
  maxArgs: 2,
  call: ([start, months]) => {
    const d = toDate(start);
    const n = toWhole(months);
    if (isError(d)) return d;
    if (isError(n)) return n;
    const first = new Date(dayNumber(d) * 864e5);
    first.setUTCDate(1);
    const moved2 = new Date(addUnits({ ms: first.getTime(), time: false }, n + 1, "m").ms);
    moved2.setUTCDate(0);
    return formatDate({ ms: moved2.getTime(), time: false });
  }
};

// table-plus/src/formulas/builtin/index.ts
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
  date_default2,
  time_default2,
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
  xlookup_default,
  row_default,
  sumifs_default,
  countifs_default,
  averageifs_default,
  maxifs_default,
  minifs_default,
  sumproduct_default,
  median_default,
  large_default,
  small_default,
  rank_default,
  stdev_default,
  mod_default,
  roundup_default,
  rounddown_default,
  ceiling_default,
  floor_default,
  mround_default,
  len_default,
  mid_default,
  upper_default,
  lower_default,
  proper_default,
  trim_default,
  substitute_default,
  search_default,
  textjoin_default,
  isnumber_default,
  networkdays_default,
  workday_default,
  isoweeknum_default,
  eomonth_default
];
var BUILT_IN_FUNCTIONS = Object.fromEntries(ALL.map((f) => [f.name, f]));

// table-plus/src/formulas/registry.ts
var custom3 = /* @__PURE__ */ new Map();
function functionNamed(name) {
  return custom3.get(name) ?? BUILT_IN_FUNCTIONS[name];
}
function functionNames() {
  return Array.from(/* @__PURE__ */ new Set([...Object.keys(BUILT_IN_FUNCTIONS), ...custom3.keys()]));
}
function isCustomFunction(name) {
  return custom3.has(name);
}
function isBuiltInFunction(name) {
  return name in BUILT_IN_FUNCTIONS;
}
var anew3 = false;
function defineCustomFunctions(functions) {
  custom3 = new Map([...anew3 ? [] : custom3, ...functions.map((f) => [f.name, f])]);
  anew3 = false;
}
function customFunctionsAnew() {
  anew3 = true;
}

// table-plus/src/formulas/tokens.ts
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
    const fixedCell = /^\$?[A-Za-z]{1,3}\$?[1-9]\d*(?![A-Za-z0-9_.$])/.exec(formula.slice(i));
    if (fixedCell && fixedCell[0].includes("$")) {
      tokens.push({ kind: "name", text: fixedCell[0], from: i, to: i + fixedCell[0].length });
      i += fixedCell[0].length;
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

// table-plus/src/formulas/references.ts
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
function cellName(row, column, fixed) {
  return `${fixed?.column ? "$" : ""}${columnLetters(column)}${fixed?.row ? "$" : ""}${row + 1}`;
}
function areaOf(start, end = start) {
  const area = {
    top: Math.min(start.row, end.row),
    left: Math.min(start.column, end.column),
    bottom: Math.max(start.row, end.row),
    right: Math.max(start.column, end.column)
  };
  const fixed = {
    left: (start.column <= end.column ? start : end).fixedColumn,
    top: (start.row <= end.row ? start : end).fixedRow,
    right: (start.column <= end.column ? end : start).fixedColumn,
    bottom: (start.row <= end.row ? end : start).fixedRow
  };
  return Object.values(fixed).some(Boolean) ? { area, fixed } : { area };
}
function areaText(area, fixed) {
  const start = cellName(area.top, area.left, fixed && { column: fixed.left, row: fixed.top });
  const end = cellName(area.bottom, area.right, fixed && { column: fixed.right, row: fixed.bottom });
  return start === end ? start : `${start}:${end}`;
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
var CELL_REFERENCE_RE = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)$/;
function parseCellName(text) {
  const m = CELL_REFERENCE_RE.exec(text);
  return m ? { row: Number(m[4]) - 1, column: columnIndex(m[2]), fixedColumn: m[1] === "$", fixedRow: m[3] === "$" } : void 0;
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
    result.push({ kind: "area", ...areaOf(start, end), from: token.from, to: end ? endToken.to : token.to, ...table });
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
function referredPages(table) {
  const pages = /* @__PURE__ */ new Set();
  forFormulas(table, (formula) => {
    for (const page of formulaPages(formula)) pages.add(page);
  });
  return pages;
}
function formulaPages(formula) {
  return [
    ...references(formula).flatMap((ref) => ref.table?.page ? [ref.table.page] : []),
    ...namedReferences(formula).flatMap((ref) => ref.page ? [ref.page] : [])
  ];
}
function callsCustomFunctions(table) {
  let calls = false;
  forFormulas(table, (formula) => {
    const { tokens } = tokenize(formula);
    tokens.forEach((token, i) => {
      const next = tokens[i + 1];
      if (token.kind !== "name" || next?.kind !== "op" || next.text !== "(") return;
      const name = token.text.toUpperCase();
      if (isCustomFunction(name) || !isBuiltInFunction(name)) calls = true;
    });
  });
  return calls;
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

// table-plus/src/formulas/parser.ts
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
          args.push(this.peekOp(",", ";") ? { kind: "literal", value: null } : this.comparison());
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
    if (!this.peekOp(":")) return { kind: "area", ...areaOf(start), range: false };
    this.at++;
    const endToken = this.tokens[this.at++];
    const end = endToken?.kind === "name" ? parseCellName(endToken.text) : void 0;
    if (!end) throw new FormulaError("#ERROR!", `${text}: must be followed by a cell, as in ${text}:B3`);
    return { kind: "area", ...areaOf(start, end), range: true };
  }
};
var parsed2 = /* @__PURE__ */ new Map();
function parse(formula) {
  let result = parsed2.get(formula);
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
  if (parsed2.size > 500) parsed2.clear();
  parsed2.set(formula, result);
  return result;
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

// table-plus/src/formulas/autofix.ts
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

// table-plus/src/formulas/evaluate.ts
var DECIMAL_COMMA_RE = /\d,\d/;
var Book = class {
  constructor(source) {
    this.source = source;
  }
  source;
  sheets = /* @__PURE__ */ new Map();
  // The sheets by table, whether reached by the table's name or a named cell's
  tableSheets = /* @__PURE__ */ new Map();
  /** Whether a formula refers to a page formulas may not read: it keeps its stored result */
  keepsResult(formula) {
    const unread = this.source?.unread;
    return !!unread && formulaPages(formula).some(unread);
  }
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
    const key2 = `${page ?? ""}\0${ref.name.toLowerCase()}`;
    let sheet = this.sheets.get(key2);
    if (!sheet) {
      const table = this.source?.(ref.name, page);
      if (!table) return new FormulaError("#REF!", `there is no table named ${ref.name}${page === void 0 ? " on this page" : ` on ${page}`}`);
      sheet = this.sheetOf(table, page);
      this.sheets.set(key2, sheet);
    }
    return sheet;
  }
};
function totalRows(table) {
  const headers = table.rows[0]?.cells ?? [];
  const totals = /* @__PURE__ */ new Set();
  table.rows.slice(1).forEach((row, r) => {
    row.cells.forEach((cell, column) => {
      const stored = formulaOf(cell);
      const tree = stored && parse(stored.formula);
      if (!tree || isError(tree)) return;
      if (Array.from(wholeColumnNames(tree, /* @__PURE__ */ new Set())).some((name) => referencedColumn(headers, name) === column)) totals.add(r);
    });
  });
  return totals;
}
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
      const text = unescapeCell(withoutTags(cell)).trim();
      if (text === "") return null;
      return asNumber(text) ?? parseClock(text) ?? text;
    }
    return this.result(row, column, stored.formula);
  }
  /** The result of the formula in a cell */
  result(row, column, formula) {
    const key2 = `${row},${column}`;
    const known2 = this.results.get(key2);
    if (known2 !== void 0) return known2;
    if (this.evaluating.has(key2)) {
      return new FormulaError("#CYCLE!", `${cellName(row, column)} depends on its own result`);
    }
    if (this.book.keepsResult(formula)) {
      const shown = unescapeCell(formulaOf(this.body[row]?.[column] ?? "")?.value ?? "").trim();
      const code = shown === "" ? "#REF!" : ERROR_CODES.find((c) => c === shown);
      const kept = code ? new FormulaError(code, "the other page is not read (are links to other pages turned off?)") : asNumber(shown) ?? parseClock(shown) ?? shown;
      this.results.set(key2, kept);
      return kept;
    }
    this.evaluating.add(key2);
    let result;
    try {
      const tree = parse(formula);
      result = isError(tree) ? tree : single(this.evaluate(tree, row, column));
      if (typeof result === "number" && !Number.isFinite(result) || result instanceof TimeValue && !Number.isFinite(result.seconds)) {
        result = new FormulaError("#NUM!", "the result is not a finite number");
      }
    } finally {
      this.evaluating.delete(key2);
    }
    this.results.set(key2, result);
    return result;
  }
  /** The text a formula cell shows for its result */
  text(row, column, formula) {
    const result = this.result(row, column, formula);
    if (isError(result)) return result.code;
    const text = toText(result);
    return typeof result === "number" && this.decimalComma ? text.replace(".", ",") : text;
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
  /** The total rows (see totalRows), once */
  totalRows() {
    this.totals ??= totalRows(this.table);
    return this.totals;
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
        const f = functionNamed(node.name);
        if (!f) return new FormulaError("#NAME?", `there is no function ${node.name}`);
        if (node.args.length < f.minArgs || f.maxArgs !== void 0 && node.args.length > f.maxArgs) {
          return new FormulaError("#VALUE!", `wrong number of arguments: ${f.syntax}`);
        }
        return f.call(
          node.args.map((arg) => {
            const value = this.evaluate(arg, row, column);
            const reference = arg.kind === "area" || arg.kind === "column" && arg.thisRow;
            return reference && !isRange(value) && !isError(value) ? [value] : value;
          }),
          // Where it is calculated, as A1 counts (row: the body's, from 1)
          { row: row + 1, column: column + 1 }
        );
      }
      case "unary":
        return cellByCell([this.evaluate(node.arg, row, column)], ([arg]) => this.unary(node.op, arg));
      case "binary": {
        const operands = [this.evaluate(node.left, row, column), this.evaluate(node.right, row, column)];
        return cellByCell(operands, ([left, right]) => this.binary(node.op, left, right));
      }
    }
  }
  unary(op, arg) {
    const time = asTime(arg);
    if (time && op !== "%") return op === "-" ? new TimeValue(-time.seconds) : time;
    const n = toNumber(arg);
    if (isError(n)) return n;
    return op === "-" ? -n : op === "%" ? n / 100 : n;
  }
  binary(op, left, right) {
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
function cellByCell(operands, f) {
  const ranges = operands.filter((v) => isRange(v) && v.length !== 1);
  if (ranges.length === 0) return f(operands.map(single));
  const size = ranges[0].length;
  const other = ranges.find((r) => r.length !== size);
  if (other) return new FormulaError("#VALUE!", `the ranges are not the same size (${size} and ${other.length} cells)`);
  return Array.from({ length: size }, (_, at) => f(operands.map((v) => isRange(v) && v.length !== 1 ? v[at] : single(v))));
}
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
function recalculate(table, tables) {
  if (!hasFormulas(table)) return table;
  const book = new Book(tables);
  const sheet = new Sheet(table, book);
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      if (!stored || book.keepsResult(stored.formula) && stored.value.trim() !== "") return;
      const updated = keepTags(formulaCell(sheet.text(r - 1, c, stored.formula), stored.formula), cell);
      if (updated !== cell) result = setCell(result, r, c, updated);
    });
  });
  return result;
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

// table-plus/src/formulas/edits.ts
function calculatedFormula(table, column, except = /* @__PURE__ */ new Set()) {
  let formula;
  for (let r = 1; r < table.rows.length; r++) {
    if (except.has(r) || isTotalRow(table.rows[r].cells)) continue;
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
function withCalculatedCells(table, row, added = /* @__PURE__ */ new Set([row])) {
  let result = table;
  table.rows[row]?.cells.forEach((cell, column) => {
    if (cell.trim() !== "") return;
    const formula = calculatedFormula(table, column, added);
    if (formula) result = setCell(result, row, column, formulaCell("", formula));
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
    const added = /* @__PURE__ */ new Set();
    for (let r = 1; r < after.rows.length; r++) if (!kept.has(r)) added.add(r);
    for (const r of added) table = withCalculatedCells(table, r, added);
  }
  return recalculate(shiftReferences(before, table, edit.rowMap, edit.columnMap), edit.tables);
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
    const start = rows && cols && cellName(rows[0], cols[0], ref.fixed && { column: ref.fixed.left, row: ref.fixed.top });
    const end = rows && cols && cellName(rows[1], cols[1], ref.fixed && { column: ref.fixed.right, row: ref.fixed.bottom });
    const text = start && end ? written.includes(":") ? `${start}:${end}` : start : REF_ERROR;
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
      if (formula !== stored.formula) result = setCell(result, r, c, keepTags(formulaCell(stored.value, formula), cell));
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
function filledFormula(formula, rows, columns, size) {
  let result = formula;
  for (const ref of references(formula).reverse()) {
    if (ref.kind !== "area") continue;
    const { area, fixed } = ref;
    const moved2 = {
      top: fixed?.top ? area.top : area.top + rows,
      left: fixed?.left ? area.left : area.left + columns,
      bottom: fixed?.bottom ? area.bottom : area.bottom + rows,
      right: fixed?.right ? area.right : area.right + columns
    };
    const off = Math.min(moved2.top, moved2.left) < 0 || !ref.table && (moved2.bottom >= size.rows || moved2.right >= size.columns);
    const written = formula.slice(ref.from, ref.to);
    const start = cellName(moved2.top, moved2.left, fixed && { column: fixed.left, row: fixed.top });
    const end = cellName(moved2.bottom, moved2.right, fixed && { column: fixed.right, row: fixed.bottom });
    const text = off ? REF_ERROR : written.includes(":") ? `${start}:${end}` : start;
    result = result.slice(0, ref.from) + text + result.slice(ref.to);
  }
  return result;
}

// table-plus/src/formulas/help.ts
var REFERENCE_HELP = {
  syntax: "A1 \xB7 A1:B3 \xB7 $A$1 \xB7 [Column] \xB7 [@Column] \xB7 table!A1 \xB7 table![Column] \xB7 cell_name",
  description: "A cell (A1 is the first row under the header), a range, a cell with its column or row kept where it is when the formula is filled into other cells (F4 cycles them), a whole column by its name, that column in this row, a cell, range or column of another table on the page by its name, or a named cell. Click or drag in the table to insert one, click a header for its column."
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
  if (/^[A-Za-z0-9_.["#($]/.test(after)) return void 0;
  return BEFORE_OPERAND.has(before[before.length - 1] ?? "") ? { from: start, to: end } : void 0;
}
function needsOperator(formula, at) {
  const before = formula.slice(0, at).trimEnd();
  return before !== "" && !BEFORE_OPERAND.has(before[before.length - 1]);
}
function functionChoices(text, start, end) {
  const typed = nameTyped(text, start, end);
  if (!typed) return void 0;
  const prefix = text.slice(typed.from, typed.to).toUpperCase();
  const names = functionNames().filter((name) => name.startsWith(prefix)).sort((a, b) => Number(b === prefix) - Number(a === prefix) || a.localeCompare(b));
  return names.length ? { ...typed, names } : void 0;
}
function nameTyped(text, start, end) {
  if (start !== end || !text.trimStart().startsWith("=")) return void 0;
  const before = text.slice(0, start);
  const typing = /([A-Za-z][A-Za-z0-9_.]*)$/.exec(before)?.[1];
  if (!typing || CELL_RE.test(typing) || text[start] === "(" || /[A-Za-z0-9_.$]/.test(text[start] ?? "")) return void 0;
  if (before[start - typing.length - 1] === "$") return void 0;
  if (tokenize(before).error) return void 0;
  return { from: start - typing.length, to: start };
}
function formulaHelp(text, caret) {
  if (!text.trimStart().startsWith("=")) return void 0;
  const { tokens } = tokenize(text.slice(0, caret));
  const open = [];
  tokens.forEach((token, i) => {
    if (token.kind !== "op") return;
    if (token.text === "(") {
      const previous = tokens[i - 1];
      open.push({ name: previous?.kind === "name" ? previous.text.toUpperCase() : void 0, argument: 0 });
    } else if (token.text === ")") open.pop();
    else if ((token.text === "," || token.text === ";") && open.length) open[open.length - 1].argument++;
  });
  for (let i = open.length - 1; i >= 0; i--) {
    const call2 = open[i];
    const f = call2.name ? functionNamed(call2.name) : void 0;
    if (!f) continue;
    const argument = i === open.length - 1 ? argumentSpan(f.syntax, call2.argument) : void 0;
    return { syntax: f.syntax, description: f.description, ...argument ? { argument } : {} };
  }
  return REFERENCE_HELP;
}
function argumentSpan(syntax, index) {
  const open = syntax.indexOf("(");
  const close = syntax.lastIndexOf(")");
  if (open < 0 || close < open) return void 0;
  const args = [];
  let from = open + 1;
  let depth = 0;
  for (let i = open + 1; i <= close; i++) {
    const ch = syntax[i];
    if (ch === "[" || ch === "(") depth++;
    else if ((ch === "]" || ch === ")") && i < close) depth--;
    if (ch === "," && depth === 0 || i === close) {
      const part = syntax.slice(from, i);
      const lead = part.length - part.trimStart().length;
      const span = { from: from + lead, to: from + part.trimEnd().length };
      if (span.to > span.from) args.push(span);
      from = i + 1;
    }
  }
  const repeats = args.length > 0 && syntax.slice(args[args.length - 1].from, args[args.length - 1].to) === "\u2026";
  if (index < args.length && !(repeats && index === args.length - 1)) return args[index];
  return repeats ? args[Math.max(0, args.length - 2)] : void 0;
}
function findFunctions(query, category) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const name = words.join("");
  const rank = (f) => {
    const lower = f.name.toLowerCase();
    return lower.startsWith(name) ? 0 : lower.includes(name) ? 1 : 2;
  };
  return functionNames().map((n) => functionNamed(n)).filter((f) => category === void 0 || (f.category ?? "custom") === category).filter((f) => {
    const text = `${f.name} ${f.description}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
function cycleFixed(formula, caret) {
  if (!formula.trimStart().startsWith("=")) return void 0;
  const ref = references(formula).find((r) => r.kind === "area" && r.from <= caret && caret <= r.to);
  if (!ref || ref.kind !== "area") return void 0;
  const now2 = ref.fixed;
  const [column, row] = !now2?.left && !now2?.top ? [true, true] : now2.left && now2.top ? [false, true] : !now2.left && now2.top ? [true, false] : [false, false];
  const fixed = { column, row };
  const written = formula.slice(ref.from, ref.to);
  const { area } = ref;
  const start = cellName(area.top, area.left, fixed);
  const text = written.includes(":") ? `${start}:${cellName(area.bottom, area.right, fixed)}` : start;
  return { from: ref.from, to: ref.to, text };
}

// table-plus/src/formulas/function.ts
var FUNCTION_CATEGORIES = {
  math: "Math",
  logic: "Logic",
  text: "Text",
  date: "Date & time",
  lookup: "Lookup & table"
};

// table-plus/src/excel/xlsx.ts
var FORMAT_STYLES = ["date", "dateTime", "dateTimeSeconds", "time", "timeSeconds", "percent", "percent1", "percent2"];
var FORMAT_CODES = {
  date: { id: 164, code: "yyyy\\-mm\\-dd" },
  dateTime: { id: 165, code: "yyyy\\-mm\\-dd hh:mm" },
  dateTimeSeconds: { id: 166, code: "yyyy\\-mm\\-dd hh:mm:ss" },
  time: { id: 167, code: "[h]:mm" },
  timeSeconds: { id: 168, code: "[h]:mm:ss" },
  percent: { id: 9 },
  percent1: { id: 169, code: "0.0%" },
  percent2: { id: 10 }
};
function xmlText(text) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function sheetName(name) {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "_").replace(/^'+|'+$/g, "").trim().slice(0, 31);
  return cleaned.toLowerCase() === "history" ? "History_" : cleaned || "Table";
}
function cellXml(ref, cell, style) {
  const { value, formula } = cell;
  const format = value.kind === "number" && value.format ? FORMAT_STYLES.indexOf(value.format) + 2 : void 0;
  const s = style ?? format;
  const sAttr = s === void 0 ? "" : ` s="${s}"`;
  if (formula) {
    const f = formula.array ? `<f t="array" ref="${ref}">${xmlText(formula.text)}</f>` : `<f>${xmlText(formula.text)}</f>`;
    switch (value.kind) {
      case "number":
        return `<c r="${ref}"${sAttr}>${f}<v>${value.value}</v></c>`;
      case "boolean":
        return `<c r="${ref}"${sAttr} t="b">${f}<v>${value.value ? 1 : 0}</v></c>`;
      case "error":
        return `<c r="${ref}"${sAttr} t="e">${f}<v>${xmlText(value.value)}</v></c>`;
      case "empty":
        return `<c r="${ref}"${sAttr} t="str">${f}<v></v></c>`;
      case "text":
        return `<c r="${ref}"${sAttr} t="str">${f}<v>${xmlText(value.value)}</v></c>`;
    }
  }
  switch (value.kind) {
    case "empty":
      return "";
    case "number":
      return `<c r="${ref}"${sAttr}><v>${value.value}</v></c>`;
    case "boolean":
      return `<c r="${ref}"${sAttr} t="b"><v>${value.value ? 1 : 0}</v></c>`;
    case "error":
      return `<c r="${ref}"${sAttr} t="e"><v>${xmlText(value.value)}</v></c>`;
    case "text":
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlText(value.value)}</t></is></c>`;
  }
}
function columnWidth(texts2) {
  const longest = texts2.reduce((n, t) => Math.max(n, t.length), 0);
  return Math.min(60, Math.max(8, longest + 2));
}
function sheetXml(sheet) {
  const cols = (sheet.widths ?? []).map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("");
  const header = `<row r="1">${sheet.header.map((name, c) => cellXml(`${columnLetters(c)}1`, { value: name === "" ? { kind: "empty" } : { kind: "text", value: name } }, 1)).join("")}</row>`;
  const rows = sheet.rows.map((cells, r) => `<row r="${r + 2}">${cells.map((cell, c) => cellXml(`${columnLetters(c)}${r + 2}`, cell)).join("")}</row>`).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>' + (cols ? `<cols>${cols}</cols>` : "") + `<sheetData>${header}${rows}</sheetData></worksheet>`;
}
function stylesXml() {
  const custom4 = FORMAT_STYLES.map((f) => FORMAT_CODES[f]).filter((f) => f.code);
  const numFmts = custom4.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${xmlText(f.code)}"/>`).join("");
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    ...FORMAT_STYLES.map((f) => `<xf numFmtId="${FORMAT_CODES[f].id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`)
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${custom4.length}">${numFmts}</numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
var XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
function xlsxParts(sheet) {
  return [
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    ],
    [
      "_rels/.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    ],
    [
      "xl/workbook.xml",
      `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlText(sheetName(sheet.name))}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    ],
    ["xl/styles.xml", stylesXml()],
    ["xl/worksheets/sheet1.xml", sheetXml(sheet)]
  ];
}
var crcTable;
function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 4294967295;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function zip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const DOS_DATE = 0 << 9 | 1 << 5 | 1;
  for (const [name, data] of files) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 67324752, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 2048, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 33639248, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 2048, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, DOS_DATE, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 101010256, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
function xlsxFile(sheet) {
  const encoder = new TextEncoder();
  return zip(xlsxParts(sheet).map(([name, text]) => [name, encoder.encode(text)]));
}

// table-plus/src/excel/values.ts
var DAY5 = 864e5;
var EXCEL_LEAP_BUG = -25508;
var EPOCH = 25569;
function serialOf(ms) {
  const days = ms / DAY5;
  return days < EXCEL_LEAP_BUG ? void 0 : days + EPOCH;
}
var PLAIN_NUMBER_RE = /^(?:\p{Sc}\s*)?-?(?:0|[1-9]\d{0,2}(?:[  ]\d{3})+|[1-9]\d*)(?:[.,]\d+)?(?:\s*[\p{Sc}%])?$/u;
function excelValue(text) {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  const upper = t.toUpperCase();
  if (upper === "TRUE" || upper === "FALSE") return { kind: "boolean", value: upper === "TRUE" };
  if (ERROR_CODES.includes(t)) return { kind: "error", value: t === "#CYCLE!" || t === "#ERROR!" ? "#VALUE!" : t };
  const date = parseDate(t);
  if (date) {
    const serial = serialOf(date.ms);
    if (serial === void 0) return { kind: "text", value: t };
    const seconds = /:\d{2}:\d{2}$/.test(t);
    return { kind: "number", value: serial, format: date.time ? seconds ? "dateTimeSeconds" : "dateTime" : "date" };
  }
  const time = parseClock(t);
  if (time) return time.seconds < 0 ? { kind: "text", value: t } : { kind: "number", value: time.seconds / 86400, format: /:\d{2}:\d{2}$/.test(t) ? "timeSeconds" : "time" };
  const n = PLAIN_NUMBER_RE.test(t) && t.replace(/\D/g, "").replace(/^0+/, "").length <= 15 ? asNumber(t) : void 0;
  if (n === void 0) return { kind: "text", value: t };
  if (t.endsWith("%")) {
    const decimals = /[.,](\d+)\s*%$/.exec(t)?.[1]?.length ?? 0;
    return { kind: "number", value: n / 100, format: decimals === 0 ? "percent" : decimals === 1 ? "percent1" : "percent2" };
  }
  return { kind: "number", value: n };
}

// table-plus/src/excel/clipboard.ts
var MSO_FORMATS = {
  date: "yyyy\\-mm\\-dd",
  dateTime: "yyyy\\-mm\\-dd hh:mm",
  dateTimeSeconds: "yyyy\\-mm\\-dd hh:mm:ss",
  time: "\\[h\\]:mm",
  timeSeconds: "\\[h\\]:mm:ss",
  percent: "0%",
  percent1: "0.0%",
  percent2: "0.00%"
};
function cellHtml(text) {
  const value = excelValue(text);
  const shown = xmlText(text);
  switch (value.kind) {
    case "empty":
      return "<td></td>";
    case "number":
      return value.format ? `<td x:num="${value.value}" style="mso-number-format:'${MSO_FORMATS[value.format]}'">${shown}</td>` : `<td x:num="${value.value}">${shown}</td>`;
    case "boolean":
      return `<td x:bool="${value.value ? "TRUE" : "FALSE"}">${shown}</td>`;
    case "error":
      return `<td x:err="${xmlText(value.value)}">${shown}</td>`;
    case "text":
      return `<td style="mso-number-format:'\\@'">${shown}</td>`;
  }
}
function excelHtml(header, rows) {
  const head = `<tr>${header.map((h) => `<td style="font-weight:bold;mso-number-format:'\\@'">${xmlText(h)}</td>`).join("")}</tr>`;
  const body = rows.map((row) => `<tr>${row.map(cellHtml).join("")}</tr>`).join("");
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table>${head}${body}</table></body></html>`;
}
function excelText(header, rows) {
  const quote = (v) => /[\t\r\n"]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  return [header, ...rows].map((row) => row.map(quote).join("	")).join("\r\n");
}

// table-plus/src/excel/functions.ts
var FUTURE_FUNCTIONS = /* @__PURE__ */ new Set([
  "CONCAT",
  "TEXTJOIN",
  "XLOOKUP",
  "XMATCH",
  "MAXIFS",
  "MINIFS",
  "IFS",
  "SWITCH",
  "IFNA",
  "DAYS",
  "ISOWEEKNUM",
  "CEILING.MATH",
  "FLOOR.MATH",
  "STDEV.S",
  "STDEV.P",
  "VAR.S",
  "VAR.P",
  "RANK.EQ",
  "RANK.AVG",
  "LET"
]);
function call(name, args) {
  return `${FUTURE_FUNCTIONS.has(name) ? "_xlfn." : ""}${name}(${args.join(",")})`;
}
function withFutureNames(text) {
  return text.replace(
    /(?<![\w.])([A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)*)(?=\()/gi,
    (name) => FUTURE_FUNCTIONS.has(name.toUpperCase()) ? `_xlfn.${name.toUpperCase()}` : name
  );
}
var SAME_IN_EXCEL = /* @__PURE__ */ new Set([
  "SUM",
  "AVERAGE",
  "MIN",
  "MAX",
  "PRODUCT",
  "COUNT",
  "COUNTA",
  "SUMIFS",
  "COUNTIFS",
  "AVERAGEIFS",
  "MAXIFS",
  "MINIFS",
  "SUMPRODUCT",
  "MEDIAN",
  "LARGE",
  "SMALL",
  "RANK",
  "STDEV",
  "INT",
  "MROUND",
  "MOD",
  "ABS",
  "IF",
  "IFERROR",
  "AND",
  "OR",
  "NOT",
  "ISNUMBER",
  "CONCAT",
  "TEXTJOIN",
  "LEN",
  "MID",
  "SEARCH",
  "SUBSTITUTE",
  "UPPER",
  "LOWER",
  "PROPER",
  "TRIM",
  "XLOOKUP",
  "TODAY",
  "NOW",
  "DATE",
  "YEAR",
  "MONTH",
  "DAY",
  "HOUR",
  "MINUTE",
  "SECOND",
  "WEEKDAY",
  "ISOWEEKNUM",
  "EOMONTH",
  "NETWORKDAYS",
  "WORKDAY"
]);
var texts = (args) => args.map((a) => a.text);
var padded2 = (args, defaults) => defaults.map((d, i) => args[i] === void 0 || args[i].text === "" ? d : args[i].text);
function unitOf(arg) {
  if (typeof arg?.literal !== "string") return void 0;
  const unit = toUnit(arg.literal);
  if (typeof unit === "string") return unit;
  const partial2 = arg.literal.trim().toLowerCase();
  return partial2 === "md" || partial2 === "ym" || partial2 === "yd" ? partial2 : void 0;
}
var UNIT_REASON = { reason: "its unit is not written in the formula (it comes from a cell)" };
var EXCEL_FUNCTIONS = {
  // Ours count from the first row under the header, Excel's from the sheet's first row (the header)
  ROW: () => "(ROW()-1)",
  // Ours: digits optional; Excel's: required
  ROUND: (args) => call("ROUND", padded2(args, ["", "0"])),
  ROUNDUP: (args) => call("ROUNDUP", padded2(args, ["", "0"])),
  ROUNDDOWN: (args) => call("ROUNDDOWN", padded2(args, ["", "0"])),
  TIME: (args) => call("TIME", padded2(args, ["", "0", "0"])),
  // Ours are Excel's CEILING.MATH and FLOOR.MATH (the significance optional, its sign left out)
  CEILING: (args) => call("CEILING.MATH", texts(args)),
  FLOOR: (args) => call("FLOOR.MATH", texts(args)),
  // Excel reads TEXT's format codes in its own language (a Czech Excel's year is "rrrr")
  TEXT: () => ({ reason: "Excel reads TEXT's format codes in its own language" }),
  DATEADD: ([date, amount, unit]) => {
    const d = `(${date.text})`;
    const n = `(${amount.text})`;
    switch (unitOf(unit)) {
      case "s":
        return `${d}+${n}/86400`;
      case "min":
        return `${d}+${n}/1440`;
      case "h":
        return `${d}+${n}/24`;
      case "d":
        return `${d}+${n}`;
      case "w":
        return `${d}+${n}*7`;
      // EDATE drops the time of day: added again
      case "m":
        return `${call("EDATE", [d, n])}+MOD(${d},1)`;
      case "y":
        return `${call("EDATE", [d, `${n}*12`])}+MOD(${d},1)`;
      default:
        return UNIT_REASON;
    }
  },
  DATEDIF: ([start, end, unit]) => {
    const days = `((${end.text})-(${start.text}))`;
    const u = unitOf(unit);
    switch (u) {
      case "s":
        return call("TRUNC", [`${days}*86400`]);
      case "min":
        return call("TRUNC", [`${days}*1440`]);
      case "h":
        return call("TRUNC", [`${days}*24`]);
      case "d":
        return call("TRUNC", [days]);
      case "w":
        return call("TRUNC", [`${days}/7`]);
      // Excel's own units (it gives #NUM! where the end is earlier; ours count back)
      case "m":
      case "y":
      case "md":
      case "ym":
      case "yd":
        return call("DATEDIF", [start.text, end.text, `"${u.toUpperCase()}"`]);
      default:
        return UNIT_REASON;
    }
  }
};
var templateOf = (name, templates) => Object.entries(templates).find(([n]) => n.toUpperCase() === name)?.[1];
function hasTemplate(name, templates) {
  return templateOf(name, templates) !== void 0;
}
function excelCall(name, args, templates, custom4 = false) {
  const template = templateOf(name, templates);
  if (template === false) return { reason: `${name} is set to be written as its value` };
  if (typeof template === "string") {
    if (template.trim() === "") return { reason: `the template of ${name} is empty` };
    const filled2 = template.replace(/\{(\d+)\}/g, (_, i) => {
      const arg = args[Number(i) - 1];
      return arg ? arg.operation ? `(${arg.text})` : arg.text : "";
    });
    return `(${withFutureNames(filled2)})`;
  }
  if (custom4) return { reason: `${name} is a custom function with no Excel form (see tablePlus.modules.excel.functions)` };
  const own = EXCEL_FUNCTIONS[name];
  if (own) return own(args);
  if (SAME_IN_EXCEL.has(name)) return call(name, texts(args));
  return { reason: `${name} has no Excel form` };
}

// table-plus/src/excel/formulas.ts
var EXCEL_ERRORS = /* @__PURE__ */ new Set(["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A"]);
var NotInExcel = class {
  constructor(reason) {
    this.reason = reason;
  }
  reason;
};
function excelCell(row, column, fixed) {
  return `${fixed?.column ? "$" : ""}${columnLetters(column)}${fixed?.row ? "$" : ""}${row + 2}`;
}
function excelFormula(formula, table, row, column, templates = {}) {
  const tree = parse(formula);
  if (tree instanceof FormulaError) return { reason: `it cannot be read: ${tree.detail}` };
  const headers = table.rows[0]?.cells ?? [];
  const bodyRows = table.rows.length - 1;
  let array = false;
  let totals;
  const columnOf = (name) => referencedColumn(headers, name);
  const write = (node) => {
    switch (node.kind) {
      case "literal": {
        const v = node.value;
        if (v === null) return { text: "", range: false };
        if (typeof v === "number") return { text: String(v), range: false };
        if (typeof v === "boolean") return { text: v ? "TRUE" : "FALSE", range: false };
        if (v instanceof FormulaError) return { text: EXCEL_ERRORS.has(v.code) ? v.code : "#VALUE!", range: false };
        if (typeof v === "string") return { text: `"${v.replaceAll('"', '""')}"`, range: false };
        throw new NotInExcel("it has a value Excel cannot write");
      }
      case "area": {
        if (node.table) throw new NotInExcel(`it refers to the table ${node.table.name}`);
        const { top, left, bottom, right } = node.area;
        if (bottom >= bodyRows || right >= headers.length) return { text: "#REF!", range: false };
        const one = top === bottom && left === right;
        const fixed = node.fixed;
        const start = excelCell(top, left, fixed && { column: fixed.left, row: fixed.top });
        const end = excelCell(bottom, right, fixed && { column: fixed.right, row: fixed.bottom });
        return { text: one && start === end ? start : `${start}:${end}`, range: node.range && !one };
      }
      case "column": {
        if (node.table) throw new NotInExcel(`it refers to the table ${node.table.name}`);
        const c = columnOf(node.name);
        if (c === void 0) return { text: "#REF!", range: false };
        if (node.thisRow) return { text: excelCell(row, c), range: false };
        totals ??= totalRows(table);
        const rows = Array.from({ length: bodyRows }, (_, r) => r).filter((r) => !totals.has(r));
        if (rows.length === 0) throw new NotInExcel(`[${node.name}] has no rows`);
        const first = rows[0];
        const last = rows[rows.length - 1];
        if (last - first + 1 !== rows.length) throw new NotInExcel(`[${node.name}] has total rows between its rows`);
        return first === last ? { text: excelCell(first, c), range: false } : { text: `${excelCell(first, c)}:${excelCell(last, c)}`, range: true };
      }
      case "named": {
        if (node.page !== void 0) throw new NotInExcel(`it refers to ${node.name} on another page`);
        const found = namedCells(table).get(node.name.toLowerCase());
        if (!found) throw new NotInExcel(`${node.name} is not a cell of this table`);
        return { text: excelCell(found.row - 1, found.column), range: false };
      }
      case "rowCell": {
        if (node.table) throw new NotInExcel(`it refers to the table ${node.table.name}`);
        const r = namedRows(table).get(node.row.toLowerCase());
        const c = columnOf(node.column);
        if (r === void 0 || c === void 0) return { text: "#REF!", range: false };
        return { text: excelCell(r - 1, c), range: false };
      }
      case "unary": {
        const arg = write(node.arg);
        if (arg.range) array = true;
        const inner = wrapped(node.arg, arg);
        return { text: node.op === "%" ? `${inner}%` : `${node.op}${inner}`, range: arg.range };
      }
      case "binary": {
        const left = write(node.left);
        const right = write(node.right);
        if (left.range || right.range) array = true;
        return { text: `${wrapped(node.left, left)}${node.op}${wrapped(node.right, right)}`, range: left.range || right.range };
      }
      case "call": {
        const f = functionNamed(node.name);
        const count = node.args.length;
        if (f && !hasTemplate(node.name, templates) && (count < f.minArgs || f.maxArgs !== void 0 && count > f.maxArgs)) {
          throw new NotInExcel(`${node.name} has a wrong number of arguments`);
        }
        const args = node.args.map((arg) => ({
          text: write(arg).text,
          ...arg.kind === "binary" || arg.kind === "unary" ? { operation: true } : {},
          ...arg.kind === "literal" && arg.value !== null && !(arg.value instanceof FormulaError) ? { literal: arg.value } : {}
        }));
        const written = excelCall(node.name, args, templates, isCustomFunction(node.name));
        if (typeof written !== "string") throw new NotInExcel(written.reason);
        return { text: written, range: false };
      }
    }
  };
  const wrapped = (node, written) => node.kind === "binary" || node.kind === "unary" ? `(${written.text})` : written.text;
  try {
    const written = write(tree);
    if (written.range) return { reason: "its result is a range, not one value" };
    return { text: written.text, array };
  } catch (e) {
    if (e instanceof NotInExcel) return { reason: e.reason };
    throw e;
  }
}

// table-plus/src/export/table.ts
function currentTable(host, widget, info) {
  const current = host.widgetForKey(info.key) ?? widget;
  return { widget: current, info: host.infoOf(current) ?? info };
}
function exportedTable(host, info, rows) {
  const values = (tr) => Array.from(tr.cells).map((cell) => host.cellValue(cell));
  const body = rows === "shown" ? host.shownRows(info).filter((tr) => tr.dataset.tpRow !== void 0) : host.bodyRows(info);
  return {
    header: values(info.table.rows[0]),
    rows: body.map((tr) => ({ row: Number(tr.dataset.tpRow), values: values(tr) }))
  };
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
var COLUMN_ATTRIBUTE_RE = /^([\w-]+)\.([^.:]*)(?::(\d+))?$/;
function parseColumnAttribute(name) {
  const match = COLUMN_ATTRIBUTE_RE.exec(name);
  return match ? { what: match[1], id: { name: match[2], nth: Number(match[3] ?? 1) } } : void 0;
}
function columnAttributeName(headers, what, column) {
  const id = columnIdOf(headers, column);
  return id && `${what}.${id.name}${id.shared ? `:${id.nth}` : ""}`;
}
function columnMeta(table, what) {
  const headers = table.rows[0]?.cells ?? [];
  const values = /* @__PURE__ */ new Map();
  for (const [name, value] of Object.entries(table.meta ?? {})) {
    const attribute = parseColumnAttribute(name);
    const column = attribute?.what === what ? findColumn(headers, attribute.id) : void 0;
    if (column !== void 0 && !values.has(column)) values.set(column, value);
  }
  return values;
}
function withColumnMeta(table, what, values) {
  const headers = table.rows[0]?.cells ?? [];
  const meta = {};
  for (const [name, value] of Object.entries(table.meta ?? {})) {
    if (parseColumnAttribute(name)?.what !== what) meta[name] = value;
  }
  for (const [column, value] of values) {
    const name = columnAttributeName(headers, what, column);
    if (name) meta[name] = value;
  }
  const current = table.meta ?? {};
  const same = Object.keys(meta).length === Object.keys(current).length && Object.entries(meta).every(([n, v]) => current[n] === v);
  return same ? table : { ...table, meta };
}
function followColumnMeta(before, after, map) {
  const old = before.meta ?? {};
  const current = after.meta ?? {};
  const beforeHeaders = before.rows[0]?.cells ?? [];
  const afterHeaders = after.rows[0]?.cells ?? [];
  let changed = false;
  const meta = {};
  for (const [name, value] of Object.entries(current)) {
    const attribute = old[name] === value ? parseColumnAttribute(name) : void 0;
    const column = attribute && findColumn(beforeHeaders, attribute.id);
    if (!attribute || column === void 0) {
      meta[name] = value;
      continue;
    }
    const moved2 = map(column);
    const renamed = moved2 === void 0 ? void 0 : columnAttributeName(afterHeaders, attribute.what, moved2);
    if (renamed !== name) changed = true;
    if (renamed !== void 0) meta[renamed] = value;
  }
  return changed ? { ...after, meta } : after;
}
function metaSort(table) {
  for (const [column, direction] of columnMeta(table, "sort")) {
    if (direction === "asc" || direction === "desc") return { column, direction };
  }
  return void 0;
}
function withMetaSort(table, sort) {
  return withColumnMeta(table, "sort", new Map(sort ? [[sort.column, sort.direction]] : []));
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
function metadataAfterEdit(before, after, edit) {
  const followed = followColumnMeta(before, after, edit.columnMap ?? ((c) => c));
  return edit.pins ? withMetaPins(followed, edit.pins) : followed;
}

// table-plus/src/features/excel.ts
var XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
var FUNCTIONS_PATH = "tablePlus.modules.excel.functions";
function excelTemplates(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry) => typeof entry[1] === "string" || entry[1] === false)
  );
}
function fileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Table";
}
function xlsxName(typed) {
  return `${fileName(typed.trim().replace(/\.xlsx$/i, ""))}.xlsx`;
}
function skippedGroups(skipped, parts = 4) {
  const groups = /* @__PURE__ */ new Map();
  for (const s of skipped) {
    const key2 = `${s.reason}\0${s.formula}`;
    groups.set(key2, [...groups.get(key2) ?? [], s]);
  }
  return Array.from(groups.values(), (cells) => {
    const sorted = [...cells].sort((a, b) => a.column - b.column || a.row - b.row);
    const runs = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].column === sorted[i].column && sorted[j + 1].row === sorted[j].row + 1) j++;
      const first = sorted[i];
      const last = sorted[j];
      runs.push(i === j ? excelCell(first.row, first.column) : `${excelCell(first.row, first.column)}:${excelCell(last.row, last.column)}`);
      i = j + 1;
    }
    const more = runs.length - parts;
    return {
      cells: more > 0 ? `${runs.slice(0, parts).join(", ")} and ${more} more` : runs.join(", "),
      formula: cells[0].formula,
      reason: cells[0].reason,
      count: cells.length
    };
  });
}
var SHOWN_GROUPS = 50;
var plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
var Excel = class {
  constructor(host) {
    this.host = host;
  }
  host;
  opening = false;
  /** Export to Excel… in the toolbar's menu */
  toolbarButtons(widget, info) {
    return [
      {
        label: "Export to Excel\u2026",
        title: "Copy the table for Excel, or download it as an Excel file with its formulas",
        icon: ICONS.download,
        run: () => void this.open(widget, info)
      }
    ];
  }
  /** The dialog: both ways, with what they keep, and the outcome of the one taken */
  async open(shownWidget, shownInfo) {
    if (this.opening) return;
    this.opening = true;
    const { info } = currentTable(this.host, shownWidget, shownInfo);
    const shown = exportedTable(this.host, info, "shown");
    let workbook;
    try {
      workbook = await this.workbook(info);
    } catch (e) {
      console.error("Table Plus: the table could not be prepared for Excel", e);
      void this.host.bridge.flash(`Table Plus: could not prepare the table for Excel (${String(e)})`, "error");
      return;
    } finally {
      this.opening = false;
    }
    const { doc } = this.host;
    const el = (tag, className, text) => {
      const e = doc.createElement(tag);
      e.className = className;
      if (text !== void 0) e.textContent = text;
      return e;
    };
    const button = (text, primary = false) => {
      const b = el("button", primary ? "tp-dialog-primary" : "tp-dialog-button", text);
      b.type = "button";
      return b;
    };
    const option = (title, lines, actions, ...more) => {
      const box = el("section", "tp-excel-option");
      const head = el("div", "tp-excel-option-head");
      const right = el("div", "tp-excel-option-actions");
      right.append(...actions);
      head.append(el("h3", "tp-excel-option-title", title), right);
      const list = el("ul", "tp-excel-option-text");
      for (const line of lines) list.append(el("li", "", line));
      box.append(head, list);
      box.append(...more);
      return box;
    };
    const status = el("div", "tp-excel-status");
    status.setAttribute("role", "status");
    const report = (text, ok) => {
      status.textContent = text;
      status.classList.toggle("tp-excel-ok", ok);
      status.classList.toggle("tp-excel-error", !ok);
    };
    const copy = button("Copy");
    const rows = shown.rows.length;
    const copyBox = option(
      "Copy for Excel",
      [
        `${plural(rows, "row", "rows")} as shown here (sorted, filtered), with the header, to paste into a sheet.`,
        "Numbers, dates, times and TRUE / FALSE paste as Excel's values, in any language of Excel.",
        "Lost: formulas (their results are pasted), how column types show cells (currency signs, stars), links."
      ],
      [copy]
    );
    const download = button("Download", true);
    const formulaNote = el("div", "tp-excel-formulas");
    const { skipped, formulas } = workbook;
    if (skipped.length === 0) {
      formulaNote.classList.add("tp-excel-ok");
      formulaNote.textContent = formulas === 0 ? "No formulas in the table." : `All ${plural(formulas, "formula", "formulas")} will be Excel formulas.`;
    } else {
      formulaNote.append(
        el(
          "div",
          "tp-excel-formulas-title",
          `${plural(skipped.length, "formula", "formulas")} of ${formulas} will be written as ${skipped.length === 1 ? "its value" : "their values"} (cells as Excel names them):`
        )
      );
      const list = el("div", "tp-excel-skipped");
      const groups = skippedGroups(skipped);
      for (const g of groups.slice(0, SHOWN_GROUPS)) {
        const item = el("div", "tp-excel-skipped-item");
        const cells = el("span", "tp-excel-skipped-cell", g.cells);
        if (g.count > 1) cells.title = plural(g.count, "cell", "cells");
        item.append(cells, el("code", "tp-excel-skipped-formula", g.formula), el("span", "tp-excel-skipped-reason", g.reason));
        list.append(item);
      }
      if (groups.length > SHOWN_GROUPS) list.append(el("div", "tp-excel-skipped-more", `\u2026 and ${groups.length - SHOWN_GROUPS} more`));
      formulaNote.append(list);
    }
    const nameField = el("label", "tp-excel-file");
    nameField.append(el("span", "tp-excel-file-label", "File name:"));
    const nameInput = el("input", "tp-excel-file-input");
    nameInput.type = "text";
    nameInput.value = fileName(workbook.name);
    nameInput.spellcheck = false;
    nameInput.setAttribute("aria-label", "File name");
    const fit = () => nameInput.size = Math.max(1, nameInput.value.length);
    fit();
    nameInput.addEventListener("input", fit);
    nameField.append(nameInput, el("span", "tp-excel-file-extension", ".xlsx"));
    const downloadBox = option(
      "Download .xlsx",
      [
        "The whole table, every row in the order of the markdown (not as sorted or filtered), the header in row 1.",
        "Numbers, dates and times as Excel's values; formulas as Excel formulas, calculated again by Excel."
      ],
      [nameField, download],
      formulaNote
    );
    const content = el("div", "tp-excel");
    content.append(copyBox, downloadBox, status);
    const close = button("Close");
    const footer = el("div", "tp-excel-foot");
    footer.append(close);
    const dialog = this.host.openDialog({
      title: "Export to Excel",
      subtitle: workbook.name,
      className: "tp-excel-dialog",
      content,
      footer,
      focus: download
    });
    close.addEventListener("click", () => dialog.close());
    copy.addEventListener("click", () => void this.copy(shown).then(({ text, ok }) => report(text, ok)));
    const save = () => {
      const { text, ok } = this.download(workbook, xlsxName(nameInput.value));
      report(text, ok);
    };
    download.addEventListener("click", save);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      save();
    });
  }
  /** The rows as shown onto the clipboard, for Excel */
  async copy(table) {
    const rows = table.rows.map((r) => r.values);
    try {
      await writeClipboard(this.host.doc, excelText(table.header, rows), excelHtml(table.header, rows));
      return { text: `Copied ${plural(rows.length, "row", "rows")}: paste them into Excel.`, ok: true };
    } catch (e) {
      return { text: `Could not copy: ${String(e)}`, ok: false };
    }
  }
  /** The file: every row of the markdown in its place, formulas as Excel writes them, those it cannot as values */
  async workbook(info) {
    const exported = exportedTable(this.host, info, "all");
    const model = this.host.tableOf(info);
    const templates = excelTemplates(await this.host.bridge.getConfig?.(FUNCTIONS_PATH, {}));
    const skipped = [];
    let formulas = 0;
    const rows = Array.from({ length: Math.max(0, model.rows.length - 1) }, () => []);
    for (const { row, values } of exported.rows) {
      rows[row - 1] = values.map((text, column) => {
        const value = excelValue(text);
        const stored = formulaOf(model.rows[row]?.cells[column] ?? "");
        if (!stored) return { value };
        formulas++;
        const formula = excelFormula(stored.formula, model, row - 1, column, templates);
        if ("reason" in formula) {
          skipped.push({ row: row - 1, column, formula: stored.formula, reason: formula.reason });
          return { value };
        }
        return { value, formula };
      });
    }
    const page = await this.host.bridge.getCurrentPage();
    const name = metaName(model) ?? page.split("/").pop() ?? "Table";
    const widths = exported.header.map((h, c) => columnWidth([h, ...exported.rows.map((r) => r.values[c] ?? "")]));
    return { name, make: () => xlsxFile({ name, header: exported.header, rows, widths }), formulas, skipped };
  }
  /** The file made and given to the browser to download */
  download(workbook, file) {
    let bytes;
    try {
      bytes = workbook.make();
    } catch (e) {
      console.error("Table Plus: the Excel file could not be made", e);
      return { text: `Could not make the file: ${String(e)}`, ok: false };
    }
    const { doc } = this.host;
    const win = doc.defaultView;
    const url = win.URL.createObjectURL(new Blob([bytes], { type: XLSX_TYPE }));
    const link = doc.createElement("a");
    link.href = url;
    link.download = file;
    link.style.display = "none";
    doc.body.append(link);
    link.click();
    link.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 6e4);
    const values = workbook.skipped.length;
    return { text: `Downloaded ${file}${values ? `, ${plural(values, "formula", "formulas")} as values` : ""}.`, ok: true };
  }
};

// table-plus/src/features/export.ts
function csvText(values) {
  const quote = (v) => /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  return values.map((row) => `${row.map(quote).join(",")}\r
`).join("");
}
var Export = class {
  constructor(host) {
    this.host = host;
  }
  host;
  /** Copy as CSV in the toolbar's menu */
  toolbarButtons(widget, info) {
    return [
      {
        label: "Copy as CSV",
        title: "Copy the table as CSV: its rows as shown (sorted, filtered), cells as Ctrl+C copies them",
        icon: ICONS.copy,
        run: () => void this.copyCsv(widget, info)
      }
    ];
  }
  async copyCsv(shownWidget, shownInfo) {
    const { info } = currentTable(this.host, shownWidget, shownInfo);
    const table = exportedTable(this.host, info, "shown");
    try {
      await writeClipboard(this.host.doc, csvText([table.header, ...table.rows.map((r) => r.values)]));
      const body = table.rows.length;
      void this.host.bridge.flash(`Table Plus: copied ${body} row${body === 1 ? "" : "s"} as CSV`, "info");
    } catch (e) {
      void this.host.bridge.flash(`Table Plus: could not copy (${String(e)})`, "error");
    }
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

// table-plus/src/formulas/page.ts
function pageTables(tables, here, replace, others) {
  const pages = /* @__PURE__ */ new Map();
  const namesOf2 = (page) => {
    const isHere = page === void 0 || page === here;
    const key2 = isHere ? "" : page;
    let names = pages.get(key2);
    if (!names) {
      const list = isHere ? tables() : others?.tables(page);
      if (!list) return void 0;
      names = { tables: /* @__PURE__ */ new Map(), cells: /* @__PURE__ */ new Map() };
      for (const { range, table: parsed3 } of list) {
        const table = isHere && replace && range.from === replace.from ? replace.table : parsed3;
        const own = metaName(table)?.toLowerCase();
        if (own && !names.tables.has(own)) names.tables.set(own, table);
        for (const [name, cell] of namedCells(table)) if (!names.cells.has(name)) names.cells.set(name, { table, ...cell });
      }
      pages.set(key2, names);
    }
    return names;
  };
  return Object.assign((name, page) => namesOf2(page)?.tables.get(name.toLowerCase()), {
    cell: (name, page) => namesOf2(page)?.cells.get(name.toLowerCase()),
    // Pages not read (none without the pageLinks module): formulas referring to them keep their results
    unread: (page) => page !== here && others?.tables(page) === void 0
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

// table-plus/src/features/pagelinks.ts
var MAX_OTHER_PAGES = 20;
var PageLinks = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // The other pages read: their tables, or null where there is no such page
  pages = /* @__PURE__ */ new Map();
  // Counts the pages read, so what formulas computed from them is computed anew
  version = 0;
  otherPages() {
    return { tables: (page) => this.pages.get(page), version: this.version };
  }
  /** A table shown: the pages its formulas read, if not read yet; then its formulas are checked again */
  enhanced(_widget, info) {
    void this.load([parseTable(info.source)], false).then((read) => {
      if (read) this.host.tablesChanged();
    });
  }
  /** Before a write reads the page: the pages the tables it recalculates refer to, read again */
  async prepareWrite(info) {
    await this.load(tablesWritten(pageTablesOf(this.host.pageText), info.source), true);
  }
  /** After the edit: pages the page's tables and the edited one refer to, if not read yet */
  async prepareEdit(edited, page) {
    await this.load([...page.tables.map((t) => t.table), edited], false);
  }
  /**
   * Another page formulas read was changed: read it again, and the tables
   * shown are checked again. When it is the page shown now (it was read from
   * another page before), it is forgotten, so going back there does not use it
   * as it was.
   */
  async pageIndexed(name) {
    if (!this.pages.has(name)) return;
    if (name === this.host.currentPage) {
      this.pages.delete(name);
      return;
    }
    await this.load(this.tablesShown(), /* @__PURE__ */ new Set([name]));
    this.host.tablesChanged();
  }
  /** The tables shown, as last read */
  tablesShown() {
    return Array.from(this.host.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`)).flatMap((widget) => {
      const info = this.host.infoOf(widget);
      return info ? [parseTable(info.source)] : [];
    });
  }
  /**
   * Reads the other pages these tables' formulas refer to, and in turn the
   * pages those pages' tables refer to; `fresh`: also those read before.
   * Whether a page was read.
   */
  async load(tables, fresh) {
    if (!this.host.bridge.readPage || !this.host.moduleOn("formulas")) return false;
    const queue = /* @__PURE__ */ new Set();
    for (const table of tables) for (const page of referredPages(table)) queue.add(page);
    const done = /* @__PURE__ */ new Set();
    let read = false;
    for (const page of queue) {
      if (done.size >= MAX_OTHER_PAGES) break;
      done.add(page);
      if (page === this.host.currentPage) continue;
      if (fresh === true || fresh && fresh.has(page) || !this.pages.has(page)) {
        await this.read(page);
        read = true;
      }
      for (const { table } of this.pages.get(page) ?? []) for (const next of referredPages(table)) queue.add(next);
    }
    return read;
  }
  /** Reads another page's tables; the earlier ones stay until it is read, so formulas never see it missing meanwhile */
  async read(page) {
    let tables;
    try {
      tables = pageTablesOf(await this.host.bridge.readPage(page));
    } catch {
      tables = null;
    }
    this.pages.set(page, tables);
    this.version++;
  }
};

// table-plus/src/filter.ts
var DEFAULT_FILTER_OPTIONS = { smart: true };
function normalizeForFilter(s) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
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
      const rest = text.slice(1);
      if (rest.trim() === "") return {};
      const wholes = new Set(rest.split("|").map((part) => normalizeForFilter(part.trim())));
      return { match: (value) => wholes.has(normalizeForFilter(value.trim())) };
    }
    const regex = REGEX_RE.exec(text);
    if (regex) return parseRegex(regex[1], regex[2]);
    if (text.startsWith("/")) return {};
    if (text.includes("|")) return anyOf(text.split("|").map((part) => parseFilter(part, options)));
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
function anyOf(parts) {
  const error = parts.find((part) => part.error)?.error;
  if (error) return { error };
  const matches = parts.flatMap((part) => part.match ? [part.match] : []);
  return matches.length === 0 ? {} : { match: (value) => matches.some((match) => match(value)) };
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

// table-plus/src/features/filters.ts
var MAX_VALUES = 12;
var OPERATOR_RE = /^(!|=|>=|<=|>|<)\s*/;
var bare = (value) => value.replace(OPERATOR_RE, "");
var NUMBER_HINTS = [
  { code: ">10", text: "above", apply: (v) => `>${bare(v)}` },
  { code: "<10", text: "below", apply: (v) => `<${bare(v)}` },
  { code: ">=10", text: "at least", apply: (v) => `>=${bare(v)}` }
];
var TEXT_HINTS = [
  { code: "=text", text: "exactly", apply: (v) => `=${bare(v)}` },
  { code: "!text", text: "not", apply: (v) => v.startsWith("!") ? v : `!${v}` },
  { code: "a|b", text: "either", apply: (v) => v === "" || v.endsWith("|") ? v : `${v}|` },
  { code: "/^a.*z$/", text: "regular expression", apply: (v) => v.startsWith("/") ? v : `/${bare(v)}/` }
];
function withValues(current, prefix, values) {
  const text = current.trim();
  const listed2 = text.startsWith(prefix) && (prefix === "!=" || !text.startsWith("!")) ? text.slice(prefix.length).split("|").map((v) => v.trim()) : [];
  const all = [...listed2];
  for (const value of values) if (!all.some((v) => normalizeForFilter(v) === normalizeForFilter(value))) all.push(value);
  return `${prefix}${all.length === 1 && all[0] === "" ? "|" : all.join("|")}`;
}
function valuesLabel(values) {
  const named2 = values.map((v) => v === "" ? "empty" : v.length > 20 ? `${v.slice(0, 19)}\u2026` : v);
  return named2.length > 3 ? `${named2.slice(0, 3).join(", ")} and ${named2.length - 3} more` : named2.join(", ");
}
function sameFilters(a, b) {
  for (let column = 0; column < Math.max(a.length, b.length); column++) {
    if ((a[column] ?? "").trim() !== (b[column] ?? "").trim()) return false;
  }
  return true;
}
var Filters = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // By table key: filters typed that the table does not store (as typed, by column)
  typed = /* @__PURE__ */ new Map();
  // By table key: the filters stored in the table, read from its markdown (as of `source`)
  stored = /* @__PURE__ */ new Map();
  // Tables whose filter row is shown
  shown = /* @__PURE__ */ new Set();
  storeTimers = /* @__PURE__ */ new Map();
  // Tables whose filters are stored once the cell editor in them closes, or
  // they are rendered again (a write renders a table anew)
  storesWaiting = /* @__PURE__ */ new Set();
  options = { smart: true };
  // The bubble under the field being typed in, or (popover) a column's filter on its own
  bubble;
  start() {
    void this.readOptions();
  }
  stop() {
    for (const timer of this.storeTimers.values()) clearTimeout(timer);
    this.hideBubble();
  }
  /** Whether a node is the bubble's */
  owns(node) {
    return !!this.bubble?.element.contains(node);
  }
  /** The smart filters setting; when it changed, every table shown is filtered anew */
  async readOptions() {
    const smart = await this.host.setting("smartFilters") === true;
    if (smart === this.options.smart) return;
    this.options = { smart };
    for (const widget of Array.from(this.host.doc.querySelectorAll(WIDGET_SELECTOR))) {
      const info = this.host.infoOf(widget);
      if (info) this.host.viewChanged(widget, info);
    }
  }
  /** The table with `key` as rendered now: a write renders a table anew */
  table(key2) {
    const widget = this.host.widgetForKey(key2);
    const info = widget && this.host.infoOf(widget);
    return widget && info ? [widget, info] : void 0;
  }
  /** The filters stored in the table (filter.*), by column */
  storedFilters(info) {
    const known2 = this.stored.get(info.key);
    if (known2?.source === info.source) return known2.filters;
    const filters = [];
    for (const [column, value] of columnMeta(parseTable(info.source), "filter")) {
      while (filters.length < column) filters.push("");
      filters[column] = value;
    }
    this.stored.set(info.key, { source: info.source, filters });
    return filters;
  }
  /** The table's filters, by column: those typed, else those stored */
  filtersOf(info) {
    return this.typed.get(info.key) ?? this.storedFilters(info);
  }
  /** The filters that filter, by column */
  matchers(info) {
    const matchers = /* @__PURE__ */ new Map();
    this.filtersOf(info).forEach((filter, column) => {
      const match = parseFilter(filter, this.options).match;
      if (match) matchers.set(column, match);
    });
    return matchers;
  }
  hiddenRows(info, values) {
    const matchers = this.matchers(info);
    if (matchers.size === 0) return void 0;
    const hidden = /* @__PURE__ */ new Set();
    values.forEach((row, i) => {
      for (const [column, match] of matchers) {
        if (!match(row[column] ?? "")) {
          hidden.add(i);
          return;
        }
      }
    });
    return hidden;
  }
  hidesRows(info) {
    return this.matchers(info).size > 0;
  }
  /** A filter mark in each header, shown while its column filters (also with the filter row hidden) */
  decorate(_widget, info) {
    Array.from(info.table.rows[0].cells).forEach((cell, column) => {
      if (cell.querySelector(".tp-filter-mark")) return;
      const mark = this.host.doc.createElement("span");
      mark.className = `${UI_CLASS} tp-filter-mark`;
      mark.title = "Filtered: click to change the filter";
      mark.dataset.tpAction = "filter";
      mark.dataset.tpColumn = String(column);
      mark.innerHTML = ICONS.filter;
      cell.insertBefore(mark, cell.querySelector(".tp-sort"));
    });
  }
  viewApplied(_widget, info) {
    const matchers = this.matchers(info);
    Array.from(info.table.rows[0].cells).forEach((cell, column) => cell.classList.toggle("tp-filtered", matchers.has(column)));
    this.syncRow(info);
  }
  /** The filter icon at the toolbar's right; while filtered, "3 of 10 rows", its × clearing the filters */
  toolbarButtons(_widget, info) {
    const { key: key2 } = info;
    const buttons = [];
    if (this.hidesRows(info)) {
      const rows = this.host.bodyRows(info);
      const shown = rows.filter((tr) => !tr.classList.contains("tp-hidden")).length;
      buttons.push({
        label: `${shown} of ${rows.length} rows`,
        title: "Clear the filters",
        place: "chip",
        icon: ICONS.filter,
        run: () => this.clearAll(key2)
      });
    }
    buttons.push({
      label: "Filter",
      title: "Show or hide the filter row (hidden, the filters still apply: the toolbar and the headers show them)",
      place: "icon",
      icon: ICONS.filter,
      pressed: this.shown.has(key2),
      run: () => {
        if (this.shown.has(key2)) this.shown.delete(key2);
        else this.shown.add(key2);
        const table = this.table(key2);
        if (table) this.host.viewChanged(...table);
        this.scheduleStore(key2);
      }
    });
    return buttons;
  }
  /**
   * In the menu of body cells of one column: Filter = their values (only
   * rows with one of them) and Filter ≠ their values (rows with none); added
   * to a list of that kind the column filters by already
   */
  cellMenuEntries(_widget, info, cells) {
    const body = cells.filter((ref) => ref.row > 0);
    const column = body[0]?.column;
    if (column === void 0 || body.some((ref) => ref.column !== column)) return void 0;
    const values = [];
    for (const ref of body) {
      const cell = this.host.cellAt(info, ref, true);
      const value = cell ? this.host.cellValue(cell).trim() : "";
      if (!values.some((v) => normalizeForFilter(v) === normalizeForFilter(value))) values.push(value);
    }
    if (values.some((v) => v.includes("|"))) return void 0;
    const { key: key2 } = info;
    const apply = (prefix) => () => {
      const table = this.table(key2);
      if (!table) return;
      this.setFilter(key2, column, withValues(this.filtersOf(table[1])[column] ?? "", prefix, values));
      this.scheduleStore(key2);
    };
    const label = valuesLabel(values);
    return {
      order: 2,
      entries: [
        { kind: "item", label: `Filter: = ${label}`, icon: ICONS.filter, hint: "Show only the rows with this value here", run: apply("=") },
        { kind: "item", label: `Filter: \u2260 ${label}`, icon: ICONS.filter, hint: "Hide the rows with this value here", run: apply("!=") }
      ]
    };
  }
  /** "Filter" in a column's menu: its filter in a bubble under its header, and a × removing it */
  columnMenuEntries(_widget, info, column) {
    const filtered = (this.filtersOf(info)[column] ?? "").trim() !== "";
    return [
      {
        kind: "segmented",
        label: "Filter",
        options: [
          { icon: ICONS.filter, title: "Filter this column", run: () => this.openFilter(info, column) },
          {
            icon: ICONS.clear,
            title: "Remove this column's filter",
            run: () => this.clear(info, column),
            ...filtered ? {} : { disabled: "This column is not filtered" }
          }
        ]
      }
    ];
  }
  action(name, element, _widget, info) {
    const column = Number(element.dataset.tpColumn);
    if (name === "filter") this.openFilter(info, column);
    else if (name === "clear-filter") this.clear(info, column);
    else return false;
    return true;
  }
  /** Filters typed move with their columns; stored ones follow them in the markdown (meta.ts) */
  columnsMoved(key2, map) {
    const typed = this.typed.get(key2);
    if (!typed) return;
    const moved2 = [];
    typed.forEach((value, column) => {
      const target = map(column);
      if (target === void 0 || value === "") return;
      while (moved2.length <= target) moved2.push("");
      moved2[target] = value;
    });
    this.typed.set(key2, moved2);
  }
  /** Remove metadata: what is typed goes too, the table shows what its markdown has */
  viewForgotten(key2) {
    this.typed.delete(key2);
    this.storesWaiting.delete(key2);
  }
  /** The filter row as the filters are: shown with them, or gone */
  syncRow(info) {
    let row = info.table.querySelector("tr.tp-filter-row");
    if (this.bubble?.popover && this.bubble.key === info.key) this.placeBubble();
    if (!this.shown.has(info.key)) {
      if (row && this.bubble && row.contains(this.bubble.input)) this.hideBubble();
      row?.remove();
      return;
    }
    if (!row) {
      row = this.host.doc.createElement("tr");
      row.className = `${UI_CLASS} tp-filter-row`;
      for (let column = 0; column < info.columns; column++) row.append(this.field(info.key, column));
      info.table.rows[0].after(row);
    }
    const filters = this.filtersOf(info);
    for (const input of Array.from(row.querySelectorAll("input.tp-filter"))) {
      const value = filters[Number(input.dataset.tpColumn)] ?? "";
      if (input.value !== value && this.host.doc.activeElement !== input) input.value = value;
      const { match, error } = parseFilter(input.value, this.options);
      input.classList.toggle("tp-invalid", !!error);
      input.title = error ?? "";
      const cell = input.closest("td");
      cell.classList.toggle("tp-filter-active", !!match);
      cell.classList.toggle("tp-filter-typed", input.value !== "");
    }
  }
  // ---- storing ------------------------------------------------------------------
  /**
   * Stores a table's filters in its metadata row (the metadata setting, or a
   * table that has the row) once none of its filter fields is typed in and no
   * cell of it is edited: a write renders the table anew, which would take a
   * field's focus or close the cell editor
   */
  scheduleStore(key2) {
    clearTimeout(this.storeTimers.get(key2));
    this.storeTimers.set(
      key2,
      setTimeout(() => {
        this.storeTimers.delete(key2);
        const active = this.host.doc.activeElement;
        const table = this.table(key2);
        if (active instanceof HTMLInputElement && active.classList.contains("tp-filter")) {
          if (this.bubble?.input === active ? this.bubble.key === key2 : !!table && table[1].table.contains(active)) return;
        }
        const editing = this.host.editing;
        if (!table || editing && this.host.infoOf(editing.widget)?.key === key2) {
          this.storesWaiting.add(key2);
          return;
        }
        void this.store(key2);
      }, 0)
    );
  }
  /** A cell editor closed: filters waiting for it are stored */
  editorClosed(editor) {
    const key2 = this.host.infoOf(editor.widget)?.key;
    if (key2 && this.storesWaiting.delete(key2)) this.scheduleStore(key2);
  }
  /** A table rendered again: filters waiting for it are stored */
  enhanced(_widget, info) {
    if (this.storesWaiting.delete(info.key)) this.scheduleStore(info.key);
  }
  async store(key2) {
    const table = this.table(key2);
    const typed = this.typed.get(key2);
    if (!table || !typed) return;
    const [widget, info] = table;
    if (sameFilters(typed, this.storedFilters(info))) {
      this.typed.delete(key2);
      return;
    }
    if (!(info.metaRow || this.host.metadataEnabled)) return;
    const written = [...typed];
    const filters = /* @__PURE__ */ new Map();
    written.forEach((filter, column) => {
      if (filter.trim() !== "") filters.set(column, filter.trim());
    });
    const result = await this.host.write(widget, (t) => withColumnMeta(t, "filter", filters));
    if (result !== "failed" && sameFilters(this.typed.get(key2) ?? [], written)) this.typed.delete(key2);
  }
  // ---- typing ---------------------------------------------------------------------
  /** A column's field in the filter row: the filter icon, the field, its clear button */
  field(key2, column) {
    const cell = this.host.doc.createElement("td");
    const { box, input } = this.filterBox(key2, column);
    input.addEventListener("focus", () => {
      void this.readOptions();
      if (this.bubble?.input !== input) {
        this.showBubble(key2, column, input, () => input.isConnected ? input : void 0);
      }
    });
    input.addEventListener("blur", (e) => this.left(key2, input, e));
    cell.append(box);
    return cell;
  }
  /** A filter field with the filter icon before it and its clear button after it */
  filterBox(key2, column) {
    const { doc } = this.host;
    const box = doc.createElement("div");
    box.className = "tp-filter-box";
    const icon = doc.createElement("span");
    icon.className = "tp-filter-icon";
    icon.innerHTML = ICONS.filter;
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "tp-filter";
    input.size = 1;
    input.placeholder = "Filter";
    input.spellcheck = false;
    input.dataset.tpColumn = String(column);
    this.host.isolate(input);
    input.addEventListener("input", () => this.setFilter(key2, column, input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    const clear = doc.createElement("button");
    clear.type = "button";
    clear.tabIndex = -1;
    clear.className = "tp-filter-clear";
    clear.title = "Clear this filter";
    clear.setAttribute("aria-label", clear.title);
    clear.innerHTML = ICONS.clear;
    clear.dataset.tpAction = "clear-filter";
    clear.dataset.tpColumn = String(column);
    clear.addEventListener("mousedown", (e) => e.preventDefault());
    clear.addEventListener("click", (e) => {
      e.preventDefault();
      this.type(key2, input, column, "");
    });
    box.append(icon, input, clear);
    return { box, input };
  }
  /** A column's filter removed: a field's clear button in the filter row, the × in the column's menu */
  clear(info, column) {
    const input = info.table.querySelector(`.tp-filter-row input.tp-filter[data-tp-column="${column}"]`);
    if (input) this.type(info.key, input, column, "");
    else this.setFilter(info.key, column, "");
    this.scheduleStore(info.key);
  }
  /** The toolbar chip's ×: no filter any more */
  clearAll(key2) {
    this.typed.set(key2, []);
    const table = this.table(key2);
    for (const input of Array.from(table?.[1].table.querySelectorAll("input.tp-filter") ?? [])) input.value = "";
    if (this.bubble?.key === key2) this.hideBubble();
    if (table) this.host.viewChanged(...table);
    this.scheduleStore(key2);
  }
  setFilter(key2, column, value) {
    const table = this.table(key2);
    if (table) {
      const filters = [...this.filtersOf(table[1])];
      while (filters.length <= column) filters.push("");
      filters[column] = value;
      this.typed.set(key2, filters);
      this.host.viewChanged(...table);
    }
    const bubble = this.bubble;
    if (bubble && bubble.key === key2 && bubble.column === column) {
      bubble.element.classList.toggle("tp-filter-typed", value !== "");
      this.renderBubble();
    }
  }
  /** Puts `value` in the field as if typed */
  type(key2, input, column, value) {
    input.value = value;
    input.closest("td")?.classList.toggle("tp-filter-typed", value !== "");
    this.setFilter(key2, column, value);
  }
  // ---- the bubble -------------------------------------------------------------
  /**
   * A column's filter alone, floating under its header (its filter mark, the
   * column menu's Filter): nothing in the table moves. Asked again for the same
   * column, it closes.
   */
  openFilter(info, column) {
    const { key: key2 } = info;
    if (this.bubble?.popover && this.bubble.key === key2 && this.bubble.column === column) {
      this.hideBubble();
      return;
    }
    void this.readOptions();
    const { box, input } = this.filterBox(key2, column);
    input.value = this.filtersOf(info)[column] ?? "";
    input.addEventListener("blur", (e) => this.left(key2, input, e));
    const anchor = () => this.table(key2)?.[1].table.rows[0]?.cells[column];
    this.showBubble(key2, column, input, anchor, box);
    this.bubble?.element.classList.toggle("tp-filter-typed", input.value !== "");
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }
  showBubble(key2, column, input, anchor, head) {
    this.hideBubble();
    const { doc } = this.host;
    const element = doc.createElement("div");
    element.className = `${UI_CLASS} tp-floating tp-filter-bubble`;
    if (head) element.classList.add("tp-filter-popover");
    element.addEventListener("mousedown", (e) => {
      if (e.target !== input) e.preventDefault();
    });
    const body = doc.createElement("div");
    body.className = "tp-filter-bubble-body";
    if (head) element.append(head);
    element.append(body);
    doc.body.append(element);
    this.bubble = { element, body, input, key: key2, column, anchor, popover: !!head };
    this.renderBubble();
  }
  /**
   * A field lost the focus: its bubble goes, unless the focus went into it (a
   * value ticked), and the filters are stored once no field has it
   */
  left(key2, input, e) {
    const bubble = this.bubble;
    if (bubble?.input === input && e.relatedTarget instanceof Node && bubble.element.contains(e.relatedTarget)) return;
    if (bubble?.input === input) this.hideBubble();
    this.scheduleStore(key2);
  }
  hideBubble() {
    this.bubble?.element.remove();
    this.bubble = void 0;
  }
  /** The bubble's content for the field's text now, under what it belongs to */
  renderBubble() {
    const bubble = this.bubble;
    const info = bubble && this.table(bubble.key)?.[1];
    if (!bubble || !info) return;
    const { key: key2, column, input } = bubble;
    const { doc } = this.host;
    const values = this.columnValues(info, column);
    const parts = [];
    if (this.options.smart) {
      const filled2 = values.filter((v) => v.value !== "");
      const numeric = filled2.length > 0 && filled2.filter((v) => asNumber(v.value) !== void 0).length * 2 >= filled2.length;
      const hints = numeric ? [...NUMBER_HINTS, ...TEXT_HINTS.slice(0, 3)] : TEXT_HINTS;
      const list = doc.createElement("div");
      list.className = "tp-filter-hints";
      for (const hint of hints) {
        const b = doc.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.className = "tp-filter-hint";
        const code = doc.createElement("code");
        code.textContent = hint.code;
        b.append(code, ` ${hint.text}`);
        b.addEventListener("click", (e) => {
          e.preventDefault();
          this.type(key2, input, column, hint.apply(input.value.trim()));
          input.focus({ preventScroll: true });
          input.setSelectionRange(input.value.length, input.value.length);
        });
        list.append(b);
      }
      parts.push(list);
      const pickable = values.filter((v) => !v.value.includes("|"));
      if (pickable.length > 0 && pickable.length <= MAX_VALUES && values.length <= MAX_VALUES) {
        parts.push(this.valueList(key2, input, column, pickable));
      }
    }
    bubble.body.replaceChildren(...parts);
    bubble.element.classList.toggle("tp-visible", parts.length > 0 || bubble.popover);
    this.placeBubble();
  }
  /** Under what the bubble belongs to (the field, the header), inside the window */
  placeBubble() {
    const bubble = this.bubble;
    const anchor = bubble?.anchor();
    if (!bubble || !anchor) return;
    const win = this.host.doc.defaultView;
    const r = anchor.getBoundingClientRect();
    const m = bubble.element.getBoundingClientRect();
    const left = Math.max(4, Math.min(r.left - (bubble.popover ? 0 : 6), win.innerWidth - m.width - 4));
    const top = r.bottom + 6 + m.height > win.innerHeight - 4 ? Math.max(4, r.top - m.height - 6) : r.bottom + 6;
    bubble.element.style.left = `${Math.round(left)}px`;
    bubble.element.style.top = `${Math.round(top)}px`;
  }
  /** The column's values to tick: ticked are those the field's =a|b names */
  valueList(key2, input, column, values) {
    const { doc } = this.host;
    const text = input.value.trim();
    const ticked = new Set(text.startsWith("=") ? text.slice(1).split("|").map((v) => normalizeForFilter(v.trim())) : []);
    const list = doc.createElement("div");
    list.className = "tp-filter-values";
    for (const value of values) {
      const normalized = normalizeForFilter(value.value);
      const item = doc.createElement("label");
      item.className = "tp-filter-value";
      const box = doc.createElement("input");
      box.type = "checkbox";
      box.tabIndex = -1;
      box.checked = ticked.has(normalized);
      const label = doc.createElement("span");
      label.className = "tp-filter-value-label";
      label.textContent = value.label || "(empty)";
      const count = doc.createElement("span");
      count.className = "tp-filter-value-count";
      count.textContent = String(value.count);
      item.append(box, label, count);
      box.addEventListener("change", () => {
        const chosen = values.filter((v) => {
          const n = normalizeForFilter(v.value);
          return n === normalized ? box.checked : ticked.has(n);
        });
        const filter = chosen.length === 0 ? "" : chosen.length === 1 && chosen[0].value === "" ? "=|" : `=${chosen.map((v) => v.value).join("|")}`;
        this.type(key2, input, column, filter);
        input.focus({ preventScroll: true });
      });
      list.append(item);
    }
    return list;
  }
  /** A column's different values in its body rows (not the pinned ones), in the order they first come */
  columnValues(info, column) {
    const { top, bottom } = info.pins;
    const rows = this.host.bodyRows(info);
    const found = /* @__PURE__ */ new Map();
    rows.forEach((tr, i) => {
      if (i < top || i >= rows.length - bottom) return;
      const cell = tr.cells[column];
      if (!cell) return;
      const value = this.host.cellValue(cell).trim();
      const normalized = normalizeForFilter(value);
      const known2 = found.get(normalized);
      if (known2) known2.count++;
      else found.set(normalized, { value, label: cellText(cell).trim() || value, count: 1 });
    });
    return Array.from(found.values());
  }
};

// table-plus/src/features/functiondialog.ts
var FunctionDialog = class {
  constructor(host) {
    this.host = host;
  }
  host;
  dialog;
  /** Opens the dialog; `formula`: the formula being edited (the caret marked), `insert` gets the name picked */
  open(formula, insert) {
    const { doc } = this.host;
    const el = (tag, className, text) => {
      const e = doc.createElement(tag);
      e.className = className;
      if (text !== void 0) e.textContent = text;
      return e;
    };
    let group;
    let found = [];
    let picked = 0;
    const search = el("input", "tp-functions-search");
    search.type = "search";
    search.placeholder = "Search by name or what it does";
    search.setAttribute("aria-label", "Search functions");
    const groups = el("div", "tp-functions-groups");
    groups.setAttribute("role", "group");
    const list = el("div", "tp-functions-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Functions");
    const detail = el("div", "tp-functions-detail");
    const content = el("div", "tp-functions");
    const main = el("div", "tp-functions-main");
    main.append(list, detail);
    content.append(search, groups, main);
    const insertButton = el("button", "tp-dialog-primary", "Insert");
    insertButton.type = "button";
    const cancel = el("button", "tp-dialog-button", "Cancel");
    cancel.type = "button";
    const note = el("span", "tp-dialog-note");
    const footer = el("div", "tp-functions-foot");
    footer.append(note, cancel, insertButton);
    const choose = (index) => {
      const f = found[index];
      if (!f) return;
      this.close();
      insert(f.name);
    };
    const all = findFunctions("");
    const present = [
      void 0,
      ...Object.keys(FUNCTION_CATEGORIES).filter((c) => all.some((f) => f.category === c)),
      ...all.some((f) => f.category === void 0) ? ["custom"] : []
    ];
    const groupButtons = present.map((g) => {
      const button = el("button", "tp-functions-group", g === void 0 ? "All" : g === "custom" ? "Custom" : FUNCTION_CATEGORIES[g]);
      button.type = "button";
      button.addEventListener("click", () => {
        group = g;
        picked = 0;
        update();
        search.focus();
      });
      groups.append(button);
      return { group: g, button };
    });
    const showDetail = () => {
      detail.replaceChildren();
      const f = found[picked];
      insertButton.disabled = !f;
      if (!f) return;
      detail.append(el("h3", "tp-functions-name", f.name));
      detail.append(el("code", "tp-functions-syntax", f.syntax));
      if (f.description) detail.append(el("p", "tp-functions-description", f.description));
      if (f.example) {
        const example = el("div", "tp-functions-example");
        example.append(el("span", "tp-functions-label", "Example"), el("code", "", f.example));
        detail.append(example);
      }
      detail.append(el("p", "tp-functions-group-name", f.category ? FUNCTION_CATEGORIES[f.category] : "Custom function"));
    };
    const showPicked = () => {
      Array.from(list.children).forEach((option2, i) => option2.setAttribute("aria-selected", String(i === picked)));
      const option = list.children[picked];
      if (option) list.scrollTop = Math.max(Math.min(list.scrollTop, option.offsetTop), option.offsetTop + option.offsetHeight - list.clientHeight);
      showDetail();
    };
    const update = () => {
      found = findFunctions(search.value, group);
      picked = Math.min(picked, Math.max(0, found.length - 1));
      for (const { group: g, button } of groupButtons) button.setAttribute("aria-pressed", String(g === group));
      list.replaceChildren(
        ...found.map((f, i) => {
          const option = el("div", "tp-functions-option");
          option.setAttribute("role", "option");
          option.append(el("code", "", f.name), el("span", "", f.description.split(/(?<=\.)\s/)[0]));
          option.addEventListener("click", () => {
            picked = i;
            showPicked();
          });
          option.addEventListener("dblclick", () => choose(i));
          return option;
        })
      );
      if (found.length === 0) list.append(el("p", "tp-functions-none", "No function matches"));
      note.textContent = `${found.length} ${found.length === 1 ? "function" : "functions"}`;
      showPicked();
    };
    search.addEventListener("input", () => {
      picked = 0;
      update();
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        picked = Math.max(0, Math.min(found.length - 1, picked + (e.key === "ArrowDown" ? 1 : -1)));
        showPicked();
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(picked);
      }
    });
    insertButton.addEventListener("click", () => choose(picked));
    cancel.addEventListener("click", () => this.close());
    update();
    this.dialog = this.host.openDialog({
      title: "Functions",
      subtitle: formula,
      className: "tp-functions-dialog",
      content,
      footer,
      focus: search,
      closed: () => {
        this.dialog = void 0;
      }
    });
  }
  close() {
    this.dialog?.close();
  }
};

// table-plus/src/features/formulas.ts
var FORMULAS_NEED_METADATA = "Formulas are stored in the table: turn on the Store table metadata setting to add them (existing ones keep working)";
var REFERENCE_COLORS = ["#3b6fd4", "#d0453a", "#8a55c9", "#2f9a4a", "#d9771c", "#1c9c9c"];
var Formulas = class {
  constructor(host) {
    this.host = host;
    this.formulaHint = host.floating("div", "tp-formula-hint");
    this.functions = new FunctionDialog(host);
  }
  host;
  formulaHint;
  referenceMarks = [];
  stopReferenceDrag;
  // The reference last inserted by pointing at the table, and the cell its range started at
  pointed;
  stopPointing;
  // The functions offered for the name typed (a list under the cell): which one is picked, for which name
  // typed where (`key`), and the name Esc closed the list for (it opens again once the name changes)
  choosing;
  dismissed;
  // Every function, to find one by what it does and insert it (fx, Shift+F3, Insert function…)
  functions;
  // Tables whose formula cells show results from before a change made outside Table Plus
  stale = /* @__PURE__ */ new WeakSet();
  // Tables (as rendered) with formulas: their toolbar can recalculate them
  withFormulas = /* @__PURE__ */ new WeakSet();
  // The page's tables for formulas, as of the page's text and the other pages read
  source;
  /** The page's tables (as last read) formulas can refer to by name, and those of the other pages read */
  tableSource() {
    const { pageText, currentPage } = this.host;
    const others = this.host.otherPages();
    const key2 = `${others?.version ?? -1}\0${currentPage}\0${pageText}`;
    if (this.source?.key !== key2) {
      this.source = { key: key2, source: pageTables(() => pageTablesOf(pageText), currentPage, void 0, others) };
    }
    return this.source.source;
  }
  // ---- writing --------------------------------------------------------------------
  /**
   * The write step: calculated columns fill new rows, references follow moved
   * rows and columns, and the results are recalculated, other tables of the
   * page (the written one as edited) and of other pages read seen
   */
  writeStep(before, after, edit) {
    const { page } = edit;
    const tables = pageTables(() => page.tables, this.host.currentPage, { from: page.from, table: after }, this.host.otherPages());
    return formulasAfterEdit(before, after, { ...edit, tables });
  }
  /**
   * The tables of the page whose formulas refer to the written one (by its
   * name before or after the edit, or to its named cells), or in turn to those:
   * their results for it as written, their references to it following its
   * moved rows and columns and its new name. Other tables are left as they are.
   */
  otherTablesWritten(before, after, edit) {
    const { page } = edit;
    const now2 = pageTables(() => page.tables, this.host.currentPage, { from: page.from, table: after }, this.host.otherPages());
    const affected = affectedBy(before, after);
    const oldName = metaName(before)?.toLowerCase();
    const others = page.tables.filter((other) => other.range.from !== page.from).map((other) => ({ ...other, referred: referredBy(other.table) }));
    const written = [];
    for (let found = true; found; ) {
      found = false;
      for (let i = others.length - 1; i >= 0; i--) {
        const { range, table, referred } = others[i];
        if (!isAffected(referred, affected)) continue;
        others.splice(i, 1);
        found = true;
        addAffected(affected, table);
        const followed = oldName && referred.tables.has(oldName) ? followTable(table, before, after, edit.rowMap, edit.columnMap) : table;
        const recalculated = recalculate(followed, now2);
        if (recalculated !== table) written.push({ range, table: recalculated });
      }
    }
    return written;
  }
  /**
   * "Insert numbered column left" in a column's menu: a column "#" with =ROW()
   * in every row, a calculated column (rows added later get it too). As many
   * as wanted. New formulas need the metadata setting.
   */
  columnMenuInsertEntries(widget, info, column) {
    const insert = insertColumnAt(info.pins, info.columns, column);
    const blocked = !this.host.metadataEnabled ? FORMULAS_NEED_METADATA : insert.at > column ? "Columns pinned to the left stay at the left" : insert.at < column ? "Columns pinned to the right stay at the right" : void 0;
    return [
      {
        kind: "item",
        label: "Insert numbered column left",
        icon: ICONS.columnLeft,
        hint: "A column numbering the rows: =ROW() in each",
        disabled: blocked,
        run: () => void this.insertNumbered(widget, info, column)
      }
    ];
  }
  insertNumbered(widget, info, column) {
    const insert = insertColumnAt(info.pins, info.columns, column);
    return this.host.write(
      widget,
      (t) => {
        let table = setCell(insertColumn(t, insert.at), 0, insert.at, "#");
        for (let row = 1; row < table.rows.length; row++) table = setCell(table, row, insert.at, formulaCell("", "=ROW()"));
        return table;
      },
      { columnMap: (c) => c >= insert.at ? c + 1 : c, pins: insert.pins }
    );
  }
  /** Remove metadata removes the formulas: their cells keep their results */
  metadataPart(tables) {
    const count = tables.reduce((n, table) => n + formulaCount(table), 0);
    return count ? { count, what: "formula", note: "those cells keep their current results as plain values", tags: ["f"] } : void 0;
  }
  stop() {
    this.stopPointing?.();
    this.hideFormulaUi();
    this.formulaHint.remove();
  }
  // ---- the cell editor ----------------------------------------------------------
  /** The formula tag (<meta f>) is the module's: edited, it is what editorValue writes */
  takesTags() {
    return ["f"];
  }
  /** A formula cell's value is its formula's: pasting leaves it */
  keepsCell(cell) {
    return formulaOf(cell) ? "formula cell" : void 0;
  }
  /** A formula cell is edited as its formula; a text starting with "=" as '=…, so it stays text */
  editorText(_info, cell, original) {
    if (cell.row === 0) return void 0;
    const stored = formulaOf(original);
    if (stored) return stored.formula;
    const text = unescapeCell(withoutTags(original));
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
      if (!["Shift", "Control", "Alt", "Meta", "F4"].includes(e.key)) this.pointed = void 0;
    });
    this.updateFormulaUi();
  }
  /**
   * While a function name is typed, the list of the functions it may be takes
   * the keys: ↑ / ↓ pick one, Tab or Enter insert it, Esc closes the list
   * (the editor stays)
   */
  editorKeyDown(e, editor) {
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    if (e.key === "F3" && e.shiftKey && editor.row > 0 && this.allowed(editor)) {
      this.openFunctions(editor);
      return true;
    }
    if (e.key === "F4" && !e.shiftKey && editor.row > 0 && this.allowed(editor) && isFormulaInput(editor.field.value)) return this.cycleFixed(editor);
    const choices = this.choicesNow(editor);
    if (!choices || !this.choosing) return false;
    const { index } = this.choosing;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        this.choosing.index = Math.max(0, Math.min(choices.names.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
        this.updateFormulaUi();
        return true;
      case "Tab":
      case "Enter":
        if (e.shiftKey) return false;
        this.insertFunction(editor, choices, index);
        return true;
      case "Escape":
        this.dismissed = this.choosing.key;
        this.choosing = void 0;
        this.updateFormulaUi();
        return true;
      default:
        return false;
    }
  }
  owns(node) {
    return this.formulaHint.contains(node);
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
    this.functions.close();
    this.stopPointing?.();
    this.pointed = void 0;
    this.choosing = void 0;
    this.dismissed = void 0;
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
    if (formulaCount(model) === 0) return;
    this.withFormulas.add(info.table);
    const tables = this.tableSource();
    if (recalculate(model, tables) !== model) this.stale.add(info.table);
    this.markCells(info, model, tables);
  }
  /**
   * AutoFill: a formula cell copied into another cell, its references moved
   * as far (those fixed with $ not); its result is calculated as it is
   * written. A new formula is metadata: without the setting it is copied as
   * its value.
   */
  fillCell(info, cell, from, to) {
    const stored = formulaOf(cell);
    if (!stored || from.row === 0 || to.row === 0 || !this.host.metadataEnabled) return void 0;
    const table = parseTable(info.source);
    const size = { rows: table.rows.length - 1, columns: table.rows[0]?.cells.length ?? 0 };
    return formulaCell("", filledFormula(stored.formula, to.row - from.row, to.column - from.column, size));
  }
  /** Insert function… in a body cell's menu: the cell edited (its formula, or a new one) and the Functions dialog for it */
  cellMenuEntries(_widget, info, cells) {
    const [cell] = cells;
    if (cells.length !== 1 || !cell || cell.row === 0) return void 0;
    const hasFormula = formulaOf(parseTable(info.source).rows[cell.row]?.cells[cell.column] ?? "") !== void 0;
    const allowed = this.host.metadataEnabled || hasFormula;
    return {
      // After clearing and moving: what is written into the cell
      order: 1.2,
      entries: [
        {
          kind: "item",
          label: "Insert function\u2026",
          icon: ICONS.function,
          ...allowed ? { hint: hasFormula ? "Edit the cell's formula with a function found by its name or what it does" : "Start a formula in the cell with a function found by its name or what it does" } : { disabled: FORMULAS_NEED_METADATA },
          run: () => {
            this.host.editCell(info, cell, hasFormula ? void 0 : "replace");
            const active = this.host.editing;
            if (!active || active.row !== cell.row || active.column !== cell.column) return;
            const field = active.field;
            if (!hasFormula) field.value = "=";
            field.setSelectionRange(field.value.length, field.value.length);
            this.updateFormulaUi();
            this.openFunctions(active);
          }
        }
      ]
    };
  }
  /** Formula cells marked, with their formulas and the reasons of their errors as their titles */
  markCells(info, model, tables) {
    let errors;
    for (const tr of this.host.bodyRows(info)) {
      const row = Number(tr.dataset.tpRow);
      model.rows[row]?.cells.forEach((raw, column) => {
        const stored = formulaOf(raw);
        const cell = tr.cells[column];
        if (!stored || !cell) return;
        const error = isErrorText(stored.value) ? (errors ??= formulaErrors(model, tables)).get(`${row},${column}`) : void 0;
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
    this.recheck(widget, false);
  }
  /** Another page whose tables formulas read was changed, or the custom functions were defined anew */
  tablesChanged() {
    this.recheck(void 0, true);
  }
  /**
   * Checks again whether the tables that refer to other tables (but `except`)
   * are out of date; `withCustom`: those that call custom functions too (they
   * were defined anew, which an edit of a table does not do)
   */
  recheck(except, withCustom) {
    const tables = this.tableSource();
    for (const other of Array.from(this.host.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = other === except ? void 0 : this.host.infoOf(other);
      if (!info || !this.withFormulas.has(info.table)) continue;
      const model = parseTable(info.source);
      const refersElsewhere = referredTableNames(model).size > 0 || referredPages(model).size > 0 || referredCellNames(model).size > 0;
      if (!refersElsewhere && !(withCustom && callsCustomFunctions(model))) continue;
      if (recalculate(model, tables) !== model) this.stale.add(info.table);
      else this.stale.delete(info.table);
      this.markCells(info, model, tables);
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
        place: "icon",
        icon: ICONS.recalculate,
        attention: stale,
        title: stale ? "Recalculate: some formula results are out of date (the table was changed outside Table Plus, TODAY() moved on, or a custom function changed)" : "Recalculate the formulas (their results are up to date)",
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
      const rect = editorRect(active);
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
  /** F4 in a formula: the $ of the reference at the caret cycled, the caret after it */
  cycleFixed(active) {
    const field = active.field;
    const caret = field.selectionEnd ?? field.value.length;
    const cycled = cycleFixed(field.value, caret);
    if (!cycled) return false;
    this.replaceInField(field, cycled.from, cycled.to, cycled.text);
    const pointed = this.pointed;
    if (pointed?.field === field && pointed.from === cycled.from && pointed.to === cycled.to) {
      this.pointed = { ...pointed, to: cycled.from + cycled.text.length, text: cycled.text };
    }
    field.setSelectionRange(cycled.from + cycled.text.length, cycled.from + cycled.text.length);
    this.updateFormulaUi();
    return true;
  }
  /**
   * The functions the name typed right before the caret may be, while the
   * list of them is not closed for that name; keeps which one is picked
   */
  choicesNow(active) {
    if (active.row === 0 || !this.allowed(active)) return void 0;
    const field = active.field;
    const length = field.value.length;
    const choices = functionChoices(field.value, field.selectionStart ?? length, field.selectionEnd ?? length);
    if (!choices) return void 0;
    const typed = field.value.slice(choices.from, choices.to);
    if (this.tableSource().cell?.(typed)) return void 0;
    const key2 = `${choices.from}:${typed}`;
    if (this.dismissed === key2) return void 0;
    if (this.choosing?.key !== key2) this.choosing = { key: key2, index: 0 };
    return choices;
  }
  /** Puts a function offered in place of the name typed, with its "(": the help for its arguments follows */
  insertFunction(active, choices, index) {
    const text = `${choices.names[index]}(`;
    this.replaceInField(active.field, choices.from, choices.to, text);
    const caret = choices.from + text.length;
    active.field.setSelectionRange(caret, caret);
    this.choosing = void 0;
    this.updateFormulaUi();
  }
  /**
   * The Functions dialog for the cell edited: the function picked goes where
   * the caret was, in place of the name typed there, after a "+" where it
   * would follow an operand (as a spreadsheet does); into a text that is no
   * formula yet, as the formula's start (=NAME()
   */
  openFunctions(active) {
    const field = active.field;
    const length = field.value.length;
    const start = field.selectionStart ?? length;
    const end = field.selectionEnd ?? length;
    const value = field.value;
    const shown = value.trimStart().startsWith("=") ? `${value.slice(0, start)}\u258C${value.slice(end)}` : "=\u258C";
    this.functions.open(shown, (name) => {
      if (this.host.editing !== active) return;
      const text = `${name}(`;
      if (!field.value.trimStart().startsWith("=")) {
        this.replaceInField(field, 0, field.value.length, `=${text}`);
        field.setSelectionRange(field.value.length, field.value.length);
      } else {
        const typed = nameTyped(field.value, start, end) ?? { from: start, to: end };
        const inserted = needsOperator(field.value, typed.from) ? `+${text}` : text;
        this.replaceInField(field, typed.from, typed.to, inserted);
        field.setSelectionRange(typed.from + inserted.length, typed.from + inserted.length);
      }
      this.choosing = void 0;
      this.updateFormulaUi();
    });
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
    const { doc } = this.host;
    const hint = this.formulaHint;
    const body = doc.createElement("div");
    body.className = "tp-formula-hint-body";
    hint.replaceChildren(this.functionsButton(active), body);
    if (refs.length) {
      const line = doc.createElement("div");
      line.className = "tp-formula-preview";
      let at = 0;
      refs.forEach((ref, index) => {
        line.append(formula.slice(at, ref.from));
        const span = doc.createElement("span");
        span.style.color = REFERENCE_COLORS[index % REFERENCE_COLORS.length];
        span.textContent = formula.slice(ref.from, ref.to);
        line.append(span);
        at = ref.to;
      });
      line.append(formula.slice(at));
      body.append(line);
    }
    const choices = this.choicesNow(active);
    if (choices && this.choosing) {
      body.append(this.choiceList(active, choices, this.choosing.index));
      const picked2 = functionNamed(choices.names[this.choosing.index]);
      body.append(this.helpLine({ syntax: picked2.syntax, description: picked2.description }));
      body.append(Object.assign(doc.createElement("div"), { className: "tp-formula-tab", textContent: "Tab or Enter: insert \xB7 \u2191 \u2193: pick \xB7 Esc: close" }));
    } else {
      const help = formulaHelp(formula, active.field.selectionStart ?? formula.length);
      if (help) body.append(this.helpLine(help));
    }
    const info = this.host.infoOf(active.widget);
    const cell = active.cell.getBoundingClientRect();
    if (info && (cell.width > 0 || cell.height > 0) && !this.host.shownPart(active.widget, info, active.cell)) {
      hint.classList.remove("tp-visible");
      return;
    }
    const rect = editorRect(active);
    hint.classList.remove("tp-above");
    this.host.place(hint, rect.left, rect.bottom + 4);
    const list = hint.querySelector(".tp-formula-choices");
    const picked = list?.querySelector('[aria-selected="true"]');
    if (list && picked) list.scrollTop = Math.max(0, picked.offsetTop + picked.offsetHeight - list.clientHeight);
    const view = this.host.viewBounds(active.widget);
    const below = view.bottom - (rect.bottom + 4);
    const above = rect.top - 4 - view.top;
    if (hint.offsetHeight > below && above > below) {
      hint.classList.add("tp-above");
      this.host.place(hint, rect.left, rect.top - 4 - hint.offsetHeight);
    }
  }
  /** The functions a name typed may be, the one picked marked; a click inserts one */
  choiceList(active, choices, index) {
    const { doc } = this.host;
    const list = doc.createElement("div");
    list.className = "tp-formula-choices";
    list.setAttribute("role", "listbox");
    choices.names.forEach((name, i) => {
      const option = doc.createElement("div");
      option.className = "tp-formula-choice";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(i === index));
      const code = doc.createElement("code");
      code.textContent = name;
      const description = doc.createElement("span");
      description.textContent = (functionNamed(name)?.description ?? "").split(/(?<=\.)\s/)[0];
      option.append(code, description);
      option.addEventListener("mousedown", (e) => e.preventDefault());
      option.addEventListener("click", () => {
        if (this.host.editing === active) this.insertFunction(active, choices, i);
      });
      list.append(option);
    });
    return list;
  }
  /** fx: every function, in the Functions dialog */
  functionsButton(active) {
    const more = this.host.doc.createElement("button");
    more.type = "button";
    more.className = "tp-formula-functions";
    more.title = "Functions: find one by its name or what it does (Shift+F3)";
    more.setAttribute("aria-label", more.title);
    more.innerHTML = ICONS.function;
    more.addEventListener("mousedown", (e) => e.preventDefault());
    more.addEventListener("click", () => {
      if (this.host.editing === active) this.openFunctions(active);
    });
    return more;
  }
  /** A function's syntax, the argument the caret is in marked, and what it does */
  helpLine(help) {
    const { doc } = this.host;
    const item = doc.createElement("div");
    item.className = "tp-formula-help";
    const syntax = doc.createElement("code");
    const { argument } = help;
    if (argument) {
      const current = doc.createElement("b");
      current.className = "tp-formula-argument";
      current.textContent = help.syntax.slice(argument.from, argument.to);
      syntax.append(help.syntax.slice(0, argument.from), current, help.syntax.slice(argument.to));
    } else {
      syntax.textContent = help.syntax;
    }
    const description = doc.createElement("span");
    description.textContent = help.description;
    item.append(syntax, description);
    return item;
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
    return this.host.shownRows(info).filter((tr) => tr.dataset.tpRow !== void 0).map((tr) => ({ tr, row: Number(tr.dataset.tpRow) - 1 }));
  }
  /**
   * Screen boxes outlining an area: one per run of its rows that are shown
   * next to each other (sorting and filters can split an area), clipped to
   * the table's visible box
   */
  areaBoxes(widget, info, area) {
    const box = this.host.innerBox(widget);
    const view = this.host.viewBounds(widget);
    const clip = {
      left: Math.max(box.left, view.left),
      top: Math.max(box.top, view.top),
      right: Math.min(box.right, view.right),
      bottom: Math.min(box.bottom, view.bottom)
    };
    const { tHead: head, tFoot: foot } = info.table;
    const under = head ? head.getBoundingClientRect().bottom : -Infinity;
    const over = foot?.rows.length ? foot.getBoundingClientRect().top : Infinity;
    const boxes = [];
    let run = [];
    const flush = () => {
      const first = run[0]?.cells[area.left];
      const last = run[run.length - 1]?.cells[area.right];
      run = [];
      if (!first || !last) return;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      const top = first.closest("tbody") ? Math.max(clip.top, under) : clip.top;
      const bottom = last.closest("tbody") ? Math.min(clip.bottom, over) : clip.bottom;
      const outline = {
        left: Math.max(Math.min(a.left, b.left), clip.left),
        top: Math.max(Math.min(a.top, b.top), top),
        right: Math.min(Math.max(a.right, b.right), clip.right),
        bottom: Math.min(Math.max(a.bottom, b.bottom), bottom)
      };
      if (outline.right > outline.left && outline.bottom > outline.top) boxes.push(outline);
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
        return areaText(
          {
            top: Math.min(startArea.top, cell.row),
            left: Math.min(startArea.left, cell.column),
            bottom: Math.max(startArea.top, cell.row),
            right: Math.max(startArea.left, cell.column)
          },
          ref.fixed
        );
      }
      const height = startArea.bottom - startArea.top;
      const width = startArea.right - startArea.left;
      const top = clamp(startArea.top + dRow, lastRow - height);
      const left = clamp(startArea.left + dColumn, lastColumn - width);
      return areaText({ top, left, bottom: top + height, right: left + width }, ref.fixed);
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
function wrapRuns(entries, wrap) {
  return entries.map(
    (entry) => entry.kind === "item" ? { ...entry, run: wrap(entry.run) } : entry.kind === "segmented" || entry.kind === "actions" ? { ...entry, options: entry.options.map((option) => ({ ...option, run: wrap(option.run) })) } : entry
  );
}
function keepFocus(menu) {
  menu.addEventListener("mousedown", (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  });
}
function startNaming(menu) {
  menu.querySelector(".tp-menu-rename:not([aria-disabled])")?.click();
}
function renderMenu(doc, title, entries, back, naming) {
  const menu = doc.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);
  if (back) menu.dataset.tpList = "";
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
  if (naming) addNaming(doc, menu, heading, naming);
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
    if (detail.text) {
      const text = doc.createElement("p");
      text.textContent = detail.text;
      parts.push(text);
    }
    for (const note of detail.notes ?? []) {
      const p = doc.createElement("p");
      p.className = "tp-menu-detail-note";
      p.textContent = note;
      parts.push(p);
    }
    if (detail.content) parts.push(detail.content());
    bubble.replaceChildren(...parts);
    bubble.hidden = false;
    bubble.classList.remove("tp-left");
    bubble.style.top = `${item.offsetTop}px`;
    const view = doc.defaultView;
    if (view && bubble.getBoundingClientRect().right > view.innerWidth - 8) bubble.classList.add("tp-left");
    const below = view ? bubble.getBoundingClientRect().bottom - (view.innerHeight - 8) : 0;
    if (below > 0) bubble.style.top = `${item.offsetTop - below}px`;
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
    } else if (entry.kind === "actions") {
      const bar = doc.createElement("div");
      bar.className = "tp-menu-actions";
      bar.setAttribute("role", "group");
      for (const option of entry.options) {
        const b = button("tp-action", option.run, option.disabled);
        b.setAttribute("role", "menuitem");
        b.setAttribute("aria-label", option.title);
        b.title = option.disabled ? `${option.title}: ${option.disabled}` : option.title;
        b.innerHTML = `<span class="tp-icon">${option.icon}</span>`;
        const caption = doc.createElement("span");
        caption.className = "tp-action-caption";
        caption.textContent = option.caption;
        b.append(caption);
        bar.append(b);
      }
      menu.append(bar);
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
        const b = button("tp-segment", option.run, option.disabled);
        if (option.active === void 0) b.setAttribute("role", "menuitem");
        else {
          b.setAttribute("role", "menuitemradio");
          b.setAttribute("aria-checked", String(option.active));
        }
        b.title = option.disabled ? `${option.title}: ${option.disabled}` : option.title;
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
    if (e.target instanceof HTMLInputElement) return;
    const buttons = Array.from(
      menu.querySelectorAll("button:not([aria-disabled]):not(.tp-menu-rename)")
    );
    const index = buttons.indexOf(doc.activeElement);
    const focus = (i) => buttons[(i + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    const inRow = index >= 0 && (buttons[index].classList.contains("tp-segment") || buttons[index].classList.contains("tp-action"));
    if (e.key === "ArrowDown" || e.key === "ArrowRight" && inRow) {
      e.preventDefault();
      focus(index + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" && inRow) {
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
function addNaming(doc, menu, heading, naming) {
  const pencil = doc.createElement("button");
  pencil.type = "button";
  pencil.className = "tp-menu-rename";
  pencil.innerHTML = PENCIL;
  pencil.setAttribute("aria-label", naming.label);
  pencil.title = naming.disabled ? `${naming.label}: ${naming.disabled}` : naming.label;
  if (naming.disabled) pencil.setAttribute("aria-disabled", "true");
  heading.append(pencil);
  let saving = false;
  pencil.addEventListener("click", (e) => {
    e.preventDefault();
    if (naming.disabled) return;
    const field = doc.createElement("input");
    field.type = "text";
    field.className = "tp-menu-name";
    field.value = naming.name ?? "";
    field.placeholder = "name";
    field.setAttribute("aria-label", naming.label);
    field.autocomplete = "off";
    field.spellcheck = false;
    const problem = doc.createElement("div");
    problem.className = "tp-menu-name-problem";
    problem.id = `tp-menu-name-problem-${++problemIds}`;
    problem.setAttribute("role", "alert");
    problem.hidden = true;
    field.setAttribute("aria-describedby", problem.id);
    const titled = Array.from(heading.childNodes);
    heading.replaceChildren(field);
    heading.after(problem);
    heading.classList.add("tp-naming");
    const leave = () => {
      heading.classList.remove("tp-naming");
      heading.replaceChildren(...titled);
      problem.remove();
      menu.focus({ preventScroll: true });
    };
    field.addEventListener("keydown", (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        leave();
      } else if (ev.key === "Enter" && !saving) {
        ev.preventDefault();
        ev.stopPropagation();
        saving = true;
        problem.hidden = true;
        field.removeAttribute("aria-invalid");
        void naming.save(field.value.trim()).then((why) => {
          saving = false;
          if (why === void 0 || !field.isConnected) return;
          problem.textContent = why;
          problem.hidden = false;
          field.setAttribute("aria-invalid", "true");
          field.focus();
        });
      }
    });
    field.focus();
    field.select();
  });
}
var problemIds = 0;
var PENCIL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>';
function focusMenu(menu) {
  const current = menu.dataset.tpList !== void 0 ? menu.querySelector('.tp-menu-item[aria-checked="true"]') : null;
  if (!current) {
    menu.tabIndex = -1;
    menu.focus({ preventScroll: true });
    return;
  }
  menu.classList.add("tp-menu-still");
  current.classList.add("tp-menu-current");
  current.focus({ preventScroll: true });
  menu.addEventListener("pointermove", () => menu.classList.remove("tp-menu-still"), { once: true });
  current.addEventListener("blur", () => current.classList.remove("tp-menu-current"), { once: true });
}

// table-plus/src/features/grips.ts
var DRAG_THRESHOLD = 4;
var TOUCH_DRAG_THRESHOLD = 10;
var GRIP_THICKNESS = 12;
var ROW_GRIP_LENGTH = 32;
var COLUMN_GRIP_LENGTH = 44;
var AUTOSCROLL_EDGE = 40;
var AUTOSCROLL_STEP = 12;
var LONG_PRESS_MS = 550;
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
  /**
   * The open menu, for the row (column) `line`. It stays where its grip was,
   * kept beside that row's first cell (the column's header) by `anchor`, while
   * the grips go on following the pointer: a click on another opens its menu instead.
   */
  menu;
  dragging = false;
  // Select rows (columns): from the row (column) `from` to the one under the pointer, in the table `key`
  picking;
  // The grips select lines themselves (their menu stays for them)
  selectingLines = false;
  // The line a grip's click selected last: Shift+click on another grip selects from it, as a spreadsheet's anchor
  lineAnchor;
  // The press on a grip going on opened its menu otherwise (a right click: macOS's Ctrl+click, Android's long press): its end does nothing
  pressOpenedMenu = false;
  // The lines selected whole, by table and axis, worked out once per selection (a grip is marked on every hover)
  linesSelected;
  /**
   * A grip of a line selected (whole) is marked: its click opens the menu
   * (CSS: the context-menu pointer); in select mode a grip's first click only
   * selects, and its title says so
   */
  markGrips() {
    const target = this.target;
    if (!target) return;
    const selects = this.host.clickSelects();
    const rearranged = this.host.rearranged(target.info);
    if (this.linesSelected?.key !== target.info.key) {
      this.linesSelected = {
        key: target.info.key,
        row: new Set(this.wholeLinesSelected(target.info, "row")),
        column: new Set(this.wholeLinesSelected(target.info, "column"))
      };
    }
    for (const axis of ["row", "column"]) {
      const grip = axis === "row" ? this.rowGrip : this.columnGrip;
      const line = axis === "row" ? target.row : target.column;
      const selected = line !== void 0 && this.linesSelected[axis].has(line);
      grip.classList.toggle("tp-line-selected", selects && selected);
      const name = axis === "row" ? "Row" : "Column";
      const click = selects && !selected ? "click to select, again (or right-click) for actions" : "click for actions";
      const drag = axis === "row" && rearranged ? ` (${MOVE_BLOCKED.toLowerCase()})` : ", drag to move";
      grip.title = `${name}: ${click}${drag}`;
      grip.setAttribute("aria-label", grip.title);
    }
  }
  start() {
    this.rowGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "column"));
    this.rowGrip.addEventListener("contextmenu", (e) => this.onGripMenu(e, "row"));
    this.columnGrip.addEventListener("contextmenu", (e) => this.onGripMenu(e, "column"));
    for (const [grip, axis] of [[this.rowGrip, "row"], [this.columnGrip, "column"]]) {
      grip.addEventListener("pointerenter", () => this.tint(axis));
      grip.addEventListener("pointerleave", () => this.tint(void 0));
    }
  }
  /** The cells of the hovered grip's row or column tinted; undefined: none */
  tint(axis) {
    for (const cell of Array.from(this.host.doc.querySelectorAll(".tp-handle-hover"))) cell.classList.remove("tp-handle-hover");
    const target = this.target;
    if (!axis || !target || this.dragging) return;
    for (const cell of this.cellsOf(target, axis)) cell.classList.add("tp-handle-hover");
  }
  /** The cells of the target's row, or of its column (the header's included) */
  cellsOf(target, axis) {
    const { info } = target;
    if (axis === "row") {
      const tr = target.row === void 0 ? void 0 : this.host.bodyRows(info)[target.row - 1];
      return tr ? Array.from(tr.cells) : [];
    }
    return [info.table.rows[0], ...this.host.bodyRows(info)].flatMap((tr) => tr.cells[target.column] ?? []);
  }
  stop() {
    this.endPicking();
    this.closeMenu(false);
    this.rowGrip.remove();
    this.columnGrip.remove();
  }
  owns(node) {
    return this.rowGrip.contains(node) || this.columnGrip.contains(node) || !!this.menu?.element.contains(node);
  }
  // While a grip is dragged the hover controls stay; with a menu open, or rows being selected, the grips stay in its table
  pointerBusy() {
    return this.dragging ? "drag" : this.menu || this.picking ? "menu" : void 0;
  }
  // A press outside an open menu closes it
  mouseDown(e) {
    if (this.picking && this.pickedBy(e)) return true;
    if (this.menu && e.target instanceof Node && !this.host.isFloating(e.target)) this.closeMenu(false);
    return false;
  }
  keyDown(e) {
    const picking = this.picking;
    if (e.key === "Escape" && picking) {
      e.preventDefault();
      e.stopPropagation();
      const widget = this.host.widgetForKey(picking.key);
      const info = widget && this.host.infoOf(widget);
      if (info) this.selectLines(info, picking.axis, picking.from, picking.from);
      this.endPicking();
      return true;
    }
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
    const picking = this.picking;
    if (picking?.key === info.key && (picking.axis === "column" || ref.row > 0)) {
      this.selectLines(info, picking.axis, picking.from, picking.axis === "row" ? ref.row : ref.column);
    }
    const tr = cell.parentElement;
    const shown = this.host.shownRect(widget, info);
    const rearranged = this.host.rearranged(info);
    if (ref.row > 0) {
      const rowRect = tr.getBoundingClientRect();
      this.rowGrip.classList.toggle("tp-no-drag", rearranged);
      const length = Math.max(GRIP_THICKNESS, Math.min(rowRect.height - 8, ROW_GRIP_LENGTH));
      Object.assign(this.rowGrip.style, { width: `${GRIP_THICKNESS}px`, height: `${length}px` });
      this.host.place(this.rowGrip, shown.left - GRIP_THICKNESS / 2, rowRect.top + (rowRect.height - length) / 2);
    } else {
      this.rowGrip.classList.remove("tp-visible");
    }
    const headerCell = info.table.rows[0].cells[ref.column];
    if (headerCell) {
      const h = headerCell.getBoundingClientRect();
      const length = Math.max(GRIP_THICKNESS, Math.min(h.width - 8, COLUMN_GRIP_LENGTH));
      Object.assign(this.columnGrip.style, { width: `${length}px`, height: `${GRIP_THICKNESS}px` });
      const center = Math.max(shown.left + length / 2, Math.min(h.left + h.width / 2, shown.right - length / 2));
      this.host.place(this.columnGrip, center - length / 2, h.top - GRIP_THICKNESS / 2);
    }
    const menu = this.menu;
    this.rowGrip.classList.toggle("tp-active", !menu?.byPoint && menu?.axis === "row" && menu.line === ref.row);
    this.columnGrip.classList.toggle("tp-active", !menu?.byPoint && menu?.axis === "column" && menu.line === ref.column);
    this.markGrips();
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
    this.tint(void 0);
    this.target = void 0;
  }
  // ---- a press on a grip: a click opens its menu, a drag moves -------------
  /** A right click on a grip: the line selected (unless it is among the lines selected) and its menu open */
  onGripMenu(e, axis) {
    const target = this.target;
    e.preventDefault();
    e.stopPropagation();
    if (!target || axis === "row" && target.row === void 0) return;
    this.pressOpenedMenu = true;
    this.openMenu(target, axis);
  }
  /** The line selected (the lines selected stay when they hold it) and its menu open, not closed when it is already */
  openMenu(target, axis) {
    const line = axis === "row" ? target.row : target.column;
    this.select(target, axis);
    if (this.menu?.axis === axis && this.menu.line === line) return;
    this.toggleMenu(axis, target, axis === "row" ? this.rowGrip : this.columnGrip);
  }
  onGripPointerDown(e, axis) {
    const target = this.target;
    if (e.button !== 0 || !target || axis === "row" && target.row === void 0) return;
    e.preventDefault();
    const grip = axis === "row" ? this.rowGrip : this.columnGrip;
    const line = axis === "row" ? target.row : target.column;
    this.pressOpenedMenu = false;
    const threshold = e.pointerType === "touch" ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD;
    const wasSelected = this.wholeLinesSelected(target.info, axis).includes(line);
    let pressedLong = false;
    const longPress = e.pointerType === "touch" ? setTimeout(() => {
      if (drag) return;
      pressedLong = true;
      this.openMenu(target, axis);
    }, LONG_PRESS_MS) : void 0;
    const canDrag = axis === "column" || !this.host.rearranged(target.info);
    const win = this.host.doc.defaultView;
    const startX = e.clientX;
    const startY = e.clientY;
    let drag;
    const move = (ev) => {
      if (!drag) {
        if (pressedLong || this.pressOpenedMenu) return;
        if (!canDrag || Math.hypot(ev.clientX - startX, ev.clientY - startY) < threshold) return;
        clearTimeout(longPress);
        this.closeMenu(false);
        drag = this.beginDrag(target, axis, axis === "row" ? startY : startX);
      }
      drag.move(ev);
    };
    const cleanup = () => {
      clearTimeout(longPress);
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", up);
      win.removeEventListener("pointercancel", cancel);
      win.removeEventListener("keydown", escape, true);
    };
    const cancel = () => {
      cleanup();
      drag?.finish(false);
    };
    const extend = e.shiftKey;
    const up = () => {
      cleanup();
      if (drag) drag.finish(true);
      else if (pressedLong || this.pressOpenedMenu) return;
      else if (extend) {
        this.closeMenu(false, false);
        this.extendTo(target, axis);
        this.markGrips();
      } else if (this.host.clickSelects() && !wasSelected) {
        this.closeMenu(false, false);
        this.select(target, axis);
        this.markGrips();
      } else {
        this.select(target, axis);
        this.toggleMenu(axis, target, grip);
      }
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
  /**
   * A drag of a grip: a copy of the row (column) follows the pointer, the
   * others move aside to show where it goes (within its pin zone), and the
   * page scrolls near its edges. Dropped, the row (column) moves there.
   */
  /** The whole row (column) selected, as shown: the header and the rows a filter leaves */
  select(target, axis) {
    const { info } = target;
    const line = axis === "row" ? target.row : target.column;
    const lines = this.wholeLinesSelected(info, axis);
    if (lines.length > 1 && lines.includes(line)) return;
    this.lineAnchor = { key: info.key, axis, line };
    this.selectLines(info, axis, line, line);
  }
  /** The rows (columns) selected whole, as shown; none when the selection is not whole rows (columns) */
  wholeLinesSelected(info, axis) {
    const cells = this.host.selectedCells(info);
    const lines = [...new Set(cells.map((ref) => axis === "row" ? ref.row : ref.column))];
    const whole = axis === "row" ? info.columns : this.host.shownRows(info).length;
    return lines.length > 0 && cells.length === lines.length * whole && (axis === "column" || !lines.includes(0)) ? lines : [];
  }
  /**
   * Shift+click on a grip: the rows (columns) from the one a click selected
   * (the anchor, while still selected), else from the first of those selected
   * whole, else from the cells selected, to this one
   */
  extendTo(target, axis) {
    const { info } = target;
    const line = axis === "row" ? target.row : target.column;
    const lines = this.wholeLinesSelected(info, axis);
    const anchor = this.lineAnchor;
    const cells = this.host.selectedCells(info);
    const fromCell = cells[0] && (axis === "row" ? cells[0].row > 0 ? cells[0].row : void 0 : cells[0].column);
    const from = anchor && anchor.key === info.key && anchor.axis === axis && lines.includes(anchor.line) ? anchor.line : lines.length > 0 ? lines[0] : fromCell ?? line;
    this.endPicking();
    this.selectLines(info, axis, from, line);
    this.lineAnchor = { key: info.key, axis, line: from };
  }
  /** Selects the rows (columns) from `from` to `to`, as shown; a column with its header and every row shown */
  selectLines(info, axis, from, to) {
    this.selectingLines = true;
    try {
      if (axis === "row") {
        this.host.selectCells(info, { row: from, column: 0 }, { row: to, column: info.columns - 1 });
        return;
      }
      const shown = this.host.shownRows(info);
      const last = Number(shown[shown.length - 1]?.dataset.tpRow ?? 0);
      this.host.selectCells(info, { row: 0, column: from }, { row: last, column: to });
    } finally {
      this.selectingLines = false;
    }
  }
  cellMenuOpened() {
    this.closeMenu(false, false);
  }
  /**
   * The cell menu asked for on a cell of rows (columns) selected whole: their
   * menu instead, by the point (the same as their grip's), as a spreadsheet
   * gives a row's commands for a row selected. On a header: its column's menu,
   * the column selected as its grip selects it (the header names the column;
   * a selection of several cells holding it keeps the selection's menu)
   */
  cellMenu(widget, info, at, point) {
    const selected = this.host.selectedCells(info);
    const inSelection = selected.length > 1 && selected.some((ref) => ref.row === at.row && ref.column === at.column);
    for (const axis of ["row", "column"]) {
      const line = axis === "row" ? at.row : at.column;
      if (axis === "row" && at.row === 0) continue;
      const whole = this.wholeLinesSelected(info, axis).includes(line);
      const header = axis === "column" && at.row === 0 && !inSelection;
      if (!whole && !header) continue;
      const cell = this.host.cellAt(info, at);
      if (!cell) return false;
      const target = { widget, info, column: at.column, ...at.row > 0 ? { row: at.row } : {} };
      this.target = target;
      this.closeMenu(false, false);
      if (!whole) this.select(target, axis);
      this.toggleMenu(axis, target, axis === "row" ? this.rowGrip : this.columnGrip, { cell, ...point });
      return true;
    }
    return false;
  }
  // The cells selected otherwise (a touch's handles, keys): the menu was for the lines selected before
  selectionChanged() {
    this.linesSelected = void 0;
    if (!this.selectingLines && this.menu) this.closeMenu(false, false);
    this.markGrips();
  }
  // ---- Select rows (columns): the pointer picks the other end, a click ends it ----------
  startPicking(info, axis, line) {
    void this.host.saveEditing();
    this.picking = { key: info.key, axis, from: line };
    this.host.doc.body.classList.add(axis === "row" ? "tp-picking-rows" : "tp-picking-columns");
    this.selectLines(info, axis, line, line);
    void this.host.bridge.flash(
      `Table Plus: move to the last ${axis} to select and click in the table; Esc keeps just this one`,
      "info"
    );
  }
  /**
   * A press while selecting rows (columns): in the table, the selection ends at
   * the row (column) pressed (taken: no cell editor opens); elsewhere it just ends
   */
  pickedBy(e) {
    const picking = this.picking;
    this.endPicking();
    const widget = this.host.widgetForKey(picking.key);
    const info = widget && this.host.infoOf(widget);
    if (!info || e.button !== 0 || !(e.target instanceof Element)) return false;
    const cell = this.host.tableCellOf(info, e.target);
    const ref = cell && this.host.cellRef(info, cell);
    if (!ref) return false;
    e.preventDefault();
    e.stopPropagation();
    const to = picking.axis === "row" ? ref.row > 0 ? ref.row : void 0 : ref.column;
    if (to !== void 0) this.selectLines(info, picking.axis, picking.from, to);
    return true;
  }
  endPicking() {
    if (!this.picking) return;
    this.picking = void 0;
    this.host.doc.body.classList.remove("tp-picking-rows", "tp-picking-columns");
  }
  selectEntry(info, axis, line) {
    return {
      kind: "item",
      label: axis === "row" ? "Select rows" : "Select columns",
      icon: axis === "row" ? ICONS.selectRows : ICONS.selectColumns,
      hint: `Select from this ${axis} to the one you click next`,
      run: this.runAndClose(() => this.startPicking(info, axis, line))
    };
  }
  /**
   * The lines a grip moves: the rows (columns) selected whole, when they hold
   * its line and follow each other in the markdown; else just its line
   */
  blockOf(info, axis, line) {
    const lines = this.wholeLinesSelected(info, axis);
    const first = Math.min(...lines);
    const last = Math.max(...lines);
    const zone = (l) => axis === "row" ? rowZone(info.pins, info.rows, l) : columnZone(info.pins, info.columns, l);
    const block = lines.length > 1 && lines.includes(line) && last - first + 1 === lines.length && zone(first) === zone(last);
    return block ? { first, last } : { first: line, last: line };
  }
  /** Where a block asked to start at `asked` goes (its first line's place; `first`: it stays) */
  blockTo(info, axis, block, asked) {
    return axis === "row" ? rowBlockTo(info, block.first, block.last, asked) : columnBlockTo(info, block.first, block.last, asked);
  }
  /** Moves a block of rows (columns) to start at `asked`, as one edit; several stay selected where they go */
  moveBlock(widget, info, axis, block, asked) {
    const to = this.blockTo(info, axis, block, asked);
    if (to === block.first) return;
    void (axis === "row" ? moveRowsTo : moveColumnsTo)(this.host, widget, info, block.first, block.last, to).then((result) => {
      if (result !== "written" || block.last === block.first) return;
      const now2 = this.host.widgetForKey(info.key);
      const nowInfo = now2 && this.host.infoOf(now2);
      this.selectLines(nowInfo ?? info, axis, to, to + block.last - block.first);
    });
  }
  /** The rows (columns) selected, when the selection holds this one; else just it */
  selectedLines(info, axis, line) {
    const cells = this.host.selectedCells(info);
    const lines = [...new Set(cells.map((ref) => axis === "row" ? ref.row : ref.column))].filter((l) => axis === "column" || l > 0);
    return lines.includes(line) ? lines : [line];
  }
  beginDrag(target, axis, pressedAt) {
    const { widget, info } = target;
    const { doc } = this.host;
    const block = this.blockOf(info, axis, axis === "row" ? target.row : target.column);
    const from = block.first;
    const count = block.last - block.first + 1;
    const table = info.table;
    const header = table.rows[0];
    const rows = [header, ...this.host.bodyRows(info)];
    const items = axis === "row" ? rows.slice(1).map((tr) => Array.from(tr.cells)) : Array.from(header.cells).map((_, c) => rows.flatMap((tr) => tr.cells[c] ?? []));
    const index = axis === "row" ? from - 1 : from;
    const lines = items.slice(index, index + count);
    const carried = lines.flat();
    const carriedRow = axis === "row" ? lines[0]?.[0]?.parentElement : void 0;
    if (carriedRow) {
      this.host.rowNeeded(info, carriedRow);
      this.host.holdInDocument(info, carriedRow);
    }
    const tableAt = () => {
      const r = table.getBoundingClientRect();
      return axis === "row" ? r.top : r.left;
    };
    const origin = tableAt();
    const measured = items.map((cells) => {
      const cell = cells[0];
      if (!cell?.isConnected) return void 0;
      const r = cell.getBoundingClientRect();
      return axis === "row" ? { start: r.top - origin, size: r.height } : { start: r.left - origin, size: r.width };
    });
    const known2 = measured.filter((m) => !!m);
    const typical = known2.length ? known2.reduce((sum, m) => sum + m.size, 0) / known2.length : 0;
    const firstKnown = measured.findIndex((m) => m);
    const lastKnown = measured.findLastIndex((m) => m);
    const places = measured.map((m, i) => {
      if (m) return m;
      if (firstKnown < 0) return { start: i * typical, size: typical };
      if (i < firstKnown) return { start: measured[firstKnown].start - (firstKnown - i) * typical, size: typical };
      const last = measured[lastKnown];
      return { start: last.start + last.size + (i - lastKnown - 1) * typical, size: typical };
    });
    const carriedSize = places.slice(index, index + count).reduce((sum, p) => sum + p.size, 0);
    const ghost = this.ghostOf(axis, lines);
    const start = carried[0].getBoundingClientRect();
    carried.forEach((el) => el.classList.add("tp-dragged"));
    doc.body.classList.add("tp-dragging");
    this.tint(void 0);
    this.dragging = true;
    let to = from;
    const grab = pressedAt - (axis === "row" ? start.top : start.left);
    const move = (ev) => {
      const pointer = axis === "row" ? ev.clientY : ev.clientX;
      if (axis === "row") this.host.place(ghost, start.left, pointer - grab);
      else this.host.place(ghost, pointer - grab, start.top);
      const top = pointer - grab - tableAt();
      const bottom = top + carriedSize;
      const end = index + count - 1;
      const middleOf = (i) => places[i].start + places[i].size / 2;
      let passed = 0;
      for (let i = end + 1; i < places.length && middleOf(i) < bottom; i++) passed++;
      if (passed === 0) for (let i = index - 1; i >= 0 && middleOf(i) > top; i--) passed--;
      to = this.blockTo(info, axis, block, from + passed);
      const target2 = axis === "row" ? to - 1 : to;
      items.forEach((cells, i) => {
        const shift = i > end && i <= target2 + count - 1 ? -carriedSize : i < index && i >= target2 ? carriedSize : 0;
        for (const cell of cells) cell.style.transform = shift ? axis === "row" ? `translateY(${shift}px)` : `translateX(${shift}px)` : "";
      });
      this.autoscroll(widget, ev);
    };
    const finish = (commit) => {
      for (const cells of items) for (const cell of cells) cell.style.transform = "";
      carried.forEach((el) => el.classList.remove("tp-dragged"));
      ghost.remove();
      doc.body.classList.remove("tp-dragging");
      this.dragging = false;
      if (carriedRow) this.host.holdInDocument(info, void 0);
      this.hideGrips();
      if (!commit || to === from) return;
      this.moveBlock(widget, info, axis, block, to);
    };
    return { move, finish };
  }
  /**
   * The copy that follows the pointer: the rows' (columns') cells cloned with
   * their sizes and looks, as it is outside the table that styles them
   */
  ghostOf(axis, lines) {
    const { doc } = this.host;
    const ghost = this.host.floating("div", "tp-drag-ghost tp-visible");
    const table = doc.createElement("table");
    const look = (cell) => {
      const copy = cell.cloneNode(true);
      copy.classList.remove("tp-dragged", "tp-selected", "tp-handle-hover");
      const style = doc.defaultView.getComputedStyle(cell);
      const r = cell.getBoundingClientRect();
      for (const name of ["font", "color", "background-color", "padding", "border", "text-align", "vertical-align", "white-space"]) {
        copy.style.setProperty(name, style.getPropertyValue(name));
      }
      Object.assign(copy.style, { boxSizing: "border-box", width: `${r.width}px`, height: `${r.height}px`, transform: "" });
      return copy;
    };
    if (axis === "row") {
      for (const cells of lines) {
        const tr = doc.createElement("tr");
        tr.append(...cells.map(look));
        table.append(tr);
      }
    } else {
      const height = Math.max(...lines.map((cells) => cells.length));
      for (let r = 0; r < height; r++) {
        const tr = doc.createElement("tr");
        tr.append(...lines.flatMap((cells) => cells[r] ? [look(cells[r])] : []));
        table.append(tr);
      }
    }
    ghost.append(table);
    return ghost;
  }
  /** Near the top or bottom edge of the box the page scrolls in, it scrolls on */
  autoscroll(widget, ev) {
    const scroller = this.host.scrollParentOf(widget);
    if (!scroller) return;
    const view = scroller.getBoundingClientRect();
    if (ev.clientY < view.top + AUTOSCROLL_EDGE) scroller.scrollTop -= AUTOSCROLL_STEP;
    else if (ev.clientY > view.bottom - AUTOSCROLL_EDGE) scroller.scrollTop += AUTOSCROLL_STEP;
  }
  // ---- menus ----------------------------------------------------------------------
  // A click on the grip whose menu is open closes it; on another grip, that grip's menu opens instead
  /** The menu of a line, by its grip, or by a point in a cell (`at`: opened on a cell selected) */
  toggleMenu(axis, target, grip, at) {
    const line = axis === "row" ? target.row : target.column;
    if (this.menu?.axis === axis && this.menu.line === line) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu(false, false);
    if (this.host.pressedWith === "touch") this.host.takePress();
    const { doc } = this.host;
    const { widget, info } = target;
    const named2 = this.host.menuNaming(widget, info, axis === "row" ? { kind: "row", row: line } : { kind: "column", column: line });
    const naming = named2 && {
      ...named2,
      save: async (name) => {
        const why = await named2.save(name);
        if (why === void 0) this.closeMenu(false);
        return why;
      }
    };
    const header = cellText(info.table.rows[0].cells[target.column]) || String(target.column + 1);
    const title = axis === "row" ? naming?.name ? `Row: ${naming.name}` : `Row ${target.row}` : `Column: ${naming?.name ?? header}`;
    const entries = axis === "row" ? this.rowMenu(widget, info, target.row, target.column) : this.columnMenu(widget, info, target.column);
    const element = renderMenu(doc, title, entries, void 0, naming);
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    keepFocus(element);
    doc.body.append(element);
    if (at) {
      const c = at.cell.getBoundingClientRect();
      this.menu = { element, axis, widget, line, anchor: { cell: at.cell, dx: at.x - c.left, dy: at.y - c.top, width: 0, height: 0 }, byPoint: true };
    } else {
      const g = grip.getBoundingClientRect();
      const cell = this.cellsOf(target, axis)[0] ?? grip;
      const c = cell.getBoundingClientRect();
      this.menu = { element, axis, widget, line, anchor: { cell, dx: g.left - c.left, dy: g.top - c.top, width: g.width, height: g.height } };
      grip.classList.add("tp-active");
    }
    this.positionMenu();
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
    keepFocus(element);
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
    if (!anchor.cell.isConnected) return;
    const win = this.host.doc.defaultView;
    const c = anchor.cell.getBoundingClientRect();
    const left0 = c.left + anchor.dx;
    const top0 = c.top + anchor.dy;
    const a = { left: left0, top: top0, right: left0 + anchor.width, bottom: top0 + anchor.height, width: anchor.width };
    const m = element.getBoundingClientRect();
    let left = axis === "row" ? a.right + 4 : a.left + a.width / 2 - m.width / 2;
    let top = axis === "row" ? a.top - 6 : a.bottom + 4;
    left = Math.max(4, Math.min(left, win.innerWidth - m.width - 4));
    if (top + m.height > win.innerHeight - 4) top = Math.max(4, win.innerHeight - m.height - 4);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }
  // `hide`: the grips go too (not when another grip's menu opens in its place)
  closeMenu(refocus, hide = true) {
    const menu = this.menu;
    if (!menu) return;
    this.menu = void 0;
    const hadFocus = menu.element.contains(this.host.doc.activeElement);
    menu.element.remove();
    this.rowGrip.classList.remove("tp-active");
    this.columnGrip.classList.remove("tp-active");
    if (hide) this.hideGrips();
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
    const block = this.blockOf(info, "row", row);
    const rows = block.last - block.first + 1;
    const moveBlocked = (asked) => rearranged ? MOVE_BLOCKED : this.blockTo(info, "row", block, asked) === block.first ? zone ? "Pinned rows stay with the other pinned rows" : "Already at the edge" : void 0;
    const pinBlocked = (to) => host.metadataEnabled || zone === to ? void 0 : PIN_NEEDS_METADATA;
    const insertBlocked = (at) => insertRowAt(info.pins, info.rows, at).at === at ? void 0 : zone === "top" ? "Rows pinned to the top stay at the top" : "Rows pinned to the bottom stay at the bottom";
    return [
      ...this.lineSections(widget, info, "row", row),
      {
        kind: "segmented",
        label: "Insert",
        options: [
          {
            icon: ICONS.rowAbove,
            title: "Insert row above",
            run: act(() => insertRowWith(host, widget, info, row, column, void 0, { before: row })),
            disabled: insertBlocked(row)
          },
          {
            icon: ICONS.rowBelow,
            title: "Insert row below",
            run: act(() => insertRowWith(host, widget, info, row + 1, column, void 0, { after: row })),
            disabled: insertBlocked(row + 1)
          }
        ]
      },
      { kind: "item", label: "Duplicate row", icon: ICONS.duplicate, run: act(() => duplicateRowAt(host, widget, info, row)) },
      { kind: "separator" },
      {
        kind: "segmented",
        label: rows > 1 ? `Move ${rows} rows` : "Move",
        options: [
          {
            icon: ICONS.arrowUp,
            title: rows > 1 ? `Move ${rows} rows up` : "Move up",
            run: act(() => this.moveBlock(widget, info, "row", block, block.first - 1)),
            disabled: moveBlocked(block.first - 1)
          },
          {
            icon: ICONS.arrowDown,
            title: rows > 1 ? `Move ${rows} rows down` : "Move down",
            run: act(() => this.moveBlock(widget, info, "row", block, block.first + 1)),
            disabled: moveBlocked(block.first + 1)
          }
        ]
      },
      {
        kind: "segmented",
        label: "Pin",
        options: [
          {
            icon: ICONS.pinTop,
            title: zone === "top" ? "Unpin from the top" : "Pin to top",
            active: zone === "top",
            run: act(() => pinRowAt(host, widget, info, row, zone === "top" ? void 0 : "top")),
            disabled: pinBlocked("top")
          },
          {
            icon: ICONS.pinBottom,
            title: zone === "bottom" ? "Unpin from the bottom" : "Pin to bottom",
            active: zone === "bottom",
            run: act(() => pinRowAt(host, widget, info, row, zone === "bottom" ? void 0 : "bottom")),
            disabled: pinBlocked("bottom")
          }
        ]
      },
      { kind: "separator" },
      ...this.section(this.host.rowMenuEntries(widget, info, row, column)),
      this.selectEntry(info, "row", row),
      this.deleteEntry(widget, info, "row", row)
    ];
  }
  /** Delete row (column), or the rows (columns) selected when they hold it */
  deleteEntry(widget, info, axis, line) {
    const lines = this.selectedLines(info, axis, line);
    const many = lines.length > 1;
    const run = this.runAndClose(() => {
      void (axis === "row" ? deleteRowsAt(this.host, widget, info, lines) : deleteColumnsAt(this.host, widget, info, lines));
    });
    return {
      kind: "item",
      label: axis === "row" ? many ? `Delete ${lines.length} rows` : "Delete row" : many ? `Delete ${lines.length} columns` : "Delete column",
      icon: ICONS.trash,
      danger: true,
      run,
      ...axis === "column" && lines.length >= info.columns ? { disabled: "A table needs at least one column" } : {}
    };
  }
  /** The features' entries for the lines a grip acts on: the clipboard's bar, then the others (Clear), each a section as in the cell menu */
  lineSections(widget, info, axis, line) {
    const entries = this.host.lineMenuEntries(widget, info, axis, this.selectedLines(info, axis, line));
    return [...this.section(entries.filter((e) => e.kind === "actions")), ...this.section(entries.filter((e) => e.kind !== "actions"))];
  }
  /** The features' entries as a section of the menu: run, they close it; a separator after them */
  section(entries) {
    if (entries.length === 0) return [];
    return [...wrapRuns(entries, (run) => this.runAndClose(run)), { kind: "separator" }];
  }
  /**
   * The entries features add to a column's menu: run, they close the menu,
   * but one that showed other entries in its place (a list to pick from)
   */
  featureColumnEntries(widget, info, column, lead = false) {
    const open = (title, list) => this.replaceMenu(title, list);
    const entries = lead ? this.host.columnMenuLeadEntries(widget, info, column, open) : this.host.columnMenuEntries(widget, info, column, open);
    return wrapRuns(entries, (run) => () => {
      const shown = this.menu?.element;
      run();
      if (this.menu && this.menu.element === shown) this.closeMenu(false);
    });
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
    const block = this.blockOf(info, "column", column);
    const columns = block.last - block.first + 1;
    const columnMoveBlocked = (asked) => this.blockTo(info, "column", block, asked) === block.first ? zone ? "Pinned columns stay with the other pinned columns" : "Already at the edge" : void 0;
    const pinBlocked = (to) => host.metadataEnabled || zone === to ? void 0 : PIN_NEEDS_METADATA;
    const insertBlocked = (at) => insertColumnAt(info.pins, info.columns, at).at === at ? void 0 : zone === "left" ? "Columns pinned to the left stay at the left" : "Columns pinned to the right stay at the right";
    const entries = [
      ...this.lineSections(widget, info, "column", column),
      {
        kind: "segmented",
        label: "Insert",
        options: [
          { icon: ICONS.columnLeft, title: "Insert column left", run: act(() => insertColumnWith(host, widget, info, column)), disabled: insertBlocked(column) },
          { icon: ICONS.columnRight, title: "Insert column right", run: act(() => insertColumnWith(host, widget, info, column + 1)), disabled: insertBlocked(column + 1) }
        ]
      },
      // The features' (a numbered column), closing the menu when run
      ...wrapRuns(host.columnMenuInsertEntries(widget, info, column), (run) => this.runAndClose(run)),
      { kind: "separator" },
      {
        kind: "segmented",
        label: columns > 1 ? `Move ${columns} columns` : "Move",
        options: [
          {
            icon: ICONS.arrowLeft,
            title: columns > 1 ? `Move ${columns} columns left` : "Move left",
            run: act(() => this.moveBlock(widget, info, "column", block, block.first - 1)),
            disabled: columnMoveBlocked(block.first - 1)
          },
          {
            icon: ICONS.arrowRight,
            title: columns > 1 ? `Move ${columns} columns right` : "Move right",
            run: act(() => this.moveBlock(widget, info, "column", block, block.first + 1)),
            disabled: columnMoveBlocked(block.first + 1)
          }
        ]
      },
      {
        kind: "segmented",
        label: "Pin",
        options: [
          {
            icon: ICONS.pinLeft,
            title: zone === "left" ? "Unpin from the left" : "Pin left",
            active: zone === "left",
            run: act(() => pinColumnAt(host, widget, info, column, zone === "left" ? void 0 : "left")),
            disabled: pinBlocked("left")
          },
          {
            icon: ICONS.pinRight,
            title: zone === "right" ? "Unpin from the right" : "Pin right",
            active: zone === "right",
            run: act(() => pinColumnAt(host, widget, info, column, zone === "right" ? void 0 : "right")),
            disabled: pinBlocked("right")
          }
        ]
      },
      { kind: "separator" },
      ...this.featureColumnEntries(widget, info, column, true),
      {
        kind: "segmented",
        label: "Sort",
        options: [
          { icon: ICONS.sortAsc, title: "Sort ascending", active: sorted === "asc", run: sortBy(withSort(view, column, "asc")) },
          { icon: ICONS.sortDesc, title: "Sort descending", active: sorted === "desc", run: sortBy(withSort(view, column, "desc")) },
          {
            icon: ICONS.clear,
            title: "Clear sorting",
            run: sortBy(withoutSort(view)),
            ...view.sort ? {} : { disabled: "Not sorted" }
          }
        ]
      },
      ...this.featureColumnEntries(widget, info, column),
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
      ...this.section(host.columnMenuTopEntries(widget, info, column)),
      this.selectEntry(info, "column", column),
      this.deleteEntry(widget, info, "column", column)
    ];
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
  async beforeWrite(text, from, to, change) {
    const { bridge } = this.host;
    if (!bridge.setSelection) return void 0;
    const places = [to < text.length ? to + 1 : void 0, from > 0 ? from - 1 : void 0].filter((p) => p !== void 0);
    const reached = (p) => p >= change.from && p <= change.to;
    const marker = places.find((p) => !reached(p)) ?? places[0];
    if (marker === void 0) return void 0;
    await bridge.setSelection(marker, marker);
    const moveAfter = reached(marker);
    if (!moveAfter) this.remember(marker);
    return (editFrom, lengthChange) => {
      const moved2 = marker + (moveAfter || marker > editFrom ? lengthChange : 0);
      if (moveAfter) void bridge.setSelection(moved2, moved2);
      this.remember(moved2);
    };
  }
  keyDown(e) {
    const { bridge } = this.host;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key2 = e.key.toLowerCase();
    const step = mod && key2 === "z" ? e.shiftKey ? "redo" : "undo" : mod && key2 === "y" && !e.shiftKey ? "redo" : void 0;
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

// table-plus/src/features/widths.ts
var MIN_WIDTH = 40;
var Widths = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // Widths set for the view only (no metadata stored), by table and column; undefined: automatic
  viewed = /* @__PURE__ */ new Map();
  drag;
  stopDrag;
  // The columns given a width in each table as rendered (a write renders it anew): those to make automatic again
  sized = /* @__PURE__ */ new WeakMap();
  // The widths stored in the table last read (parsing a large table for its metadata row on every view is slow)
  stored;
  stop() {
    this.stopDrag?.();
  }
  pointerBusy() {
    return this.drag ? "drag" : void 0;
  }
  /** The widths of a table's columns: those set for the view, else those stored */
  widthsOf(info) {
    if (this.stored?.source !== info.source) {
      const read = /* @__PURE__ */ new Map();
      for (const [column, value] of columnMeta(parseTable(info.source), "width")) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) read.set(column, Math.max(MIN_WIDTH, Math.round(n)));
      }
      this.stored = { source: info.source, widths: read };
    }
    const widths = new Map(this.stored.widths);
    for (const [column, width] of this.viewed.get(info.key) ?? []) {
      if (width === void 0) widths.delete(column);
      else widths.set(column, width);
    }
    return widths;
  }
  // ---- the handles and the widths shown ----------------------------------------
  decorate(_widget, info) {
    Array.from(info.table.rows[0].cells).forEach((cell, column) => {
      const handle = this.host.doc.createElement("span");
      handle.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-col-resize`;
      handle.dataset.tpColumn = String(column);
      handle.title = "Drag to set the column's width; double-click for automatic";
      cell.append(handle);
    });
  }
  // After the cells are laid out (their content boxes made): the widths set.
  // Only the columns with a width, or that had one: touching every cell's
  // style (or reading styles between writes) would make the browser compute
  // the whole table's styles and layout again, for every table shown.
  viewApplied(_widget, info) {
    const widths = this.widthsOf(info);
    const header = info.table.rows[0];
    const sized = this.sized.get(info.table);
    const columns = Array.from({ length: info.columns }, (_, column) => column).filter((column) => widths.has(column) || sized?.has(column));
    if (!columns.length) return;
    const paddings = columns.map((column) => widths.has(column) ? this.paddingOf(info, column) : 0);
    const rows = [header, ...this.host.bodyRows(info)];
    columns.forEach((column, i) => this.apply(info, column, widths.get(column), paddings[i], rows));
  }
  /**
   * A column `width` pixels wide (undefined: automatic): every cell of it, and
   * the content box of every body cell sized to fit inside (it is otherwise as
   * wide as its text, up to the maximum column width)
   */
  apply(info, column, width, padding = width === void 0 ? 0 : this.paddingOf(info, column), rows = [info.table.rows[0], ...this.host.bodyRows(info)]) {
    const sized = this.sized.get(info.table) ?? /* @__PURE__ */ new Set();
    this.sized.set(info.table, sized);
    if (width === void 0) sized.delete(column);
    else sized.add(column);
    for (const tr of rows) {
      const cell = tr.cells[column];
      if (!cell || cell.classList.contains("tp-editing")) continue;
      cell.classList.toggle("tp-sized", width !== void 0);
      cell.style.boxSizing = width === void 0 ? "" : "border-box";
      cell.style.width = width === void 0 ? "" : `${width}px`;
      cell.style.minWidth = width === void 0 ? "" : `${width}px`;
      cell.style.maxWidth = width === void 0 ? "" : `${width}px`;
      const box = cell.querySelector(":scope > .tp-cell-content, :scope > .tp-head");
      if (box) {
        box.style.width = width === void 0 ? "" : `${Math.max(0, width - padding)}px`;
        box.style.maxWidth = width === void 0 ? "" : "none";
      }
    }
  }
  /** A cell's padding left and right (the same in the column's header and body cells) */
  paddingOf(info, column) {
    const header = info.table.rows[0].cells[column];
    if (!header) return 0;
    const style = this.host.doc.defaultView.getComputedStyle(header);
    return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  }
  // ---- dragging -----------------------------------------------------------------
  mouseDown(e) {
    const handle = e.target instanceof Element ? e.target.closest(".tp-col-resize") : null;
    const hit = handle && this.host.enhancedWidgetOf(handle);
    if (!handle || !hit || e.button !== 0) return false;
    e.preventDefault();
    e.stopPropagation();
    this.stopDrag?.();
    const editing = this.host.editing;
    if (editing) editing.field.blur();
    const [, info] = hit;
    const column = Number(handle.dataset.tpColumn);
    const header = info.table.rows[0].cells[column];
    if (!header) return true;
    const startWidth = Math.round(header.getBoundingClientRect().width);
    this.drag = { key: info.key, column, startX: e.clientX, startWidth, padding: this.paddingOf(info, column), width: startWidth };
    handle.classList.add("tp-active");
    const doc = this.host.doc;
    doc.body.classList.add("tp-resizing");
    const win = doc.defaultView;
    let frame = 0;
    const show = () => {
      frame = 0;
      const drag = this.drag;
      const now2 = drag && this.current(drag.key);
      if (!drag || !now2) return;
      this.apply(now2[1], drag.column, drag.width, drag.padding);
      this.host.tableResized(now2[1]);
    };
    const move = (ev) => {
      const drag = this.drag;
      if (!drag) return;
      if (ev.buttons === 0) {
        end(ev);
        return;
      }
      ev.preventDefault();
      drag.width = Math.max(MIN_WIDTH, Math.round(drag.startWidth + ev.clientX - drag.startX));
      if (!frame) frame = win.requestAnimationFrame ? win.requestAnimationFrame(show) : (show(), 0);
    };
    const end = (ev) => {
      const drag = this.drag;
      if (frame && win.cancelAnimationFrame) win.cancelAnimationFrame(frame);
      this.stopDrag?.();
      const now2 = drag && this.current(drag.key);
      if (!drag || !now2) return;
      const [current, nowInfo] = now2;
      if (drag.width !== drag.startWidth) {
        void this.set(current, nowInfo, drag.column, drag.width);
        return;
      }
      if (ev.detail >= 2) void this.set(current, nowInfo, drag.column, void 0);
      else {
        this.viewApplied(current, nowInfo);
        this.host.tableResized(nowInfo);
      }
    };
    this.stopDrag = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", end, true);
      handle.classList.remove("tp-active");
      doc.body.classList.remove("tp-resizing");
      this.drag = void 0;
      this.stopDrag = void 0;
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", end, true);
    return true;
  }
  /** The table with `key` as rendered now: a write renders it anew */
  current(key2) {
    const widget = this.host.widgetForKey(key2);
    const info = widget && this.host.infoOf(widget);
    return widget && info ? [widget, info] : void 0;
  }
  /** A column's width set (undefined: automatic) */
  set(widget, info, column, width) {
    return this.setAll(widget, info, /* @__PURE__ */ new Map([[column, width]]));
  }
  /** Columns' widths set (undefined: automatic): stored in the table where they can be, else for the view */
  async setAll(widget, info, set) {
    const view = this.viewed.get(info.key) ?? /* @__PURE__ */ new Map();
    for (const [column, width] of set) view.set(column, width);
    this.viewed.set(info.key, view);
    this.viewApplied(widget, info);
    this.host.tableResized(info);
    this.host.toolbarChanged();
    if (!(info.metaRow || this.host.metadataEnabled)) return;
    const result = await this.host.write(widget, (t) => {
      const widths = columnMeta(t, "width");
      for (const [column, width] of set) {
        if (width === void 0) widths.delete(column);
        else widths.set(column, String(width));
      }
      return withColumnMeta(t, "width", widths);
    });
    if (result !== "failed") for (const column of set.keys()) this.viewed.get(info.key)?.delete(column);
  }
  /** Columns moved, inserted or deleted: the widths set for the view go with them */
  columnsMoved(key2, map) {
    const view = this.viewed.get(key2);
    if (!view) return;
    const moved2 = /* @__PURE__ */ new Map();
    for (const [column, width] of view) {
      const target = map(column);
      if (target !== void 0) moved2.set(target, width);
    }
    this.viewed.set(key2, moved2);
  }
  // ---- the menus --------------------------------------------------------------------
  // Before Remove metadata (the widths module comes before it), which would remove them too
  toolbarButtons(widget, info) {
    const widths = this.widthsOf(info);
    if (!widths.size) return [];
    return [
      {
        label: "Reset column widths",
        icon: ICONS.columnWidth,
        danger: true,
        title: widths.size === 1 ? "Make the column with a width set as wide as its text again" : `Make the ${widths.size} columns with a width set as wide as their text again`,
        run: () => {
          const [w, now2] = this.current(info.key) ?? [widget, info];
          void this.setAll(w, now2, new Map(Array.from(this.widthsOf(now2).keys(), (column) => [column, void 0])));
        }
      }
    ];
  }
  columnMenuEntries(widget, info, column) {
    const width = this.widthsOf(info).get(column);
    if (width === void 0) return [];
    return [
      {
        kind: "item",
        label: "Auto width",
        icon: ICONS.columnWidth,
        hint: `The column is ${width}px wide: make it as wide as its text`,
        run: () => void this.set(widget, info, column, void 0)
      }
    ];
  }
};

// table-plus/src/features/fullscreen.ts
var FULL_CLASS = "tp-fullscreen";
var OPEN_CLASS = "tp-fullscreen-open";
var LETTER_CLASS = "tp-col-letter";
var FullScreen = class {
  constructor(host) {
    this.host = host;
    this.numbers = host.floating("div", "tp-fullscreen-rows");
    this.numbers.setAttribute("aria-hidden", "true");
  }
  host;
  // The table shown over the window (its key) and its widget as rendered now
  key;
  widget;
  // The table rendered anew taken for it before it was enhanced (tableAdded)
  guessed;
  // The rows' numbers, over the room left of the rows
  numbers;
  numbersQueued = false;
  stop() {
    this.end();
    this.numbers.remove();
  }
  toolbarButtons(widget, info) {
    const on = this.key === info.key;
    return [
      {
        label: on ? "Exit full screen" : "Full screen",
        title: on ? "Show the table in the page again (Esc)" : "Show the table over the whole window",
        place: "icon",
        icon: on ? ICONS.exitFullScreen : ICONS.fullScreen,
        pressed: on,
        run: () => on ? this.end() : this.begin(widget, info)
      }
    ];
  }
  // Each header cell's letter (shown only over the window, by the CSS)
  decorate(_widget, info) {
    Array.from(info.table.rows[0]?.cells ?? []).forEach((cell, column) => {
      if (cell.querySelector(`:scope > .${LETTER_CLASS}`)) return;
      const letter = this.host.doc.createElement("span");
      letter.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} ${LETTER_CLASS}`;
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = columnLetters(column);
      cell.append(letter);
    });
  }
  begin(widget, info) {
    if (this.widget && this.widget !== widget) this.unmark(this.widget);
    this.key = info.key;
    this.mark(widget);
    this.host.toolbarChanged();
    this.host.tableResized(info);
  }
  end() {
    const widget = this.widget;
    this.key = void 0;
    this.widget = void 0;
    if (widget) this.unmark(widget);
    this.host.doc.body.classList.remove(OPEN_CLASS);
    this.numbers.classList.remove("tp-visible");
    this.host.toolbarChanged();
    const info = widget && this.host.infoOf(widget);
    if (info) this.host.tableResized(info);
  }
  mark(widget) {
    this.widget = widget;
    widget.classList.add(FULL_CLASS);
    this.host.doc.body.classList.add(OPEN_CLASS);
    this.numbers.classList.add("tp-visible");
    this.queueNumbers();
  }
  unmark(widget) {
    widget.classList.remove(FULL_CLASS);
  }
  // Rendered anew (an edit): the replacement of the table shown over the window shows so at once, before it is laid out
  // (the one starting where the table taken out started, data-pos: an edit in a table does not move its start;
  // the page may render every table anew)
  tableAdded(widget, table) {
    const old = this.widget;
    if (this.key === void 0 || !old || old.isConnected || this.guessed?.isConnected) return;
    if (table.dataset.pos !== old.querySelector("table")?.dataset.pos) return;
    this.guessed = widget;
    widget.classList.add(FULL_CLASS);
  }
  // Enhanced: shown over the window if it is that table, else not (tableAdded may have guessed wrong)
  enhanced(widget, info) {
    if (info.key === this.key) this.mark(widget);
    else if (widget.classList.contains(FULL_CLASS)) this.unmark(widget);
    if (this.key !== void 0 && this.widget && !this.widget.isConnected && !this.host.widgetForKey(this.key)) this.end();
  }
  // Its rows sorted, filtered or put back into the document: their numbers follow
  viewApplied(widget) {
    if (widget === this.widget) this.queueNumbers();
  }
  rowsAttached(info) {
    if (info.table === this.widget?.querySelector("table")) this.queueNumbers();
  }
  // Esc closes it, unless something else takes the key first (a cell editor, a selection, a field, a menu)
  keyDown(e) {
    if (e.key !== "Escape" || this.key === void 0 || this.host.editing) return false;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return false;
    e.preventDefault();
    e.stopPropagation();
    this.end();
    return true;
  }
  // After a scroll or a change of the layout (in a frame): the numbers follow the rows; another page shown: it ends
  layoutChanged() {
    if (this.key === void 0) return;
    if (!this.widget?.isConnected && !this.host.doc.querySelector(`${WIDGET_SELECTOR}.${FULL_CLASS}`)) {
      this.end();
      return;
    }
    this.placeNumbers();
  }
  queueNumbers() {
    if (this.numbersQueued) return;
    this.numbersQueued = true;
    const win = this.host.doc.defaultView;
    const run = () => {
      this.numbersQueued = false;
      this.placeNumbers();
    };
    if (win.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }
  /** A number beside each row in view, below the header (held or not), above the box's bottom */
  placeNumbers() {
    const widget = this.widget;
    const info = widget?.isConnected ? this.host.infoOf(widget) : void 0;
    if (!widget || !info) return;
    const top = info.table.rows[0].getBoundingClientRect().bottom;
    const bottom = this.host.innerBox(widget).bottom;
    const layer = this.numbers;
    layer.style.top = `${top}px`;
    layer.style.height = `${Math.max(0, bottom - top)}px`;
    const rows = this.host.shownRows(info).filter((tr) => tr.dataset.tpRow !== void 0 && tr.isConnected);
    let low = 0;
    let high = rows.length;
    while (low < high) {
      const mid = low + high >> 1;
      if (rows[mid].getBoundingClientRect().bottom <= top) low = mid + 1;
      else high = mid;
    }
    let shown = 0;
    for (let i = low; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (rect.top >= bottom) break;
      let label = layer.children[shown];
      if (!label) {
        label = this.host.doc.createElement("span");
        layer.append(label);
      }
      label.hidden = false;
      label.textContent = rows[i].dataset.tpRow;
      label.style.top = `${rect.top - top}px`;
      label.style.height = `${rect.height}px`;
      shown++;
    }
    for (let i = shown; i < layer.children.length; i++) layer.children[i].hidden = true;
  }
};

// table-plus/src/features/largetables.ts
var LARGE_CLASS = "tp-large-table";
var SPACER_CLASS = "tp-large-spacer";
var MARGIN_ROWS = 30;
var ROW_HEIGHT = 36;
var LargeTables = class {
  constructor(host) {
    this.host = host;
  }
  host;
  minRows = SETTINGS.largeTablesMinRows.default;
  maxHeight = 0;
  states = /* @__PURE__ */ new WeakMap();
  // Where each table's box was scrolled to, and its rows' height as measured, by
  // table, kept while it is rendered anew: the same scroll then shows the same rows
  scrolls = /* @__PURE__ */ new Map();
  heights = /* @__PURE__ */ new Map();
  // The height last measured, for a table not measured yet
  lastHeight = ROW_HEIGHT;
  start() {
    void this.readSettings();
  }
  enhanced() {
    void this.readSettings();
  }
  async readSettings() {
    this.minRows = await this.host.setting("largeTablesMinRows");
    this.maxHeight = await this.host.setting("maxHeight");
  }
  // ---- taking the rows out before the browser lays the table out ------------------
  tableAdded(widget, table, rows) {
    const body = table.tBodies[0];
    if (!body || rows.length - 1 < this.minRows) return;
    const state = this.stateOf(widget, table);
    widget.classList.add(LARGE_CLASS);
    const count = this.rowsInView(state);
    const bodyRows = rows.slice(1);
    state.shown = bodyRows;
    state.from = 0;
    state.to = Math.min(bodyRows.length, count);
    for (const tr of bodyRows.slice(state.to)) tr.remove();
    this.setSpacers(state);
    body.prepend(state.above);
    body.append(state.below);
  }
  stateOf(widget, table) {
    let state = this.states.get(table);
    if (state) return state;
    const spacer = () => {
      const tr = this.host.doc.createElement("tr");
      tr.className = `${UI_CLASS} ${SPACER_CLASS}`;
      tr.setAttribute("aria-hidden", "true");
      const td = this.host.doc.createElement("td");
      td.colSpan = Math.max(1, table.rows[0]?.cells.length ?? 1);
      tr.append(td);
      return tr;
    };
    state = {
      widget,
      table,
      key: void 0,
      info: void 0,
      shown: [],
      from: 0,
      to: 0,
      rowHeight: this.lastHeight,
      above: spacer(),
      below: spacer(),
      between: spacer(),
      queued: false,
      widthsKept: false
    };
    this.states.set(table, state);
    widget.addEventListener("scroll", () => this.scrolled(state), { passive: true });
    return state;
  }
  /** How many rows a view of the box holds, with the margins above and below */
  rowsInView(state) {
    const win = this.host.doc.defaultView;
    const box = this.maxHeight > 0 ? Math.min(this.maxHeight, win.innerHeight) : win.innerHeight;
    return Math.ceil(box / state.rowHeight) + 2 * MARGIN_ROWS;
  }
  setSpacers(state) {
    const height = (rows) => `${Math.round(rows * state.rowHeight)}px`;
    state.above.cells[0].style.height = height(state.from);
    state.below.cells[0].style.height = height(state.shown.length - state.to);
    state.above.hidden = state.from === 0;
    state.below.hidden = state.to >= state.shown.length;
  }
  // ---- placing the rows of the view -------------------------------------------------
  placeRows(widget, info, body, shown) {
    if (this.host.bodyRows(info).length < this.minRows) return false;
    const state = this.stateOf(widget, info.table);
    widget.classList.add(LARGE_CLASS);
    if (state.key === void 0) state.rowHeight = this.heights.get(info.key) ?? state.rowHeight;
    state.key = info.key;
    state.info = info;
    state.shown = shown;
    const top = this.scrolls.get(info.key) ?? widget.scrollTop;
    this.windowAt(state, Math.floor(top / state.rowHeight));
    this.place(state, body);
    return true;
  }
  /** The rows from `first` (the first in view) and the margins around them */
  windowAt(state, first) {
    const count = this.rowsInView(state);
    state.from = Math.max(0, Math.min(first - MARGIN_ROWS, state.shown.length - count));
    state.to = Math.min(state.shown.length, state.from + count);
  }
  place(state, body = state.table.tBodies[0]) {
    if (!body) return;
    const before = new Set(Array.from(body.rows));
    const rows = state.shown.slice(state.from, state.to);
    this.setSpacers(state);
    const held = state.info && this.host.heldInDocument(state.info);
    const at = held ? state.shown.indexOf(held) : -1;
    const height = (count) => `${Math.round(Math.max(0, count) * state.rowHeight)}px`;
    if (at >= 0 && at < state.from) {
      state.above.cells[0].style.height = height(at);
      state.between.cells[0].style.height = height(state.from - at - 1);
      state.above.hidden = at === 0;
      body.replaceChildren(state.above, held, state.between, ...rows, state.below);
    } else if (at >= state.to) {
      state.between.cells[0].style.height = height(at - state.to);
      state.below.cells[0].style.height = height(state.shown.length - at - 1);
      state.below.hidden = at === state.shown.length - 1;
      body.replaceChildren(state.above, ...rows, state.between, held, state.below);
    } else body.replaceChildren(state.above, ...rows, state.below);
    const attached = rows.filter((tr) => !before.has(tr));
    if (state.info && attached.length) this.host.rowsAttached(state.info, attached);
    this.queueMeasure(state);
  }
  scrolled(state) {
    if (state.key) this.scrolls.set(state.key, state.widget.scrollTop);
    if (state.queued) return;
    state.queued = true;
    const win = this.host.doc.defaultView;
    win.requestAnimationFrame(() => {
      state.queued = false;
      if (!state.widget.isConnected) return;
      const first = Math.floor(state.widget.scrollTop / state.rowHeight);
      const last = first + Math.ceil(state.widget.clientHeight / state.rowHeight);
      const roomAbove = state.from === 0 || first - state.from >= MARGIN_ROWS / 3;
      const roomBelow = state.to >= state.shown.length || state.to - last >= MARGIN_ROWS / 3;
      if (roomAbove && roomBelow) return;
      this.windowAt(state, first);
      this.place(state);
    });
  }
  /**
   * Once laid out: the rows' real height for the empty rows standing in for
   * the others, and the columns' widths kept, so they do not change as other
   * rows come into the document while the box scrolls
   */
  queueMeasure(state) {
    const win = this.host.doc.defaultView;
    win.requestAnimationFrame(() => {
      if (!state.widget.isConnected) return;
      const rows = state.shown.slice(state.from, state.to).filter((tr) => tr.isConnected);
      const first = rows[0];
      const last = rows[rows.length - 1];
      if (first && last && rows.length > 1) {
        const height = (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / rows.length;
        if (height > 0 && Math.abs(height - state.rowHeight) > 0.01) {
          const above = state.from * state.rowHeight;
          state.rowHeight = height;
          this.setSpacers(state);
          if (state.from > 0) state.widget.scrollTop += state.from * height - above;
        }
        if (height > 0) {
          this.lastHeight = height;
          if (state.key) this.heights.set(state.key, height);
        }
      }
      if (!state.widthsKept) {
        state.widthsKept = true;
        const header = state.table.rows[0];
        const widths = Array.from(header?.cells ?? [], (cell) => cell.getBoundingClientRect().width);
        Array.from(header?.cells ?? []).forEach((cell, i) => {
          if (!cell.style.minWidth && widths[i]) cell.style.minWidth = `${Math.round(widths[i])}px`;
        });
      }
    });
  }
  rowNeeded(info, row) {
    const state = this.states.get(info.table);
    const at = state ? state.shown.indexOf(row) : -1;
    if (!state || at < 0) return;
    this.windowAt(state, at - Math.floor(this.rowsInView(state) / 2) + MARGIN_ROWS);
    this.place(state);
  }
};

// table-plus/src/features/longtext.ts
var LongText = class {
  constructor(host) {
    this.host = host;
  }
  host;
  limits;
  reading;
  checkQueued = false;
  // Tables resized (a sidebar, a column's width, fonts loaded): cells that are cut may change
  resizeObserver;
  stopped = false;
  start() {
    const win = this.host.doc.defaultView;
    win.addEventListener("resize", this.queueCheck);
    this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.queueCheck()) : void 0;
    void this.host.doc.fonts?.ready.then(() => this.queueCheck());
    void this.readSettings();
  }
  stop() {
    this.stopped = true;
    this.host.doc.defaultView.removeEventListener("resize", this.queueCheck);
    this.resizeObserver?.disconnect();
    for (const widget of Array.from(this.host.doc.querySelectorAll(WIDGET_SELECTOR))) this.clear(widget);
  }
  // A table rendered (or its view applied): its limits, and a check once laid out
  viewApplied(widget) {
    this.apply(widget);
    this.resizeObserver?.observe(widget);
    this.queueCheck();
  }
  // Rows put back into the document (a large table scrolled): their cells are checked
  rowsAttached() {
    this.queueCheck();
  }
  enhanced() {
    void this.readSettings();
  }
  /** Reads the settings; changed, every table gets them */
  readSettings() {
    this.reading ??= (async () => {
      const limits = {
        overflow: await this.host.setting("cellOverflow"),
        maxWidth: await this.host.setting("cellMaxWidth"),
        maxHeight: await this.host.setting("cellMaxHeight")
      };
      const before = this.limits;
      this.limits = limits;
      if (this.stopped || before && before.overflow === limits.overflow && before.maxWidth === limits.maxWidth && before.maxHeight === limits.maxHeight) return;
      for (const widget of Array.from(this.host.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
        const info = this.host.infoOf(widget);
        if (info && renderedTable(widget) === info.table) this.apply(widget);
      }
      this.queueCheck();
    })().finally(() => this.reading = void 0);
    return this.reading;
  }
  apply(widget) {
    const { overflow, maxWidth, maxHeight } = this.limits ?? {
      overflow: SETTINGS.cellOverflow.default,
      maxWidth: SETTINGS.cellMaxWidth.default,
      maxHeight: SETTINGS.cellMaxHeight.default
    };
    widget.classList.add("tp-long-text");
    widget.classList.toggle("tp-cells-wrap", overflow === "wrap");
    widget.classList.toggle("tp-cells-ellipsis", overflow === "ellipsis");
    widget.style.setProperty("--tp-cell-max-width", maxWidth > 0 ? `${maxWidth}px` : "none");
    widget.style.setProperty("--tp-cell-max-height", maxHeight > 0 ? `${maxHeight}px` : "none");
  }
  clear(widget) {
    widget.classList.remove("tp-long-text", "tp-cells-wrap", "tp-cells-ellipsis");
    widget.style.removeProperty("--tp-cell-max-width");
    widget.style.removeProperty("--tp-cell-max-height");
    for (const cell of Array.from(widget.querySelectorAll(".tp-cut"))) cell.classList.remove("tp-cut");
  }
  /** Once laid out: the cells whose content does not fit (cut) are marked */
  queueCheck = () => {
    if (this.checkQueued) return;
    this.checkQueued = true;
    const run = () => {
      this.checkQueued = false;
      if (this.stopped) return;
      const boxes = Array.from(this.host.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table .tp-cell-content`));
      const cut = boxes.map((box) => box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1);
      boxes.forEach((box, i) => box.parentElement?.classList.toggle("tp-cut", cut[i]));
    };
    const win = this.host.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  };
};

// table-plus/src/features/popup.ts
var CellPopup = class {
  constructor(host) {
    this.host = host;
    this.button = host.floating("button", "tp-expand");
    this.button.type = "button";
    this.button.tabIndex = -1;
    this.button.title = "Show the whole text (F2 while editing)";
    this.button.setAttribute("aria-label", "Show the whole text");
    this.button.innerHTML = ICONS.expand;
  }
  host;
  button;
  // The cell the button is for
  target;
  start() {
    this.button.addEventListener("click", () => this.open());
  }
  stop() {
    this.button.remove();
  }
  owns(node) {
    return this.button.contains(node);
  }
  cellHovered(widget, info, cell) {
    const editing = this.host.editing;
    if (editing) {
      this.showFor(editing);
      return;
    }
    this.target = cell.classList.contains("tp-cut") ? { widget, info, cell } : void 0;
    this.place();
  }
  hoverEnded() {
    const editing = this.host.editing;
    if (editing) this.showFor(editing);
    else this.hide();
  }
  editorOpened(editor) {
    this.showFor(editor);
    editor.field.addEventListener("input", () => {
      if (this.host.editing === editor) this.showFor(editor);
    });
  }
  editorClosed() {
    this.hide();
  }
  layoutChanged() {
    this.place();
  }
  /** While a cell is edited in it: when its text does not fit, or the cell's did not */
  showFor(editor) {
    const info = this.host.infoOf(editor.widget);
    const field = editor.field;
    const overflows = field.scrollWidth > field.clientWidth + 1 || editor.cell.classList.contains("tp-cut");
    this.target = !editor.popup && info && overflows ? { widget: editor.widget, info, cell: editor.cell } : void 0;
    this.place();
  }
  /**
   * At the top right corner of the part of the cell in view: the table's box
   * may be scrolled sideways, the page up or down, and a body cell may be
   * partly under the header held at the top. Where too little of it shows,
   * the button waits (hidden) for the cell to come into view.
   */
  place() {
    const target = this.target;
    if (!target || !target.cell.isConnected) {
      this.hide();
      return;
    }
    const { widget, info, cell } = target;
    const rect = cell.getBoundingClientRect();
    const shown = this.host.shownRect(widget, info);
    const view = this.host.viewBounds(widget);
    const head = info.table.tHead;
    const under = head && cell.closest("tbody") ? head.getBoundingClientRect().bottom : -Infinity;
    const left = Math.max(rect.left, shown.left, view.left);
    const right = Math.min(rect.right, shown.right, view.right);
    const top = Math.max(rect.top, shown.top, view.top, under);
    const bottom = Math.min(rect.bottom, shown.bottom, view.bottom);
    this.button.classList.add("tp-visible");
    const size = Math.max(this.button.offsetWidth, this.button.offsetHeight);
    if (rect.width > 0 && (right - left < size + 4 || bottom - top < size + 4)) {
      this.button.classList.remove("tp-visible");
      return;
    }
    this.host.place(this.button, right - this.button.offsetWidth - 2, top + 2);
  }
  hide() {
    this.target = void 0;
    this.button.classList.remove("tp-visible");
  }
  open() {
    const target = this.target;
    if (!target) return;
    this.hide();
    if (this.host.editing) {
      this.host.editInPopup();
      return;
    }
    const ref = this.host.cellRef(target.info, target.cell);
    if (ref) this.host.editCell(target.info, ref, void 0, true);
  }
};

// table-plus/src/features/metadata.ts
function withoutMetadata(table) {
  const { meta: _meta, metaSource: _source, ...rest } = table;
  return { ...rest, rows: table.rows.map((row) => row.cells.some(hasTags) ? { ...row, cells: row.cells.map(withoutTags) } : row) };
}
var hasTags = (cell) => cellTags(cell).length > 0;
function hasMetadata(table) {
  return table.meta !== void 0 || table.rows.some((row) => row.cells.some(hasTags));
}
function plural2(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
function described(parts, tables, form) {
  const told = new Set(parts.flatMap((part) => part.tags));
  const untold = tables.some(
    (table) => table.rows.some((row) => row.cells.some((cell) => cellTags(cell).some((tag) => attributesOf(tag).some((name) => !told.has(name)))))
  );
  return [...parts.map(form), ...untold ? [`${parts.length ? "other " : ""}hidden data in cells`] : []];
}
var Metadata = class {
  constructor(host) {
    this.host = host;
  }
  host;
  toolbarButtons(widget, info) {
    if (!hasMetadata(parseTable(info.source))) return [];
    return [
      {
        label: "Remove metadata",
        icon: ICONS.trash,
        danger: true,
        title: "Remove this table's <meta> tags: its stored settings (sorting, filters, pinning, name, theme, stripes) and what its cells keep (formulas, which keep their results, names)",
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
    const removed = [
      ...shownInfo.metaRow ? ["its stored settings (sorting, filters, pinning, name, theme, stripes)"] : [],
      ...described(this.host.metadataParts([shown]), [shown], (p) => `its ${plural2(p.count, p.what)}${p.note ? `: ${p.note}` : ""}`)
    ];
    if (!await this.host.ask(`Remove this table's metadata, ${removed.join(", and ")}? Ctrl+Z brings it back.`)) return;
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    if (parseTable(info.source).meta) this.host.forgetStoredView(info.key);
    await this.host.write(widget, withoutMetadata);
    this.host.focusEditor(widget);
  }
  /** Removes the metadata of all tables on the current page, once confirmed */
  async removeFromPage() {
    const { bridge } = this.host;
    const text = await bridge.getText();
    const tables = findTables(text).filter((range) => {
      return hasMetadata(parseTable(range.text));
    }).reverse();
    if (tables.length === 0) {
      void bridge.flash("Table Plus: no table on this page has metadata", "info");
      return;
    }
    const models = tables.map((range) => parseTable(range.text));
    const parts = described(this.host.metadataParts(models), models, (p) => `${plural2(p.count, p.what)}${p.note ? ` (${p.note})` : ""}`);
    const question = `Remove the metadata of ${tables.length === 1 ? "the 1 table" : `all ${tables.length} tables`} on this page` + (parts.length ? `, including ${parts.join(" and ")}` : "") + "? Ctrl+Z brings it back.";
    if (!await this.host.ask(question)) return;
    const from = tables[tables.length - 1].from;
    const to = tables[0].to;
    let span = text.slice(from, to);
    const page = await bridge.getCurrentPage();
    for (const range of tables) {
      const table = parseTable(range.text);
      if (table.meta) this.host.forgetStoredView(`${page}#${range.ordinal}`);
      span = span.slice(0, range.from - from) + serializeTable(withoutMetadata(table)) + span.slice(range.to - from);
    }
    const edit = minimalEdit(text.slice(from, to), span);
    await bridge.replaceRange(from + edit.from, from + edit.to, edit.insert);
    this.host.doc.querySelector(EDITOR_SELECTOR)?.focus({ preventScroll: true });
    void bridge.flash(`Table Plus: removed the metadata of ${tables.length} table(s)`, "info");
  }
};

// table-plus/src/features/names.ts
function listed(names) {
  const shown = names.slice(0, 5);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown.join("");
}
var Names = class {
  constructor(host) {
    this.host = host;
  }
  host;
  /** A name is one cell's, one row's: a copy of a row takes none */
  uniqueTags() {
    return ["n", "cn"];
  }
  /** Deleting a column removes the names of the rows and cells it holds, and the formulas using them break */
  columnDeleteWarning(info, column) {
    const body = parseTable(info.source).rows.slice(1);
    const rows = body.flatMap((r) => {
      const named2 = rowNameIn(r.cells);
      return named2 && named2.column === column ? [named2.name] : [];
    });
    const cells = body.flatMap((r) => {
      const name = cellNameOf(r.cells[column] ?? "");
      return name ? [name] : [];
    });
    if (!rows.length && !cells.length) return void 0;
    const lost = [
      ...rows.length ? [`the name${rows.length === 1 ? "" : "s"} of ${rows.length === 1 ? "the row" : `${rows.length} rows`} ${listed(rows)}`] : [],
      ...cells.length ? [`the name${cells.length === 1 ? "" : "s"} of ${cells.length === 1 ? "the cell" : `${cells.length} cells`} ${listed(cells)}`] : []
    ];
    return `${lost.join(" and ")}: formulas that use ${rows.length + cells.length === 1 ? "it" : "them"} show #REF! or #NAME?`;
  }
  /** Remove metadata removes the names of columns, rows and cells */
  metadataPart(tables) {
    const count = tables.reduce(
      (n, table) => n + table.rows.reduce((m, row) => m + row.cells.filter((cell) => nameOf(cell) !== void 0 || cellNameOf(cell) !== void 0).length, 0),
      0
    );
    return count ? { count, what: "name", tags: ["n", "cn"] } : void 0;
  }
  /** Named cells show a mark in their corner, and their name on hover */
  decorate(_widget, info) {
    const model = parseTable(info.source);
    model.rows[0]?.cells.forEach((raw, column) => {
      const name = nameOf(raw);
      const cell = info.table.rows[0]?.cells[column];
      if (!name || !cell) return;
      cell.classList.add("tp-named");
      cell.title = cell.title ? `${cell.title}
Column name: ${name}` : `Column name: ${name}`;
    });
    for (const tr of this.host.bodyRows(info)) {
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
  /** The table's name at the toolbar's left: a click opens its ⋯ menu, the name to type in its title */
  toolbarButtons(widget, info) {
    const name = metaName(parseTable(info.source));
    if (!name) return [];
    const title = `This table is named ${name}: formulas in other tables refer to it as ${name}!A1. Click to rename it`;
    return [{ label: name, title, place: "label", run: () => this.host.openTableMenu(widget, true) }];
  }
  /**
   * The name of what a menu is about, in its title with a pencil: the table's
   * (formulas elsewhere use it as name!A1), a row's (name[column]), a cell's,
   * a column's ([name] whatever its header says). Names are metadata: with
   * the setting off only one already there can be changed or removed.
   */
  menuNaming(widget, info, target) {
    const table = parseTable(info.source);
    const needs = "Needs the Store table metadata setting";
    if (target.kind === "table") {
      const name2 = metaName(table);
      return {
        ...name2 ? { name: name2 } : {},
        label: name2 ? `Rename this table (formulas elsewhere refer to it as ${name2}!A1)` : "Name this table, so formulas in other tables can refer to it (name!A1)",
        ...info.metaRow || this.host.metadataEnabled ? {} : { disabled: needs },
        save: (next) => this.renameTable(widget, info, next)
      };
    }
    if (target.kind === "row") {
      const name2 = rowNameIn(table.rows[target.row]?.cells ?? [])?.name;
      return {
        ...name2 ? { name: name2 } : {},
        label: name2 ? `Rename this row (formulas use its cells as ${name2}[column])` : "Name this row, so formulas use its cells as name[column], wherever it is moved",
        ...this.host.metadataEnabled || name2 !== void 0 ? {} : { disabled: needs },
        save: (next) => this.nameRow(widget, info, target.row, next)
      };
    }
    if (target.kind === "cell") {
      const name2 = cellNameOf(table.rows[target.row]?.cells[target.column] ?? "");
      return {
        ...name2 ? { name: name2 } : {},
        label: name2 ? `Rename this cell (formulas use it as ${name2})` : "Name this cell, so formulas use it by its name, wherever it is moved",
        ...this.host.metadataEnabled || name2 !== void 0 ? {} : { disabled: needs },
        save: (next) => this.nameCell(widget, info, target.row, target.column, next)
      };
    }
    const name = nameOf(table.rows[0]?.cells[target.column] ?? "");
    return {
      ...name ? { name } : {},
      label: name ? `Rename this column (formulas refer to it as [${name}])` : "Name this column, so formulas refer to it as [name] whatever its header says",
      ...this.host.metadataEnabled || name !== void 0 ? {} : { disabled: needs },
      save: (next) => this.rename(widget, info, target.column, next)
    };
  }
  /** A name saved as it was: nothing written, the keyboard back in the page (the menu's field had it) */
  unchanged(widget) {
    this.host.focusEditor(widget);
    return void 0;
  }
  /**
   * Names, renames or (with an empty name) unnames a table; refused, with
   * why, when it is not a valid name or another table on the page has it
   */
  async renameTable(shownWidget, shownInfo, name) {
    const shown = parseTable(shownInfo.source);
    if (name === (shown.meta?.name?.trim() ?? "")) return this.unchanged(shownWidget);
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    const problem = name === "" ? void 0 : tableNameProblem(name);
    if (problem) return problem;
    if (name !== "") {
      const text = await this.host.bridge.getText();
      const self = locateBySource(text, info.hint, info.source);
      const taken = findTables(text).some((range) => {
        if (range.from === self?.from) return false;
        const other = metaName(parseTable(range.text));
        return other !== void 0 && sameTableName(other, name);
      });
      if (taken) return `another table on this page is named ${name}`;
    }
    await this.host.write(widget, (t) => withMetaName(t, name === "" ? void 0 : name));
    this.host.focusEditor(widget);
    return void 0;
  }
  /** Names a row (empty: unnames it); refused, with why, when not valid or another row of the table has it */
  async nameRow(shownWidget, shownInfo, row, name) {
    const table = parseTable(shownInfo.source);
    const current = rowNameIn(table.rows[row]?.cells ?? [])?.name ?? "";
    if (name === current) return this.unchanged(shownWidget);
    let problem = name === "" ? void 0 : nameProblem(name, "row");
    const other = name ? namedRows(table).get(name.toLowerCase()) : void 0;
    if (!problem && other !== void 0 && other !== row) problem = `another row of this table is named ${name}`;
    if (problem) return problem;
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => {
      const column = rowNameIn(t.rows[row]?.cells ?? [])?.column ?? 0;
      return setCell(t, row, column, withName(t.rows[row]?.cells[column] ?? "", name || void 0));
    });
    this.host.focusEditor(widget);
    return void 0;
  }
  /** Names a cell (empty: unnames it); refused, with why, when not valid, a function's or another cell's on the page */
  async nameCell(shownWidget, shownInfo, row, column, name) {
    const current = cellNameOf(parseTable(shownInfo.source).rows[row]?.cells[column] ?? "") ?? "";
    if (name === current) return this.unchanged(shownWidget);
    let problem = name === "" ? void 0 : nameProblem(name, "cell");
    if (!problem && name && functionNamed(name.toUpperCase())) problem = `${name} is a function's name`;
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
    if (problem) return problem;
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => setCell(t, row, column, withCellName(t.rows[row]?.cells[column] ?? "", name || void 0)));
    this.host.focusEditor(widget);
    return void 0;
  }
  /** Names a column (empty: unnames it); refused, with why, when not valid or another column answers to it */
  async rename(shownWidget, shownInfo, column, name) {
    const headers = parseTable(shownInfo.source).rows[0]?.cells ?? [];
    const current = nameOf(headers[column] ?? "") ?? "";
    if (name === current) return this.unchanged(shownWidget);
    const problem = name === "" ? void 0 : nameProblem(name, "column");
    const taken = name !== "" && headers.some((header, c) => c !== column && (nameOf(header)?.toLowerCase() === name.toLowerCase() || columnIdOf(headers, c)?.name === name.toLowerCase()));
    if (problem || taken) return problem ?? `another column of this table is named ${name}`;
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => setCell(t, 0, column, withName(t.rows[0]?.cells[column] ?? "", name || void 0)));
    this.host.focusEditor(widget);
    return void 0;
  }
};

// table-plus/src/features/lazy.ts
var PENDING_CLASS = "tp-lazy-pending";
var LEAVING_MS = 5e3;
var cellId = (edit) => `${edit.row}:${edit.column}`;
function applyEdits(table, edits) {
  let skipped = 0;
  const result = edits.reduce((t, edit) => {
    const cell = t.rows[edit.row]?.cells[edit.column] ?? "";
    if (cell === edit.value) return t;
    if (cell !== edit.original) {
      skipped++;
      return t;
    }
    return setCell(t, edit.row, edit.column, edit.value);
  }, table);
  return { table: result, skipped };
}
var Lazy = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // Tables switched to lazy saving, by key (for this visit of the page)
  on = /* @__PURE__ */ new Set();
  held = /* @__PURE__ */ new Map();
  // The cells marked as held, by table: unmarked without going through every cell of a large table
  marked = /* @__PURE__ */ new Map();
  timer;
  // A table's flush on its way (the delay, the tab hidden or closing, a toggle may come together): the others wait for it
  flushing = /* @__PURE__ */ new Map();
  // A navigation started: nothing is written into the editor until the page is loaded
  leavingSince = 0;
  start() {
    const win = this.host.doc.defaultView;
    win.addEventListener("beforeunload", this.onBeforeUnload);
    win.addEventListener("popstate", this.onPopState, true);
    this.host.doc.addEventListener("visibilitychange", this.onVisibilityChange);
  }
  stop() {
    clearTimeout(this.timer);
    const win = this.host.doc.defaultView;
    win.removeEventListener("beforeunload", this.onBeforeUnload);
    win.removeEventListener("popstate", this.onPopState, true);
    this.host.doc.removeEventListener("visibilitychange", this.onVisibilityChange);
  }
  /** The switch: on, cells edited are written later; off, what is held is written at once */
  toolbarButtons(_widget, info) {
    const on = this.on.has(info.key);
    const unsaved = this.held.get(info.key)?.edits.size ?? 0;
    return [
      {
        label: "Lazy saving",
        title: !on ? "Lazy saving: cells edited are saved together, a moment after editing stops" : unsaved ? `Lazy saving is on: ${unsaved} ${unsaved === 1 ? "cell" : "cells"} not saved yet. Click to save now and turn it off` : "Lazy saving is on: cells edited are saved together, a moment after editing stops. Click to turn it off",
        place: "icon",
        icon: ICONS.lazy,
        pressed: on,
        attention: on && unsaved > 0,
        run: () => this.toggle(info.key)
      }
    ];
  }
  toggle(key2) {
    if (this.on.delete(key2)) void this.switchedOff(key2);
    else this.on.add(key2);
    this.host.toolbarChanged();
  }
  /**
   * Switched off: written at once, the cell being edited too (a press on the
   * toolbar leaves its editor open): closed and saved first, no longer held,
   * in a write that takes the others along
   */
  async switchedOff(key2) {
    if (this.host.editing) await this.host.saveEditing();
    await this.flush(key2);
  }
  holdCellEdit(_widget, info, edit) {
    if (!this.on.has(info.key)) return false;
    const held = this.held.get(info.key) ?? { page: this.host.currentPage, hint: info.hint, source: info.source, edits: /* @__PURE__ */ new Map() };
    const id = cellId(edit);
    const original = held.edits.get(id)?.original ?? edit.original;
    if (edit.value === original) held.edits.delete(id);
    else held.edits.set(id, { ...edit, original });
    if (held.edits.size) this.held.set(info.key, held);
    else this.held.delete(info.key);
    this.show(info);
    this.host.toolbarChanged();
    void this.schedule();
    return true;
  }
  pendingEdits(info) {
    const held = this.held.get(info.key);
    if (!held?.edits.size) return void 0;
    const edits = [...held.edits.values()];
    let skipped = 0;
    return {
      apply: (table) => {
        const applied = applyEdits(table, edits);
        skipped = applied.skipped;
        return applied.table;
      },
      written: () => this.written(info.key, edits, skipped)
    };
  }
  /** Edits written (by any write of the table): no longer held, unless edited again meanwhile */
  written(key2, edits, skipped) {
    const held = this.held.get(key2);
    if (held) {
      for (const edit of edits) if (held.edits.get(cellId(edit)) === edit) held.edits.delete(cellId(edit));
      if (!held.edits.size) {
        this.held.delete(key2);
        this.marked.delete(key2);
      }
    }
    if (skipped) void this.host.bridge.flash(`Table Plus: ${skipped} ${skipped === 1 ? "cell was" : "cells were"} changed elsewhere meanwhile, the edit there was not saved`, "error");
    this.host.toolbarChanged();
  }
  // Editing goes on: nothing is written meanwhile; it stops: written after the delay
  editorOpened(_editor) {
    clearTimeout(this.timer);
  }
  editorClosed(_editor) {
    void this.schedule();
  }
  async schedule() {
    clearTimeout(this.timer);
    if (!this.held.size) return;
    const delay = await this.host.setting("lazyDelay");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.host.editing) void this.flushAll();
    }, delay);
  }
  // A table rendered anew (an edit elsewhere, or back in view): where it is now; written after the delay, if a flush found it gone
  enhanced(_widget, info) {
    const held = this.held.get(info.key);
    if (!held) return;
    held.hint = info.hint;
    held.source = info.source;
    if (!this.host.editing) void this.schedule();
  }
  /**
   * Ctrl+Z with cells held (not in a field, which undoes its own typing): they
   * are written, then that write undone, so they go back together (Ctrl+Y
   * brings them back); the editor's undo would undo the edit before them
   */
  keyDown(e) {
    const undo = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "z";
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const { undo: undoEdit } = this.host.bridge;
    if (!undo || inField || !this.held.size || !undoEdit) return false;
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      const writes = await this.flushAll();
      for (let i = 0; i < writes; i++) await undoEdit();
    })();
    return true;
  }
  viewApplied(_widget, info) {
    if (this.held.has(info.key)) this.show(info);
  }
  /** The held cells show what was typed (as text: the markdown renders once written) */
  show(info) {
    for (const cell of this.marked.get(info.key) ?? []) cell.classList.remove(PENDING_CLASS);
    const marked = [];
    for (const edit of this.held.get(info.key)?.edits.values() ?? []) {
      const cell = this.host.cellAt(info, edit, true);
      const content = cell?.querySelector(":scope > .tp-cell-content");
      if (!cell || !content || cell.classList.contains("tp-editing")) continue;
      content.textContent = unescapeCell(withoutTags(edit.value));
      cell.classList.add(PENDING_CLASS);
      marked.push(cell);
    }
    if (marked.length) this.marked.set(info.key, marked);
    else this.marked.delete(info.key);
  }
  /** Writes what is held for every table; how many writes went into the editor */
  async flushAll() {
    let writes = 0;
    for (const key2 of [...this.held.keys()]) if (await this.flush(key2)) writes++;
    return writes;
  }
  /**
   * Writes what is held for a table: into the editor while its page is there,
   * else into the page's file; whether it went into the editor (one undo step)
   */
  async flush(key2) {
    const going = this.flushing.get(key2);
    if (going) {
      await going;
      return false;
    }
    const flush = this.flushNow(key2).finally(() => this.flushing.delete(key2));
    this.flushing.set(key2, flush);
    return flush;
  }
  async flushNow(key2) {
    clearTimeout(this.timer);
    const held = this.held.get(key2);
    if (!held?.edits.size) return false;
    if (Date.now() - this.leavingSince < LEAVING_MS) return false;
    if (await this.host.bridge.getCurrentPage() !== held.page) {
      await this.flushToPage(key2, held);
      return false;
    }
    const widget = this.host.widgetForKey(key2);
    if (!widget || this.host.editing) return false;
    return await this.host.write(widget, (table) => table) === "written";
  }
  /** The page left: what was held for it is written into its file (SilverBullet saved it before loading the other) */
  async flushToPage(key2, held) {
    const { readPage, writePage } = this.host.bridge;
    const count = held.edits.size;
    const lost = () => void this.host.bridge.flash(`Table Plus: ${count} ${count === 1 ? "cell" : "cells"} edited on ${held.page} could not be saved`, "error");
    if (!readPage || !writePage) return lost();
    try {
      const text = await readPage(held.page);
      const range = locateBySource(text, held.hint, held.source);
      if (!range) return lost();
      const { table, skipped } = applyEdits(parseTable(range.text), [...held.edits.values()]);
      const format = await this.host.setting("autoFormat");
      const markdown = serializeTable(format ? { ...table, padded: true } : table);
      await writePage(held.page, text.slice(0, range.from) + markdown + text.slice(range.to));
      this.held.delete(key2);
      const saved = count - skipped;
      if (saved) void this.host.bridge.flash(`Table Plus: saved ${saved} ${saved === 1 ? "cell" : "cells"} edited on ${held.page}`, "info");
      if (skipped) void this.host.bridge.flash(`Table Plus: ${skipped} ${skipped === 1 ? "cell" : "cells"} on ${held.page} changed elsewhere meanwhile, the edit there was not saved`, "error");
    } catch (e) {
      console.error("Table Plus: could not save the cells held", e);
      lost();
    }
  }
  async pageLoaded(name) {
    this.leavingSince = 0;
    for (const [key2, held] of [...this.held]) if (held.page !== name) await this.flush(key2);
    for (const key2 of [...this.on]) if (!key2.startsWith(`${name}#`)) this.on.delete(key2);
  }
  // A navigation: nothing goes into the editor until the other page is loaded (pageLoaded)
  onPopState = () => {
    if (!this.held.size) return;
    clearTimeout(this.timer);
    this.leavingSince = Date.now();
    setTimeout(() => void this.schedule(), LEAVING_MS + 10);
  };
  // The tab closing (or reloading): written at once, and the browser asks whether to leave meanwhile
  onBeforeUnload = (e) => {
    if (!this.held.size) return;
    void this.flushAll();
    e.preventDefault();
    e.returnValue = "";
  };
  // The tab hidden (another tab, an app on a phone): written at once, as it may not come back
  onVisibilityChange = () => {
    if (this.host.doc.visibilityState === "hidden" && this.held.size && !this.host.editing) void this.flushAll();
  };
};

// table-plus/src/features/themes.ts
var STRIPES_ICONS = { none: ICONS.stripesNone, rows: ICONS.stripesRows, columns: ICONS.stripesColumns };
var STRIPES_TITLES = {
  none: "No stripes",
  rows: "Striped rows: every other row tinted",
  columns: "Striped columns: every other column tinted"
};
function metaTheme(table) {
  return themeName(table.meta?.theme);
}
function metaStripes(table) {
  return stripesName(table.meta?.stripes);
}
var Themes = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // The settings, read when Table Plus starts and again as tables are enhanced
  theme = NATIVE_THEME;
  stripes = "rows";
  start() {
    void this.readSettings();
  }
  stop() {
    for (const widget of this.widgets()) {
      delete widget.dataset.tpTheme;
      delete widget.dataset.tpStripes;
    }
  }
  // Before the browser lays the table out: its metadata row's choices as rendered (<meta theme="…" stripes="…">), else the settings'
  tableAdded(widget, _table, rows) {
    const meta = rows[rows.length - 1]?.querySelector("meta");
    this.mark(widget, themeName(meta?.getAttribute("theme")) ?? this.theme, stripesName(meta?.getAttribute("stripes")) ?? this.stripes);
  }
  enhanced(widget, info) {
    this.markFor(widget, info);
    void this.readSettings();
  }
  markFor(widget, info) {
    const table = parseTable(info.source);
    this.mark(widget, metaTheme(table) ?? this.theme, metaStripes(table) ?? this.stripes);
  }
  async readSettings() {
    const [theme, stripes] = await Promise.all([this.host.setting("theme"), this.host.setting("stripes")]);
    if (theme === this.theme && stripes === this.stripes) return;
    this.theme = theme;
    this.stripes = stripes;
    for (const widget of this.widgets()) {
      const info = this.host.infoOf(widget);
      if (info) this.markFor(widget, info);
    }
  }
  /** The theme on the table (native: none, SilverBullet's own look), and its stripes unless they are the rows (SilverBullet's own) */
  mark(widget, theme, stripes) {
    if (theme === NATIVE_THEME) delete widget.dataset.tpTheme;
    else if (widget.dataset.tpTheme !== theme) widget.dataset.tpTheme = theme;
    if (stripes === "rows") delete widget.dataset.tpStripes;
    else if (widget.dataset.tpStripes !== stripes) widget.dataset.tpStripes = stripes;
  }
  widgets() {
    return Array.from(this.host.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`));
  }
  /**
   * Theme in the table's ⋯ menu: Global theme first (the table's own theme
   * and stripes go: it follows the settings), the stripes (three icons: none,
   * rows, columns), then every theme; a stripes or a theme picked is stored in
   * the table's metadata row, also the settings' one (kept whatever the
   * settings become). As names are, only where the table can have metadata.
   */
  toolbarButtons(widget, info) {
    if (!info.metaRow && !this.host.metadataEnabled) return [];
    const table = parseTable(info.source);
    const own = metaTheme(table);
    const ownStripes = metaStripes(table);
    const set = (choices) => () => void this.choose(widget, info, choices);
    const item = (label, checked, run, detail) => ({ kind: "item", label, icon: "", checked, run, ...detail ? { detail } : {} });
    const themes = () => {
      const preview = this.preview(ownStripes ?? this.stripes);
      const showing = (theme) => () => {
        if (theme === NATIVE_THEME) delete preview.dataset.tpTheme;
        else preview.dataset.tpTheme = theme;
        return preview;
      };
      const detail = (theme) => ({ title: themeLabel(theme), content: showing(theme) });
      return [
        // First the global theme (as "No type" leads the column types): the table's own theme and stripes go, it follows the settings
        // The settings' theme after it, no preview (it is listed below, marked default)
        { ...item("Global theme", own === void 0 && ownStripes === void 0, set({ theme: void 0, stripes: void 0 })), value: { text: themeLabel(this.theme) } },
        { kind: "separator" },
        stripesRow,
        { kind: "separator" },
        // Then every theme, the setting's marked (default): one picked is the table's own, the setting's one too, whatever the setting becomes
        ...allThemes(this.host.doc).map(
          (theme) => item(
            `${themeLabel(theme)}${theme === this.theme ? " (default)" : ""}`,
            own === theme,
            set({ theme }),
            detail(theme)
          )
        )
      ];
    };
    const stripesRow = {
      kind: "segmented",
      label: "Stripes",
      // The table's own marked, none while it follows the setting (as a theme picked is; Global theme: the setting's again)
      options: STRIPES.map((s) => ({ icon: STRIPES_ICONS[s], title: STRIPES_TITLES[s], active: s === ownStripes, run: set({ stripes: s }) }))
    };
    return [
      {
        label: "Theme",
        title: "How this table looks: the Theme and Stripes settings (Global theme), or a theme and stripes of its own (stored in the table)",
        icon: ICONS.theme,
        value: own ? themeLabel(own) : `${themeLabel(this.theme)} (global)`,
        // Not used: the item opens its choices
        run: () => {
        },
        choices: { title: "Table theme", entries: themes }
      }
    ];
  }
  /** A small table to preview themes on (in a menu's bubble: not one of the page's), with these stripes */
  preview(stripes) {
    const { doc } = this.host;
    const widget = doc.createElement("div");
    widget.className = "sb-table-widget tp-theme-preview";
    widget.setAttribute("aria-hidden", "true");
    if (stripes !== "rows") widget.dataset.tpStripes = stripes;
    const table = doc.createElement("table");
    const row = (section, cells) => {
      const tr = section.insertRow();
      cells.forEach((text, i) => {
        const td = tr.insertCell();
        td.textContent = text;
        if (i > 0) td.className = "tp-preview-number";
      });
    };
    row(table.createTHead(), ["Name", "Qty", "Price"]);
    const body = table.createTBody();
    for (const cells of [["Pear", "3", "12.99"], ["Apple", "10", "4.50"], ["Fig", "2", "25.00"], ["Kiwi", "7", "6.10"]]) row(body, cells);
    widget.append(table);
    return widget;
  }
  /** The table's own choices written into its metadata row, as one edit (undefined: the setting's again) */
  async choose(shownWidget, shownInfo, choices) {
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (table) => Object.entries(choices).reduce((t, [name, value]) => withMeta(t, name, value), table));
    this.host.focusEditor(widget);
  }
};

// table-plus/src/features/paste.ts
var PASTE_BLOCKED = "Clear sorting and filters to paste cells: the rows shown are not where they would go";
var NO_CLIPBOARD = "The browser lets a page read the clipboard only over https: paste with Ctrl+V, or into a cell's editor";
function plural3(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
function sameText(text) {
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}
var Paste = class {
  constructor(host) {
    this.host = host;
  }
  host;
  // The paste on its way was asked for with Ctrl+Shift+V: as new rows
  inserts = false;
  // What the clipboard holds, where the page may read it without asking (Chrome, the permission granted); else unknown
  clipboard = "unknown";
  readable = false;
  // The clipboard's reads in order: a later one's result wins; the permission watched, until stop
  reads = 0;
  permission;
  stopped = false;
  // Cells copied or cut (waiting to be moved by a paste); their outline
  cut;
  edges = [];
  /**
   * Where the browser says the page may read the clipboard without asking,
   * what it holds is read again when the page comes back to the front (copied
   * in another application: Excel) and on every press (copied in this page),
   * so Paste in the cell menu shows disabled when there is nothing to paste
   */
  start() {
    const win = this.host.doc.defaultView;
    win.addEventListener("cut", this.onCut, true);
    win.addEventListener("copy", this.onCopy, true);
    if (!win.navigator.clipboard?.readText) return;
    win.addEventListener("focus", this.refresh);
    win.addEventListener("pointerdown", this.refresh, true);
    this.host.doc.addEventListener("visibilitychange", this.refresh);
    void win.navigator.permissions?.query({ name: "clipboard-read" }).then((status) => {
      if (this.stopped) return;
      const update = () => {
        this.readable = status.state === "granted";
        if (!this.readable) this.clipboard = "unknown";
        this.refresh();
      };
      status.addEventListener("change", update);
      this.permission = { status, update };
      update();
    }).catch(() => {
    });
  }
  stop() {
    const win = this.host.doc.defaultView;
    win.removeEventListener("cut", this.onCut, true);
    win.removeEventListener("copy", this.onCopy, true);
    win.removeEventListener("focus", this.refresh);
    win.removeEventListener("pointerdown", this.refresh, true);
    this.host.doc.removeEventListener("visibilitychange", this.refresh);
    this.permission?.status.removeEventListener("change", this.permission.update);
    this.stopped = true;
    this.readable = false;
    this.endCut();
  }
  refresh = () => {
    const clipboard = this.host.doc.defaultView.navigator.clipboard;
    if (!this.readable || !clipboard?.readText || !this.host.doc.hasFocus()) return;
    const read = ++this.reads;
    const set = (state) => {
      if (read === this.reads) this.clipboard = state;
    };
    clipboard.readText().then(
      (text) => set(text ? "text" : "empty"),
      () => set("unknown")
    );
  };
  // The paste event does not tell Shift; the key may come before the editor opens (Ctrl+V on a selected cell). Esc ends a copy's or cut's outline.
  keyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") this.inserts = e.shiftKey;
    if (e.key === "Escape") this.endCut();
    return false;
  }
  editorOpened(editor) {
    const field = editor.field;
    field.addEventListener("paste", (e) => {
      const insert = this.inserts;
      this.inserts = false;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const active = this.host.editing;
      const info = active && this.host.infoOf(active.widget);
      if (!active || !info || active.field !== field) return;
      const whole = field.selectionStart === 0 && field.selectionEnd === field.value.length;
      const own = this.cut?.cells.some((row) => row.some((ref) => ref.row === active.row && ref.column === active.column));
      const cut = insert || !whole || own ? void 0 : this.cutFor(info, text);
      const data = parseClipboardCells(text);
      if (!cut && !data) {
        this.endCut();
        return;
      }
      e.preventDefault();
      void this.paste(active.widget, info, active, data ?? [[text]], insert, true, cut);
    });
  }
  // A table rendered anew: the cells copied or cut outlined again, or the outline (and a cut) ended where they changed
  enhanced(_widget, info) {
    if (this.cut?.key !== info.key) return;
    if (this.clipFor(info)) this.markCut(info);
    else this.endCut();
  }
  /** Copy, Cut, Paste and Paste as new rows in the cell menu, a bar of icons first (pasted from the first cell) */
  cellMenuEntries(widget, info, cells) {
    const at = cells[0];
    if (!at) return void 0;
    const name = cells.length > 1 ? `${cells.length} cells` : "";
    const header = cells.some((ref) => ref.row === 0);
    const bar = this.clipboardBar(widget, info, {
      copied: cells,
      cut: header ? void 0 : cells,
      cutBlocked: "A header keeps its name: cut the cells under it",
      at,
      name,
      asRows: true,
      fromHeader: false
    });
    return { order: -1, entries: [bar] };
  }
  /**
   * Copy, Cut and Paste in the menu of rows (columns): their cells; a column's
   * with its header, but cut without it (a column keeps its name). Pasted from
   * their first cell (a column's header: a column copied names it), rows also
   * as new rows.
   */
  lineMenuEntries(widget, info, axis, lines) {
    const first = Math.min(...lines);
    if (!Number.isFinite(first)) return [];
    const rows = axis === "row" ? lines : this.host.shownRows(info).map((tr) => tr === info.table.rows[0] ? 0 : Number(tr.dataset.tpRow));
    const columns = axis === "row" ? Array.from({ length: info.columns }, (_, c) => c) : [...lines].sort((a, b) => a - b);
    const cells = rows.flatMap((row) => columns.map((column) => ({ row, column })));
    const body = cells.filter((ref) => ref.row > 0);
    const name = `${lines.length > 1 ? `${lines.length} ` : ""}${axis === "row" ? "row" : "column"}${lines.length > 1 ? "s" : ""}`;
    const at = axis === "row" ? { row: first, column: 0 } : { row: 0, column: first };
    return [
      this.clipboardBar(widget, info, {
        copied: cells,
        cut: body.length ? body : void 0,
        cutBlocked: "No cells under the header to cut",
        at,
        name,
        asRows: axis === "row",
        fromHeader: axis === "column"
      })
    ];
  }
  /**
   * The clipboard's bar: Copy, Cut, Paste (Paste as new rows) as icons with a
   * caption, their full names (Copy 3 rows) as tooltips; Paste from `at`
   */
  clipboardBar(widget, info, o) {
    const cut = this.cutFor(info);
    const clipboard = this.host.doc.defaultView.navigator.clipboard;
    const disabled = this.host.rearranged(info) ? PASTE_BLOCKED : cut ? void 0 : !clipboard?.readText ? NO_CLIPBOARD : this.clipboard === "empty" ? "The clipboard holds no text to paste" : void 0;
    const rowsCut = cut && this.cutRows(info, cut);
    const named2 = (action) => o.name ? `${action} ${o.name}` : action;
    const options = [
      { icon: ICONS.copy, caption: "Copy", title: named2("Copy"), run: () => void this.copy(info, o.copied, false) },
      {
        icon: ICONS.cut,
        caption: "Cut",
        title: named2("Cut"),
        run: () => void this.copy(info, o.cut ?? [], true),
        ...o.cut ? {} : { disabled: o.cutBlocked }
      },
      {
        icon: ICONS.paste,
        caption: "Paste",
        title: cut ? `Paste (move ${plural3(cut.cells.length * (cut.cells[0]?.length ?? 0), "cell")})` : "Paste",
        run: () => void this.pasteFromMenu(widget, info, o.at, false, o.fromHeader),
        ...disabled ? { disabled } : {}
      }
    ];
    if (o.asRows) {
      options.push({
        icon: ICONS.pasteRows,
        caption: "+ Rows",
        title: rowsCut ? "Paste as new rows (move the rows cut)" : "Paste as new rows",
        run: () => void this.pasteFromMenu(widget, info, o.at, true),
        ...rowsCut ? this.host.rearranged(info) ? { disabled: PASTE_BLOCKED } : {} : !clipboard?.readText ? { disabled: NO_CLIPBOARD } : disabled && !cut ? { disabled } : {}
      });
    }
    return { kind: "actions", options };
  }
  /** The cells selected, in rows as shown, of the table they are in */
  selection() {
    for (const widget of Array.from(this.host.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
      const cells = info ? this.host.selectedCells(info) : [];
      if (info && cells.length) return { widget, info, cells: [...cells] };
    }
    return void 0;
  }
  /** Cells as rows (as shown), and their values as Ctrl+C copies them */
  valuesOf(info, cells) {
    const byRow = /* @__PURE__ */ new Map();
    for (const ref of cells) byRow.set(ref.row, [...byRow.get(ref.row) ?? [], ref]);
    const rows = Array.from(byRow.values());
    const values = rows.map(
      (row) => row.map((ref) => {
        const cell = this.host.cellAt(info, ref, true);
        return cell ? cellValue2(cell) : "";
      })
    );
    return { rows, values };
  }
  /** Copy (Cut) in the menu: the cells onto the clipboard, as Ctrl+C puts them; cut, they are marked to move */
  async copy(info, cells, cutting) {
    const { rows, values } = this.valuesOf(info, cells);
    const text = clipboardText(values);
    this.endCut();
    try {
      await writeClipboard(this.host.doc, text, clipboardHtml(values));
    } catch (e) {
      void this.host.bridge.flash(`Table Plus: could not copy (${String(e)})`, "error");
      return;
    }
    const size = `${values.length} \xD7 ${values[0]?.length ?? 0} cells`;
    if (cutting && this.host.rearranged(info)) {
      void this.host.bridge.flash(`Table Plus: copied ${size} (sorted or filtered, cells are not cut: the rows shown are not where they are)`, "info");
      return;
    }
    this.startCut(info, rows, text, cutting);
    void this.host.bridge.flash(cutting ? `Table Plus: cut ${size}: paste them where they go` : `Table Plus: copied ${size}`, "info");
  }
  /**
   * Ctrl+X with cells selected (not in a field: there it cuts text): the cells
   * onto the clipboard as Ctrl+C puts them, marked to move when pasted; with
   * the header in them, only copied (a column keeps its name)
   */
  onCut = (e) => {
    const active = this.host.doc.activeElement;
    if (copyingFromMenu() || !e.clipboardData || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    const selected = this.selection();
    if (!selected) return;
    const { rows, values } = this.valuesOf(selected.info, selected.cells);
    const text = clipboardText(values);
    e.clipboardData.setData("text/plain", text);
    e.clipboardData.setData("text/html", clipboardHtml(values));
    e.preventDefault();
    e.stopImmediatePropagation();
    this.endCut();
    const size = `${values.length} \xD7 ${values[0]?.length ?? 0} cells`;
    if (selected.cells.some((ref) => ref.row === 0)) {
      void this.host.bridge.flash(`Table Plus: copied ${size} (a header keeps its name: cut the cells under it)`, "info");
      return;
    }
    if (this.host.rearranged(selected.info)) {
      void this.host.bridge.flash(`Table Plus: copied ${size} (sorted or filtered, cells are not cut: the rows shown are not where they are)`, "info");
      return;
    }
    this.startCut(selected.info, rows, text, true);
    void this.host.bridge.flash(`Table Plus: cut ${size}: paste them where they go`, "info");
  };
  /**
   * Another copy: Ctrl+C on cells selected (the selection module puts them on
   * the clipboard) outlines them, as a spreadsheet does; a copy of text ends
   * the outline and a cut (what the clipboard holds is no longer those cells).
   * A menu's copy outlines its cells itself.
   */
  onCopy = () => {
    if (copyingFromMenu()) return;
    this.endCut();
    const active = this.host.doc.activeElement;
    const inField = (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== active.selectionEnd || !!active?.closest(".tp-menu");
    const selected = inField ? void 0 : this.selection();
    if (!selected || this.host.rearranged(selected.info)) return;
    const { rows, values } = this.valuesOf(selected.info, selected.cells);
    this.startCut(selected.info, rows, clipboardText(values), false);
  };
  startCut(info, cells, text, moves) {
    const table = this.host.tableOf(info);
    const held = cells.map((row) => row.map((ref) => table.rows[ref.row]?.cells[ref.column] ?? ""));
    this.cut = { moves, key: info.key, shape: this.shapeOf(table), cells, held, text: sameText(text) };
    this.markCut(info);
  }
  /** Cells cut to move, if they are this table's and still hold what they held (and the text pasted, given, is theirs) */
  cutFor(info, text) {
    const cut = this.clipFor(info, text);
    return cut?.moves ? cut : void 0;
  }
  /**
   * The cells copied or cut, if they are this table's and hold what they held
   * then (and, given the text pasted, that text is what was copied)
   */
  clipFor(info, text) {
    const cut = this.cut;
    if (!cut || cut.key !== info.key) return void 0;
    if (text !== void 0 && sameText(text) !== cut.text) return void 0;
    const table = this.host.tableOf(info);
    if (this.shapeOf(table) !== cut.shape) return void 0;
    const same = cut.cells.every((row, i) => row.every((ref, j) => (table.rows[ref.row]?.cells[ref.column] ?? "") === cut.held[i][j]));
    return same ? cut : void 0;
  }
  shapeOf(table) {
    return `${table.rows.length}\xD7${table.align.length}`;
  }
  /** The cells copied or cut outlined, dashed, as a spreadsheet marks them: a piece in each cell on the area's edge */
  markCut(info) {
    this.unmarkCut();
    const cut = this.cut;
    if (!cut) return;
    const last = cut.cells.length - 1;
    cut.cells.forEach(
      (row, i) => row.forEach((ref, j) => {
        const sides = [i === 0 && "top", i === last && "bottom", j === 0 && "left", j === row.length - 1 && "right"].filter(Boolean);
        const cell = sides.length ? this.host.cellAt(info, ref, true) : void 0;
        if (!cell) return;
        const edge = this.host.doc.createElement("span");
        edge.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-cut-edge ${sides.map((s) => `tp-cut-${s}`).join(" ")}`;
        cell.append(edge);
        this.edges.push(edge);
      })
    );
  }
  unmarkCut() {
    for (const edge of this.edges) edge.remove();
    this.edges = [];
  }
  endCut() {
    this.cut = void 0;
    this.unmarkCut();
  }
  /** The clipboard read (the browser may ask, or show its own Paste button), pasted from the cell; cells cut move there */
  /** The markdown rows `first`..`last` the cells cut are, when they are whole rows following each other; else nothing */
  cutRows(info, cut) {
    const rows = cut.cells.map((row) => row[0]?.row ?? 0);
    const whole = cut.cells.every((row) => row.length === info.columns && row.every((ref, j) => ref.column === j));
    const first = Math.min(...rows);
    const last = Math.max(...rows);
    return whole && rows.length > 0 && last - first + 1 === rows.length ? { first, last } : void 0;
  }
  /**
   * `fromHeader`: pasted from a column's menu, at its header: a column copied
   * with its header (what Copy column copies) goes there and names it; other
   * text (a spreadsheet's cells, cells cut) goes under it, the name kept
   */
  async pasteFromMenu(shownWidget, shownInfo, at, insert, fromHeader = false) {
    const clipboard = this.host.doc.defaultView.navigator.clipboard;
    const cutBefore = this.cutFor(shownInfo);
    let text;
    if (clipboard?.readText) {
      try {
        text = await clipboard.readText();
      } catch (e) {
        if (!cutBefore) {
          void this.host.bridge.flash(`Table Plus: could not read the clipboard (${String(e)})`, "error");
          return;
        }
      }
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    const cut = this.cutFor(info, text);
    const rows = cut && insert ? this.cutRows(info, cut) : void 0;
    if (rows) {
      const count = rows.last - rows.first + 1;
      const to = at.row > rows.last ? at.row - count : Math.max(1, at.row);
      this.endCut();
      if (to !== rows.first) await moveRowsTo(this.host, widget, info, rows.first, rows.last, to);
      return;
    }
    if (cut && !insert) {
      await this.paste(widget, info, fromHeader && at.row === 0 ? { ...at, row: 1 } : at, cut.held.map((row) => row.map(() => "")), false, false, cut);
      return;
    }
    if (!text) {
      if (text === "" && this.readable) this.clipboard = "empty";
      void this.host.bridge.flash("Table Plus: the clipboard holds no text to paste", "info");
      return;
    }
    const data = parseClipboardCells(text) ?? [[text.replace(/\r?\n$/, "")]];
    const named2 = this.cut?.cells[0]?.[0]?.row === 0 && sameText(text) === this.cut.text;
    await this.paste(widget, info, fromHeader && at.row === 0 && !named2 ? { ...at, row: 1 } : at, data, insert);
  }
  /**
   * Pastes the cells from a cell, as one edit: over the cells there (insert
   * false), or as new rows at the cell's row. Cells with formulas keep them.
   * Cells cut move instead: written as they are over what is there, emptied
   * where they were. From the cell editor, what it holds is saved in the same
   * edit. Not while the table is sorted or filtered: the rows shown are not
   * where the cells would go.
   */
  async paste(widget, info, at, data, insert, fromEditor = false, cut) {
    if (this.host.rearranged(info)) {
      void this.host.bridge.flash(`Table Plus: ${PASTE_BLOCKED.toLowerCase()}`, "info");
      return;
    }
    if (cut && at.row === 0) {
      void this.host.bridge.flash("Table Plus: cells cut move into the rows under the header: paste them on a cell there", "info");
      return;
    }
    const plan = planPaste(parseTable(info.source), info.pins, at, cut ? cut.held : data, insert);
    if ("error" in plan) {
      void this.host.bridge.flash(`Table Plus: cannot paste here: ${plan.error}`, "error");
      return;
    }
    const closed = fromEditor ? this.host.takeEditor() : void 0;
    let skipped = /* @__PURE__ */ new Map();
    const { newRows, newColumns } = plan;
    const result = await this.host.write(
      closed?.widget ?? widget,
      (t) => {
        const edited = closed ? closed.save(t) : t;
        if (!edited) return void 0;
        if (cut) return moveCells(edited, cut.cells, plan, cellMoveRules(this.host));
        const pasted = pasteCells(edited, plan, data, {
          keptBy: (cell) => this.host.cellKeptBy(cell),
          keepTags: (value, from) => this.host.keepTags(value, from),
          headerRenamed: (name, from) => this.host.headerRenamed(name, from)
        });
        skipped = pasted.skipped;
        return pasted.table;
      },
      {
        columnMap: newColumns.count ? (c) => c >= newColumns.at ? c + newColumns.count : c : void 0,
        pins: plan.pins,
        rowMap: newRows.count ? (r) => r >= newRows.at ? r + newRows.count : r : void 0
      }
    );
    if (result !== "written") {
      if (skipped.size) void this.host.bridge.flash(`Table Plus: nothing pasted: ${Array.from(skipped, ([what2, count]) => `kept ${plural3(count, what2)}`).join(", ")}`, "info");
      return;
    }
    const size = cut ? cut.held : data;
    const width = Math.max(...size.map((r) => r.length));
    this.endCut();
    const added = [
      ...newRows.count && !insert ? [`added ${plural3(newRows.count, "row")}`] : [],
      ...newColumns.count ? [`added ${plural3(newColumns.count, "column")}`] : [],
      ...Array.from(skipped, ([what2, count]) => `kept ${plural3(count, what2)}`)
    ];
    const what = cut ? `moved ${size.length} \xD7 ${width} cells` : insert ? `pasted ${plural3(data.length, "new row")}` : `pasted ${data.length} \xD7 ${width} cells`;
    void this.host.bridge.flash(`Table Plus: ${what}${added.length ? ` (${added.join(", ")})` : ""}`, "info");
    if (closed) this.host.focusEditor(closed.widget);
  }
};

// table-plus/src/features/selection.ts
var MOVE_KEYS2 = /* @__PURE__ */ new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
var EDIT_MODE_KEY = "tablePlus.editMode";
var AUTOSCROLL_EDGE2 = 40;
var AUTOSCROLL_STEP2 = 12;
function columnLetters2(column) {
  let letters = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  return letters;
}
var TAP_MS = 500;
var TAP_MOVE = 10;
function readEditMode() {
  try {
    return globalThis.localStorage?.getItem(EDIT_MODE_KEY) === "on";
  } catch {
    return false;
  }
}
function writeEditMode(on) {
  try {
    globalThis.localStorage?.setItem(EDIT_MODE_KEY, on ? "on" : "off");
  } catch {
  }
}
var STEPS = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1]
};
var Selection = class {
  constructor(host) {
    this.host = host;
    const handle = (corner) => {
      const element = host.doc.createElement("div");
      element.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-select-handle tp-select-${corner}`;
      element.addEventListener("pointerdown", (e) => this.dragHandle(e, corner));
      return element;
    };
    this.handles = [handle("start"), handle("end")];
    this.tip = host.floating("div", "tp-move-tip");
  }
  host;
  // The cells selected (rows of the markdown, header 0), in the table with this key
  selection;
  stopSelecting;
  // The selection when a press came: the press itself ends it first
  pressed;
  // A touch on cells selected, until it is a tap (their menu) or not
  stopTap;
  // The band on the selection's edge a mouse drags it by; the outline where it goes, and its address
  edges = [];
  targetEdges = [];
  tip;
  // Move to…: the table whose cells selected move to the cell pressed next
  moving;
  // Edit mode: a click edits a cell; off (select mode, the default) a click selects it. Kept in this browser.
  editMode = readEditMode();
  // The handles at the selection's first and last cell, shown by CSS after a touch (html[data-tp-pointer="touch"])
  handles;
  start() {
    this.showMode();
    this.host.doc.defaultView.addEventListener("copy", this.onCopy, true);
    this.host.doc.defaultView.addEventListener("pointerdown", this.onTouch, true);
  }
  stop() {
    this.host.doc.defaultView.removeEventListener("copy", this.onCopy, true);
    this.host.doc.defaultView.removeEventListener("pointerdown", this.onTouch, true);
    this.stopTap?.();
    this.stopSelecting?.();
    for (const handle of this.handles) handle.remove();
    this.tip.remove();
    this.endMoving();
    delete this.host.doc.documentElement.dataset.tpSelectMode;
  }
  clickSelects() {
    return !this.editMode;
  }
  /** Select mode on the page's root, for CSS: a click selects (the default pointer), on a cell selected alone it edits (the text cursor) */
  showMode() {
    const root = this.host.doc.documentElement;
    if (this.editMode) delete root.dataset.tpSelectMode;
    else root.dataset.tpSelectMode = "";
  }
  owns(node) {
    return this.handles.some((handle) => handle.contains(node)) || this.edges.some((edge) => edge.contains(node)) || this.tip.contains(node);
  }
  /**
   * A press on a handle is the handle's (a mouse's, after a touch has shown
   * them): not the cell's. On the selection's edge it drags the cells; while
   * Move to… waits, a press on a cell moves them there.
   */
  mouseDown(e) {
    if (this.moving) return this.movedBy(e);
    if (!(e.target instanceof Element) || !this.owns(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.button === 0 && e.target.closest(".tp-select-edge")) this.dragCells(e);
    return true;
  }
  // Any click ends a selection (one on Table Plus' own controls aside)
  beforeMouseDown(e) {
    const selection = this.selection;
    this.pressed = selection && { ...selection };
    if (selection && !(e.target instanceof Node && this.host.isFloating(e.target))) this.clear();
  }
  /**
   * Shift+click on a cell selects the cells from the selection's first cell,
   * else from the cell being edited (saved), else just this cell. In select
   * mode a click selects the cell (dragging on selects more); on the cell
   * selected alone, it edits it (so does a double click).
   */
  beforeCellPress(_widget, info, ref, e) {
    const pressed = this.pressed?.key === info.key ? this.pressed : void 0;
    this.pressed = void 0;
    const same = (a, b) => a.row === b.row && a.column === b.column;
    if (!e.shiftKey && (this.editMode || pressed && same(pressed.anchor, ref) && same(pressed.focus, ref))) return false;
    const editing = this.host.editing;
    const edited = editing && this.host.infoOf(editing.widget)?.key === info.key ? { row: editing.row, column: editing.column } : void 0;
    const anchor = !e.shiftKey ? ref : pressed?.anchor ?? edited ?? ref;
    void this.host.saveEditing();
    this.selectCells(info, anchor, ref);
    if (!e.shiftKey) this.afterCellPress(info, ref);
    return true;
  }
  /** Edit mode, a switch in the toolbar (left of its menu): a click edits a cell; off, a click selects it */
  toolbarButtons() {
    return [
      {
        label: "Edit mode",
        title: this.editMode ? "On: a click edits a cell. Click to select cells first, as in a spreadsheet" : "Off: a click selects a cell; a second click, a double click, Enter or typing edits it. Click to edit on the first click",
        icon: ICONS.editMode,
        place: "icon",
        pressed: this.editMode,
        run: () => {
          this.editMode = !this.editMode;
          writeEditMode(this.editMode);
          this.showMode();
          this.host.toolbarChanged();
        }
      }
    ];
  }
  /**
   * After a press on a cell: dragging on to another cell of the table, with
   * the button held, selects the cells between the two as shown (sorting and
   * filters included), and closes the cell editor the press opened, unchanged
   */
  afterCellPress(info, anchor) {
    this.stopSelecting?.();
    const { key: key2 } = info;
    const win = this.host.doc.defaultView;
    const move = (ev) => {
      if (ev.buttons === 0) {
        end();
        return;
      }
      const hit = this.host.enhancedWidgetOf(ev.target);
      const cell = hit && hit[1].key === key2 ? this.host.tableCellOf(hit[1], ev.target) : void 0;
      const ref = hit && cell ? this.host.cellRef(hit[1], cell) : void 0;
      if (!ref) return;
      const current = this.selection;
      if (!current) {
        if (ref.row === anchor.row && ref.column === anchor.column) return;
        this.host.cancelEditing();
        this.selection = { key: key2, anchor, focus: ref };
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
    if (e.key === "Escape" && this.moving) {
      e.preventDefault();
      this.endMoving();
      return true;
    }
    if (!this.selection) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      this.clear();
      return true;
    }
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (!inField && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "v") {
      const widget = this.host.widgetForKey(this.selection.key);
      const info = widget && this.host.infoOf(widget);
      const at = (info && this.refs(info)[0]) ?? this.selection.anchor;
      this.clear();
      if (info) this.host.editCell(info, at, "select");
      return false;
    }
    if (!inField && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && MOVE_KEYS2.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      void this.moveLines(e.key);
      return true;
    }
    if (!inField && this.editFromKey(e)) return true;
    const target = !inField && !e.altKey && !e.metaKey ? this.keyTarget(e) : void 0;
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      this.moveTo(target, e.shiftKey);
      return true;
    }
    if (e.key === "Delete" && !inField && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      void this.emptyCells();
      return true;
    }
    return false;
  }
  /**
   * The cells the cell menu is for: the selection when it holds `at`; else
   * `at` is selected (marked, not edited), as a right click selects in a
   * spreadsheet, and stays so for Ctrl+C and Delete
   */
  selectedCells(info, at) {
    const refs = this.selection?.key === info.key ? this.refs(info) : [];
    if (refs.some((ref) => ref.row === at.row && ref.column === at.column)) return refs;
    this.selection = { key: info.key, anchor: at, focus: at };
    this.show();
    return [at];
  }
  selectCells(info, anchor, focus) {
    this.selection = { key: info.key, anchor, focus };
    this.show();
  }
  /**
   * Typing on the cells selected edits the first of them, its text replaced
   * (the key goes on into the editor, so accents typed with dead keys work);
   * Backspace empties it so; Enter and F2 edit it as it is
   */
  editFromKey(e) {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!selection || !info || e.metaKey || e.isComposing) return false;
    const typing = (e.key.length === 1 || e.key === "Dead") && e.ctrlKey === e.altKey;
    const plain2 = !e.ctrlKey && !e.altKey && !e.shiftKey;
    const asIs = plain2 && (e.key === "Enter" || e.key === "F2");
    const emptied = plain2 && e.key === "Backspace";
    if (!typing && !asIs && !emptied) return false;
    if (!typing) e.preventDefault();
    e.stopPropagation();
    const at = selection.anchor;
    this.clear();
    this.host.editCell(info, at, asIs ? void 0 : "replace");
    return true;
  }
  /**
   * Where a key takes the selection's last cell (rows as shown): arrows (with
   * Ctrl too) a cell, Home / End the row's first / last cell, Ctrl+Home
   * / End the table's first / last cell, PageUp / PageDown 10 rows (PageUp
   * stops at the first body row, as in the cell editor); undefined: not such a key
   */
  keyTarget(e) {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!selection || !info) return void 0;
    const shown = this.host.shownRows(info);
    const rowOf = (tr2) => tr2 === info.table.rows[0] ? 0 : Number(tr2.dataset.tpRow);
    const at = shown.findIndex((tr2) => rowOf(tr2) === selection.focus.row);
    if (at < 0) return void 0;
    const ctrl = e.ctrlKey;
    let r = at;
    let column = selection.focus.column;
    const step = STEPS[e.key];
    if (step) {
      r += step[0];
      column += step[1];
    } else if (e.key === "Home") {
      column = 0;
      if (ctrl) r = 0;
    } else if (e.key === "End") {
      column = info.columns - 1;
      if (ctrl) r = shown.length - 1;
    } else if (e.key === "PageUp" && !ctrl) r = r === 0 ? 0 : Math.max(1, r - PAGE_ROWS);
    else if (e.key === "PageDown" && !ctrl) r = r + PAGE_ROWS;
    else return void 0;
    const tr = shown[Math.max(0, Math.min(shown.length - 1, r))];
    return { row: rowOf(tr), column: Math.max(0, Math.min(info.columns - 1, column)) };
  }
  /** The selection's last cell to `to`; without `extend` the selection is just that cell */
  moveTo(to, extend) {
    const selection = this.selection;
    if (!selection) return;
    this.selection = { key: selection.key, anchor: extend ? selection.anchor : to, focus: to };
    this.show();
    const widget = this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    const cell = info && this.host.cellAt(info, to);
    if (cell && info && to.row > 0) this.host.rowNeeded(info, cell.parentElement);
    cell?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }
  /**
   * Ctrl+Alt+arrows: the rows of the selection move up or down (not while
   * sorted or filtered, nor with the header), its columns left or right, as
   * one edit; the selection goes with them
   */
  async moveLines(key2) {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!selection || !widget || !info) return;
    const vertical = key2 === "ArrowUp" || key2 === "ArrowDown" || key2 === "PageUp" || key2 === "PageDown";
    const lines = vertical ? [selection.anchor.row, selection.focus.row] : [selection.anchor.column, selection.focus.column];
    const first = Math.min(...lines);
    const last = Math.max(...lines);
    if (vertical) {
      if (first === 0) return;
      if (this.host.rearranged(info)) {
        void this.host.bridge.flash(`Table Plus: ${MOVE_BLOCKED.toLowerCase()}`, "info");
        return;
      }
    }
    const asked = key2 === "Home" ? 0 : key2 === "End" ? info.columns - (last - first + 1) : key2 === "PageUp" ? first - PAGE_ROWS : key2 === "PageDown" ? first + PAGE_ROWS : key2 === "ArrowUp" || key2 === "ArrowLeft" ? first - 1 : first + 1;
    const to = vertical ? rowBlockTo(info, first, last, asked) : columnBlockTo(info, first, last, asked);
    if (to === first) return;
    const follow = (ref) => vertical ? { ...ref, row: lineAfterBlockMove(ref.row, first, last, to) } : { ...ref, column: lineAfterBlockMove(ref.column, first, last, to) };
    this.selection = { key: selection.key, anchor: follow(selection.anchor), focus: follow(selection.focus) };
    const result = await (vertical ? moveRowsTo(this.host, widget, info, first, last, to) : moveColumnsTo(this.host, widget, info, first, last, to));
    if (result === "failed" && this.selection?.key === selection.key) {
      this.selection = selection;
      this.show();
      return;
    }
    const now2 = this.host.widgetForKey(selection.key);
    const nowInfo = now2 && this.host.infoOf(now2);
    const focus = this.selection?.focus;
    if (nowInfo && focus) this.host.cellAt(nowInfo, focus)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }
  selected(info) {
    return this.selection?.key === info.key ? this.refs(info) : void 0;
  }
  /** Clear in the menu of rows (columns): their cells (a column's header keeps its name), after the clipboard's entries */
  lineMenuEntries(widget, info, axis, lines) {
    const rows = axis === "row" ? lines : this.host.bodyRows(info).map((tr) => Number(tr.dataset.tpRow));
    const columns = axis === "row" ? Array.from({ length: info.columns }, (_, c) => c) : lines;
    const cells = rows.flatMap((row) => columns.map((column) => ({ row, column })));
    const name = `${lines.length > 1 ? `${lines.length} ` : ""}${axis}${lines.length > 1 ? "s" : ""}`;
    return [
      {
        kind: "item",
        label: `Clear ${name}`,
        icon: ICONS.clear,
        hint: axis === "row" ? "Empty the cells, formulas included, as Delete does" : "Empty the cells under the header (it keeps its name), as Delete does",
        run: () => void this.empty(widget, info, cells)
      }
    ];
  }
  /** Clear in the menu of a cell or of the cells selected (Copy, Cut and Paste are the paste module's; Copy here when it is off) */
  cellMenuEntries(widget, info, cells) {
    const body = cells.filter((ref) => ref.row > 0).length;
    const entries = [];
    if (!this.host.moduleOn("paste")) {
      entries.push({
        kind: "item",
        label: cells.length > 1 ? `Copy ${cells.length} cells` : "Copy",
        icon: ICONS.copy,
        hint: "Copy as Ctrl+C does: a spreadsheet pastes it into cells",
        run: () => void this.copy(info, cells)
      });
    }
    if (body > 0) {
      entries.push({
        kind: "item",
        label: body > 1 ? `Clear ${body} cells` : "Clear",
        icon: ICONS.clear,
        hint: "Empty the cells, formulas included, as Delete does",
        run: () => void this.empty(widget, info, cells)
      });
    }
    const deleting = [];
    if (cells.length > 1) {
      const rows = [...new Set(cells.map((ref) => ref.row).filter((row) => row > 0))];
      const columns = [...new Set(cells.map((ref) => ref.column))];
      if (rows.length) {
        deleting.push({
          kind: "item",
          label: rows.length > 1 ? `Delete ${rows.length} rows` : "Delete row",
          icon: ICONS.trash,
          danger: true,
          hint: "Delete the rows these cells are in",
          run: () => void this.deleteRows(widget, info, rows)
        });
      }
      deleting.push({
        kind: "item",
        label: columns.length > 1 ? `Delete ${columns.length} columns` : "Delete column",
        icon: ICONS.trash,
        danger: true,
        hint: "Delete the columns these cells are in",
        run: () => void this.deleteColumns(widget, info, columns),
        ...columns.length >= info.columns ? { disabled: "A table needs at least one column" } : {}
      });
    }
    const block = this.block();
    if (block && block.info.key === info.key && cells.length > 0) {
      entries.push({
        kind: "item",
        label: cells.length > 1 ? `Move ${cells.length} cells to\u2026` : "Move to\u2026",
        icon: ICONS.moveCells,
        hint: "Then click (tap) the cell where the first one goes: they move there, as dragging their edge moves them",
        run: () => this.startMoving(info)
      });
    }
    return [
      { order: 1, entries },
      { order: 9, entries: deleting }
    ];
  }
  /** The cells, as values in rows as shown, onto the clipboard as Ctrl+C puts them */
  async copy(info, cells) {
    const rows = /* @__PURE__ */ new Map();
    for (const ref of cells) {
      const cell = this.host.cellAt(info, ref, true);
      rows.set(ref.row, [...rows.get(ref.row) ?? [], cell ? cellValue2(cell) : ""]);
    }
    const values = Array.from(rows.values());
    try {
      await writeClipboard(this.host.doc, clipboardText(values), clipboardHtml(values));
      void this.host.bridge.flash(`Table Plus: copied ${values.length} \xD7 ${values[0]?.length ?? 0} cells`, "info");
    } catch (e) {
      void this.host.bridge.flash(`Table Plus: could not copy (${String(e)})`, "error");
    }
  }
  // A cell's editor opened (also from a + or a menu, which leave the selection): the selection ends
  editorOpened() {
    if (this.selection) this.clear();
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
    const cells = this.cells() ?? [];
    for (const row of cells) for (const cell of row) cell.classList.add("tp-selected");
    if (cells.length === 1 && cells[0].length === 1) cells[0][0].classList.add("tp-selected-alone");
    this.placeHandles(cells);
    this.placeEdges(cells);
    this.host.selectionChanged();
  }
  /**
   * The handles in the selection's first and last cell, on their corners;
   * inside them on the table's edges, where its box would cut what is past
   * them and leave them half to grab
   */
  placeHandles(cells) {
    const first = cells[0]?.[0];
    const lastRow = cells[cells.length - 1];
    const last = lastRow?.[lastRow.length - 1];
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!first || !last || !widget || !info) return;
    const shown = this.host.shownRows(info);
    const [start, end] = this.handles;
    for (const handle of this.handles) {
      handle.classList.remove("tp-select-mid");
      handle.style.left = handle.style.top = handle.style.right = handle.style.bottom = "";
    }
    const wholeRows = cells[0].length === info.columns && first.parentElement !== shown[0];
    const wholeColumns = first.parentElement === shown[0] && cells.length === shown.length;
    if (this.host.pressedWith === "touch" && (wholeRows || wholeColumns) && this.placeMidHandles(widget, info, cells, wholeRows ? "row" : "column")) return;
    start.classList.toggle("tp-select-edge-row", first.parentElement === shown[0]);
    start.classList.toggle("tp-select-edge-column", first.cellIndex === 0);
    end.classList.toggle("tp-select-edge-row", last.parentElement === shown[shown.length - 1]);
    end.classList.toggle("tp-select-edge-column", last.cellIndex === info.columns - 1);
    first.append(start);
    last.append(end);
  }
  /**
   * The handles of whole rows (columns) in the middle of what is in view, on
   * the first row's top and the last row's bottom (the first column's left,
   * the last column's right), as a spreadsheet's app puts them: in reach
   * however far the page or the table scrolled (placed again as it scrolls).
   * False when no cell of the lines is in view there.
   */
  placeMidHandles(widget, info, cells, axis) {
    const box = this.host.shownRect(widget, info);
    const view = this.host.viewBounds(widget);
    const left = Math.max(box.left, view.left);
    const right = Math.min(box.right, view.right);
    const top = Math.max(box.top, view.top);
    const bottom = Math.min(box.bottom, view.bottom);
    if (left >= right || top >= bottom) return false;
    const middle = axis === "row" ? (left + right) / 2 : (top + bottom) / 2;
    const at = (line) => {
      for (const cell of line) {
        if (!cell.isConnected) continue;
        const r = cell.getBoundingClientRect();
        const [from, to] = axis === "row" ? [r.left, r.right] : [r.top, r.bottom];
        if (middle >= from && middle < to) return { cell, offset: middle - from };
      }
      return void 0;
    };
    const firstLine = axis === "row" ? cells[0] : cells.map((row) => row[0]);
    const lastLine = axis === "row" ? cells[cells.length - 1] : cells.map((row) => row[row.length - 1]);
    const a = at(firstLine);
    const b = at(lastLine);
    if (!a || !b) return false;
    const [start, end] = this.handles;
    const half = start.offsetWidth / 2 || 14;
    for (const [handle, place] of [[start, a], [end, b]]) {
      handle.classList.remove("tp-select-edge-row", "tp-select-edge-column");
      handle.classList.add("tp-select-mid");
      if (axis === "row") {
        handle.style.left = `${place.offset - half}px`;
        handle.style.right = "auto";
      } else {
        handle.style.top = `${place.offset - half}px`;
        handle.style.bottom = "auto";
      }
      place.cell.append(handle);
    }
    return true;
  }
  // The page or a table scrolled: the handles of whole rows (columns) go on in the middle of what is in view
  layoutChanged() {
    if (!this.selection || this.host.pressedWith !== "touch") return;
    const cells = this.cells();
    if (cells?.length) this.placeHandles(cells);
  }
  /**
   * A handle dragged (a touch): the selection goes from its other corner to
   * the cell under the finger; whole rows (columns) stay whole, so more of
   * them are selected. Near the view's edge the page scrolls, near the edge
   * of a table's box that scrolls sideways the table does.
   */
  dragHandle(e, corner) {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    const cells = this.cells();
    if (e.button !== 0 || !selection || !widget || !info || !cells?.length) return;
    e.preventDefault();
    e.stopPropagation();
    const lastRow = cells[cells.length - 1];
    const startRef = this.host.cellRef(info, cells[0][0]);
    const endRef = this.host.cellRef(info, lastRow[lastRow.length - 1]);
    if (!startRef || !endRef) return;
    const [anchor, dragged] = corner === "start" ? [endRef, startRef] : [startRef, endRef];
    const wholeRows = cells[0].length === info.columns;
    const wholeColumns = startRef.row === 0 && cells.length === this.host.shownRows(info).length;
    const { key: key2 } = selection;
    const doc = this.host.doc;
    const win = doc.defaultView;
    doc.body.classList.add("tp-select-dragging");
    let last;
    const timer = win.setInterval(() => last && move(last), 50);
    const move = (ev) => {
      last = ev;
      this.autoscroll(widget, ev);
      const under = doc.elementFromPoint?.(ev.clientX, ev.clientY) ?? null;
      const hit = this.host.enhancedWidgetOf(under);
      const cell = hit && hit[1].key === key2 ? this.host.tableCellOf(hit[1], under) : void 0;
      const ref = hit && cell ? this.host.cellRef(hit[1], cell) : void 0;
      if (!hit || !ref) return;
      const focus = { row: wholeColumns ? dragged.row : ref.row, column: wholeRows ? dragged.column : ref.column };
      const now2 = this.selection;
      if (now2?.key === key2 && now2.anchor === anchor && now2.focus.row === focus.row && now2.focus.column === focus.column) return;
      this.selectCells(hit[1], anchor, focus);
    };
    const end = () => {
      win.clearInterval(timer);
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", end, true);
      win.removeEventListener("pointercancel", end, true);
      doc.body.classList.remove("tp-select-dragging");
      this.stopSelecting = void 0;
    };
    this.stopSelecting?.();
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", end, true);
    win.addEventListener("pointercancel", end, true);
    this.stopSelecting = end;
  }
  /**
   * A tap on a cell of a selection of several opens their menu, as in a
   * spreadsheet's app. Told by the touch's pointer events, which always come
   * (the mouse events a browser fires after a tap may not); the core then
   * swallows those, as after a long press.
   */
  onTouch = (e) => {
    this.stopTap?.();
    if (this.moving) {
      this.touchMove(e);
      return;
    }
    const selection = this.selection;
    if (e.pointerType !== "touch" || e.button !== 0 || !selection || e.target instanceof Node && this.owns(e.target)) return;
    const hit = this.host.enhancedWidgetOf(e.target);
    if (!hit || hit[1].key !== selection.key) return;
    const [widget, info] = hit;
    const cell = this.host.tableCellOf(info, e.target);
    const ref = cell && this.host.cellRef(info, cell);
    const refs = this.refs(info);
    if (!ref || refs.length < 2 || !refs.some((r) => r.row === ref.row && r.column === ref.column)) return;
    const { clientX: x, clientY: y } = e;
    const at = Date.now();
    const win = this.host.doc.defaultView;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > TAP_MOVE) stop();
    };
    const up = () => {
      stop();
      if (Date.now() - at < TAP_MS && !this.host.pressTaken()) this.host.openCellMenu(widget, info, ref, { x, y });
    };
    const stop = () => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", stop, true);
      this.stopTap = void 0;
    };
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
    win.addEventListener("pointercancel", stop, true);
    this.stopTap = stop;
  };
  /** Near an edge the box scrolls: the table's own (Maximum table height, full screen) up and down, else the page's; the table's sideways */
  autoscroll(widget, ev) {
    const scroller = widget.scrollHeight > widget.clientHeight ? widget : this.host.scrollParentOf(widget);
    if (scroller) {
      const view = scroller.getBoundingClientRect();
      if (ev.clientY < view.top + AUTOSCROLL_EDGE2) scroller.scrollTop -= AUTOSCROLL_STEP2;
      else if (ev.clientY > view.bottom - AUTOSCROLL_EDGE2) scroller.scrollTop += AUTOSCROLL_STEP2;
    }
    if (widget.scrollWidth > widget.clientWidth) {
      const box = widget.getBoundingClientRect();
      if (ev.clientX < box.left + AUTOSCROLL_EDGE2) widget.scrollLeft -= AUTOSCROLL_STEP2;
      else if (ev.clientX > box.right - AUTOSCROLL_EDGE2) widget.scrollLeft += AUTOSCROLL_STEP2;
    }
  }
  clear() {
    this.selection = void 0;
    this.unmark();
    this.host.selectionChanged();
  }
  unmark() {
    for (const cell of Array.from(this.host.doc.querySelectorAll(".tp-selected"))) cell.classList.remove("tp-selected", "tp-selected-alone");
    for (const handle of this.handles) handle.remove();
    for (const edge of this.edges) edge.remove();
    this.edges = [];
  }
  // ---- moving the cells selected ---------------------------------------------
  /** The cells selected as a block that can move: body cells of a table shown as written */
  block() {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    const rows = this.cells();
    if (!widget || !info || !rows?.length || this.host.rearranged(info)) return void 0;
    const shown = this.host.shownRows(info);
    const top = shown.indexOf(rows[0][0].parentElement);
    if (top < 1) return void 0;
    const cells = rows.map((row) => row.map((cell) => this.host.cellRef(info, cell)));
    return { widget, info, shown, top, left: rows[0][0].cellIndex, height: rows.length, width: rows[0].length, cells };
  }
  /**
   * The band a mouse drags the cells by: a piece on the outer side of each
   * cell on the selection's edge (CSS shows it for a mouse only, with the move
   * pointer); none where the cells cannot move
   */
  placeEdges(rows) {
    for (const edge of this.edges) edge.remove();
    this.edges = [];
    if (!this.block()) return;
    const last = rows.length - 1;
    rows.forEach(
      (row, i) => row.forEach((cell, j) => {
        const sides = [i === 0 && "top", i === last && "bottom", j === 0 && "left", j === row.length - 1 && "right"].filter(Boolean);
        for (const side of sides) {
          const edge = this.host.doc.createElement("span");
          edge.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-select-edge tp-select-edge-${side}`;
          cell.append(edge);
          this.edges.push(edge);
        }
      })
    );
  }
  /** Where the block goes with its first cell at the row (as shown) and column given, kept within the table's body */
  placeOf(block, row, column) {
    return {
      row: Math.max(1, Math.min(block.shown.length - block.height, row)),
      column: Math.max(0, Math.min(block.info.columns - block.width, column))
    };
  }
  /** The cells where the block would go outlined, dashed, and its address (A1 as formulas count rows) by the pointer */
  showTarget(block, at, copy, x, y) {
    for (const edge of this.targetEdges) edge.remove();
    this.targetEdges = [];
    if (!at || at.row === block.top && at.column === block.left) {
      this.tip.classList.remove("tp-visible");
      return;
    }
    for (let i = 0; i < block.height; i++) {
      const tr = block.shown[at.row + i];
      for (let j = 0; j < block.width; j++) {
        const sides = [i === 0 && "top", i === block.height - 1 && "bottom", j === 0 && "left", j === block.width - 1 && "right"].filter(Boolean);
        const cell = sides.length ? tr?.cells[at.column + j] : void 0;
        if (!cell) continue;
        const edge = this.host.doc.createElement("span");
        edge.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-move-edge ${sides.map((s) => `tp-move-${s}`).join(" ")}`;
        cell.append(edge);
        this.targetEdges.push(edge);
      }
    }
    const name = (row, column) => `${columnLetters2(column)}${row}`;
    const range = block.height * block.width > 1 ? `${name(at.row, at.column)}:${name(at.row + block.height - 1, at.column + block.width - 1)}` : name(at.row, at.column);
    this.tip.textContent = copy ? `+ ${range}` : range;
    this.host.place(this.tip, x + 14, y + 14);
  }
  /**
   * The cells dragged by their edge: the cell under the pointer takes the
   * place of the one pressed, the cells where they go outlined; let go, they
   * move there (with Ctrl, as in a spreadsheet: copied), as one edit. Esc
   * cancels. Within the table's body: no rows or columns added.
   */
  dragCells(e) {
    const block = this.block();
    const pressed = e.target instanceof Element ? e.target.closest("td") : null;
    if (!block || !pressed) return;
    const pressedRow = block.shown.indexOf(pressed.parentElement) - block.top;
    const pressedColumn = pressed.cellIndex - block.left;
    const doc = this.host.doc;
    const win = doc.defaultView;
    let at;
    let copy = false;
    doc.body.classList.add("tp-moving-cells");
    const move = (ev) => {
      copy = ev.ctrlKey || ev.metaKey;
      const under = doc.elementFromPoint?.(ev.clientX, ev.clientY) ?? null;
      const hit = this.host.enhancedWidgetOf(under);
      const cell = hit && hit[1].key === block.info.key ? this.host.tableCellOf(hit[1], under) : void 0;
      if (cell) {
        const row = block.shown.indexOf(cell.parentElement);
        if (row >= 0) at = this.placeOf(block, row - pressedRow, cell.cellIndex - pressedColumn);
      }
      this.showTarget(block, at, copy, ev.clientX, ev.clientY);
    };
    const finish = (apply) => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      win.removeEventListener("keydown", key2, true);
      win.removeEventListener("keyup", key2, true);
      doc.body.classList.remove("tp-moving-cells");
      this.showTarget(block, void 0, false, 0, 0);
      if (apply && at && (at.row !== block.top || at.column !== block.left)) void this.moveBlock(block, at, copy);
    };
    const up = (ev) => {
      copy = ev.ctrlKey || ev.metaKey;
      finish(true);
    };
    const key2 = (ev) => {
      if (ev.key === "Escape" && ev.type === "keydown") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      } else if (ev.key === "Control" || ev.key === "Meta") {
        copy = ev.type === "keydown";
        this.tip.textContent = copy ? `+ ${this.tip.textContent.replace(/^\+ /, "")}` : this.tip.textContent.replace(/^\+ /, "");
      }
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", up, true);
    win.addEventListener("keydown", key2, true);
    win.addEventListener("keyup", key2, true);
  }
  /** The block moved (copied) to start at a row as shown and a column; selected there, before the write (shown again once rendered) */
  async moveBlock(block, at, copy) {
    const rowOf = (shown) => Number(block.shown[shown].dataset.tpRow);
    const to = { row: rowOf(at.row), column: at.column };
    this.selectCells(block.info, to, { row: rowOf(at.row + block.height - 1), column: at.column + block.width - 1 });
    const result = await moveCellsTo(this.host, block.widget, block.info, block.cells, to, copy);
    if (result !== "written") this.selectCells(block.info, block.cells[0][0], block.cells[block.cells.length - 1][block.width - 1]);
  }
  /** Move to…: the next press on a cell of the table (a click, a tap) moves the cells there */
  startMoving(info) {
    this.moving = info.key;
    this.host.doc.body.classList.add("tp-move-picking");
    this.host.doc.defaultView.addEventListener("mousemove", this.showMoveTarget, true);
    const press = this.host.pressedWith === "touch" ? "tap the cell where the first one goes (a tap outside the table cancels)" : "click the cell where the first one goes; Esc cancels";
    void this.host.bridge.flash(`Table Plus: ${press}`, "info");
  }
  endMoving() {
    this.moving = void 0;
    this.host.doc.body.classList.remove("tp-move-picking");
    this.host.doc.defaultView.removeEventListener("mousemove", this.showMoveTarget, true);
    for (const edge of this.targetEdges) edge.remove();
    this.targetEdges = [];
    this.tip.classList.remove("tp-visible");
  }
  /** While Move to… waits: the cells where the block would go with its first cell under the pointer, outlined */
  showMoveTarget = (e) => {
    const block = this.block();
    if (!block || block.info.key !== this.moving) return;
    const hit = this.host.enhancedWidgetOf(e.target);
    const cell = hit && hit[1].key === block.info.key ? this.host.tableCellOf(hit[1], e.target) : void 0;
    const row = cell ? block.shown.indexOf(cell.parentElement) : -1;
    this.showTarget(block, cell && row >= 1 ? this.placeOf(block, row, cell.cellIndex) : void 0, false, e.clientX, e.clientY);
  };
  /** A press while Move to… waits: on a body cell of the table the cells move there (the press taken); elsewhere it ends and goes on */
  movedBy(e) {
    if (e.button !== 0) {
      this.endMoving();
      return false;
    }
    const taken = this.moveCellsAt(e.target);
    if (taken) {
      e.preventDefault();
      e.stopPropagation();
    }
    return taken;
  }
  /**
   * A touch while Move to… waits: a tap is a press (told by its pointer
   * events: a browser may fire no mouse events for a tap after scrolling); a
   * touch that moves scrolls the page, Move to… goes on
   */
  touchMove(e) {
    if (e.pointerType !== "touch" || e.button !== 0 || !e.isPrimary) return;
    const { clientX: x, clientY: y, target } = e;
    const at = Date.now();
    const win = this.host.doc.defaultView;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > TAP_MOVE) stop();
    };
    const up = () => {
      stop();
      if (Date.now() - at < TAP_MS && this.moving) this.moveCellsAt(target);
    };
    const stop = () => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", stop, true);
      this.stopTap = void 0;
    };
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
    win.addEventListener("pointercancel", stop, true);
    this.stopTap = stop;
  }
  /** Move to… ends; on a body cell of the table, the cells move there (true: the press is taken, its mouse events with it) */
  moveCellsAt(target) {
    const key2 = this.moving;
    this.endMoving();
    const block = this.block();
    const hit = this.host.enhancedWidgetOf(target);
    const cell = hit && hit[1].key === key2 ? this.host.tableCellOf(hit[1], target) : void 0;
    const row = cell && block ? block.shown.indexOf(cell.parentElement) : -1;
    if (!block || block.info.key !== key2 || !cell || row < 1) return false;
    this.host.takePress();
    const at = this.placeOf(block, row, cell.cellIndex);
    if (at.row !== block.top || at.column !== block.left) void this.moveBlock(block, at, false);
    return true;
  }
  /** The selected cells as references, rows as shown (the header first), columns left to right */
  refs(info) {
    return (this.cells() ?? []).flat().flatMap((cell) => this.host.cellRef(info, cell) ?? []);
  }
  /**
   * Delete: empties the selected cells (the selection stays). Whole rows (all
   * columns) or whole columns (the header and every row shown) whose cells are
   * empty already are deleted: a first Delete empties them, a second deletes them.
   */
  async emptyCells() {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!widget || !info) return;
    const refs = this.refs(info);
    const table = parseTable(info.source);
    const empty = (row, column) => withoutTags(table.rows[row]?.cells[column] ?? "") === "";
    const rows = [...new Set(refs.map((ref) => ref.row))];
    const columns = [...new Set(refs.map((ref) => ref.column))];
    const body = rows.filter((row) => row > 0);
    const wholeRows = columns.length === info.columns && body.length > 0;
    const shown = this.host.shownRows(info).length;
    const wholeColumns = rows.includes(0) && rows.length === shown;
    if (wholeRows && body.every((row) => columns.every((column) => empty(row, column)))) {
      this.clear();
      await deleteRowsAt(this.host, widget, info, body);
      return;
    }
    if (wholeColumns && !wholeRows && columns.every((column) => table.rows.every((_, row) => row === 0 || empty(row, column)))) {
      this.clear();
      await deleteColumnsAt(this.host, widget, info, columns);
      return;
    }
    await this.empty(widget, info, refs);
  }
  async deleteRows(shownWidget, info, rows) {
    this.clear();
    const widget = this.host.widgetForKey(info.key) ?? shownWidget;
    await deleteRowsAt(this.host, widget, this.host.infoOf(widget) ?? info, rows);
  }
  async deleteColumns(shownWidget, info, columns) {
    this.clear();
    const widget = this.host.widgetForKey(info.key) ?? shownWidget;
    await deleteColumnsAt(this.host, widget, this.host.infoOf(widget) ?? info, columns);
  }
  /**
   * Empties cells, formulas included, as one edit; header cells keep their
   * names (a column needs one), cells their hidden tags (names)
   */
  async empty(shownWidget, info, cells) {
    const widget = this.host.widgetForKey(info.key) ?? shownWidget;
    const refs = cells.filter((ref) => ref.row > 0);
    const emptied = (table, ref) => setCell(table, ref.row, ref.column, this.host.keepTags("", table.rows[ref.row]?.cells[ref.column] ?? ""));
    await this.host.write(widget, (t) => refs.reduce(emptied, t));
  }
  /**
   * Ctrl+C with cells selected copies them as a spreadsheet does: as text with
   * a tab between cells and a line break between rows, and as an HTML table,
   * so Excel and Google Sheets paste them into cells. Cells copy what they
   * show (a formula's result, a link's text), a typed cell its value.
   */
  onCopy = (e) => {
    if (copyingFromMenu()) return;
    const cells = this.selection && this.cells();
    const active = this.host.doc.activeElement;
    if (!cells || !e.clipboardData || (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== active.selectionEnd) return;
    if (active?.closest(".tp-menu")) return;
    const values = cells.map((row) => row.map(cellValue2));
    e.clipboardData.setData("text/plain", clipboardText(values));
    e.clipboardData.setData("text/html", clipboardHtml(values));
    e.preventDefault();
    e.stopImmediatePropagation();
    void this.host.bridge.flash(`Table Plus: copied ${values.length} \xD7 ${values[0]?.length ?? 0} cells`, "info");
  };
};

// table-plus/src/features/autofill.ts
var TAP_MS2 = 500;
var TAP_MOVE2 = 10;
var AutoFill = class {
  constructor(host) {
    this.host = host;
    this.handle = host.doc.createElement("div");
    this.handle.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-fill-handle`;
    this.handle.title = "Drag to fill the cells after these (1, 2 \u2192 3, 4; Mon \u2192 Tue), double-click to fill down";
    this.tip = host.floating("div", "tp-fill-tip");
    this.handle.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.drag();
    });
  }
  host;
  handle;
  tip;
  // The outline of what a drag fills: a piece in each cell on its edge
  edges = [];
  outlined = "";
  // The extent the tip's value is for, in the drag going on
  tipFor = "";
  // Ends the drag (Esc: without filling)
  endDrag;
  // AutoFill to…: the table whose cells selected fill to the cell clicked next, and those cells (as the markdown has them)
  picking;
  pickingFrom = "";
  // A touch while picking, until it is a tap or not
  stopTap;
  start() {
    this.host.doc.defaultView.addEventListener("pointerdown", this.onTouch, true);
  }
  stop() {
    this.host.doc.defaultView.removeEventListener("pointerdown", this.onTouch, true);
    this.stopTap?.();
    this.endDrag?.(false);
    this.endPicking();
    this.handle.remove();
    this.tip.remove();
  }
  owns(node) {
    return this.handle.contains(node) || this.tip.contains(node);
  }
  /**
   * A press on the handle is the handle's, not its cell's: a drag, or with a
   * double click a fill down. While picking where to fill to, a press on a
   * cell of the table fills to it (before the selection ends: the press is
   * taken), a press elsewhere ends picking.
   */
  mouseDown(e) {
    if (this.picking) return this.picked(e);
    if (!(e.target instanceof Node) || !this.handle.contains(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return true;
    if (e.detail === 2) this.fillDown();
    else if (e.detail < 2) this.drag();
    return true;
  }
  // Esc while dragging or picking cancels the fill (before the selection module takes Esc: the cells stay selected)
  keyDown(e) {
    if (e.key !== "Escape" || !this.endDrag && !this.picking) return false;
    e.preventDefault();
    e.stopPropagation();
    this.endDrag?.(false);
    this.endPicking();
    return true;
  }
  // Other cells selected: what was picking for them is over (the same shown again, the table rendered anew, goes on)
  selectionChanged() {
    if (this.picking && this.selectedNow() !== this.pickingFrom) this.endPicking();
    this.placeHandle();
  }
  // The cell menu opened (a long press): picking ends, the menu is for the cells
  cellMenuOpened() {
    this.endPicking();
  }
  /** The cells selected, as the markdown has them, with their table ("": none to fill from) */
  selectedNow() {
    const selected = this.selection();
    if (!selected) return "";
    return `${selected.info.key} ${this.rowOf(selected, selected.top)}-${this.rowOf(selected, selected.bottom)} ${selected.left}-${selected.right}`;
  }
  /** AutoFill to… in the menu of the cells selected (body cells: a header is no value to go on from) */
  cellMenuEntries(widget, info, cells) {
    if (cells.some((ref) => ref.row === 0)) return void 0;
    const label = "AutoFill to\u2026";
    if (this.host.rearranged(info)) {
      const disabled = "Not while the table is sorted or filtered: the rows shown are not where the cells would go";
      return { order: 1.5, entries: [{ kind: "item", label, icon: ICONS.autofill, disabled, run: () => {
      } }] };
    }
    const selected = this.selection();
    if (!selected || selected.info.key !== info.key) return void 0;
    const press = this.host.pressedWith === "touch" ? "tap" : "click";
    return {
      // After copying and clearing: it changes the cells selected too
      order: 1.5,
      entries: [
        {
          kind: "item",
          label,
          icon: ICONS.autofill,
          hint: `Then ${press} the last cell to fill: the cells up to it go on from these, as dragging the fill handle fills them`,
          run: () => this.startPicking(widget, info, press)
        }
      ]
    };
  }
  // While picking, the cells a click would fill are outlined
  cellHovered(_widget, info, cell) {
    if (this.picking !== info.key) return;
    const selected = this.selection();
    const ref = this.host.cellRef(info, cell);
    const extent = selected && ref ? this.extentTo(selected, ref) : void 0;
    if (selected) this.outline(selected, extent && this.areaOf(selected, extent));
  }
  hoverEnded() {
    if (this.picking) this.clearOutline();
  }
  // A table rendered anew (the selection shown again; picking goes on there), sorted or filtered, or rows back in the document
  enhanced(widget, info) {
    if (this.picking === info.key) widget.classList.add("tp-fill-picking");
    this.placeHandle();
  }
  viewApplied() {
    this.placeHandle();
  }
  rowsAttached() {
    this.placeHandle();
  }
  editorOpened() {
    this.endPicking();
    this.handle.remove();
  }
  startPicking(widget, info, press) {
    this.picking = info.key;
    this.pickingFrom = this.selectedNow();
    (this.host.widgetForKey(info.key) ?? widget).classList.add("tp-fill-picking");
    const cancel = press === "tap" ? "a tap outside the table cancels" : "Esc cancels";
    void this.host.bridge.flash(`Table Plus: ${press} the last cell to fill to; ${cancel}`, "info");
  }
  endPicking() {
    if (!this.picking) return;
    this.picking = void 0;
    for (const widget of Array.from(this.host.doc.querySelectorAll(".tp-fill-picking"))) widget.classList.remove("tp-fill-picking");
    this.clearOutline();
  }
  /** A press while picking: on a cell of the table, the fill to it (taken); elsewhere, picking ends and the press goes on */
  picked(e) {
    if (e.button !== 0) {
      this.endPicking();
      return false;
    }
    const taken = this.pick(e.target);
    if (taken) {
      e.preventDefault();
      e.stopPropagation();
      this.host.takePress();
    }
    return taken;
  }
  /**
   * A touch while picking: a tap is a press (told by its pointer events: a
   * browser may fire no mouse events for a tap after scrolling); a touch that
   * moves scrolls the page, picking goes on
   */
  onTouch = (e) => {
    this.stopTap?.();
    if (!this.picking || e.pointerType !== "touch" || e.button !== 0 || !e.isPrimary) return;
    const { clientX: x, clientY: y, target } = e;
    const at = Date.now();
    const win = this.host.doc.defaultView;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > TAP_MOVE2) stop();
    };
    const up = () => {
      stop();
      if (Date.now() - at < TAP_MS2 && this.pick(target)) this.host.takePress();
    };
    const stop = () => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", stop, true);
      this.stopTap = void 0;
    };
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
    win.addEventListener("pointercancel", stop, true);
    this.stopTap = stop;
  };
  /** Picking ends; on a body cell of the table, the fill to it (true: the press is taken; a header's goes on: its sorting, its filter) */
  pick(target) {
    const key2 = this.picking;
    this.endPicking();
    const hit = this.host.enhancedWidgetOf(target);
    const cell = hit && hit[1].key === key2 ? this.host.tableCellOf(hit[1], target) : void 0;
    const ref = hit && cell ? this.host.cellRef(hit[1], cell) : void 0;
    if (!ref || ref.row === 0) return false;
    const selected = this.selection();
    const extent = selected && selected.info.key === key2 ? this.extentTo(selected, ref) : void 0;
    if (selected && extent) void this.apply(selected, extent);
    else void this.host.bridge.flash("Table Plus: nothing to fill there: pick a cell below, above or beside the cells selected", "info");
    return true;
  }
  /** The cells selected in a table shown, if they are body cells of a table shown as written */
  selection() {
    for (const widget of Array.from(this.host.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
      const refs = info ? this.host.selectedCells(info) : [];
      if (!info || refs.length === 0) continue;
      if (refs.some((ref) => ref.row === 0) || this.host.rearranged(info)) return void 0;
      const rows = this.host.shownRows(info).slice(1);
      const index = new Map(rows.map((tr, i) => [Number(tr.dataset.tpRow), i]));
      let [top, bottom, left, right] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const ref of refs) {
        const at = index.get(ref.row);
        if (at === void 0) return void 0;
        [top, bottom, left, right] = [Math.min(top, at), Math.max(bottom, at), Math.min(left, ref.column), Math.max(right, ref.column)];
      }
      const { pins } = info;
      const zone = (at, first, last, before, after) => at < first + before ? [first, first + before - 1] : at > last - after ? [last - after + 1, last] : [first + before, last - after];
      return {
        widget,
        info,
        rows,
        top,
        bottom,
        left,
        right,
        rowZone: zone(bottom, 0, rows.length - 1, pins.top, pins.bottom),
        columnZone: zone(right, 0, info.columns - 1, pins.left, pins.right)
      };
    }
    return void 0;
  }
  /** The markdown's row (the header 0) of a body row as shown */
  rowOf(selected, shown) {
    return Number(selected.rows[shown].dataset.tpRow);
  }
  /** The cell of a body row as shown, while it is in the document */
  cellOf(selected, shown, column) {
    const cell = this.host.cellAt(selected.info, { row: this.rowOf(selected, shown), column });
    return cell?.isConnected ? cell : void 0;
  }
  /** The handle in the bottom right cell of the selection (none while a cell is edited, or a drag places it) */
  placeHandle() {
    if (this.endDrag) return;
    const selected = this.host.editing ? void 0 : this.selection();
    if (selected) this.handleAt(selected, selected.bottom, selected.right);
    else this.handle.remove();
  }
  /**
   * The handle in a cell, on its corner; inside it on the table's last row or
   * column, where the table's box would cut the part past its edge (a box
   * that scrolls: its clip cannot be widened) and leave it half to grab
   */
  handleAt(selected, shown, column) {
    const cell = this.cellOf(selected, shown, column);
    if (!cell) {
      this.handle.remove();
      return;
    }
    this.handle.classList.toggle("tp-fill-last-row", shown === selected.rows.length - 1);
    this.handle.classList.toggle("tp-fill-last-column", column === selected.info.columns - 1);
    if (this.handle.parentElement !== cell) cell.append(this.handle);
  }
  /** The selection with the cells a drag fills */
  areaOf(selected, extent) {
    const { top, bottom, left, right } = selected;
    if (!extent) return { top, bottom, left, right };
    return extent.axis === "rows" ? { top: Math.min(top, extent.to), bottom: Math.max(bottom, extent.to), left, right } : { top, bottom, left: Math.min(left, extent.to), right: Math.max(right, extent.to) };
  }
  /** An area outlined: a piece in each of its cells on an edge, marked with the sides it draws */
  outline(selected, area) {
    const key2 = area ? `${area.top},${area.bottom},${area.left},${area.right}` : "";
    if (key2 === this.outlined) return;
    this.clearOutline();
    this.outlined = key2;
    if (!area) return;
    const piece = (shown, column) => {
      const cell = this.cellOf(selected, shown, column);
      if (!cell) return;
      const sides = [
        shown === area.top && "tp-fill-top",
        shown === area.bottom && "tp-fill-bottom",
        column === area.left && "tp-fill-left",
        column === area.right && "tp-fill-right"
      ].filter(Boolean);
      const edge = this.host.doc.createElement("span");
      edge.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-fill-edge ${sides.join(" ")}`;
      cell.append(edge);
      this.edges.push(edge);
    };
    for (let shown = area.top; shown <= area.bottom; shown++) {
      if (shown === area.top || shown === area.bottom) for (let column = area.left; column <= area.right; column++) piece(shown, column);
      else {
        piece(shown, area.left);
        if (area.right !== area.left) piece(shown, area.right);
      }
    }
  }
  clearOutline() {
    for (const edge of this.edges) edge.remove();
    this.edges = [];
    this.outlined = "";
  }
  /**
   * How far the pointer at x, y fills: along the axis it went further out of
   * the selection on, to the row or column under it, within the selection's zone
   */
  extentAt(selected, x, y) {
    const rects = selected.rows.map((tr) => tr.isConnected ? tr.getBoundingClientRect() : void 0);
    let row = rects.findIndex((r) => r && y >= r.top && y < r.bottom);
    if (row < 0) {
      const measured = rects.map((r, i) => ({ r, i })).filter((m) => m.r);
      if (measured.length === 0) return void 0;
      row = y < measured[0].r.top ? measured[0].i : measured[measured.length - 1].i;
    }
    const cells = Array.from(selected.rows[selected.bottom]?.cells ?? []).map((c) => c.getBoundingClientRect());
    let column = cells.findIndex((r) => x >= r.left && x < r.right);
    if (column < 0) column = cells.length && x < cells[0].left ? 0 : cells.length - 1;
    return this.extentFor(selected, row, column);
  }
  /** How far a fill to a cell goes (none for a header cell, nor one in the selection) */
  extentTo(selected, ref) {
    const row = selected.rows.findIndex((tr) => Number(tr.dataset.tpRow) === ref.row);
    return row < 0 ? void 0 : this.extentFor(selected, row, ref.column);
  }
  /**
   * How far a fill to a row (as shown) and column goes: along the axis it is
   * further out of the selection on, within the selection's zone
   */
  extentFor(selected, row, column) {
    const down = row > selected.bottom ? row - selected.bottom : row < selected.top ? selected.top - row : 0;
    const across = column > selected.right ? column - selected.right : column < selected.left ? selected.left - column : 0;
    if (down === 0 && across === 0) return void 0;
    const clamp = (n, [lo, hi]) => Math.max(lo, Math.min(hi, n));
    if (down >= across) {
      const to2 = clamp(row, selected.rowZone);
      return to2 > selected.bottom || to2 < selected.top ? { axis: "rows", to: to2 } : void 0;
    }
    const to = clamp(column, selected.columnZone);
    return to > selected.right || to < selected.left ? { axis: "columns", to } : void 0;
  }
  /** The lines a fill writes: each column (row) of the selection, its cells selected and those dragged over, nearest first */
  lines(selected, extent) {
    const { top, bottom, left, right } = selected;
    const cell = (shown, column) => ({ row: this.rowOf(selected, shown), column });
    const span = (from, to) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from <= to ? from + i : from - i);
    if (extent.axis === "rows") {
      const backward2 = extent.to < top;
      const targets2 = backward2 ? span(top - 1, extent.to) : span(bottom + 1, extent.to);
      return span(left, right).map((column) => ({
        sources: span(top, bottom).map((r) => cell(r, column)),
        targets: targets2.map((r) => cell(r, column)),
        backward: backward2
      }));
    }
    const backward = extent.to < left;
    const targets = backward ? span(left - 1, extent.to) : span(right + 1, extent.to);
    return span(top, bottom).map((r) => ({
      sources: span(left, right).map((column) => cell(r, column)),
      targets: targets.map((column) => cell(r, column)),
      backward
    }));
  }
  fillCells(info) {
    return {
      claim: (cell, from, to) => this.host.fillCell(info, cell, from, to),
      keepTags: (value, from) => this.host.keepTags(value, from)
    };
  }
  /** The handle dragged: what it fills outlined, the handle at its corner, the last value by the pointer; written as it is let go */
  drag() {
    const selected = this.selection();
    if (!selected) return;
    const win = this.host.doc.defaultView;
    const table = this.host.tableOf(selected.info);
    let extent;
    this.tipFor = "";
    this.host.doc.body.classList.add("tp-filling");
    const move = (ev) => {
      extent = this.extentAt(selected, ev.clientX, ev.clientY);
      const area = this.areaOf(selected, extent);
      this.outline(selected, extent && area);
      this.handleAt(selected, area.bottom, area.right);
      this.showTip(selected, extent, table, ev.clientX, ev.clientY);
    };
    const finish = (apply) => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", cancel, true);
      win.removeEventListener("blur", cancel);
      this.endDrag = void 0;
      this.host.doc.body.classList.remove("tp-filling");
      this.outline(selected, void 0);
      this.tip.classList.remove("tp-visible");
      if (apply && extent) void this.apply(selected, extent);
      else this.placeHandle();
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    this.endDrag = finish;
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
    win.addEventListener("pointercancel", cancel, true);
    win.addEventListener("blur", cancel);
  }
  /** By the pointer: the value the farthest cell filled gets (else how many cells are filled) */
  showTip(selected, extent, table, x, y) {
    if (!extent) {
      this.tip.classList.remove("tp-visible");
      return;
    }
    const key2 = `${extent.axis} ${extent.to}`;
    if (key2 !== this.tipFor) {
      this.tipFor = key2;
      const lines = this.lines(selected, extent);
      const cells = lines[0] ? fillLine(table, lines[0], this.fillCells(selected.info)) : [];
      const value = cells.length ? cellValue(cells[cells.length - 1]) : "";
      const count = lines.reduce((n, l) => n + l.targets.length, 0);
      this.tip.textContent = value || `${count} ${count === 1 ? "cell" : "cells"}`;
    }
    this.host.place(this.tip, x + 14, y + 14);
  }
  /** Double click: down as far as the column beside the selection (left, else right) has values */
  fillDown() {
    const selected = this.selection();
    if (!selected) return;
    const table = this.host.tableOf(selected.info);
    const columns = table.rows[0]?.cells.length ?? 0;
    const beside = [selected.left - 1, selected.right + 1].filter((c) => c >= 0 && c < columns);
    const last = selected.rowZone[1];
    const filledBeside = (column, shown) => shown <= last && cellValue(table.rows[this.rowOf(selected, shown)]?.cells[column] ?? "") !== "";
    let to = selected.bottom;
    for (const column of beside) {
      if (!filledBeside(column, selected.bottom + 1)) continue;
      while (filledBeside(column, to + 1)) to++;
      break;
    }
    if (to > selected.bottom) void this.apply(selected, { axis: "rows", to });
  }
  /**
   * The cells filled, in one edit, and selected with the ones they were
   * filled from: selected before the write (the table rendered anew shows the
   * selection again), the selection put back when nothing is written
   */
  async apply(selected, extent) {
    const { info, widget } = selected;
    const lines = this.lines(selected, extent);
    const area = this.areaOf(selected, extent);
    const corner = (shown, column) => ({ row: this.rowOf(selected, shown), column });
    this.host.selectCells(info, corner(area.top, area.left), corner(area.bottom, area.right));
    const result = await this.host.write(widget, (t) => filled(t, lines, this.fillCells(info)));
    if (result === "written") return;
    const now2 = this.host.widgetForKey(info.key);
    const nowInfo = now2 && this.host.infoOf(now2);
    if (nowInfo) this.host.selectCells(nowInfo, corner(selected.top, selected.left), corner(selected.bottom, selected.right));
  }
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
      const scroller = this.host.viewBounds(widget);
      const inside = this.host.scrollsInside(widget);
      const foot = info.table.tFoot;
      const overWindow = doc.defaultView.getComputedStyle(widget).position === "fixed";
      const native = !overWindow && !inside && widget.clientWidth > 0 && info.table.offsetWidth <= widget.clientWidth + 1;
      widget.classList.toggle("tp-sticky-native", native);
      widget.classList.toggle("tp-sticky-box", overWindow);
      if (native || overWindow) {
        const table2 = info.table.getBoundingClientRect();
        head.style.transform = "";
        head.classList.toggle("tp-stuck", head.getBoundingClientRect().top > table2.top + 0.5);
        if (foot) {
          foot.style.transform = "";
          foot.classList.toggle("tp-stuck", foot.rows.length > 0 && foot.getBoundingClientRect().bottom < table2.bottom - 0.5);
        }
        continue;
      }
      const box = this.host.innerBox(widget);
      const pageTop = scroller.top + STICKY_GAP;
      const boxTop = inside ? box.top : -Infinity;
      const table = info.table.getBoundingClientRect();
      const footHeight = foot?.offsetHeight ?? 0;
      let footTop = table.bottom - footHeight;
      if (foot && footHeight > 0) {
        const pageBottom = scroller.bottom;
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
var BAR_GAP = 12;
var BAR_CLEAR = 15;
var INSERT_REACH = 6;
var INSERT_LANE_AT = 17;
var INSERT_LANE_FROM = 7;
var INSERT_LANE_BAND = 32;
var INSERT_LANE_PAST = 16;
var LONG_PRESS_MS2 = 550;
var STORE_SORT_DELAY_MS = 400;
var ANCHOR_MS = 1e3;
var INSERT_CLICK_MS = 1e3;
var NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";
function placeAtEnd(parent, rows) {
  let next = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const tr = rows[i];
    if (tr.parentElement !== parent || tr.nextSibling !== next) parent.insertBefore(tr, next);
    next = tr;
  }
}
var NAVIGATING_CLASS = "tp-navigating-here";
var Controller = class {
  constructor(doc, bridge) {
    this.doc = doc;
    this.bridge = bridge;
    this.dialogs = new Dialogs(doc);
    this.metadata = new Metadata(this);
    this.cellEditor = new CellEditing(this, {
      features: this.features,
      isolate: (element) => this.isolate(element),
      endHover: () => this.hoverEdited(),
      movingRows: () => this.movingRows,
      dialogOpen: () => this.dialogs.isOpen,
      holdRow: (widget, info, row) => this.holdRow(widget, info, row),
      releaseRow: () => this.releaseRow(),
      editingEnded: (widget) => this.editingEnded(widget),
      editingStarted: () => this.touchKeyboard.editorOpened(),
      navigating: (on) => {
        this.navigating = on;
        this.markNavigating();
      }
    });
    this.touchKeyboard = new TouchKeyboard({
      doc,
      inTable: (target) => this.enhancedWidgetOf(target) !== void 0,
      editing: () => this.cellEditor.active !== void 0,
      revealEditing: () => this.cellEditor.revealActive(),
      // The cell being edited wins over keeping a table written in its place:
      // the keyboard shows as the next cell opens after a write (Enter)
      viewResized: () => this.dropAnchor()
    });
    this.bar = this.floating("div", "tp-bar");
    this.insertMark = this.floatingButton("tp-insert", "Insert here", ICONS.plus);
    this.quietMarks = {
      row: this.floatingButton("tp-insert tp-quiet", "Add a row", ICONS.plus),
      column: this.floatingButton("tp-insert tp-quiet", "Add a column", ICONS.plus)
    };
    this.insertLine = this.floating("div", "tp-insert-line");
  }
  doc;
  bridge;
  infos = /* @__PURE__ */ new WeakMap();
  // The page's text as last read
  pageText = "";
  currentPage = "";
  // Tables being enhanced: a scan meanwhile waits for it instead of starting again
  enhancing = /* @__PURE__ */ new WeakMap();
  views = /* @__PURE__ */ new Map();
  // The maximum table height setting, in pixels; 0: no limit
  maxHeight = 0;
  // The metadata setting, for menus that offer pinning
  metadataOn = false;
  // Sideways scroll of each wide table, carried over to its next rendering
  scrollLefts = /* @__PURE__ */ new Map();
  // The same for tables taller than the maximum height setting, scrolled inside
  scrollTops = /* @__PURE__ */ new Map();
  // A table being written, and where it was in the page's view (its top below
  // the scroller's): the editor renders it anew and may scroll the page while
  // it measures the new rendering, which would leave the user elsewhere
  anchor;
  // When a press inserted with the +: the click that ends it is no click on what is under the pointer then
  insertPressAt = 0;
  cellEditor;
  // The settings dialog while open, and while it reads the settings to open
  settingsDialog;
  // A feature's dialog (openDialog)
  dialogs;
  settingsOpening = false;
  // Countermeasures to SilverBullet and the on-screen keyboard on touch screens (a workaround, see its file)
  touchKeyboard;
  hoverWidget;
  hoverCell;
  // Ctrl held in a cell editor, and the element under the pointer showing the move cursor
  navigating = false;
  navigatingAt;
  hideTimer;
  scanQueued = false;
  // Set by stop(): work already scheduled then does nothing
  stopped = false;
  // Rows are being rearranged: a cell editor losing its focus to that is not left
  movingRows = false;
  // The row being edited (or just added), in the table with `key`: it stays
  // where it is shown until the editor leaves it, so sorting and filters do not
  // move or hide it while it is typed into
  held;
  settingsTimer;
  settingsReadAt = 0;
  sortTimers = /* @__PURE__ */ new Map();
  // Tables whose sorting is stored once their cell editor closes
  sortsWaiting = /* @__PURE__ */ new Set();
  stickyQueued = false;
  warnedIncompatible = false;
  observer;
  bar;
  // Inserting rows and columns: a + on a border of the table, and the border marked
  insertMark;
  insertLine;
  insertAt;
  // Quiet + buttons under the last row and right of the last column, shown
  // while that row (column) is hovered, selected or edited; lit up under the
  // pointer. A + the pointer brings up on the same axis takes their place.
  quietMarks;
  // The quiet + under the pointer: its line shows
  quietHovered;
  // Features that keep their own state and work through this controller
  // (core/feature.ts): those turned on, filled in when Table Plus starts
  features = [];
  featuresStarted;
  // The modules turned on
  modulesOn = /* @__PURE__ */ new Set();
  // The toolbar's open ⋯ menu
  // The open menu of a table's toolbar (⋯, at its button) or of cells (at the pointer)
  tableMenu;
  // When a press was last taken (a cell menu a touch opened, a feature's: takePress): its mouse events after it are no click on the cell
  pressTakenAt = 0;
  stopLongPress;
  metadata;
  // Each table's rows as SilverBullet rendered them (the header first), whether
  // a feature took some of them out of the document or not; its body rows; and
  // the rows shown, in display order, as the view last placed them
  renderedRows = /* @__PURE__ */ new WeakMap();
  bodyRowsOf = /* @__PURE__ */ new WeakMap();
  shownOrder = /* @__PURE__ */ new WeakMap();
  // A row each table keeps in the document whatever a feature takes out (a row being dragged)
  heldRows = /* @__PURE__ */ new WeakMap();
  // Steps every write goes through after the edit, in this order
  writeSteps = [metadataAfterEdit];
  setBridge(bridge) {
    this.bridge = bridge;
  }
  start() {
    const win = this.doc.defaultView;
    this.touchKeyboard.start();
    win.addEventListener("mousedown", this.onMouseDown, true);
    win.addEventListener("click", this.onClick, true);
    win.addEventListener("contextmenu", this.onContextMenu, true);
    win.addEventListener("pointerdown", this.onPointerDown, true);
    win.addEventListener("dblclick", this.onDoubleClick, true);
    win.addEventListener("scroll", this.onScroll, true);
    win.addEventListener("keydown", this.onKeyDown, true);
    win.addEventListener("keyup", this.onKeyUp, true);
    win.addEventListener("blur", this.onBlur);
    this.doc.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.doc.addEventListener("mousemove", this.onMouseMove, { passive: true });
    this.doc.addEventListener("pointerout", this.onPointerOut, { passive: true });
    win.addEventListener("mouseup", this.onMouseUp, true);
    win.addEventListener("wheel", this.dropAnchor, { capture: true, passive: true });
    win.addEventListener("touchstart", this.dropAnchor, { capture: true, passive: true });
    this.insertMark.addEventListener("click", () => this.insertHere());
    for (const axis of ["row", "column"]) {
      const mark = this.quietMarks[axis];
      mark.addEventListener("click", () => this.insertAtEnd(axis));
      mark.addEventListener("pointerenter", () => {
        this.quietHovered = axis;
        this.lineAtEnd(axis);
      });
      mark.addEventListener("pointerleave", () => {
        if (this.quietHovered === axis) this.quietHovered = void 0;
        if (!this.insertAt) this.insertLine.classList.remove("tp-visible");
      });
    }
    this.observer = new MutationObserver((records) => {
      this.tablesAdded(records);
      this.queueScan();
    });
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
      // Before what takes presses: a press while picking where AutoFill to… fills to ends picking (or fills) first;
      // before the selection too: Esc while dragging the fill handle cancels the fill, the selection stays
      optional("autofill", () => new AutoFill(this)),
      optional("autoscroll", () => new Autoscroll(this)),
      optional("handles", () => new Grips(this)),
      optional("widths", () => new Widths(this)),
      optional("longText", () => new LongText(this)),
      // Before what places rows into the table: it takes them out of the document first
      optional("largeTables", () => new LargeTables(this)),
      // Recalculate first in the toolbar
      optional("formulas", () => new Formulas(this)),
      optional("pageLinks", () => new PageLinks(this)),
      // Before types: Filter right after the sorting in the column menu
      optional("filters", () => new Filters(this)),
      // After formulas: a formula's result is shown in its column's type
      optional("columnTypes", () => new ColumnTypes(this)),
      optional("names", () => new Names(this)),
      always(() => this.metadata),
      optional("paste", () => new Paste(this)),
      optional("selection", () => new Selection(this)),
      optional("lazy", () => new Lazy(this)),
      optional("themes", () => new Themes(this)),
      optional("export", () => new Export(this)),
      optional("excel", () => new Excel(this)),
      // Its icon last in the toolbar, before the menu
      optional("fullScreen", () => new FullScreen(this)),
      always(() => new Expressions(this)),
      always(() => new History(this)),
      always(() => new CellPopup(this))
    ];
    const enabled = await Promise.all(all.map(({ name }) => name ? this.featureEnabled(name) : true));
    if (this.stopped) return;
    all.forEach(({ name }, i) => {
      if (name && enabled[i]) this.modulesOn.add(name);
    });
    const features = all.filter((_, i) => enabled[i]).map(({ create }) => create());
    this.features.push(...features);
    for (const feature of features) feature.start?.();
  }
  async featureEnabled(name) {
    try {
      const value = await this.bridge.getConfig?.(`tablePlus.modules.${name}.enabled`, moduleOnByDefault(name));
      return typeof value === "boolean" ? value : moduleOnByDefault(name);
    } catch {
      return moduleOnByDefault(name);
    }
  }
  /** Detaches from the page: listeners, observer and floating controls */
  stop() {
    this.stopped = true;
    const win = this.doc.defaultView;
    win.removeEventListener("mousedown", this.onMouseDown, true);
    win.removeEventListener("click", this.onClick, true);
    win.removeEventListener("contextmenu", this.onContextMenu, true);
    win.removeEventListener("pointerdown", this.onPointerDown, true);
    this.stopLongPress?.();
    delete this.doc.documentElement.dataset.tpPointer;
    win.removeEventListener("dblclick", this.onDoubleClick, true);
    win.removeEventListener("scroll", this.onScroll, true);
    win.removeEventListener("keydown", this.onKeyDown, true);
    for (const feature of this.features) feature.stop?.();
    win.removeEventListener("keyup", this.onKeyUp, true);
    win.removeEventListener("blur", this.onBlur);
    this.doc.removeEventListener("pointermove", this.onPointerMove);
    this.doc.removeEventListener("mousemove", this.onMouseMove);
    this.doc.removeEventListener("pointerout", this.onPointerOut);
    win.removeEventListener("mouseup", this.onMouseUp, true);
    this.cellEditor.close();
    win.removeEventListener("wheel", this.dropAnchor, true);
    win.removeEventListener("touchstart", this.dropAnchor, true);
    this.touchKeyboard.stop();
    this.anchor = void 0;
    this.observer?.disconnect();
    clearTimeout(this.settingsTimer);
    for (const timer of this.sortTimers.values()) clearTimeout(timer);
    this.closeTableMenu(false);
    for (const el of [this.bar, this.insertMark, this.insertLine, ...Object.values(this.quietMarks)]) el.remove();
    this.settingsDialog?.close();
    this.dialogs.close();
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
    this.cellHovered(active.widget, info, active.cell);
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
  otherPages() {
    for (const feature of this.features) {
      const pages = feature.otherPages?.();
      if (pages) return pages;
    }
    return void 0;
  }
  selectCells(info, anchor, focus) {
    for (const feature of this.features) feature.selectCells?.(info, anchor, focus);
  }
  editCell(info, ref, how, popup = false) {
    const widget = this.widgetForKey(info.key);
    const current = widget && this.infos.get(widget);
    const cell = current && this.cellAt(current, ref);
    if (widget && current && cell) this.cellEditor.open(widget, current, cell, how === "select" ? true : void 0, how === "replace", popup ? {} : void 0);
  }
  editInPopup() {
    this.cellEditor.toPopup();
  }
  selectsCells() {
    return this.features.some((f) => f.selectCells);
  }
  selectedCells(info) {
    for (const feature of this.features) {
      const cells = feature.selected?.(info);
      if (cells) return cells;
    }
    return [];
  }
  moduleOn(name) {
    return this.modulesOn.has(name);
  }
  tablesChanged() {
    for (const feature of this.features) feature.tablesChanged?.();
  }
  columnDeleteWarnings(info, column) {
    return this.features.flatMap((f) => f.columnDeleteWarning?.(info, column) ?? []);
  }
  uniqueTags() {
    return new Set(this.features.flatMap((f) => f.uniqueTags?.() ?? []));
  }
  metadataParts(tables) {
    return this.features.flatMap((f) => f.metadataPart?.(tables) ?? []);
  }
  tableResized(info) {
    this.pinColumns(info);
    this.queueStickyUpdate();
  }
  toolbarChanged() {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (widget && info && this.bar.classList.contains("tp-visible")) this.showTableControls(widget, info, false);
  }
  /**
   * The toolbar placed again, once in the next frame: placing it measures the
   * table, and measured right after each change (a write applies the view more
   * than once) the browser would lay out a large table again each time
   */
  queuePlaceBar() {
    if (this.barPlaceQueued) return;
    this.barPlaceQueued = true;
    const run = () => {
      this.barPlaceQueued = false;
      const widget = this.hoverWidget;
      const info = widget && this.infos.get(widget);
      if (this.stopped || !widget || !info || renderedTable(widget) !== info.table || !this.bar.classList.contains("tp-visible")) return;
      this.placeBar(widget, info);
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
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
    this.sortsWaiting.delete(shownInfo.key);
    const [widget, info] = this.current(shownWidget, shownInfo);
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellValue2));
    const { top, bottom } = info.pins;
    const middle = visibleRows(values, withPins(view, info.pins));
    const order2 = [
      ...rows.slice(0, top).map((_, i) => i + 1),
      ...middle.map((i) => i + 1),
      ...rows.slice(rows.length - bottom).map((_, i) => rows.length - bottom + i + 1)
    ];
    this.views.set(info.key, withoutSort(view));
    const position = new Map(order2.map((row, i) => [row, i + 1]));
    await this.write(widget, (t) => withMetaSort(reorderRows(t, order2), void 0), {
      rowMap: (r) => r === 0 ? 0 : position.get(r)
    });
    this.focusEditor(widget);
  }
  /**
   * The view a table's metadata stored ends with the metadata, so the rows
   * show as written: forgotten, so Ctrl+Z (the metadata back) shows it again
   */
  forgetStoredView(key2) {
    clearTimeout(this.sortTimers.get(key2));
    this.sortTimers.delete(key2);
    this.sortsWaiting.delete(key2);
    this.views.delete(key2);
    for (const feature of this.features) feature.viewForgotten?.(key2);
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
    const maxHeight = await this.setting("maxHeight");
    this.metadataOn = await this.setting("metadata");
    this.cellEditor.selectOnClick = await this.setting("selectOnClick");
    if (this.stopped || maxHeight === this.maxHeight) return;
    this.maxHeight = maxHeight;
    for (const widget of Array.from(this.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info && renderedTable(widget) === info.table) this.applyView(widget, info);
    }
    this.queueStickyUpdate();
  }
  rearranged(info) {
    return !!this.viewOf(info).sort || this.features.some((f) => f.hidesRows?.(info));
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
  /** A table's rows as rendered (the header first), kept from when it was first seen */
  rowsOf(table) {
    let rows = this.renderedRows.get(table);
    if (!rows) this.renderedRows.set(table, rows = Array.from(table.rows));
    return rows;
  }
  /**
   * Tables SilverBullet just put into the page (a mutation observer's callback
   * runs before the browser lays them out): their rows kept, and the features
   * told, so they may take rows out of the document before they cost a layout
   */
  tablesAdded(records) {
    if (!this.features.some((f) => f.tableAdded)) return;
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        const tables = node instanceof HTMLTableElement ? [node] : node.closest("table") ? [] : Array.from(node.getElementsByTagName("table"));
        for (const table of tables) {
          const widget = table.closest(WIDGET_SELECTOR);
          if (!widget || this.renderedRows.has(table) || this.ownTable(widget)) continue;
          const rows = this.rowsOf(table);
          for (const feature of this.features) feature.tableAdded?.(widget, table, rows);
        }
      }
    }
  }
  /** A table in one of Table Plus' floating elements (a theme's preview in a menu): not one of the page's */
  ownTable(widget) {
    return !!widget.closest(".tp-floating");
  }
  /** Enhances every rendered table that is not enhanced yet */
  async scan() {
    if (this.stopped) return;
    await this.featuresStarted;
    if (this.stopped) return;
    const pending = [];
    for (const widget of Array.from(this.doc.querySelectorAll(WIDGET_SELECTOR))) {
      const table = renderedTable(widget);
      if (!table || table.rows.length === 0 || this.ownTable(widget)) continue;
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
      const rendered = this.rowsOf(table);
      const header = rendered[0];
      const shape = {
        rows: rendered.length,
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
      this.keepAnchor(info.key, widget);
      this.cellEditor.takePending(widget, info);
      this.anchorAgain(widget, info.key);
      for (const feature of this.features) feature.enhanced?.(widget, info);
      if (this.navigating) this.markNavigating();
      this.reshowInsert(widget, info);
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
    const message4 = "Table Plus is inactive: this SilverBullet version renders tables differently than expected";
    console.warn(message4);
    void this.bridge.flash(message4, "error");
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
    const rows = [...this.rowsOf(info.table)];
    const metaRow2 = info.metaRow ? rows.pop() : void 0;
    this.bodyRowsOf.set(info.table, rows.slice(1));
    metaRow2?.classList.add("tp-meta-row");
    const mark = (icon, title) => {
      const span = this.doc.createElement("span");
      span.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-pin-mark`;
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
    for (const cell of Array.from(rows[0].cells)) layOutHeaderCell(cell);
  }
  // ---- view: sort and filter --------------------------------------------
  viewOf(info) {
    return this.views.get(info.key) ?? DEFAULT_VIEW;
  }
  keepTags(value, from) {
    return keepTags(value, from, new Set(this.features.flatMap((f) => f.takesTags?.() ?? [])));
  }
  clickSelects() {
    return this.features.some((f) => f.clickSelects?.());
  }
  menuNaming(widget, info, target) {
    for (const feature of this.features) {
      const naming = feature.menuNaming?.(widget, info, target);
      if (naming) return naming;
    }
    return void 0;
  }
  /** A menu's naming whose save closes the menu once saved */
  closingNaming(naming) {
    if (!naming) return void 0;
    return {
      ...naming,
      save: async (name) => {
        const why = await naming.save(name);
        if (why === void 0) this.closeTableMenu(false);
        return why;
      }
    };
  }
  openTableMenu(widget, naming = false) {
    if (this.openMore?.widget === widget) this.openMore.open(naming);
  }
  headerRenamed(name, original) {
    for (const feature of this.features) {
      const kept = feature.headerRenamed?.(name, original);
      if (kept !== void 0) return kept;
    }
    return name;
  }
  fillCell(info, cell, from, to) {
    for (const feature of this.features) {
      const copy = feature.fillCell?.(info, cell, from, to);
      if (copy !== void 0) return copy;
    }
    return void 0;
  }
  cellKeptBy(cell) {
    for (const feature of this.features) {
      const reason = feature.keepsCell?.(cell);
      if (reason) return reason;
    }
    return void 0;
  }
  viewChanged(widget, info) {
    this.setView(widget, info, this.viewOf(info));
  }
  setView(widget, info, view) {
    this.views.set(info.key, view);
    if (this.held?.key === info.key) this.held = void 0;
    this.applyView(widget, info);
    const active = this.cellEditor.active;
    if (active?.widget === widget) this.holdRow(widget, info, active.row);
  }
  /**
   * A view change that may change the sorting. With the metadata setting on,
   * the sorting is also stored in the table, so it is the table's view next time.
   */
  setSort(widget, info, view) {
    this.setView(widget, info, view);
    this.scheduleSortStore(info.key);
  }
  /**
   * Stores a table's sorting a moment after it changed: clicks in a row store
   * only where they end, in the table as rendered then. Not while a cell of the
   * table is edited (writing would render the table anew under the editor): then
   * once the editor closes.
   */
  scheduleSortStore(key2) {
    clearTimeout(this.sortTimers.get(key2));
    this.sortTimers.set(
      key2,
      setTimeout(() => {
        this.sortTimers.delete(key2);
        const active = this.cellEditor.active;
        if (active && this.infos.get(active.widget)?.key === key2) this.sortsWaiting.add(key2);
        else void this.storeSort(key2);
      }, STORE_SORT_DELAY_MS)
    );
  }
  /** The cell editor closed: a sorting waiting for it is stored */
  editingEnded(widget) {
    const key2 = this.infos.get(widget)?.key;
    if (key2 && this.sortsWaiting.delete(key2)) this.scheduleSortStore(key2);
  }
  async storeSort(key2) {
    const widget = this.widgetForKey(key2);
    const info = widget && this.infos.get(widget);
    if (this.stopped || !widget || !info || !await this.metadataAllowed(info)) return;
    const view = this.views.get(key2) ?? DEFAULT_VIEW;
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
  takePress() {
    this.pressTakenAt = Date.now();
  }
  /** The mouse events now are those of a press taken (until the next press, at most a second) */
  pressTaken() {
    return Date.now() - this.pressTakenAt < 1e3;
  }
  get pressedWith() {
    return this.doc.documentElement.dataset.tpPointer ?? "";
  }
  columnMenuEntries(widget, info, column, open) {
    return this.features.flatMap((f) => f.columnMenuEntries?.(widget, info, column, open) ?? []);
  }
  columnMenuLeadEntries(widget, info, column, open) {
    return this.features.flatMap((f) => f.columnMenuLeadEntries?.(widget, info, column, open) ?? []);
  }
  columnMenuTopEntries(widget, info, column) {
    return this.features.flatMap((f) => f.columnMenuTopEntries?.(widget, info, column) ?? []);
  }
  columnMenuInsertEntries(widget, info, column) {
    return this.features.flatMap((f) => f.columnMenuInsertEntries?.(widget, info, column) ?? []);
  }
  rowMenuEntries(widget, info, row, column) {
    return this.features.flatMap((f) => f.rowMenuEntries?.(widget, info, row, column) ?? []);
  }
  lineMenuEntries(widget, info, axis, lines) {
    return this.features.flatMap((f) => f.lineMenuEntries?.(widget, info, axis, lines) ?? []);
  }
  get metadataEnabled() {
    return this.metadataOn;
  }
  saveEditing() {
    return this.cellEditor.finish(true, void 0, false);
  }
  takeEditor() {
    const closed = this.cellEditor.close();
    return closed && { widget: closed.widget, row: closed.row, column: closed.column, save: (t) => this.cellEditor.withSaved(t, closed) };
  }
  /** The settings dialog (the table's ⋯ menu, the "Table Plus: Settings" command) */
  async openSettings() {
    if (this.settingsDialog?.isOpen || this.settingsOpening) return;
    this.settingsOpening = true;
    const bridge = this.bridge;
    this.settingsDialog = new SettingsDialog({
      doc: this.doc,
      bridge,
      canSave: !!bridge.saveSettings || !!bridge.saveConfigPage && !!bridge.readPage,
      save: (values) => this.saveSettings(values),
      saved: () => {
        this.settingsReadAt = 0;
        void this.refreshSettings();
      }
    });
    try {
      await this.settingsDialog.open();
    } finally {
      this.settingsOpening = false;
    }
  }
  /** Settings saved where SilverBullet keeps them: the CONFIG page's managed block (configpage.ts), or the bridge's own store */
  async saveSettings(values) {
    const bridge = this.bridge;
    if (bridge.saveSettings) {
      await bridge.saveSettings(values);
      return;
    }
    if (!bridge.saveConfigPage || !bridge.readPage) throw new Error("no configuration page to save to");
    let text = "";
    try {
      text = await bridge.readPage(CONFIG_PAGE) ?? "";
    } catch (e) {
      if (!/not.?found|does not exist|no such/i.test(String(e))) throw e;
    }
    if (/^(<{7}|={7}|>{7})( |$)/m.test(text)) throw new Error("the CONFIG page has a sync conflict: resolve it there first");
    await bridge.saveConfigPage(withConfigSettings(text, values));
  }
  /** The "Table Plus: Remove table metadata" command */
  removeAllMetadata() {
    return this.metadata.removeFromPage();
  }
  /** SilverBullet's `page:index` event */
  async pageIndexed(name) {
    for (const feature of this.features) await feature.pageIndexed?.(name);
  }
  /** SilverBullet's `editor:pageLoaded` event: another page is in the editor */
  async pageLoaded() {
    const name = await this.bridge.getCurrentPage();
    for (const feature of this.features) await feature.pageLoaded?.(name);
  }
  tableOf(info) {
    return this.features.reduce((table, f) => f.pendingEdits?.(info)?.apply(table) ?? table, parseTable(info.source));
  }
  cancelEditing() {
    this.cellEditor.dropPending();
    if (this.cellEditor.active) void this.cellEditor.finish(false);
  }
  /** The rendered table a view key belongs to, if it is enhanced and on screen */
  widgetForKey(key2) {
    for (const widget of Array.from(this.doc.querySelectorAll(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info?.key === key2 && renderedTable(widget) === info.table) return widget;
    }
    return void 0;
  }
  bodyRows(info) {
    const kept = this.bodyRowsOf.get(info.table);
    if (kept) return [...kept];
    return Array.from(info.table.querySelectorAll("tr[data-tp-row]")).sort(
      (a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow)
    );
  }
  rowNeeded(info, row) {
    if (row.isConnected) return;
    for (const feature of this.features) feature.rowNeeded?.(info, row);
  }
  holdInDocument(info, row) {
    if (row) this.heldRows.set(info.table, row);
    else this.heldRows.delete(info.table);
  }
  heldInDocument(info) {
    return this.heldRows.get(info.table);
  }
  rowsAttached(info, rows) {
    for (const feature of this.features) feature.rowsAttached?.(info, rows);
    this.pinColumns(info);
  }
  /**
   * The rows shown (indexes of the body rows), with the held row of this table
   * shown beside its anchors, whether the sorting and filters would show it there or not
   */
  withHeldRow(info, order2, count) {
    const held = this.held;
    const { top, bottom } = info.pins;
    if (held?.key !== info.key || held.row - 1 < top || held.row - 1 >= count - bottom) return order2;
    const index = held.row - 1;
    const rest = order2.filter((i) => i !== index);
    const after = held.after === void 0 ? -1 : rest.indexOf(held.after - 1);
    const before = held.before === void 0 ? -1 : rest.indexOf(held.before - 1);
    const at = after >= 0 ? after + 1 : before >= 0 ? before : rest.length;
    return [...rest.slice(0, at), index, ...rest.slice(at)];
  }
  /** A row is entered in the cell editor: held where it is shown now, beside the rows shown next to it */
  holdRow(widget, info, row) {
    if (this.held?.key === info.key && this.held.row === row) return;
    this.releaseRow();
    if (row === 0) return;
    const { top, bottom } = info.pins;
    const shown = this.shownRows(info).slice(1).map((tr) => Number(tr.dataset.tpRow)).filter((r) => r > top && r <= info.rows - 1 - bottom);
    const at = shown.indexOf(row);
    if (at < 0) return;
    this.held = {
      key: info.key,
      row,
      ...at > 0 ? { after: shown[at - 1] } : {},
      ...at < shown.length - 1 ? { before: shown[at + 1] } : {}
    };
  }
  /** The held row is left: the sorting and filters place it */
  releaseRow() {
    const held = this.held;
    if (!held) return;
    this.held = void 0;
    const widget = this.widgetForKey(held.key);
    const info = widget && this.infos.get(widget);
    if (widget && info && renderedTable(widget) === info.table && this.rearranged(info)) this.applyView(widget, info);
  }
  /** After a write: a new row focused is held beside the rows asked */
  holdAfterWrite(key2, options) {
    if (options.hold && options.focus) {
      this.held = { key: key2, row: options.focus.row, ...options.hold };
      return;
    }
    if (this.held?.key === key2 && options.rowMap) this.held = void 0;
  }
  /**
   * A cell's value for sorting and filtering: the edited cell shows the
   * editor, not its text, so its value is what is typed (a type's value stays)
   */
  cellValue(cell) {
    const active = this.cellEditor.active;
    return active?.cell === cell && cell.dataset.tpValue === void 0 ? active.field.value : cellValue2(cell);
  }
  /**
   * Each body cell's content in a box of its own (Table Plus' own elements
   * stay outside it), as wide as its text: what modules size and limit (the
   * longText module: wrapped or cut at a maximum width; widths: a width set).
   * Idempotent: run again after a feature replaced a cell's content.
   */
  layOutCells(info) {
    for (const tr of this.bodyRows(info)) {
      for (const cell of Array.from(tr.cells)) {
        if (cell.classList.contains("tp-editing")) continue;
        let box;
        const loose = [];
        for (let n = cell.firstChild; n; n = n.nextSibling) {
          if (n instanceof HTMLElement && n.classList.contains("tp-cell-content") && !box) box = n;
          else if (!(n instanceof Element && n.classList.contains(UI_CLASS))) loose.push(n);
        }
        if (loose.length === 0) continue;
        if (!box) {
          box = this.doc.createElement("div");
          box.className = "tp-cell-content";
          cell.prepend(box);
        }
        box.append(...loose);
      }
    }
  }
  applyView(widget, info) {
    this.layOutCells(info);
    const view = this.viewOf(info);
    const { top, bottom } = info.pins;
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map((cell) => this.cellValue(cell)));
    const hidden = /* @__PURE__ */ new Set();
    for (const feature of this.features) for (const i of feature.hiddenRows?.(info, values) ?? []) hidden.add(i);
    const order2 = this.withHeldRow(info, visibleRows(values, withPins(view, info.pins), hidden), rows.length);
    const shown = new Set(order2);
    const body = info.table.tBodies[0] ?? info.table;
    rows.forEach((tr, i) => {
      const pinned = i < top || i >= rows.length - bottom;
      tr.classList.toggle("tp-hidden", !pinned && !shown.has(i));
    });
    const metaRow2 = info.table.querySelector("tr.tp-meta-row");
    const middle = rows.filter((_, i) => i >= top && i < rows.length - bottom);
    const bodyRows = [
      ...order2.map((i) => rows[i]),
      ...middle.filter((tr) => tr.classList.contains("tp-hidden")),
      ...metaRow2 ? [metaRow2] : []
    ];
    const editing = this.cellEditor.active?.widget === widget ? this.cellEditor.active : void 0;
    const selection = editing && [editing.field.selectionStart, editing.field.selectionEnd];
    const shownBody = order2.map((i) => rows[i]);
    this.shownOrder.set(info.table, [info.table.rows[0], ...rows.slice(0, top), ...shownBody, ...rows.slice(rows.length - bottom)]);
    this.movingRows = true;
    try {
      const head = info.table.tHead;
      if (head) placeAtEnd(head, rows.slice(0, top));
      const placed = body instanceof HTMLTableSectionElement && this.features.some((f) => f.placeRows?.(widget, info, body, shownBody));
      if (!placed) placeAtEnd(body, bodyRows);
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
    for (const feature of this.features) feature.viewApplied?.(widget, info);
    this.pinColumns(info);
    widget.classList.toggle("tp-rearranged", this.rearranged(info));
    widget.style.maxHeight = this.maxHeight > 0 ? `${this.maxHeight}px` : "";
    if (this.hoverWidget === widget) this.showTableControls(widget, info, false);
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
    const rows = this.rowsOf(info.table).filter((tr) => !tr.classList.contains("tp-meta-row"));
    const widths = Array.from(header.cells, (cell) => cell.getBoundingClientRect().width);
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
      offset += widths[c] ?? 0;
    }
    offset = 0;
    for (let c = info.columns - 1; c >= info.columns - right; c--) {
      pin(c, "right", offset, c === info.columns - right);
      offset += widths[c] ?? 0;
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
    return row?.contains(UI_CLASS) || row?.contains("tp-meta-row") ? void 0 : cell;
  }
  onMouseDown = (e) => {
    this.dropAnchor();
    this.insertPressAt = 0;
    if (this.pressTaken()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (this.tableMenu && e.target instanceof Node && !this.tableMenu.element.contains(e.target) && !this.bar.contains(e.target)) {
      this.closeTableMenu(false);
    }
    for (const feature of this.features) if (feature.mouseDown?.(e)) return;
    const quietAxis = ["row", "column"].find((axis) => e.target instanceof Node && this.quietMarks[axis].contains(e.target));
    if (e.button === 0 && quietAxis) {
      e.preventDefault();
      e.stopPropagation();
      this.insertPressAt = Date.now();
      this.insertAtEnd(quietAxis);
      return;
    }
    const onMark = e.target instanceof Node && this.insertMark.contains(e.target);
    if (e.button === 0 && (onMark || this.inInsertBand && !(e.target instanceof Node && this.isFloating(e.target)))) {
      e.preventDefault();
      e.stopPropagation();
      if (this.insertAt) {
        this.insertPressAt = Date.now();
        this.insertHere();
      }
      return;
    }
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
    if (element.closest(`.tp-cell-editor, tr.${UI_CLASS}`) || element.closest(INTERACTIVE_SELECTOR)) {
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
  // The end of a press that inserted with the +, or of a press taken: it reaches nothing
  onMouseUp = (e) => {
    if (this.pressTaken()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.button !== 0 || !this.insertPressAt || Date.now() - this.insertPressAt > INSERT_CLICK_MS) return;
    e.preventDefault();
    e.stopPropagation();
  };
  onClick = (e) => {
    if (e.detail !== 0 && this.pressTaken()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.button === 0 && e.detail !== 0 && this.insertPressAt && Date.now() - this.insertPressAt <= INSERT_CLICK_MS) {
      this.insertPressAt = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
    } else if (action?.dataset.tpAction) {
      const name = action.dataset.tpAction;
      if (this.features.some((f) => f.action?.(name, action, widget, info))) e.preventDefault();
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
    if (this.anchor && e.target === this.anchor.scroller) this.keepAnchor(this.anchor.key);
  };
  // ---- keeping a table written in its place ----------------------------------
  /** Before a write: where the table is in the page's view */
  anchorAt(widget, key2) {
    const scroller = widget.isConnected ? this.scrollParentOf(widget) : void 0;
    this.anchor = scroller && {
      key: key2,
      scroller,
      offset: widget.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
      until: Date.now() + ANCHOR_MS
    };
  }
  /** The table rendered anew is scrolled to where it was, so the row edited stays under the user's eyes */
  keepAnchor(key2, widget = this.widgetForKey(key2)) {
    const anchor = this.anchor;
    if (!anchor || anchor.key !== key2 || !widget) return;
    if (Date.now() > anchor.until || !anchor.scroller.isConnected) {
      this.anchor = void 0;
      return;
    }
    const offset = widget.getBoundingClientRect().top - anchor.scroller.getBoundingClientRect().top;
    if (Math.abs(offset - anchor.offset) >= 1) anchor.scroller.scrollTop += offset - anchor.offset;
  }
  /**
   * After the table's own scrolling (the cell to edit next revealed): kept
   * there, also once the editor has measured the new rendering, in the next
   * frames
   */
  anchorAgain(widget, key2) {
    const anchor = this.anchor;
    if (!anchor || anchor.key !== key2) return;
    anchor.offset = widget.getBoundingClientRect().top - anchor.scroller.getBoundingClientRect().top;
    const keep = () => this.keepAnchor(key2);
    const win = this.doc.defaultView;
    win.requestAnimationFrame?.(() => {
      keep();
      win.requestAnimationFrame(keep);
    });
    setTimeout(keep, 100);
  }
  dropAnchor = () => {
    this.anchor = void 0;
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
      this.cellHovered(widget, info, cell);
    } else this.endHover(true);
    if (this.insertAt || this.inInsertBand) this.insertUnderPointer();
    if (this.navigating) this.markNavigating();
  }
  shownPart(widget, info, cell) {
    if (!cell.isConnected) return void 0;
    const rect = cell.getBoundingClientRect();
    const shown = this.shownRect(widget, info);
    const view = this.viewBounds(widget);
    const held = cell.closest("tbody") ? this.heldBounds(info) : void 0;
    const pinned = cell.classList.contains("tp-pin-left") || cell.classList.contains("tp-pin-right");
    const part = {
      left: Math.max(rect.left, shown.left, view.left, held && !pinned ? held.left : -Infinity),
      right: Math.min(rect.right, shown.right, view.right, held && !pinned ? held.right : Infinity),
      top: Math.max(rect.top, shown.top, view.top, held ? held.top : -Infinity),
      bottom: Math.min(rect.bottom, shown.bottom, view.bottom, held ? held.bottom : Infinity)
    };
    return part.right > part.left && part.bottom > part.top ? part : void 0;
  }
  /** Whether any of the element is in view: inside the page's scroll view and the table's sideways view */
  isShown(widget, info, element) {
    if (!element.isConnected && info.table.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const view = this.viewBounds(widget);
    const box = this.innerBox(widget);
    const head = info.table.tHead;
    const top = Math.max(view.top, box.top, head && element.closest("tbody") ? head.getBoundingClientRect().bottom : -Infinity);
    const bottom = Math.min(view.bottom, box.bottom, element.closest("tbody") ? this.heldBounds(info).bottom : Infinity);
    return rect.bottom > top && rect.top < bottom && rect.right > box.left && rect.left < box.right;
  }
  // ---- layout: what follows scrolling ------------------------------------------
  /** Once per frame after scrolling or rendering: the sticky header, then what points at it */
  barPlaceQueued = false;
  queueStickyUpdate() {
    if (this.stickyQueued) return;
    this.stickyQueued = true;
    const run = () => {
      this.stickyQueued = false;
      if (this.stopped) return;
      this.cellEditor.placePopup();
      for (const feature of this.features) feature.layoutChanged?.();
      this.showQuietMarks();
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
  viewBounds(element) {
    const win = this.doc.defaultView;
    const widget = element.closest(WIDGET_SELECTOR);
    const overWindow = !!widget && win.getComputedStyle(widget).position === "fixed";
    const scroller = overWindow ? void 0 : this.scrollParentOf(element) ?? element.closest(SCROLLER_SELECTOR) ?? void 0;
    const rect = scroller?.getBoundingClientRect();
    const view = rect && rect.height > 0 ? rect : { left: 0, right: win.innerWidth, top: 0, bottom: win.innerHeight };
    const visual = win.visualViewport;
    const visibleBottom = visual && visual.height > 0 ? visual.offsetTop + visual.height : Infinity;
    const visibleTop = visual && visual.height > 0 ? visual.offsetTop : -Infinity;
    return { left: view.left, right: view.right, top: Math.max(view.top, visibleTop), bottom: Math.min(view.bottom, visibleBottom) };
  }
  onKeyDown = (e) => {
    if (e.target instanceof Node && this.dialogs.contains(e.target)) return;
    if (this.settingsDialog?.isOpen && e.target instanceof Node && this.settingsDialog.contains(e.target)) return;
    this.dropAnchor();
    if (e.target instanceof HTMLInputElement && e.target.closest(".tp-menu")) return;
    if (e.key === "Escape" && this.tableMenu) {
      e.preventDefault();
      e.stopPropagation();
      this.closeTableMenu(true);
      return;
    }
    if (e.key !== "Escape" && e.target instanceof Element && e.target.closest(".tp-menu")) return;
    if (this.cellMenuKey(e)) return;
    for (const feature of this.features) if (feature.keyDown?.(e)) return;
  };
  onKeyUp = (e) => {
    if (e.key === "Control") this.cellEditor.setNavigating(false);
  };
  // Over the band around the table where a + inserts: as over the table, its controls stay
  inInsertBand = false;
  // Where a hovering pointer was last, and the table a + inserted into, to show the + again once it is rendered anew
  lastPointer;
  insertedIn;
  // The ⋯ menu of the toolbar shown last, for a feature to open (TableHost.openTableMenu)
  openMore;
  // The pointer left the window: the + goes (no move tells it so)
  onPointerOut = (e) => {
    if (e.relatedTarget !== null) return;
    this.lastPointer = void 0;
    this.inInsertBand = this.hideInsert();
  };
  /**
   * While Ctrl is held in a cell editor the pointer shows the move cursor over
   * a table: on the cell under it only (the table where it is between cells),
   * moved with it. A class on an ancestor of every cell (body) made the browser
   * recalculate the whole page's style on every press and release of Ctrl.
   */
  markNavigating() {
    const pointer = this.lastPointer;
    const under = this.navigating && pointer ? this.doc.elementFromPoint?.(pointer.clientX, pointer.clientY) : null;
    const table = `${WIDGET_SELECTOR}.tp-table`;
    const target = under?.closest(`${table} td, ${table} th`) ?? under?.closest(table) ?? void 0;
    if (target === this.navigatingAt) return;
    this.navigatingAt?.classList.remove(NAVIGATING_CLASS);
    target?.classList.add(NAVIGATING_CLASS);
    this.navigatingAt = target;
  }
  onPointerMove = (e) => {
    this.lastPointer = { pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY };
    if (this.navigating) this.markNavigating();
    const busy = this.features.map((f) => f.pointerBusy?.()).find(Boolean);
    this.inInsertBand = !this.tableMenu && busy !== "drag" ? this.showInsert(e, !busy) : this.hideInsert();
  };
  onMouseMove = (e) => {
    const busy = this.features.map((f) => f.pointerBusy?.()).find(Boolean);
    if (this.tableMenu || busy === "drag" || e.buttons !== 0) return;
    const target = e.target;
    if (target instanceof Node && this.isFloating(target) || this.inInsertBand) {
      this.cancelHide();
      return;
    }
    const hit = this.enhancedWidgetOf(target);
    if (!hit) {
      if (!busy && !this.overScrollbar(e)) this.scheduleHide();
      return;
    }
    const [widget, info] = hit;
    this.cancelHide();
    if (this.hoverWidget !== widget) {
      if (busy) return;
      this.hoverWidget = widget;
      this.showTableControls(widget, info);
    }
    if (this.cellEditor.active) return;
    const cell = this.tableCellOf(info, target);
    if (cell && cell !== this.hoverCell) {
      this.hoverCell = cell;
      this.cellHovered(widget, info, cell);
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
    const placed = this.shownOrder.get(info.table);
    if (placed) return [...placed];
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
    const tr = ref.row === 0 ? info.table.rows[0] : this.bodyRows(info)[ref.row - 1];
    if (!tr || tr.classList.contains("tp-hidden") && !includeHidden) return void 0;
    return tr.cells[ref.column];
  }
  focusEditor(widget) {
    if (this.touchKeyboard.letGoOfFocus()) return;
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
      for (const feature of this.features) await feature.prepareWrite?.(info);
      const text = await this.bridge.getText();
      this.pageText = text;
      const range = locateBySource(text, info.hint, info.source);
      const held = range ? this.features.flatMap((f) => f.pendingEdits?.(info) ?? []) : [];
      const before = range && held.reduce((table, pending) => pending.apply(table), parseTable(range.text));
      const edited = before && change(before);
      if (!range || !before || !edited) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      const page = { text, tables: pageTablesOf(text), from: range.from };
      for (const feature of this.features) await feature.prepareEdit?.(edited, page);
      const edit = { ...options, page };
      let changed = edited;
      for (const feature of this.features) if (feature.writeStep) changed = feature.writeStep(before, changed, edit);
      changed = this.writeSteps.reduce((table, step) => step(before, table, options), changed);
      const format = await this.setting("autoFormat");
      const serialize = (t) => serializeTable(format ? { ...t, padded: true } : t);
      const markdown = serialize(changed);
      if (markdown === range.text) {
        for (const pending of held) pending.written();
        return "unchanged";
      }
      const updates = [{ range, markdown }];
      for (const feature of this.features) {
        for (const other of feature.otherTablesWritten?.(before, changed, edit) ?? []) {
          updates.push({ range: other.range, markdown: serialize(other.table) });
        }
      }
      if (columnMap) {
        this.views.set(info.key, remapColumns(this.viewOf(info), columnMap));
        for (const feature of this.features) feature.columnsMoved?.(info.key, columnMap);
      }
      if (focus) this.cellEditor.editAfterWrite(info.key, focus);
      this.holdAfterWrite(info.key, options);
      this.scrollLefts.set(info.key, widget.scrollLeft);
      this.scrollTops.set(info.key, widget.scrollTop);
      let written = text;
      for (const update of [...updates].sort((a, b) => b.range.from - a.range.from)) {
        written = written.slice(0, update.range.from) + update.markdown + written.slice(update.range.to);
      }
      const replace = minimalEdit(text, written);
      const spanFrom = Math.min(...updates.map((update) => update.range.from));
      const spanTo = Math.max(...updates.map((update) => update.range.to));
      const after = [];
      for (const feature of this.features) {
        const then = await feature.beforeWrite?.(text, spanFrom, spanTo, replace);
        if (then) after.push(then);
      }
      this.anchorAt(widget, info.key);
      await this.bridge.replaceRange(replace.from, replace.to, replace.insert);
      this.pageText = written;
      for (const pending of held) pending.written();
      for (const then of after) then(replace.from, written.length - text.length);
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
  // ---- inserting rows and columns: a + on a border --------------------------
  /**
   * A pointer that hovers (a mouse, a pen) near a border of the table shown:
   * on a border between rows (or under the last), left of the table, or between
   * columns (or right of the last), above the header, a + inserts one there.
   * A finger does not hover: it inserts from the row and column menus.
   * Whether the pointer is in that band around the table.
   */
  // `mark` false (a menu open): the grips follow the pointer along the edges, no + is shown
  showInsert(e, mark = true) {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (e.pointerType === "touch" || e.buttons !== 0 || !widget || !info || renderedTable(widget) !== info.table) return this.hideInsert();
    if (e.target instanceof Node && this.insertMark.contains(e.target)) return true;
    if (e.target instanceof Node && this.isFloating(e.target)) return this.hideInsert();
    const shown = this.shownRect(widget, info);
    const header = info.table.rows[0].getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x >= shown.left - INSERT_LANE_BAND && x <= shown.left + 2 && y >= header.top && y <= shown.bottom + INSERT_LANE_PAST) {
      const held = this.heldBounds(info);
      const body = (tr) => tr.parentElement?.tagName === "TBODY";
      const span = (tr) => {
        const r = tr.getBoundingClientRect();
        return body(tr) ? { top: Math.max(r.top, held.top), bottom: Math.min(r.bottom, held.bottom), edge: r.bottom } : { top: r.top, bottom: r.bottom, edge: r.bottom };
      };
      const rows = this.shownRows(info).filter((tr) => span(tr).bottom > span(tr).top + 1);
      const beside = rows.find((tr, i) => i > 0 && y >= span(tr).top && y < span(tr).bottom);
      if (beside) this.hoverAt(widget, info, beside.cells[this.hoverCell?.cellIndex ?? 0] ?? beside.cells[0]);
      const edges = rows.map((tr, i) => ({ edge: span(tr).edge, i })).filter(({ edge, i }) => !body(rows[i]) || edge >= held.top - 1 && edge <= held.bottom + 1);
      if (mark && x <= shown.left - INSERT_LANE_FROM && edges.length) {
        const { edge, i } = edges.reduce((best, e2) => Math.abs(y - e2.edge) < Math.abs(y - best.edge) ? e2 : best);
        const next = rows[i + 1];
        const below = next && Number(next.dataset.tpRow);
        const above = i > 0 ? Number(rows[i].dataset.tpRow) : void 0;
        const at = below !== void 0 && below > 0 ? below : appendRowAt(info.pins, info.rows);
        const beside2 = below !== void 0 && below > 0 ? { before: below } : above !== void 0 ? { after: above } : {};
        this.markInsert(widget, info, { key: info.key, axis: "row", at, beside: beside2 }, edge, shown);
        return true;
      }
      return this.hideInsert(true);
    }
    if (y >= header.top - INSERT_LANE_BAND && y <= header.top + 2 && x >= shown.left - INSERT_REACH && x <= shown.right + INSERT_LANE_PAST) {
      const cells = Array.from(info.table.rows[0].cells);
      const pinned = (c) => c.classList.contains("tp-pin-left") || c.classList.contains("tp-pin-right");
      const under = cells.filter((c) => x >= c.getBoundingClientRect().left && x < c.getBoundingClientRect().right);
      const column = (under.find(pinned) ?? under[0])?.cellIndex ?? -1;
      const row = this.hoverCell?.parentElement ?? info.table.rows[0];
      if (column >= 0 && row.closest("table") === info.table) this.hoverAt(widget, info, row.cells[column]);
      const held = this.heldBounds(info);
      const edges = cells.flatMap((c, i) => {
        const r = c.getBoundingClientRect();
        return [
          { edge: r.left, i, pinned: pinned(c) },
          { edge: r.right, i: i + 1, pinned: pinned(c) }
        ];
      }).filter(({ edge, pinned: pinned2 }) => (pinned2 || edge >= held.left - 1 && edge <= held.right + 1) && edge >= shown.left - INSERT_REACH && edge <= shown.right + INSERT_REACH);
      if (mark && y <= header.top - INSERT_LANE_FROM && edges.length) {
        const { edge, i } = edges.reduce((best, e2) => Math.abs(x - e2.edge) < Math.abs(x - best.edge) ? e2 : best);
        const at = i < cells.length ? i : appendColumnAt(info.pins, info.columns);
        this.markInsert(widget, info, { key: info.key, axis: "column", at, beside: {} }, edge, shown);
        return true;
      }
      return this.hideInsert(true);
    }
    return this.hideInsert();
  }
  /** As if the pointer were over this cell: the grips go to its row and column */
  hoverAt(widget, info, cell) {
    if (!cell || cell === this.hoverCell || this.cellEditor.active) return;
    this.hoverCell = cell;
    this.cellHovered(widget, info, cell);
  }
  markInsert(_widget, info, at, edge, shown) {
    this.insertAt = at;
    const mark = this.insertMark;
    mark.title = at.axis === "row" ? "Insert a row here" : "Insert a column here";
    mark.setAttribute("aria-label", mark.title);
    mark.classList.add("tp-visible");
    this.placeInsert(mark, info, at.axis, edge, shown);
    this.showQuietMarks();
  }
  /**
   * A + and the line it inserts at: a row's left of the row grips, the line
   * across the table; a column's above the column grips, the line down the
   * table
   */
  placeInsert(mark, info, axis, edge, shown, withLine = true) {
    const line = this.insertLine;
    if (withLine) line.classList.add("tp-visible");
    if (axis === "row") {
      const center = shown.left - INSERT_LANE_AT;
      if (withLine) Object.assign(line.style, { left: `${center}px`, top: `${edge - 1}px`, width: `${shown.right - center}px`, height: "2px" });
      this.place(mark, center - mark.offsetWidth / 2, edge - mark.offsetHeight / 2);
    } else {
      const center = info.table.rows[0].getBoundingClientRect().top - INSERT_LANE_AT;
      if (withLine) Object.assign(line.style, { left: `${edge - 1}px`, top: `${center}px`, width: "2px", height: `${shown.bottom - center}px` });
      this.place(mark, edge - mark.offsetWidth / 2, center - mark.offsetHeight / 2);
    }
  }
  /**
   * The + the pointer brought up goes (the quiet ones come back); `inBand`:
   * the pointer is still in the band around the table (the table's controls
   * stay)
   */
  hideInsert(inBand = false) {
    this.insertAt = void 0;
    this.insertMark.classList.remove("tp-visible");
    this.insertLine.classList.remove("tp-visible");
    this.showQuietMarks();
    return inBand;
  }
  /** A cell is hovered or edited (or the page moved under it): the features follow it; the quiet + of a last row or column */
  cellHovered(widget, info, cell) {
    for (const feature of this.features) feature.cellHovered?.(widget, info, cell);
    this.showQuietMarks();
  }
  selectionChanged() {
    this.showQuietMarks();
    for (const feature of this.features) feature.selectionChanged?.();
  }
  /**
   * The table whose last row or column has the cell edited, the cell hovered
   * or a selected cell (in this order), and which of the two
   */
  quietTarget() {
    const editing = this.cellEditor.active?.cell;
    const hovered = this.hoverCell?.isConnected ? this.hoverCell : void 0;
    const selected = Array.from(this.doc.querySelectorAll(".tp-selected"));
    const first = editing ?? hovered ?? selected[0];
    const hit = first && this.enhancedWidgetOf(first);
    if (!hit) return void 0;
    const [widget, info] = hit;
    const rows = this.shownRows(info);
    const lastRow = rows.length > 1 ? rows[rows.length - 1] : void 0;
    const lastColumn = info.table.rows[0].cells.length - 1;
    const cells = [editing, hovered, ...selected].filter((cell) => cell?.closest("table") === info.table);
    const row = cells.some((cell) => cell.parentElement === lastRow);
    const column = cells.some((cell) => cell.cellIndex === lastColumn);
    return row || column ? { widget, info, row, column } : void 0;
  }
  /** Where a row (column) is added at the end: its edge, and the insert there */
  endOf(widget, info, axis) {
    const shown = this.shownRect(widget, info);
    if (axis === "row") {
      const rows = this.shownRows(info);
      const last = rows[rows.length - 1];
      const at2 = { key: info.key, axis, at: appendRowAt(info.pins, info.rows), beside: { after: Number(last.dataset.tpRow) } };
      return { at: at2, edge: last.getBoundingClientRect().bottom, shown };
    }
    const cells = info.table.rows[0].cells;
    const at = { key: info.key, axis, at: appendColumnAt(info.pins, info.columns), beside: {} };
    return { at, edge: cells[cells.length - 1].getBoundingClientRect().right, shown };
  }
  /** The quiet + of the last row and column (quietTarget), but on an axis where the pointer brought up a +, or out of view */
  showQuietMarks() {
    const target = this.quietTarget();
    for (const axis of ["row", "column"]) {
      const mark = this.quietMarks[axis];
      if (!target || !target[axis] || this.insertAt?.axis === axis) {
        mark.classList.remove("tp-visible");
        continue;
      }
      const { widget, info } = target;
      const end = this.endOf(widget, info, axis);
      const view = this.viewBounds(widget);
      const y = axis === "row" ? end.edge : info.table.rows[0].getBoundingClientRect().top - INSERT_LANE_AT;
      const held = this.heldBounds(info);
      const inView = y >= view.top && y <= view.bottom && (axis === "row" ? end.edge >= held.top - 1 : end.edge <= end.shown.right + INSERT_REACH);
      if (!inView) {
        mark.classList.remove("tp-visible");
        continue;
      }
      mark.classList.add("tp-visible");
      this.placeInsert(mark, info, axis, end.edge, end.shown, false);
    }
    if (this.insertAt) return;
    const hovered = this.quietHovered;
    if (hovered && this.quietMarks[hovered].classList.contains("tp-visible")) this.lineAtEnd(hovered);
    else this.insertLine.classList.remove("tp-visible");
  }
  /** The pointer on a quiet +: the line where it adds */
  lineAtEnd(axis) {
    const target = this.quietTarget();
    if (!target || this.insertAt) return;
    const end = this.endOf(target.widget, target.info, axis);
    this.placeInsert(this.quietMarks[axis], target.info, axis, end.edge, end.shown);
  }
  /** A quiet + pressed: a row (column) added at the end, its first cell (name) edited */
  insertAtEnd(axis) {
    const target = this.quietTarget();
    if (!target) return;
    const { widget, info } = target;
    const { at } = this.endOf(widget, info, axis);
    this.insertedIn = info.key;
    if (axis === "row") void insertRowWith(this, widget, info, at.at, this.firstVisibleColumn(widget, info), void 0, at.beside);
    else void insertColumnWith(this, widget, info, at.at);
  }
  /** The + clicked: a row (column) inserted there, its first cell (name) edited */
  insertHere() {
    const at = this.insertAt;
    const widget = at && this.widgetForKey(at.key);
    const info = widget && this.infos.get(widget);
    if (!at || !widget || !info) return;
    this.insertedIn = at.key;
    if (at.axis === "row") void insertRowWith(this, widget, info, at.at, this.firstVisibleColumn(widget, info), void 0, at.beside);
    else void insertColumnWith(this, widget, info, at.at);
  }
  /** A table rendered anew after a + inserted into it: the + where the pointer still is */
  reshowInsert(widget, info) {
    if (this.insertedIn !== info.key || !this.lastPointer) return;
    this.insertedIn = void 0;
    this.hoverWidget = widget;
    this.insertUnderPointer();
  }
  /** The + where the pointer is now, as a move there would show it */
  insertUnderPointer() {
    const pointer = this.lastPointer;
    const busy = this.features.map((f) => f.pointerBusy?.()).find(Boolean);
    if (!pointer || this.tableMenu || busy === "drag") {
      this.inInsertBand = this.hideInsert();
      return;
    }
    const target = this.doc.elementFromPoint?.(pointer.clientX, pointer.clientY) ?? null;
    this.inInsertBand = this.showInsert({ ...pointer, buttons: 0, target }, !busy);
  }
  /** The leftmost column in view, so editing a new row does not scroll a wide table back */
  firstVisibleColumn(widget, info) {
    const left = widget.getBoundingClientRect().left;
    const cells = Array.from(info.table.rows[0].cells);
    const index = cells.findIndex((cell) => cell.getBoundingClientRect().left >= left - 1);
    return Math.max(0, index);
  }
  // ---- floating UI: the toolbar ----------------------------------------------
  floating(tag, className) {
    const element = this.doc.createElement(tag);
    element.className = `tp-floating ${className}`;
    element.addEventListener("mousedown", (e) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
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
  openDialog(options) {
    return this.dialogs.open(options);
  }
  isFloating(node) {
    return [this.bar, this.insertMark, this.insertLine, ...Object.values(this.quietMarks)].some((el) => el.contains(node)) || this.cellEditor.owns(node) || this.dialogs.contains(node) || !!this.tableMenu?.element.contains(node) || this.features.some((f) => f.owns?.(node));
  }
  place(element, left, top) {
    const win = this.doc.defaultView;
    element.style.left = "0px";
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
    this.showQuietMarks();
    for (const feature of this.features) feature.hoverEnded?.(closeMenus);
  }
  hideFloating(closeMenus = false) {
    this.endHover(closeMenus);
    this.closeTableMenu(false);
    for (const el of [this.bar, this.insertMark, this.insertLine]) el.classList.remove("tp-visible");
    this.insertAt = void 0;
    this.hoverWidget = void 0;
    this.showQuietMarks();
  }
  /**
   * The toolbar above the table and the add-row / add-column buttons; placed
   * now, or (`placeNow` false: after a change of the table) in the next frame
   */
  showTableControls(widget, info, placeNow = true) {
    const view = this.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    const button = (item, className) => {
      const b = this.doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.title = item.title;
      if (className) b.className = className;
      if (item.place === "icon" && item.icon) {
        b.classList.add("tp-bar-icon");
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
      return b;
    };
    const featureButtons = this.features.flatMap((feature) => feature.toolbarButtons?.(widget, info) ?? []);
    for (const item of featureButtons.filter((b) => b.place === "label")) button(item, "tp-bar-label");
    const chips = [];
    if (view.sort) {
      const { column, direction } = view.sort;
      const name = cellText(info.table.rows[0].cells[column]) || `column ${column + 1}`;
      chips.push({
        label: `Sorted by ${name} ${direction === "asc" ? "\u2191" : "\u2193"}`,
        title: "Clear sorting: show the rows as written",
        place: "chip",
        run: () => {
          const [w, i] = this.current(widget, info);
          this.setSort(w, i, withoutSort(this.viewOf(i)));
        },
        // Apply: the rows are sorted in the markdown, and the sorting view ends
        actions: [{ icon: ICONS.applySort, title: "Sort the rows in the markdown this way", run: () => void this.applySort(widget, info) }]
      });
    }
    for (const item of [...chips, ...featureButtons.filter((b) => b.place === "chip")]) {
      const chip = this.doc.createElement("span");
      chip.className = "tp-status tp-chip";
      if (item.icon) chip.innerHTML = item.icon;
      chip.append(item.label);
      const small = (className, title, icon, run) => {
        const b = this.doc.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.className = className;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.innerHTML = icon;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          run();
        });
        return b;
      };
      for (const action of item.actions ?? []) chip.append(small("tp-chip-apply", action.title, action.icon, action.run));
      chip.append(small("tp-chip-clear", item.title, ICONS.clear, item.run));
      bar.append(chip);
    }
    for (const item of featureButtons.filter((b) => b.place === "icon")) button(item);
    const menuItems = [
      ...featureButtons.filter((b) => (b.place ?? "menu") === "menu"),
      // Pinned rows and columns are at the edges already: unpinned, they stay where they are
      ...hasPins(info.pins) ? [
        {
          label: "Unpin all",
          title: "Unpin all rows and columns: they stay where they are, and scroll and sort with the others",
          icon: ICONS.unpin,
          run: () => {
            const [w] = this.current(widget, info);
            void this.write(w, (t) => t, { pins: NO_PINS });
          }
        }
      ] : [],
      // Aligned already, it writes nothing
      {
        label: "Format table",
        title: "Align the table's markdown: its columns padded to one width",
        icon: ICONS.format,
        run: () => {
          const [w] = this.current(widget, info);
          void this.write(w, (t) => ({ ...t, padded: true }));
        }
      },
      {
        label: "Edit markdown",
        title: "Show this table as markdown",
        icon: ICONS.markdown,
        run: () => void this.showMarkdown(this.current(widget, info)[1])
      },
      // Last before the destructive ones: not about this table
      {
        label: "Table Plus settings\u2026",
        title: "Settings for every table in the space (not just this one): SilverBullet's configuration",
        icon: ICONS.settings,
        run: () => void this.openSettings()
      }
    ];
    const more = button(
      {
        label: "More",
        title: "More for this table",
        place: "icon",
        icon: ICONS.more,
        run: () => this.tableMenu?.kind === "table" ? this.closeTableMenu(true) : this.showTableMenu(widget, more, menuItems)
      },
      "tp-bar-more"
    );
    this.openMore = { widget, open: (naming) => this.showTableMenu(widget, more, menuItems, naming) };
    if (this.tableMenu?.kind === "table") {
      more.classList.add("tp-active");
      this.tableMenu.anchor = more;
    }
    if (placeNow || !bar.classList.contains("tp-visible")) this.placeBar(widget, info);
    else this.queuePlaceBar();
  }
  /** The toolbar placed above the table's header (or over its right end), and the open table menu with it */
  placeBar(widget, info) {
    const bar = this.bar;
    const rect = widget.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    const headerRect = info.table.rows[0].getBoundingClientRect();
    const shown = this.viewBounds(widget);
    bar.classList.add("tp-visible");
    const above = headerRect.top - bar.offsetHeight - BAR_GAP;
    const held = info.table.tHead?.classList.contains("tp-stuck") ?? false;
    const fits = held || above >= shown.top + 2;
    const top = fits ? Math.max(above, shown.top) : headerRect.top + (headerRect.height - bar.offsetHeight) / 2;
    this.place(bar, Math.min(rect.right, tableRect.right, shown.right) - bar.offsetWidth - (fits ? BAR_CLEAR : 6), top);
    this.positionTableMenu();
  }
  /**
   * The toolbar's ⋯ menu: the table's actions that are not used all the time,
   * the destructive ones last, after a separator
   */
  showTableMenu(widget, anchor, items, startNamed = false) {
    const place = { kind: "table", anchor };
    const back = { icon: ICONS.arrowLeft, run: () => this.showTableMenu(widget, anchor, items) };
    const entry = (item) => ({
      kind: "item",
      label: item.label,
      icon: item.icon ?? "",
      hint: item.title,
      ...item.value ? { value: { text: item.value } } : {},
      ...item.danger ? { danger: true } : {},
      run: item.choices ? () => this.showMenu(widget, item.choices.title, item.choices.entries(), place, back) : item.run
    });
    const safe = items.filter((item) => !item.danger).map(entry);
    const danger = items.filter((item) => item.danger).map(entry);
    const info = this.infoOf(widget);
    const naming = info && this.closingNaming(this.menuNaming(widget, info, { kind: "table" }));
    const title = naming?.name ? `Table: ${naming.name}` : "Table";
    this.showMenu(widget, title, [...safe, ...safe.length && danger.length ? [{ kind: "separator" }] : [], ...danger], place, void 0, naming);
    if (startNamed && this.tableMenu) startNaming(this.tableMenu.element);
  }
  /** A menu of the toolbar or of cells: its items close it when run; Escape or a press elsewhere closes it */
  showMenu(widget, title, entries, place, back, naming) {
    this.closeTableMenu(false);
    const close = (run) => () => {
      this.closeTableMenu(false);
      run();
    };
    const closing = wrapRuns(entries, close);
    const element = renderMenu(this.doc, title, closing, back, naming);
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    keepFocus(element);
    this.doc.body.append(element);
    this.tableMenu = { element, widget, ...place };
    place.anchor?.classList.add("tp-active");
    this.positionTableMenu();
    focusMenu(element);
  }
  /** Below the ⋯ button, its right edge at the button's; at the pointer; always inside the window */
  positionTableMenu() {
    if (!this.tableMenu) return;
    const { element, anchor, point } = this.tableMenu;
    const win = this.doc.defaultView;
    const m = element.getBoundingClientRect();
    let left;
    let top;
    if (anchor) {
      const a = anchor.getBoundingClientRect();
      left = a.right - m.width;
      top = a.bottom + 4;
      if (top + m.height > win.innerHeight - 4) top = a.top - m.height - 4;
    } else {
      left = point?.x ?? 0;
      top = point?.y ?? 0;
      if (top + m.height > win.innerHeight - 4) top -= m.height;
      if (left + m.width > win.innerWidth - 4) left -= m.width;
    }
    element.style.left = `${Math.round(Math.max(4, Math.min(left, win.innerWidth - m.width - 4)))}px`;
    element.style.top = `${Math.round(Math.max(4, top))}px`;
  }
  closeTableMenu(refocus) {
    const menu = this.tableMenu;
    if (!menu) return;
    this.tableMenu = void 0;
    const hadFocus = menu.element.contains(this.doc.activeElement);
    menu.element.remove();
    menu.anchor?.classList.remove("tp-active");
    if (refocus && hadFocus) this.focusEditor(menu.widget);
  }
  // ---- the cell menu: right click, a long press, the Menu key ------------------
  /**
   * The menu of a cell, or of the cells selected when it is one of them: what
   * the features offer (Feature.cellMenuEntries), in their groups' order.
   * False when none offers anything: the browser's menu stays.
   */
  openCellMenu(widget, info, at, point) {
    const taker = this.features.find((f) => f.cellMenu?.(widget, info, at, point));
    if (taker) {
      for (const feature of this.features) if (feature !== taker) feature.cellMenuOpened?.();
      if (this.pressedWith === "touch") this.takePress();
      return true;
    }
    let cells = [at];
    for (const feature of this.features) {
      const selected = feature.selectedCells?.(info, at);
      if (selected) {
        cells = selected;
        break;
      }
    }
    const groups = this.features.flatMap((f) => [f.cellMenuEntries?.(widget, info, cells) ?? []].flat()).filter((group) => group.entries.length > 0).sort((a, b) => a.order - b.order);
    if (groups.length === 0) return false;
    const entries = groups.flatMap((group, i) => [...i ? [{ kind: "separator" }] : [], ...group.entries]);
    if (this.pressedWith === "touch") this.takePress();
    const header = cellText(info.table.rows[0].cells[at.column]) || `column ${at.column + 1}`;
    const naming = cells.length === 1 ? this.closingNaming(this.menuNaming(widget, info, at.row === 0 ? { kind: "column", column: at.column } : { kind: "cell", row: at.row, column: at.column })) : void 0;
    const title = cells.length > 1 ? `${cells.length} cells` : at.row === 0 ? naming?.name ? `Column: ${naming.name}` : `Column: ${header}` : naming?.name ? `Cell: ${naming.name}` : `Cell: ${header}, row ${at.row}`;
    for (const feature of this.features) feature.cellMenuOpened?.();
    this.showMenu(widget, title, entries, { kind: "cell", point }, void 0, naming);
    return true;
  }
  /** The cell a pointer event is on, in an enhanced table; not in the cell editor (its menu is the browser's) */
  cellOfEvent(e) {
    if (!(e.target instanceof Element) || e.target.closest(".tp-cell-editor")) return void 0;
    const hit = this.enhancedWidgetOf(e.target);
    const cell = hit && this.tableCellOf(hit[1], e.target);
    const ref = hit && cell && this.cellRef(hit[1], cell);
    return hit && ref ? [hit[0], hit[1], ref] : void 0;
  }
  /** Right click (Shift+right click: the browser's menu) */
  onContextMenu = (e) => {
    if (e.shiftKey) return;
    if (this.pressTaken()) {
      e.preventDefault();
      return;
    }
    const hit = this.cellOfEvent(e);
    if (hit && this.openCellMenu(hit[0], hit[1], hit[2], { x: e.clientX, y: e.clientY })) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  /** What pressed (pressedWith); a long press on a touch screen: the cell menu, where no right click is (iOS fires no contextmenu) */
  onPointerDown = (e) => {
    this.stopLongPress?.();
    const root = this.doc.documentElement;
    if (e.pointerType && root.dataset.tpPointer !== e.pointerType) root.dataset.tpPointer = e.pointerType;
    this.pressTakenAt = 0;
    if (e.pointerType !== "touch" || e.target instanceof Node && this.isFloating(e.target)) return;
    const hit = this.cellOfEvent(e);
    if (!hit) return;
    const win = this.doc.defaultView;
    const { clientX: x, clientY: y } = e;
    const timer = setTimeout(() => {
      stop();
      if (this.tableMenu?.kind === "cell") return;
      this.openCellMenu(hit[0], hit[1], hit[2], { x, y });
    }, LONG_PRESS_MS2);
    const move = (ev) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > 10) stop();
    };
    const stop = () => {
      clearTimeout(timer);
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", stop, true);
      win.removeEventListener("pointercancel", stop, true);
      this.stopLongPress = void 0;
    };
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", stop, true);
    win.addEventListener("pointercancel", stop, true);
    this.stopLongPress = stop;
  };
  /** The Menu key or Shift+F10 in a cell editor: the menu of the edited cell (or of the cells selected) */
  cellMenuKey(e) {
    if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return false;
    const editing = this.cellEditor.active;
    const info = editing && this.infos.get(editing.widget);
    if (!editing || !info) return false;
    const rect = editing.cell.getBoundingClientRect();
    if (!this.openCellMenu(editing.widget, info, { row: editing.row, column: editing.column }, { x: rect.left, y: rect.bottom })) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  /** Where a table is in view: the table, cut to the box that scrolls it sideways */
  /**
   * Where the body shows between what is held over it as the page and the
   * table scroll: below the header (with the rows pinned to the top), above
   * the rows pinned to the bottom, between the columns pinned left and right.
   * What scrolls under those is out of view.
   */
  heldBounds(info) {
    const { tHead: head, tFoot: foot } = info.table;
    const header = Array.from(info.table.rows[0].cells);
    const lefts = header.filter((c) => c.classList.contains("tp-pin-left")).map((c) => c.getBoundingClientRect().right);
    const rights = header.filter((c) => c.classList.contains("tp-pin-right")).map((c) => c.getBoundingClientRect().left);
    return {
      top: head ? head.getBoundingClientRect().bottom : -Infinity,
      bottom: foot?.rows.length ? foot.getBoundingClientRect().top : Infinity,
      left: lefts.length ? Math.max(...lefts) : -Infinity,
      right: rights.length ? Math.min(...rights) : Infinity
    };
  }
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

// table-plus/src/columntypes/custom.ts
var HELPERS2 = { numberOf, notANumber, formatNumber: formatNumber2, numberFormat, dateTimeFormat, parseDate, lineIcon };
var NAME_RE3 = /^[a-z][a-z0-9_]*$/i;
function customTypes(definitions) {
  let list = definitions;
  if (isObject2(list) && !Array.isArray(list) && "default" in list) list = list.default;
  if (typeof list === "function") {
    try {
      list = list(HELPERS2);
    } catch (e) {
      return { types: [], problems: [`the definitions failed: ${message2(e)}`] };
    }
  }
  if (!Array.isArray(list)) return { types: [], problems: ["the definitions are not a list of types (or a function returning one)"] };
  const types = [];
  const problems = [];
  list.forEach((definition, i) => {
    const type = customType(definition);
    if (typeof type === "string") problems.push(`type ${i + 1}: ${type}`);
    else types.push(type);
  });
  return { types, problems };
}
function customType(definition) {
  if (!isObject2(definition)) return "not an object";
  const { name, syntax, description, icon, params = {}, aliases = {}, check, format, sortValue, choices } = definition;
  if (typeof name !== "string" || !NAME_RE3.test(name)) return `its name ${JSON.stringify(name)} is not letters, digits and _ starting with a letter`;
  const lower = name.toLowerCase();
  const tag = `#${lower}`;
  if (syntax !== void 0 && typeof syntax !== "string") return `${tag}: its syntax is not text`;
  if (description !== void 0 && typeof description !== "string") return `${tag}: its description is not text`;
  if (icon !== void 0 && (typeof icon !== "string" || !icon.trim().startsWith("<svg"))) return `${tag}: its icon is not an SVG (lineIcon draws one)`;
  for (const [key2, method] of Object.entries({ check, format, sortValue, choices })) {
    if (method !== void 0 && typeof method !== "function") return `${tag}: ${key2} is not a function`;
  }
  const specs = specsOf(params);
  if (typeof specs === "string") return `${tag}: ${specs}`;
  if (!isObject2(aliases) || Array.isArray(aliases)) return `${tag}: its aliases are not an object`;
  for (const [alias, written] of Object.entries(aliases)) {
    if (!NAME_RE3.test(alias)) return `${tag}: the alias ${alias} is not letters, digits and _`;
    if (typeof written !== "string" || !readParams(specs, written || void 0)) return `${tag}: the alias ${alias} stands for parameters ${JSON.stringify(written)} the type does not take`;
  }
  const call2 = (method, result) => {
    if (isObject2(result) && typeof result.then === "function") throw new Error(`${method} returned a promise: a type gives its result at once`);
    return result;
  };
  return {
    name: lower,
    syntax: syntax ?? tag,
    description: description ?? "",
    ...icon === void 0 ? {} : { icon },
    params: specs,
    aliases: Object.fromEntries(Object.entries(aliases).map(([alias, written]) => [alias.toLowerCase(), written])),
    check: (text, p) => {
      if (!check) return void 0;
      const why = call2("check", check(text, p));
      if (why === void 0 || why === null || why === "") return void 0;
      if (typeof why !== "string") throw new Error(`check returned ${kindOf2(why)}: it gives why a value is not one of the type (text), or nothing`);
      return why;
    },
    format: (text, p, locale) => {
      if (!format) return text;
      const shown = call2("format", format(text, p, locale));
      if (typeof shown === "string") return shown;
      if (typeof shown === "number") return String(shown);
      if (isObject2(shown) && typeof shown.text === "string" && typeof shown.href === "string") return { text: shown.text, href: shown.href };
      throw new Error(`format returned ${kindOf2(shown)}: it gives a text, or a link { text, href }`);
    },
    ...sortValue ? {
      sortValue: (text, p) => {
        const value = call2("sortValue", sortValue(text, p));
        if (typeof value === "string" || typeof value === "number") return String(value);
        throw new Error(`sortValue returned ${kindOf2(value)}: it gives a text or a number`);
      }
    } : {},
    ...choices ? {
      choices: (p) => {
        const list = call2("choices", choices(p));
        if (!Array.isArray(list)) throw new Error(`choices returned ${kindOf2(list)}: it gives a list`);
        return list.map((choice) => {
          if (typeof choice === "string") return { value: choice, label: choice };
          if (isObject2(choice) && typeof choice.value === "string") return { value: choice.value, label: typeof choice.label === "string" ? choice.label : choice.value };
          throw new Error(`choices gave ${kindOf2(choice)}: a choice is a text or { value, label }`);
        });
      }
    } : {}
  };
}
function specsOf(params) {
  if (!isObject2(params) || Array.isArray(params)) return "its params are not an object";
  const names = Object.keys(params);
  const specs = {};
  for (const [i, name] of names.entries()) {
    const spec = specOf(params[name], i === names.length - 1);
    if (typeof spec === "string") return `the parameter ${name}: ${spec}`;
    specs[name] = spec;
  }
  return specs;
}
function specOf(spec, last) {
  if (!isObject2(spec)) return "not an object";
  switch (spec.kind) {
    case "number": {
      const { integer, min, max, default: d } = spec;
      for (const [key2, value] of Object.entries({ min, max, default: d })) {
        if (value !== void 0 && (typeof value !== "number" || Number.isNaN(value))) return `${key2} is not a number`;
      }
      if (integer !== void 0 && typeof integer !== "boolean") return "integer is not true or false";
      const lowest = min ?? -Infinity;
      const highest = max ?? Infinity;
      if (lowest > highest) return "its min is above its max";
      if (typeof d === "number" && (integer && !Number.isInteger(d) || d < lowest || d > highest)) return "its default is not one it takes";
      return spec;
    }
    case "choice": {
      const { values, default: d } = spec;
      if (!Array.isArray(values) || values.length === 0 || !values.every((v) => typeof v === "string" && v !== "")) return "its values are not a list of words";
      if (!last && values.some((v) => v.includes("-"))) return "a value has a dash, which only the last parameter's may";
      if (d !== void 0 && !values.includes(d)) return "its default is not one of its values";
      return spec;
    }
    case "text": {
      const { pattern, default: d } = spec;
      if (pattern !== void 0 && !(pattern instanceof RegExp)) return "its pattern is not a regular expression";
      const own = pattern && new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
      if (d !== void 0 && (typeof d !== "string" || d === "" || own && !own.test(d))) return "its default is not one it takes";
      return { kind: "text", ...own ? { pattern: own } : {}, ...d === void 0 ? {} : { default: d } };
    }
    default:
      return `its kind is not "number", "choice" or "text"`;
  }
}
function kindOf2(value) {
  return value === null ? "null" : Array.isArray(value) ? "a list" : typeof value === "object" ? "an object" : `a ${typeof value}`;
}
function isObject2(value) {
  return typeof value === "object" && value !== null;
}
function message2(e) {
  return e instanceof Error ? e.message : String(e);
}

// table-plus/src/formulas/custom.ts
var HELPERS3 = {
  FormulaError,
  TimeValue,
  isError,
  isRange,
  firstError,
  single,
  flatten,
  numbers,
  toNumber,
  toText,
  toBoolean,
  toDate,
  formatDate,
  parseDate
};
var NAME_RE4 = /^[A-Za-z][A-Za-z0-9_.]*$/;
function customFunctions(definitions) {
  let list = definitions;
  if (isObject3(list) && !Array.isArray(list) && "default" in list) list = list.default;
  if (typeof list === "function") {
    try {
      list = list(HELPERS3);
    } catch (e) {
      return { functions: [], problems: [`the definitions failed: ${message3(e)}`] };
    }
  }
  if (!Array.isArray(list)) return { functions: [], problems: ["the definitions are not a list of functions (or a function returning one)"] };
  const functions = [];
  const problems = [];
  list.forEach((definition, i) => {
    const f = customFunction(definition);
    if (typeof f === "string") problems.push(`function ${i + 1}: ${f}`);
    else functions.push(f);
  });
  return { functions, problems };
}
function customFunction(definition) {
  if (!isObject3(definition)) return "not an object";
  const { name, syntax, description, category, example, minArgs = 0, maxArgs, call: call2 } = definition;
  if (typeof name !== "string" || !NAME_RE4.test(name)) return `its name ${JSON.stringify(name)} is not letters, digits, _ and . starting with a letter`;
  const upper = name.toUpperCase();
  if (CELL_RE.test(name) || upper === "TRUE" || upper === "FALSE") return `its name ${name} reads as ${upper === "TRUE" || upper === "FALSE" ? "a value" : "a cell"} in formulas`;
  if (typeof call2 !== "function") return `${upper} has no call function`;
  if (syntax !== void 0 && typeof syntax !== "string") return `${upper}: its syntax is not text`;
  if (description !== void 0 && typeof description !== "string") return `${upper}: its description is not text`;
  if (category !== void 0 && !(typeof category === "string" && category in FUNCTION_CATEGORIES)) {
    return `${upper}: its category is not one of ${Object.keys(FUNCTION_CATEGORIES).join(", ")} (none: Custom)`;
  }
  if (example !== void 0 && typeof example !== "string") return `${upper}: its example is not text`;
  if (!isCount(minArgs)) return `${upper}: minArgs is not a whole number of 0 or more`;
  if (maxArgs !== void 0 && (!isCount(maxArgs) || maxArgs < minArgs)) return `${upper}: maxArgs is not a whole number of minArgs or more`;
  return {
    name: upper,
    syntax: syntax ?? `${upper}(\u2026)`,
    description: description ?? "",
    ...category === void 0 ? {} : { category },
    ...example === void 0 ? {} : { example },
    minArgs,
    ...maxArgs === void 0 ? {} : { maxArgs },
    call: (args, context) => {
      let result;
      try {
        result = call2(args, context);
      } catch (e) {
        result = e instanceof FormulaError ? e : new FormulaError("#VALUE!", `${upper} failed: ${message3(e)}`);
      }
      return resultOf(upper, result);
    }
  };
}
function resultOf(name, result) {
  if (result === void 0 || result === null) return null;
  if (typeof result === "number" || typeof result === "string" || typeof result === "boolean") return result;
  if (result instanceof FormulaError) {
    return ERROR_CODES.includes(result.code) ? result : new FormulaError("#VALUE!", `${name} gave the error ${String(result.code)}, which is none of ${ERROR_CODES.join(" ")}`);
  }
  if (result instanceof TimeValue) return result;
  if (isObject3(result) && typeof result.then === "function") {
    return new FormulaError("#VALUE!", `${name} returned a promise: a function gives its result at once (it cannot wait for anything)`);
  }
  return new FormulaError("#VALUE!", `${name} returned ${Array.isArray(result) ? "a list" : "an object"}: a function gives one value (a number, a text, TRUE or FALSE)`);
}
function isObject3(value) {
  return typeof value === "object" && value !== null;
}
function isCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function message3(e) {
  return e instanceof Error ? e.message : String(e);
}

// table-plus/src/index.ts
var version = "0.1.0";
var GLOBAL_KEY = "__tablePlus";
function pageIndexed(name) {
  const controller = globalThis[GLOBAL_KEY];
  void controller?.pageIndexed(name);
}
function pageLoaded() {
  const controller = globalThis[GLOBAL_KEY];
  void controller?.pageLoaded();
}
function openSettings() {
  const controller = globalThis[GLOBAL_KEY];
  void controller?.openSettings();
}
function removeAllMetadata() {
  const controller = globalThis[GLOBAL_KEY];
  void controller?.removeAllMetadata();
}
function defineFunctions(definitions) {
  const { functions, problems } = customFunctions(definitions);
  defineCustomFunctions(functions);
  definitionsChanged();
  return problems.length ? `Table Plus: custom functions not defined: ${problems.join("; ")}` : void 0;
}
function defineTypes(definitions) {
  const { types, problems } = customTypes(definitions);
  defineCustomTypes(types);
  definitionsChanged();
  return problems.length ? `Table Plus: custom column types not defined: ${problems.join("; ")}` : void 0;
}
function defineSeries(definitions) {
  const { series, problems } = customSeries(definitions);
  defineCustomSeries(series);
  return problems.length ? `Table Plus: custom series not defined: ${problems.join("; ")}` : void 0;
}
function resetDefinitions() {
  customFunctionsAnew();
  customTypesAnew();
  customSeriesAnew();
}
var checkQueued = false;
function definitionsChanged() {
  if (checkQueued) return;
  checkQueued = true;
  setTimeout(() => {
    checkQueued = false;
    const controller = globalThis[GLOBAL_KEY];
    controller?.tablesChanged();
  });
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
  defineFunctions,
  defineSeries,
  defineTypes,
  init,
  openSettings,
  pageIndexed,
  pageLoaded,
  removeAllMetadata,
  resetDefinitions,
  version
};
