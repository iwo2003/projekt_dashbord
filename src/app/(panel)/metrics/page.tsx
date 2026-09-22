import { redirect } from "next/navigation";
import { MetricsView } from "@/components/metrics-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "metrics.view")) redirect("/");
  return <MetricsView />;
}
