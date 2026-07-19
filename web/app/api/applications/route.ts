import { type NextRequest } from "next/server";
import { apiFetch } from "@/app/lib/api";
import type { Application, Paginated } from "@/app/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const after = searchParams.get("after");
  const limit = searchParams.get("limit") ?? "10";

  const status = searchParams.get("status");
  const company = searchParams.get("company");
  const source = searchParams.get("source");
  const japaneseLevel = searchParams.get("japanese_level");

  const qs = new URLSearchParams({ limit });
  if (after) qs.set("after", after);
  if (status) qs.set("status", status);
  if (company) qs.set("company", company);
  if (source) qs.set("source", source);
  if (japaneseLevel) qs.set("japanese_level", japaneseLevel);

  const result = await apiFetch<Paginated<Application>>(`/applications?${qs}`);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data);
}
