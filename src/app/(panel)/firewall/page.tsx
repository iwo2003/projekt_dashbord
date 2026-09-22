import { redirect } from "next/navigation";
import { FirewallView } from "@/components/firewall-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function FirewallPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "firewall.view")) redirect("/");
  return <FirewallView canManage={can(user, "firewall.manage")} />;
}
