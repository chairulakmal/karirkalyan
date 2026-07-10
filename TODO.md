# TODO

Open work only. Shipped work lives in [`CHANGELOG.md`](CHANGELOG.md).

**Current release: `v1.0.1`** — tagged 2026-07-10 at `2980300`. Security review + fixes.
**Next release: `v1.1.0`** — Japanese UI (i18n) and a homepage + about/docs revamp.
**Then `v1.1.1`** — mobile view improvements.
**After that: `v1.2.0`** — the Kanban board view.

Everything below is post-1.0.1. The v1.1.0, v1.1.1 and v1.2.0 items are scoped; the backlog is not.

---

## v1.1.0 — Japanese UI and marketing pages (next)

**v1.1.0 is a UI/UX release and it lives entirely in `web/`. No `api/` changes.**

That is a hard boundary, not a preference. The backend shipped, was security-reviewed twice,
and every finding is closed. Reopening it to serve a frontend release trades a settled surface
for an unsettled one, and drags the Rails suite, rswag regeneration, and a security re-read
into what should be a `web/`-only diff.

**The Kanban board was cut from this release for exactly that reason** — it cannot be built
without exposing the FSM transition table, and the `web/`-side workaround is to duplicate that
table, which means a state machine with two sources of truth that drift apart. Better to move
the board than to buy a clean API diff with frontend duplication. It is `v1.2.0`, below, and
it opens with the API change it needs.

So the rule for v1.1.0 is simple: **if an item seems to need an `api/` change, it is either
solvable in `web/` or it is in the wrong release.** Both remaining candidates are solvable in
`web/` — the error-message item below says how.

Both items serve a Tokyo-market portfolio directly. i18n shows the app can ship bilingual; the
homepage and about/docs pages are what a reviewer sees before anything else. Both are
user-visible, which is the point — the debt in the backlog is not.

**Do i18n first.** It decides how copy is stored, and writing new marketing copy before the
message catalogs exist means authoring it twice.

### Japanese UI (i18n) — done, pending a PR

All items below are landed on `feat/i18n-japanese-ui` and verified against the dev server: `/`
serves English, `/ja` serves Japanese, `/en/*` `307`s to the unprefixed canonical path. The
plumbing is described in `SPEC.md`; the routing decisions are recorded there too.

What is left is not code: **open the PR**, and settle the `phone_screen` translation flagged
below.

- [x] **Pick and install a library.** `next-intl@4.13.2` — declares `next: ^16.0.0` in its peer
  dependencies, so Next.js 16 support is stated, not inferred.
- [x] **Decide routing strategy** — `localePrefix: "as-needed"`: English unprefixed, Japanese at
  `/ja/*`. No existing URL moves. `/en/*` self-corrects — next-intl `307`s it to the unprefixed
  path (verified in `middleware.js:131-133`), so each page keeps one canonical address.
  `config.matcher` needs **no change**: it excludes by prefix segment and `/ja` collides with none
  of them. The auth guard must run on the locale-stripped pathname so `PUBLIC_PATHS` stays three
  entries rather than six. Recorded in `SPEC.md`.
  *Note: the CSP nonce work already forces dynamic rendering app-wide via `await connection()`
  in the root layout, so locale routing costs no static optimization — there is none left to lose.*
- [x] **Extract copy into message catalogs.** Every page, form, and component reads from
  `messages/{en,ja}.json`; `format.ts` holds no copy at all now. The only hardcoded English
  left in `.tsx` is `global-not-found.tsx` — an unmatched path carries no locale, so it cannot
  be translated. `en.json` and `ja.json` are key-for-key identical.
- [x] **Translate the 13 FSM state names.** In the `status` namespace as `label.*` and
  `description.*`.
  *`phone_screen` → `カジュアル面談` was questioned and **kept** (2026-07-10). It names a
  pre-selection chat rather than a 選考 stage, which is a slight mismatch with where the state
  sits, but it is the term a Japanese jobseeker actually recognises. Recognition beat precision.*
- [x] **Set `lang` dynamically** from the active locale (`[locale]/layout.tsx`), and add a
  locale switcher. The switcher is a two-locale toggle showing only the inactive language;
  mounted in the app shell, the marketing header, and the auth layout. See `SPEC.md`.
