// Local targets only. DEMO_URL defaults to the local Worker. Set DEMO_URL to point at another local port.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.DEMO_URL ?? "http://localhost:8787",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
