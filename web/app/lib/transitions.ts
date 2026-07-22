import type { Status, TransitionTable } from "./types";

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
// fsm-allow: affordance judgement (which closing moves prompt), never a move gate.
export const CONFIRM_REQUIRED: ReadonlySet<Status> = new Set([
  "rejected",
  "accepted",
  "declined",
  "withdrawn",
  "archived",
]);

// Can this status re-open to `applied`? True for the closed states with an edge
// back (ghosted, rejected, withdrawn), and re-opening records a reason as the
// transition's note. Derived from the fetched table rather than a hardcoded set
// (the old REVIVAL_STATES), which is the affordance-from-an-FSM-fact the spec
// wanted folded away. `transitions[status].includes("applied")` alone is not
// enough: `draft` also has a forward edge to applied, so it is gated on the
// state being closed (not an active column), which leaves exactly the three
// revival states. Degrades to false when the table did not arrive (an empty
// active_states makes every state read as "not closed"), so the reason prompt
// is simply not offered rather than wrongly demanded.
export function canRevive(status: Status, table: TransitionTable): boolean {
  if (table.active_states.length === 0) return false;
  return (
    !table.active_states.includes(status) &&
    (table.transitions[status] ?? []).includes("applied")
  );
}

// Interview stages worth an optional note when you advance into them ("who you
// met, what they asked"), recorded as the transition's note the same way a
// revival reason is. Pure affordance judgement, like the sets above: the note
// is optional, so skipping it is a plain move. Offered on the detail page only,
// not the board's quick-move menu, which stays a one-gesture drag.
// fsm-allow: affordance judgement (which stages offer a note), never a move gate.
export const STAGE_NOTE_STATES: ReadonlySet<Status> = new Set([
  "phone_screen",
  "technical",
  "final_round",
  "offer",
]);
