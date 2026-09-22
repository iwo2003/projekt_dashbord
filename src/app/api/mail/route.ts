import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { getMailDomain, getSetting, insertMailbox, listMailboxes, logEvent, mailboxTaken } from "@/lib/db";
import { hostAddress } from "@/lib/metrics";
import {
  MAIL_PORTS,
  configureMailDomain,
  createMailbox,
  dropMailbox,
  cloudflareZone,
  mailOverview,
  readDkim,
  validMailDomain,
} from "@/lib/mail";
import { mailboxCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

function failureStatus(error: string) {
  if (error === "docker_offline" || error === "mail_timeout") return 503;
  if (error === "port_taken" || error === "mail_taken" || error === "domain_locked") return 409;
  if (error === "validation" || error === "domain_required") return 400;
  return 502;
}

export async function GET() {
  const auth = await guard("mail.view");
  if (auth.error) return auth.error;
  const status = await mailOverview();
  const domain = getMailDomain();
  const host = hostAddress();
  const hostname = domain ? `mail.${domain}` : null;
  const dkim = domain ? await readDkim(domain) : null;
  return NextResponse.json({
    domain,
    mailboxes: listMailboxes(),
    host,
    hostname,
    ports: MAIL_PORTS,
    docker: status.docker,
    running: status.running,
    dns: domain
      ? {
          a: `${hostname} A ${host}`,
          mx: `${domain} MX 10 ${hostname}`,
          spf: `${domain} TXT v=spf1 mx a:${hostname} ~all`,
          dmarc: `_dmarc.${domain} TXT v=DMARC1; p=none; rua=mailto:postmaster@${domain}`,
          dkim: dkim ? `mail._domainkey.${domain} TXT ${dkim}` : null,
          zone: cloudflareZone(domain, host, dkim, getSetting("panel_host")),
        }
      : null,
  });
}

export async function POST(request: Request) {
  const auth = await guard("mail.manage");
  if (auth.error) return auth.error;
  const parsed = mailboxCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const domain = getMailDomain();
  if (!domain || !validMailDomain(domain)) return apiError("domain_required", 400);
  const local = parsed.data.local;
  if (mailboxTaken(local)) return apiError("mail_taken", 409);
  const created = await createMailbox(local, parsed.data.password);
  if (!created.ok) return apiError(created.error, failureStatus(created.error));
  const mailbox = {
    id: randomUUID(),
    localPart: local,
    address: created.address,
    password: parsed.data.password,
    createdBy: auth.user.username,
    createdAt: Date.now(),
  };
  try {
    insertMailbox(mailbox);
  } catch {
    await dropMailbox(mailbox.address);
    return apiError("mail_taken", 409);
  }
  logEvent(auth.user, "mail.create", { address: mailbox.address });
  return NextResponse.json({ mailbox });
}

export async function PUT(request: Request) {
  const auth = await guard("mail.manage");
  if (auth.error) return auth.error;
  const body = (await readJson(request)) as { domain?: unknown } | null;
  const domain = typeof body?.domain === "string" ? body.domain.trim().toLowerCase() : "";
  if (!validMailDomain(domain)) return apiError("validation", 400);
  const saved = await configureMailDomain(domain);
  if (!saved.ok) return apiError(saved.error, failureStatus(saved.error));
  logEvent(auth.user, "mail.domain", { domain });
  return NextResponse.json({ domain });
}
