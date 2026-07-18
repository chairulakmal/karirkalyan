import { test, expect } from "@playwright/test";

import { EMAIL } from "./credentials";

/**
 * The header's account menu (SPEC.md § Auth flow). The chip's initial and the
 * menu's email row both come from the httpOnly `account_email` cookie the
 * sign-in handler set during `auth.setup.ts`, so these assertions are also
 * the proof that the cookie made it through sign-in and into the layout.
 */
test("account chip shows the initial and the menu reaches settings", async ({ page }) => {
  await page.goto("/dashboard");

  // Scoped to the header: the dashboard's ProfileCard shows the same email,
  // and unscoped text lookups would match both.
  const header = page.locator("header").first();

  // Accessible name carries the full email; the visible glyph is one initial
  // from the local part: the seeded account's "e".
  const chip = header.getByRole("button", { name: new RegExp(EMAIL) });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText(EMAIL.charAt(0).toUpperCase());
  await expect(chip).toHaveAttribute("aria-expanded", "false");

  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(header.getByText(EMAIL, { exact: true })).toBeVisible();

  // Escape closes and returns focus to the chip.
  await page.keyboard.press("Escape");
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(chip).toBeFocused();

  // Choosing Settings navigates and closes the menu.
  await chip.click();
  await header.getByRole("link", { name: /settings/i }).click();
  await page.waitForURL("/settings");
  await expect(chip).toHaveAttribute("aria-expanded", "false");
});

test("sign-out lives in the menu, not on the header bar", async ({ page }) => {
  await page.goto("/dashboard");

  const header = page.locator("header").first();
  const signOut = header.getByRole("button", { name: /sign out/i });
  await expect(signOut).toHaveCount(0);

  await header.getByRole("button", { name: new RegExp(EMAIL) }).click();
  await expect(signOut).toBeVisible();
  // Not clicked: signing out here would revoke the shared storageState the
  // rest of the suite reuses (see auth.setup.ts).
});
