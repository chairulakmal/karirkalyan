# Changelog

Shipped work, newest first. Branch/PR names note where each change landed.
Open work lives in [`TODO.md`](TODO.md). Settled decisions-not-to-build are recorded here too
(§ Decisions below), so that `TODO.md` can stay open work only without the reasoning getting lost.

---

## v1.4.4 — 2026-07-17

The four items `v1.4.2` left open, shipped under the number they were renumbered to when that tag
was skipped for good. One branch, one PR *(feat/v1.4.4)*.

Still a patch by the mechanical test: no migration, no `v1` contract broken, and no new capability
— every item here makes something the app already did work properly, or stops it working badly.

### PDFs are named after the application they belong to

The download endpoint sent `resume.pdf` for every application, so a folder of ten downloads was ten
files called `resume.pdf`, `resume(1).pdf`, and so on — the id was in the URL and nowhere in the
name. The archive was worse in a specific way: it built its own name with `parameterize`, which
strips non-ASCII, so 「株式会社メルカリ」 emptied out to nothing.

- **One method names every PDF the API hands out**: `Application#download_basename(kind:)`, used by
  both per-application downloads and the account archive, so a file means the same thing whichever
  door it left by. The slugger **preserves Unicode** rather than transliterating it — a Japanese
  company name stays Japanese in the filename, which is what a Japanese job search wants and what
  `parameterize` cannot do.
- **The disposition changed from `attachment` to `inline`.** A resume is a document you read; the
  browser's PDF viewer is the right answer to clicking it. The exports keep `attachment` — those
  are files you are taking away, not documents you are reading.
- Non-ASCII names ride the standard two-field `Content-Disposition` (a transliterated ASCII
  `filename=` plus an RFC 5987 `filename*=UTF-8''…`); browsers prefer the second. No gem needed.

### A ceiling on applications, and a throttle on the writes that carry files

`TODO.md` scoped this as "a config change, not a design", and half of that was wrong — recorded
here because the correction is the interesting part. **A Rack::Attack throttle bounds a rate over a
window, and every window resets, so any positive rate integrates to unbounded total.** A throttle
cannot express "a ceiling on applications per account" at all. It was never a config change; it was
two different mechanisms wearing one sentence.

- **The throttle shipped as config, as promised**: `applications/write`, 30/min and 300/hour, per
  account, on the two requests that can carry a PDF. It bounds CPU and write I/O. It does not bound
  storage and cannot.
- **The ceiling shipped as `Application::MAX_PER_USER` (200)**, a model validation on create — the
  thing that actually bounds storage, on a database whose entire backup story is a nightly
  `pg_dump`. It needs no new error code: it reports through the existing `validation_failed`
  envelope with detail code `too_many_applications` on field `base`, the same shape the 1 MB upload
  cap already uses, so no controller and no frontend branch changed.
- **It is a bound, not an invariant**, and SPEC.md says so: the count takes no lock, so concurrent
  creates at the ceiling can overshoot by the number in flight. A real guarantee costs a counter
  column and an advisory lock to defend a number chosen by judgement.
- `DELETE` is deliberately outside the throttle — it is the one write that gives storage back.

### en/ja catalog parity is now a check, not a convention

next-intl resolves a missing key through `t.has()`, so a key that landed in `en.json` alone
degraded to fallback copy: the page rendered, lint and typecheck and the build all passed, and only
a Japanese reader ever saw it. Review cannot reliably catch a bug that is invisible in the locale
the reviewer reads — which is why "both catalogs move together" being written down was never
enough.

`web/scripts/check-i18n-parity.mjs` (`npm run lint:i18n`) now diffs the catalogs in the web CI job,
ahead of the build. It counts **every leaf path, with array elements counted individually**, so an
FSM reason chip present in English and missing in Japanese reports its missing index instead of
hiding inside an opaque array — dict-only counting is what once made a docs audit report a false
drift here. The catalogs were already at parity when it landed, so it went green: a ratchet, not a
repair. It caught its first real change one commit later, which is the item below.

### "Your data" and the profile block are one card

The dashboard rendered the same card twice — profile (email, member since) and exports (the CSV and
archive links) — with the average-days line wedged between. They are one thought: who you are, and
what you can take with you. They were two cards because of render order and nothing else. Now one
`ProfileCard` component, so an account or settings page can import it rather than copy it.

- **The export links render outside the card's `{user && …}` gate**, deliberately. `/privacy`
  promises the user can get their data out and these two links are the only surface honouring it;
  gating them on a successful `/dashboard` fetch would remove that surface exactly when the data
  looks least safe, and remove it silently.
- **The card takes the user as a prop and does not fetch one.** `/dashboard`'s payload already
  carries it — that fold is what `v1.3.0` shipped, and a component fetching its own user would put
  the second `/me` request back on every page importing it.
- The heading was a copy decision, not a mechanical move, and neither old eyebrow survived
  unchanged: the card is "Your data" / 「あなたのデータ」, the English export eyebrow promoted to
  name the whole card plus a *new* Japanese string, because 「データの書き出し」 means *exporting
  data* and cannot head a card that opens with an email address. `dashboard.profile` and
  `dashboard.exports.eyebrow` are gone; both catalogs moved together, 346 → 345 keys.

## v1.4.3 — 2026-07-17

**There is no `v1.4.2` tag, and there never will be.** The number was scoped as a code-quality
patch, but only part of it was written — the `ListQuery` extraction, the API base rename, and the
post-`v1.4.1` docs audit — when a production report arrived and `v1.4.3` was scoped underneath it
to answer it. The prefill work then landed on `main` *above* the half-finished `v1.4.2`, which put
both patches at one commit and left one tag to carry them. Rather than hold the fix for the four
items `v1.4.2` still had open, this release takes the number the prefill work was scoped as and
ships everything on `main` under it. `v1.4.2`'s remaining items — download filenames, upload
throttle, en/ja key parity as a CI check, the profile-card fold — are `v1.4.4`, still unwritten,
still a patch. The gap in the sequence is the honest record of what happened; the alternative was
renumbering a release the changelog had already described by name.

Three branches, grouped below by the one each change landed on.

### URL pre-fill: two bugs behind one prod report *(fix/prefill-error-taxonomy)*

Both found chasing a single failure: pre-fill dying on a TokyoDev posting. The logs could not tell
the two apart — lograge records `time`/`request_id`/`params` and never the body, and both failures
rendered a `422` from the same rescue. Response timing (25.7ms and 5.5ms, far too fast for a real
TLS round trip) plus a read of the source is what separated them.

Review then found six more defects clustered around the same code, and they are listed here rather
than deferred because five of them are the *same* bug as the two above — an outcome reported as
something it isn't. Still a patch by the mechanical test: no migration, no capability, no `v1`
contract broken.

- **The connection now pins an IPv4 address, not whichever address DNS listed first.** Outbound
  IPv6 is disabled on the `api` service, and Cloudflare-fronted hosts answer AAAA-first — so
  `addresses.first` handed `Net::HTTP` an address the container cannot dial, and the connect died
  with `ENETUNREACH` before a packet left the box. Every Cloudflare-fronted board was affected,
  which is most of them. **This does not weaken the SSRF guard**, and the distinction is worth
  being precise about: validation still runs over *every* resolved address and a single internal
  one still rejects the whole URL. The preference decides which *already-validated* address gets
  dialled — never whether validation ran. Enabling outbound IPv6 on Railway was the alternative,
  and was rejected: it makes the fetch depend on a platform toggle no reader of the code can see.
