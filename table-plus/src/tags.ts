// Hidden tags in cells: `<meta …>` after a cell's text, which SilverBullet does
// not show (verified) and other renderers drop. Modules keep their data in
// them (formulas: `f`; names: `n`, `cn`). The core keeps a cell's tags,
// whatever they are for, when its text is edited, pasted over or cleared, so a
// module turned off loses nothing; a module that manages a tag says so
// (Feature.takesTags), and writes it itself.

// A tag: no ">" inside, as values escape it (&gt;)
const TAG_RE = /\s*<meta\b[^>]*>/gi;
// An attribute with its value, so a "name=" inside a value (a formula's n=1) is no attribute
const ATTRIBUTE_RE = /([\w.:-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g;

/** A cell's hidden tags, as written */
export function cellTags(cell: string): string[] {
  return Array.from(cell.matchAll(TAG_RE), (match) => match[0].trim());
}

/** A cell's text without its hidden tags */
export function withoutTags(cell: string): string {
  return cell.replace(TAG_RE, "").trim();
}

export function attributesOf(tag: string): string[] {
  return Array.from(tag.matchAll(ATTRIBUTE_RE), (match) => match[1]!.toLowerCase());
}

/** A cell without the hidden tags that have one of these attributes */
export function withoutTagsWith(cell: string, attributes: ReadonlySet<string>): string {
  const kept = cellTags(cell).filter((tag) => !attributesOf(tag).some((name) => attributes.has(name)));
  return [withoutTags(cell), ...kept].filter((part) => part !== "").join(" ");
}

/**
 * `value` (a cell's new markdown) with the hidden tags `from` (the cell as it
 * was) has, but those `value` has itself (a tag with an attribute of one of
 * its own) and those with an attribute in `taken` (the modules that manage
 * them wrote what they want in `value`)
 */
export function keepTags(value: string, from: string, taken: ReadonlySet<string> = new Set()): string {
  const own = new Set(cellTags(value).flatMap(attributesOf));
  const kept = cellTags(from).filter((tag) => !attributesOf(tag).some((name) => own.has(name) || taken.has(name)));
  return [value.trim(), ...kept].filter((part) => part !== "").join(" ");
}
