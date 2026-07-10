# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

@AGENTS.md

### Route guards (Next.js 16 proxy pattern)

Next.js 16 renamed `middleware.ts` → `proxy.ts`. Do **not** create `middleware.ts` — it is ignored.

- The exported function must be named `proxy` (not `middleware`).
- Use the `NextProxy` type for the function signature, or import `NextRequest` / `NextResponse` from
  `next/server` as before.
- A `config.matcher` array still controls which paths the proxy runs on.
- Proxy runs in the **Node.js runtime** by default (not Edge) in v16.

The guard lives in `web/proxy.ts` (repo root of `web/` — there is no `src/` directory). It is
role-free: authorization is a single check for the presence of the `session` cookie.

- `PUBLIC_PATHS` = `/`, `/sign-in`, `/sign-up` — reachable without a cookie.
- Any other path without a cookie → redirect to `/sign-in`.
- A public path *with* a cookie → redirect to `/dashboard`, so signed-in users never see the
  marketing or auth pages.

`config.matcher` **must** keep excluding `/robots.txt`, `/sitemap.xml`, and `/llms.txt`. If the
proxy runs on those, crawlers get a `307` to `/sign-in` and the whole SEO surface disappears.

### CSP nonce forces dynamic rendering

`proxy.ts` also builds the Content-Security-Policy per request, so `script-src` can carry a fresh
nonce instead of `'unsafe-inline'`. Nonces are only applied during SSR, so `app/layout.tsx` calls
`await connection()` to opt every route into dynamic rendering. A statically prerendered page would
be built with no nonce and its scripts blocked in production.

Consequence worth knowing before optimizing: **there is no static optimization left to lose.**
Don't add `export const dynamic = "force-static"` or reach for prerendering wins — they either
do nothing or break the CSP.

### Caching (`use cache` directive)

Next.js 16 introduces a `'use cache'` directive. It is **not** the same as `React.cache` or
`unstable_cache`.

`use cache` is a Cache Components feature and requires `cacheComponents: true` in `next.config.ts`,
which **this project does not set**. Adding the directive without the flag will not silently
degrade — Next.js rejects it. Enabling the flag is a deliberate decision that interacts with the
dynamic-rendering constraint above; don't switch it on to fix a single component.

If it is ever enabled: caching belongs at the component or data-fetch layer, never on a server
action or a mutation in `app/lib/actions.ts`.
