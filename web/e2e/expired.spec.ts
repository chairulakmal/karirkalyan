import { expect, test } from "@playwright/test";

/**
 * The expired-session bounce must emit a *relative* Location. Behind Railway's
 * proxy the app sees `Host: localhost:8080`, so an absolute URL built from
 * `request.url` sent real browsers to https://localhost:8080 — the bug these
 * specs pin. Fresh request contexts, not the shared `request` fixture: the
 * suite's storageState carries a session cookie, and the ja assertion needs
 * the proxy to see no session at all, exactly like a just-expired visitor.
 */
test.describe("expired session bounce", () => {
  test("redirects with a relative Location and clears the cookie", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await playwright.request.newContext({ baseURL });
    const response = await ctx.get("/api/auth/expired", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe("/sign-in?expired=1");
    expect(response.headers()["set-cookie"]).toContain("session=;");

    await ctx.dispose();
  });

  test("a ja visitor lands on the ja sign-in", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await playwright.request.newContext({ baseURL });
    const response = await ctx.get("/sign-in?expired=1", {
      maxRedirects: 0,
      headers: { cookie: "NEXT_LOCALE=ja" },
    });

    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe("/ja/sign-in?expired=1");

    await ctx.dispose();
  });
});
