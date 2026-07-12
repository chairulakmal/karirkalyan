import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *
 * Starts the Rails API on :3001 and Next.js on :3000 if they aren't already
 * running. Requires Postgres up locally (run `docker compose up -d` from `api/`
 * first) — it is the only container.
 *
 * Tests sign in as the seeded `e2e` account (`bin/rails db:seed`) — they used to
 * register a throwaway one, which is the affordance v1.4.1 removed. The account
 * therefore survives a run, so no test may assume an empty dashboard: each names
 * its company uniquely and asserts on the row it just created. Nothing needs
 * cleaning up between runs; the rows simply accumulate in the dev database.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "cd ../api && bin/rails server -p 3001",
      url: "http://localhost:3001/up",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        RAILS_ENV: "development",
      },
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
