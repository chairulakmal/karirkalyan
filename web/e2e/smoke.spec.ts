import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests covering critical happy paths.
 *
 * These used to open by registering a throwaway account, which is exactly the
 * affordance v1.4.1 removed (SPEC.md § Registration is closed). They now sign in
 * as `e2e@karirkalyan.com`, seeded by `db/seeds.rb` and left empty — deliberately
 * not the demo account, which holds twelve applications and would swamp any
 * assertion about the row a test just created.
 *
 * The account outlives a run, so nothing here may assume an empty dashboard.
 * Each test names its company uniquely and asserts on that.
 */
const EMAIL = "e2e@karirkalyan.com";
const PASSWORD = "oretachinomachida";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("sign in, create an application, transition status", async ({ page }) => {
  const company = `Mercari ${Date.now()}`;

  await signIn(page);

  await page.getByRole("link", { name: /new application/i }).first().click();
  await page.waitForURL("/applications/new");

  await page.getByLabel("Company").fill(company);
  await page.getByLabel("Role").fill("Backend Engineer");
  await page.getByRole("button", { name: /create application/i }).click();

  // Lands on the detail page with the application visible
  await page.waitForURL(/\/applications\/\d+$/);
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  await expect(page.getByText("Backend Engineer")).toBeVisible();

  // The transition section renders a badge per reachable status too, so scope
  // the status assertion to the badge beside the heading. The page's <header>
  // is the only one inside <main> — the nav's lives in the layout, outside it.
  const statusBadge = page.locator("main header").getByText(/^(Draft|Applied)$/);
  await expect(statusBadge).toHaveText("Draft");

  // Transition buttons are labelled "→ Applied" (transitions.goTo)
  await page.getByRole("button", { name: /→ Applied/i }).click();
  await expect(statusBadge).toHaveText("Applied");

  // Timeline records the transition as "Draft → Applied"
  const timeline = page.locator("main ol");
  await expect(timeline).toContainText("Draft");
  await expect(timeline).toContainText("Applied");
});

test("create application with resume attached at creation", async ({ page }) => {
  const company = `Sansan ${Date.now()}`;

  await signIn(page);

  await page.goto("/applications/new");
  await page.getByLabel("Company").fill(company);
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

  // The "View · uploaded …" link only renders once resume_updated_at is set, so
  // its presence is the proof the file was stored during creation.
  await expect(page.getByRole("link", { name: /^view ·/i })).toBeVisible();
});
