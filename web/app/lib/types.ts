// Mirrors the Rails API JSON shapes.
// Keep in sync with app/models/* and ApplicationFSM in api/.

export type Status =
  | "wishlist"
  | "draft"
  | "applied"
  | "phone_screen"
  | "technical"
  | "final_round"
  | "offer"
  | "accepted"
  | "rejected"
  | "ghosted"
  | "declined"
  | "withdrawn"
  | "archived";

// Cursor-pagination envelope returned by the list endpoints.
export type PageMeta = { next_cursor: string | null; has_more: boolean };

export type Paginated<T> = {
  data: T[];
  meta: PageMeta;
};

export type User = {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
};

export type Application = {
  id: number;
  user_id: number;
  company: string;
  role: string;
  url: string | null;
  status: Status;
  follow_up_at: string | null;
  applied_at: string | null;
  notes: string | null;
  resume_updated_at: string | null;
  cover_letter_updated_at: string | null;
  lock_version: number;
  created_at: string;
  updated_at: string;
};

export type TimelineEntry = {
  id: number;
  application_id: number;
  actor_id: number;
  from_status: Status;
  to_status: Status;
  note: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationWithDetail = Application & {
  valid_next_states: Status[];
  timeline_entries: TimelineEntry[];
};

// GET /transitions — the FSM read endpoint. `transitions` is the *effective*
// table (each state mapped through valid_next_states, archived-rule folded
// in), fetched so the board never mirrors ApplicationFSM::TRANSITIONS.
export type TransitionTable = {
  states: Status[];
  entry_states: Status[];
  terminal_states: Status[];
  transitions: Record<Status, Status[]>;
};

export type DashboardStats = {
  by_status: Partial<Record<Status, number>>;
  // [company, board-host] for every application — drives the interdependent
  // company/board dropdowns. Board host is "(none)" for applications with no link.
  facets: [string, string][];
  total: number;
  avg_days_to_offer: number | null;
};
