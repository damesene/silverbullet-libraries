// The playground's benchmark: a page generated with a table as large as asked
// (rows, columns, column types, formulas), written over the playground's page
// (the page before it comes back with Restore page, or Ctrl+Z), and a log of
// what Table Plus spent its time on for each action: its core's phases and
// each module's hooks (profile.ts), grouped by the action that started them.
import { pageTables } from "../table-plus/src/formulas/page.ts";
import { cellName, formulaCell, recalculate } from "../table-plus/src/formulas/index.ts";
import { type PageTable, pageTablesOf, serializeTable } from "../table-plus/src/markdown.ts";
import type { ProfileEntry } from "./profile.ts";
import { TYPES } from "../table-plus/src/types/index.ts";

// ---- the page --------------------------------------------------------------------

export const FORMULAS = {
  calculated: { label: "Calculated column", hint: "A column with the same formula in every row: the first two number columns multiplied ([@a]*[@b])" },
  chain: { label: "Chain", hint: "A column whose every cell refers to the cell above it (=B1+[@a]): each depends on all before it" },
  totals: { label: "Totals row", hint: "A last row with =SUM([column]) under every number column" },
  summary: { label: "Summary table", hint: "A second table that refers to this one by its name (=SUM(bench![a]), =MAX(…), =AVERAGE(…)): every edit recalculates it too" },
} as const;
export type FormulaKind = keyof typeof FORMULAS;

export type BenchmarkOptions = {
  readonly rows: number;
  readonly columns: number;
  // Column types (TYPES' names, "text" for plain text), used in turn for the columns after the first (the row's name)
  readonly types: readonly string[];
  readonly formulas: readonly FormulaKind[];
};

export const TYPE_NAMES = ["text", ...TYPES.keys()];
// The types whose values formulas can add up
const NUMERIC = new Set(["currency", "number", "percent", "unit", "stars", "progress", "trend"]);
// The hashtag a type is written with (the ones that need a parameter get one)
const TAGS: Record<string, string> = { unit: "unit-kg" };

/** A pseudo-random number generator: the same page for the same options, so runs compare */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ["apple", "delivery", "invoice", "north", "quarterly", "review", "green", "supplier", "draft", "urgent", "blue", "contract"];

