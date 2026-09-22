import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { logEvent } from "@/lib/db";
import { createSite, sitesOverview } from "@/lib/sites";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const auth = await guard("sites.view");
  if (auth.error) return auth.error;
  return NextResponse.json(await sitesOverview());
}

export async function POST(request: Request) {
  const auth = await guard("sites.manage");
  if (auth.error) return auth.error;
  const body = (await readJson(request)) as { name?: string; domain?: string; php?: boolean } | null;
  const created = await createSite(auth.user.id, body?.name ?? "", body?.domain ?? "", body?.php === true);
  if (!created.ok) {
    const status = created.error === "docker_offline" ? 503 : created.error === "site_failed" || created.error === "php_failed" ? 502 : 400;
    return apiError(created.error, status);
  }
  logEvent(auth.user, "site.create", { name: created.site.name, domain: created.site.domain });
  return NextResponse.json({ site: created.site });
}
