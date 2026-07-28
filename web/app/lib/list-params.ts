/**
 * The query params `GET /api/v1/applications` understands, in one place.
 *
 * Three surfaces build this same query: the dashboard's first paint (an RSC
 * calling apiFetch directly), the client list's fetchPage, and the BFF route
 * handler at app/api/applications/route.ts that sits between them. The BFF used
 * to re-enumerate the params by hand, which made it a second, silent copy of
 * this contract: `q` shipped in v1.11.0, the handler was not updated, and every
 * typed search returned unfiltered results while the box, the URL and "Clear
 * filters" all claimed it had applied. Nothing caught it, because a hand-copied
 * allowlist is invisible to tsc, to rswag, and to the docs sweep.
 *
 * So the allowlist lives here and the BFF iterates it. Adding a param to the API
 * is now one edit in this file, not one edit plus a memory.
 *
 * Why an allowlist at all, rather than forwarding the querystring wholesale:
 * ListQuery ignores params it does not know, so passthrough would be *safe*, but
 * it would also let a browser reach filters the app's own UI never sends. Naming
 * them keeps the BFF's surface equal to the product's surface.
 */
export const LIST_PARAMS = [
  "after",
  "limit",
  "status",
  "company",
  "source",
  "japanese_level",
  "q",
] as const;

export type ListParam = (typeof LIST_PARAMS)[number];

/** How many rows a page holds when the caller does not say. */
export const LIST_DEFAULT_LIMIT = "10";

/**
 * Copies the params above out of `source`, dropping anything else and any empty
 * value (an empty `q` is "no search", not "search for nothing"). `limit` gets
 * the default when absent, matching what both callers already send.
 */
export function pickListParams(source: URLSearchParams): URLSearchParams {
  const qs = new URLSearchParams();
  for (const name of LIST_PARAMS) {
    const value = source.get(name);
    if (value) qs.set(name, value);
  }
  if (!qs.has("limit")) qs.set("limit", LIST_DEFAULT_LIMIT);
  return qs;
}
