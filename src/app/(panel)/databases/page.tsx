import { redirect } from "next/navigation";
import { DatabasesView } from "@/components/databases-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function DatabasesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "databases.view")) redirect("/");
  return <DatabasesView canManage={can(user, "databases.manage")} />;
}
