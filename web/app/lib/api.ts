import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const SESSION_COOKIE = "session";

export type ApiResult<T> =
  | { ok: true; status: number; data: T; authHeader: string | null }
  | { ok: false; status: number; error: string };

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
  const message = extractError(body) ?? `HTTP ${response.status}`;
  return { ok: false, status: response.status, error: message };
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

function extractError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.error === "string") return obj.error;
  if (Array.isArray(obj.errors) && obj.errors.every((m) => typeof m === "string")) {
    return (obj.errors as string[]).join(", ");
  }
  return null;
}
