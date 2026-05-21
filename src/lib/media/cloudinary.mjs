import { createHash } from "node:crypto";

export function buildCloudinaryMemberPhotoParams({ memberId, timestamp }) {
  return {
    folder: "op-awards/members",
    overwrite: true,
    public_id: `member_${memberId}`,
    tags: "op-awards,member-photo",
    timestamp,
  };
}

export function signCloudinaryParams(params, apiSecret) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}
