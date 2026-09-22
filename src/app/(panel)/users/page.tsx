import { redirect } from "next/navigation";
import { UsersView } from "@/components/users-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "users.view")) redirect("/");
  return <UsersView actor={user} />;
}
