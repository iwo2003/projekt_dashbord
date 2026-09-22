import { redirect } from "next/navigation";
import { ServerList } from "@/components/server-list";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "servers.view")) redirect("/");
  return <ServerList user={user} />;
}
