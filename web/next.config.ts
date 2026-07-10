import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The Content-Security-Policy lives in proxy.ts, not here: it is generated per
// request so script-src can carry a fresh nonce (dropping 'unsafe-inline' for
// scripts) which a static header can't do. The static, request-independent
// security headers below stay here.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Enables app/global-not-found.tsx. Needed because the root layout sits under
    // a dynamic segment (app/[locale]/layout.tsx), leaving no layout for Next to
    // build a 404 from for paths that match no route. See app/global-not-found.tsx.
    globalNotFound: true,
  },
};

// Points next-intl at `i18n/request.ts` (its default location).
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
