import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", 401);
  return Response.json({ user });
}