- [x] **Server-side error messages** — mapped in `web/` off the HTTP status, API left
  English-only. Two mapping sites, because the auth form calls route handlers with `fetch`
  rather than going through a server action: `apiFailure()`/`localFailure()` in
  `app/lib/actions.ts`, and `errorMessage()` in `(auth)/sign-in/sign-in-form.tsx`. The English
  sentence from the API is discarded, never parsed. A `422`'s per-field detail is therefore
  **lost**, not left in English — it comes back when the error codes land in v1.2.0.
  *Corrected 2026-07-10: this item used to say "keyed off the error code and HTTP status." There
  is no error code. Rails returns `{ error: "<English sentence>" }` and a status — nothing else —
  and `web/app/lib/api.ts:109` passes the sentence straight through. Adding a code is an `api/`
  change, so it moved to v1.2.0 (below). Status-keyed mapping covers `401`, `409`, `422`, `429`,
  `502`, `503`; per-field `422` text (`"Company can't be blank"`) stays English until the codes
  land. Do **not** string-match the English sentences to recover a code — that is a prose parser
  and it breaks on the first reword. See the decisions log in `SPEC.md`.*

### Homepage + about/docs revamp

Depends on i18n landing first — every string below should be authored into the message
catalogs bilingually, not written in English and retrofitted.

- [x] **Decided (2026-07-10): reframe the hero at the reviewer.** The homepage argues that this
  is a job tracker *built on a finite state machine* — 13 states, an immutable audit trail, the
  stack named outright. The primary call to action is "Read the architecture" (→ `/about`), with
  the demo second. The jobseeker framing ("without the spreadsheet") is retired.
  **Consequence to hold onto:** the demo login is no longer the obvious next action, so `/about`
  now has to carry the visit. It cannot be a stack list — it is the page the whole site points
  at. Build it before, or with, the hero; a hero whose main CTA 404s is worse than the old one.
- [x] **Rewrote the hero** (2026-07-10) — `app/[locale]/page.tsx`, both catalogs. Header nav is
  About / Sign in / locale switcher; the hero names the stack; the cards are the transition
  table, the immutable history, and Postgres-backed jobs.
- [x] **Built the `/about` page** (2026-07-10) — four decisions, each stated as the cheaper
  alternative it rejected: why Rails for a TS developer, why a PORO FSM over a state-machine
  gem, why Solid Queue instead of Sidekiq/Redis, why `bytea` over object storage.
  It is an `OPEN_PATHS` entry in `proxy.ts` — it renders with *or* without a session, because
  bouncing a signed-in reader to `/dashboard` would hide the page from the people most likely
  to read it.
