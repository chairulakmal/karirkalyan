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

// The Japan-market taxonomies (v1.8.0). Fixed vocabularies mirroring
// Application::CHANNELS / JAPANESE_LEVELS per this file's header rule, not
// FSM sets, which are fetched from /transitions and never mirrored.
export type Channel = "direct" | "agent" | "referral";
export const CHANNELS: readonly Channel[] = ["direct", "agent", "referral"];

export type JapaneseLevel = "none" | "conversational" | "business" | "n2" | "n1";
export const JAPANESE_LEVELS: readonly JapaneseLevel[] = [
  "none",
  "conversational",
  "business",
  "n2",
  "n1",
];

// The visa item's per-application half (v1.9.0). `sponsorship` defaults to
// "unknown" server-side: unknown is decision-relevant signal, not absence, so
// the select preselects it and offers no blank option. `status_of_residence`
// is null-means-unrecorded like japanese_level and only meaningful when
// sponsorship is "available". Mirrors Application::SPONSORSHIP /
// STATUSES_OF_RESIDENCE per this file's header rule.
export type Sponsorship = "unknown" | "available" | "unavailable";
export const SPONSORSHIPS: readonly Sponsorship[] = ["unknown", "available", "unavailable"];

export type StatusOfResidence = "engineer_specialist" | "highly_skilled" | "other";
export const STATUSES_OF_RESIDENCE: readonly StatusOfResidence[] = [
  "engineer_specialist",
  "highly_skilled",
  "other",
];

// How a Japan-resident hire is actually employed (v1.9.0), the remote-work
// analogue of the visa question. Four values, null-means-unrecorded like
// japanese_level; extracted at prefill since remote postings state their model.
// Mirrors Application::HIRING_ENTITIES per this file's header rule.
export type HiringEntity = "own_entity" | "eor" | "contractor" | "unsupported";
export const HIRING_ENTITIES: readonly HiringEntity[] = [
  "own_entity",
  "eor",
  "contractor",
  "unsupported",
];

// The company's home timezone (v1.9.0), a curated set of IANA identifiers for
// the markets a Tokyo-based engineer targets. Mirrors Application::COMPANY_TIMEZONES.
// Order is roughly west-to-east so the select reads geographically.
export type CompanyTimezone =
  | "America/Los_Angeles"
  | "America/Denver"
  | "America/Chicago"
  | "America/New_York"
  | "America/Sao_Paulo"
  | "Europe/London"
  | "Europe/Berlin"
  | "Asia/Kolkata"
  | "Asia/Singapore"
  | "Australia/Sydney"
  | "Asia/Tokyo";
export const COMPANY_TIMEZONES: readonly CompanyTimezone[] = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
  "Asia/Tokyo",
];

// IANA ids carry slashes, which next-intl would read as no special path but is
// safer not to feed a message-key lookup; the catalog is keyed by these slugs
// instead, and the components map the id through here.
export const TIMEZONE_LABEL_KEY: Record<CompanyTimezone, string> = {
  "America/Los_Angeles": "us_pacific",
  "America/Denver": "us_mountain",
  "America/Chicago": "us_central",
  "America/New_York": "us_eastern",
  "America/Sao_Paulo": "brazil",
  "Europe/London": "uk",
  "Europe/Berlin": "central_europe",
  "Asia/Kolkata": "india",
  "Asia/Singapore": "singapore",
  "Australia/Sydney": "australia",
  "Asia/Tokyo": "japan",
};

// Cursor-pagination envelope returned by the list endpoints.
export type PageMeta = { next_cursor: string | null; has_more: boolean };

export type Paginated<T> = {
  data: T[];
  meta: PageMeta;
};

// The user's own status of residence (the visa item's global half, v1.9.0). A
// broader set than a role's StatusOfResidence: it includes footings a posting
// never offers. Mirrors User::RESIDENCE_STATUSES.
export type ResidenceStatus =
  | "engineer_specialist"
  | "highly_skilled"
  | "permanent_resident"
  | "spouse_or_dependent"
  | "other";
export const RESIDENCE_STATUSES: readonly ResidenceStatus[] = [
  "engineer_specialist",
  "highly_skilled",
  "permanent_resident",
  "spouse_or_dependent",
  "other",
];

