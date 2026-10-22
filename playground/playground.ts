// A page without SilverBullet: markdown in a textarea, tables rendered the way
// SilverBullet renders them, and Silverware Table on top through a mock Bridge.
import type { Bridge } from "../silverware-table/src/bridge.ts";
import { init, openSettings } from "../silverware-table/src/index.ts";
import { findTables, parseTable } from "../silverware-table/src/markdown.ts";
import libraryPage from "../silverware-table/silverware-table.md";
import { benchmarkPage, FORMULAS, type FormulaKind, ProfileLog, renderLog, TYPE_NAMES } from "./benchmark.ts";
import { measure, profileSilverwareTable, setProfileSink } from "./profile.ts";
import sample from "./sample.md";

const TEXT_KEY = "silverwarePlayground.text";
const SETTINGS_KEY = "silverwarePlayground.settings";
const THEME_KEY = "silverwarePlayground.theme";
const MARKDOWN_KEY = "silverwarePlayground.markdown";
const BENCH_SHOWN_KEY = "silverwarePlayground.benchShown";
const BENCH_OPTIONS_KEY = "silverwarePlayground.benchOptions";
// The page before the first benchmark was generated, for Restore page
const BEFORE_BENCH_KEY = "silverwarePlayground.beforeBenchmark";

const source = document.querySelector<HTMLTextAreaElement>("#source")!;
const page = document.querySelector<HTMLElement>("#page")!;
const flashBox = document.querySelector<HTMLElement>("#flash")!;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the playground still works, it just forgets
  }
}

// The library page's space-style block, as SilverBullet would apply it
const style = /```space-style\r?\n([\s\S]*?)```/.exec(libraryPage)?.[1] ?? "";
document.head.append(Object.assign(document.createElement("style"), { textContent: style }));

// --- Rendering, as SilverBullet does it --------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// <meta> tags (table metadata, formulas) render as HTML, which browsers do not show
function inline(text: string): string {
  return text
    .split(/(<meta\b[^>]*>)/i)
    .map((part, i) => (i % 2 === 1 ? part : markup(part)))
    .join("");
}

function markup(text: string): string {
  return escapeHtml(text.replaceAll("\\|", "|"))
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[\[([^\]]+)\]\]/g, '<a data-ref="$1">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|\s)_([^_]+)_/g, "$1<em>$2</em>")
    // Hashtags are links, as SilverBullet renders them
    .replace(/(^|\s)#([^\s#<&]+)/g, '$1<a class="hashtag sb-hashtag" data-tag-name="$2" data-ref="tag:$2">#$2</a>');
}

function renderTable(from: number, text: string): HTMLElement {
  const model = parseTable(text);
  const lineStarts: number[] = [];
  let offset = from;
  for (const line of text.split("\n")) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const widget = document.createElement("span");
  widget.className = "sb-table-widget";
  // A click shows the table's markdown
  widget.addEventListener("click", () => moveCursor(from));
  const table = document.createElement("table");
  // SilverBullet leaves the position out for a table at the very start of the page
  if (from > 0) table.dataset.pos = String(from);
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  model.rows.forEach((row, r) => {
    const tr = document.createElement("tr");
    // Source lines: header, delimiter, then body rows
    tr.dataset.pos = String(lineStarts[r === 0 ? 0 : r + 1]);
    row.cells.forEach((cell, c) => {
      // SilverBullet leaves out empty header cells
      if (r === 0 && cell.trim() === "") return;
      const td = document.createElement("td");
      const align = model.align[c];
      if (align) td.style.textAlign = align;
      td.innerHTML = inline(cell.trim());
      tr.append(td);
    });
    (r === 0 ? thead : tbody).append(tr);
  });
  if (model.meta) {
    const tr = document.createElement("tr");
    tr.dataset.pos = String(lineStarts[lineStarts.length - 1]);
    const td = document.createElement("td");
    td.append(document.createElement("meta"));
    tr.append(td);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  widget.append(table);
  return widget;
}

// As SilverBullet's CodeMirror does: one .cm-line per source line, an empty
// line as tall as one with text, a heading's line in its larger type
function renderLines(lines: readonly string[], into: DocumentFragment): void {
  for (const line of lines) {
    const element = document.createElement("div");
    element.className = "cm-line";
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) element.classList.add(`sb-line-h${heading[1]!.length}`);
    if (line.trim() === "") element.append(document.createElement("br"));
    else element.innerHTML = inline(heading ? heading[2]! : line);
    into.append(element);
  }
}

function render(): void {
  measure("SilverBullet (mock) · render the page", renderNow);
}

function renderNow(): void {
  const fragment = document.createDocumentFragment();
  let at = 0;
  for (const range of findTables(text)) {
    // The lines between tables; a table's own lines are its widget, in one line
    const lines = text.slice(at, range.from).split("\n");
    if (at > 0) lines.shift();
    lines.pop();
    renderLines(lines, fragment);
    const line = document.createElement("div");
    line.className = "cm-line";
    line.append(renderTable(range.from, range.text));
    fragment.append(line);
    at = range.to;
  }
  const rest = text.slice(at).split("\n");
  if (at > 0) rest.shift();
  renderLines(rest, fragment);
  page.replaceChildren(fragment);
}