- [x] **Built the in-app `/docs` page** (2026-07-10) — auth, per-user scoping, the one-string
  error shape, cursor pagination, and the endpoint table, then a link out to the rswag UI.
  Every "API docs" link in the app (homepage footer, `/about`, and the signed-in "For
  reviewers" footer) now points here rather than off-site; `API_DOCS_URL` survives as the one
  outbound link on this page. Also an `OPEN_PATHS` entry.
  Endpoint methods and paths are code and stay untranslated — only the sentence beside each.
- [x] **The homepage will need a real design pass, not a copy edit.** *(2026-07-10)* There is no
  `frontend-design` skill installed — that line was aspirational — so the direction came from the
  real brand book in `design/assets/tokens.css` instead. Three of its decisions had never reached
  the app: the motion tokens (now Tailwind's `--default-transition-*`, so every existing bare
  `transition` inherits the brand curve), the display type cut (Fraunces `opsz 144` via
  `.kk-display` — the global `h1,h2,h3` rule's `opsz 36` is a heading cut that goes weak past 60px),
  and saffron, reserved for "offers, celebratory" and unused on every marketing page.
  The biggest gap was argument, not aesthetics: the hero claimed a finite state machine and showed
  nothing. `pipeline-diagram.tsx` now draws one — and saffron finally appears, on the `offer` and
  `accepted` chips. It is an **illustration**, not a copy of the 33-edge table; it names
  `api/app/lib/application_fsm.rb` as the authority, and reuses `statusBadgeClass` plus the `status`
  catalog so the vocabulary keeps one home. `/about` numbers its four decisions `01`–`04` because
  the lede promises four; `/docs` colours the verb by risk, with `DELETE` in the same red
  `format.ts` gives the terminal-negative statuses. Also: one global cobalt `:focus-visible` ring,
  and a `prefers-reduced-motion` block.
- [x] **Wire up the SEO surfaces** (2026-07-11) — `web/app/sitemap.ts` now derives entries for
  all five public pages (`/`, `/about`, `/docs`, `/sign-up`, `/sign-in`) with per-locale
  `alternates` (hreflang + `x-default`) via `getPathname`, so the prefix rule has one home.
  The `jsonLd` blob stays local to `page.tsx` — no second page needs it yet.
- [x] **Fix `web/public/llms.txt`** — Sidekiq/Redis 8 replaced with Solid Queue + Solid Cache
  in both the feature list and the stack, and the Railway line no longer claims a managed Redis.
  The FSM state list stays (an LLM reading this file benefits from it) but now says it is a
  summary and names `api/app/lib/application_fsm.rb` as the authority, and no longer implies the
  pipeline is linear. Add the bilingual UI here once i18n is merged and deployed — the file
  describes production, not a branch.

---

## v1.1.1 — Mobile view improvements

Like v1.1.0, this is **`web/`-only**. A patch release rather than a minor one because it changes
no behaviour and adds no page — it makes the pages that exist usable on a phone.

It comes *after* the homepage revamp deliberately. Responsive work on a page that is about to be
redesigned is thrown away twice: once when the hero changes, once when `/about` and `/docs`
arrive. Land the layouts, then fit them to small screens.

Japanese matters here in a way it does not on desktop. Japanese sets no wider than English at the
same font size but wraps on entirely different rules, and the FSM status labels are the longest
strings in the app. A badge row that fits in English can overflow in Japanese, so **check both
locales at every breakpoint** — that is the reason this release follows i18n rather than
preceding it.

- [ ] **Audit before writing any CSS.** Walk every page at 375px (iPhone SE) and 390px, in both
  locales, and write down what actually breaks. The list below is a prior, not a finding — no
  responsive audit has been run since the pages were built, and the app already uses `md:`
  breakpoints in places, so some of this may already be fine. Do not fix what is not broken.
- [ ] **The dashboard application list** is the primary suspect: it carries a status badge, a
  company name, a job board label, and a relative timestamp on one row. Decide whether the row
  stacks or the metadata collapses behind the card; do not shrink the type until it fits.
- [ ] **The application detail page** — the transition buttons are a horizontal row of up to
  several states, and the details editor is a label/value grid. Both assume width.
- [ ] **Tap targets.** The locale switcher, the transition buttons, and the delete button are
  all styled for a cursor. 44×44px is the floor.
- [ ] **The nav in the app shell** puts dashboard, new, sign-out, and the locale switcher on one
  line. Something gives at 375px.
- [ ] **Verify no page scrolls horizontally.** A single overflowing element does this to the
  whole document, and it is the most common way a desktop-first layout fails on a phone.

---

## v1.2.0 — Kanban board view

Columns are FSM states, cards are applications, and a drag between columns is a
`PATCH /api/v1/applications/:id/transition` call. It demos the state machine far better than a
list does.

**This release opens with `api/` changes, which is why they are not v1.1.0.** Land them in their
own PR, on their own, before any board component is written. Do not fold them into a UI PR.

- [ ] **Add machine-readable error codes to the API.** Deferred here from v1.1.0's i18n work, which
  could not localize per-field validation errors without one. Every Rails error is currently
  `{ error: "<English sentence>" }` + a status; add a stable `code` (`stale_record`,
  `invalid_credentials`, `validation_failed` with a `field`) alongside the existing `error` string,
  so `web/` can key its message catalog off the code instead of the status. Additive — keep `error`
  so nothing breaks. Then narrow the status-keyed fallbacks added in v1.1.0. Same PR as the
  transition table below: one `api/` diff, one rswag regeneration, one security re-read.

- [ ] **Expose the transition table from the API.** The board must know which drops are legal,
  and `ApplicationFSM::TRANSITIONS` is the only source of truth. It is *not* a linear pipeline
  — `ghosted → applied`, `rejected → applied` and `withdrawn → applied` are all legal, while
  most forward skips are not, so the shape cannot be guessed from the state list. `show` and
  `transition` already return `valid_next_states` for *one* application
  (`applications_controller.rb:71,109`), but `index` does not, so a board has no way to know
  what any card can do. Add a read-only endpoint serving the table — `ApplicationFSM` already
  has `valid_next_states` to build it from — and have `web/` consume it. **Do not mirror the
  table in TypeScript.** A copy is a second source of truth, and a state machine that drifts
  from its own server is worse than an extra request. Note the server rejects illegal
  transitions regardless; the client table only decides what *looks* droppable.
- [ ] **Solve the 13-column problem.** `ApplicationFSM::VALID_STATES` has 13 states —
  too many to sit side by side. Group them: an active pipeline (`wishlist` → `draft` →
  `applied` → `phone_screen` → `technical` → `final_round` → `offer`) as columns, with the
  terminal and dead-end states (`accepted`, `declined`, `rejected`, `ghosted`, `withdrawn`,
  `archived`) collapsed into a closed lane or a filter.
- [ ] **Reconcile with cursor pagination.** `applications-list.tsx` cursor-paginates a single
  ordered list; a board needs every column populated at once. Prefer a bounded fetch-all
  against `index` as it stands; a per-column cursor would need new query params. Settle this
  before writing components — it is a design decision, not an implementation detail.
- [ ] **Optimistic transitions.** A drag that waits for a round trip feels broken. This is
  where the backlog's `useOptimistic` item earns its keep — fold it in here rather than doing
  it separately, and handle the `409` stale-`lock_version` path by reverting the card.
- [ ] **Keyboard-accessible alternative.** Drag-and-drop alone fails a11y; the existing
  transition buttons on the detail page can stay as the accessible path, but the board's cards
  need focus + a menu, not just a drag handle.

---

## Backlog (unscoped)

Verified against the code on 2026-07-10 — all still hold.

### Performance

- [ ] **Font payload** — 3 families / ~15 files in `web/app/layout.tsx` (Fraunces 4 weights,
  Manrope 5, IBM Plex Mono 2); switch Fraunces & Manrope to variable builds or trim unused weights.
- [ ] **`timeline_entries` offer-lookup index** — the dashboard subquery filters `to_status = 'offer'`
  and the table has no index on `to_status` at all (only `actor_id`, `application_id`,
  `idempotency_key`). Add `(to_status, application_id, created_at)` if it grows.
- [ ] **Fold `/me` into the dashboard payload** — `dashboard/page.tsx` already fetches it in
  parallel via `Promise.all`, so this costs a wasted request, not a round trip. Low priority;
  fix it when the dashboard payload is touched for another reason.

### UI & accessibility

- [ ] **No dark mode** — `web/app/globals.css:28` hardcodes `color-scheme: light` while dark icon
  assets exist in `design/`. Decide to ship it or delete the unused assets; leaving both is
  the worst option.

### Code quality

- [ ] **Extract `Applications::ListQuery`** — `ApplicationsController#index` mixes filtering,
  cursor decoding, and serialization inline. There is no `api/app/queries/` directory yet.
- [ ] **`API_BASE` vs `API_BASE_URL`** — two near-identical names for different things
  (`web/app/lib/api.ts:107` is the internal fetch base; `web/app/lib/links.ts:2` is the public
  Railway URL used for doc links). Rename or comment.

### Feature ideas

Unscoped. The pre-1.0.0 Phase 9 notes (now in `CHANGELOG.md`) also name an analytics dashboard
and an AI cover-letter assist as the declared roadmap. Everything here is **post-v1.2.0** and most of it *does* touch `api/` —
that is fine, the `web/`-only constraint is a property of v1.1.0, not a permanent rule.

The three table-stakes items first, then the ones that differentiate. A generic tracker is a
CRUD demo; the ideas below are the ones a Tokyo hiring reviewer could not have seen in someone
else's portfolio, because they encode knowledge of the market rather than knowledge of Rails.

**Table stakes**

- [ ] **Email verification** (Devise `:confirmable`).
- [ ] **CSV export** of applications.
- [ ] **Follow-up digest email** — Solid Queue landed; the mailer already exists.

**Ghost prediction — the highest value-to-cost item here**

- [ ] **Predict ghosting from the timeline you already record.** `timeline_entries` stores
  `from_status`, `to_status`, and `created_at` for every transition, so median days-to-response
  per stage is derivable from existing data with **no migration** — the one differentiating
  feature that costs a query and a card, not a schema change. Flag an application as *likely
  ghosted* once it sits in `applied` or `phone_screen` past the user's own p90 for that stage,
  and offer the `ghosted` transition inline. This turns the FSM's audit trail into a product
  feature and gives the `ghosted` state a reason to exist beyond bookkeeping. Do it first.
  *(Cold-start caveat: p90 over a handful of applications is noise. Needs a minimum-sample
  threshold and a sensible global default before it can say anything.)*

**Japan market**

These are the strongest differentiators and the most research-dependent — none should be built
from my summary alone. Verify each against a current primary source before writing a migration.

- [ ] **Visa / status-of-residence tracking.** For a foreign engineer in Japan this is the
  single most decision-relevant fact about a job posting, and no generic tracker models it. Per
  application: does the employer sponsor, and which status of residence
  (技術・人文知識・国際業務 is the usual one for software roles)? Globally: days remaining on
  the user's current status, and Certificate of Eligibility timing when changing employer.
  There is also a points-based Highly Skilled Professional track (高度専門職) with a published
  scoring table — a points calculator would be a genuinely useful standalone tool. **Verify the
  current categories and point criteria against the Immigration Services Agency / MOJ before
  building; immigration rules change and I am not a reliable source for them.**
- [ ] **Rirekisho + shokumu-keirekisho generation.** Japanese applications conventionally want
  two documents: 履歴書 (personal history, a standardised form) and 職務経歴書 (career history,
  free-form). Generating both as PDFs from stored profile data would be the clearest possible
  signal that the author understands the market. **Check the format question first:** the JIS
  standard template was, I believe, withdrawn around 2020, leaving several competing
  semi-standard layouts rather than one official form — confirm this before committing to a
  layout, because picking a dead format would be worse than not shipping the feature.
- [ ] **Model the recruiter channel.** Hiring in Japan is heavily agent-mediated. Add a channel
  to each application — direct / agent / referral — and record which agency submitted you where.
  Two agencies submitting the same candidate to the same company is a real and damaging
  situation; an app that warns about a duplicate submission is solving a problem the incumbents
  ignore. Needs a `channel` column and an `agencies` table.
- [ ] **Compensation as 年収, not salary.** Japanese offers are quoted as an annual figure that
  folds in bonus (賞与), often expressed as N months of base. Comparing "600万, 12 months + 2×
  bonus" against a flat 14-month structure is real arithmetic that candidates get wrong. Store
  the structure, not just the number, and normalise for comparison.
- [ ] **Calendar-aware follow-ups.** `FollowUpReminderJob` already runs at 08:15 JST. Teach it
  the dead zones — the New Year holidays, Golden Week, Obon — when nudging a company achieves
  nothing. A reminder that knows not to fire on 1 January is a small touch that reads as care.
- [ ] **Japanese-level filter.** Record the Japanese proficiency a posting demands (JLPT N1/N2,
  "business level", conversational, none) against what the user holds, and filter on it.

**Global remote**

- [ ] **Can they actually hire you?** The filter that silently kills most global-remote
  applications from Japan: many companies cannot employ someone resident here, and offer only a
  contractor arrangement or an employer-of-record. Track the hiring entity and whether Japan is
  a supported location — ideally captured at prefill time, since job postings usually say.
  This is the remote-work analogue of the visa item, and just as underserved.
- [ ] **Timezone overlap.** Store the company's home timezone and any required overlap window,
  then show which roles are survivable from JST. A US-West role demanding four hours of overlap
  means a 1am start. Warn at interview-scheduling time too — an invite that lands at 03:00 JST
  should be visibly flagged, not quietly accepted.
- [ ] **Interview scheduling with `.ics` export**, timezone-correct. Falls out of the above and
  is small once the timezone data exists.
