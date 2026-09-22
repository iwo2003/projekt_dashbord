import { redirect } from "next/navigation";
import { MailView } from "@/components/mail-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "mail.view")) redirect("/");
  return <MailView canManage={can(user, "mail.manage")} />;
}
