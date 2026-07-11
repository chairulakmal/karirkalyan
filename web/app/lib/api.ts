import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const SESSION_COOKIE = "session";

// One entry of a `validation_failed` response: which field failed and the
// ActiveModel error type (`blank`, `taken`, `too_long`, `not_a_pdf`, …).
export type ApiErrorDetail = { field: string; code: string };

export type ApiFailure = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  details?: ApiErrorDetail[];
};

export type ApiResult<T> =
  | { ok: true; status: number; data: T; authHeader: string | null }
  | ApiFailure;

/**
 * Server-side fetch wrapper that attaches the JWT from the httpOnly session
 * cookie. JSON requests/responses by default; multipart bodies are detected
 * and passed through with the Content-Type unset so fetch can fill in the
 * boundary.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  const headers = new Headers(init.headers);
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", token);

  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  // Expired/revoked JWT. The cookie can only be cleared in a route handler or
  // server action (not during render), so bounce through /api/auth/expired,
  // which deletes it and lands on /sign-in.
  if (response.status === 401) {
    redirect("/api/auth/expired");
  }

  const authHeader = response.headers.get("Authorization");

  if (response.status === 204) {
    return { ok: true, status: 204, data: null as T, authHeader };
  }

  // Some endpoints return non-JSON (file downloads handled separately).
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    if (response.ok) {
      return { ok: true, status: response.status, data: null as T, authHeader };
    }
    return {
      ok: false,
      status: response.status,
      error: `HTTP ${response.status}`,
    };
  }

  const body = await response.json();
  if (response.ok) {
    return { ok: true, status: response.status, data: body as T, authHeader };
  }
  return { status: response.status, ...extractFailure(body) };
}

/**
 * Streams the upstream Response body straight back to the browser — used by
 * the file-download proxy routes (resume, cover letter) so the JWT never
 * leaves the server.
 */
export async function apiProxy(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const headers = new Headers();
  if (token) headers.set("Authorization", token);

  const upstream = await fetch(`${API_URL}/api/v1${path}`, {
    headers,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const passthrough = [
    "Content-Type",
    "Content-Disposition",
    "Content-Length",
    "X-Content-Type-Options",
  ];
  for (const name of passthrough) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const API_BASE = API_URL;

// Pulls the API's failure envelope — `{ error, code, details? }` — out of an
// error body, tolerating shapes that predate or fall outside the contract.
function extractFailure(body: unknown): Omit<ApiFailure, "status"> {
  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const error = typeof obj.error === "string" ? obj.error : "HTTP error";
  const code = typeof obj.code === "string" ? obj.code : undefined;
  const details = Array.isArray(obj.details)
    ? obj.details.filter(
        (d): d is ApiErrorDetail =>
          !!d &&
          typeof d === "object" &&
          typeof (d as ApiErrorDetail).field === "string" &&
          typeof (d as ApiErrorDetail).code === "string",
      )
    : undefined;
  return { ok: false, error, code, details };
}
