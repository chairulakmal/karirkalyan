# KarirKalyan — Next.js Frontend

Next.js 16 App Router frontend for KarirKalyan. Consumes the Rails API and handles JWT auth via an `httpOnly` cookie so the token never touches client-side JavaScript.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS

## Local setup

**Prerequisites:** Node 20+

```bash
npm install
npm run dev   # :3000
```

Expects the Rails API running on `:3001`. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` if needed.

## Auth flow

1. User signs in → Rails returns a JWT in the `Authorization` header
2. Next.js `/api/auth/session` route receives it and sets an `httpOnly` cookie
3. Subsequent requests attach the cookie — the token never reaches client JS

This requires a server component (Next.js API route), which is one reason this project uses Next.js over a pure Vite setup.
