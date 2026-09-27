import { redirect } from "next/navigation";
import { ShopServerView } from "@/components/shop-server-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ShopServerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "shop.view")) redirect("/");
  const { id } = await params;
  return <ShopServerView serverId={id} canManage={can(user, "shop.manage")} />;
}
