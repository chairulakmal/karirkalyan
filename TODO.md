# TODO

Roadmap and open findings. Items are grouped by release; everything under
**Shipped** is done and tagged.

**Current release: `v1.0.0`** — tagged 2026-07-10 at `e595b68`.
**Next release: `v1.0.1`** — security review and the fixes it produces.

---

## v1.0.1 — Security review & fixes (next)

The full-app review (2026-07-10) left four security findings unresolved. `v1.0.1` is
scoped to a dedicated security pass over the API and frontend, plus these fixes. No
features; anything non-security that surfaces goes to the backlog.

### Planned work

- [ ] **Run a focused security review** of `api/` and `web/` — auth flows, the JWT
  lifecycle, upload handling, the AI prefill SSRF surface, and the Next.js route
  handlers. Record findings here before fixing.

### Known findings to fix

- [ ] **No account-level brute-force backstop** — throttling is IP-only; add Devise
  `:lockable` or an email-keyed throttle.
- [ ] **Login-CSRF residual on auth route handlers** — `web/app/api/auth/session|register`
  don't verify `Origin` (Server Actions do get Next's built-in check); add an allowlist check.
- [ ] **Demo credentials ship in the client bundle** (`sign-in-form.tsx`) — ensure the demo
  account is sandboxed, or move behind a dedicated `/api/auth/demo` route.
- [ ] **Tighten CSP** — the baseline set added in PR #37 still allows `'unsafe-inline'`
  scripts for the Next bootstrap; move to nonces.
- [ ] **Document JWT semantics** — single JTI per user (sign-out revokes all devices),
  1-day expiry, no refresh flow. Fine as designed, but note it in the README.

---

## Backlog (post-1.0.1)

### Performance

- [ ] **Font payload** — 3 families / ~15 files in `web/app/layout.tsx`; switch Fraunces &
  Manrope to variable builds or trim unused weights.
- [ ] **`timeline_entries` offer-lookup index** — dashboard subquery filters
  `to_status = 'offer'` unindexed; add `(to_status, application_id, created_at)` if it grows.
- [ ] **Fold `/me` into the dashboard payload** (or cache it) — extra uncached request per visit.

### UX

- [ ] **No optimistic UI** — pending states are hand-rolled `useTransition` flags;
  consider `useOptimistic` / `useFormStatus` for transitions.

### UI & accessibility

- [ ] **Danger colors bypass the token system** — Tailwind `red-*` improvised everywhere;
  add a `--color-danger` token to `design/assets/tokens.css` + `globals.css`.
- [ ] **No dark mode** — `color-scheme: light` hardcoded while dark icon assets exist in
  `design/`; decide to ship it or remove the unused assets.

### Code quality

- [ ] **Extract `Applications::ListQuery`** — `ApplicationsController#index` mixes
  filtering, cursor decoding, and serialization inline.
- [ ] **`API_BASE` vs `API_BASE_URL`** — two near-identical names for different things
  (`web/app/lib/api.ts` vs `links.ts`); rename or comment.

### Feature ideas

- [ ] **Japanese UI (i18n)** — the most persuasive addition for a Tokyo-market portfolio.
- [ ] **Kanban board view** of the FSM states — demos the state machine far better than a list.
- [ ] **Email verification** (Devise `:confirmable`).
- [ ] **CSV export** of applications.
- [ ] **Follow-up digest email** — Solid Queue now landed; the mailer already exists.

---

## Shipped in v1.0.0

Tagged 2026-07-10. Branch/PR names note where each fix landed.

### Stack

