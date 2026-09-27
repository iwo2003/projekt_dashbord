import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Shell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { hasUsers } from "@/lib/db";
import { allShopHosts } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const host = (headerStore.get("x-forwarded-host") || headerStore.get("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (allShopHosts().includes(host)) redirect("/sklep");
  if (!hasUsers()) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Shell user={user}>{children}</Shell>;
}
