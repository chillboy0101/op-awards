import { AwardsPortal } from "@/components/awards-portal";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPortalData } from "@/lib/awards/repository";

export default async function Home() {
  const [model, currentUser] = await Promise.all([getPortalData(), getCurrentUser()]);

  return <AwardsPortal currentUser={currentUser} model={model} />;
}
