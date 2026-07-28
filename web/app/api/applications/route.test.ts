import { beforeEach, describe, expect, it, vi } from "vitest";

// The first test of a route handler in this codebase, and the seam that was
// missing when the BFF silently stopped forwarding `q`. A route handler is a
// plain Request -> Response function: no server, no browser, no DB. Only
// apiFetch needs standing in for, because it reads the httpOnly cookie through
// next/headers and would otherwise demand a request context.
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/api", () => ({ apiFetch }));

const { NextRequest } = await import("next/server");
const { GET } = await import("./route");

function get(url: string) {
  return GET(new NextRequest(url));
}

/** The path apiFetch was asked for, as a URLSearchParams. */
function forwardedParams() {
  const path = apiFetch.mock.calls.at(-1)?.[0] as string;
  return new URLSearchParams(path.slice(path.indexOf("?") + 1));
}

describe("GET /api/applications", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true, status: 200, data: { data: [], meta: {} }, authHeader: null });
  });

  it("forwards the search term to the API", async () => {
    await get("http://localhost/api/applications?q=Mercari");
    expect(forwardedParams().get("q")).toBe("Mercari");
  });

  it("forwards every filter together", async () => {
    await get(
      "http://localhost/api/applications?status=applied,offer&company=Acme&source=linkedin&japanese_level=n2&q=backend&after=9&limit=25",
    );
    const sent = forwardedParams();
    expect(Object.fromEntries(sent)).toEqual({
      status: "applied,offer",
      company: "Acme",
      source: "linkedin",
      japanese_level: "n2",
      q: "backend",
      after: "9",
      limit: "25",
    });
  });

  it("returns the API payload unchanged on success", async () => {
    const payload = { data: [{ id: 1 }], meta: { next_cursor: null } };
    apiFetch.mockResolvedValue({ ok: true, status: 200, data: payload, authHeader: null });

    const response = await get("http://localhost/api/applications");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(payload);
  });

  it("passes the API's status through on failure rather than masking it as a 200", async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 503, error: "upstream down" });

    const response = await get("http://localhost/api/applications?q=x");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "upstream down" });
  });
});
