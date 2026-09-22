import { redirect } from "next/navigation";
import { SitesView } from "@/components/sites-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "sites.view")) redirect("/");
  return <SitesView canManage={can(user, "sites.manage")} />;
}
