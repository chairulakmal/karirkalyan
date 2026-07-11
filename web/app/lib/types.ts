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

// The stages where silence means something, because the next move is the
// company's. Mirrors GhostRiskQuery::RISK_STAGES — a threshold is only ever
// keyed on one of these.
export type RiskStage = "applied" | "phone_screen";

// One application that has gone quiet for longer than the user's own p90
// response time for the stage it is sitting in. `lock_version` rides along so
// the card can offer the `ghosted` transition without re-fetching the record.
export type GhostRiskEntry = {
  id: number;
  company: string;
  role: string;
  status: RiskStage;
  lock_version: number;
  days_in_stage: number;
  threshold: number;
};

export type GhostRisk = {
  thresholds: Record<RiskStage, number>;
  // Whether each threshold is the user's own p90 or the global fallback. The UI
  // says which, rather than passing off a default as a personal statistic.
  basis: Record<RiskStage, "personal" | "default">;
  sample_sizes: Record<RiskStage, number>;
  // Longest silence first.
  at_risk: GhostRiskEntry[];
};

export type DashboardStats = {
  by_status: Partial<Record<Status, number>>;
  // [company, board-host] for every application — drives the interdependent
  // company/board dropdowns. Board host is "(none)" for applications with no link.
  facets: [string, string][];
  total: number;
  avg_days_to_offer: number | null;
  ghost_risk: GhostRisk;
  // Folded in from GET /me, which the dashboard used to fetch separately.
  user: User;
};
