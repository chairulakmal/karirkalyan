# Changelog

What shipped, and when, newest first. The one thing to know reading it: **`v1.11.1` (2026-07-28) is the last tag `v1` will ever carry**, so everything above it is deployed and deliberately untagged, and the next tag is `2.0.0` ([`SPEC.md`](SPEC.md) § Versioning & releases). This file is the index: a line per change, and each release heading links to its full entry in [`notes/HISTORY.md`](notes/HISTORY.md), which carries the reasoning, the rejected alternatives, and the decisions log. Contents: the untagged work, then `v1.11.1` down to `v1.0.0`, then the pre-1.0.0 build phases.

Open work lives in [`TODO.md`](TODO.md), and how the system works today lives in [`SPEC.md`](SPEC.md). Neither is restated here.

---

## [Untagged, deployed since v1.11.1](notes/HISTORY.md#untagged-deployed-since-v1111)

On `main` and deployed, carrying no version number. Deploys are manual since 2026-08-19: `bin/deploy` from the repo root after merging.

- **Changed:** deployment moves off Railway to a self-hosted Docker Compose stack behind a Cloudflare Tunnel.
- **Added:** the screening success rate, and the gap that makes it readable.
- **Changed:** the dashboard is ordered by what you do with it, and Upcoming means this week.
- **Fixed:** the ghost-risk card and Upcoming agenda grew with the account, unbounded.
- **Fixed:** a throttle that fell open, a pin that could not be unpinned, and the hero's Japanese.
- **Changed:** one typeface instead of three (brand book T1).
- **Chore:** CI now runs the half of the repo you actually changed.
- **Added:** pin up to three applications to the top of the dashboard.
- **Fixed:** tidying up quietly lowered your response rate, and the FSM let it.
- **Fixed:** the account archive left the posting behind, and `PATCH /me` broke the error envelope.
- **Fixed:** ghost risk counted calendar days, so holidays read as silence.
- **Fixed:** a residents-only posting was recorded as "No sponsorship".
- **Chore:** non-major dependency updates, and Dependabot actually turned off.
- **Fixed:** the four self-hosting review findings.

By the mechanical test, only dashboard pins and the screening success rate would have forced a **minor**; the rest are patches.

---

## [v1.11.1](notes/HISTORY.md#v1111-2026-07-28) (2026-07-28)

A patch cut from four review passes: three defects the reviews found, plus the accessibility and IME work.

- **Fixed:** the list search returned every application, and said it had filtered.
- **Security:** two endpoints matched no throttle, and the client could pick its own IP.
- **Fixed:** `ApiResult.data` was typed `T` while two paths returned `null`.
- **Fixed:** the list swallowed every fetch failure, and dropped mid-flight intent.
- **Fixed:** the accessibility defects an audit found.
- **Fixed:** "today" was the ambient clock, not Tokyo.
- **Fixed:** the list's filter bar was unusable from the keyboard, and hostile to an IME.
- **Chore:** the lockfile disagreed with itself about Bundler.
- Recorded in `notes/HISTORY.md`: what was attacked across the four passes and held.

---

## [v1.11.0](notes/HISTORY.md#v1110-2026-07-28) (2026-07-28)

- The dashboard defaults to active applications, and hides archived.
- The Upcoming agenda, on the dashboard.
- Free-text search over the list.
- Notes on every deliberate move, not just the interview stages.
- The chip row trims the closed stages.
- One toast for every write.
- The "no hardcoded FSM sets" claim is now proven in CI.
- Dependabot, scoped low-noise; accessibility and contrast polish from a frontend audit; the HSP calculator title.
- Also in this tag: three fixes scoped as `v1.11.1` (sign-out lands on `/`, the E2E `Company` locator, Dependabot paused).

---

## [v1.10.0](notes/HISTORY.md#v1100-2026-07-21) (2026-07-21)

- Interview stage notes, on the timeline.
- A web unit-test seam (Vitest).
- Dashboard stat cards, and the facet cross-narrow fix.
- Filter state in the URL.
- Board triage cards, and the reopenable fold.
- Cover-letter talking points, bullets not a draft.
- Push interview and deadline alerts.
- Public HSP points calculator.

---

## [v1.9.0](notes/HISTORY.md#v190-shipped-under-the-v1100-tag-2026-07-21-not-separately-tagged) (shipped under the v1.10.0 tag, 2026-07-21; not separately tagged)

- Visa sponsorship and status of residence, per application.
- Hiring entity: can they actually employ you?
- Timezone overlap: is this remote role survivable from JST?
- Interview scheduling with `.ics` export.
- Visa, the global half: your own status of residence.

---

## [v1.8.1](notes/HISTORY.md#v181-2026-07-20) (2026-07-20)

- Japanese lines break at phrase boundaries, not mid-word (BudouX plus `word-break: auto-phrase`).

---

## [v1.8.0](notes/HISTORY.md#v180-2026-07-19) (2026-07-19)

