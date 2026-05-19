import { redirect } from "next/navigation";

import { AdminAwardsPage } from "@/components/awards-portal";
import { getPortalData } from "@/lib/awards/repository";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasClerkConfig } from "@/lib/auth/clerk-config";

export default async function AdminPage() {
  const [model, currentUser] = await Promise.all([
    getPortalData(),
    getCurrentUser(),
  ]);

  if (!currentUser) {
    if (hasClerkConfig()) redirect("/sign-in");
    redirect("/");
  }

  if (currentUser.role !== "admin") redirect("/member?access=admin");

  return <AdminAwardsPage currentUser={currentUser} model={model} />;
}
