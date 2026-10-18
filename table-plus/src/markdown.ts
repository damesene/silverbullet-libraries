// Markdown table model: parse a GFM table from page text and write it back.
// Rows that were not changed are written back byte for byte.

export type Align = "" | "left" | "center" | "right";

export type Row = {
  readonly cells: readonly string[];
  // The original line and its cells, so an untouched row keeps its exact source
  readonly source?: string;
  readonly sourceCells?: readonly string[];
};

export type Table = {
  readonly indent: string;
  readonly align: readonly Align[];
  // rows[0] is the header row
  readonly rows: readonly Row[];
  // Pipes aligned into columns in the source: rewritten tables stay aligned
  readonly padded: boolean;
  readonly delimiterSource?: string;
  readonly alignSource?: readonly Align[];
};

export type TableRange = {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  // Index of the table among all tables of the page
  readonly ordinal: number;
};

const DELIMITER_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function splitRow(line: string): string[] {
  return cellRanges(line).map((r) => line.slice(r.from, r.to));
}

/** Where each cell's trimmed content lies in a table row line */
export function cellRanges(line: string): { from: number; to: number }[] {
  let start = 0;
  let end = line.length;
  while (start < end && /\s/.test(line[start]!)) start++;
  while (end > start && /\s/.test(line[end - 1]!)) end--;
  if (line[start] === "|") start++;
  if (end > start && line[end - 1] === "|" && !isEscaped(line, end - 1)) end--;
  const ranges: { from: number; to: number }[] = [];
  const push = (from: number, to: number) => {
    while (from < to && /\s/.test(line[from]!)) from++;
    while (to > from && /\s/.test(line[to - 1]!)) to--;
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

/**
 * Offset in a table's markdown of a cell's content, plus `within` characters
 * into it (clamped to the cell). A missing cell gives the end of its row.
 */
export function cellSourceOffset(
  tableText: string,
  row: number,
  column: number,
  within = 0,
): number {
  const lines = tableText.split("\n");
  const index = Math.min(row === 0 ? 0 : row + 1, lines.length - 1);
  let offset = 0;
  for (let i = 0; i < index; i++) offset += lines[i]!.length + 1;
  const line = (lines[index] ?? "").replace(/\r$/, "");
  const range = cellRanges(line)[column];
  if (!range) return offset + line.length;
  return offset + range.from + Math.max(0, Math.min(within, range.to - range.from));
}

function isEscaped(s: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && s[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

function hasUnescapedPipe(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") {
      i++;
      continue;
    }
    if (line[i] === "|") return true;
  }
  return false;
}

export function isDelimiterRow(line: string): boolean {
  return DELIMITER_RE.test(line);
}

export function alignOf(delimiterCell: string): Align {
  const left = delimiterCell.startsWith(":");
  const right = delimiterCell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}

type Line = { readonly text: string; readonly from: number; readonly to: number };

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let from = 0;
  while (from <= text.length) {
    const end = text.indexOf("\n", from);
    const to = end === -1 ? text.length : end;
    const raw = text.slice(from, to);
    // A CRLF line ends before its \r
    const lineText = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    lines.push({ text: lineText, from, to: from + lineText.length });
    if (end === -1) break;
    from = end + 1;
  }
  return lines;
}

/** All tables of a page outside fenced code blocks, in document order */
export function findTables(text: string): TableRange[] {
  const lines = linesOf(text);
  const tables: TableRange[] = [];
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.text;
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1]![0] === fence[0] && fenceMatch[1]!.length >= fence.length) {
        fence = undefined;
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
      const candidate = lines[last + 1]!.text;
      if (candidate.trim() === "" || !hasUnescapedPipe(candidate)) break;
      last++;
    }
    const from = lines[i]!.from;
    const to = lines[last]!.to;
    tables.push({ from, to, text: text.slice(from, to), ordinal: tables.length });
    i = last;
  }
  return tables;
}

export function parseTable(text: string): Table {
  const lines = text.split(/\r?\n/);
  const header = lines[0] ?? "";
  const delimiter = lines[1] ?? "";
  const align = splitRow(delimiter).map(alignOf);
  const rows: Row[] = [header, ...lines.slice(2)].map((line) => {
    const cells = splitRow(line);
    while (cells.length < align.length) cells.push("");
    return { cells, source: line, sourceCells: cells };
  });
  const widths = lines.map((l) => charLength(l));
  const padded =
    lines.length > 2 &&
    widths.every((w) => w === widths[0]) &&
    lines.some((l) => /\S {2,}\|/.test(l));
  return {
    indent: /^\s*/.exec(header)![0],
    align,
    rows,
    padded,
    delimiterSource: delimiter,
    alignSource: align,
  };
}

function charLength(s: string): number {
  return Array.from(s).length;
}

