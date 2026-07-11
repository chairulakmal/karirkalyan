import type { Status } from "./types";
import { PERMANENT_STATUSES } from "./format";

/*
 * Interaction semantics for status transitions, shared by the two surfaces
 * that perform them — the detail page's transition buttons and the board's
 * card menu — so the confirm/revival behaviour cannot drift between them.
 *
 * These sets classify *targets and sources* of a move; the transitions
 * themselves come from the API (`GET /transitions`) or the record's
 * `valid_next_states`. Nothing here mirrors the FSM's transition table.
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

// The UI's name for the terminal set: entering one of these is irreversible.
export const HARD_TERMINAL: ReadonlySet<Status> = PERMANENT_STATUSES;
