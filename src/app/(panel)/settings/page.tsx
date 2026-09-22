import { redirect } from "next/navigation";
import { SettingsView } from "@/components/settings-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <SettingsView user={user} managePanel={can(user, "panel.manage")} />;
}