// --- Document and history -----------------------------------------------------

let text = load(TEXT_KEY) ?? sample;
let cursor = 0;
type Snapshot = { text: string; cursor: number };
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];

function setText(next: string, nextCursor: number, record = true): void {
  if (record && next !== text) {
    undoStack.push({ text, cursor });
    redoStack.length = 0;
  }
  text = next;
  cursor = Math.max(0, Math.min(nextCursor, text.length));
  if (source.value !== text) source.value = text;
  save(TEXT_KEY, text);
  render();
}

function step(from: Snapshot[], to: Snapshot[]): void {
  const snapshot = from.pop();
  if (!snapshot) return;
  to.push({ text, cursor });
  setText(snapshot.text, snapshot.cursor, false);
}

function moveCursor(pos: number): void {
  cursor = pos;
  source.focus();
  source.setSelectionRange(pos, pos);
  // Scroll the textarea so the cursor's line is in view
  const line = text.slice(0, pos).split("\n").length;
  const lineHeight = parseFloat(getComputedStyle(source).lineHeight) || 20;
  source.scrollTop = Math.max(0, (line - 5) * lineHeight);
}

// Typing in the textarea: one undo step per pause
let typingSnapshot: Snapshot | undefined;
let typingTimer: number | undefined;
source.addEventListener("input", () => {
  typingSnapshot ??= { text, cursor };
  text = source.value;
  cursor = source.selectionStart;
  save(TEXT_KEY, text);
  window.clearTimeout(typingTimer);
  typingTimer = window.setTimeout(() => {
    if (typingSnapshot && typingSnapshot.text !== text) {
      undoStack.push(typingSnapshot);
      redoStack.length = 0;
    }
    typingSnapshot = undefined;
    render();
  }, 300);
});
source.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (!mod || (key !== "z" && key !== "y")) return;
  e.preventDefault();
  step(...((key === "z" && !e.shiftKey ? [undoStack, redoStack] : [redoStack, undoStack]) as [Snapshot[], Snapshot[]]));
});
// Undo on the page when Silverware Table left the key alone (e.g. no table edit to undo)
page.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (e.defaultPrevented || !mod || (key !== "z" && key !== "y")) return;
  e.preventDefault();
  step(...((key === "z" && !e.shiftKey ? [undoStack, redoStack] : [redoStack, undoStack]) as [Snapshot[], Snapshot[]]));
});

// --- Settings -----------------------------------------------------------------

// The playground starts with metadata on, so formulas and pinning can be tried right away
let settings: Record<string, unknown> = { "silverware.table.metadata": true };
try {
  settings = JSON.parse(load(SETTINGS_KEY) ?? JSON.stringify(settings));
} catch {
  settings = { "silverware.table.metadata": true };
}

function settingsChanged(): void {
  save(SETTINGS_KEY, JSON.stringify(settings));
  // A fresh render lets Silverware Table pick the settings up
  render();
}

// --- Chrome -------------------------------------------------------------------

function flash(message: string, type: "info" | "error" = "info"): void {
  const note = document.createElement("div");
  note.textContent = message;
  if (type === "error") note.className = "error";
  flashBox.append(note);
  window.setTimeout(() => note.remove(), 3000);
}

document.querySelector("#reset")!.addEventListener("click", () => setText(sample, 0));
document.querySelector("#swt-settings")!.addEventListener("click", () => openSettings());

// The markdown pane, shown or hidden by its button; hidden at first on a
// narrow screen (a phone), then as last chosen
function paneToggle(button: string, hiddenClass: string, key: string): void {
  const toggle = document.querySelector<HTMLButtonElement>(button)!;
  const show = (shown: boolean) => {
    document.body.classList.toggle(hiddenClass, !shown);
    toggle.setAttribute("aria-pressed", String(shown));
    save(key, shown ? "shown" : "hidden");
  };
  const saved = load(key);
  show(saved ? saved === "shown" : matchMedia("(min-width: 700px)").matches);
  toggle.addEventListener("click", () => show(document.body.classList.contains(hiddenClass)));
}
paneToggle("#markdown", "no-markdown", MARKDOWN_KEY);
// The benchmark panel: hidden until asked for
{
  const toggle = document.querySelector<HTMLButtonElement>("#bench-toggle")!;
  const show = (shown: boolean) => {
    document.body.classList.toggle("bench-shown", shown);
    toggle.setAttribute("aria-pressed", String(shown));
    save(BENCH_SHOWN_KEY, shown ? "shown" : "hidden");
  };
  show(load(BENCH_SHOWN_KEY) === "shown");
  toggle.addEventListener("click", () => show(!document.body.classList.contains("bench-shown")));
}

