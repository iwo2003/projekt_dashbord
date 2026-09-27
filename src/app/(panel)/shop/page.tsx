import { redirect } from "next/navigation";
import { ShopView } from "@/components/shop-view";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "shop.view")) redirect("/");
  return <ShopView canManage={can(user, "shop.manage")} />;
}
