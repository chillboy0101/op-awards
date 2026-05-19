import { cookies } from "next/headers";
import { auth, clerkClient, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";

import {
  getCurrentUserFromToken,
  SESSION_COOKIE,
  type CurrentUser,
} from "@/lib/auth/service";
import { getAllowedClerkOrgId, hasClerkConfig } from "@/lib/auth/clerk-config";
import { syncCurrentClerkMember } from "@/lib/auth/clerk-members";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (hasClerkConfig()) return getCurrentClerkUser();

  const cookieStore = await cookies();
  return getCurrentUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
}

async function isMemberOfAllowedOrganization(userId: string, activeOrgId: string | null) {
  const allowedOrgId = getAllowedClerkOrgId();

  if (!allowedOrgId) return false;
  if (activeOrgId === allowedOrgId) return true;

  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({
    limit: 100,
    userId,
  });

  return memberships.data.some((membership) => membership.organization.id === allowedOrgId);
}

async function getCurrentClerkUser(): Promise<CurrentUser | null> {
  const authState = await auth();

  if (!authState.userId) return null;
  if (!(await isMemberOfAllowedOrganization(authState.userId, authState.orgId ?? null))) {
    return null;
  }

  const user = await clerkCurrentUser();
  const email =
    user?.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress;

  if (!user || !email) return null;

  return syncCurrentClerkMember({
    email: email.toLowerCase(),
    firstName: user.firstName,
    imageUrl: user.hasImage ? user.imageUrl : null,
    lastName: user.lastName,
    publicMetadata: user.publicMetadata,
    userId: user.id,
  });
}