function applyTheme(theme: string): void {
  document.documentElement.dataset.theme = theme;
  save(THEME_KEY, theme);
}
applyTheme(load(THEME_KEY) ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
document.querySelector("#theme")!.addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"),
);

// --- Benchmark ----------------------------------------------------------------

const logBox = document.querySelector<HTMLElement>("#bench-log")!;
const profileLog = new ProfileLog(() => renderLog(logBox, profileLog));

function buildBenchmark(): void {
  type Options = { rows: number; columns: number; types: string[]; formulas: FormulaKind[] };
  let options: Options = { rows: 500, columns: 8, types: ["text", "number", "currency", "date", "check"], formulas: ["calculated", "totals"] };
  try {
    options = { ...options, ...JSON.parse(load(BENCH_OPTIONS_KEY) ?? "{}") };
  } catch {
    // The defaults
  }
  const rows = document.querySelector<HTMLInputElement>("#bench-rows")!;
  const columns = document.querySelector<HTMLInputElement>("#bench-columns")!;
  rows.value = String(options.rows);
  columns.value = String(options.columns);
  const check = (into: string, name: string, label: string, checked: boolean, title = "") => {
    const box = Object.assign(document.createElement("input"), { type: "checkbox", value: name, checked });
    const element = Object.assign(document.createElement("label"), { title });
    element.append(box, label);
    document.querySelector(into)!.append(element);
    return box;
  };
  const types = TYPE_NAMES.map((name) => check("#bench-types", name, name === "text" ? "text" : `#${name}`, options.types.includes(name)));
  const formulas = (Object.keys(FORMULAS) as FormulaKind[]).map((kind) =>
    check("#bench-formulas", kind, FORMULAS[kind].label, options.formulas.includes(kind), FORMULAS[kind].hint),
  );
  const note = document.querySelector<HTMLElement>("#bench-note")!;
  const restore = document.querySelector<HTMLButtonElement>("#bench-restore")!;
  const showRestore = () => (restore.hidden = load(BEFORE_BENCH_KEY) === null);
  showRestore();
  document.querySelector("#bench-form")!.addEventListener("submit", (e) => {
    e.preventDefault();
    options = {
      rows: Math.max(1, Number(rows.value) || 1),
      columns: Math.max(1, Number(columns.value) || 1),
      types: types.filter((b) => b.checked).map((b) => b.value),
      formulas: formulas.filter((b) => b.checked).map((b) => b.value as FormulaKind),
    };
    save(BENCH_OPTIONS_KEY, JSON.stringify(options));
    const started = performance.now();
    const page = benchmarkPage(options);
    const generated = performance.now() - started;
    if (load(BEFORE_BENCH_KEY) === null) save(BEFORE_BENCH_KEY, text);
    showRestore();
    profileLog.begin(`Generate ${options.rows} rows × ${options.columns} columns${options.formulas.length ? ` with ${options.formulas.map((f) => FORMULAS[f].label.toLowerCase()).join(", ")}` : ""}`);
    note.textContent = `Generated in ${generated.toFixed(0)} ms (the playground's work, not measured below).${
      options.formulas.length && settings["silverware.table.metadata"] === false ? " Formulas need Store table metadata on." : ""
    }`;
    setText(page, 0);
  });
  restore.addEventListener("click", () => {
    const before = load(BEFORE_BENCH_KEY);
    if (before === null) return;
    try {
      localStorage.removeItem(BEFORE_BENCH_KEY);
    } catch {
      // Kept: Restore page stays offered
    }
    showRestore();
    note.textContent = "";
    profileLog.begin("Restore page");
    setText(before, 0);
  });
  document.querySelector("#bench-clear")!.addEventListener("click", () => profileLog.clear());
  renderLog(logBox, profileLog);
}

// --- Silverware Table ---------------------------------------------------------------

const bridge: Bridge = {
  getText: () => text,
  replaceRange: (from, to, insert) =>
    measure("editor · replaceRange (the page rendered again)", () => setText(text.slice(0, from) + insert + text.slice(to), from + insert.length)),
  moveCursor: (pos) => moveCursor(pos),
  getCurrentPage: () => "Playground",
  flash,
  getConfig: (path, defaultValue) => (path in settings ? settings[path] : defaultValue),
  setSelection: (from) => {
    cursor = from;
  },
  getCursor: () => cursor,
  undo: () => step(undoStack, redoStack),
  redo: () => step(redoStack, undoStack),
  // Silverware Table's settings dialog (Settings in the header, or a table's ⋯ menu): no CONFIG page here, the playground's own store
  saveSettings: (values) => {
    for (const [path, value] of Object.entries(values)) {
      if (value === undefined) delete settings[path];
      else settings[path] = value;
    }
    settingsChanged();
  },
  reloadUI: () => location.reload(),
};

source.value = text;
render();
init(bridge);
// The benchmark's log: what each phase and module took, measured from outside (Silverware Table has no measuring in it)
setProfileSink(profileLog.add);
void profileSilverwareTable();
buildBenchmark();
