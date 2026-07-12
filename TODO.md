# TODO

Open work only. Shipped work lives in [`CHANGELOG.md`](CHANGELOG.md).

**Current release: `v1.4.0`** — tagged 2026-07-12, published as a
[GitHub Release](https://github.com/chairulakmal/karirkalyan/releases/tag/v1.4.0). "The search,
this week": the follow-up digest, `JapanCalendar`'s dead zones, the CSV export, and the
full-account export. A minor — four new capabilities, but no migration, so the `v1.3.1` image
would still boot against the database it leaves behind. See `CHANGELOG.md`.

`v1.3.1` (2026-07-12) was the patch that carried the dependency refresh, the Sidekiq/Redis purge,
Postgres 18 in dev and CI, the docs audit, and the versioning policy itself. `v1.3.0`
(2026-07-11, `f455853`) was ghost prediction, which also absorbed the two production items the
performance release had parked (the `timeline_entries` index and the `/me` fold — both struck
off below).

**North star (decided 2026-07-11): be the best career app for its one loyal user.** Portfolio
value follows from that, not the other way round — a reviewer can tell a tool with a real
user from a feature showcase. The dark-mode entry below made this argument first; it now
governs the whole backlog. Two consequences for sequencing: items are ordered by **when in
the user's life they pay off** (search-time items while the search is active; the `positions`
entity is triggered by accepting an offer, not by finishing a prior release), and the backlog
gains an **Operations** section for the worst-day work — backups, export — that no feature
admission test covers.

**Nothing in flight.** `v1.4.0` shipped; the next release in the plan is `v1.4.1` — **"Close the
door"**: public sign-up off, privacy policy and terms in both locales. It jumped the queue ahead of
the refactors on 2026-07-12, and the reason is the only one that should ever move a release
forward: it is not about what the app can *do*, it is about what it is *holding*. Open sign-up
means strangers' resumes; closing it makes almost the entire data-protection question disappear
rather than answering it. The code-quality release it displaced is now `v1.4.2`, still ahead of
`v1.5.0`, so the `Applications::ListQuery` constraint below still holds. The dev-server memory leak carries
no release tag on purpose: it is **maintenance, not a release**. Its stopgap already shipped (`cf7cd8d` — 8 GB heap +
heap-snapshot flag live in `web/package.json`), and what remains is filing upstream when the
next crash writes a snapshot.

---

## Release plan — `v1.3.1` → `v1.6.0` (scoped 2026-07-12)

**The whole backlog fits under 1.x.** Only one item forces a major, and `SPEC.md` § Versioning
& releases already names it: the **`positions` entity**, because it adds a table *and* changes
what `accepted` means in `ApplicationFSM`. Everything else here is an additive migration or has
no schema at all, so the previous image would still boot against the database the release leaves
behind — which is the whole of the major test.

| Release | Level | Contents |
| --- | --- | --- |
| ~~`v1.3.1`~~ | patch | **Shipped 2026-07-12.** Everything that had accumulated on `main` since the v1.3.0 tag. |
| ~~`v1.4.0`~~ | minor | **Shipped 2026-07-12.** Follow-up digest, calendar-aware dead zones, CSV export, full-account export. |
| `v1.4.1` | patch | **Close the door**: public sign-up off, privacy policy + terms (EN + JA) |
| `v1.4.2` | patch | `Applications::ListQuery` extraction, `API_BASE` naming, download filenames, upload throttle |
| `v1.5.0` | minor | The Japan market layer: recruiter channel + `agencies`, 年収 comp structure, Japanese-level filter |
| `v1.5.1` | patch | Japanese phrase-based line breaking |
| `v1.6.0` | minor | Hiring entity, timezone overlap + `.ics`, visa / status of residence, email verification |

**The trap that would break this plan: every new column in `v1.5.0` and `v1.6.0` must be
nullable or defaulted.** A `NOT NULL` column with no default means the previous image's
`INSERT`s fail against the new database — and by the mechanical test that quietly turns a minor
into a **major**. It is the only way this plan accidentally violates its own versioning.

### ~~`v1.3.1` — patch~~ — shipped 2026-07-12

The work had been sitting on `main` untagged: dependency refresh, Postgres 18 in dev/CI, the
Sidekiq/Redis purge, the docs audit, the versioning policy, and this scoping. No new capability
among them, and no migration — a patch by definition, and the first release the policy cut.

### ~~`v1.4.0` — minor. "The search, this week"~~ — shipped 2026-07-12