function value(type: string, next: () => number): string {
  const int = (n: number) => Math.floor(next() * n);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (type) {
    case "currency":
      return (next() * 1000).toFixed(2);
    case "number":
      return String(int(100000));
    case "percent":
      return (next()).toFixed(2);
    case "unit":
      return (next() * 100).toFixed(1);
    case "stars":
      return String(int(6));
    case "check":
      return next() < 0.5 ? "yes" : "no";
    case "date":
      return `2025-${pad(1 + int(12))}-${pad(1 + int(28))}`;
    case "time":
      return `${pad(int(24))}:${pad(int(60))}`;
    case "trend":
      return String(int(11) - 5);
    case "progress":
      return String(int(101));
    case "link":
      return `https://example.com/item/${int(10000)}`;
    default:
      return Array.from({ length: 1 + int(4) }, () => WORDS[int(WORDS.length)]).join(" ");
  }
}

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** The benchmark page's markdown: the table (and the summary table), the formulas' results calculated */
export function benchmarkPage(options: BenchmarkOptions): string {
  const rows = Math.max(1, Math.floor(options.rows));
  const types = options.types.length ? options.types : ["text"];
  const formulas = new Set(options.formulas);
  const next = random(42);
  // The columns: the row's name, then the types in turn
  const columns = Array.from({ length: Math.max(1, Math.floor(options.columns)) }, (_, i) =>
    i === 0 ? { name: "Name", type: "text" } : { name: `${capital(types[(i - 1) % types.length]!)} ${i}`, type: types[(i - 1) % types.length]! },
  );
  const header = columns.map((c) => (c.type === "text" ? c.name : `${c.name} #${TAGS[c.type] ?? c.type}`));
  // Column keys, as references write them (SilverBullet's: lowercase, _ for the rest)
  const key = (name: string) => name.replace(/[\W_]+/g, "_").toLowerCase();
  const numeric = columns.filter((c) => NUMERIC.has(c.type));
  const body: string[][] = Array.from({ length: rows }, (_, r) => columns.map((c, i) => (i === 0 ? `Row ${r + 1}` : value(c.type, next))));
  if (formulas.has("calculated")) {
    header.push("Calculated");
    const [a, b] = numeric;
    const formula = a && b ? `=[@${key(a.name)}]*[@${key(b.name)}]` : a ? `=[@${key(a.name)}]*2` : "=ROW()*2";
    for (const row of body) row.push(formulaCell("", formula));
  }
  if (formulas.has("chain")) {
    const column = header.length;
    header.push("Chain");
    const add = numeric[0] ? `[@${key(numeric[0].name)}]` : "1";
    body.forEach((row, r) => row.push(formulaCell("", r === 0 ? `=${add}` : `=${cellName(r - 1, column)}+${add}`)));
  }
  if (formulas.has("totals")) {
    const sums = new Set(numeric.map((c) => key(c.name)));
    body.push(
      header.map((h, i) => {
        if (i === 0) return "Total";
        const name = key(h.replace(/#\S+/g, "").trim());
        return sums.has(name) || h === "Calculated" ? formulaCell("", `=SUM([${name}])`) : "";
      }),
    );
  }
  const summary = formulas.has("summary");
  const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
  const markdown = [line(header), line(header.map(() => "---")), ...body.map(line), ...(summary ? ['| <meta name="bench"> |'] : [])].join("\n");
  let text = `# Benchmark\n\n${rows} rows, ${header.length} columns. *Restore page* in the Benchmark panel brings the page before it back (or Ctrl+Z).\n\n${markdown}\n`;
  if (summary) {
    const of = numeric[0] ? key(numeric[0].name) : "calculated";
    const measureLine = (label: string, formula: string) => line([label, formulaCell("", formula)]);
    const lines = [
      measureLine("Sum", `=SUM(bench![${of}])`),
      measureLine("Largest", `=MAX(bench![${of}])`),
      measureLine("Average", `=AVERAGE(bench![${of}])`),
      measureLine("Rows", `=COUNT(bench![${of}])`),
    ];
    text += `\n## Summary\n\n| Measure | Value |\n|---|---|\n${lines.join("\n")}\n`;
  }
  return withResults(text);
}

/** The page with every formula's result calculated, the tables referred to by name first (two rounds) */
function withResults(text: string): string {
  for (let round = 0; round < 2; round++) {
    const tables: PageTable[] = pageTablesOf(text);
    const source = pageTables(() => tables, "Playground");
    for (const { range, table } of [...tables].reverse()) {
      text = text.slice(0, range.from) + serializeTable({ ...recalculate(table, source), padded: true }) + text.slice(range.to);
    }
  }
  return text;
}

// ---- the log -----------------------------------------------------------------------

type Trigger = { readonly what: string; readonly at: number };

type Action = {
  readonly what: string;
  readonly at: number;
  readonly trigger: Trigger;
  readonly entries: ProfileEntry[];
  // When Table Plus' last synchronous work for it ended, and the first frame painted after that
  done: number;
  shown: number;
  painting: boolean;
};

/**
 * Groups the measures into actions: those that come after a key, a press or a
 * benchmark generated. Measures that come later without a new key or press
 * (an async step settling, a refresh after a delay) join the last action.
 * Measures of pointer moves and scrolling (hovering) are left out.
 */
export class ProfileLog {
  private trigger: Trigger = { what: "Page load", at: 0 };
  private hovering = false;
  private idle: number | undefined;
  readonly actions: Action[] = [];

  constructor(private readonly changed: () => void) {
    const win = window;
    const start = (what: string) => (this.trigger = { what, at: performance.now() });
    win.addEventListener("keydown", (e) => start(`Key ${keyName(e)}`), true);
    win.addEventListener("mousedown", (e) => start(`Press on ${describe(e.target)}`), true);
    // Hovering and scrolling: what Table Plus does for them is left out
    for (const type of ["mousemove", "pointermove", "pointerover", "pointerout", "mouseover", "mouseout", "scroll", "wheel"]) {
      win.addEventListener(type, () => (this.hovering = true), true);
      win.addEventListener(type, () => (this.hovering = false));
    }
  }

  /** An action started by the playground itself */
  begin(what: string): void {
    this.trigger = { what, at: performance.now() };
  }

  add = (entry: ProfileEntry): void => {
    if (this.hovering) return;
    let action = this.actions[0];
    if (!action || action.trigger !== this.trigger) {
      action = { what: this.trigger.what, at: Math.min(this.trigger.at || entry.start, entry.start), trigger: this.trigger, entries: [], done: 0, shown: 0, painting: false };
      this.actions.unshift(action);
      this.actions.length = Math.min(this.actions.length, 50);
    }
    action.entries.push(entry);
    action.done = Math.max(action.done, entry.start + entry.sync);
    // The frame after this work: a frame callback runs before the browser lays out and paints, a task after it after
    if (!action.painting) {
      action.painting = true;
      const at = action;
      requestAnimationFrame(() =>
        setTimeout(() => {
          at.painting = false;
          at.shown = Math.max(at.shown, performance.now());
          this.queueChanged();
        }),
      );
    }
    this.queueChanged();
  };

  // The log shown again once the measures stop coming for a moment
  private queueChanged(): void {
    window.clearTimeout(this.idle);
    this.idle = window.setTimeout(() => this.changed(), 300);
  }

  clear(): void {
    this.actions.length = 0;
    this.changed();
  }
}

function keyName(e: KeyboardEvent): string {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && e.key.length > 1 && "Shift", e.metaKey && "Meta"].filter(Boolean);
  return [...mods, e.key === " " ? "Space" : e.key].join("+");
}

function describe(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "the page";
  const button = target.closest("button, [role=menuitem], .tp-menu-item");
  if (button) return `“${(button.getAttribute("aria-label") || button.textContent || button.getAttribute("title") || "a button").trim().slice(0, 40)}”`;
  const cell = target.closest("td, th");
  if (cell) return cell.tagName === "TH" || cell.closest("thead") ? "a header cell" : "a cell";
  return target.closest("table") ? "a table" : "the page";
}

export type Line = { readonly label: string; readonly calls: number; readonly total: number; readonly self: number };

/** An action's measures summed by label, the most self time first */
export function linesOf(entries: readonly ProfileEntry[]): Line[] {
  const lines = new Map<string, { calls: number; total: number; self: number }>();
  for (const e of entries) {
    const line = lines.get(e.label) ?? { calls: 0, total: 0, self: 0 };
    line.calls++;
    line.total += e.total;
    line.self += e.self;
    lines.set(e.label, line);
  }
  return Array.from(lines, ([label, l]) => ({ label, ...l })).sort((a, b) => b.self - a.self);
}

/** Self time by owner: the core, the cell editor, each module, the mock SilverBullet */
export function ownersOf(entries: readonly ProfileEntry[]): { owner: string; self: number }[] {
  const owners = new Map<string, number>();
  for (const e of entries) {
    const owner = e.label.split(" · ")[0]!;
    owners.set(owner, (owners.get(owner) ?? 0) + e.self);
  }
  return Array.from(owners, ([owner, self]) => ({ owner, self })).sort((a, b) => b.self - a.self);
}

const ms = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));