const DELIMITER_CELL: Record<Align, string> = {
  "": "---",
  left: ":---",
  center: ":---:",
  right: "---:",
};

function sameCells(a: readonly string[], b: readonly string[] | undefined): boolean {
  return !!b && a.length === b.length && a.every((cell, i) => cell === b[i]);
}

export function serializeTable(table: Table): string {
  const columns = table.align.length;
  const widths: number[] = [];
  for (const row of table.rows) {
    row.cells.forEach((cell, c) => {
      widths[c] = Math.max(widths[c] ?? 3, charLength(cell));
    });
  }

  const pad = (cell: string, c: number) => {
    const gap = (widths[c] ?? 3) - charLength(cell);
    const align = table.align[c] ?? "";
    const left = align === "right" ? gap : align === "center" ? Math.floor(gap / 2) : 0;
    return " ".repeat(left) + cell + " ".repeat(gap - left);
  };
  const cellText = (cell: string, c: number) =>
    table.padded ? ` ${pad(cell, c)} ` : cell === "" ? " " : ` ${cell} `;
  const rowText = (row: Row) =>
    !table.padded && row.source !== undefined && sameCells(row.cells, row.sourceCells)
      ? row.source
      : `${table.indent}|${row.cells.map(cellText).join("|")}|`;

  const delimiterCell = (align: Align, c: number) => {
    if (!table.padded) return DELIMITER_CELL[align];
    const dashes = "-".repeat(
      Math.max(1, (widths[c] ?? 3) - (align === "center" ? 2 : align ? 1 : 0)),
    );
    const left = align === "center" || align === "left" ? ":" : "";
    const right = align === "center" || align === "right" ? ":" : "";
    return ` ${left}${dashes}${right} `;
  };
  const delimiterText =
    !table.padded &&
    table.delimiterSource !== undefined &&
    sameCells(table.align, table.alignSource)
      ? table.delimiterSource
      : `${table.indent}|${table.align.slice(0, columns).map(delimiterCell).join("|")}|`;

  const [header, ...body] = table.rows;
  return [header ? rowText(header) : "", delimiterText, ...body.map(rowText)].join("\n");
}

/** Text typed into a cell editor, as markdown cell content */
export function escapeCell(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .trim()
    .replace(/(\\*)\|/g, (match, backslashes: string) =>
      backslashes.length % 2 === 1 ? match : `${backslashes}\\|`,
    );
}

/** Markdown cell content, as text for a cell editor */
export function unescapeCell(cell: string): string {
  return cell.replace(/\\\|/g, "|");
}

export type TableShape = {
  readonly rows: number;
  readonly columns: number;
  // Rendered header texts, used to tell apart tables of the same shape
  readonly headers?: readonly string[];
};

function plainText(markdown: string): string {
  return markdown
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~=\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function shapeOf(range: TableRange): { rows: number; columns: number; headers: string[] } {
  const table = parseTable(range.text);
  return {
    rows: table.rows.length,
    columns: table.align.length,
    headers: (table.rows[0]?.cells ?? []).map(plainText),
  };
}

function distance(range: TableRange, hint: number): number {
  if (hint >= range.from && hint <= range.to) return 0;
  return Math.min(Math.abs(hint - range.from), Math.abs(hint - range.to));
}

function nearest(ranges: TableRange[], hint: number): TableRange | undefined {
  let best: TableRange | undefined;
  for (const range of ranges) {
    if (!best || distance(range, hint) < distance(best, hint)) best = range;
  }
  return best;
}

/**
 * The table a rendered table shows. Positions in the rendered table can be
 * stale (the editor reuses a table's DOM while text above it changes), so the
 * hint only picks the nearest among the tables of the right shape.
 */
export function locateByShape(
  text: string,
  hint: number,
  shape: TableShape,
): TableRange | undefined {
  const candidates = findTables(text).filter((range) => {
    const s = shapeOf(range);
    return s.rows === shape.rows && s.columns === shape.columns;
  });
  const headers = shape.headers?.map((h) => h.replace(/\s+/g, " ").trim().toLowerCase());
  const sameHeaders = headers
    ? candidates.filter((range) => {
        const s = shapeOf(range);
        return s.headers.every((h, i) => h === headers[i]);
      })
    : [];
  return nearest(sameHeaders.length ? sameHeaders : candidates, hint);
}

/** The table whose source is exactly `source`, nearest to the hint */
export function locateBySource(
  text: string,
  hint: number,
  source: string,
): TableRange | undefined {
  return nearest(
    findTables(text).filter((range) => range.text === source),
    hint,
  );
}

/** The smallest replacement that turns `before` into `after` */
export function minimalEdit(
  before: string,
  after: string,
): { from: number; to: number; insert: string } {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < max - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  return {
    from: start,
    to: before.length - end,
    insert: after.slice(start, after.length - end),
  };
}
