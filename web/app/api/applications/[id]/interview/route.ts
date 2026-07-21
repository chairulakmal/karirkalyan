import { apiProxy } from "@/app/lib/api";

// The interview .ics download, proxied to Rails so the JWT stays server-side,
// the same shape as the resume/cover-letter downloads. Rails sets the
// text/calendar type and the attachment filename; apiProxy passes both through.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return apiProxy(`/applications/${id}/interview`);
}