The follow-up digest, the calendar dead zones, CSV export, and the full-account export from
Operations. Grouped, not bundled arbitrarily: the digest and the holiday-awareness were the
**same edit to `FollowUpReminderJob`**, and CSV and the JSON+resumes export were the **same
controller and download surface** — splitting either pair would have meant opening the same
files twice. The grouping held: it landed as one PR (#61).

The one thing the plan did not predict, and the piece worth remembering: **holding the digest
through a dead zone only works because the idempotency key derives from `follow_up_at` rather
than from the day the job runs.** Key it on the run date and a held reminder is silently lost.
That single choice is what makes the calendar a *deferral* and not a *deletion*.

### `v1.4.1` — patch. "Close the door"

**Ships before everything below, including the refactors.** Decided 2026-07-12.

Public sign-up is open today (`/sign-up` is in `PUBLIC_PATHS` in `web/proxy.ts`), which means any
stranger can create an account and upload a PDF — and a resume is the most PII-dense document a
person owns: full name, address, phone number, employment history. That, not the app's existence,
is what makes this a data-protection question at all. Japan's APPI dropped its 5,000-record
small-handler exemption in 2017, so "it is tiny" was never a defence, and having no legal entity
is not one either: a natural person can be the data controller, and the absence of a company
means the liability lands on Akmal personally rather than on nobody.

**The decision: close public sign-up.** The demo account (already advertised in `llms.txt` and on
the marketing page) stays the way a reviewer tries the app, so nothing about the portfolio story
is lost — and third-party PII simply stops arriving. This is the cheapest possible resolution of
the whole question, and it is available precisely *because* the north star is one loyal user.

Three pieces:

- [ ] **Close public sign-up.** Remove the route and the page; drop `/sign-up` from `PUBLIC_PATHS`
      and re-point the homepage CTA. **Watch the Devise coupling**: `devise_for` with
      `:registerable` is what generates `POST /api/v1/auth/sign_up`, and it is also what generates
      the `DELETE` (account destroy) on the same path — `skip: [:registrations]` takes both away.
      Keep the destroy route.
- [ ] **Privacy policy + terms, EN and JA** — new `/privacy` and `/terms` pages under the existing
      i18n routing (never one locale without the other; the README rule applies here with more
      force, not less). Content follows the code, so keep it honest and short: what is stored
      (email, application records, one resume and one cover letter per application, as `bytea` in
      Railway Postgres), that a nightly `pg_dump` goes to a **private** GitHub repo on 60-day
      retention, who the sub-processors are (Railway, Anthropic for the URL prefill, the mail
      provider, Honeybadger), that there is no analytics and no tracking, and how to reach a
      human. **Do not promise a self-service delete button that does not exist** (below).
- [ ] **Document the account-deletion endpoint.** `DELETE /api/v1/auth/sign_up` is already routed
      and already cascades correctly (`dependent: :destroy` on `User#applications` and
      `#timeline_entries`), but it has **no spec, no UI and no mention in SPEC.md — it works by
      accident**. Give it a request spec and an API-contract entry. A *button* is deliberately
      **not** in scope: with sign-up closed there is no third party who needs self-service
      erasure, and the v1.4.0 account export already covers the portability half. Revisit only if
      sign-up ever reopens.

### `v1.4.2` — patch. Sequenced before `v1.5.0`, not filler

Extract `Applications::ListQuery`; settle `API_BASE` vs `API_BASE_URL`; give downloaded resumes
and cover letters filenames that say which application they belong to; throttle the upload path.
The first lands **first** because `v1.5.0` adds three new filters to
`ApplicationsController#index` — the exact method that already mixes filtering, cursor decoding,
and serialization inline. Extract before, and the filters land in a query object with
`Applications::GhostRiskQuery` as the pattern; extract after, and the controller thickens and then
gets refactored under load.

The filenames are the v1.4.0 fallout: shipping the account archive is what made it visible that
neither download surface names a file usefully. It is still a patch — no new capability, no
migration, and the previous image boots against an unchanged database.

### `v1.5.0` — minor. The Japan market layer

Recruiter channel + `agencies` + the ownership-window warning; 年収 as a comp *structure*, not a
number; the Japanese-level requirement filter. One release because all three pass the **field
admission test the same way** — each is captured by `UrlPrefillService` at prefill time from the
posting text. That is one extraction pass, one migration, one form pass; three releases would be
three trips through the same three files. This is also the release a Tokyo reviewer could not
have seen in someone else's portfolio.

### `v1.5.1` — patch. Japanese phrase-based line breaking

No new capability, so it cannot be a minor — but it is worth the most **right after `v1.5.0`**,
which is the release that fills the UI with the Japanese compound nouns (agency names, comp
structures, JLPT levels) that wrap mid-word today.

### `v1.6.0` — minor. "Can you actually take this job?"

Hiring-entity enum, timezone overlap with the `.ics` export falling out of it, and visa /
status-of-residence tracking with CoE lead time surfaced next to an offer deadline. The theme is
**constraints that decide whether an offer is even takeable** — the visa item and the
hiring-entity item are the same question asked from opposite directions. Email verification
rides along as the portfolio checkbox it is, ranked last and labelled honestly.

### Deliberately outside the plan

- **`positions`, and everything hanging off it** — resume versioning, periodic check-ins,
  low-noise market watch, the skills/certs gap list, the comp-percentile half of career
  intelligence. Two reasons, both already decided above: `positions` is the `2.0.0`, and its
  scoping trigger is **accepting an offer**, not finishing `v1.6.0`. Giving it a release number
  would contradict that.
- **履歴書 / 職務経歴書 generation.** 履歴書 alone is a legal minor — additive, no schema break —
  but its twin *is* a `positions` table rendered as prose, and the entry below calls PDF
  generation the highest carry cost in this file. Shipping half the pair, then maintaining that
  toolchain for a year before the other half is even buildable, is the worst version of the
  trade. Ship both after `2.0.0`.
- **The `timeline_entries` index** stays conditional — nothing in `v1.4`–`v1.6` grows that table.
- **The `next dev` heap leak** stays maintenance, per the header.
- **Documenting the restore drill in SPEC.md § Deployment** is docs: straight to `main`, no
  release.

---

## Backlog

Verified against the code on 2026-07-10 — all still hold. The dev-server memory item and the
career-planning idea were added 2026-07-11. The market-dependent feature ideas (Japan market,
global remote, ghost prediction) were verified against current web sources on 2026-07-11 —
citations inline where a claim came from research rather than the code. The Operations
section and the north-star re-ranking were added 2026-07-11. Items were scoped into releases on
2026-07-12 — each open item below carries its release tag, and the plan above is the summary of
those tags, not a second source of truth.

### Performance — production

- [x] **Fold `/me` into the dashboard payload** — done in `feat/ghost-prediction`, which is what
      "fix it when the dashboard payload is touched for another reason" was waiting for.
- [ ] **`timeline_entries` offer-lookup index** *(no release — conditional)* — still open, and still conditional. The
      `avg_days_to_offer` subquery filters `to_status = 'offer'`, and there is deliberately no
      index on `to_status`: at personal-tracker scale a user's timeline is a few hundred rows,
      already reachable through `(application_id, created_at)`. Add `(to_status, application_id,
      created_at)` **if the table grows**, not before. (`feat/ghost-prediction` widened the bare
      `application_id` index to `(application_id, created_at)` for the ghost-risk window
      function — a replacement, not an addition.)

### Performance — dev (maintenance — blocked on upstream, not a release)

- [ ] **`next dev` crashes even with a 4 GB heap** (`--max-old-space-size=4096`, added in
      v1.1.1). **Diagnosed 2026-07-11** — it is a **V8 heap leak in the `next-server` process**,
      not native/Rust memory and not the OS: 30 days of journal show zero OOM-killer or
      systemd-oomd kills, and an instrumented run (`--report-on-signal` diagnostic reports +
      RSS sampling) showed V8 `usedMemory` tracking RSS growth ~1:1 while the native baseline
      stayed a flat ~0.8–1.5 GB. Retention is monotonic and unbounded: ~239 MB V8 heap at boot,
      ~541 MB after warming the ten public routes, then **~40–60 MB retained per HMR rebuild**
      (3.1 GB used / 5.8 GB RSS after 30 scripted edits, `detachedContextCount` 0 throughout).
      So raising `--max-old-space-size` only postpones the `JavaScript heap out of memory`
      abort — 4 GB dies in a normal editing session; 8 GB (the machine has 29 GB) buys a longer
      one, nothing more.
  - **Answered sub-questions:** `experimental.turbopackFileSystemCacheForDev` _is_ on
    (default `true` in 16.2.6, `config-shared.js:263`; `.next/dev/cache/turbopack` is 310 MB)
    — the leak happens with it. It does make restarts cheap: warm boot-to-ready measured at
    ~5 s, so a periodic dev-server restart is a viable stopgap. Upstream issue #85290
    (404 → infinite compile loop; relevant because of our `globalNotFound` setup) does
    **not** reproduce — ten bogus URLs 404'd cleanly. The behaviour matches discussion
    **#93451** (unbounded growth after HMR edits, ~7 GB, open and unresolved as of
    2026-07).
  - **Next actions:** the stopgap is **done** (`cf7cd8d`) — the dev script already runs
    with an 8 GB heap and `--heapsnapshot-near-heap-limit=1` (allowed there; `--trace-gc`
    is not), so the next real crash writes the heap snapshot upstream wants. What remains:
    file on #93451/new issue with that snapshot, and restart the server when it gets slow.
    One unexplained datum for the upstream report: V8 heap also jumped ~1.6 GB across the
    404 phase and a 45 s idle window — growth without edits, so renders (every route is
    dynamic here — the CSP-nonce `await connection()`) retain memory too, not just
    compiles; the three-family font setup compiling into every layout pass may be a
    multiplier (the old font-payload item was struck as stale in `4284f61` — production
    loads five variable slices, not ~15 static files).

