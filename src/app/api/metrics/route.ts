import { guard } from "@/lib/api";
import { getMetrics } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET() {
  const auth = await guard("metrics.view");
  if (auth.error) return auth.error;
  return Response.json({ metrics: await getMetrics() });
}
