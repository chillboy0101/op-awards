import { redirect } from "next/navigation";

import { MemberAwardsPage } from "@/components/awards-portal";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPortalData } from "@/lib/awards/repository";
import { hasClerkConfig } from "@/lib/auth/clerk-config";

export default async function MemberPage() {
  const [model, currentUser] = await Promise.all([
    getPortalData({ includeClerkRoster: true }),
    getCurrentUser(),
  ]);

  if (!currentUser) {
    if (hasClerkConfig()) redirect("/sign-in");
    redirect("/");
  }

  return <MemberAwardsPage currentUser={currentUser} model={model} />;
}
