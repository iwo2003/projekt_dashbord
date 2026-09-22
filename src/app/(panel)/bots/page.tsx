import { redirect } from "next/navigation";
import { BotsView } from "@/components/bots-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "bots.view")) redirect("/");
  return <BotsView canManage={can(user, "bots.manage")} />;
}
