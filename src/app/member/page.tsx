import { redirect } from "next/navigation";

import { MemberAwardsPage } from "@/components/awards-portal";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPortalData } from "@/lib/awards/repository";
import { hasClerkConfig } from "@/lib/auth/clerk-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    if (hasClerkConfig()) redirect("/sign-in");
    redirect("/");
  }

  const model = await getPortalData({
    currentMemberId: currentUser.member.id,
    includeClerkRoster: true,
  });

  return <MemberAwardsPage currentUser={currentUser} model={model} />;
}
