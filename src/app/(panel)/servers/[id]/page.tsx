import { redirect } from "next/navigation";
import { ServerDetail } from "@/components/server-detail";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ServerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "servers.view")) redirect("/");
  const { id } = await params;
  return <ServerDetail id={id} user={user} />;
}