- Recruiter channel and agencies, with the ownership warning.
- 年収 as a structure, and the Japanese-level filter.
- Posting snapshot.

---

## [v1.7.0](notes/HISTORY.md#v170-2026-07-19) (2026-07-19)

- The prefill fetch bounded in memory and time.
- Account menu in the app header.

---

## [v1.6.0](notes/HISTORY.md#v160-2026-07-18) (2026-07-18)

- Capture via the share sheet.
- Paste fallback for postings the fetcher cannot read.
- The manifest, measured rather than assumed.
- The installed shell (bottom tab bar below `sm`).
- Passkey sign-in.
- Push delivery for the follow-up digest.
- **Fixed:** the expired-session bounce emits a relative `Location`.
- **Chore:** bundle update clearing loofah / rails-html-sanitizer advisories.

---

## [v1.5.1](notes/HISTORY.md#v151-2026-07-17) (2026-07-17)

- Both dead copies in the transition payload are gone.
- The list endpoint documents its filters.

---

## [v1.5.0](notes/HISTORY.md#v150-2026-07-17) (2026-07-17)

- The chips are a filter now.
- An empty filter means unfiltered, never empty.
- `active_states` on `/transitions`, and the board's hardcoded copy is gone.
- Version skew is a real state, and two pages disagree about it correctly.

---

## [v1.4.4](notes/HISTORY.md#v144-2026-07-17) (2026-07-17)

- **Security:** every rate limit was opt-out by typing `.json`.
- PDFs are named after the application they belong to.
- A ceiling on applications, and a throttle on the writes that carry files.
- en/ja catalog parity is now a check, not a convention.
- "Your data" and the profile block are one card.

---

## [v1.4.3](notes/HISTORY.md#v143-2026-07-17) (2026-07-17)

- URL pre-fill: two bugs behind one prod report.
- The post-`v1.4.1` docs audit.
- Code quality: the applications list query.

---

## [v1.4.1](notes/HISTORY.md#v141-2026-07-12) (2026-07-12)

**"Close the door."** A patch that removes a capability rather than adding one.

- Public sign-up is closed: no `POST /api/v1/auth/sign_up`, no `/sign-up` page. Visitors sign in to the shared demo account.
- `DELETE /api/v1/auth/account` is specified, contract-documented and request-tested; it cascades and revokes the JWT.
- `bin/rails users:set_password EMAIL=… [PASSWORD=…]`, mandatory once there is no sign-up to fall back on.
- `/privacy` and `/terms`, in English and Japanese, with every claim checkable against the code.
- The `auth/sign_up` throttle is gone with the endpoint it guarded.

---

## [v1.4.0](notes/HISTORY.md#v140-2026-07-12) (2026-07-12)

**"The search, this week."** A minor: four capabilities, no migration.

- One follow-up digest per user per day, replacing one email per application.
- The digest is calendar-aware: `JapanCalendar` is the only thing that knows what a Japanese business day is.
- CSV export (`GET /api/v1/exports/applications`), formula-injection escaped.
- Full-account export (`GET /api/v1/exports/account`): a zip of `account.json` plus every stored document.
- Both exports are throttled per account, not per IP.

---

## [v1.3.1](notes/HISTORY.md#v131-2026-07-12) (2026-07-12)

The first release cut by the versioning policy it contains.

- A versioning policy, written down, with **major** redefined against rollback rather than API compatibility.
- The Sidekiq/Redis debris from `v1.0.0` deleted.
- Local dev and CI moved to PostgreSQL 18, matching production.
- Documentation audited against the implementation.
- Gems and npm packages refreshed; Node pinned to 24, declared once in `web/.nvmrc`.

---

## [Backups](notes/HISTORY.md#backups-2026-07-11-no-tag) (2026-07-11, no tag)

