# CLAUDE.md

Guidance for Claude Code when working in `web/`: a short list of trip-wires that are easy to hit without noticing, each pointing at the `SPEC.md` section that owns the full rule and its reasoning. This file deliberately restates as little as possible; if it ever disagrees with `SPEC.md`, one of the two is a bug: fix that one.

@AGENTS.md

- **Route guards live in `proxy.ts`, never `middleware.ts`.** Next.js 16 renamed it, and a `middleware.ts` file is silently ignored. The path lists (`OPEN_PATHS`, `PUBLIC_PATHS`), the load-bearing `config.matcher` exclusions, and the reasoning behind them are specified in `SPEC.md` § Route guard; edit them there, never from memory here.
- **Every route renders dynamically on purpose** (the per-request CSP nonce requires it), so there is no static optimization left to win: don't add `force-static` or reach for prerendering. `SPEC.md` § Route guard.
- **`'use cache'` requires `cacheComponents: true`, which this project does not set.** Enabling the flag is a whole-app decision, not a fix for one component. `SPEC.md` § Caching (`use cache`).
- **Style with brand tokens only** (`bg-cobalt`, `text-danger`, …), never Tailwind's stock palette; radius is `0`; bare `transition` is already branded; exactly four `.kk-*` custom classes exist; the focus ring is declared once, globally. Full rules and the reasoning: `SPEC.md` § Design system.