/** An action's times: until its first frame painted, Table Plus' (and the mock's) work in it */
function timesOf(action: Action): { shown: number; work: number; done: number } {
  return {
    shown: Math.max(action.shown, action.done) - action.at,
    work: action.entries.reduce((sum, e) => sum + e.self, 0),
    done: action.done - action.at,
  };
}

// Owners whose work rounds to nothing are left out of the summary
const shownOwners = (entries: readonly ProfileEntry[]) => ownersOf(entries).filter((o) => o.self >= 0.05);

/** An action as text, to paste somewhere */
export function actionText(action: Action): string {
  const { shown, work, done } = timesOf(action);
  const lines = linesOf(action.entries);
  const width = Math.max(...lines.map((l) => l.label.length), 10);
  return [
    `${action.what}: shown after ${ms(shown)} ms; measured work ${ms(work)} ms, the last of it done after ${ms(done)} ms`,
    ...shownOwners(action.entries).map((o) => `  ${o.owner.padEnd(20)} ${ms(o.self).padStart(8)} ms`),
    "",
    `  ${"Measure".padEnd(width)}  Calls  Total ms   Self ms`,
    ...lines.map((l) => `  ${l.label.padEnd(width)}  ${String(l.calls).padStart(5)}  ${ms(l.total).padStart(8)}  ${ms(l.self).padStart(8)}`),
  ].join("\n");
}

