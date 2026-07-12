import { apiProxy } from "@/app/lib/api";

export async function GET() {
  return apiProxy("/exports/applications");
}