### Operations — the loyal user's worst day

The career-growth admission test below governs *features*; it deliberately does not apply
here. This section exists because nothing else in the repo defends the data: the real
job-search history — applications, timeline, resumes stored as bytea — lives in one Railway
Postgres, and **the Railway Hobby plan has no managed backups** (confirmed 2026-07-11). For a
loyal user, losing that history is strictly worse than lacking any feature in this file.

- [x] **Scheduled `pg_dump` backups — shipped 2026-07-11** in the private
      [`karirkalyan-backups`](https://github.com/chairulakmal/karirkalyan-backups) repo
      (private-repo variant, so the dump needs no encryption). Daily cron at 05:15 JST
      fingerprints `users` / `applications` / `timeline_entries` (`count @ max(updated_at)`)
      and only dumps when the fingerprint changed since the state committed by the previous
      backup — `solid_queue`/`solid_cache` churn never triggers it, and the fingerprint
      commit doubles as the keep-alive against GitHub's 60-day cron auto-disable. The dump
      itself is the full database: client major queried from the server at run time
      (**production is Postgres 18** — as, since this release, is local dev), gzipped artifact on 60-day
      retention, `pipefail` plus completion-trailer and size checks so a failed dump is a
      red run, never a silent tiny artifact. Decision recorded: a dump, **not** a mirror on
      a free Postgres tier — a second live database is HA machinery for an app that needs
      an undo button, and free tiers expire, pause idle databases, and add a version-compat
      surface to maintain.
  - [x] **Restore drill — passed 2026-07-11**: `db-dump-7` restored into a scratch
        Postgres 18.4 (the `docker-compose.yml` in the backups repo, tmpfs, port 5418)
        with zero errors; all 17 tables and every row came back (`users:3 |
        applications:19 | timeline_entries:32`, status spread intact). Drill steps are
        documented in the backups repo README.
    - [ ] Document the drill (or point to the backups repo) in SPEC.md § Deployment. *(docs —
          straight to `main`, no release)*
  - [x] **Local dev Postgres 16 → 18 — done 2026-07-11** (`api/docker-compose.yml`, both
        CI workflows, SPEC.md, both READMEs, `api/README.md`, `llms.txt`). Production was
        confirmed already on 18.4 (`postgres-ssl:18`), so nothing changed on Railway; the
        drift was entirely dev/CI/docs. The bump also moved the compose volume mount to
        `/var/lib/postgresql` — `postgres:18` relocated `PGDATA` to
        `/var/lib/postgresql/18/docker`, and the old `.../data` mount would have parked
        the live data dir outside the named volume. Upgrading a machine with a 16 volume
        needs `docker compose down -v` + `db:setup`.
- [x] **Full-account export** — shipped in `v1.4.0`. `GET /api/v1/exports/account`: a zip of
      `account.json` (behind a `schema_version`) plus every resume and cover letter, downloadable
      from the dashboard. The second, provider-independent leg of the backup story.
- [x] **Error tracking — conscious asymmetry, decided 2026-07-11.** Honeybadger covers the
      API (`api/Gemfile`, wired in production). `web/` has no client-side error tracking,
      and that is accepted for a single-user app: the one user *is* the error reporter.
- [x] **No document version history — decided 2026-07-12.** One resume and one cover letter per
      application, the latest upload overwriting the last; `applications.resume` stays a single
      `bytea`. Keeping the last N versions was considered and rejected. It would multiply blob
      count against the primary Postgres — the same database whose entire backup story is a
      nightly `pg_dump` — to retain documents nobody reads, and the honest form of the feature is
      a `documents` table plus object storage, which is a migration, not an afternoon. The
      question a job seeker actually asks is *"which resume did I send to this company?"*, and one
      document pinned to one application already answers it exactly. Version history at the layer
      that costs nothing: the account export zip is a point-in-time snapshot, and the `MMDD` stamp
      in the download filename keeps a re-uploaded resume from clobbering the saved copy of the old
      one. **Do not re-lift this without a storage change to justify it.**
- [ ] **Throttle uploads, and cap applications per account** *(`v1.4.2` — patch: no capability,
      no migration)*. `rack_attack.rb` throttles sign-in, sign-up, the AI prefill and the account
      export, but **nothing throttles the upload path** (`PATCH /applications/:id` with a resume or
      cover letter). The exposure is smaller than it looks and it is worth being precise about why:
      an upload **overwrites** — `applications.resume` is a single `bytea`, there is no version
      history — and `Application::MAX_FILE_SIZE` caps each blob at 1 MB with a PDF content check.
      So a client looping PATCH burns CPU and write I/O but its storage footprint stays flat at
      2 MB per application. **The unbounded axis is `POST /applications`**, which nothing caps: every
      new application is another 2 MB of storage allowance, on a database whose whole backup story
      is a nightly `pg_dump`. Two throttles, both per-account (the cost is a function of whose data
      it is, not where the request came from — same reasoning as the export throttle above): a
      write/upload cap, and a ceiling on applications per account. The per-account pattern and the
      `429` responder already exist; this is a config change, not a design.

### UI & accessibility

- [ ] **Japanese phrase-based line breaking (文節単位の改行)** *(`v1.5.1` — patch: no new
      capability, and it pays off most once `v1.5.0` fills the UI with Japanese compound nouns)*.
      Japanese has no spaces, so the
      browser breaks lines at almost any character boundary and compound words wrap mid-word
      (`東京オリン` / `ピック`). Two-layer fix, both cheap: (1) `word-break: auto-phrase` in CSS —
      [Chromium 119+ only](https://caniuse.com/mdn-css_properties_word-break_auto-phrase), needs
      `lang="ja"` on an ancestor (the i18n layout already sets it), degrades to today's behaviour
      elsewhere, so it is a one-line progressive enhancement; (2)
      [BudouX](https://github.com/google/budoux) (`budoux` on npm, ~15 KB, zero deps — the same
      model that powers `auto-phrase`) run **server-side in RSC** on headings, buttons, and card
      titles, where a bad break is most visible — long body text mostly self-corrects. BudouX
      inserts break opportunities and pairs with `word-break: keep-all`; prefer `<wbr>` output
      over zero-width spaces, which survive copy-paste. `Intl.Segmenter` is not a substitute — it
      segments dictionary words, not phrases, and breaks choppier. **Researched 2026-07-11.**
      Ecosystem note: the segmentation problem is solved (BudouX + the CSS property absorbing
      it); the only open niche is integration glue — a next-intl-aware wrapper or a
      remark/rehype plugin — better spent as a blog post than an npm package.
- [x] **No dark mode — decided 2026-07-11: light only, and that is the ship state, not a gap.**
      `web/app/globals.css:28` hardcodes `color-scheme: light`, and `web/` contains no dark
      styling at all — no `prefers-color-scheme` block, no `dark:` utilities. It stays that way.

      The reasoning is about who this is for. KarirKalyan is a **professional app, not a dev
      tool.** Its user is a job seeker, and the app sits in a context that is uniformly light:
      a recruiter's email, a company careers page, a PDF of their own resume. Dark mode is an
      expectation engineers carry over from editors and terminals — building for it here would
      be building for the developer looking at the portfolio rather than the person the product
      claims to serve, which is exactly the tell that separates a product from a demo.

      The cost side is not free either: a second theme doubles the surface every future screen
      has to be designed, reviewed, and screenshotted against, and a half-maintained dark theme
      (the usual outcome on a solo project) looks markedly worse than a confident single one.
      One art-directed light theme is the stronger portfolio artefact.

      **Assets:** the dark brand icons (`design/assets/icons/karirkalyan-dark.svg`,
      `png/icon-dark-512.png`) are unreferenced — `web/app/components/wordmark.tsx:28` uses only
      the monogram. Keep them. They are *brand* assets (a logotype for dark backgrounds — slide
      decks, social cards, a dark README banner), which is a different thing from an app theme,
      so their existence is not evidence of an unfinished dark mode and nothing in `web/` should
      grow toward them.

### Code quality

- [ ] **Extract `Applications::ListQuery`** *(`v1.4.2` — and it must land before `v1.5.0`)* —
      `ApplicationsController#index` mixes filtering,
      cursor decoding, and serialization inline. `api/app/queries/` now exists
      (`Applications::GhostRiskQuery`), so the destination and its conventions are settled;
      this is now a straight extraction with a pattern to follow. The sequencing is the point:
      `v1.5.0` adds three filters (channel, comp, Japanese level) to exactly this method, so
      extracting first means they land in a query object rather than thickening a controller
      that then has to be refactored under load.
- [ ] **`API_BASE` vs `API_BASE_URL`** *(`v1.4.2`)* — two near-identical names for different things
      (`web/app/lib/api.ts:107` is the internal fetch base; `web/app/lib/links.ts:2` is the public
      Railway URL used for doc links). Rename or comment.
- [ ] **Name downloaded resumes and cover letters after the application, not after nothing**
      *(`v1.4.2`)* — the same disease on two surfaces. In the archive,
      `Exports::AccountArchive#blob_path` (`api/app/services/exports/account_archive.rb:85`)
      builds `resumes/{id}-{company.parameterize}.pdf`, and a **Japanese company name
      parameterizes to an empty string** — so the fallback fires and the entry is a bare
      `resumes/12.pdf`. In the per-application download,
      `ApplicationsController#resume` / `#cover_letter` `send_data` a hardcoded `resume.pdf` /
      `cover_letter.pdf`, so *every* application's file saves under the same name and the second
      one collides with the first.

      **The format, settled:** `{company}-{role}-{MMDD}-{id}-resume.pdf`. The 20-character cap is
      **per segment** — company ≤ 20, role ≤ 20 — and the stamp, the id and the `-resume.pdf`
      suffix sit **outside** the count. A single 20-char budget for the whole name was the
      alternative and it does not close: the suffix alone is 11 characters.

      `MMDD` is the **upload** date, not the application date: `resume_updated_at` /
      `cover_letter_updated_at` already exist per field (the detail page's "uploaded 3 days ago"
      reads them), so it costs nothing to compute. What it buys is *in the user's downloads
      folder*, not in the app — the app stores exactly one resume per application (`applications.resume`
      is a single `bytea`, and an upload overwrites it), so the stamp is what stops a re-uploaded
      resume's download from silently overwriting the copy of the old one you already saved. It
      **disambiguates rather than guarantees**, which is why the application id stays in the name:
      same company, same role, same day is a real collision.

      **The one thing still open: the slugger.** `parameterize` is what produces the empty string
      today, so it cannot be the answer — this needs transliteration, and the fallback when even
      that yields nothing must be decided rather than defaulted into.

      Rails owns the fix on both surfaces — the Next proxy passes `Content-Disposition` straight
      through, and SPEC.md § Exports already commits to the server being the one place that names
      a file.

### Feature ideas

Scoped into `v1.4.0`–`v1.6.0` on 2026-07-12; tags inline below. The pre-1.0.0 Phase 9 notes (now
in `CHANGELOG.md`) also name an analytics dashboard
and an AI cover-letter assist as the declared roadmap. Everything here is **post-v1.3.0** and most of it _does_ touch `api/` —
that is fine, the `web/`-only constraint is a property of v1.1.0, not a permanent rule.

The three table-stakes items first, then the ones that differentiate. A generic tracker is a
CRUD demo; the differentiators after the table-stakes list are the ones a Tokyo hiring
reviewer could not have seen in someone else's portfolio, because they encode knowledge of
the market rather than knowledge of Rails.

**Field admission test (added 2026-07-11), for any new per-application column** — channel,
agency, comp structure, language level, hiring entity, timezone, all of them: it must be
**captured at prefill time by `UrlPrefillService`, or cost near-zero manual entry**. The app
has one user, and a field he stops filling in after the fifth application is dead schema
plus form friction. The hiring-entity item already says this about itself; it is the rule
for the whole section, not a footnote on one item.

**Table stakes** — re-ranked 2026-07-11 by the north star, not by what a checklist expects:

- [x] **Follow-up digest email** — shipped in `v1.4.0`. `FollowUpMailer#reminder` became
      `#digest`: one email per user per day, grouped by user from the applications the job
      claimed, instead of one email per application.
- [x] **CSV export** of applications — shipped in `v1.4.0`, alongside the full-account export as
      planned. `GET /api/v1/exports/applications`, formula-injection escaped.
- [ ] **Email verification** (Devise `:confirmable`) *(`v1.6.0`, riding along)* — last, and
      labelled honestly: it guards a signup problem a single-user app does not have. A portfolio
      checkbox, ranked as one.

**Ghost prediction — shipped in `v1.3.0`.** See CHANGELOG § v1.3.0 and SPEC.md § Query
layer. The market research that justified it, and the stage distribution the global defaults
were sanity-checked against, is recorded in SPEC.md § Query layer rather than repeated here.

**Japan market**

These are the strongest differentiators and the most research-dependent. **Researched against
current web sources 2026-07-11** — findings and citations inline below. The immigration numbers
should still be re-confirmed against the Immigration Services Agency / MOJ the day a migration
is actually written; everything else is now grounded enough to scope from.

**Maintenance rule (added 2026-07-11):** every item here embeds perishable external facts —
fee schedules, processing times, survey medians. A career tool that confidently states last
year's rules is worse than one that says nothing, so each item must state its **annual
refresh cost** when it is scoped, and the sum of those lines is a real cap on how many of
these a solo maintainer can ship. The career-intelligence item below already budgets this
way ("one data-entry session a year"); that is the pattern.

- [ ] **Visa / status-of-residence tracking** *(`v1.6.0`)*. For a foreign engineer in Japan this is the
      single most decision-relevant fact about a job posting, and no generic tracker models it. Per
      application: does the employer sponsor, and which status of residence
      (技術・人文知識・国際業務 is the usual one for software roles)? Globally: days remaining on
      the user's current status, and Certificate of Eligibility timing when changing employer.
      There is also a points-based Highly Skilled Professional track (高度専門職) with a published
      scoring table — a points calculator would be a genuinely useful standalone tool.
      **Researched 2026-07-11:** the [HSP points
      system](https://www.mofa.go.jp/j_info/visit/visa/long/visa16.html) still turns on the
      70-point threshold ([JETRO's summary of the
      table](https://www.jetro.go.jp/en/invest/setting_up/section2/page11.html)), with PR
      eligibility after 3 years at 70–79 points and after 1 year at 80+; the **J-Skip** track
      (April 2023, still active) grants HSP-2 directly at ¥20M+ income for engineers, bypassing
      the points table — [both remain current in
      2026](https://ternrise.com/blog/japan-hsp-visa-2026-points-requirements-salary-permanent-residency).
      One moving part: legislation passed to raise the PR application fee to up to ¥300,000,
      timing pending a Cabinet Order. On the CoE side, [MOJ processing data puts
      技術・人文知識・国際業務 at ~55–65 days](https://japan-visa.com/coe/time) within the
      official 1–3-month band, and when changing employers the safe path is a fresh CoE — which
      is exactly the lead-time arithmetic this feature should surface next to an offer deadline.
- [ ] **Rirekisho + shokumu-keirekisho generation** *(no release — deliberately parked past
      `2.0.0`; see "Deliberately outside the plan" above)*. Japanese applications conventionally want
      two documents: 履歴書 (personal history, a standardised form) and 職務経歴書 (career history,
      free-form). Generating both as PDFs from stored profile data would be the clearest possible
      signal that the author understands the market. **Format question answered (2026-07-11):**
      the JIS template was indeed [withdrawn from the JIS standards in July
      2020](https://japan-dev.com/blog/japanese-resume-rirekisho) (stationery stores still sell
      "JIS-compliant" pads, but it is a dead standard), and MHLW published a recommended
      replacement format (厚生労働省様式) designed for fair hiring — [gender optional; commute
      time, dependents, and spouse fields
      removed](https://www.gtalent.jp/blog/japanwork-en/job-hunting-en/rirekisho-en). **Target
      the MHLW format** — it is the closest thing to official, and its fair-hiring rationale is
      a good line in the README. **Carry cost (recorded 2026-07-11): the highest in this
      file.** PDF generation in Rails is a known maintenance sink — toolchain choice, CJK
      font embedding, layout drift — and the MHLW format itself can churn. Highest wow,
      highest carry; scope it with both eyes open, the way the dark-mode entry weighed its
      cost side.
- [ ] **Model the recruiter channel** *(`v1.5.0`)*. Hiring in Japan is heavily agent-mediated. Add a channel
      to each application — direct / agent / referral — and record which agency submitted you where.
      Two agencies submitting the same candidate to the same company is a real and damaging
      situation; an app that warns about a duplicate submission is solving a problem the incumbents
      ignore. Needs a `channel` column and an `agencies` table. **Researched 2026-07-11 — the
      mechanism has a name:** candidate **"ownership"**. [The first agency to submit you to a
      company owns that candidacy for ~12–18
      months](https://www.tokyodev.com/articles/recruitment-agencies-in-japan), and the fee goes
      to the owner even if you later reach the same company through another channel — most
      candidates don't know the rule exists. So the data model is not just a channel enum: it
      needs `(company, agency, submitted_at)` with an ownership-window expiry, and the warning
      fires on any second submission to a company whose window is still open.
- [ ] **Compensation as 年収, not salary** *(`v1.5.0`)*. Japanese offers are quoted as an annual figure that
      folds in bonus (賞与), often expressed as N months of base. Comparing "600万, 12 months + 2×
      bonus" against a flat 14-month structure is real arithmetic that candidates get wrong. Store
      the structure, not just the number, and normalise for comparison.
      **Researched 2026-07-11:** [bonuses run 2–6 months of base, paid summer and winter, and
      are 15–30% of total annual
      comp](https://www.gtalent.jp/blog/japanwork-en/salary-tax-en/salary-system); base is
      typically 70–80% of the package, with allowances on top (commuting reimbursement is
      near-universal; housing/family allowances at some firms). The distinction worth a column:
      **guaranteed months vs performance-tied bonus** — two "600万" offers with the same total
      differ materially on that axis. For a sanity-check benchmark, the [TokyoDev 2025
      survey](https://www.tokyodev.com/articles/the-2025-tokyodev-developer-survey-results-are-live)
      (989 respondents) puts the median international developer at **¥9.5M** — but ¥13.5M at
      international companies with no Japan entity vs ¥8.5M at Japanese-HQ firms, so any
      comparison UI should surface employer type, not just the number.
- [x] **Calendar-aware follow-ups** — shipped in `v1.4.0`, with the digest, as one edit to the same
      job. `JapanCalendar` holds the digest on weekends, national holidays, New Year, Golden Week
      and Obon; the held reminders go out on the next business day, exactly once, because the
      idempotency key derives from `follow_up_at` rather than from the day the job runs.
- [ ] **Japanese-level filter** *(`v1.5.0`)*. Record the Japanese proficiency a posting demands (JLPT N1/N2,
      "business level", conversational, none) against what the user holds, and filter on it.
      **Researched 2026-07-11:** this taxonomy matches how the market actually filters — both
      [TokyoDev](https://www.tokyodev.com/jobs/no-japanese-required) and
      [Japan Dev](https://japan-dev.com/) tag every posting by language requirement, and
      TokyoDev's own framing is blunt: competition for English-only roles is fierce (orders of
      magnitude more seekers than seats), and per the [2025
      survey](https://www.tokyodev.com/articles/the-2025-tokyodev-developer-survey-results-are-live)
      there are **almost no junior roles that require no Japanese** — juniors who land here
      usually do it through Japanese-using positions. That makes this filter and the JLPT-gap
      item in the career-planning section two halves of one feature.

**Career growth — life after `accepted`**

Direction decided 2026-07-11: KarirKalyan's long-term identity is a **career growth tracker**,
not just an application tracker — the name already says so (karir = career; the product is
currently narrower than its own name). Sequencing (updated 2026-07-11): this cluster follows
the user's calendar, not a release order — see the `positions` scoping trigger below.

This whole cluster sits **outside the `v1.4`–`v1.6` plan** — not because it is unimportant, but
because `positions` is the `2.0.0` (it adds a table *and* changes what `accepted` means in the
FSM), and its trigger is a date in the user's life, not a release number.

- [ ] **`positions` (tenure) entity — the keystone; design it before building anything below.**
      *(`2.0.0` — the only major in this file)*
      Today `accepted` is a terminal status; a career tracker needs the job you then held as a
      first-class thing: company, title, start/end, and the comp structure from the 年収 item
      above. Comp history across positions (benchmarkable against the TokyoDev medians cited
      above), resume versioning, internal-promotion stages, and 職務経歴書 generation all hang
      off it — a 職務経歴書 is literally a positions table rendered as prose. Write it into
      SPEC.md's data model **first**; retrofitting it later means migrating what `accepted`
      means. **Scoping trigger (decided 2026-07-11): accepting an offer**, not finishing a
      prior release — the moment the search succeeds is the moment this entity is needed, or
      the app exits the user's life exactly when its retention story was supposed to begin.
- [ ] **Make the app survive its own success** *(post-`2.0.0` — every sub-item below hangs off
      `positions`)*. Today the lifecycle ends at `accepted`: the
      search closes and there is no reason to open the app again until the next one. Extend it
      into the tenure _between_ searches, so landing a job is a state change, not an exit:
  - **Resume as a living document** — the resume is already stored per application; add a
    current, versioned profile that keeps improving while employed, so the next application
    starts from the best version rather than a year-old PDF. Feeds the
    rirekisho/shokumu-keirekisho generation idea above.
  - **Low-noise market watch** — `wishlist` already models "interesting, not applied"; let it
    be the employed-mode default. Tracking relevant roles while happily employed is how you
    know your market value and when to move.
  - **Skills & certs against the market, not a wishlist** — `UrlPrefillService` already reads
    postings with Claude; extract the skills/certifications each tracked role asks for at
    prefill time, and the gap between what target roles want and what the profile holds
    becomes a ranked "learn next" list (JLPT level, cloud certs, a framework) with zero extra
    data entry. Goals can target the current employer too — an internal promotion has stages
    like an application does.
  - **Periodic check-ins** — Solid Queue and the mailer exist; a quarterly "update your
    resume, review your goals" nudge is one recurring job. Same dead-zone awareness as the
    calendar-aware follow-ups item.

  This repositions the tracker from a search tool you abandon on success into a career
  companion with a retention story — also the better portfolio argument, since every
  sub-item reuses machinery that already exists (bytea storage, `wishlist`, prefill
  extraction, recurring jobs) rather than demanding new infrastructure.

  **Scope boundary (decided 2026-07-11):** career growth does **not** mean drifting into a
  **networking CRM**, a **habit tracker**, or a **learning tracker**. Those are separate
  products with mature incumbents, and a broad-shallow app is a worse portfolio piece than a
  narrow-deep one. The admission test for any career-growth feature: **it must reuse the FSM,
  the timeline, the prefill extraction, or the `positions` entity** — if it needs none of
  them, it belongs in a different app. Concretely: contacts go no further than the
  recruiter-channel item's `agencies` table (that models submission ownership, not
  relationships); skills/certs/JLPT go no further than the gap list derived at prefill time
  (a ranked "learn next", never course progress or streaks); check-ins stay a recurring
  nudge, never a journaling habit loop.

- [ ] **Career intelligence — benchmark reports from published surveys** *(post-`2.0.0`: its
      headline view — comp percentile for the current position — needs `positions`. The
      offer-comp-vs-median slice becomes buildable once `v1.5.0` lands the 年収 structure, and
      may ride a later `v1.6.x` if it earns its refresh cost on its own.)* An in-app,
      yearly-refreshed summary of reliable market sources: the [TokyoDev annual
      survey](https://www.tokyodev.com/articles/the-2025-tokyodev-developer-survey-results-are-live)
      first (2025: 989 respondents; median ¥9.5M, split by employer type, experience band, and
      language use), with MHLW's official wage statistics (賃金構造基本統計調査) as the
      government counterpart. The point is not the report — a static summary page would fail
      this section's admission test — but the user's own data shown against it: comp
      percentile for the current position (needs the `positions` entity), offer comp vs the
      market median for their experience band at decision time, their Japanese level against
      the language-requirement distribution of the roles they track. Implementation is a
      versioned reference dataset — a seed file refreshed once per survey cycle, no scraping,
      no pipeline — so the recurring cost is one data-entry session a year. Check each
      source's licensing/attribution terms before shipping its numbers.

**Global remote**

- [ ] **Can they actually hire you?** *(`v1.6.0`)* The filter that silently kills most global-remote
      applications from Japan: many companies cannot employ someone resident here, and offer only a
      contractor arrangement or an employer-of-record. Track the hiring entity and whether Japan is
      a supported location — ideally captured at prefill time, since job postings usually say.
      This is the remote-work analogue of the visa item, and just as underserved.
      **Researched 2026-07-11:** the [EOR is now the default mechanism for foreign companies
      hiring in Japan](https://japan-dev.com/blog/what-in-an-employer-of-record) — flat
      ~$300–600/employee/month, onboarding in 1–2 weeks versus 3–6 months to incorporate an
      entity ([TokyoDev's guide](https://www.tokyodev.com/articles/employer-of-record) covers
      what it means for the employee side). So the field is a four-value enum, not a boolean:
      **own Japan entity / EOR / contractor-only / cannot hire in Japan** — each implies a
      different employment reality (an EOR contract is with the EOR, not the company you
      interviewed with). Some EORs now also sponsor visas, which ties this to the visa item
      above.
- [ ] **Timezone overlap** *(`v1.6.0`)*. Store the company's home timezone and any required overlap window,
      then show which roles are survivable from JST. A US-West role demanding four hours of overlap
      means a 1am start. Warn at interview-scheduling time too — an invite that lands at 03:00 JST
      should be visibly flagged, not quietly accepted.
- [ ] **Interview scheduling with `.ics` export** *(`v1.6.0`)*, timezone-correct. Falls out of the above and
      is small once the timezone data exists.
