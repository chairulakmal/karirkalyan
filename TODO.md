# TODO

Open work only. Shipped work lives in [`CHANGELOG.md`](CHANGELOG.md).

**Current release: `v1.0.1`** — tagged 2026-07-10 at `2980300`. Security review + fixes.
**Next release: `v1.1.0`** — Japanese UI (i18n) and a homepage + about/docs revamp.
**After that: `v1.2.0`** — the Kanban board view.

Everything below is post-1.0.1. The v1.1.0 and v1.2.0 items are scoped; the backlog is not.

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

### Japanese UI (i18n)

No i18n dependency exists yet and `web/app/layout.tsx:74` hardcodes `lang="en"`. Six pages
(`web/app/**/page.tsx`), so the copy surface is small; the work is in the plumbing, not the
volume of strings.

- [ ] **Pick and install a library.** `next-intl` is the usual fit for App Router. Confirm
  the version supports Next.js 16 before committing — check `node_modules/next/dist/docs/`
  for the current i18n guidance rather than assuming, per `web/AGENTS.md`.
- [ ] **Decide routing strategy** — `/ja/*` path prefix vs. cookie-only locale. Path prefix
  is better for SEO and links; it means updating the `config.matcher` in `web/proxy.ts` so
  route guards and the crawler-metadata exclusions still fire on prefixed paths.
  *Note: the CSP nonce work already forces dynamic rendering app-wide via `await connection()`
  in the root layout, so locale routing costs no static optimization — there is none left to lose.*
- [ ] **Extract copy into message catalogs.** Start with the status labels and help text
  (`web/app/lib/format.ts`, `web/app/components/status-help.tsx`) — they are the highest-value
  strings and the ones a Japanese reviewer will look at first.
- [ ] **Translate the 13 FSM state names** with care. `phone_screen`, `final_round`, `ghosted`
  and `withdrawn` have no clean one-word Japanese equivalent; pick terms that match how
  Japanese job boards actually label these stages, not literal translations.
- [ ] **Set `lang` dynamically** from the active locale, and add a locale switcher.
- [ ] **Server-side error messages** — Rails returns English validation/error strings that the
  frontend renders verbatim. **Map them in the web layer**, keyed off the error code and HTTP
  status; leave the API English-only. Translating in Rails would mean an i18n dependency,
  locale negotiation on every request, and a second message catalog to keep in sync — for
  strings only the frontend displays. Unlike the FSM table, nothing is duplicated by mapping
  client-side: the API's error codes stay the single source of truth and `web/` only supplies
  their presentation, which is what a message catalog is for.

### Homepage + about/docs revamp

Depends on i18n landing first — every string below should be authored into the message
catalogs bilingually, not written in English and retrofitted.

Today `web/app/page.tsx` is a single-file landing page: hero, three feature cards
(FSM-backed / resume per role / follow-up reminders), and a footer. There is no about or
docs page at all, and the footer's "API docs" link points off-site to the raw rswag UI on
the Railway domain (`API_DOCS_URL` in `web/app/lib/links.ts`).

- [ ] **Decide what the homepage is arguing.** It currently sells the app to a jobseeker
  ("without the spreadsheet"). The actual audience is a hiring reviewer in Tokyo. Those want
  different pages — either commit to the product framing and let an about page carry the
  engineering story, or reframe the hero. Don't try to do both in one hero.
- [ ] **Build an `/about` page** — the engineering narrative that `SPEC.md` already tells
  well: why Rails for a TS developer, why a PORO FSM over a state-machine gem, why Solid
  Queue instead of Sidekiq/Redis, why `bytea` over object storage. This is the page that does
  the portfolio work; the homepage only has to get people to it.
- [ ] **Build an in-app `/docs` page** rather than deep-linking the raw rswag UI. Off-site
  Swagger on a `*.up.railway.app` domain reads as unfinished, and it drops the visitor out of
  the app's design system. Keep the rswag UI reachable, but link to it from a docs page that
  frames the API instead of making it the destination.
- [ ] **The homepage will need a real design pass, not a copy edit.** The current page is a
  competent template. Treat aesthetic direction as part of the work — the frontend-design
  skill is the right starting point.
- [ ] **Wire up the SEO surfaces.** `web/app/sitemap.ts` hardcodes three URLs (`/`, `/sign-up`,
  `/sign-in`); new pages must be added there, and locale-prefixed variants too once i18n lands.
  The `jsonLd` blob in `page.tsx` should move somewhere reusable if a second page needs it.
- [ ] **Fix `web/public/llms.txt`** — it still says reminders run on "idempotent **Sidekiq**
  background jobs". Sidekiq was removed in v1.0.0 when Solid Queue landed. It also hardcodes
  the FSM state list, which will drift; regenerate or annotate it.

---

## v1.2.0 — Kanban board view

Columns are FSM states, cards are applications, and a drag between columns is a
`PATCH /api/v1/applications/:id/transition` call. It demos the state machine far better than a
list does.

**This release opens with an `api/` change, which is why it is not v1.1.0.** Land that change
in its own PR, on its own, before any board component is written. Do not fold it into a UI PR.

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

- [ ] **Danger colors bypass the token system** — 25 improvised `red-*` Tailwind utilities across
  `web/app`, and no `--color-danger` anywhere. Add the token to `design/assets/tokens.css` +
  `globals.css` and migrate.
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
