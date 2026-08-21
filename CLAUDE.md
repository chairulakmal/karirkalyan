# KarirKalyan

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Full-stack job application tracker. Rails 8 API (`api/`) + Next.js 16 frontend (`web/`).

## SPEC.md is the source of truth

**All technical truth lives in [`SPEC.md`](SPEC.md)**: stack, data model, state machine, service layer, API contract, background jobs, security, i18n, testing, deployment, local dev, and versioning. It is a reference, not an essay; the reasoning behind each decision, the reversals, and the detailed release history live in [`notes/HISTORY.md`](notes/HISTORY.md), which is where an argument goes when it is too long for the spec. This file deliberately restates neither. An earlier version of this file duplicated the stack, key conventions, and API routes, and drifted a full release behind the code: the same failure mode that killed `PLAN.md`, which spent an entire release describing Sidekiq and Redis after both had been removed.

**Read `SPEC.md` and `TODO.md` before starting work.**

The workflow is spec-first. **Change SPEC.md before you change code**:

1. Write the change into the spec: amend the data model, the API contract, the state machine: whatever the change actually touches. If you cannot describe it there, you do not yet understand it well enough to build it.
2. Get the spec right. A spec that disagrees with itself produces code that disagrees with itself.
3. Then write the code, and make it match.

Consequences:

- **If code and `SPEC.md` disagree, one of them is a bug.** Decide which, and fix that one. Never silently paper over the gap.
- `SPEC.md` describes the system **as it is**, present tense. It is not a plan and not a history: `TODO.md` is the plan, `notes/HISTORY.md` is the history.
- Behaviour-changing PRs update `SPEC.md` in the same PR (the PR template has a checkbox), and bump its "Last synced against the code" line.

## Where things live

| Question | Answer lives in |
| --- | --- |
| How does X work? | `SPEC.md`, a reference: contracts, schemas, tables, invariants |
| Why was it built that way, and what was tried first? | `notes/HISTORY.md` (decisions log, reversals, detailed release history, production lessons) |
| Current release, what's next, open work | `TODO.md` (release status at the top) |
| What shipped, and when | `CHANGELOG.md`, an index; each heading links to its full entry in `notes/HISTORY.md` |
| How do I destroy an account or reset the demo? | `notes/OPS.md` (operator runbook) |
| Local dev setup | `SPEC.md` § Local development |
| Where the brand book lives, and the pending type change | `BRAND.md` |
| What earns a major / minor / patch | `SPEC.md` § Versioning & releases |

Do not restate release status, versions, or scope in this file: that is `TODO.md`'s job, and copies here go stale.

**`v1` is closed to new features, and no `2.0.0` work starts until Akmal has actually started his next job.** Two halves of one guardrail. Anything that adds a capability now belongs to the `2.0.0` cluster (the rewrite to Hono + Nuxt, the `positions` tenure entity and everything hanging off it), which is gated on that life event and not on any release number: treat it as out of scope until Akmal says the job has begun. Meanwhile a `v1` change ships only if it makes something the app already does work correctly or stops something it already does from being abused. Do not argue a feature into a patch because it looks small. This is a standing guardrail, not a scope restatement; `TODO.md` § The rule owns the reasoning and the `2.0.0` cluster owns the what and the why.

## Invariants most worth knowing

One line each; the full rules and their reasoning live in `SPEC.md` at the named section.

- `ApplicationFSM::TRANSITIONS` is the **only** copy of the transition table: never mirror it in TypeScript, fixtures, or docs. *(§ State machine)*
- Status changes go through `Applications::TransitionService`, never direct attribute writes. *(§ Service layer)*
- The JWT never reaches client-side JavaScript. *(§ Auth flow)*
- Request specs hit a real PostgreSQL database: do not mock the DB there. *(§ Testing strategy)*
- `web/` navigation goes through `i18n/navigation.ts`, not `next/link` / `next/navigation` originals. *(§ i18n)*
- The version number lives **only** in the git tag. `web/package.json` is pinned to a static `0.0.0` on purpose: do not "fix" it to match the release. *(§ Versioning & releases)*

## Branching & PRs

How much ceremony a change gets depends on what kind of change it is:

