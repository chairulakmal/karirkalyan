# Brand

This is KarirKalyan's brand directive: where the brand book lives, which type direction has been chosen, and what still has to happen before that direction can ship. The one thing to take away: **the brand book is no longer in this repo, and the type direction recorded here is a decision, not the shipped state.** Below, in order: the source of truth and how to reach it, the T1 directive, what T1 leaves alone, the gap between the directive and `web/`, what the design project still owes, and the sync rule.

## Contents

- [Source of truth](#source-of-truth)
- [The directive: T1, Jakarta solo](#the-directive-t1-jakarta-solo)
- [What T1 does not change](#what-t1-does-not-change)
- [The gap between this file and the code](#the-gap-between-this-file-and-the-code)
- [Upstream status and open gaps](#upstream-status-and-open-gaps)
- [Sync rule](#sync-rule)

## Source of truth

The brand book is a Claude Design project: **[karirkalyan](https://claude.ai/design/p/6e70a98d-f3af-49c8-8d47-d53c68815376)** (`6e70a98d-f3af-49c8-8d47-d53c68815376`). Read it with the `DesignSync` tool; browser access is the same claude.ai login.

It is at **v1.2, August 2026**. The file that matters is `Karirkalyan Brand Assets.html`, which renders the icon set, the palette and the token block in one page. Behind it sit `brand-assets/tokens.css`, `brand-assets/tokens.json`, `brand-assets/README.md`, the five SVG icons and their PNG renders. Three exploration files also live there (`artboards.jsx`, `cobalt-artboards.jsx`, `design-canvas.jsx`) plus `Karirkalyan Type Directions.html`, which is where T1 came from.

The old local `design/` folder is gone. It was gitignored, so it was never part of the repo's history, and it had drifted: its `tokens.css` was at v1.1 while its own README still described v1.0. Nothing was lost in deleting it. Every icon it held is committed under `web/public/brand/`, every token it held is either in `globals.css` or listed below as owed, and every other file it held also exists in the design project.

Note that the project is `PROJECT_TYPE_PROJECT`, not `PROJECT_TYPE_DESIGN_SYSTEM`. That type is fixed at creation, so this project cannot become a `/design-sync` target. It is a read source. If two-way component sync is ever wanted, it needs a new project.

## The directive: T1, Jakarta solo

`Karirkalyan Type Directions.html` argues that the shipped type fails at text sizes: Fraunces at `opsz 144` and weight 300 italic forces display proportions into 20px card titles, where the joins go hairline and the italic `a` and `e` collapse. That critique is correct and it is the reason to move.

It offered three ways out and recommended T2 (Jakarta paired with Newsreader). **T1 is the chosen direction**: one variable family for everything, no serif. It is also what `brand-assets/tokens.css` already implements, so the design project and this file now agree.

| Role | T1 | Shipped today |
| --- | --- | --- |
| Wordmark | Plus Jakarta Sans, `karir` at 800 + `kalyan` at 300 cobalt, upright | Fraunces `opsz 144`, `kalyan` italic cobalt |
| Display | Plus Jakarta Sans 800, `-0.04em` | Fraunces `opsz 144` (`.kk-display`) |
| H1 | Plus Jakarta Sans 700, `-0.025em` | Fraunces `opsz 36`, weight 500 |
| H2 | Plus Jakarta Sans 600, `-0.018em` | Fraunces `opsz 36`, weight 500 |
| Body | Plus Jakarta Sans 400 | Manrope |
| Labels, mono | `ui-monospace` system stack | IBM Plex Mono |

Two consequences worth stating plainly. Headings stop using `font-variation-settings` and go back to plain `font-weight` plus letter-spacing, which retires the whole `opsz` argument in `SPEC.md` § Design system. And the mono role drops a webfont for the system stack, so `.kk-label` and `.kk-num` will render differently on every OS.

The wordmark loses its italic. That italic was carrying most of the "editorial" character, and T1 is honest that the brand ends up reading product-first rather than magazine-ish. That is the trade being accepted.

## What T1 does not change

- **The palette.** All nine hues keep their values and roles. Cobalt `#1A2F6B` stays primary, saffron `#E8A04A` stays the accent, linen and sand and dune stay the surfaces.
- **Geometry.** Radius `0` on cards and buttons. `--kk-radius-app` at 22.5% stays, and only for the app icon.
- **Motion.** `cubic-bezier(.2,.6,.2,1)`, 120ms and 200ms.
- **The icons.** `Karirkalyan Type Directions.html` makes the right call here: a logo can keep its own typeface, because the mark is drawn once and never reflows, so the readability problem that motivates T1 does not apply to it. The Fraunces `kk` glyph and the saffron growth-tick stay. **No icon needs regenerating for T1.**

## The gap between this file and the code

Nothing in `web/` has moved. The app still ships Fraunces, Manrope and IBM Plex Mono, and `SPEC.md` § Design system still describes that, correctly, because `SPEC.md` documents the system as it is. This file is the only place the Jakarta direction is recorded.

**Implementing T1 is `2.0.0` work.** A whole-system typeface swap adds no capability but is plainly not a bug fix either, and `CLAUDE.md`'s standing guardrail closes `v1` to anything that is not correctness or abuse prevention. There is a narrow counter-argument, that 20px Fraunces italic is a legibility defect and legibility is correctness, and it is worth taking seriously for the card titles specifically. It does not stretch to replacing three typefaces. If the card titles alone are hurting, fix those against the existing tokens and leave the system alone.

When T1 does ship, these are the places that move:

- `web/app/globals.css`: `--font-serif`, `.kk-wordmark`, `.kk-display`, `.kk-label`, `.kk-num`, the `h1, h2, h3` variation settings, and the `.hsp-system` scope that currently collapses serif and mono onto a system sans.
- The `:lang(ja)` letter-spacing reset. It exists because negative tracking is a Latin display device, and T1's `-0.04em` keeps that problem, so the rule stays and its exclusion list changes.
- `next/font/google` in `web/app/[locale]/layout.tsx` and `web/app/global-not-found.tsx`: three families collapse to one, which also ends the variable-versus-static reasoning currently in `SPEC.md`.
- `SPEC.md` § Design system and § i18n, in the same PR as the code, per the spec-first rule.

## Upstream status and open gaps

**Closed in v1.2.** The brand book used to be missing five things that ship in `web/`. All are now upstream:

- `icon-maskable-512.png`, `icon-monochrome-512.png` and `icon-monogram-96.png`, each with a "Platform variants" card explaining what it is for. The monochrome file verifies as 512×512 RGBA with a real alpha channel, which is what `purpose: monochrome` requires.
- `--kk-saffron-ink`, `--kk-danger` and `--kk-rule-strong`, carried into `tokens.css`, `tokens.json`, the README and the palette grid, each with its contrast measurement and an "Accessibility, do not remove" note. Dune is now labelled decorative-only everywhere.

The palette is 12 tokens. `--kk-rule-strong` had never had a brand-book home at all, so this is the first time the shipped palette and the brand book agree.

**Still open.** Four things, none blocking, all cheap to fix on the next upstream pass:

1. **`tokens.css` heading selectors are off by one against the role table.** The CSS sets `h1` to 800/`-0.04em`, `h2` to 700/`-0.025em`, `h3` to 600/`-0.018em`, but the README's role table and the `--kk-fw-*` tokens say display is 800, H1 is 700 and H2 is 600. So the CSS gives every `<h1>` the *display* treatment and shifts the rest down a level. The tracking disagrees too: `-0.025em` in the CSS against `-0.03em` in the table for the same role. The element rules also hardcode their weights instead of using `--kk-fw-display` and friends, which is how the two drifted apart. Implementing `tokens.css` literally would ship the wrong heading scale.
2. **The README file tree still labels `icon-primary-512.png` as "maskable / Android".** That is the old mislabel, and it now contradicts the README's own prose, `Brand Assets.html` (which correctly reads "512 · ANY"), and the separate maskable file sitting two lines below it.
3. **The README's example manifest puts `icon-monogram-96.png` in the `icons` array**, where the real `manifest.webmanifest` uses it for `shortcuts`, which is also what the README's own file tree says.
4. **`Brand Assets.html` still labels the icon grid "01 · five variants"** while its header meta now says "8 ICON VARIANTS".

**The new icons are upstream only.** `web/public/brand/` still holds the originals, and copying is a deliberate step, not a sync. The maskable art was redrawn (the brand book now cites a max ink radius of 180px where `SPEC.md` § Installable app measured 182.6px on the old file), so if the new file replaces the shipped one, that section's bounding-box numbers have to be re-measured rather than assumed.

## Sync rule

The brand book is upstream and `web/app/globals.css` is a hand-kept mirror. Nothing imports one from the other at build time, so the mirror only holds if it is maintained deliberately:

1. Change the token in the design project first.
2. Mirror it into `globals.css`, renaming `--kk-<token>` to `--color-<token>` so Tailwind v4's `@theme inline` turns it into a utility.
3. Update `SPEC.md` § Design system in the same PR as the code, per `CLAUDE.md`'s spec-first rule.

Icons are copied, not linked: the design project holds the originals, and `web/public/brand/icons/` holds the deployed copies served at `/brand/…`. A change to an icon has to be pushed to both.
