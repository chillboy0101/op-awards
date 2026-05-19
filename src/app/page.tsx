import { PublicAwardsPage } from "@/components/awards-portal";
import { getPortalData } from "@/lib/awards/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const model = await getPortalData();

  return <PublicAwardsPage model={model} />;
}
