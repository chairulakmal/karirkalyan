# KarirKalyan — Next.js Frontend

Next.js 16 App Router frontend. Consumes the Rails API over REST and handles JWT auth server-side so the token never reaches client JavaScript.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS

## Auth design

The Rails API issues a JWT in the `Authorization` response header on sign-in. Rather than storing it in `localStorage` (XSS risk), a Next.js route handler (`/api/auth/session`) receives it and sets an `httpOnly` cookie. All subsequent requests attach the cookie automatically. The token is never accessible to client-side JS.

This pattern requires a server component — it's one reason Next.js was chosen over a pure Vite/SPA setup.

## Planned screens

| Route | Content |
|---|---|
| `/sign-in`, `/sign-up` | Auth forms — POST to Rails, exchange token through `/api/auth/session` |
| `/` | Applications board — status badges, `follow_up_at` indicator |
| `/applications/[id]` | Detail view — FSM transition buttons (from `valid_next_states`), timeline entries |
| `/applications/[id]` | File upload inputs (`accept=".pdf"`), displays `resume_updated_at` as "uploaded N days ago" |

## Local setup

**Prerequisites:** Node 20+

```bash
npm install
npm run dev   # :3000
```

Expects the Rails API on `:3001`. Copy `.env.example` to `.env.local` if you need to override `NEXT_PUBLIC_API_URL`.
