import { test as setup, expect } from "@playwright/test";

import { EMAIL, PASSWORD, STORAGE_STATE } from "./credentials";

/**
 * Signs in once per run and saves the session cookie for every other project to reuse.
 *
 * This is not just a speed-up. Rack::Attack is live outside the test environment
 * (`Rack::Attack.enabled = !Rails.env.test?`), and the Playwright suite drives the
 * *development* server: sign-in is throttled at 5/min per IP and 10 per 5 min per email.
 * A suite that signed in per test would climb towards that ceiling as it grew, and the
 * counters survive between runs because `reuseExistingServer` keeps the same process —
 * and with it the same memory_store — warm. One sign-in per run keeps a long way clear.
 */
setup("sign in", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await page.waitForURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
