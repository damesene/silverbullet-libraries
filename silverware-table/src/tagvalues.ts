// An attribute of a cell's hidden tags (tags.ts) read and written by its name,
// whatever it is for: what the core gives a module for the data it keeps in
// cells, the attribute's name made by the core.
import { metaAttribute, unescapeMetaValue } from "./markdown.ts";
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
