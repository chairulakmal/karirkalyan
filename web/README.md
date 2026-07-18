# KarirKalyan — Next.js Frontend

The operational README for `web/`, KarirKalyan's Next.js 16 App Router frontend — how it authenticates, routes, and runs locally. The most important rule in it: the JWT never reaches client JavaScript — sign-in exchanges the token through a route handler that sets an `httpOnly` cookie, which is one reason Next.js was chosen over a pure SPA. Contents: the stack, the auth design, i18n and its CI-enforced catalog parity, the screens, local setup, and the Playwright end-to-end suite. How the system works and why lives in [`SPEC.md`](../SPEC.md); this file is what you type.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- next-intl — English + Japanese

## Auth design

The Rails API issues a JWT in the `Authorization` response header on sign-in. Rather than storing it in `localStorage` (XSS risk), a Next.js route handler (`/api/auth/session`) receives it and sets an `httpOnly` cookie. All subsequent requests attach the cookie automatically. The token is never accessible to client-side JS.

This pattern requires a server component — it's one reason Next.js was chosen over a pure Vite/SPA setup.

## i18n

Every page lives under a `[locale]` segment — `en` and `ja` (`i18n/routing.ts`, messages in `messages/en.json` and `messages/ja.json`). Import `Link`, `redirect`, `useRouter` and friends from **`i18n/navigation.ts`**, never from `next/link` / `next/navigation` directly: the wrapped versions carry the active locale through, the originals silently drop it.

**The two catalogs move together, and CI checks it.** `npm run lint:i18n` (`scripts/check-i18n-parity.mjs`) diffs their paths and fails on any path present in one and missing from the other, or whose value type differs. It runs in the web CI job ahead of the build, because a missing `ja` key builds clean — nothing about it is a type error. `i18n/request.ts` loads one catalog and sets no fallback locale, so there is no English to fall back to: next-intl renders the key path itself (`dashboard.yourData`) and console.errors into a server log nobody reads. Run it before pushing a copy change.

## Screens

`localePrefix` is `"as-needed"` (`i18n/routing.ts`): Japanese is prefixed (`/ja/dashboard`), English keeps the bare path (`/dashboard`). `/en/*` is **not** a live URL — next-intl `307`s it to the unprefixed form, so each page has exactly one canonical URL. Routes below are written in their English (bare) form.

| Route | Content |
|---|---|
| `/` | Landing page |
| `/sign-in` | The only auth form — POSTs to Rails, exchanges the token through `/api/auth/session`. There is **no** `/sign-up`: registration is closed (SPEC.md § Registration is closed) |
| `/dashboard` | Applications list with status badges and `follow_up_at` indicators, plus stats summary |
| `/board` | Kanban board — drag a card to run an FSM transition; legality read from `GET /api/v1/transitions`, optimistic with a `409` snap-back |
| `/applications/new` | Create a new application — includes the AI job-URL pre-fill |
| `/applications/[id]` | Detail view — FSM transition buttons (from `valid_next_states`), timeline entries, resume/cover letter upload |
| `/settings` | Passkey enrollment (create and revoke; feature-detected, desktop-first) and the push-notification toggle for the follow-up digest. The only place the notification-permission prompt can fire |
| `/about`, `/docs` | Project write-up and documentation |
| `/privacy`, `/terms` | Legal pages, both locales — readable signed in or out |

## Local setup

**Prerequisites:** Node 24 (matches Railway production)

Node is pinned in **one** place — `.nvmrc` — and everything else reads it: `actions/setup-node` via `node-version-file`, and Railpack when it builds the production image. `package.json` restates it as `engines.node` because Railpack consults that first. Keep the two in step; a CI runtime that differs from production's is how the `npm ci` lockfile divergence bit twice.

```bash
npm install
npm run dev   # :3000
```

Expects the Rails API on `:3001`. Copy `.env.example` to `.env.local` if you need to override `API_URL` (server-side only — never exposed to the browser).

## End-to-end tests (Playwright)

Smoke tests cover the critical paths: create an application and transition its status, and create one with a resume attached.

```bash
# Prereqs: Postgres running (cd ../api && docker compose up -d)
#          and seeded    (cd ../api && bin/rails db:seed)

npm run test:e2e            # headless run
npm run test:e2e:ui         # interactive UI mode for debugging
```

Playwright auto-starts the Rails API (`:3001`) and Next.js (`:3000`) via its `webServer` config; if they're already running, it reuses them.

**The suite signs in once, not once per test.** The `setup` project (`e2e/auth.setup.ts`) signs in as the seeded `e2e` account and hands its session to every other project through Playwright's `storageState`, so the specs open already authenticated. Tests used to register a throwaway account each — that is the affordance v1.4.1 removed, and it is not the only reason: Rack::Attack is live outside the test environment and the suite drives the *development* server, where sign-in is throttled at 5/min per IP. A suite that signed in per test would walk into that ceiling as it grew.

Two consequences worth knowing before adding a test:

- **The account is seeded, not created** — `bin/rails db:seed` is a prerequisite, not a nicety. `api/db/seeds.rb` creates it (guarded `unless Rails.env.production?`), and `e2e/credentials.ts` reads the same `E2E_EMAIL` / `E2E_PASSWORD` env vars with the same defaults. Change one side and you must change the other.
- **Nothing is cleaned up between runs**, and the account survives them, so no test may assume an empty dashboard. Each names its company uniquely (`Mercari ${Date.now()}`) and asserts on the row it just created.

Test files live in `e2e/`. Browser binaries are installed into `~/.cache/ms-playwright/` (not the repo).
