import { describe, expect, it } from "vitest";
import { MANAGED_MARKER, withConfigSettings } from "./configpage.ts";

describe("Silverware Table's settings in the configuration page", () => {
  const block = (...lines: string[]) => "```space-lua\n" + [MANAGED_MARKER, ...lines].join("\n") + "\n```";

  it("adds the Configuration Manager's block where there is none, after what the page has", () => {
    expect(withConfigSettings("", { "silverware.table.metadata": true })).toBe(`${block('config.set("silverware.table.metadata", true)')}\n`);
    expect(withConfigSettings("# Configuration\n", { "silverware.table.maxHeight": 300 })).toBe(
      `# Configuration\n\n${block('config.set("silverware.table.maxHeight", 300)')}\n`,
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
      block('config.set("shortWikiLinks", true)', 'config.set("silverware.table.metadata", false)', 'command.update { name = "Navigate: Home", key = "Ctrl-h" }'),
      "",
      "Notes after it.",
      "",
    ].join("\n");
    const next = withConfigSettings(page, { "silverware.table.metadata": true, "silverware.table.modules.longText.overflow": 'ell"ipsis' });
    expect(next).toBe(
      page.replace(
        block('config.set("shortWikiLinks", true)', 'config.set("silverware.table.metadata", false)', 'command.update { name = "Navigate: Home", key = "Ctrl-h" }'),
        block(
          'config.set("shortWikiLinks", true)',
          'config.set("silverware.table.metadata", true)',
          'command.update { name = "Navigate: Home", key = "Ctrl-h" }',
          'config.set("silverware.table.modules.longText.overflow", "ell\\"ipsis")',
        ),
      ),
    );
  });

  it("keeps a page's CRLF line endings, finds single-quoted lines, leaves a value spanning lines (the line after it wins)", () => {
    const crlf = ["Intro", "", "```space-lua", MANAGED_MARKER, "config.set('silverware.table.metadata', false)", 'config.set("silverware.table.modules.filters", {', "  enabled = false,", "})", "```", ""].join("\r\n");
    expect(withConfigSettings(crlf, { "silverware.table.metadata": true, "silverware.table.modules.filters.enabled": true })).toBe(
      ["Intro", "", "```space-lua", MANAGED_MARKER, 'config.set("silverware.table.metadata", true)', 'config.set("silverware.table.modules.filters", {', "  enabled = false,", "})", 'config.set("silverware.table.modules.filters.enabled", true)', "```", ""].join("\r\n"),
    );
  });

  it("removes a setting back at its default, and the block once nothing is left in it", () => {
    const page = `Intro\n\n${block('config.set("silverware.table.metadata", true)', 'config.set("silverware.table.maxHeight", 300)')}\n\nEnd\n`;
    expect(withConfigSettings(page, { "silverware.table.maxHeight": undefined })).toBe(`Intro\n\n${block('config.set("silverware.table.metadata", true)')}\n\nEnd\n`);
    expect(withConfigSettings(page, { "silverware.table.maxHeight": undefined, "silverware.table.metadata": undefined })).toBe("Intro\n\n\nEnd\n");
    // Nothing to set, no block: the page as it was
    expect(withConfigSettings("Intro\n", { "silverware.table.metadata": undefined })).toBe("Intro\n");
  });
});
