// Interaction tests in a real browser, against the playground (npm run test:ui):
// what needs layout, pointers, touch and tables rendered anew, which jsdom
// (npm test) has not. Chrome as installed: no browser is downloaded.
import { defineConfig, devices } from "@playwright/test";

const port = 8010;

export default defineConfig({
  testDir: "ui-tests",
  fullyParallel: true,
  // A flaky interaction shows as flaky (retried once), not as a pass
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    channel: "chrome",
    viewport: { width: 1200, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mouse", testIgnore: /touch\.spec\.ts/ },
    { name: "touch", testMatch: /touch\.spec\.ts/, use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: {
    command: "node scripts/playground.mjs",
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