- [x] **Adopt Solid Queue + Solid Cache instead of re-enabling Sidekiq/Redis** — runs on
  the existing Postgres, zero new Railway services. One change fixed four findings:
  recurring `FollowUpReminderJob` (Solid Queue recurring tasks), shared Rack::Attack store
  (Solid Cache), durable `deliver_later`, and removed the dead-feature caveat.
  *(feat/solid-queue-cache, PR #42 — requires `SOLID_QUEUE_IN_PUMA=true` on the Railway api service)*
- [x] **DB pool sized for Solid Queue threads inside Puma** — `max_connections` is
  `RAILS_MAX_THREADS + 6`; a smaller pool made Solid Queue exit and take Puma with it.
  *(fix/solid-queue-db-pool, PR #43)*

### Security

- [x] **Proxy matcher redirected crawler metadata to /sign-in** — `/robots.txt`,
  `/sitemap.xml`, `/llms.txt` weren't excluded in `web/proxy.ts`, so Googlebot got a 307
  to sign-in and the whole SEO setup was unreachable. *(fix/review-quick-wins, PR #37)*
- [x] **No security headers** — `web/next.config.ts` shipped no CSP, frame-ancestors,
  HSTS, Referrer-Policy, or Permissions-Policy. Added a baseline set. *(fix/review-quick-wins, PR #37)*
- [x] **SSRF DNS-rebinding TOCTOU** — `api/app/services/applications/url_prefill_service.rb`
  validated IPs from `Resolv.getaddresses` but `Net::HTTP` re-resolved; now connects to the
  validated IP (`http.ipaddr`) and restricts to ports 80/443. *(fix/backend-hardening, PR #39)*
- [x] **Upload memory DoS** — `applications_controller.rb#application_params` called
  `.read` before the 1 MB model validation; checks `.size` first. *(fix/backend-hardening, PR #39)*
- [x] **Rate-limit counters were per-Puma-worker** — Rack::Attack used `:memory_store` in
  prod; moved to the shared Solid Cache store. *(feat/solid-queue-cache, PR #42)*

### Performance

- [x] **Composite index `(user_id, created_at DESC)` on applications** — the list endpoint
  filters by user, orders and cursor-paginates on `created_at`; dropped the now-redundant
  single-column `user_id` index. *(fix/review-quick-wins, PR #37)*

### Correctness / robustness

- [x] **Sign-up 500s if the welcome email fails** — `registrations_controller.rb` used
  `deliver_now` after save with `raise_delivery_errors = true`; user existed but got an
  error, and retry said "email taken". Now `deliver_later`. *(fix/backend-hardening, PR #39)*
- [x] **Reminder timezone off-by-one** — `follow_up_reminder_job.rb` compared
  `DATE(follow_up_at)` in UTC; JST users got reminders a day early. Zone-aware day range +
  `config.time_zone`. *(fix/backend-hardening, PR #39)*
- [x] **Reminder feature was dead in prod** — no scheduler since Sidekiq was removed.
  *(feat/solid-queue-cache, PR #42)*
- [x] **Reminder idempotency race** — `exists?`-then-`create!` isn't atomic; now rescues
  `ActiveRecord::RecordNotUnique` for true exactly-once. *(feat/solid-queue-cache, PR #42)*

### UX

- [x] **Expired session dead-ended on error boxes** — no 401 handling anywhere; `apiFetch`
  now bounces through `/api/auth/expired`, which clears the cookie and redirects to
  `/sign-in?expired=1` with a notice. *(fix/review-quick-wins, PR #37)*
- [x] **No `error.tsx` / `loading.tsx` / `not-found.tsx`** — network failures hit the raw
  Next overlay, navigations blocked with no fallback, `notFound()` rendered the bare 404.
  *(fix/review-quick-wins, PR #37)*
- [x] **409 conflicts unrecoverable** — stale `lock_version` was kept after a conflict so
  retries looped; now shows a friendly message + `router.refresh()`. *(fix/frontend-ux-polish, PR #38)*
- [x] **Touch targets ~24px** — status filter chips and transition buttons were below the
  44px guideline. *(fix/frontend-ux-polish, PR #38)*
- [x] **Statuses were unexplained** — added in-context help for the FSM states, plus a UI
  polish round. *(feat/frontend-status-help, PR #44)*

### UI & accessibility

- [x] **Dashboard stat tooltip was hover-only on a non-focusable span** — unreachable by
  keyboard/touch; now a button with `aria-describedby`. *(fix/frontend-ux-polish, PR #38)*

### Code quality

- [x] **`Paginated<T>` typed three times** — hoisted into `web/app/lib/types.ts`.
  *(fix/frontend-ux-polish, PR #38)*
- [x] **Three copy-pasted `Field` components** — extracted `web/app/components/field.tsx`.
  *(fix/frontend-ux-polish, PR #38)*
- [x] **Server-action return types lied** — `createApplication`/`deleteApplication` were
  typed `Promise<ActionResult>` but ended in `redirect()` (throws). *(fix/frontend-ux-polish, PR #38)*
- [x] **Client re-sort fought cursor pagination** — `applications-list.tsx` re-sorted
  accumulated pages by status, interleaving items after "Load more". *(fix/frontend-ux-polish, PR #38)*
- [x] **Dead Redis config in CI** — `.github/workflows/api.yml` provisioned `redis:8` +
  `REDIS_URL` that nothing used. *(fix/backend-hardening, PR #39)*
- [x] **E2E status assertions were unscoped** — narrowed to the header badge.
  *(fix/e2e-status-badge-selector, PR #45)*
