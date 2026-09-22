import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { hasUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!hasUsers()) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Shell user={user}>{children}</Shell>;
}
