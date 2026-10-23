// An attribute of a cell's hidden tags (tags.ts) read and written by its name,
// whatever it is for: what the core gives a module for the data it keeps in
// cells, the attribute's name made by the core.
import { metaAttribute, type Table, unescapeMetaValue } from "./markdown.ts";
import { type IndexMap, setCell } from "./ops.ts";
import { cellTags, withoutTags } from "./tags.ts";

// An attribute with its value, in quotes or apostrophes
const ATTRIBUTE_VALUE_RE = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** The attributes of a tag, by name (lowercase), their values unescaped; an attribute's last value counts */
function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE_VALUE_RE)) found.set(match[1]!.toLowerCase(), unescapeMetaValue(match[2] ?? match[3] ?? ""));
  return found;
}

/** The value of the attribute `name` in a cell's hidden tags (the last tag with it counts); undefined without it */
export function tagValue(cell: string, name: string): string | undefined {
  // No tag at all (most cells): asked for every cell of a table on every view
  if (!cell.includes("<")) return undefined;
  const wanted = name.toLowerCase();
  let value: string | undefined;
  for (const tag of cellTags(cell)) value = attributes(tag).get(wanted) ?? value;
  return value;
}

/**
 * The cell with the attribute `name` set to `value` (undefined: removed), in
 * the tag that has it, else in a tag of its own after the cell's other tags; a
 * tag left without attributes goes. The cell's text and other attributes stay.
 */
export function withTagValue(cell: string, name: string, value: string | undefined): string {
  const wanted = name.toLowerCase();
  let placed = value === undefined;
  const tags: string[] = [];
  for (const tag of cellTags(cell)) {
    const found = attributes(tag);
    if (!found.has(wanted)) {
      tags.push(tag);
      continue;
    }
    if (!placed) {
      found.set(wanted, value!);
      placed = true;
    } else found.delete(wanted);
    if (found.size > 0) tags.push(`<meta ${Array.from(found, ([n, v]) => metaAttribute(n, v)).join(" ")}>`);
  }
  if (!placed) tags.push(`<meta ${metaAttribute(name, value!)}>`);
  return [withoutTags(cell), ...tags].filter((part) => part !== "").join(" ");
}

/**
 * `after`, a table as an edit leaves it (from `before`), without the hidden
 * values new to it: what the metadata setting off lets a write keep. An
 * attribute of a cell's tag stays where its cell had that attribute before
 * (`rowMap`/`columnMap`: where the rows and columns went), or a cell of the
 * table had it with that value (a calculated column's new row, a cell moved);
 * else it is taken off, the cell's text staying. With how many were taken off.
 */
export function withoutNewTagValues(before: Table, after: Table, rowMap?: IndexMap, columnMap?: IndexMap): { readonly table: Table; readonly taken: number } {
  // Where each row and column of `after` was
  const rowFrom = new Map<number, number>();
  before.rows.forEach((_, r) => {
    const to = rowMap ? rowMap(r) : r;
    if (to !== undefined) rowFrom.set(to, r);
  });
  const columnFrom = new Map<number, number>();
  before.align.forEach((_, c) => {
    const to = columnMap ? columnMap(c) : c;
    if (to !== undefined) columnFrom.set(to, c);
  });
  // Every attribute and value the table had in its cells
  const had = new Set<string>();
  for (const row of before.rows) for (const cell of row.cells) for (const tag of cellTags(cell)) for (const [n, v] of attributes(tag)) had.add(`${n}\u0000${v}`);
  let table = after;
  let taken = 0;
  after.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (!cell.includes("<")) return;
      const rf = rowFrom.get(r);
      const cf = columnFrom.get(c);
      const was = rf === undefined || cf === undefined ? "" : (before.rows[rf]?.cells[cf] ?? "");
      let result = cell;
      for (const tag of cellTags(cell)) {
        for (const [name, value] of attributes(tag)) {
          if (had.has(`${name}\u0000${value}`) || tagValue(was, name) !== undefined) continue;
          result = withTagValue(result, name, undefined);
          taken++;
        }
      }
      if (result !== cell) table = setCell(table, r, c, result);
    }),
  );
  return { table, taken };
}
