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

Route guards in `src/proxy.ts`:

- `/desk/*` → Support+
- `/admin/*` → Manager+
- `/super/*` → Super only

### Caching (`use cache` directive)

Next.js 16 introduces a `'use cache'` directive (requires `cacheComponents: true` in `next.config`).
It is **not** the same as `React.cache` or `unstable_cache`. Avoid adding it to server actions or
service functions — caching belongs at the component or data-fetch layer, not the mutation layer.

