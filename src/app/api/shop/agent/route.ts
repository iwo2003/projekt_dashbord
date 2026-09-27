import { apiError, readJson } from "@/lib/api";
import { ackAgentJob, agentJobs } from "@/lib/shop";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const jobs = agentJobs(token);
  if (!jobs) return apiError("forbidden", 403);
  return Response.json(jobs);
}

export async function POST(request: Request) {
  const body = (await readJson(request)) as { token?: string; id?: string } | null;
  if (!body?.token || !body.id) return apiError("validation", 400);
  if (!ackAgentJob(body.token, body.id)) return apiError("not_found", 404);
  return Response.json({ ok: true });
}
