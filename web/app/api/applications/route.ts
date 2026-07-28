import { type NextRequest } from "next/server";
import { apiFetch } from "@/app/lib/api";
import { pickListParams } from "@/app/lib/list-params";
import type { Application, Paginated } from "@/app/lib/types";

/**
 * The client list's pagination and filtering seam. It exists so the browser
 * never holds the JWT: the session cookie is httpOnly, so only server code can
 * attach it (SPEC.md § Auth flow).
 *
 * The param allowlist is deliberately NOT written out here. app/lib/list-params.ts
 * owns it, and its comment records what re-enumerating it by hand cost.
 */
export async function GET(request: NextRequest) {
  const qs = pickListParams(request.nextUrl.searchParams);

  const result = await apiFetch<Paginated<Application>>(`/applications?${qs}`);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data);
}
