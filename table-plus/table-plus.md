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
* **Sort**: click the ⇅ control that appears in a column header on hover: ascending, descending, then back to the order as written. Sorting only changes what you see, never the markdown.
* **Filter**: hover the table and click *Filter* (or *Filter* in a column menu) to show a filter field under each header. Matching ignores case and diacritics. Hiding the filter row clears the filters.
* **Clear sorting**: while sorted, the toolbar shows *Sorted by …* with a × that shows the rows as written again.
* **Row actions**: hover a row and click the grip ⠿ left of it: insert above or below, duplicate, move up or down, delete. Drag the grip to move the row.
* **Column actions**: hover a column and click the grip above its header: sort, filter, align, insert left or right, move, delete. Drag the grip to move the column.
* **Add**: *+ Row* below the table adds a row at the end, *+* right of the header adds a column.
* Rows can be moved only in the original order (no sort, no filter), so a row always lands where you see it. Esc cancels a drag.
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
/* An empty row is as tall as a row with text (zero-width space, not in the text) */
.sb-table-widget.tp-table td:not(.tp-editing)::before {
  content: "\200b";
}
/* An empty column stays wide enough to click into */
.sb-table-widget.tp-table td {
  min-width: 4em;
}
.sb-table-widget.tp-table td a,
.sb-table-widget.tp-table td button,
.sb-table-widget.tp-table td input[type="checkbox"] {
  cursor: pointer;
}

/* Offer to name unnamed columns, which SilverBullet does not render */
.tp-notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
  padding: 6px 10px;
  font-family: var(--ui-font, system-ui, sans-serif);
  font-size: 13px;
  white-space: normal;
  color: var(--root-color);
  background: color-mix(in srgb, var(--ui-accent-color) 10%, transparent);
  border-left: 3px solid var(--ui-accent-color);
  border-radius: 4px;
}
.tp-notice button {
  padding: 2px 10px;
  font: inherit;
  color: inherit;
  background: var(--root-background-color);
  border: 1px solid var(--ui-accent-color);
  border-radius: 4px;
  cursor: pointer;
}

/* Sort control: shown on header hover, always while it sorts */
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
  opacity: 0;
  transition: opacity 0.12s;
}
.sb-table-widget.tp-table thead tr:hover .tp-sort {
  opacity: 0.5;
}
.sb-table-widget.tp-table thead tr .tp-sort:hover,
.sb-table-widget.tp-table thead tr .tp-sort.tp-active {
  opacity: 1;
}
.sb-table-widget .tp-hidden {
  display: none !important;
}

/* Inline editing: same place and size as the text, with an accent underline */
.sb-table-widget td.tp-editing {
  background-color: color-mix(in srgb, var(--ui-accent-color) 7%, transparent);
}
.tp-cell-editor {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  text-align: inherit;
  color: inherit;
  background: transparent;
  outline: none;
  box-shadow: 0 2px 0 0 var(--ui-accent-color);
}

/* Filter row */
.sb-table-widget .tp-filter-row td {
  padding: 4px 8px !important;
}
.tp-filter {
  width: 100%;
  min-width: 4em;
  box-sizing: border-box;
  padding: 2px 0;
  font: inherit;
  font-size: 0.85em;
  font-weight: normal;
  color: inherit;
  background: transparent;
  border: 0;
  border-bottom: 1px solid currentColor;
  border-radius: 0;
  outline: none;
  cursor: text !important;
}
.tp-filter:focus {
  border-bottom-color: var(--ui-accent-color);
  box-shadow: 0 1px 0 0 var(--ui-accent-color);
}
.tp-filter::placeholder {
  color: inherit;
  opacity: 0.6;
}

/* Floating controls */
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
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
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
  background: color-mix(in srgb, var(--ui-accent-color) 16%, transparent);
}
.tp-status {
  padding: 0 6px;
  font-weight: 600;
}
.tp-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 2px 1px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
}
.tp-bar .tp-chip-clear {
  display: inline-flex;
  padding: 2px;
  border-radius: 3px;
}
.tp-bar .tp-chip-clear:hover {
  color: var(--ui-accent-color);
  background: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
.tp-chip-clear svg {
  width: 12px;
  height: 12px;
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
  cursor: grab;
  touch-action: none;
}
.tp-handle:hover,
.tp-handle.tp-active {
  color: var(--ui-accent-color);
  border-color: var(--ui-accent-color);
}
.tp-handle.tp-no-drag {
  cursor: pointer;
}
.tp-handle svg {
  width: 14px;
  height: 14px;
}
.tp-grip-column svg {
  transform: rotate(90deg);
}
.tp-add {
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 6px 0 3px;
  font-size: 12px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px dashed var(--button-border-color, rgba(128, 128, 128, 0.5));
  border-radius: 4px;
  cursor: pointer;
}
.tp-add-column {
  width: 20px;
  padding: 0;
  justify-content: center;
}
.tp-add:hover {
  color: var(--ui-accent-color);
  border-color: var(--ui-accent-color);
  border-style: solid;
}
.tp-add svg {
  width: 14px;
  height: 14px;
}

/* Row and column menus */
.tp-menu {
  z-index: 60;
  flex-direction: column;
  min-width: 200px;
  padding: 4px;
  font-size: 13px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  outline: none;
}
.tp-menu-title {
  padding: 4px 8px 6px;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tp-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.tp-menu-item:hover,
.tp-menu-item:focus-visible,
.tp-segment:hover,
.tp-segment:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
  outline: none;
}
.tp-menu-item[aria-disabled="true"] {
  cursor: default;
  opacity: 0.45;
}
.tp-menu-item[aria-disabled="true"]:hover {
  background: none;
}
.tp-menu-item .tp-label {
  flex: 1;
}
.tp-menu-item[aria-checked="true"]::after {
  content: "\2713";
  color: var(--ui-accent-color);
}
.tp-menu-item.tp-danger {
  color: var(--danger-color, #c62828);
}
.tp-icon {
  display: inline-flex;
}
.tp-menu svg {
  width: 16px;
  height: 16px;
}
.tp-menu-separator {
  height: 1px;
  margin: 4px 2px;
  background: var(--button-border-color, rgba(128, 128, 128, 0.3));
}
.tp-menu-segmented {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 2px 8px;
}
.tp-segments {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--root-color) 6%, transparent);
}
.tp-segment {
  display: inline-flex;
  padding: 4px 6px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
.tp-segment[aria-checked="true"] {
  color: var(--ui-accent-color);
  background: var(--root-background-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

/* Dragging */
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
