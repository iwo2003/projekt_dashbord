import { NextResponse } from "next/server";
import { alertSettings, saveAlertSettings } from "@/lib/alerts";
import { apiError, guard, readJson } from "@/lib/api";
import { accessOverview, disableHttps, enableHttps, httpsRunning, httpsStatus, savePanelHost } from "@/lib/https";
import { attachPanelSite, detachPanelSite } from "@/lib/panel-site";
import { logEvent } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const auth = await guard("panel.manage");
  if (auth.error) return auth.error;
  const https = httpsStatus();
  return NextResponse.json({
    ...alertSettings(),
    ...accessOverview(),
    httpsDomain: https.domain,
    httpsRunning: https.domain ? await httpsRunning() : false,
  });
}

export async function PUT(request: Request) {
  const auth = await guard("panel.manage");
  if (auth.error) return auth.error;
  const body = (await readJson(request)) as {
    discordWebhook?: string;
    telegramToken?: string;
    telegramChat?: string;
    clearDiscord?: boolean;
    clearTelegram?: boolean;
    panelHost?: string;
    attach?: boolean;
  } | null;
  if (typeof body?.panelHost === "string" && body.attach) {
    const started = await attachPanelSite(body.panelHost);
    if (!started.ok) {
      const status =
        started.error === "docker_offline" || started.error === "https_unavailable"
          ? 503
          : started.error === "https_failed" || started.error === "site_failed"
            ? 502
            : started.error === "site_denied"
              ? 403
              : 400;
      return apiError(started.error, status);
    }
    logEvent(auth.user, "panel.attach", { host: started.host, via: started.attached });
    return NextResponse.json({ ...accessOverview(), ...started });
  }
  if (typeof body?.panelHost === "string") {
    try {
      const savedHost = savePanelHost(body.panelHost);
      if (!savedHost.ok) return apiError(savedHost.error, 400);
      if (!savedHost.host) await detachPanelSite();
      logEvent(auth.user, "panel.access", { host: savedHost.host });
      return NextResponse.json({ ...accessOverview(), host: savedHost.host });
    } catch {
      return apiError("request_failed", 500);
    }
  }
  const saved = saveAlertSettings({
    discordWebhook: body?.discordWebhook,
    telegramToken: body?.telegramToken,
    telegramChat: body?.telegramChat,
    clearDiscord: body?.clearDiscord,
    clearTelegram: body?.clearTelegram,
  });
  if (!saved.ok) return apiError(saved.error, 400);
  logEvent(auth.user, "panel.alerts", {});
  return NextResponse.json(alertSettings());
}

export async function POST(request: Request) {
  const auth = await guard("panel.manage");
  if (auth.error) return auth.error;
  const body = (await readJson(request)) as { domain?: string } | null;
  const domain = body?.domain?.trim().toLowerCase() ?? "";
  const started = await enableHttps(domain);
  if (!started.ok) {
    const status = started.error === "docker_offline" || started.error === "https_unavailable" ? 503 : started.error === "https_failed" ? 502 : 400;
    return apiError(started.error, status);
  }
  logEvent(auth.user, "panel.https_on", { domain });
  return NextResponse.json({ domain, httpsRunning: true });
}

export async function DELETE() {
  const auth = await guard("panel.manage");
  if (auth.error) return auth.error;
  await disableHttps();
  logEvent(auth.user, "panel.https_off", {});
  return NextResponse.json({ ok: true });
}
