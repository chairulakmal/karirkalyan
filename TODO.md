# TODO

Open work only. Shipped work lives in [`CHANGELOG.md`](CHANGELOG.md).

**Current release: `v1.3.0`** — tagged 2026-07-11 at `f455853`. Ghost prediction, which also
absorbed the two production items the performance release had parked (the `timeline_entries`
index and the `/me` fold — both struck off below).
**Next release: performance.** What is left of it is the dev-server memory leak, which is a
real pain point (`next dev` crashes even at 4 GB) and is now the whole of it.
**Nothing in flight.**

Everything below is post-1.3.0 and unscoped.

---

## Backlog (unscoped)

Verified against the code on 2026-07-10 — all still hold. The dev-server memory item and the
career-planning idea were added 2026-07-11. The market-dependent feature ideas (Japan market,
global remote, ghost prediction) were verified against current web sources on 2026-07-11 —
citations inline where a claim came from research rather than the code.

### Performance — production

- [x] **Fold `/me` into the dashboard payload** — done in `feat/ghost-prediction`, which is what
      "fix it when the dashboard payload is touched for another reason" was waiting for.
- [ ] **`timeline_entries` offer-lookup index** — still open, and still conditional. The
      `avg_days_to_offer` subquery filters `to_status = 'offer'`, and there is deliberately no
      index on `to_status`: at personal-tracker scale a user's timeline is a few hundred rows,
      already reachable through `(application_id, created_at)`. Add `(to_status, application_id,
      created_at)` **if the table grows**, not before. (`feat/ghost-prediction` widened the bare
      `application_id` index to `(application_id, created_at)` for the ghost-risk window
      function — a replacement, not an addition.)

### Performance — dev (priority)

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
  - **Next actions:** add `--heapsnapshot-near-heap-limit=1` to the dev script's
    `NODE_OPTIONS` (allowed there; `--trace-gc` is not) so the next real crash writes the
    heap snapshot upstream wants, then file on #93451/new issue with it. Meanwhile bump the
    dev heap to 8 GB and restart the server when it gets slow. One unexplained datum for
    the upstream report: V8 heap also jumped ~1.6 GB across the 404 phase and a 45 s idle
    window — growth without edits, so renders (every route is dynamic here — the CSP-nonce
    `await connection()`) retain memory too, not just compiles; the ~15-font layout item
    above may be a multiplier.

### UI & accessibility

- [ ] **Japanese phrase-based line breaking (文節単位の改行).** Japanese has no spaces, so the
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
- [ ] **No dark mode** — `web/app/globals.css:28` hardcodes `color-scheme: light` while dark icon
      assets exist in `design/`. Decide to ship it or delete the unused assets; leaving both is
      the worst option. Similar to LinkedIn not having a dark mode, we will stick to light mode.

### Code quality

- [ ] **Extract `Applications::ListQuery`** — `ApplicationsController#index` mixes filtering,
      cursor decoding, and serialization inline. `api/app/queries/` now exists
      (`Applications::GhostRiskQuery`), so the destination and its conventions are settled;
      this is now a straight extraction with a pattern to follow.
- [ ] **`API_BASE` vs `API_BASE_URL`** — two near-identical names for different things
      (`web/app/lib/api.ts:107` is the internal fetch base; `web/app/lib/links.ts:2` is the public
      Railway URL used for doc links). Rename or comment.

### Feature ideas

Unscoped. The pre-1.0.0 Phase 9 notes (now in `CHANGELOG.md`) also name an analytics dashboard
and an AI cover-letter assist as the declared roadmap. Everything here is **post-v1.2.0** and most of it _does_ touch `api/` —
that is fine, the `web/`-only constraint is a property of v1.1.0, not a permanent rule.

The three table-stakes items first, then the ones that differentiate. A generic tracker is a
CRUD demo; the ideas below are the ones a Tokyo hiring reviewer could not have seen in someone
else's portfolio, because they encode knowledge of the market rather than knowledge of Rails.

**Table stakes**

- [ ] **Email verification** (Devise `:confirmable`).
- [ ] **CSV export** of applications.
- [ ] **Follow-up digest email** — Solid Queue landed; the mailer already exists.

**Ghost prediction — shipped in `v1.3.0`.** See CHANGELOG § v1.3.0 and SPEC.md § Query
layer. The market research that justified it, and the stage distribution the global defaults
were sanity-checked against, is recorded in SPEC.md § Query layer rather than repeated here.

**Japan market**

These are the strongest differentiators and the most research-dependent. **Researched against
current web sources 2026-07-11** — findings and citations inline below. The immigration numbers
should still be re-confirmed against the Immigration Services Agency / MOJ the day a migration
is actually written; everything else is now grounded enough to scope from.

- [ ] **Visa / status-of-residence tracking.** For a foreign engineer in Japan this is the
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
- [ ] **Rirekisho + shokumu-keirekisho generation.** Japanese applications conventionally want
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
      a good line in the README.
- [ ] **Model the recruiter channel.** Hiring in Japan is heavily agent-mediated. Add a channel
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
- [ ] **Compensation as 年収, not salary.** Japanese offers are quoted as an annual figure that
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
- [ ] **Calendar-aware follow-ups.** `FollowUpReminderJob` already runs at 08:15 JST. Teach it
      the dead zones — the New Year holidays, Golden Week, Obon — when nudging a company achieves
      nothing. A reminder that knows not to fire on 1 January is a small touch that reads as care.
- [ ] **Japanese-level filter.** Record the Japanese proficiency a posting demands (JLPT N1/N2,
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
currently narrower than its own name). Sequencing is unchanged by this: performance release
first, ghost prediction after, this cluster then.

- [ ] **`positions` (tenure) entity — the keystone; design it before building anything below.**
      Today `accepted` is a terminal status; a career tracker needs the job you then held as a
      first-class thing: company, title, start/end, and the comp structure from the 年収 item
      above. Comp history across positions (benchmarkable against the TokyoDev medians cited
      above), resume versioning, internal-promotion stages, and 職務経歴書 generation all hang
      off it — a 職務経歴書 is literally a positions table rendered as prose. Write it into
      SPEC.md's data model **first**; retrofitting it later means migrating what `accepted`
      means.
- [ ] **Make the app survive its own success.** Today the lifecycle ends at `accepted`: the
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

- [ ] **Career intelligence — benchmark reports from published surveys.** An in-app,
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

- [ ] **Can they actually hire you?** The filter that silently kills most global-remote
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
- [ ] **Timezone overlap.** Store the company's home timezone and any required overlap window,
      then show which roles are survivable from JST. A US-West role demanding four hours of overlap
      means a 1am start. Warn at interview-scheduling time too — an invite that lands at 03:00 JST
      should be visibly flagged, not quietly accepted.
- [ ] **Interview scheduling with `.ics` export**, timezone-correct. Falls out of the above and
      is small once the timezone data exists.
