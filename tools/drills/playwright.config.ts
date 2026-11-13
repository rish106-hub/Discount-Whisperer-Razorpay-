// T7 drill runner. CHROME_PATH overrides the browser binary (the bundled headless shell may be missing).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "..",
  testMatch: /(drills|smoke)\/.*\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.DEMO_URL ?? "http://localhost:8787" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : {}) } }],
});
