import { apiError, guard } from "@/lib/api";
import { deleteMailboxRow, getMailbox, logEvent } from "@/lib/db";
import { dropMailbox } from "@/lib/mail";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await guard("mail.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const mailbox = getMailbox(id);
  if (!mailbox) return apiError("not_found", 404);
  const dropped = await dropMailbox(mailbox.address);
  if (!dropped.ok) {
    const status = dropped.error === "docker_offline" || dropped.error === "mail_timeout" ? 503 : 502;
    return apiError(dropped.error, status);
  }
  deleteMailboxRow(id);
  logEvent(auth.user, "mail.delete", { address: mailbox.address });
  return Response.json({ ok: true });
}
