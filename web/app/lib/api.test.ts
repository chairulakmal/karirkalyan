import { beforeEach, describe, expect, it, vi } from "vitest";

const incoming = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => incoming.headers,
}));

const { clientIpHeaders } = await import("./api");

describe("clientIpHeaders", () => {
  beforeEach(() => {
    incoming.headers = new Headers();
  });

  it("forwards Cloudflare's client IP as X-Forwarded-For", async () => {
    incoming.headers.set("cf-connecting-ip", "203.0.113.9");
    expect(await clientIpHeaders()).toEqual({ "X-Forwarded-For": "203.0.113.9" });
  });

  it("accepts an IPv6 address", async () => {
    incoming.headers.set("cf-connecting-ip", "2001:db8::1");
    expect(await clientIpHeaders()).toEqual({ "X-Forwarded-For": "2001:db8::1" });
  });

  it("forwards nothing without the header (local development)", async () => {
    expect(await clientIpHeaders()).toEqual({});
  });

  it("forwards nothing when the header is not an IP address", async () => {
    incoming.headers.set("cf-connecting-ip", "1.2.3.4, 5.6.7.8");
    expect(await clientIpHeaders()).toEqual({});
  });
});