| Change type | Branch + PR? |
| --- | --- |
| Features | **Must**: always a feature branch and a PR |
| Security fixes | **Must**: always a feature branch and a PR |
| Bug fixes | **Should**: default to a PR; skip only for something trivial |
| Chores | **May**: a PR is fine, so is committing straight to `main` |
| Docs | **No**: commit directly to `main`, no branch, no PR |

"Docs" means documentation only: `*.md`, comments, `llms.txt`. A change that touches docs *and* code is not a docs change: classify it by the code.

**Cadence: combine PRs as much as possible, ideally one per day.** The exception is a fatal bug fix, which ships alone and immediately. Everything else headed for a PR rides together with the day's other work rather than each change opening its own. The table above still decides *whether* a change needs a PR; this rule only batches the ones that do. The reason is operational, not aesthetic: every merge under a watch path triggers a deploy, deploy overlap is a known source of memory spikes (the 2026-07 investigation traced every observed spike to it), and each PR burns two CI runs.

### What actually enforces this

`main` is governed by a **ruleset** named `conserve-main`, not classic branch protection: `gh api repos/.../branches/main/protection` returns a misleading `404`. Inspect it with `gh api repos/chairulakmal/karirkalyan/rules/branches/main`.

It requires a pull request (0 approvals), requires the `Lint, security & test` and `Lint, typecheck & build` checks, and blocks deletion and force-pushes. The **Admin** repository role has `bypass_mode: always`, so Akmal can push straight to `main`; that is what makes the docs row above possible. The bypass applies to *every* rule, so the table is still discipline rather than a wall: don't reach for it outside the docs row.

CI is path-aware **per tree**: a docs commit pays for neither suite, a `web/` commit doesn't pay for the Rails suite, and an `api/` commit doesn't pay for the Next build. One asymmetry, deliberate: `web-ci`'s Playwright job boots the real Rails API, so an `api/`-only push still runs it, since it is the only job that tests the two halves against each other. Both workflows split into `changes` → `verify` → `gate`. **`gate` owns the required context name and must always run**: a required check that is skipped stays *expected* forever and blocks the merge, so path filtering lives in `changes`, never on the workflow trigger. If you rename a job, keep `gate`'s `name:` byte-identical to the ruleset's context string.

## Releases: docs follow the feature, not the tag

**`v1` stopped being tagged on 2026-08-03: `v1.11.1` is its last tag and the next one is `2.0.0`** (`SPEC.md` § Versioning & releases). So everything in this section about tagging, digits and `gh release create` is **dormant, not deleted**: it describes the ritual that resumes at `2.0.0`. What still binds today is the first rule below, since docs must keep pace with the code whether or not a tag is coming, and `CHANGELOG.md`'s untagged section is where landed work goes.

`SPEC.md` moves in the same PR as the behaviour change (rule above). The **rest** of the documentation surface is not allowed to wait for release day either: **after each feature lands, and before the release that ships it is tagged**, bring the other docs up to date: `README.md` *and* `README.ja.md` (always together, never one without the other), `CHANGELOG.md`, the swagger/rswag output, `llms.txt`. Tagging a release whose docs still describe the previous release is the `PLAN.md` failure mode with a version number on it.

**Which digit moves** is decided by one mechanical test, not by how big the release feels. `SPEC.md` § Versioning & releases states the test, lists what counts as a major, and explains why SemVer's own definition of major cannot fire on this project: read it there rather than from a copy here, which is what this file's opening sentence promises and what this paragraph used to break. The `docs-auditor` subagent exists for exactly this post-feature sweep.

**The tag is not the last step: `gh release create` closes the release**, with notes drawn from the `CHANGELOG.md` entry. `SPEC.md` § Versioning & releases has always named it as part of the ritual, but `v1.7.0` still shipped tagged and release-less for a day because this list did not, so it now does.

## Subagents

Delegate to a subagent when the task genuinely warrants it: a wide search whose file dumps you don't need, or a review that benefits from a cold read of the diff:

- **`Explore`**: broad searches across `api/` and `web/` when you need the conclusion, not the file contents.
- **`code-reviewer`**: senior review of a finished unit of TypeScript or Rails work. Worth running on anything headed for a PR under the table above.
- **`docs-auditor`**: check docs against implementation after a behavior change.

Not for tasks you can do inline. Each subagent starts cold and re-derives context you already have, so a multi-part task is not by itself a reason to spawn one.
