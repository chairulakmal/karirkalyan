# TODO

Open work only. Shipped work lives in [`CHANGELOG.md`](CHANGELOG.md).

**Current release: `v1.0.1`** — tagged 2026-07-10 at `2980300`. Security review + fixes.
**Next release: `v1.1.0`** — Japanese UI (i18n), a homepage + about/docs revamp, and a
Kanban board view.

Everything below is post-1.0.1. The v1.1.0 items are scoped; the backlog is not.

---

## v1.1.0 — Japanese UI, marketing pages, Kanban board (next)

The changes that most directly serve a Tokyo-market portfolio. i18n shows the app can ship
bilingual; the homepage and about/docs pages are what a reviewer sees before anything else;
the Kanban board demos the state machine far better than a list does. All three are
user-visible, which is the point — the debt in the backlog is not.

**Do them in this order.** i18n first, because it decides how copy is stored — writing new
marketing copy before the message catalogs exist means authoring it twice. The board last,
because it is the largest and the only one with an unsettled data-fetching design.

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
  frontend renders verbatim. Decide whether to translate on the client from error codes, or
  leave the API English-only and map codes in the web layer. Client-side mapping is simpler
  and keeps the API contract stable.

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
- [ ] **Build an `/about` page** — the engineering narrative that `PLAN.md` already tells
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

### Kanban board view

Columns are FSM states, cards are applications, and a drag between columns is a
`PATCH /api/v1/applications/:id/transition` call.

- [ ] **Solve the 13-column problem.** `ApplicationFSM::VALID_STATES` has 13 states —
  too many to sit side by side. Group them: an active pipeline (`wishlist` → `draft` →
  `applied` → `phone_screen` → `technical` → `final_round` → `offer`) as columns, with the
  terminal and dead-end states (`accepted`, `declined`, `rejected`, `ghosted`, `withdrawn`,
  `archived`) collapsed into a closed lane or a filter.
- [ ] **Only allow legal drops.** `ApplicationFSM::TRANSITIONS` is the source of truth and it
  is *not* a linear pipeline — `ghosted → applied`, `rejected → applied` and `withdrawn → applied`
  are all legal, while most forward skips are not. The board must expose the transition table,
  not a guessed ordering. Consider serving `TRANSITIONS` from the API so the client never
  duplicates it.
- [ ] **Reconcile with cursor pagination.** `applications-list.tsx` cursor-paginates a single
  ordered list; a board needs every column populated at once. Either fetch per-column with
  its own cursor, or accept a bounded fetch-all for the board view. This is a real design
  decision, not an implementation detail — settle it before writing components.
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

Unscoped and unordered. `PLAN.md` Phase 9 also names an analytics dashboard and an AI
cover-letter assist as the declared roadmap.

- [ ] **Email verification** (Devise `:confirmable`).
- [ ] **CSV export** of applications.
- [ ] **Follow-up digest email** — Solid Queue landed; the mailer already exists.
