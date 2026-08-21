# Brand

This is KarirKalyan's brand directive: where the brand book lives, which type direction was chosen and why, and what is still owed. The one thing to take away: **the brand book is no longer in this repo, and its type direction (T1, Plus Jakarta Sans solo) now ships in `web/`.** Below, in order: the source of truth and how to reach it, the T1 directive, what T1 leaves alone, what shipping it cost and what it left open, the upstream book's status, and the sync rule.

## Contents

- [Source of truth](#source-of-truth)
- [The directive: T1, Jakarta solo](#the-directive-t1-jakarta-solo)
- [What T1 does not change](#what-t1-does-not-change)
- [Shipping T1](#shipping-t1)
- [Upstream status and open gaps](#upstream-status-and-open-gaps)
- [Sync rule](#sync-rule)

## Source of truth

The brand book is a Claude Design project: **[karirkalyan](https://claude.ai/design/p/6e70a98d-f3af-49c8-8d47-d53c68815376)** (`6e70a98d-f3af-49c8-8d47-d53c68815376`). Read it with the `DesignSync` tool; browser access is the same claude.ai login.

It is at **v1.2, August 2026**. The file that matters is `Karirkalyan Brand Assets.html`, which renders the icon set, the palette and the token block in one page. Behind it sit `brand-assets/tokens.css`, `brand-assets/tokens.json`, `brand-assets/README.md`, the five SVG icons and their PNG renders. Three exploration files also live there (`artboards.jsx`, `cobalt-artboards.jsx`, `design-canvas.jsx`) plus `Karirkalyan Type Directions.html`, which is where T1 came from.

The old local `design/` folder is gone. It was gitignored, so it was never part of the repo's history, and it had drifted: its `tokens.css` was at v1.1 while its own README still described v1.0. Nothing was lost in deleting it. Every icon it held is committed under `web/public/brand/`, every token it held is in `globals.css`, and every other file it held also exists in the design project.

Note that the project is `PROJECT_TYPE_PROJECT`, not `PROJECT_TYPE_DESIGN_SYSTEM`. That type is fixed at creation, so this project cannot become a `/design-sync` target. It is a read source. If two-way component sync is ever wanted, it needs a new project.

## The directive: T1, Jakarta solo

`Karirkalyan Type Directions.html` argues that the shipped type fails at text sizes: Fraunces at `opsz 144` and weight 300 italic forces display proportions into 20px card titles, where the joins go hairline and the italic `a` and `e` collapse. That critique is correct and it is the reason to move.

It offered three ways out and recommended T2 (Jakarta paired with Newsreader). **T1 is the chosen direction**: one variable family for everything, no serif. It is what `brand-assets/tokens.css` implements and, since this file's second revision, what `web/app/globals.css` implements too.

| Role | T1 | Was |
| --- | --- | --- |
| Wordmark | Plus Jakarta Sans, `karir` at 800 + `kalyan` at 300 cobalt, upright | Fraunces `opsz 144`, `kalyan` italic cobalt |
| Display | Plus Jakarta Sans 600, `-0.04em` | Fraunces `opsz 144` (`.kk-display`) |
| H1 | Plus Jakarta Sans 700, `-0.03em` | Fraunces `opsz 36`, weight 500 |
| H2 | Plus Jakarta Sans 600, `-0.018em` | Fraunces `opsz 36`, weight 500 |
| Body | Plus Jakarta Sans 400 | Manrope |
| Labels, mono | `ui-monospace` system stack | IBM Plex Mono |

**Display is lighter than H1, and the wordmark is heavier than both.** Weight reads against size, so the ladder is not monotonic: display only ever runs at 72px and up, where 800 set the line solid, while H1 runs at 42px, where 700 is what separates it from H2. Display went 800 to 600 on 2026-08-05, after the swap shipped and the rendered headline read too heavy. The wordmark stayed at 800 and took its own `--kk-fw-wordmark` token upstream, since the two roles had only ever *happened* to share a number: a mark is drawn once at a fixed size, so the size argument does not reach it.

Two consequences worth stating plainly. Headings stop using `font-variation-settings` and go back to plain `font-weight` plus letter-spacing, which retires the whole `opsz` argument that used to sit in `SPEC.md` § Design system. And the mono role drops a webfont for the system stack, so `.kk-label` and `.kk-num` render differently on every OS.

The wordmark loses its italic. That italic was carrying most of the "editorial" character, and T1 is honest that the brand ends up reading product-first rather than magazine-ish. That is the trade that was accepted.

## What T1 does not change

- **The palette.** All twelve tokens keep their values and roles. Cobalt `#1A2F6B` stays primary, saffron `#E8A04A` stays the accent, linen and sand and dune stay the surfaces, and the three contrast tokens are untouched.
- **Geometry.** Radius `0` on cards and buttons. `--kk-radius-app` at 22.5% stays, and only for the app icon.
- **Motion.** `cubic-bezier(.2,.6,.2,1)`, 120ms and 200ms.
- **The icons.** `Karirkalyan Type Directions.html` makes the right call here: a logo can keep its own typeface, because the mark is drawn once and never reflows, so the readability problem that motivates T1 does not apply to it. The Fraunces `kk` glyph and the saffron growth-tick stay. **No icon needs regenerating for T1.**

## Shipping T1

**T1 ships in `web/`, and it broke the freeze to get there.** `TODO.md` § The rule closes `v1` to anything that does not make the app work correctly or stop it being abused, and this is the second named exception, after dashboard pins. It is recorded there rather than argued into passing the admission test. The honest reading: the 20px card titles *are* a legibility defect, so part of this is correctness, but replacing three typefaces across the whole system is more than that fix needed. It was done because the author asked for it with the trade in front of him.

What moved:

- `web/app/globals.css`. `--font-serif` is gone entirely, so a `font-serif` utility no longer resolves to anything branded; the three call sites that used it (the dashboard list, the upcoming card, the board card) dropped it, and those are exactly the 20px titles that motivated the move. `h1` and `h2, h3` split into two roles with their own weights and tracking, replacing one flat `font-variation-settings` rule. `.kk-wordmark` and `.kk-display` swap variation settings for `font-weight`. `.kk-label` and `.kk-num` are untouched: only `--font-mono` beneath them changed.
- The homepage hero's accent span lost its `italic`, leaving cobalt to mark it. The Japanese headline puts that accent on 有限ステートマシン, where the italic was only ever a synthesized oblique.
- `next/font/google` in `web/app/[locale]/layout.tsx` and `web/app/global-not-found.tsx`: three families collapse to one variable build, which also ends the variable-versus-static reasoning that `SPEC.md` used to carry.
- `.hsp-system` drops its `--font-serif` line. It still overrides `--font-sans` and folds mono onto it, which is all that scope ever needed.
- `SPEC.md` § Design system and § Public pages, in the same PR as the code, per the spec-first rule.

Two predictions this file made about the work turned out wrong, and are corrected rather than quietly dropped:

- **The `:lang(ja)` exclusion list did not change.** `.kk-label` and `.kk-display` still set their own tracking and are still the right exclusions; only the comment naming the old serif had to move. The rule matters slightly more now, since T1 tightens the heading roles past the flat `-0.02em` it replaced.
- **"One `woff2` instead of five" is true only per `@font-face` declaration.** A clean build emits four files for the one family, because `subsets: ["latin"]` governs preloading rather than emission and Next writes every `unicode-range` slice Google declares. One slice is preloaded and fetched; the rest are dead weight on disk. `SPEC.md` § Design system states this so nobody re-derives it from a file count.

## Upstream status and open gaps

**Closed in v1.2.** The brand book used to be missing five things that ship in `web/`. All are now upstream:

- `icon-maskable-512.png`, `icon-monochrome-512.png` and `icon-monogram-96.png`, each with a "Platform variants" card explaining what it is for. The monochrome file verifies as 512×512 RGBA with a real alpha channel, which is what `purpose: monochrome` requires.
- `--kk-saffron-ink`, `--kk-danger` and `--kk-rule-strong`, carried into `tokens.css`, `tokens.json`, the README and the palette grid, each with its contrast measurement and an "Accessibility, do not remove" note. Dune is now labeled decorative-only everywhere.

The palette is 12 tokens. `--kk-rule-strong` had never had a brand-book home at all, so this is the first time the shipped palette and the brand book agree.

**The type scale is now single-sourced.** It used to be carried in three files that disagreed three ways: `tokens.css` mapped `h1` onto the display cut and shifted every other heading down a level, `tokens.json` had a single vague `letterSpacing.heading` of `-0.02em`, and only the README's role table was right. All three now express the same four roles, and the numbers are tokens (`--kk-fw-*`, `--kk-ls-*`) that the CSS rules read rather than repeat, so a weight cannot be edited in one place and silently ignored in another.

The load-bearing part: **display is a class (`.kk-display`), not an element.** An `<h1>` takes the H1 role. Collapsing the two is what left `--kk-fw-h1` defined but unused. `h3` shares `h2`'s cut, because the scale has two heading steps and a third that nothing specifies is a third that drifts. This matches what `web/app/globals.css` already does with its own `.kk-display`.

**The labelling gaps are closed.** The README file tree no longer calls `icon-primary-512.png` "maskable / Android", its example manifest puts `icon-monogram-96.png` under `shortcuts` where the real manifest has it, and `Brand Assets.html` counts five brand variants plus three platform variants against the eight its header claims.

Two things changed beyond the four gaps, both consequences of them. `Brand Assets.html` gained a Type scale section rendering the four roles with live samples, since a brand book that documents a scale ought to show it, and its own `<style>` now reads the scale tokens instead of carrying a fourth tracking value (`-0.028em`) of its own. Every file also came back free of em-dashes, per the standing writing rule.

**The new icons are upstream only.** `web/public/brand/` still holds the originals, and copying is a deliberate step, not a sync. The maskable art was redrawn (the brand book now cites a max ink radius of 180px where `SPEC.md` § Installable app measured 182.6px on the old file), so if the new file replaces the shipped one, that section's bounding-box numbers have to be re-measured rather than assumed.

## Sync rule

The brand book is upstream and `web/app/globals.css` is a hand-kept mirror. Nothing imports one from the other at build time, so the mirror only holds if it is maintained deliberately:

1. Change the token in the design project first.
2. Mirror it into `globals.css`, renaming `--kk-<token>` to `--color-<token>` so Tailwind v4's `@theme inline` turns it into a utility.
3. Update `SPEC.md` § Design system in the same PR as the code, per `CLAUDE.md`'s spec-first rule.

Icons are copied, not linked: the design project holds the originals, and `web/public/brand/icons/` holds the deployed copies served at `/brand/…`. A change to an icon has to be pushed to both.
