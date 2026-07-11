# KarirKalyan — Next.js Frontend

Next.js 16 App Router frontend. Consumes the Rails API over REST and handles JWT auth server-side so the token never reaches client JavaScript.

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

## Screens

Routes below are locale-prefixed in practice (`/en/dashboard`, `/ja/dashboard`).

| Route | Content |
|---|---|
| `/` | Landing page |
| `/sign-in`, `/sign-up` | Auth forms — POST to Rails, exchange token through `/api/auth/session` |
| `/dashboard` | Applications list with status badges and `follow_up_at` indicators, plus stats summary |
| `/board` | Kanban board — drag a card to run an FSM transition; legality read from `GET /api/v1/transitions`, optimistic with a `409` snap-back |
| `/applications/new` | Create a new application — includes the AI job-URL pre-fill |
| `/applications/[id]` | Detail view — FSM transition buttons (from `valid_next_states`), timeline entries, resume/cover letter upload |
| `/about`, `/docs` | Project write-up and documentation |

## Local setup

**Prerequisites:** Node 24 (matches Railway production)

Node is pinned in **one** place — `.nvmrc` — and everything else reads it: `actions/setup-node` via `node-version-file`, and Railpack when it builds the production image. `package.json` restates it as `engines.node` because Railpack consults that first. Keep the two in step; a CI runtime that differs from production's is how the `npm ci` lockfile divergence bit twice.

```bash
npm install
npm run dev   # :3000
```

Expects the Rails API on `:3001`. Copy `.env.example` to `.env.local` if you need to override `API_URL` (server-side only — never exposed to the browser).

## End-to-end tests (Playwright)

A single smoke test covers the critical path: sign up → land on dashboard → create application → transition status. Runs in ~2 seconds.

```bash
# Prereq: Postgres running (cd ../api && docker compose up -d)

npm run test:e2e            # headless run
npm run test:e2e:ui         # interactive UI mode for debugging
```

Playwright auto-starts the Rails API (`:3001`) and Next.js (`:3000`) via its `webServer` config; if they're already running, it reuses them. Each test run registers a unique email (`e2e-<timestamp>@example.com`) so the DB stays usable across runs without cleanup.

Test files live in `e2e/`. Browser binaries are installed into `~/.cache/ms-playwright/` (not the repo).
