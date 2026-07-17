import type { Status } from "./types";

/*
 * Interaction semantics for status transitions, shared by the two surfaces
 * that perform them — the detail page's transition buttons and the board's
 * card menu — so the confirm/revival behaviour cannot drift between them.
 *
 * Both sets classify *targets and sources* of a move: which are worth a prompt,
 * and which offer a way back. That is UI judgement layered on the FSM rather
 * than a reading of it — no FSM fact would tell you that `ghosted` deserves no
 * confirm while `rejected` does.
 *
 * Neither set is authoritative: every move they dress up is validated
 * server-side, so the worst either can do is misjudge an affordance. Which
 * states are *terminal* is an FSM fact, so it comes from the fetched table's
 * `terminal_states` rather than a third set here.
 *
 * `CONFIRM_REQUIRED` is pure judgement. `REVIVAL_STATES` is not quite: it
 * encodes the knowledge that these three states have an edge back to `applied`,
 * which the fetched `transitions[status]` also answers — an affordance built on
 * an FSM fact rather than merely beside one. Stale, it would offer a revival the
 * server refuses, or hide one it allows. Deriving it from the fetched table is
 * the open question tracked in TODO.md.
 */

// Closed states whose entry is deliberate — the UI asks before moving here.
export const CONFIRM_REQUIRED: ReadonlySet<Status> = new Set([
  "rejected",
  "accepted",
  "declined",
  "withdrawn",
  "archived",
]);

// Closed states that can re-open to `applied`; doing so requires a reason,
// recorded as the transition's note.
export const REVIVAL_STATES: ReadonlySet<Status> = new Set([
  "ghosted",
  "rejected",
  "withdrawn",
]);
