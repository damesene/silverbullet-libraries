import { describe, expect, it } from "vitest";
import { MANAGED_MARKER, withConfigSettings } from "./configpage.ts";

describe("Table Plus' settings in the configuration page", () => {
  const block = (...lines: string[]) => "```space-lua\n" + [MANAGED_MARKER, ...lines].join("\n") + "\n```";

  it("adds the Configuration Manager's block where there is none, after what the page has", () => {
    expect(withConfigSettings("", { "tablePlus.metadata": true })).toBe(`${block('config.set("tablePlus.metadata", true)')}\n`);
    expect(withConfigSettings("# Configuration\n", { "tablePlus.maxHeight": 300 })).toBe(
      `# Configuration\n\n${block('config.set("tablePlus.maxHeight", 300)')}\n`,
    );
  });

  it("changes its own lines, adds new ones, and keeps every other line as written", () => {
    const page = [
      "# Configuration",
      "",
      "```space-lua",
      'config.set("theme", "dark")',
      "```",
      "",
      block('config.set("shortWikiLinks", true)', 'config.set("tablePlus.metadata", false)', 'command.update { name = "Navigate: Home", key = "Ctrl-h" }'),
      "",
      "Notes after it.",
      "",
    ].join("\n");
    const next = withConfigSettings(page, { "tablePlus.metadata": true, "tablePlus.modules.longText.overflow": 'ell"ipsis' });
    expect(next).toBe(
      page.replace(
        block('config.set("shortWikiLinks", true)', 'config.set("tablePlus.metadata", false)', 'command.update { name = "Navigate: Home", key = "Ctrl-h" }'),
        block(
          'config.set("shortWikiLinks", true)',
          'config.set("tablePlus.metadata", true)',
          'command.update { name = "Navigate: Home", key = "Ctrl-h" }',
          'config.set("tablePlus.modules.longText.overflow", "ell\\"ipsis")',
        ),
      ),
    );
  });

  it("keeps a page's CRLF line endings, finds single-quoted lines, leaves a value spanning lines (the line after it wins)", () => {
    const crlf = ["Intro", "", "```space-lua", MANAGED_MARKER, "config.set('tablePlus.metadata', false)", 'config.set("tablePlus.modules.filters", {', "  enabled = false,", "})", "```", ""].join("\r\n");
    expect(withConfigSettings(crlf, { "tablePlus.metadata": true, "tablePlus.modules.filters.enabled": true })).toBe(
      ["Intro", "", "```space-lua", MANAGED_MARKER, 'config.set("tablePlus.metadata", true)', 'config.set("tablePlus.modules.filters", {', "  enabled = false,", "})", 'config.set("tablePlus.modules.filters.enabled", true)', "```", ""].join("\r\n"),
    );
  });

  it("removes a setting back at its default, and the block once nothing is left in it", () => {
    const page = `Intro\n\n${block('config.set("tablePlus.metadata", true)', 'config.set("tablePlus.maxHeight", 300)')}\n\nEnd\n`;
    expect(withConfigSettings(page, { "tablePlus.maxHeight": undefined })).toBe(`Intro\n\n${block('config.set("tablePlus.metadata", true)')}\n\nEnd\n`);
    expect(withConfigSettings(page, { "tablePlus.maxHeight": undefined, "tablePlus.metadata": undefined })).toBe("Intro\n\n\nEnd\n");
    // Nothing to set, no block: the page as it was
    expect(withConfigSettings("Intro\n", { "tablePlus.metadata": undefined })).toBe("Intro\n");
  });
});