- **"The site blocked us" is no longer reported as "your URL is malformed".** The controller
  rescued `UrlPrefillService::Error` — the *base class* — and rendered `invalid_url`, so every
  `FetchError` reached the user as an accusation about a URL they had pasted correctly.
  `FetchError` now has its own rescue ahead of the base class, and the taxonomy splits by what it
  asks the user to do: `prefill_blocked` (`422`) for a site that refuses automated readers —
  `401`/`403`, or a `cf-mitigated` header on any status — and `prefill_unreachable` (`502`) for a
  page we genuinely could not get. A `429` is deliberately *not* blocked: it is the one refusal
  that lifts, and `prefill_blocked`'s copy would tell the user to give up and type it by hand —
  this release's own bug in a new costume. It falls through to `prefill_unreachable`, which asks
  for a retry. **Adding codes is append-only and so patch-safe**; both landed in SPEC.md § Error
  codes and in *both* locale catalogs, parity intact.
- **A page with no readable text is no longer a `FetchError` either.** Not in the original scope —
  found while implementing it. The service raised `FetchError` for a page it had fetched
  perfectly well, so honouring the fix as written would have swapped one lie ("your URL is
  malformed") for another ("we couldn't reach it"). It now raises `UnreadableError` and maps to
  the existing `prefill_failed`, whose copy — *fill in the details manually* — was already the
  true thing to say.
- **A Japanese posting over the body cap returned an untyped `500`.** `byteslice` is byte-indexed
  and Japanese runs three bytes to the character, so a cut at the cap landed mid-character and the
  next `gsub!` raised `ArgumentError` from outside every rescue — on precisely the postings this
  service exists to read. The truncated body is now `.scrub`bed, which drops the partial character.
- **The SSRF guard could be switched off by an environment variable.** `Net::HTTP.new(host, port)`
  defaults its third argument to `:ENV`, so under an `http_proxy` var Net::HTTP dials the proxy,
  lets *it* re-resolve the hostname, and ignores `ipaddr` entirely — the rebinding pin becomes
  decoration. No proxy var is set today; passing `nil` explicitly makes sure setting one later
  cannot quietly disable the defence.
- **The guard now re-runs, in full, on every redirect hop.** `fetch` recurses on a `Location` and
  never passes back through `validated_uri`, and `URI.join` will happily produce `ftp://host:80/x`
  from a `Location` header — which cleared a port-only check and then died in `Net::HTTP::Get.new`
  as another untyped `500`. Scheme, port and every resolved address are re-checked per hop.
- **A hop's rejection is no longer blamed on the user.** The guard raises `InvalidUrlError` — an
  accusation about the URL the *user* pasted. True on hop 0; a lie on every hop after it, where
  the *site* chose the destination. Past hop 0 it is now a `FetchError`. Same bug as the headline
  one, one level down.
- **The guard's error messages were an internal-hostname oracle.** "Doesn't resolve" and "resolves
  somewhere internal" read differently, so probing `redis.railway.internal` told you which names
  exist — and the demo account's credentials are published, so "authenticated" is no barrier to
  whoever is asking. Every rejection now says the same thing; the real reason goes to the log,
  where the operator can see it and the prober can't.
- **An all-empty extraction is no longer a `200`.** Claude reading a challenge page, a login wall
  or an SPA shell and finding no posting handed the user a blank form and called it success. It
  now raises `ExtractionError` → `prefill_failed`. A missing `ANTHROPIC_API_KEY` also fails
  *before* the fetch rather than after it, instead of spending up to 13s of SSRF-guarded timeouts
  on a result the server has no way to use.

**Not attempted: defeating a challenge.** Some sites refuse automated readers; that is expected
degradation, not a bug to engineer around, and the honest error is the deliverable. The recovery
path it points to — let the user paste the posting text and extract from that — is deliberately
**not** here: it is a capability, which by the mechanical test makes it a minor, and it is scoped
to `v1.6.0` where it serves the share-sheet flow's failure mode.

> **Corrected 2026-07-17, hours after this tag.** As published, this section claimed TokyoDev
> "answers any non-browser client with `403` + `cf-mitigated: challenge`, verified against both our
> User-Agent and a stock Chrome one". **That was false**, and the GitHub release notes for `v1.4.3`
> still carry it — they are left standing as the record of what was believed on the day.
>
> Every `403` behind it was seen from a laptop and none from this service — the probes were run
> locally, never from inside the container. So the claim was never tested against the path it
> described: the `ENETUNREACH` bug at the top of this section killed every connect to a
> Cloudflare-fronted host before a packet left the box, and TokyoDev is one, so the `api` service
> had never reached it at all. The laptop was also fetching many TokyoDev URLs at once, which is
> itself a known way to get challenged — likely the reaction it recorded as policy, though that
> part is inference and does not need settling. Re-probed hours after the tag — from a laptop
> again, so this speaks for the site's mood and not for the container — TokyoDev answered this
> service's exact User-Agent with `200`, six of six, and a stock Chrome one likewise: the block was
> neither standing nor UA-based. What speaks for the container is production, where pre-fill
> against a TokyoDev posting now works.
>
> **Nothing in the code changed** — `prefill_blocked` names a real state and stays, and the paste
> fallback keeps its `v1.6.0` slot on the reasoning above, which never depended on TokyoDev.
> What was wrong was the evidence, and the lesson is in SPEC.md § `UrlPrefillService`: a
> self-inflicted block is indistinguishable from a real one at the moment you observe it.

### The post-`v1.4.1` docs audit *(fix/privacy-truth-and-doc-drift)*

- **Honeybadger Insights is off.** It was on, which meant honeybadger's Rails plugin shipped an
  event per request, per SQL query and per mailer send — a stream of telemetry from healthy
  traffic, not just from failures — while `/privacy` told users, in two languages, that Honeybadger
  "receives error reports". The cheaper fix was to widen the sentence; the right one was to stop
  sending the data, so that the sentence is true as written. Found by the post-v1.4.1 docs audit.
  **The constraint this leaves behind:** turning Insights back on is a change to what a third
  party sees, not a monitoring tweak — the legal pages (both locales) and SPEC.md § Legal pages
  move in the *same* PR, or the policy becomes false. That rule is written into
  `api/config/honeybadger.yml` above the flag; do not flip it from a dashboard.
- **Three false claims corrected on `/privacy`, both locales.** The page said the request log
  records your IP (lograge emits `time`, `request_id` and `params` — no IP), and that Anthropic
  receives the job-posting *URL* (the server fetches the page itself and sends Claude the stripped
  text; the URL never leaves the box — SPEC had this exactly backwards). It now also says the
  pre-fill is fetched server-side, which is a fact in the user's favour: the job board never learns
  who was reading.

### Code quality *(refactor/applications-list-query)*

- **`Applications::ListQuery` — `GET /api/v1/applications` gets a query object.**
  `ApplicationsController#index` inlined filtering, cursor decoding and the `limit + 1` lookahead
  in one 35-line method; it is now a call and a render, and `app/queries/` holds the mechanism
  next to `GhostRiskQuery`. **Behaviour is unchanged by design** — the existing request specs
  covering filters, pagination and the `NONE` sentinel passed untouched, which is what makes this
  an extraction rather than a rewrite. The sequencing is the point: `v1.6.0`'s market-layer
  filters (channel, compensation, Japanese level) all land on this exact read path, and they now
  compose into an object built to hold them instead of thickening a controller that would then
  need refactoring under load. The contract that action always had is now *written down* in
  SPEC.md § Query layer rather than implied by control flow — in particular the deliberate rule
  that bad input is **ignored, not rejected**: an unknown status, a malformed cursor and a junk
  limit each return the first page, because these params come from navigation (a stale bookmark,
  a hand-edited URL) and a browsable list that `422`s on a typo'd query string is worse than one
  that shows the unfiltered page.
- **One behaviour change, and it is a bug fix.** `?limit=` (present but empty) returned **one**
  row, because `"".to_i` is `0` and the old clamp floored it to 1. It now returns the default 10.
  Nothing requests it that way; the old result was an artifact of the clamp, not a contract.
- **`API_BASE` / `API_BASE_URL` → `INTERNAL_API_URL` / `PUBLIC_API_ORIGIN`.** Two near-identical
  names for opposite things, and it was worse than it looked: `API_BASE` was a bare alias of a
  private `API_URL` const, so the confusable pair was really a triple. The surviving names state
  the distinction that matters — `INTERNAL_API_URL` (`app/lib/api.ts`) is the server-to-server
  fetch base, in production the private `api.railway.internal` address a browser cannot reach;
  `PUBLIC_API_ORIGIN` (`app/lib/links.ts`) is the public URL, and exists *only* to build outbound
  doc links. The latter is now module-private, since only `API_DOCS_URL` ever read it — the
  ambiguity is gone from the export surface, not just renamed on it. **The `API_URL` env var keeps
  its deployed name**: renaming it would mean a Railway variable change, which is not a
  patch-level move and buys nothing the binding name doesn't.

---

## Decisions — settled, not shipped

Questions closed on the dates given, moved here when `TODO.md` was cut back to open work only
(2026-07-13). Nothing below changed the code; each entry exists so the question does not get
reopened by accident, and each names the condition under which it may be.

- **Light theme only — no dark mode.** *(2026-07-11)* `web/app/globals.css:28` hardcodes
  `color-scheme: light`, and that is the ship state, not a gap. KarirKalyan is a professional
  app, not a dev tool: its user is a job seeker, and the app sits in a context that is uniformly
  light — a recruiter's email, a company careers page, a PDF of their own resume. Dark mode is
  an expectation engineers carry over from editors and terminals; building it here would be
  building for the developer looking at the portfolio rather than the person the product claims
  to serve, which is exactly the tell that separates a product from a demo. The cost side is not
  free either: a second theme doubles the surface every future screen has to be designed,
  reviewed, and screenshotted against, and a half-maintained dark theme (the usual outcome on a
  solo project) looks markedly worse than a confident single one. The dark brand icons
  (`design/assets/icons/karirkalyan-dark.svg`, `png/icon-dark-512.png`) stay, unreferenced —
  they are *brand* assets (a logotype for dark backgrounds: slide decks, social cards, a dark
  README banner), which is a different thing from an app theme, so their existence is not
  evidence of an unfinished dark mode and nothing in `web/` should grow toward them.
- **No document version history.** *(2026-07-12)* One resume and one cover letter per
  application, the latest upload overwriting the last; `applications.resume` stays a single
  `bytea`. Keeping the last N versions was considered and rejected: it would multiply blob count
  against the primary Postgres — the same database whose entire backup story is a nightly
  `pg_dump` — to retain documents nobody reads, and the honest form of the feature is a
  `documents` table plus object storage, which is a migration, not an afternoon. The question a
  job seeker actually asks is *"which resume did I send to this company?"*, and one document
  pinned to one application already answers it exactly. Version history exists at the layer that
  costs nothing: the account export zip is a point-in-time snapshot, and the `MMDD` stamp planned
  for download filenames (`v1.4.4`) keeps a re-uploaded resume from clobbering the saved copy of
  the old one. **Do not re-lift this without a storage change to justify it.**
- **No client-side error tracking in `web/` — a conscious asymmetry.** *(2026-07-11)*
  Honeybadger covers the API (`api/Gemfile`, wired in production); the frontend reports nothing,
  and that is accepted for a single-user app: the one user *is* the error reporter.
- **No offer-comparison view.** *(2026-07-15)* Once `v1.6.0` (normalized 年収) and `v1.7.0`
  (visa, hiring entity, timezone) land their fields, a side-by-side compare of applications in
  `offer` status was the obvious UI over them — considered in the 2026-07-15 scoping pass and
  skipped. Simultaneous offers are rare for a single user, and the moment two exist is a
  spreadsheet moment: high-stakes, one-off, and better served by the CSV export than by a view
  maintained year-round for a day that may not come. The fields themselves ship regardless; a
  sortable column or two on the list may cover the rest. **Reopen the day two live offers
  actually coexist** — that is the trigger, not a release number.
- **No duplicate-posting detection beyond the ownership warning.** *(2026-07-15)* A fuzzy
  company+role match at create/prefill time ("looks like #12") was considered in the same pass
  and rejected: one user with tens of applications recognizes a duplicate himself, and the
  duplicate that actually costs money — two agencies submitting to the same company — is
  exactly what `v1.6.0`'s ownership-window warning already fires on. A second, fuzzier warning
  next to it would add false positives, not protection. **Reopen only if application volume
  grows past what a human scans** — which would mean the app has outgrown its one-user premise
  anyway.

---

## v1.4.1 — 2026-07-12

**"Close the door."** A patch, and the mechanical test says so without argument: it *removes* a
capability rather than adding one, and touches no schema — the v1.4.0 image boots against the
database this leaves behind. It jumped the queue ahead of the refactors for the only reason that
should ever move a release forward: it is not about what the app can do, it is about what it is
holding. This app stores resumes. Open sign-up meant strangers' resumes, and closing the door
makes almost the entire data-protection question disappear rather than answering it.
*(feat/v1.4.1-close-the-door, PR #62)*

- **Public sign-up is closed.** There is no `POST /api/v1/auth/sign_up` and no `/sign-up` page.
  Visitors sign in to the shared demo account, which is the full app with twelve applications in
  it — an empty new account was always the worse demonstration anyway. Accounts are created with
  `bin/rails users:create EMAIL=… PASSWORD=…`, which is also `WelcomeMailer`'s only caller now.
  Reopening registration is a product decision, not a config flag: SPEC.md § Registration is
  closed lists the five things it would owe users.
- **The Devise trap this had to dodge:** `:registerable` generates the sign-up `POST` *and* the
  account-destroy `DELETE` from one controller, so `skip: [:registrations]` silently takes the
  deletion endpoint with it. Registrations are skipped and the destroy half re-declared by hand as
  an ordinary route, on a path that says what it does. The controller no longer subclasses
  `Devise::RegistrationsController` either — inheriting it would keep `create` alive as a method in
  the one release whose point is that it is gone.
- **`DELETE /api/v1/auth/account`** is now specified, contract-documented and request-tested. It
  cascades to applications, timeline entries and the blobs inside them, and revokes the JWT for
  free: JTIMatcher validates a token by looking its `sub` up in `users`, and there is no longer a
  user to find. The demo account is exempt (`403`) — its credentials are published, so without the
  guard any visitor could delete the portfolio's centrepiece until the next hourly reset. A
  self-service delete *button* is deliberately **not** here: with sign-up closed there is no third
  party who needs one, and the legal pages do not pretend otherwise.
- **`bin/rails users:set_password EMAIL=… [PASSWORD=…]`**, which closing the door made mandatory
  rather than optional: `User` has no `:recoverable` module, so there is no reset flow — and a user
  who forgot their password can no longer just sign up again. It rotates `jti`, so every existing
  token for that account dies with the old password.
- **`/privacy` and `/terms`**, in English and Japanese. Every claim on them is checkable against
  the code: what is collected (including the IP addresses the rate limiter, the error reporter and
  the request log keep, which are collected whether or not anyone wants them), where it is stored,
  all five sub-processors — GitHub among them, because the nightly `pg_dump` is a GitHub Actions
  artifact, which means GitHub holds a copy of every resume and a policy that omitted it would be
  false — the two export endpoints, and erasure by emailing the operator. Japan's APPI has had no small-handler exemption since
  2017 and a natural person can be a data controller, so "it's a portfolio project" was never the
  answer. Both pages are in `OPEN_PATHS` — a privacy policy a user cannot reach while logged in
  is not a privacy policy.
- The `auth/sign_up` Rack::Attack throttle is gone with the endpoint it guarded; `sign_in` is now
  the only unauthenticated write left to throttle. The E2E suite used to open every run by
  registering a throwaway account — exactly the affordance this release removed — and now signs in
  as `e2e`, seeded alongside `demo` and left empty.

## v1.4.0 — 2026-07-12

**"The search, this week."** A minor: four capabilities, no migration, and nothing removed from
the database — the v1.3.1 image would still boot against it, which is the whole of the test. The
four are two pairs, not four errands: the digest and the calendar are the same edit to
`FollowUpReminderJob`, and the two exports are the same controller and the same download surface.
*(feat/v1.4.0-digest-and-exports, PR #61)*

- **One follow-up digest per user per day**, replacing one email per application. `FollowUpMailer`
  loses `#reminder` and gains `#digest`; the job groups the applications it claimed by user and
  sends once. A morning with six due follow-ups used to mean six emails, which is how a reminder
  system teaches you to ignore it.
- **The digest is calendar-aware.** `JapanCalendar` (`app/lib/japan_calendar.rb`) is now the only
  thing that knows what a business day in Japan is: weekends, national holidays via the `holidays`
  gem (a gem and not a list, because 春分の日/秋分の日 move with the equinoxes and 振替休日 is a
  rule, not a date), plus New Year, Golden Week and Obon. On those days the job holds.
  **Held is not dropped** — the idempotency key derives from `follow_up_at`, *not* from the day the
  job runs, so the next business day sends the held reminder exactly once. The same property is
  what stops an overdue application being nudged every single morning, and what makes moving
  `follow_up_at` re-arm the reminder.
- **CSV export** (`GET /api/v1/exports/applications`) — one row per application, formula-injection
  escaped (a cell opening with `=`, `+`, `-` or `@` is prefixed with a quote) and `force_quotes`.
  A convenience view: it recovers a table, not an account.
- **Full-account export** (`GET /api/v1/exports/account`) — a zip of `account.json` (user, every
  application, every timeline entry, behind a `schema_version`) plus every resume and cover letter
  under `resumes/` and `cover-letters/`. This is the data-safety artefact and the reason the pair
  exists: the real history lives in one Railway Postgres on a plan with no managed backups, and
  this is the leg the user can pull without a provider, a cron runner, or a shell.
- Both exports are `send_data`, scoped to `current_user`, `nosniff`, and throttled **per account**
  (10/min, 60/hour) — not a money vector but a work vector, since the archive reads every blob the
  user owns. They surface on the dashboard as two links proxied through
  `web/app/api/exports/*/route.ts`, so the JWT stays server-side like every other download.

---

## v1.3.1 — 2026-07-12

**A patch, and the first release cut by the policy it contains.** Nothing here is a new
capability — a dependency refresh, dead configuration deleted, dev/CI brought level with
production, and documentation corrected — which is the whole of the definition. The previous
image would boot unchanged against this database; there is no migration in the release at all.
*(chore/dependency-refresh, PR #57; chore/postgres-18, PR #58; chore/purge-sidekiq-debris,
PR #59; chore/versioning-policy, PR #60; the backlog scoping went straight to `main` as docs)*

- **A versioning policy, written down** (`SPEC.md` § Versioning & releases). SemVer, but with
  **major redefined against a surface this project actually has**: the textbook rule (*major
  means you broke the API your consumers depend on*) can never fire here — `web/` is the only
  client of `/api/v1` and ships in the same commit — so major now means **the previous image
  cannot be redeployed against the new database**: an irreversible migration, `/api/v2`, an
  `ApplicationFSM` state removed or renamed, a required env var dropped. Minor stays "additive
  capability, rollback is still a redeploy"; patch stays "no new capability". The version now
  lives **only** in the git tag: `web/package.json` is pinned to a static `0.0.0` (the package
  is `private: true`, so npm never reads the field) rather than mirroring the tag by hand, which
  is the `PLAN.md` failure mode in miniature.
- **The Sidekiq/Redis debris from v1.0.0 is gone** — the `Dockerfile` described a second
  `sidekiq` Railway service that does not exist and claimed background jobs "only run because
  of" it; `.env.example` in both apps advertised `SIDEKIQ_*` credentials nothing reads; the
  health check carried its old Redis `PING` in a comment. Deleted `config/sidekiq.yml` and
  `spec/requests/sidekiq_web_spec.rb` (the gem is not in the `Gemfile`, so `Sidekiq::Web`
  cannot be mounted — the spec was testing Rails' router). The *historical* mentions stay:
  they explain why the system is what it is.
- **Local dev and CI moved to PostgreSQL 18**, matching production, which was already there.
  `postgres:18` relocates `PGDATA` to `/var/lib/postgresql/18/docker` and declares its volume
  at `/var/lib/postgresql`, so a bare tag bump would have left the live data directory outside
  the named volume and silently emptied the database on `docker compose down`.
- **Documentation audited against the implementation.** `SPEC.md` claimed the FSM has
  thirty-three edges (it has twenty-six — the rule against restating the transition table
  applies to its edge count too); `web/README.md` claimed both locales are URL-prefixed
  (`localePrefix` is `"as-needed"`: `ja` is prefixed, `en` is bare, `/en/*` `307`s); the
  `sign_up` throttle and the deliberate absence of an OpenAPI path for `/up` were undocumented.
  Both READMEs gained an i18n row — neither mentioned the product itself is bilingual.
- **Gems and npm packages refreshed** within their existing constraints — `fugit`,
  `rubocop-rails`; Playwright, Tailwind, `@types/react`, ESLint; and patch bumps to the four
  exact pins (Next → 16.2.10, React → 19.2.7). Clears the `@babel/core` and `js-yaml`
  advisories: four vulnerabilities down to two. The two that remain are one advisory —
  postcss, bundled inside Next, whose affected range covers *every* released Next, so there
  is no version to move to. npm's own remedy is a downgrade to `next@9.3.3`; we declined it.
  ESLint 10, TypeScript 7, and `@types/node` 26 are majors and were left for their own diff.
- **Node pinned to 24, declared once in `web/.nvmrc`.** CI ran Node 22 (npm 10) while local
  dev runs Node 24 (npm 11), and the two majors disagree about the lockfile — npm 11 dedupes
  away the nested `@swc/helpers` that next-intl's peer range needs and npm 10 demands. That
  is the *same* `npm ci` failure v1.1.0 hit; v1.1.0 fixed the symptom by regenerating the
  lock with npm 10 and left the version gap in place, so it fired again on the first push of
  PR #57. The gap is now closed rather than papered over: `setup-node` reads the version via
  `node-version-file`, and Railpack reads it to build production — which had declared no Node
  version anywhere and was running Railpack's implicit default. Production moves to Node 24
  on the next deploy.
- **The backlog is scoped into releases** (`TODO.md` § Release plan) — `v1.3.1` through
  `v1.6.0`, plus the one item that cannot fit under 1.x. Applying the new policy's mechanical
  test to the whole file, only the `positions` entity fails it (a new table *and* a changed
  meaning for `accepted` in the FSM), so it is the sole major and everything else is a minor
  or a patch. Items are grouped by which files they would otherwise force us to open twice,
  not by theme.

---

## Backups — 2026-07-11, no tag

The backup story ships from the private
[`karirkalyan-backups`](https://github.com/chairulakmal/karirkalyan-backups) repo, so it carries
no tag here — recorded because it answers this project's worst day: the real job-search history
lives in one Railway Postgres, and the Railway Hobby plan has no managed backups (confirmed
2026-07-11).

- **Scheduled `pg_dump`, daily cron at 05:15 JST.** Each run fingerprints `users` /
  `applications` / `timeline_entries` (`count @ max(updated_at)`) and only dumps when the
  fingerprint changed since the state committed by the previous backup — `solid_queue` /
  `solid_cache` churn never triggers it, and the fingerprint commit doubles as the keep-alive
  against GitHub's 60-day cron auto-disable. The dump itself is the full database: client major
  queried from the server at run time, gzipped artifact on 60-day retention, `pipefail` plus
  completion-trailer and size checks so a failed dump is a red run, never a silent tiny artifact.
  Private-repo variant, so the dump needs no encryption.
- **Restore drill passed 2026-07-11.** `db-dump-7` restored into a scratch Postgres 18.4 (the
  `docker-compose.yml` in the backups repo, tmpfs, port 5418) with zero errors; all 17 tables and
  every row came back (`users:3 | applications:19 | timeline_entries:32`, status spread intact).
  Drill steps are documented in the backups repo README, and the setup is documented on this side
  of the fence in SPEC.md § Deployment → Backups (added in the v1.4.1 docs audit, because
  `/privacy` states the 60-day retention four times and it was otherwise checkable only from a
  private repo nobody auditing this one can open).
- **Decision recorded: a dump, not a mirror** on a free Postgres tier — a second live database is
  HA machinery for an app that needs an undo button, and free tiers expire, pause idle databases,
  and add a version-compat surface to maintain. The second, provider-independent leg of the
  backup story is the full-account export, shipped in v1.4.0.

---

## v1.3.0 — 2026-07-11

Tagged at `f455853`. Ghost prediction: the dashboard now says which applications have almost
certainly gone dead. It also absorbed the two production items parked in the performance
release, because it touched both. *(feat/ghost-prediction, PR #56)*

### Ghost prediction

- **`Applications::GhostRiskQuery`** (`api/app/queries/` — a new directory) flags any
  application sitting in `applied` or `phone_screen` that has been silent longer than the
  user's **own p90 reply time** for that stage. No migration, no new column: the dwell times
  are reconstructed from the `timeline_entries` audit trail with a window function, which is
  the whole point — the FSM's audit log stops being bookkeeping and becomes a feature.
- **Each timeline row is read as an *exit*, not an entry.** Creation writes no timeline entry,
  so an application added straight as `applied` — the common case — has no `to_status =
  'applied'` row to date the stage from. The stage's start comes from
  `COALESCE(LAG(created_at) OVER (…), applied_at, created_at)`, which also makes backdated
  `applied_at` and `ghosted → applied` revivals fall out with no special cases.
- **Cold start is handled, and admitted to.** Below five recorded replies at a stage the
  threshold is a global default (21 days for `applied`, 14 for `phone_screen`), and the
  payload carries `basis: "default" | "personal"` so the UI can say so rather than passing a
  default off as the user's own statistic. Personal thresholds are clamped to 7…90 days.
  Exits to `ghosted` / `withdrawn` / `archived` never enter the sample — folding `ghosted` in
  would let every ghosting the user records raise their own threshold, and the predictor would
  talk itself out of ever predicting again.
- **The dashboard card offers the `ghosted` transition inline** (`at_risk` rows carry
  `lock_version`, so no re-fetch), sorted longest-silence-first, with a "Quiet" marker on the
  matching rows of the applications list. The card renders nothing when there is nothing to
  act on. Japanese throughout: 音信不通の可能性.

### Folded in along the way — the two parked performance items

- **`/me` is folded into the dashboard payload.** The dashboard was fetching both in one
  `Promise.all`; that is one wasted request, and TODO said to fix it the next time the payload
  was touched for another reason. This was that reason. `GET /api/v1/me` stays for API clients.
- **`timeline_entries` index widened to `(application_id, created_at)`.** It *replaces* the
  bare `application_id` index rather than adding to it (a prefix covers it), and serves the new
  window function's `PARTITION BY … ORDER BY` as well as the detail page's timeline.
- **The dashboard cache key now carries `Date.current`.** Ghost risk is a function of elapsed
  time, and an application crossing its threshold changes no row — so a key derived from rows
  alone would keep serving a stale, unflagged payload for up to 12 hours.
- **`GET /api/v1/dashboard` has a response schema in the OpenAPI output**, the first endpoint
  to get one: it is the only response that cannot be guessed from a model.

### Chore

- **`web/package.json` version bumped to `1.3.0`.** It had read `1.0.0` through three releases
  — the one file in the repo still claiming a version the code left behind.

---

## v1.2.0 — 2026-07-11

Tagged at `36c9378`. The Kanban board view, plus the `api/` groundwork it needed. As scoped,
the release opened with the API changes in their own PR before any board component was
written. *(feat/api-error-codes-and-transitions PR #52, feat/web-error-codes PR #53,
feat/kanban-board PR #54)*

### API groundwork *(PR #52)*

- **Machine-readable error codes** — deferred here from v1.1.0's i18n work, which could not
  localize per-field validation errors without them. A stable `code` (`stale_record`,
  `invalid_credentials`, `validation_failed` with per-field `details`, …) now rides alongside
  the existing `error` string — additive, nothing breaks. Full taxonomy in SPEC.md § Error
  codes.
- **`GET /api/v1/transitions`** — serves the effective transition table, built from
  `ApplicationFSM.valid_next_states`, so a client can learn which moves are legal without
  mirroring the table. The server rejects illegal transitions regardless; the table only
  decides what *looks* possible.

### Errors localized by code, not status *(PR #53)*

- **`web/` keys its message catalog off the API's `code`** — per-field `details[].field` /
  `details[].code` first (`errors.field.*`), then the code (`errors.code.*`), with the v1.1.0
  status map kept as fallback and `errors.unknown` last. Both resolution sites — `apiFailure()`
  in server actions and the auth form — share the order, and the shared failure-detail guard
  keeps the server and client parsers in agreement. Recovers the per-field `422` detail that
  v1.1.0 had to drop.

### The Kanban board *(PR #54)*

- **`/board`, labeled "Kanban" (カンバン)** — columns are FSM states, cards are applications,
  and a drag between columns is a `PATCH /api/v1/applications/:id/transition` call. It demos
  the state machine far better than a list does. The route stays `/board`; only the label says
  Kanban.
- **The board fetches the transition table** from `GET /api/v1/transitions` and highlights
  legal drop targets from it — no copy in TypeScript, per the repo's oldest invariant.
- **Seven active columns, six closed states in a rail** — the active pipeline (`wishlist` →
  … → `offer`) lays out as a wrapping grid (four columns per row at `lg`, two at `sm`, one
  below) with the interview loop grouped on the first row; the terminal and dead-end states
  collapse into a toggleable closed rail below the board, not a drop target. Thirteen columns
  is unreadable at any width.
- **One bounded fetch-all** against the existing `index` (`limit=100`, capped at 10 pages)
  with an on-screen truncation notice past the cap — per-column cursors were rejected in the
  decisions log as new query params for precision the board doesn't need.
- **Optimistic transitions** via `useOptimistic` — a move renders instantly, a failed one
  snaps the card home with a board-level notice, and the `409` stale-`lock_version` path
  additionally refreshes the route so fresh `lock_version`s flow in.
- **Keyboard-accessible card menu** — every card carries a focusable menu listing *all* legal
  next states, including the closed ones drag refuses, sharing the detail page's
  confirm/revival semantics via `app/lib/transitions.ts`. The menu is the accessible path and
  the only complete one; drag is a pointer convenience.
- **Homepage gains a fourth numbered card** stating the board's claim — it reads its legal
  moves from the API instead of copying them — and the claims grid reflows two across at
  `md`, four at `lg`. README, README.ja, and `llms.txt` describe the board.

---

## v1.1.2 — 2026-07-11

Tagged at `b66fceb`. One mobile-layout fix that v1.1.1's responsive audit missed: the audit
checked the detail page's resting state, not the delete button's confirming state. Entirely
`web/`, no behaviour change. *(fix/delete-confirm-overflow, PR #51)*

- **Delete confirm prompt no longer clips at 375px.** The detail-page header's actions group
  is `shrink-0`, so the confirm prompt's single-line width became the group's width and
  overflowed the viewport on iPhone SE — a confirmation you cannot read defeats the confirm
  step. In Japanese the back link and the confirm block genuinely do not fit side by side at
  375px, so the actions group now wraps (`flex-wrap justify-end`) and the confirm block takes
  `basis-full` below `sm`, landing on its own right-aligned row where the prompt and both
  buttons fit on one line. `sm` and up keeps the side-by-side layout, and the confirm buttons
  still render away from the original Delete button's position, so the double-tap protection
  is unchanged.

---

## v1.1.1 — 2026-07-11

Tagged at `885ec4d`. Mobile view improvements — the responsive audit found the two headers
were what actually broke at 375px; the dashboard list, application detail page, and
transition buttons already carried responsive classes and held up in both locales. Entirely
`web/`, no behaviour change, as scoped. *(fix/mobile-header-cta, PR #50)*

- **Headers declutter below `sm` (640px) rather than collapse into a menu** — a hamburger
  would hide the locale switcher exactly where a Japanese visitor first meets the app. Each
  header drops only what is redundant at that width: the homepage hides its "About" nav link
  (the hero's primary CTA is the same destination immediately below); the signed-in app
  shell hides the wordmark text and the "Dashboard" link (the mark beside them already links
  to `/dashboard`). What remains fits 375px in Japanese, the wider locale, without wrapping.
- **Homepage primary CTA renamed** "Read the architecture" → "How it's built" (Japanese
  unchanged: 設計を読む); message key `readArchitecture` → `ctaAbout` in both catalogs.
- **Chore:** `next dev` gets `--max-old-space-size=4096`; `build` and `start` untouched.
- The `llms.txt` bilingual-UI mention deferred from v1.1.0 had already landed (it lists the
  `/ja` pages), so no docs change was needed here.

---

## v1.1.0 — 2026-07-11

Tagged at `161b343`. Japanese UI (i18n) and the homepage + about/docs revamp. Entirely
`web/` — no `api/` changes, as scoped; the Kanban board moved to v1.2.0 because it needs
the FSM transition table exposed from the API. *(feat/i18n-japanese-ui, PR #49)*

### Japanese UI (i18n)

- **next-intl@4.13.2, `localePrefix: "as-needed"`** — English stays unprefixed, Japanese
  lives at `/ja/*`, and `/en/*` 307s to the unprefixed canonical path, so no existing URL
  moved. The app moved under `app/[locale]`; the auth guard in `proxy.ts` runs on the
  locale-stripped pathname, so `PUBLIC_PATHS`/`OPEN_PATHS` stay one entry per path rather
  than one per locale.
- **All copy in message catalogs** — every page, form, and component reads
  `messages/{en,ja}.json`, key-for-key identical; `format.ts` holds no copy. The 13 FSM
  state names live in the `status` namespace, translated for how Japanese job boards label
  the stages (`phone_screen` → `カジュアル面談` — recognition beat precision).
- **Locale switcher** — a two-locale toggle showing only the inactive language, mounted in
  the app shell, the marketing header, and the auth layout. Switches with `router.replace`
  on the locale-stripped pathname.
- **Server-side errors localized by HTTP status** — the API stays English-only; `web/`
  discards the English sentence and maps status → catalog entry in `apiFailure()`/
  `localFailure()` (`app/lib/actions.ts`) and `errorMessage()` (sign-in form, which talks
  to route handlers over `fetch`). Per-field `422` detail is lost until the API grows
  error codes in v1.2.0.
- **Dates and `lang` follow the locale** — `Intl` formatters take the active locale;
  `formatDate()` pins `Asia/Tokyo` so date-only fields don't shift a day west of UTC.

### Homepage, `/about`, `/docs`

- **Hero reframed at the hiring reviewer** — the homepage now argues the FSM claim (13
  states, immutable audit trail, stack named outright); primary CTA is "Read the
  architecture" → `/about`, demo second. `pipeline-diagram.tsx` illustrates the machine —
  labels and colours reuse the `status` catalog and `statusBadgeClass`; the transition
  table itself stays only in `application_fsm.rb`.
- **`/about`** — the four architecture decisions, each stated against the cheaper
  alternative it rejected. **`/docs`** — frames the API (auth, scoping, error shape,
  cursor pagination, endpoint table) and links out to the rswag UI instead of deep-linking
  raw Swagger off-site. Both are `OPEN_PATHS` in `proxy.ts`: they render with or without a
  session.
- **Design pass from `design/assets/tokens.css`** — brand motion via Tailwind's default
  transition variables, the Fraunces `opsz 144` display cut (`.kk-display`),
  `--color-danger` replacing 25 improvised `red-*` utilities, one global cobalt
  `:focus-visible` ring, and a `prefers-reduced-motion` block.
- **SEO surfaces** — `sitemap.ts` derives all five public pages with per-locale `hreflang`
  alternates via `getPathname`; `llms.txt` no longer claims Sidekiq/Redis and names
  `application_fsm.rb` as the FSM authority.

### Fixed

- **`package-lock.json` was missing a nested `@swc/helpers` resolution** — next-intl's
  `@swc/core` peers `>=0.5.17` while `next` pins `0.5.15`; CI's npm 10 refused `npm ci`.
  Regenerated the lock with npm 10. *(42862d9)*

---

## v1.0.1 — 2026-07-10

Tagged at `2980300`. Scoped to a dedicated security pass over the API and frontend
plus the fixes it produced. Severity was triaged for a single-user portfolio app
behind Railway/Cloudflare, not a multi-tenant SaaS.

### Security

- **[med] Account-level brute-force backstop** — throttling was IP-only
  (`api/config/initializers/rack_attack.rb`, `sign_in` 5/min per IP), which a botnet or
  shared NAT egress defeats. Added email-keyed throttles that cap guesses against a
  *single* account across all IPs (`10/5min` + `50/hour`). Reads and rewinds `rack.input`
  in the initializer to get the email from the JSON body (`.sign_in_email`), so it works
  at the Rack layer without a controller `before_action`.
  *(chore/security-review-v1.0.1, PR #46)*
- **[med] Login-CSRF on the auth route handlers** — `web/app/api/auth/session/route.ts`
  and `.../register/route.ts` parsed a JSON body and forwarded it to Rails with no `Origin`
  check. Next's built-in CSRF protection covers Server Actions, not route handlers, so a
  cross-site form/fetch could drive a login (classic login-CSRF) or sign-up. Added an
  `Origin` allowlist check (`web/app/lib/csrf.ts`, same-origin by default, `ALLOWED_ORIGIN`
  to pin) on both `POST` handlers and the session `DELETE`; cross-origin → 403.
  *(chore/security-review-v1.0.1, 885e50b)*
- **[med] Demo account was shared and unbounded** — the "Try demo" button signs every
  visitor into one shared user with credentials hardcoded in the client bundle
  (`web/app/(auth)/sign-in/sign-in-form.tsx:62`). That much is inherent to a public demo;
  two things made it worse than intended:
    1. `Demo::ResetService` was **never invoked** — no route, no job — so the shared
       account accumulated every visitor's data indefinitely. Added `DemoResetJob`,
       scheduled hourly in `config/recurring.yml`. *(885e50b)*
    2. The demo user had the **same capabilities as a real user**, including the paid AI
       prefill endpoint (Claude call + outbound fetch), rate-limited by IP only — so
       distributed use of the demo login was an uncapped cost/abuse vector. Added
       **per-account** prefill caps for *every* user (10/min, 50/hour, 100/day), keyed on
       the JWT `sub` decoded in `rack_attack.rb` (`.prefill_user_id`). The demo account is
       now bounded like any other. *(chore/security-review-v1.0.1)*
- **[low] Tightened CSP** — `web/next.config.ts` shipped `script-src 'unsafe-inline'` for
  the Next bootstrap. Moved the CSP to a per-request nonce in `web/proxy.ts`
  (`script-src 'self' 'nonce-…' 'strict-dynamic'`, dropped `'unsafe-inline'`; dev keeps
  `'unsafe-eval'` for HMR). Because nonces are only applied during SSR, `await connection()`
  in the root layout opts the whole app into dynamic rendering so every page's scripts get
  the nonce — verified via `next build` that `/`, `/sign-up`, `/applications/new` and the
  404 render dynamically (they were static before). *(chore/security-review-v1.0.1)*

### Regressions introduced and fixed within the release

- **Host-authorization anchoring — a withdrawn finding that took production down.**
  The review claimed `/.*\.railway\.app/` accepted `foo.railway.app.attacker.com`. It never
  did: `HostAuthorization::Permissions#sanitize_regexp` wraps every pattern as
  `/\A#{pattern}(:\d+)?\z/`, so Rails anchors it for you and appends an optional port group.
  Adding our own `\z` made that port group unmatchable, blocking `api.railway.internal:3001`
  — the `Host` on every internal web→api call — so the API 403'd every request. The session
  route was collapsing all non-OK upstream statuses into `401`, so it surfaced as "Invalid
  email or password" for every user, including the demo account.

  Fixed before the tag: patterns un-anchored and moved to `api/app/lib/allowed_hosts.rb`
  with a regression spec driven through the real `Permissions` class; the session route now
  only reports `401` on a genuine upstream `401`. *(fix/host-authorization-regression, PR #47)*

  **Lesson:** verify a framework's own normalization before "hardening" a pattern it owns.

### Docs

- **JWT semantics documented** — single JTI per user via `JTIMatcher` (`api/app/models/user.rb`),
  so sign-out revokes **all** devices; 1-day expiry, no refresh flow. Added an
  `## Authentication` section to `README.md`, mirrored in `README.ja.md`, spelling out the
  single-session behaviour so it isn't mistaken for a bug. *(4b5038a)*

### Reviewed and found sound — no action taken

Recorded so a re-review doesn't re-litigate them. File references are `path:line` at `9708df6`.

- **SSRF surface (AI prefill)** — `url_prefill_service.rb` resolves, validates every
  resolved address against loopback/private/link-local + extra blocked ranges, pins the
  connection to the validated IP (`http.ipaddr`), restricts to ports 80/443, and
  re-validates on each redirect hop. The DNS-rebinding TOCTOU fixed in PR #39 holds.
- **Upload handling** — size checked from multipart metadata *before* `.read`
  (`applications_controller.rb:154`), 1 MB model cap, and PDF magic-byte validation
  (`application.rb:36`). Downloads are `current_user`-scoped, `nosniff`, PDF-only.
- **Tenant isolation / IDOR** — every record is reached through `current_user.applications`
  (`set_application`, dashboard, list), so cross-user access 404s. `status` is not
  mass-assignable; entry states are restricted and later changes go through `TransitionService`.
- **Password logging** — checked the actual Rails source: AC instrumentation logs
  `request.filtered_parameters`, and `filter_parameter_logging.rb` filters `passw`/`email`,
  so lograge (`params: event.payload[:params]`) does not leak credentials.
- **Sign-up auth** — the global `authenticate_user!` is a no-op inside Devise controllers,
  so registration is reachable (verified via `spec/requests/api/v1/auth_spec.rb`, green).

---

## v1.0.0 — 2026-07-10

Tagged at `e595b68`. First release: the initial security / performance / UX review pass
and every fix it produced.

### Stack

- **Adopted Solid Queue + Solid Cache instead of re-enabling Sidekiq/Redis** — runs on the
  existing Postgres, zero new Railway services. One change fixed four findings: recurring
  `FollowUpReminderJob` (Solid Queue recurring tasks), shared Rack::Attack store
  (Solid Cache), durable `deliver_later`, and removed the dead-feature caveat.
  *(feat/solid-queue-cache, PR #42 — requires `SOLID_QUEUE_IN_PUMA=true` on the Railway api service)*
- **DB pool sized for Solid Queue threads inside Puma** — `max_connections` is
  `RAILS_MAX_THREADS + 6`; a smaller pool made Solid Queue exit and take Puma with it.
  *(fix/solid-queue-db-pool, PR #43)*

### Security

- **Proxy matcher redirected crawler metadata to /sign-in** — `/robots.txt`, `/sitemap.xml`,
  `/llms.txt` weren't excluded in `web/proxy.ts`, so Googlebot got a 307 to sign-in and the
  whole SEO setup was unreachable. *(fix/review-quick-wins, PR #37)*
- **No security headers** — `web/next.config.ts` shipped no CSP, frame-ancestors, HSTS,
  Referrer-Policy, or Permissions-Policy. Added a baseline set. *(fix/review-quick-wins, PR #37)*
- **SSRF DNS-rebinding TOCTOU** — `api/app/services/applications/url_prefill_service.rb`
  validated IPs from `Resolv.getaddresses` but `Net::HTTP` re-resolved; now connects to the
  validated IP (`http.ipaddr`) and restricts to ports 80/443. *(fix/backend-hardening, PR #39)*
- **Upload memory DoS** — `applications_controller.rb#application_params` called `.read`
  before the 1 MB model validation; checks `.size` first. *(fix/backend-hardening, PR #39)*
- **Rate-limit counters were per-Puma-worker** — Rack::Attack used `:memory_store` in prod;
  moved to the shared Solid Cache store. *(feat/solid-queue-cache, PR #42)*

### Performance

- **Composite index `(user_id, created_at DESC)` on applications** — the list endpoint filters
  by user, orders and cursor-paginates on `created_at`; dropped the now-redundant
  single-column `user_id` index. *(fix/review-quick-wins, PR #37)*

### Correctness / robustness

- **Sign-up 500s if the welcome email fails** — `registrations_controller.rb` used
  `deliver_now` after save with `raise_delivery_errors = true`; user existed but got an error,
  and retry said "email taken". Now `deliver_later`. *(fix/backend-hardening, PR #39)*
- **Reminder timezone off-by-one** — `follow_up_reminder_job.rb` compared `DATE(follow_up_at)`
  in UTC; JST users got reminders a day early. Zone-aware day range + `config.time_zone`.
  *(fix/backend-hardening, PR #39)*
- **Reminder feature was dead in prod** — no scheduler since Sidekiq was removed.
  *(feat/solid-queue-cache, PR #42)*
- **Reminder idempotency race** — `exists?`-then-`create!` isn't atomic; now rescues
  `ActiveRecord::RecordNotUnique` for true exactly-once. *(feat/solid-queue-cache, PR #42)*

### UX

- **Expired session dead-ended on error boxes** — no 401 handling anywhere; `apiFetch` now
  bounces through `/api/auth/expired`, which clears the cookie and redirects to
  `/sign-in?expired=1` with a notice. *(fix/review-quick-wins, PR #37)*
- **No `error.tsx` / `loading.tsx` / `not-found.tsx`** — network failures hit the raw Next
  overlay, navigations blocked with no fallback, `notFound()` rendered the bare 404.
  *(fix/review-quick-wins, PR #37)*
- **409 conflicts unrecoverable** — stale `lock_version` was kept after a conflict so retries
  looped; now shows a friendly message + `router.refresh()`. *(fix/frontend-ux-polish, PR #38)*
- **Touch targets ~24px** — status filter chips and transition buttons were below the 44px
  guideline. *(fix/frontend-ux-polish, PR #38)*
- **Statuses were unexplained** — added in-context help for the FSM states, plus a UI polish
  round. *(feat/frontend-status-help, PR #44)*

### UI & accessibility

- **Dashboard stat tooltip was hover-only on a non-focusable span** — unreachable by
  keyboard/touch; now a button with `aria-describedby`. *(fix/frontend-ux-polish, PR #38)*

### Code quality

- **`Paginated<T>` typed three times** — hoisted into `web/app/lib/types.ts`.
  *(fix/frontend-ux-polish, PR #38)*
- **Three copy-pasted `Field` components** — extracted `web/app/components/field.tsx`.
  *(fix/frontend-ux-polish, PR #38)*
- **Server-action return types lied** — `createApplication`/`deleteApplication` were typed
  `Promise<ActionResult>` but ended in `redirect()` (throws). *(fix/frontend-ux-polish, PR #38)*
- **Client re-sort fought cursor pagination** — `applications-list.tsx` re-sorted accumulated
  pages by status, interleaving items after "Load more". *(fix/frontend-ux-polish, PR #38)*
- **Dead Redis config in CI** — `.github/workflows/api.yml` provisioned `redis:8` + `REDIS_URL`
  that nothing used. *(fix/backend-hardening, PR #39)*
- **E2E status assertions were unscoped** — narrowed to the header badge.
  *(fix/e2e-status-badge-selector, PR #45)*

---

## Pre-1.0.0 — the build phases

Before the repo had a changelog, the work was tracked as nine numbered phases in what was
then `PLAN.md` (now [`SPEC.md`](SPEC.md)). They are recorded here so the history isn't lost.

**These entries describe the system as it was at the time.** Several of the decisions below
were later reversed — most visibly Sidekiq and Redis, which v1.0.0 replaced with Solid Queue
and Solid Cache. For how the system works *now*, read `SPEC.md`; this section is archaeology.

### Phase 1 — Rails API foundation

Scaffolded with `rails new api --api --skip-test` (RSpec, so Minitest's `test/` folder would
be dead weight). Gemfile: Sidekiq, devise + devise-jwt, rspec-rails, factory_bot_rails, faker,
database_cleaner-active_record, rswag-api/ui/specs; `solid_queue` and `solid_cache` removed.
CORS configured to expose the `Authorization` header, origin read from `FRONTEND_URL`. Routes,
migrations (pgcrypto, users, applications, timeline_entries, file timestamps), models, and the
`ApplicationFSM` PORO. RSpec set up with a DatabaseCleaner transaction strategy and an
`auth_headers_for` request-spec helper.

### Phase 2 — Service layer + specs

`Applications::TransitionService` — FSM assertion, then status update and `TimelineEntry`
creation in one transaction. `FollowUpReminderJob` with the `"reminder-{id}-{date}"`
idempotency key. FSM unit specs (31 examples, no DB) and TransitionService specs (doubles
only). 37 request specs written *before* the controllers existed. Support added:
`spec/swagger_helper.rb`, a `jwt_for(user)` helper that issues a JWT without a controller, and
a `fake_pdf` helper. Zeitwerk inflections taught to autoload `ApplicationFSM`.

The FSM grew here: `wishlist`, `final_round`, `withdrawn`, and `declined` were added, and
`ghosted` became revivable (`ghosted → applied`).

### Phase 3 — Controllers

`ApplicationController` rescues `InvalidTransitionError` → 422 and `StaleObjectError` → 409.
`Auth::SessionsController` returns the JWT in the `Authorization` response header; `destroy`
overridden for API mode (no flash, no `respond_to`). `Auth::RegistrationsController` overrides
`create` to skip Devise's automatic `sign_up`, which writes to session. `ApplicationsController`
applies `lock_version` from params *before* calling `TransitionService`, so the 409 path
actually fires. `DashboardController` is pure SQL aggregation.

Devise's `config.navigational_formats = []` was the missing piece that makes the gem behave as
a pure JSON API — otherwise `*/*` is treated as navigational and `set_flash_message!` raises.
79 specs green.

### Phase 4 — API docs

`rswag_api.rb` + `rswag_ui.rb` initializers; `rake rswag:specs:swaggerize` emits
`swagger/v1/swagger.yaml` from the request specs. Swagger UI at `GET /api-docs`.

### Phase 5 — Next.js frontend

The auth flow that still stands today: credentials POST to Next route handlers, which proxy to
Rails, capture the JWT from the `Authorization` header, and store it in an `httpOnly` cookie.
The browser never sees the token. Route guard in `web/proxy.ts` (Next 16 renamed
`middleware.ts` → `proxy.ts`). Server-side `apiFetch` + server actions for mutations. File
downloads proxied so the JWT stays server-side. Tailwind v4; no UI library, no form library, no
state management.

### Phase 6 — Deploy

Railway project: `api`, `web`, managed PostgreSQL, managed Redis. Puma and Sidekiq ran from a
single service via the `Procfile` — which turned out not to work under a Dockerfile build, and
was later split into a dedicated `sidekiq` service before Sidekiq was removed entirely.

The production lessons from this phase (no Thruster; `CMD` overrides `Procfile`;
`bin/docker-entrypoint` arg matching; Cloudflare grey cloud for ACME; the DNSSEC drift) are
recorded permanently in `SPEC.md` under Deployment.

### Phase 7 — Production-readiness and Tokyo-market polish

None of it was needed to *use* the app; all of it was needed for the repo to read like
production work. CI running Brakeman, bundler-audit, Rubocop, and RSpec against Postgres 16 +
Redis 7; a `web/` workflow running ESLint, `tsc --noEmit`, and `next build`. A `/up` health
endpoint that pings its dependencies rather than merely proving the app booted. Structured JSON
logging (`lograge`), SimpleCov at an 80% floor, `prosopite` N+1 detection around every request
spec, Honeybadger, and one Playwright E2E: sign up → create → transition → timeline entry.

For the Tokyo market: a `README.ja.md`, and seed data using recognisable Japanese tech
companies rather than "Acme Corp".

Skipped deliberately: i18n and JST-aware reminders (real work, small payoff *then* — both have
since landed or been scoped); Company/Platform/Tag models (more CRUD, no new patterns);
Kubernetes and Terraform (overkill).

### Phase 8 — API maturity and portfolio polish

- **Cursor pagination on `GET /applications`** — the index previously loaded every record with
  no limit. `?after=<base64_cursor>&limit=20`, response wrapped as
  `{ data, meta: { next_cursor, has_more } }`. ~20 lines, no gem.
- **Error-envelope consistency** — `create` and `update` returned `{ errors: [...] }` while
  everything else returned `{ error: "..." }`. Standardised on the single string, which
  simplified error extraction in `web/app/lib/api.ts` to `body.error ?? text`.
- **Demo account + "Try demo" shortcut** — idempotent seeds, 12 applications spread across all
  FSM states using mock Tokyo companies (Marcari, Vine Corp, Rokuton, BeNA Games, CyberFactor,
  Cansan, greeo, Funds Forward, SlickHR, Cybozo, Wantfully, Cogpal). Seed timeline entries are
  written directly with `idempotency_key: "seed-<slug>-<n>"`, bypassing `TransitionService` —
  safe, because historical seed data is not a user action.
- Playwright E2E promoted into `web.yml` as a second job, push-to-`main` only, to keep
  free-tier minutes low.

### Phase 9 — Product depth

Four features scoped to make the app genuinely useful for a real job search. Two shipped.

**Email delivery (shipped).** ActionMailer re-enabled (the `--api` default disables the
railtie). The scheduling gap found here is the interesting part: `sidekiq-cron` was in the
Gemfile but **no schedule was loaded anywhere**, so the reminder job never fired in production —
and `config/recurring.yml` was sitting there as a dead Solid Queue artifact. It was added back
properly, and by v1.0.0 the wheel had turned full circle: Solid Queue returned and `recurring.yml`
became load-bearing again. Resend over SMTP, on port `2587` because Railway blocks 587 and 465.

**AI job URL pre-fill (shipped).** `Applications::UrlPrefillService` — Claude Haiku 4.5 via the
official `anthropic` gem, structured output through a tool/JSON schema. Claude specifically
because it reads Japanese postings natively, so one flow covers Wantedly, Greenhouse, and a
company careers page with no parser per site. SSRF guard on the outbound fetch; typed errors
mapped to 422 / 502 / 503. Later hardened in v1.0.0 (IP pinning, per-account rate caps).

**Analytics dashboard (not built).** A funnel, a response rate, a ghosting rate, and mean days
from applied to first response and to offer. All SQL aggregation over data already stored — no
new models, no migration. Carried into `TODO.md`.

**AI cover-letter assist (not built).** "Draft with AI" on the detail page, streaming into a
panel the user copies from; nothing saved automatically. Carried into `TODO.md`.

Deferred on purpose: email on *every* status change — too noisy for personal use.
