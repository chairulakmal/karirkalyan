import { expect, test } from "@playwright/test";

/**
 * The share-sheet deep link (SPEC.md § Installable app § Share target).
 * `share_target` maps a share onto GET /applications/new?title=&text=&url=;
 * Playwright has no share sheet, so these drive the same URLs a WebAPK share
 * produces — which is also the point of the contract: the share sheet is one
 * caller of a plain deep link.
 *
 * The auto-run assertion is on the *announcement*, not on extraction success:
 * in CI there is no ANTHROPIC_API_KEY so every pre-fill answers
 * prefill_unavailable, and locally the .invalid TLD can never resolve — either
 * way the pre-fill ends in the role="alert" line, and that line appearing
 * without a single click is the proof the deep link fired it.
 */

const POSTING_URL = "https://job-board.invalid/posting/123";

test("a shared URL is extracted from the text param and auto-runs the pre-fill", async ({
  page,
}) => {
  // Most Android apps put the link in `text`, wrapped in prose — the likeliest
  // real payload, so it is the one driven here.
  const sharedText = `Check out this role ${POSTING_URL} — looks like a fit.`;
  await page.goto(`/applications/new?text=${encodeURIComponent(sharedText)}`);

  await expect(page.locator('input[name="url"]')).toHaveValue(POSTING_URL);
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
});

test("a URL inside Japanese prose ends at the fullwidth punctuation", async ({
  page,
}) => {
  // Japanese has no spaces, so a naive \S+ match would run from the scheme to
  // the end of the sentence — the review finding this spec pins. The URL must
  // come out exact, with the surrounding prose left behind.
  const sharedText = `詳細は${POSTING_URL}（応募はお早めに）をご覧ください`;
  await page.goto(`/applications/new?text=${encodeURIComponent(sharedText)}`);

  await expect(page.locator('input[name="url"]')).toHaveValue(POSTING_URL);
});

test("a text-only share opens the paste box seeded, and runs nothing", async ({
  page,
}) => {
  const posting = "Backend Engineer at Example — Ruby, Rails, PostgreSQL. Tokyo, hybrid.";
  await page.goto(`/applications/new?text=${encodeURIComponent(posting)}`);

  await expect(page.getByLabel(/paste the posting yourself/i)).toHaveValue(posting);
  await expect(page.locator('input[name="url"]')).toHaveValue("");
  // Nothing ran: no failure announced, no success reported.
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a signed-out share keeps its query through the sign-in bounce", async ({
  playwright,
  baseURL,
}) => {
  // An explicitly empty storageState: `newContext` inherits the project's
  // `use.storageState` — the e2e session — and this needs the proxy to see no
  // cookie at all, exactly like a morning share under an expired 1-day JWT.
  // (Verified: without the override, this request arrives signed in and 200s.)
  const ctx = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const response = await ctx.get(
    `/applications/new?url=${encodeURIComponent(POSTING_URL)}`,
    { maxRedirects: 0 },
  );

  expect(response.status()).toBe(307);
  const location = new URL(response.headers()["location"], baseURL);
  expect(location.pathname).toBe("/sign-in");
  expect(location.searchParams.get("url")).toBe(POSTING_URL);

  await ctx.dispose();
});