Shipped from the private [`karirkalyan-backups`](https://github.com/chairulakmal/karirkalyan-backups) repo, so it carries no tag here.

- Scheduled `pg_dump`, daily at 05:15 JST, fingerprinted so it only dumps when the data changed.
- Restore drill passed: all 17 tables and every row recovered into a scratch Postgres 18.4.
- Decision recorded: a dump, not a live mirror.

---

## [v1.3.0](notes/HISTORY.md#v130-2026-07-11) (2026-07-11)

Ghost prediction: the dashboard says which applications have almost certainly gone dead.

- `Applications::GhostRiskQuery` flags silence longer than the user's own p90 reply time for that stage. No migration.
- Each timeline row is read as an exit, not an entry.
- Cold start is handled and admitted to: `basis: "default" | "personal"` rides the payload.
- Folded in: `/me` merged into the dashboard payload, `timeline_entries` index widened, the dashboard cache key carries `Date.current`.

---

## [v1.2.0](notes/HISTORY.md#v120-2026-07-11) (2026-07-11)

The Kanban board, plus the `api/` groundwork it needed.

- Machine-readable error codes: a stable `code` on every error, with per-field `details`.
- `GET /api/v1/transitions` serves the effective transition table, so no client mirrors it.
- `web/` keys its message catalog off the code, with the `v1.1.0` status map demoted to fallback.
- `/board`: columns are FSM states, a drag is a transition call, legal drop targets come from the API.
- One bounded fetch-all, optimistic transitions, and a keyboard-accessible card menu that reaches every legal move.

---

## [v1.1.2](notes/HISTORY.md#v112-2026-07-11) (2026-07-11)

- Delete confirm prompt no longer clips at 375px.

---

## [v1.1.1](notes/HISTORY.md#v111-2026-07-11) (2026-07-11)

- Headers declutter below `sm` rather than collapse into a menu, which would have hidden the locale switcher.
- Homepage primary CTA renamed "Read the architecture" → "How it's built".

---

## [v1.1.0](notes/HISTORY.md#v110-2026-07-11) (2026-07-11)

Japanese UI, and the homepage / about / docs revamp. Entirely `web/`.

- next-intl with `localePrefix: "as-needed"`: English unprefixed, Japanese at `/ja/*`, no existing URL moved.
- All copy in message catalogs, key-for-key identical between locales; `format.ts` holds no copy.
- Locale switcher, locale-aware dates and `lang`, and server errors localized by HTTP status (superseded in `v1.2.0`).
- Hero reframed at the hiring reviewer; `/about` states four decisions against the alternatives they rejected; `/docs` frames the API.
- SEO surfaces: per-locale `hreflang` alternates, and an `llms.txt` that no longer claims Sidekiq.
- **Fixed:** a missing nested `@swc/helpers` resolution that broke `npm ci` under npm 10.

---

## [v1.0.1](notes/HISTORY.md#v101-2026-07-10) (2026-07-10)

A dedicated security pass over the API and frontend, plus the fixes it produced.

- **[med]** Account-level brute-force backstop, on top of the IP-only throttle.
- **[med]** Login-CSRF on the auth route handlers: an `Origin` check.
- **[med]** The demo account was shared and unbounded: `Demo::ResetService` was never invoked, and the demo user could reach the paid AI endpoint.
- **[low]** CSP tightened to a per-request nonce with `strict-dynamic`.
- A withdrawn finding took production down before the tag, and the lesson is recorded: verify a framework's own normalization before hardening a pattern it owns.
- Reviewed and found sound, recorded so a re-review does not re-litigate them: the SSRF surface, upload handling, tenant isolation, password logging, sign-up auth.

---

## [v1.0.0](notes/HISTORY.md#v100-2026-07-10) (2026-07-10)

First release: the initial security / performance / UX review pass and every fix it produced.

- Solid Queue and Solid Cache adopted instead of re-enabling Sidekiq and Redis. One change closed four findings.
- Security: crawler metadata no longer redirected to `/sign-in`; a baseline security-header set; the SSRF DNS-rebinding TOCTOU closed; upload memory DoS closed; rate-limit counters moved off per-worker memory.
- Performance: composite index `(user_id, created_at DESC)` on applications.
- Correctness: sign-up no longer 500s on a mail failure, the reminder timezone off-by-one fixed, the reminder feature revived, and its idempotency made a true exactly-once.
- UX: expired sessions bounce cleanly, `error`/`loading`/`not-found` boundaries added, `409` conflicts made recoverable, touch targets raised to 44px, FSM states explained in context.
- Code quality: duplicated types and components hoisted, dead Redis CI config removed, server-action return types corrected.

---

## [Pre-1.0.0: the build phases](notes/HISTORY.md#pre-100-the-build-phases)

Nine numbered phases from what was then `PLAN.md`, recorded so the history is not lost. **They describe the system as it was**, and several decisions below were later reversed, most visibly Sidekiq and Redis.

1. **Rails API foundation.** Scaffold, Devise + devise-jwt, RSpec, the schema and the FSM's first states.
2. **Service layer + specs.** `Applications::TransitionService`, `FollowUpReminderJob` with its idempotency key, FSM unit specs.
3. **Controllers.** Error rescues mapped to `422`/`409`, JWT in the `Authorization` header, `navigational_formats = []`.
4. **API docs.** rswag: request specs emit `swagger/v1/swagger.yaml`, Swagger UI at `GET /api-docs`.
5. **Next.js frontend.** The auth flow that still stands: route handlers proxy to Rails and keep the JWT in an `httpOnly` cookie.
6. **Deploy.** Railway, with the `Procfile`-under-Dockerfile trap that later cost the queue.
7. **Production-readiness and Tokyo-market polish.** CI, `README.ja.md`, Japanese seed data.
8. **API maturity.** Cursor pagination, one error envelope, the demo account, Playwright promoted into CI.
9. **Product depth.** Email delivery and AI job-URL pre-fill shipped; the analytics dashboard and cover-letter assist did not.
