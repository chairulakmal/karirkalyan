# TODO

Open work only. Shipped work lives in [`CHANGELOG.md`](CHANGELOG.md), and so do the settled
decisions-not-to-build (dark mode, document version history, client-side error tracking — see
its § Decisions). This file was last cut back to open work on 2026-07-13.

**Current release: `v1.4.1`** (2026-07-12, "Close the door"). What it and every release before it
shipped is `CHANGELOG.md`'s job to say, not this file's.

**North star (decided 2026-07-11): be the best career app for its one loyal user.** Portfolio
value follows from that, not the other way round — a reviewer can tell a tool with a real
user from a feature showcase. Two consequences for sequencing: items are ordered by **when in
the user's life they pay off** (search-time items while the search is active; the `positions`
entity is triggered by accepting an offer, not by finishing a prior release), and the backlog
has an **Operations** section for the worst-day work — backups, export — that no feature
admission test covers.

**Nothing in flight, but `v1.4.2` has already started accruing.** The post-`v1.4.1` docs audit
(`deeedd0`, PR #63) landed on `main` untagged: Honeybadger Insights turned **off**, and three false
claims corrected on `/privacy` in both locales. It sits in `CHANGELOG.md` § Unreleased and ships
under the `v1.4.2` tag — it does not earn a tag of its own, and it does not change what `v1.4.2`
*is*. That is still the code-quality patch "Close the door" displaced: extract
`Applications::ListQuery`, settle `API_BASE` vs `API_BASE_URL`, give downloaded files names that say
which application they belong to, and throttle the upload path. It stays ahead of `v1.5.0`, so the
`Applications::ListQuery` constraint below still holds.

The dev-server memory leak carries no release tag on purpose: it is **maintenance, not a release**.
Its stopgap already shipped (`cf7cd8d` — 8 GB heap + heap-snapshot flag live in `web/package.json`),
and what remains is filing upstream when the next crash writes a snapshot.

**One standing promise outranks everything here on the day it breaks:** `/privacy` and `/terms`
name `karirkalyan@cypherpunkzero.com` (`web/app/lib/links.ts:7`) as the address an erasure request
goes to; the mailbox is set up and was verified to receive mail (2026-07-12). It is a **published
promise**, not a gate — if that routing ever breaks, the legal pages are lying, so fixing it
outranks anything else in this file on the day it happens.

---

## Release plan — `v1.4.2` → `v1.7.0` (scoped 2026-07-12, amended 2026-07-13)

**The whole backlog fits under 1.x.** Only one item forces a major, and `SPEC.md` § Versioning
& releases already names it: the **`positions` entity**, because it adds a table *and* changes
what `accepted` means in `ApplicationFSM`. Everything else here is an additive migration or has
no schema at all, so the previous image would still boot against the database the release leaves
behind — which is the whole of the major test.

**Amended 2026-07-13 — the mobile access layer.** The original plan was deep on the data model
and silent on where its one user physically is: during an active search, postings are met on the
phone, and the access story was a desktop one — browser, URL, a password form the 1-day JWT
resurfaces every morning. `v1.5.0` is now **"the pocket app"**, inserted *ahead of* the Japan
market layer because both pay off while the search is active, and the share-sheet capture flow
multiplies exactly the prefill pipeline the Japan layer bets on. Everything downstream slides one
minor. The dark-mode decision's argument (`CHANGELOG.md` § Decisions) continues here: a job
seeker's professional context isn't just light-themed, it's mobile.

`v1.3.1` through `v1.4.1` shipped 2026-07-12 — see `CHANGELOG.md` for what each contained.

| Release | Level | Contents |
| --- | --- | --- |
| `v1.4.2` | patch | `Applications::ListQuery` extraction, `API_BASE` naming, download filenames, upload throttle, the profile-card fold — **plus the privacy/doc-drift fix already on `main`** |
| `v1.5.0` | minor | The pocket app: share-sheet capture, passkey sign-in, push digest, installed-app shell |
| `v1.6.0` | minor | The Japan market layer: recruiter channel + `agencies`, 年収 comp structure, Japanese-level filter |
| `v1.6.1` | patch | Japanese phrase-based line breaking |
| `v1.7.0` | minor | Hiring entity, timezone overlap + `.ics`, visa / status of residence |

**The trap that would break this plan: every new column in `v1.5.0`–`v1.7.0` must be
nullable or defaulted.** A `NOT NULL` column with no default means the previous image's
`INSERT`s fail against the new database — and by the mechanical test that quietly turns a minor
into a **major**. It is the only way this plan accidentally violates its own versioning. The
pocket app's two new tables (`credentials`, `push_subscriptions`) are purely additive and pass
for free — the rule bites on columns added to tables the previous image writes to.

### `v1.4.2` — patch. Sequenced before `v1.5.0`, not filler

**Already on `main`, untagged** (`deeedd0`, PR #63 — the post-`v1.4.1` docs audit): Honeybadger
Insights off, three false claims corrected on `/privacy`, and the doc drift the audit turned up
(`web/README.md`'s dead `/sign-up` route, swagger's Production server pointing at the Next.js app,
`db:seed` called "optional" in three guides, Postgres 16 on the landing page). It rides this tag
rather than earning one: no capability, no migration.

**Still to do** — extract `Applications::ListQuery`; settle `API_BASE` vs `API_BASE_URL`; give
downloaded resumes and cover letters filenames that say which application they belong to; throttle
the upload path; fold "Your data" into the profile card and lift that card into a component. The
first lands **first** because `v1.6.0` adds three new filters to
`ApplicationsController#index` — the exact method that already mixes filtering, cursor decoding,
and serialization inline. Extract before, and the filters land in a query object with
`Applications::GhostRiskQuery` as the pattern; extract after, and the controller thickens and then
gets refactored under load. (The insertion of the pocket app between them changes nothing here:
`v1.5.0` does not touch `#index`.)

The filenames are the v1.4.0 fallout: shipping the account archive is what made it visible that
neither download surface names a file usefully. It is still a patch — no new capability, no
migration, and the previous image boots against an unchanged database.

### `v1.5.0` — minor. "The pocket app" (inserted 2026-07-13)

The mobile access layer: make opening KarirKalyan on the phone feel like opening a good Android
app, not a desktop site. **Android-first and web-only** — the deliverable is the WebAPK Chrome
mints, not an APK; no iOS work ships in v1. Four pieces: the **capture flow** (a
`/applications/new?url=…` deep link that runs `UrlPrefillService` on arrival, plus
`share_target` in the manifest — share a posting from any app, land in a prefilled form);
**passkey sign-in** (WebAuthn, additive nullable `credentials` table, password sign-in stays
forever as the fallback); **push delivery** for the existing follow-up digest (additive
`push_subscriptions` table, VAPID, a delivery branch in the job that already runs); and the
**installed-app shell** (bottom tab bar with safe-area insets, `start_url` → dashboard, manifest
shortcuts, a monochrome icon for Android themed icons).

If the release runs heavy, the cut order is: passkeys collapse to a 30-day JWT (the access win
ships, the mechanism follows), then push (the email digest already exists as the channel). The
capture flow and the shell are the release — they are what changes the user story. Device
facts, research citations, and the three traps (the Chrome-install requirement, the push-only
service worker, the WebAuthn provider constraints) live in the backlog's **Mobile access**
section below.

### `v1.6.0` — minor. The Japan market layer

Recruiter channel + `agencies` + the ownership-window warning; 年収 as a comp *structure*, not a
number; the Japanese-level requirement filter. One release because all three pass the **field
admission test the same way** — each is captured by `UrlPrefillService` at prefill time from the
posting text. That is one extraction pass, one migration, one form pass; three releases would be
three trips through the same three files. This is also the release a Tokyo reviewer could not
have seen in someone else's portfolio — and after `v1.5.0`, its three fields land into a capture
flow that starts on the phone's share sheet, where the postings actually are.

### `v1.6.1` — patch. Japanese phrase-based line breaking

No new capability, so it cannot be a minor — but it is worth the most **right after `v1.6.0`**,
which is the release that fills the UI with the Japanese compound nouns (agency names, comp
structures, JLPT levels) that wrap mid-word today.

### `v1.7.0` — minor. "Can you actually take this job?"

Hiring-entity enum, timezone overlap with the `.ics` export falling out of it, and visa /
status-of-residence tracking with CoE lead time surfaced next to an offer deadline. The theme is
**constraints that decide whether an offer is even takeable** — the visa item and the
hiring-entity item are the same question asked from opposite directions. Email verification no
longer rides along: `v1.4.1` closed sign-up and the backlog entry dropped the item, but an
earlier version of this section still listed it — that was drift, fixed 2026-07-13.

### Deliberately outside the plan

- **`positions`, and everything hanging off it** — resume versioning, periodic check-ins,
  low-noise market watch, the skills/certs gap list, the comp-percentile half of career
  intelligence. Two reasons, both already decided above: `positions` is the `2.0.0`, and its
  scoping trigger is **accepting an offer**, not finishing `v1.7.0`. Giving it a release number
  would contradict that.
- **履歴書 / 職務経歴書 generation.** 履歴書 alone is a legal minor — additive, no schema break —
  but its twin *is* a `positions` table rendered as prose, and the entry below calls PDF
  generation the highest carry cost in this file. Shipping half the pair, then maintaining that
  toolchain for a year before the other half is even buildable, is the worst version of the
  trade. Ship both after `2.0.0`.
- **The `timeline_entries` index** stays conditional — nothing in `v1.4`–`v1.7` grows that table.
- **Offline support, TWA / Play Store packaging, and all iOS work** — excluded from v1 by the
  pocket-app scoping. Offline is architectural, not deferred politeness: every route renders
  dynamically for the CSP nonce, so a service worker that caches HTML serves pages whose nonces
  no longer match the header. See the Mobile access section.
- **The `next dev` heap leak** stays maintenance, per the header.

---

## Backlog

Verified against the code on 2026-07-10 — all still hold. The market-dependent feature ideas
(Japan market, global remote) were verified against current web sources on 2026-07-11 —
citations inline where a claim came from research rather than the code. Items were scoped into
releases on 2026-07-12 — each open item below carries its release tag, and the plan above is the
summary of those tags, not a second source of truth. The plan was amended and renumbered on
2026-07-13 — the **Mobile access** section under Feature ideas is what was inserted, and every
tag from the old `v1.5.0` onward slid one minor.

### Performance — production

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
Postgres, and **the Railway Hobby plan has no managed backups** (confirmed 2026-07-11). The
defence that already exists — the nightly `pg_dump` in the private `karirkalyan-backups` repo
(restore drill passed) and the full-account export — is recorded in `CHANGELOG.md` (§ Backups,
§ v1.4.0); what remains open is the abuse surface below.

- [ ] **Throttle uploads, and cap applications per account** *(`v1.4.2` — patch: no capability,
      no migration)*. `rack_attack.rb` throttles sign-in, the AI prefill and the account
      export (there is no sign-up throttle because `v1.4.1` removed the endpoint), but
      **nothing throttles the upload path** (`PATCH /applications/:id` with a resume or
      cover letter). The exposure is smaller than it looks and it is worth being precise about why:
      an upload **overwrites** — `applications.resume` is a single `bytea`, there is no version
      history — and `Application::MAX_FILE_SIZE` caps each blob at 1 MB with a PDF content check.
      So a client looping PATCH burns CPU and write I/O but its storage footprint stays flat at
      2 MB per application. **The unbounded axis is `POST /applications`**, which nothing caps: every
      new application is another 2 MB of storage allowance, on a database whose whole backup story
      is a nightly `pg_dump`. Two throttles, both per-account (the cost is a function of whose data
      it is, not where the request came from — same reasoning as the export throttle, `CHANGELOG.md`
      § v1.4.0): a write/upload cap, and a ceiling on applications per account. The per-account
      pattern and the `429` responder already exist; this is a config change, not a design.

### UI & accessibility

- [ ] **Japanese phrase-based line breaking (文節単位の改行)** *(`v1.6.1` — patch: no new
      capability, and it pays off most once `v1.6.0` fills the UI with Japanese compound nouns)*.
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

### Code quality

- [ ] **Extract `Applications::ListQuery`** *(`v1.4.2` — and it must land before `v1.6.0`)* —
      `ApplicationsController#index` mixes filtering,
      cursor decoding, and serialization inline. `api/app/queries/` now exists
      (`Applications::GhostRiskQuery`), so the destination and its conventions are settled;
      this is now a straight extraction with a pattern to follow. The sequencing is the point:
      `v1.6.0` adds three filters (channel, comp, Japanese level) to exactly this method, so
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
- [ ] **Fold "Your data" into the profile card, and make the card a component** *(`v1.4.2` — patch:
      no capability, no migration, `web/`-only)*. The dashboard renders the same
      `<section className="border border-dune bg-linen p-5">` twice: the **profile** block
      (`web/app/[locale]/(app)/dashboard/page.tsx:54–76` — email, member since) and the **exports**
      block (`:97–116` — eyebrow "Your data", the CSV and account-archive links), with the
      `avg_days_to_offer` line (`:78–91`) wedged between them. They are one thought — *who you are,
      and what you can take with you* — split across two cards by nothing but render order. Merge
      the exports block into the profile card, and lift the result into
      `web/app/components/profile-card.tsx` so `/settings` or an account page can import it later
      rather than copy it.

      **Two traps, both cheap to walk into:**

      **The export links must not inherit the profile block's `{me && …}` gate.** The profile block
      is conditional on `stats.user` and the exports block is not — if the merged card is gated as a
      whole, a failed `/dashboard` fetch silently removes the *only* surface that honours
      `/privacy`'s "getting your data out" promise, and it fails invisibly, in exactly the moment
      the user most wants their data. Render the card's export half unconditionally, or keep the
      export actions outside the gate.

      **The component takes the user as a prop; it does not fetch one.** `page.tsx:11` reads
      `stats.user` from the dashboard payload precisely so there is no second `/me` request — that
      fold is what `v1.3.0` shipped. A component that fetches its own user re-introduces the request
      the fold removed, on every page that imports it.

      **One decision, not a mechanical move: the heading.** `dashboard.exports.eyebrow` is "Your
      data" in EN but 「データの書き出し」 (*exporting data*) in JA — not a translation of each
      other, and only the EN one reads as a card title. Merging under a single heading is a copy
      decision in both locales, and whichever eyebrow loses becomes a dead catalog key to delete
      (the key-parity check is 337/337 and should stay that way).

      Carry the two comments at `:93–96` and the `eslint-disable no-html-link-for-pages` lines with
      the move — the export anchors are plain `<a>`s to `/api/exports/*` because those are API
      routes, not localized pages, and that is a fact about the destination, not a style lapse.

### Feature ideas

Scoped into releases on 2026-07-12, renumbered 2026-07-13 when Mobile access became `v1.5.0`;
tags inline below. The pre-1.0.0 Phase 9 notes (now in `CHANGELOG.md`) also name an analytics
dashboard and an AI cover-letter assist as the declared roadmap. Everything here is
**post-v1.3.0** and most of it _does_ touch `api/` — that is fine, the `web/`-only constraint
is a property of v1.1.0, not a permanent rule.

A generic tracker is a CRUD demo; the differentiators below are the ones a Tokyo hiring
reviewer could not have seen in someone else's portfolio, because they encode knowledge of
the market rather than knowledge of Rails. The table stakes are already in: the follow-up
digest and CSV export shipped in `v1.4.0`, ghost prediction in `v1.3.0` — see `CHANGELOG.md`.

**Field admission test (added 2026-07-11), for any new per-application column** — channel,
agency, comp structure, language level, hiring entity, timezone, all of them: it must be
**captured at prefill time by `UrlPrefillService`, or cost near-zero manual entry**. The app
has one user, and a field he stops filling in after the fifth application is dead schema
plus form friction. The hiring-entity item already says this about itself; it is the rule
for the whole section, not a footnote on one item.

**Table stakes — one conditional item remains:**

- [ ] **Email verification** (Devise `:confirmable`) — **only if registration ever reopens.**
      Dropped from the plan by `v1.4.1`: `:confirmable` confirms that whoever typed an address
      into a sign-up form can read that mailbox, and there is no sign-up form. The operator types
      the address into `users:create` himself, so there is nothing left to verify. It was already
      labelled a portfolio checkbox; it is now a checkbox for a box that does not exist.

**Mobile access — the pocket app** *(added 2026-07-13; all four items are `v1.5.0`)*

The plan was deep on the data model and silent on where its one user physically is. During an
active search, postings are met on the phone — LinkedIn's app, TokyoDev in a mobile tab, a
recruiter's email on the train — while the access story was a desktop one: browser → URL → a
password form the 1-day JWT (`api/config/initializers/devise.rb:32`) resurfaces every morning →
a top-header nav. Half the substrate already exists unused: `web/public/manifest.webmanifest`
already declares `display: standalone` with brand icons and theme color. The app is already
*installable*; it just isn't an *app* once installed.

**Device facts this section is built on (recorded 2026-07-13):** the user carries a **Nothing
Phone 3a** (Android 15) and runs **Brave with Proton Pass** on both the phone and the Ubuntu
desktop. He will install the PWA via Chrome, but **passkeys must stay accessible through Proton
Pass**, not Google Password Manager. Hence the scope boundary: **Android-first, web-only** — the
deliverable is the WebAPK Chrome mints, no TWA/Bubblewrap/Play packaging, and no iOS work in v1
(`public/apple-icon.png` stays — it is a favicon-tier asset, not an iOS commitment, the same
logic as the dark brand icons in the dark-mode decision, `CHANGELOG.md` § Decisions).

- [ ] **Capture via the share sheet** *(`v1.5.0` — the feature; the rest of the release serves
      it)*. A `/applications/new?url=…` deep link that triggers `UrlPrefillService` on arrival,
      plus [`share_target`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)
      in the manifest: share a posting from any app → land in a prefilled form. **Researched
      2026-07-12 — the install trap:** `share_target` needs a real WebAPK, and
      [Brave has no minting server](https://support.brave.app/hc/en-us/articles/39077114659597-How-do-I-install-and-use-Web-Apps-in-Brave)
      — an install from Brave is a home-screen shortcut that
      [silently lacks installation-gated capabilities](https://web.dev/learn/pwa/installation),
      so it would look like the feature doesn't exist. The app is installed **once, via Chrome**;
      browsing stays in Brave, and sharing *from* Brave still reaches the WebAPK — the share
      source doesn't matter. That one-sentence install step goes in the docs. Sequencing
      rationale: `v1.6.0`'s three fields are all captured at prefill time, so mobile capture
      multiplies the exact pipeline that release bets on — which is why this lands first.
- [ ] **Passkey sign-in** *(`v1.5.0`)*. WebAuthn via `webauthn-ruby` hand-wired into Devise (the
      `devise-passkeys` gem is not mature enough to lean on), with an additive nullable
      `credentials` table — still a minor by the mechanical test. The provider chain is Chrome →
      Android Credential Manager → **Proton Pass**, so the implementation must keep provider
      choice open: **discoverable credentials** (`residentKey: "required"`), **no
      `authenticatorAttachment` restriction** (a `platform` restriction on desktop would demand
      the machine's own authenticator and bypass the Proton Pass extension), **`attestation:
      "none"`** (attestation policy is how sites accidentally block third-party providers).
      Enrollment ships **desktop-first**: a passkey created on Ubuntu (Brave + Proton Pass
      extension intercepts the ceremony) syncs through Proton Pass to the phone — no separate
      phone enrollment flow. **Password sign-in stays forever as the fallback**: the chain has
      more moving parts than a first-party one, and Brave has shipped real third-party-passkey
      regressions ([brave-browser#38345](https://github.com/brave/brave-browser/issues/38345),
      [#37984](https://github.com/brave/brave-browser/issues/37984)). If the release runs heavy,
      the cut is a 30-day JWT (the revocation list is already wired via `revocation_requests`,
      and the JWT-never-reaches-JS invariant is untouched) with passkeys as the follow-up minor.
- [ ] **Push delivery for the follow-up digest** *(`v1.5.0`)*. A second channel for the digest
      job that already exists: an additive `push_subscriptions` table, VAPID keys, and a delivery
      branch next to the mailer. **The trap that must be written before the code: the service
      worker is push-only — no `fetch` handler, ever.** Every route renders dynamically for the
      CSP nonce (`web/proxy.ts` builds the policy per request), so a service worker that caches
      HTML serves pages whose nonces no longer match the header and scripts get silently blocked.
      Corollary, recorded under "Deliberately outside the plan": **offline is out** — it is the
      one native trait this architecture cannot have cheaply. The launcher badge needs no work on
      Android: the notification itself produces the dot/count.
- [ ] **The installed-app shell** *(`v1.5.0`)*. Bottom tab bar (Dashboard / Applications / Board)
      with `env(safe-area-inset-bottom)` — which also dissolves the 375px Japanese-nav-label
      squeeze the header comment fights (`web/app/[locale]/(app)/layout.tsx:21`); `start_url` →
      `/dashboard` so launching the installed app opens *into* the app instead of riding the
      proxy redirect off the marketing page; manifest `shortcuts` (long-press the icon → New
      application / Board); a `monochrome` icon for Android themed icons — on a Nothing Phone
      specifically this is a disproportionate delight detail, its launcher aesthetic *is*
      monochrome themed icons; and verify the 512px maskable icon actually has safe-zone padding
      rather than just carrying the `maskable` label.

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

- [ ] **Visa / status-of-residence tracking** *(`v1.7.0`)*. For a foreign engineer in Japan this is the
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
      highest carry; scope it with both eyes open, the way the dark-mode decision
      (`CHANGELOG.md` § Decisions) weighed its cost side.
- [ ] **Model the recruiter channel** *(`v1.6.0`)*. Hiring in Japan is heavily agent-mediated. Add a channel
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
- [ ] **Compensation as 年収, not salary** *(`v1.6.0`)*. Japanese offers are quoted as an annual figure that
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
- [ ] **Japanese-level filter** *(`v1.6.0`)*. Record the Japanese proficiency a posting demands (JLPT N1/N2,
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

This whole cluster sits **outside the `v1.4`–`v1.7` plan** — not because it is unimportant, but
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
    calendar-aware follow-ups that shipped in `v1.4.0`.

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
      offer-comp-vs-median slice becomes buildable once `v1.6.0` lands the 年収 structure, and
      may ride a later `v1.7.x` if it earns its refresh cost on its own.)* An in-app,
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

- [ ] **Can they actually hire you?** *(`v1.7.0`)* The filter that silently kills most global-remote
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
- [ ] **Timezone overlap** *(`v1.7.0`)*. Store the company's home timezone and any required overlap window,
      then show which roles are survivable from JST. A US-West role demanding four hours of overlap
      means a 1am start. Warn at interview-scheduling time too — an invite that lands at 03:00 JST
      should be visibly flagged, not quietly accepted.
- [ ] **Interview scheduling with `.ics` export** *(`v1.7.0`)*, timezone-correct. Falls out of the above and
      is small once the timezone data exists.