export type User = {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
  residence_status: ResidenceStatus | null;
  residence_expires_on: string | null;
};

// GET /me: the user plus the derived days-remaining read and the perishable
// immigration reference the settings page renders as guidance.
export type Profile = User & {
  residence_days_remaining: number | null;
  reference: {
    coe_lead_time_days: number;
    renewal_warning_days: number;
  };
};

// A WebAuthn passkey as GET /api/v1/passkeys serialises it — the settings
// list's four fields; external_id and public_key never leave the server.
export type Passkey = {
  id: number;
  nickname: string | null;
  created_at: string;
  last_used_at: string | null;
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
  channel: Channel | null;
  agency_id: number | null;
  japanese_level: JapaneseLevel | null;
  // The visa item's per-application half (v1.9.0). sponsorship defaults to
  // "unknown" server-side; status_of_residence is null when unrecorded.
  sponsorship: Sponsorship | null;
  status_of_residence: StatusOfResidence | null;
  hiring_entity: HiringEntity | null;
  // Timezone overlap (v1.9.0): the company's home zone and the daily overlap the
  // role demands. The "survivable from JST?" read derives from these, never stored.
  company_timezone: CompanyTimezone | null;
  overlap_hours_required: number | null;
  // The upcoming interview instant (v1.9.0): source for the .ics export and the
  // antisocial-JST-hour flag. UTC ISO string from the API.
  interview_at: string | null;
  // The 年収 structure: quoted range in yen, and the guaranteed vs
  // performance-tied months split. All null when unrecorded.
  comp_annual_min_yen: number | null;
  comp_annual_max_yen: number | null;
  comp_months_guaranteed: number | null;
  comp_months_variable: number | null;
  lock_version: number;
  created_at: string;
  updated_at: string;
  // Server-derived (v1.10.0). `source` is the job board key via JobBoard.from_url
  // ("(none)" sentinel for no URL); `days_in_stage` is how long the row has sat
  // where it is, anchored to the last stage change (never updated_at). Both ride
  // the index and show payloads; the board's triage cards read them.
  source: string;
  days_in_stage: number | null;
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
  // Merged by #show and only #show: the list never joins the agency, and the
  // snapshot is excluded from as_json so index rows stay lean.
  agency_name: string | null;
  posting_snapshot: string | null;
};

// GET /applications/ownership_check: open agency-ownership windows on a
// company. A warning surface only; nothing blocks.
export type OwnershipSubmission = {
  id: number;
  agency_name: string | null;
  submitted_at: string;
  window_ends_on: string;
};

export type OwnershipCheck = {
  window_months: number;
  submissions: OwnershipSubmission[];
};

// GET /transitions — the FSM read endpoint. `transitions` is the *effective*
// table (each state mapped through valid_next_states, archived-rule folded
// in), fetched so the board never mirrors ApplicationFSM::TRANSITIONS.
export type TransitionTable = {
  states: Status[];
  entry_states: Status[];
  terminal_states: Status[];
  // The stages still in play — where a pending follow-up is actionable and
  // chasing it can still change the outcome. Not derivable from the rest of
  // this payload: it drops `terminal_states` *and* rejected/ghosted/withdrawn,
  // which are non-terminal yet are nobody's turn. Only ApplicationFSM knows the
  // difference, so it is fetched rather than re-typed here.
  active_states: Status[];
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
  // [company, board-host, status, japanese_level] for every application (v1.10.0).
  // Drives every dropdown AND the stage-chip / Japanese-level counts, all
  // cross-narrowing disjunctively. Board host is "(none)" for no-link rows;
  // japanese_level is null when unrecorded.
  facets: [string, string, Status, JapaneseLevel | null][];
  total: number;
  avg_days_to_offer: number | null;
  // Stat cards (v1.10.0), all null until there is enough data. Percentages are
  // whole numbers; avg_days_in_stage is a fractional day count.
  response_rate: number | null;
  ghost_rate: number | null;
  avg_days_in_stage: number | null;
  ghost_risk: GhostRisk;
  // Folded in from GET /me, which the dashboard used to fetch separately.
  user: User;
};
