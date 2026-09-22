import { redirect } from "next/navigation";
import { SetupForm } from "@/components/auth-forms";
import { hasUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (hasUsers()) redirect("/login");
  return <SetupForm />;
}
