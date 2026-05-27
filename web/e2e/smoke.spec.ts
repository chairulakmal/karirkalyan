import { test, expect } from "@playwright/test";

/**
 * Smoke test covering the critical happy path:
 *   sign up → land on dashboard → create application → see it in detail
 *
 * Each run uses a fresh email so the test never collides with previous runs.
 */
test("sign up, create an application, transition status", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  // — Sign up —
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();

  // Lands on dashboard
  await page.waitForURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("No applications yet.")).toBeVisible();

  // — Create application —
  await page.getByRole("link", { name: /add your first one/i }).click();
  await page.waitForURL("/applications/new");

  await page.getByLabel("Company").fill("Mercari");
  await page.getByLabel("Role").fill("Backend Engineer");
  await page.getByRole("button", { name: /create application/i }).click();

  // Lands on detail page with the application visible
  await page.waitForURL(/\/applications\/\d+$/);
  await expect(page.getByRole("heading", { name: "Mercari" })).toBeVisible();
  await expect(page.getByText("Backend Engineer")).toBeVisible();

  // Status starts at "Draft" — transition to Applied
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /applied/i }).first().click();

  // Status badge now reads "Applied"
  await expect(page.getByText("Applied", { exact: true }).first()).toBeVisible();

  // Timeline reflects the transition
  await expect(page.getByText(/draft.*applied/i)).toBeVisible();
});
