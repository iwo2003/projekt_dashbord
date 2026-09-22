import { guard } from "@/lib/api";
import { dockerPing } from "@/lib/docker";
import { hostAddress } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET() {
  const auth = await guard();
  if (auth.error) return auth.error;
  const ping = await dockerPing();
  return Response.json({ ok: ping.ok, host: hostAddress() });
}
