import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";
import { hasUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!hasUsers()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  return <LoginForm />;
}
