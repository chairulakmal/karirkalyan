// The API failure envelope's `details` entries, shared by both places that
// parse the wire format: `apiFetch` (server) and the sign-in form (client,
// which cannot import app/lib/api.ts because it pulls in `next/headers`).
// One validated shape, one guard — parsing the same format twice is how the
// two drift.

// One entry of a `validation_failed` response: which field failed and the
// ActiveModel error type (`blank`, `taken`, `too_long`, `not_a_pdf`, …).
export type ApiErrorDetail = { field: string; code: string };

export function isApiErrorDetail(d: unknown): d is ApiErrorDetail {
  return (
    !!d &&
    typeof d === "object" &&
    typeof (d as ApiErrorDetail).field === "string" &&
    typeof (d as ApiErrorDetail).code === "string"
  );
}
