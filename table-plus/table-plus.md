---
name: Library/damesene/table-plus
tags: meta/library
description: "Table Plus: sort, filter and edit markdown tables in place, and move, add or delete rows and columns."
files:
- table-plus.js
---
# Table Plus

Makes the markdown tables in your pages interactive, while they stay plain markdown.

## Usage

* **Edit a cell**: click it. Enter or clicking elsewhere saves, Esc cancels, Tab / Shift+Tab save and move to the next / previous cell. Tab on the last cell adds a row.
* **Show the markdown**: hover the table and click *Edit markdown*. A plain click no longer switches the table to markdown. Alt+click still does, with the cursor in the clicked cell.
* **Sort**: click the ⇅ control in a column header: ascending, descending, then back to the order as written. Sorting only changes what you see, never the markdown.
* **Filter**: hover the table and click *Filter* to show a filter field under each header. Matching ignores case and diacritics. Hiding the filter row clears the filters.
* **Original order**: while sorted or filtered, *Original order* in the toolbar shows the rows as written again.
* **Rows and columns**: the ⋮ handle on a hovered cell inserts, moves and deletes rows and columns, and sets column alignment. Drag the grip left of a row, or above a column header, to move it. Esc cancels a drag.
* Rows can be moved only in the original order (no sort, no filter), so a row always lands where you see it.
* Links, tasks and buttons in cells work as before.
* Every change is one ordinary edit: Ctrl+Z undoes it. Tables with aligned pipes stay aligned; compact tables stay compact, and untouched rows are kept byte for byte.

## Limits

* Works on tables written in the page. Query and Lua output, and tables in block quotes, are left as they are.
* Sorting and filters are remembered per table until the page is reloaded.
* If a SilverBullet update renders tables differently, Table Plus switches itself off with one notification, and tables behave as without it.

## Implementation


```space-lua
-- Table Plus only uses the public editor API, handed over here
if js and js.window then
  local tablePlus = js.importFromSpace("Library/damesene/table-plus.js")
  tablePlus.init({
    getText = editor.getText,
    replaceRange = editor.replaceRange,
    moveCursor = editor.moveCursor,
    getCurrentPage = editor.getCurrentPage,
    flash = editor.flashNotification,
  })
end
```

```space-style
.sb-table-widget.tp-table td {
  cursor: text;
}
.sb-table-widget.tp-table td a,
.sb-table-widget.tp-table td button,
.sb-table-widget.tp-table td input {
  cursor: pointer;
}
.tp-sort {
  margin-left: 4px;
  padding: 0 2px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.8em;
  font-weight: normal;
  color: inherit;
  cursor: pointer !important;
  /* decoration, not text: the control is also announced by its title */
  opacity: 0.45;
}
.sb-table-widget.tp-table thead td:hover .tp-sort,
.tp-sort.tp-active {
  opacity: 1;
}
.tp-sort.tp-active {
  color: var(--ui-accent-color);
}
.sb-table-widget .tp-hidden {
  display: none !important;
}
.sb-table-widget td.tp-editing {
  padding: 0 !important;
}
.tp-cell-editor {
  display: block;
  width: 100%;
  min-width: 6em;
  box-sizing: border-box;
  margin: 0;
  padding: 7px;
  font: inherit;
  line-height: inherit;
  color: inherit;
  background: var(--root-background-color);
  border: 1px solid var(--ui-accent-color);
  border-radius: 4px;
  outline: none;
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
}
.sb-table-widget .tp-filter-row td {
  padding: 4px 8px !important;
}
.tp-filter {
  width: 100%;
  min-width: 4em;
  box-sizing: border-box;
  padding: 2px 6px;
  font: inherit;
  font-size: 0.85em;
  font-weight: normal;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 4px;
  cursor: text !important;
}
.tp-floating {
  position: fixed;
  z-index: 50;
  display: none;
  font-family: var(--ui-font, system-ui, sans-serif);
}
.tp-floating.tp-visible {
  display: flex;
}
.tp-bar {
  align-items: center;
  gap: 2px;
  padding: 2px;
  font-size: 12px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.tp-bar button {
  padding: 2px 8px;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
.tp-bar button:hover,
.tp-bar button[aria-pressed="true"] {
  background: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
.tp-status {
  padding: 0 6px;
  font-weight: 600;
}
.tp-handle {
  width: 18px;
  height: 18px;
  padding: 0;
  align-items: center;
  justify-content: center;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 4px;
  cursor: pointer;
}
.tp-handle:hover {
  border-color: var(--ui-accent-color);
}
.tp-handle svg {
  width: 14px;
  height: 14px;
}
.tp-grip {
  cursor: grab;
  touch-action: none;
}
.tp-grip-column svg {
  transform: rotate(90deg);
}
.tp-menu {
  z-index: 60;
  flex-direction: column;
  min-width: 190px;
  padding: 4px 0;
  font-size: 13px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
.tp-menu-heading {
  padding: 6px 12px 2px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tp-menu button {
  padding: 4px 12px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}
.tp-menu button:hover {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
}
.tp-menu button.tp-checked::after {
  content: " \2713";
}
.tp-menu button.tp-danger {
  color: var(--danger-color, #c62828);
}
.tp-drop {
  z-index: 55;
  pointer-events: none;
  background: var(--ui-accent-color);
}
.sb-table-widget .tp-dragged {
  opacity: 0.4;
}
body.tp-dragging,
body.tp-dragging * {
  cursor: grabbing !important;
  user-select: none;
}
```
