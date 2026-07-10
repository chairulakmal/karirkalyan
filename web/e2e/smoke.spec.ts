import { test, expect } from "@playwright/test";

/**
 * Smoke tests covering critical happy paths.
 *
 * Each run uses a fresh email so tests never collide with previous runs.
 * The AuthForm merges sign-in/sign-up into one component with a tab toggle,
 * so both tabs render a "Create account" button. Use `last()` to target the
 * submit button, which appears after the tab toggle in the DOM.
 */
test("sign up, create an application, transition status", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  // — Sign up —
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  // Two "Create account" buttons exist: the tab toggle and the submit button.
  await page.getByRole("button", { name: /create account/i }).last().click();

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

  // The StatusHelp disclosure also renders a badge per reachable status, so
  // scope status assertions to the page header's badge.
  const statusBadge = page.locator("main header").getByText(/^(Draft|Applied)$/);

  // Status starts at "Draft" — transition to Applied
  await expect(statusBadge).toHaveText("Draft");
  await page.getByRole("button", { name: /applied/i }).first().click();

  // Status badge now reads "Applied"
  await expect(statusBadge).toHaveText("Applied");

  // Timeline reflects the transition
  await expect(page.getByText(/draft.*applied/i)).toBeVisible();
});

test("create application with resume attached at creation", async ({ page }) => {
  const email = `e2e-upload-${Date.now()}@example.com`;
  const password = "password123";

  // — Sign up —
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create account/i }).last().click();
  await page.waitForURL("/dashboard");

  // — New application with resume —
  await page.goto("/applications/new");
  await page.getByLabel("Company").fill("Sansan");
  await page.getByLabel("Role").fill("Ruby Engineer");

  // Attach a minimal valid PDF (magic bytes + padding to satisfy the validator)
  const fakePdf = Buffer.from("%PDF-1.4 playwright smoke test resume fixture");
  await page.locator('input[name="resume"]').setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: fakePdf,
  });

  await page.getByRole("button", { name: /create application/i }).click();
  await page.waitForURL(/\/applications\/\d+$/);

  // The "View" link appears when resume_updated_at is set — it should be
  // present immediately since the file was stored at creation time.
  await expect(page.getByRole("link", { name: /view/i }).first()).toBeVisible();
});
