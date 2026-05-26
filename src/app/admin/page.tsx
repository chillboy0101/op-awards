import { redirect } from "next/navigation";

import { AdminAwardsPage } from "@/components/awards-portal";
import { getPortalData } from "@/lib/awards/repository";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasClerkConfig } from "@/lib/auth/clerk-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    if (hasClerkConfig()) redirect("/sign-in");
    redirect("/");
  }

  if (currentUser.role !== "admin") redirect("/member?access=admin");

  const model = await getPortalData({ includeClerkRoster: true });

  return <AdminAwardsPage currentUser={currentUser} model={model} />;
}
