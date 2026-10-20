// Table Plus' settings in the space's configuration page (CONFIG), where
// SilverBullet's Configuration Manager keeps what it sets: a space-lua block
// starting with its marker, one `config.set(path, value)` line per setting.
// Table Plus edits only its own lines there (they are the Configuration
// Manager's too: either shows and changes what the other wrote), every other
// line (other libraries, shortcuts) is kept as written. Verified in
// SilverBullet's source (plugs/configuration-manager/config_block.ts,
// configuration.ts, lua.ts).

export const CONFIG_PAGE = "CONFIG";
export const MANAGED_MARKER = "-- managed-by: configuration-manager";

// A setting's value as Lua: a boolean, a number or a string
function toLua(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
}

/**
 * The path a `config.set("path", value)` line sets, where the whole call is on
 * the line (a value spanning lines, a table, is left alone: the line written
 * after it wins, Lua running them in order)
 */
function pathOf(line: string): string | undefined {
  const m = /^\s*config\.set\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*,.*\)\s*$/.exec(line);
  return m ? m[2]!.replace(/\\(.)/g, "$1") : undefined;
}

/**
 * The configuration page's text with `values` set in the managed block: a
 * value replaces its path's line (or is added at the end), undefined removes
 * it. The block is added where there is none, and removed when nothing is left
 * in it. The page's line endings are kept.
 */
export function withConfigSettings(text: string, values: Readonly<Record<string, unknown>>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  // (Spaces after a fence, not the lines after it)
  const fence = /^```space-lua[ \t]*\r?\n([\s\S]*?)^```[ \t]*(?=\r?$)/gm;
  let block: { start: number; end: number; inner: string } | undefined;
  for (let m = fence.exec(text); m; m = fence.exec(text)) {
    if (m[1]!.trimStart().startsWith(MANAGED_MARKER)) {
      block = { start: m.index, end: m.index + m[0].length, inner: m[1]! };
      break;
    }
  }
  const lines = block ? block.inner.replace(/\r?\n$/, "").split(/\r?\n/) : [MANAGED_MARKER];
  const pending = new Map(Object.entries(values));
  const kept: string[] = [];
  for (const line of lines) {
    const path = pathOf(line);
    if (path === undefined || !pending.has(path)) {
      kept.push(line);
      continue;
    }
    const value = pending.get(path);
    pending.delete(path);
    if (value !== undefined) kept.push(`config.set(${toLua(path)}, ${toLua(value)})`);
  }
  for (const [path, value] of pending) {
    if (value !== undefined) kept.push(`config.set(${toLua(path)}, ${toLua(value)})`);
  }
  const empty = kept.every((line) => line.trim() === "" || line.trim() === MANAGED_MARKER);
  if (!block) {
    if (empty) return text;
    const separator = text === "" || text.endsWith(eol + eol) ? "" : text.endsWith(eol) ? eol : eol + eol;
    return `${text}${separator}\`\`\`space-lua${eol}${kept.join(eol)}${eol}\`\`\`${eol}`;
  }
  if (empty) {
    // The block goes, with the line it ended
    const end = text.startsWith(eol, block.end) ? block.end + eol.length : block.end;
    return text.slice(0, block.start) + text.slice(end);
  }
  return `${text.slice(0, block.start)}\`\`\`space-lua${eol}${kept.join(eol)}${eol}\`\`\`${text.slice(block.end)}`;
}
