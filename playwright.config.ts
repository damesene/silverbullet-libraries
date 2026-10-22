// Interaction tests in a real browser, against the playground (npm run test:ui):
// what needs layout, pointers, touch and tables rendered anew, which jsdom
// (npm test) has not. Playwright's own Chromium (npm run test:ui:install, once):
// the version Playwright pins, the same on every machine and in CI, nothing
// installed by hand. The playground bundles silverware-table/src, so the tests run the sources, not the
// committed silverware-table.js (npm run verify checks that one matches them).
import { defineConfig, devices } from "@playwright/test";

const port = 8010;

export default defineConfig({
  // Each plugin's interaction tests, in its own folder (<plugin>/ui-tests/)
  testMatch: "*/ui-tests/**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A flaky interaction shows as flaky (retried once), not as a pass
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    viewport: { width: 1200, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mouse", testIgnore: /touch\.spec\.ts/ },
    { name: "touch", testMatch: /touch\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/playground.mjs",
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
