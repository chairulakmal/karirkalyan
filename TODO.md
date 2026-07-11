# TODO

Open work only. Shipped work lives in [`CHANGELOG.md`](CHANGELOG.md).

**Current release: `v1.2.0`** — tagged 2026-07-11 at `36c9378`. The Kanban board view, plus
the API error codes and transition-table endpoint it needed.
**Next release: performance.** Production performance is the priority; dev-server performance
is secondary but has a real pain point (`next dev` crashes even at 4 GB). The ghost-prediction
feature idea stays the strongest candidate for the release after.

Everything below is post-1.2.0 and unscoped.

---

## Backlog (unscoped)

Verified against the code on 2026-07-10 — all still hold. The dev-server memory item and the
career-planning idea were added 2026-07-11.

### Performance — production (priority)

- [ ] **`timeline_entries` offer-lookup index** — the dashboard subquery filters `to_status = 'offer'`
  and the table has no index on `to_status` at all (only `actor_id`, `application_id`,
  `idempotency_key`). Add `(to_status, application_id, created_at)` if it grows.
- [ ] **Fold `/me` into the dashboard payload** — `dashboard/page.tsx` already fetches it in
  parallel via `Promise.all`, so this costs a wasted request, not a round trip. Low priority;
  fix it when the dashboard payload is touched for another reason.

### Performance — dev (secondary)

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
  - **Answered sub-questions:** `experimental.turbopackFileSystemCacheForDev` *is* on
    (default `true` in 16.2.6, `config-shared.js:263`; `.next/dev/cache/turbopack` is 310 MB)
    — the leak happens with it. It does make restarts cheap: warm boot-to-ready measured at
    ~5 s, so a periodic dev-server restart is a viable stopgap. Upstream issue #85290
    (404 → infinite compile loop; relevant because of our `globalNotFound` setup) does
    **not** reproduce — ten bogus URLs 404'd cleanly. The behaviour matches discussion
    **#93451** (unbounded growth after HMR edits, ~7 GB, open and unresolved as of
    2026-07).
  - **Next actions:** add `--heapsnapshot-near-heap-limit=1` to the dev script's
    `NODE_OPTIONS` (allowed there; `--trace-gc` is not) so the next real crash writes the
    heap snapshot upstream wants, then file on #93451/new issue with it. Meanwhile bump the
    dev heap to 8 GB and restart the server when it gets slow. One unexplained datum for
    the upstream report: V8 heap also jumped ~1.6 GB across the 404 phase and a 45 s idle
    window — growth without edits, so renders (every route is dynamic here — the CSP-nonce
    `await connection()`) retain memory too, not just compiles; the ~15-font layout item
    above may be a multiplier.

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

**Career planning — life after `accepted`**

- [ ] **Make the app survive its own success.** Today the lifecycle ends at `accepted`: the
  search closes and there is no reason to open the app again until the next one. Extend it
  into the tenure *between* searches, so landing a job is a state change, not an exit:
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
