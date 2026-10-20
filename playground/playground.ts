// A page without SilverBullet: markdown in a textarea, tables rendered the way
// SilverBullet renders them, and Table Plus on top through a mock Bridge.
import type { Bridge, FeatureName } from "../table-plus/src/bridge.ts";
import { FEATURE_NAMES, SETTINGS } from "../table-plus/src/bridge.ts";
import { init } from "../table-plus/src/index.ts";
import { findTables, parseTable } from "../table-plus/src/markdown.ts";
import libraryPage from "../table-plus/table-plus.md";
import sample from "./sample.md";

const TEXT_KEY = "tablePlusPlayground.text";
const SETTINGS_KEY = "tablePlusPlayground.settings";
const THEME_KEY = "tablePlusPlayground.theme";
const MARKDOWN_KEY = "tablePlusPlayground.markdown";
const SETTINGS_SHOWN_KEY = "tablePlusPlayground.settingsShown";

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
// Undo on the page when Table Plus left the key alone (e.g. no table edit to undo)
page.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (e.defaultPrevented || !mod || (key !== "z" && key !== "y")) return;
  e.preventDefault();
  step(...((key === "z" && !e.shiftKey ? [undoStack, redoStack] : [redoStack, undoStack]) as [Snapshot[], Snapshot[]]));
});

// --- Settings -----------------------------------------------------------------

type Key = keyof typeof SETTINGS;
// The playground starts with metadata on, so formulas and pinning can be tried right away
let settings: Record<string, unknown> = { "tablePlus.metadata": true };
try {
  settings = JSON.parse(load(SETTINGS_KEY) ?? JSON.stringify(settings));
} catch {
  settings = { "tablePlus.metadata": true };
}

const LABELS: Record<Key, string> = {
  metadata: "Store table metadata",
  maxHeight: "Max height (px)",
  autoFormat: "Format tables",
  enterKey: "Enter",
  selectOnClick: "Click selects text",
  ctrlEnterAddsRow: "Ctrl+Enter adds a row",
  smartFilters: "smart",
  expressionsDelay: "Refresh ${…} cells after (ms)",
};

const MODULE_LABELS: Record<FeatureName, string> = {
  formulas: "Formulas",
  names: "Names",
  pageLinks: "Links to other pages",
  filters: "Filters",
  columnTypes: "Column types",
  selection: "Cell selection",
  export: "Export",
  paste: "Paste",
  handles: "Handles",
  sticky: "Sticky header",
  autoscroll: "Middle-button scrolling",
};

function settingsChanged(): void {
  save(SETTINGS_KEY, JSON.stringify(settings));
  // A fresh render lets Table Plus pick the settings up
  render();
}

const settingsBox = document.querySelector<HTMLElement>("#settings")!;

/** A setting's control: a checkbox, a number field or a choice */
function settingControl(key: Key): HTMLLabelElement {
  const setting = SETTINGS[key];
  const label = document.createElement("label");
  const current = setting.path in settings ? settings[setting.path] : setting.default;
  let input: HTMLInputElement | HTMLSelectElement;
  if (typeof setting.default === "boolean") {
    input = Object.assign(document.createElement("input"), { type: "checkbox", checked: current === true });
    input.addEventListener("change", () => {
      settings[setting.path] = (input as HTMLInputElement).checked;
      settingsChanged();
    });
    label.append(input, LABELS[key]);
  } else if (typeof setting.default === "number") {
    input = Object.assign(document.createElement("input"), { type: "number", min: "0", step: "50", value: String(current) });
    input.style.width = "6em";
    input.addEventListener("change", () => {
      settings[setting.path] = Number(input.value);
      settingsChanged();
    });
    label.append(LABELS[key], input);
  } else {
    input = document.createElement("select");
    for (const option of ["save", "moveDown"]) input.append(new Option(option, option, false, option === current));
    input.addEventListener("change", () => {
      settings[setting.path] = input.value;
      settingsChanged();
    });
    label.append(LABELS[key], input);
  }
  return label;
}

// A module's settings go with it (in the Modules row), the others here
const moduleOf = (key: Key) => /^tablePlus\.modules\.([^.]+)\./.exec(SETTINGS[key].path)?.[1];
for (const key of Object.keys(SETTINGS) as Key[]) {
  if (!moduleOf(key)) settingsBox.append(settingControl(key));
}

// Modules are read when Table Plus starts: a change reloads the playground
const modulesBox = document.createElement("span");
modulesBox.className = "modules";
modulesBox.append("Modules:");
for (const name of FEATURE_NAMES) {
  const path = `tablePlus.modules.${name}.enabled`;
  const label = document.createElement("label");
  const input = Object.assign(document.createElement("input"), { type: "checkbox", checked: settings[path] !== false });
  input.addEventListener("change", () => {
    settings[path] = input.checked;
    save(SETTINGS_KEY, JSON.stringify(settings));
    location.reload();
  });
  label.append(input, MODULE_LABELS[name]);
  // Its settings in brackets after it, off while it is
  const own = (Object.keys(SETTINGS) as Key[]).filter((key) => moduleOf(key) === name);
  if (own.length === 0) {
    modulesBox.append(label);
    continue;
  }
  const group = document.createElement("span");
  group.className = "module-group";
  const settingsOf = document.createElement("span");
  settingsOf.className = "module-settings";
  for (const key of own) {
    const control = settingControl(key);
    for (const field of Array.from(control.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))) field.disabled = !input.checked;
    settingsOf.append(control);
  }
  group.append(label, settingsOf);
  modulesBox.append(group);
}
settingsBox.append(modulesBox);

// --- Chrome -------------------------------------------------------------------

function flash(message: string, type: "info" | "error" = "info"): void {
  const note = document.createElement("div");
  note.textContent = message;
  if (type === "error") note.className = "error";
  flashBox.append(note);
  window.setTimeout(() => note.remove(), 3000);
}

document.querySelector("#reset")!.addEventListener("click", () => setText(sample, 0));

// The markdown pane and the settings, each shown or hidden by its button; hidden
// at first on a narrow screen (a phone), then as last chosen
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
paneToggle("#settings-toggle", "no-settings", SETTINGS_SHOWN_KEY);

function applyTheme(theme: string): void {
  document.documentElement.dataset.theme = theme;
  save(THEME_KEY, theme);
}
applyTheme(load(THEME_KEY) ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
document.querySelector("#theme")!.addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"),
);

// --- Table Plus ---------------------------------------------------------------

const bridge: Bridge = {
  getText: () => text,
  replaceRange: (from, to, insert) => setText(text.slice(0, from) + insert + text.slice(to), from + insert.length),
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
};

source.value = text;
render();
init(bridge);
