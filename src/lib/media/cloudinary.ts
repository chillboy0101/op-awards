import { createHash } from "node:crypto";

export function buildCloudinaryMemberPhotoParams({
  memberId,
  timestamp,
}: {
  memberId: string;
  timestamp: number;
}) {
  return {
    folder: "cpa-awards/members",
    overwrite: true,
    public_id: `member_${memberId}`,
    tags: "cpa-awards,member-photo",
    timestamp,
  };
}

export function signCloudinaryParams(
  params: Record<string, string | number | boolean | undefined | null>,
  apiSecret: string,
) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}
