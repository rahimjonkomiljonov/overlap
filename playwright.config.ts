import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  // Onboarding a user uploads three photos; against real Supabase Storage that takes
  // ~15-20s per user, and most specs onboard two users before their own assertions even
  // start. 30s (Playwright's default) is below that floor. CI's local dev-storage fallback
  // is much faster, so this only adds headroom there.
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // In CI the app is built first (see .github/workflows/ci.yml).
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Enables the development-only /dev/ui design-system gallery for the tests.
    env: { ENABLE_DEV_UI: "true" },
  },
});
