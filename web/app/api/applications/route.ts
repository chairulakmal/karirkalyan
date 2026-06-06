import { type NextRequest } from "next/server";
import { apiFetch } from "@/app/lib/api";
import type { Application } from "@/app/lib/types";

type PagedResponse = {
  data: Application[];
  meta: { next_cursor: string | null; has_more: boolean };
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const after = searchParams.get("after");
  const limit = searchParams.get("limit") ?? "10";

  const status = searchParams.get("status");
  const company = searchParams.get("company");
  const source = searchParams.get("source");

  const qs = new URLSearchParams({ limit });
  if (after) qs.set("after", after);
  if (status) qs.set("status", status);
  if (company) qs.set("company", company);
  if (source) qs.set("source", source);

  const result = await apiFetch<PagedResponse>(`/applications?${qs}`);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data);
}
