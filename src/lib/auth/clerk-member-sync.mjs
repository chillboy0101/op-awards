import { normalizeStaffType } from "../awards/workflow.mjs";

/**
 * @param {{
 *   existing?: { awardsEligible?: boolean } | null;
 *   profile: {
 *     clerkUserId: string;
 *     email: string;
 *     name: string;
 *     photoUrl: string | null;
 *     staffType?: string;
 *   };
 * }} input
 * @returns {{
 *   awardsEligible: boolean;
 *   clerkUserId: string;
 *   email: string;
 *   name: string;
 *   photoUrl: string | null;
 *   staffType: "main" | "monitoring_only" | "nss";
 *   status: "active";
 * }}
 */
export function buildClerkMemberValues({ existing, profile }) {
  return {
    awardsEligible: existing?.awardsEligible ?? true,
    clerkUserId: profile.clerkUserId,
    email: profile.email,
    name: profile.name,
    photoUrl: profile.photoUrl,
    staffType: normalizeStaffType(profile.staffType),
    status: "active",
  };
}
