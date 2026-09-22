import { redirect } from "next/navigation";
import { CreateServer } from "@/components/create-server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewServerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "servers.create")) redirect("/servers");
  return <CreateServer />;
}
