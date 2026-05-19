import { PublicAwardsPage } from "@/components/awards-portal";
import { getPortalData } from "@/lib/awards/repository";

export default async function Home() {
  const model = await getPortalData();

  return <PublicAwardsPage model={model} />;
}
