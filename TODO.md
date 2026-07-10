# TODO — Full App Review (2026-07-10)

Consolidated findings from a full review (security / performance / UX / UI / architecture)
of the Rails API and the Next.js frontend. Checked items are done; branch names note
where a fix landed or is in flight.

## Security

- [x] **Proxy matcher redirected crawler metadata to /sign-in** — `/robots.txt`,
  `/sitemap.xml`, `/llms.txt` weren't excluded in `web/proxy.ts`, so Googlebot got a 307
  to sign-in and the whole SEO setup was unreachable. *(fix/review-quick-wins)*
- [x] **No security headers** — `web/next.config.ts` shipped no CSP, frame-ancestors,
  HSTS, Referrer-Policy, or Permissions-Policy. Added a baseline set; CSP still allows
  `'unsafe-inline'` scripts (Next bootstrap) — tighten with nonces later. *(fix/review-quick-wins)*
- [ ] **SSRF DNS-rebinding TOCTOU** — `api/app/services/applications/url_prefill_service.rb`
  validates IPs from `Resolv.getaddresses` but `Net::HTTP` re-resolves; connect to the
  validated IP (`http.ipaddr`) and restrict to ports 80/443. *(in flight: fix/backend-hardening)*
- [ ] **Upload memory DoS** — `applications_controller.rb#application_params` calls
  `.read` before the 1 MB model validation; check `.size` first, and consider a global
  request-body cap (Thruster). *(in flight: fix/backend-hardening)*
- [ ] **Rate-limit counters are per-Puma-worker** — Rack::Attack uses `:memory_store` in
  prod; move to a shared store (Solid Cache — see Stack below).
- [ ] **No account-level brute-force backstop** — throttling is IP-only; add Devise
  `:lockable` or an email-keyed throttle.
- [ ] **Login-CSRF residual on auth route handlers** — `web/app/api/auth/session|register`
  don't verify `Origin` (Server Actions do get Next's built-in check); add an allowlist check.
- [ ] **Demo credentials ship in the client bundle** (`sign-in-form.tsx`) — ensure the demo
  account is sandboxed, or move behind a dedicated `/api/auth/demo` route.
- [ ] **Document JWT semantics** — single JTI per user (sign-out revokes all devices),
  1-day expiry, no refresh flow. Fine, but note it in the README.

## Performance

- [x] **Composite index `(user_id, created_at DESC)` on applications** — the list endpoint
  filters by user, orders and cursor-paginates on `created_at`; dropped the now-redundant
  single-column `user_id` index. *(fix/review-quick-wins)*
- [ ] **Font payload** — 3 families / ~15 files in `web/app/layout.tsx`; switch Fraunces &
  Manrope to variable builds or trim unused weights.
- [ ] **`timeline_entries` offer-lookup index** — dashboard subquery filters
  `to_status = 'offer'` unindexed; add `(to_status, application_id, created_at)` if it grows.
- [ ] **Fold `/me` into the dashboard payload** (or cache it) — extra uncached request per visit.

## Correctness / robustness

- [ ] **Sign-up 500s if the welcome email fails** — `registrations_controller.rb` uses
  `deliver_now` after save with `raise_delivery_errors = true`; user exists but gets an
  error, retry says "email taken". Use `deliver_later`. *(in flight: fix/backend-hardening)*
- [ ] **Reminder timezone off-by-one** — `follow_up_reminder_job.rb` compares
  `DATE(follow_up_at)` in UTC; JST users get reminders a day early. Zone-aware day range +
  `config.time_zone`. *(in flight: fix/backend-hardening)*
- [ ] **Reminder feature is dead in prod** — no scheduler since Sidekiq was removed;
  see Solid Queue under Stack.
- [ ] **Reminder idempotency race** — `exists?`-then-`create!` isn't atomic; rescue
  `ActiveRecord::RecordNotUnique` for true exactly-once.

## UX

- [x] **Expired session dead-ended on error boxes** — no 401 handling anywhere; now
  `apiFetch` bounces through `/api/auth/expired`, which clears the cookie and redirects to
  `/sign-in?expired=1` with a notice. *(fix/review-quick-wins)*
- [x] **No `error.tsx` / `loading.tsx` / `not-found.tsx`** — network failures hit the raw
  Next overlay, navigations blocked with no fallback, `notFound()` rendered the bare 404.
  *(fix/review-quick-wins)*
- [ ] **409 conflicts unrecoverable** — stale `lock_version` is kept after a conflict so
  retries loop; show a friendly message + `router.refresh()`.
  *(in flight: fix/frontend-ux-polish)*
- [ ] **Touch targets ~24px** — status filter chips and transition buttons are below the
  44px guideline. *(in flight: fix/frontend-ux-polish)*
- [ ] **No optimistic UI** — pending states are hand-rolled `useTransition` flags;
  consider `useOptimistic` / `useFormStatus` for transitions.

## UI & accessibility

- [ ] **Dashboard stat tooltip is hover-only on a non-focusable span** — unreachable by
  keyboard/touch; make it a button with `aria-describedby`.
  *(in flight: fix/frontend-ux-polish)*
- [ ] **Danger colors bypass the token system** — Tailwind `red-*` improvised everywhere;
  add a `--color-danger` token to `design/assets/tokens.css` + `globals.css`.
- [ ] **No dark mode** — `color-scheme: light` hardcoded while dark icon assets exist in
  `design/`; decide to ship it or remove the unused assets.

## Code quality

- [ ] **`Paginated<T>` typed three times** — hoist into `web/app/lib/types.ts`.
  *(in flight: fix/frontend-ux-polish)*
- [ ] **Three copy-pasted `Field` components** — extract `web/app/components/field.tsx`.
  *(in flight: fix/frontend-ux-polish)*
- [ ] **Server-action return types lie** — `createApplication`/`deleteApplication` are
  typed `Promise<ActionResult>` but end in `redirect()` (throws).
  *(in flight: fix/frontend-ux-polish)*
- [ ] **Client re-sort fights cursor pagination** — `applications-list.tsx` re-sorts
  accumulated pages by status, interleaving items after "Load more".
  *(in flight: fix/frontend-ux-polish)*
- [ ] **Extract `Applications::ListQuery`** — `ApplicationsController#index` mixes
  filtering, cursor decoding, and serialization inline.
- [ ] **Dead Redis config in CI** — `.github/workflows/api.yml` provisions `redis:8` +
  `REDIS_URL` that nothing uses. *(in flight: fix/backend-hardening)*
- [ ] **`API_BASE` vs `API_BASE_URL`** — two near-identical names for different things
  (`web/app/lib/api.ts` vs `links.ts`); rename or comment.

## Stack

- [ ] **Adopt Solid Queue + Solid Cache instead of re-enabling Sidekiq/Redis** — runs on
  the existing Postgres, zero new Railway services. One change fixes four findings:
  recurring `FollowUpReminderJob` (Solid Queue recurring tasks), shared Rack::Attack store
  (Solid Cache), durable `deliver_later`, and removes the dead-feature caveat.
  `puma.rb` already has `plugin :solid_queue if ENV["SOLID_QUEUE_IN_PUMA"]` waiting.

## Feature ideas

- [ ] **Japanese UI (i18n)** — the most persuasive addition for a Tokyo-market portfolio.
- [ ] **Kanban board view** of the FSM states — demos the state machine far better than a list.
- [ ] **Email verification** (Devise `:confirmable`).
- [ ] **CSV export** of applications.
- [ ] **Follow-up digest email** once Solid Queue lands (mailer already exists).
