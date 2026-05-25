import { apiProxy } from "@/app/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return apiProxy(`/applications/${id}/resume`);
}
