import { guard } from "@/lib/api";
import { listEvents } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = await guard();
  if (auth.error) return auth.error;
  return Response.json({ events: listEvents(16) });
}
