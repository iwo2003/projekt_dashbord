import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { listServers, logEvent } from "@/lib/db";
import {
  FIREWALL_SERVICES,
  allowPort,
  closePort,
  disableFirewall,
  enableFirewall,
  firewallSnapshot,
  lockedPorts,
  parsePortSpec,
  ruleOpen,
  type FirewallProto,
  type PortRule,
} from "@/lib/firewall";
import { firewallActionSchema } from "@/lib/schemas";
import type { ServerRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function serverRules(server: ServerRecord): PortRule[] {
  if (server.game === "minecraft") return [{ port: String(server.port), proto: "tcp" }];
  const rules: PortRule[] = [
    { port: String(server.port), proto: "tcp" },
    { port: String(server.port), proto: "udp" },
  ];
  if (server.extraPort && server.game === "fs25") rules.push({ port: String(server.extraPort), proto: "tcp" });
  else if (server.extraPort) rules.push({ port: String(server.extraPort), proto: "udp" });
  return rules;
}

function knownSpecs(servers: ServerRecord[]) {
  const specs = new Set<string>();
  for (const rule of lockedPorts()) specs.add(`${rule.port}/${rule.proto}`);
  for (const service of FIREWALL_SERVICES) {
    for (const rule of service.rules) specs.add(`${rule.port}/${rule.proto}`);
  }
  for (const server of servers) {
    for (const rule of serverRules(server)) specs.add(`${rule.port}/${rule.proto}`);
  }
  return specs;
}

function failureStatus(error: string) {
  if (error === "firewall_unavailable" || error === "firewall_denied") return 503;
  if (error === "firewall_protected") return 409;
  if (error === "validation") return 400;
  return 502;
}

export async function GET() {
  const auth = await guard("firewall.view");
  if (auth.error) return auth.error;
  try {
    const status = await firewallSnapshot();
    const servers = listServers();
    const known = knownSpecs(servers);
    return NextResponse.json({
      available: status.available,
      active: status.active,
      locked: lockedPorts(),
      services: FIREWALL_SERVICES.map((service) => ({
        id: service.id,
        rules: service.rules,
        open: service.rules.every((rule) => ruleOpen(status.rules, rule.port, rule.proto)),
      })),
      servers: servers.map((server) => {
        const rules = serverRules(server);
        return {
          id: server.id,
          name: server.name,
          game: server.game,
          rules,
          open: rules.every((rule) => ruleOpen(status.rules, rule.port, rule.proto)),
        };
      }),
      extra: status.rules
        .filter((rule) => rule.action === "ALLOW" && !known.has(rule.spec))
        .map((rule) => {
          const match = /^(\d{1,5}(?::\d{1,5})?)\/(tcp|udp)$/.exec(rule.spec);
          if (!match) return null;
          return { port: match[1], proto: match[2] as FirewallProto };
        })
        .filter((rule) => rule !== null),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "firewall_failed";
    return apiError(code, failureStatus(code));
  }
}

async function changeRules(rules: readonly PortRule[], open: boolean) {
  for (const rule of rules) {
    const result = open ? await allowPort(rule.port, rule.proto) : await closePort(rule.port, rule.proto);
    if (!result.ok) return result;
  }
  return { ok: true as const };
}

export async function POST(request: Request) {
  const auth = await guard("firewall.manage");
  if (auth.error) return auth.error;
  const parsed = firewallActionSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const body = parsed.data;
  try {
    if (body.action === "enable") {
      await enableFirewall();
      logEvent(auth.user, "firewall.enable", {});
      return NextResponse.json({ ok: true });
    }
    if (body.action === "disable") {
      await disableFirewall();
      logEvent(auth.user, "firewall.disable", {});
      return NextResponse.json({ ok: true });
    }
    if (body.action === "service") {
      const service = FIREWALL_SERVICES.find((item) => item.id === body.id);
      if (!service) return apiError("validation", 400);
      const result = await changeRules(service.rules, body.open);
      if (!result.ok) return apiError(result.error, failureStatus(result.error));
      logEvent(auth.user, body.open ? "firewall.allow" : "firewall.close", { target: body.id });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "server") {
      const server = listServers().find((item) => item.id === body.id);
      if (!server) return apiError("not_found", 404);
      const result = await changeRules(serverRules(server), body.open);
      if (!result.ok) return apiError(result.error, failureStatus(result.error));
      logEvent(auth.user, body.open ? "firewall.allow" : "firewall.close", { server: server.name });
      return NextResponse.json({ ok: true });
    }
    if (!parsePortSpec(body.port, body.proto)) return apiError("validation", 400);
    const result = body.action === "allow" ? await allowPort(body.port, body.proto) : await closePort(body.port, body.proto);
    if (!result.ok) return apiError(result.error, failureStatus(result.error));
    logEvent(auth.user, body.action === "allow" ? "firewall.allow" : "firewall.close", {
      port: body.port,
      proto: body.proto,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "firewall_failed";
    return apiError(code, failureStatus(code));
  }
}