// Which actions the reader opened or closed, kept as the log is shown again
const opened = new WeakMap<object, boolean>();

/** The log's actions as elements: the times, the work by part (bars), every measure in a table under it */
export function renderLog(into: HTMLElement, log: ProfileLog): void {
  into.replaceChildren();
  if (!log.actions.length) {
    into.append(Object.assign(document.createElement("p"), { className: "bench-empty", textContent: "Nothing measured yet: generate a page, then edit, sort or filter it. Each action shows here." }));
    return;
  }
  const el = (tag: string, className: string, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });
  // Actions in which nothing measurable happened (a press beside the tables) are left out
  log.actions.filter((action) => timesOf(action).work >= 0.05).forEach((action, i) => {
    const { shown, work, done } = timesOf(action);
    const details = document.createElement("details");
    details.className = "bench-action";
    details.open = opened.get(action) ?? i === 0;
    details.addEventListener("toggle", () => opened.set(action, details.open));
    const summary = document.createElement("summary");
    summary.append(
      el("span", "bench-what", action.what),
      el("span", "bench-ms", `shown after ${ms(shown)} ms`),
      el("span", "bench-note", `measured ${ms(work)} ms`),
    );
    summary.title = `From the key or press to the first frame painted after Table Plus' work: ${ms(shown)} ms. Measured work (Table Plus and the mock SilverBullet's rendering): ${ms(work)} ms, the last of it done after ${ms(done)} ms. The rest is the browser laying out and painting, and waiting.`;
    details.append(summary);
    const owners = el("div", "bench-owners");
    const parts = shownOwners(action.entries);
    const top = Math.max(...parts.map((o) => o.self), 0.001);
    for (const o of parts) {
      const bar = el("span", "bench-bar");
      bar.append(Object.assign(document.createElement("span"), { style: `width:${(o.self / top) * 100}%` }));
      owners.append(el("span", "bench-name", o.owner), bar, el("span", "bench-ms", `${ms(o.self)} ms`));
    }
    details.append(owners);
    const lines = linesOf(action.entries);
    const all = document.createElement("details");
    all.className = "bench-all";
    all.append(el("summary", "", `Every measure (${lines.length})`));
    const table = el("table", "bench-lines") as HTMLTableElement;
    const head = table.createTHead().insertRow();
    for (const [text, title] of [
      ["Measure", "A phase of Table Plus' core, or a module's hook (module · hook)"],
      ["Calls", ""],
      ["Total ms", "With what it called; an async one until it was done (waiting included)"],
      ["Self ms", "Without the measures it called"],
    ]) head.append(Object.assign(el("th", "", text), { title: title! }));
    const body = table.createTBody();
    for (const line of lines) {
      const tr = body.insertRow();
      for (const text of [line.label, String(line.calls), ms(line.total), ms(line.self)]) tr.append(el("td", "", text));
    }
    all.append(table);
    details.append(all);
    const copy = Object.assign(el("button", "bench-copy", "Copy as text"), { type: "button" });
    copy.addEventListener("click", () => void navigator.clipboard?.writeText(actionText(action)));
    details.append(copy);
    into.append(details);
  });
}
