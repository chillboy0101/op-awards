import { clerkClient } from "@clerk/nextjs/server";
import { eq, or } from "drizzle-orm";

import { getDb, hasDatabaseUrl, schema } from "@/db";
import type { CurrentUser } from "@/lib/auth/service";
import { getAllowedClerkOrgId, hasClerkConfig } from "@/lib/auth/clerk-config";
import { getCpaAwardsRole } from "@/lib/auth/clerk-access";

type ClerkMemberProfile = {
  clerkUserId: string;
  email: string;
  name: string;
  photoUrl: string | null;
};

type MemberRow = typeof schema.members.$inferSelect;

function primaryEmailFallback(clerkUserId: string, identifier?: string | null) {
  if (identifier?.includes("@")) return identifier.toLowerCase();
  return `${clerkUserId}@clerk.local`;
}

function fullName({
  email,
  firstName,
  lastName,
}: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return joined || email.split("@")[0] || "CPA member";
}

function memberFromRow(row: MemberRow): CurrentUser["member"] {
  return {
    chapter: row.chapter,
    email: row.email,
    id: row.id,
    name: row.name,
    photoUrl: row.photoUrl,
  };
}

async function upsertClerkMember(profile: ClerkMemberProfile) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.members)
    .where(
      or(
        eq(schema.members.clerkUserId, profile.clerkUserId),
        eq(schema.members.email, profile.email),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(schema.members)
      .set({
        clerkUserId: profile.clerkUserId,
        email: profile.email,
        name: profile.name,
        photoUrl: profile.photoUrl,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(schema.members.id, existing.id))
      .returning();

    return updated ?? existing;
  }

  const [created] = await db
    .insert(schema.members)
    .values({
      chapter: "Latewatch",
      clerkUserId: profile.clerkUserId,
      email: profile.email,
      name: profile.name,
      photoUrl: profile.photoUrl,
      status: "active",
    })
    .returning();

  return created;
}

export async function syncCurrentClerkMember({
  email,
  firstName,
  lastName,
  publicMetadata,
  userId,
  imageUrl,
}: {
  email: string;
  firstName?: string | null;
  imageUrl?: string | null;
  lastName?: string | null;
  publicMetadata?: Record<string, unknown>;
  userId: string;
}): Promise<CurrentUser | null> {
  const role = (getCpaAwardsRole(publicMetadata) ?? "member") as CurrentUser["role"];

  if (!hasDatabaseUrl()) {
    return {
      member: {
        chapter: "Latewatch",
        email,
        id: userId,
        name: fullName({ email, firstName, lastName }),
        photoUrl: imageUrl || null,
      },
      role,
    };
  }

  const member = await upsertClerkMember({
    clerkUserId: userId,
    email,
    name: fullName({ email, firstName, lastName }),
    photoUrl: imageUrl || null,
  });

  return {
    member: memberFromRow(member),
    role,
  };
}

export async function syncAllowedOrganizationMembers() {
  const allowedOrgId = getAllowedClerkOrgId();

  if (!hasClerkConfig() || !allowedOrgId || !hasDatabaseUrl()) return [];

  const client = await clerkClient();
  const synced: MemberRow[] = [];
  const limit = 100;
  let offset = 0;
  let totalCount = 0;

  do {
    const page = await client.organizations.getOrganizationMembershipList({
      limit,
      offset,
      organizationId: allowedOrgId,
    });

    totalCount = page.totalCount;

    for (const membership of page.data) {
      const publicUserData = membership.publicUserData;
      if (!publicUserData?.userId) continue;

      const email = primaryEmailFallback(publicUserData.userId, publicUserData.identifier);

      synced.push(
        await upsertClerkMember({
          clerkUserId: publicUserData.userId,
          email,
          name: fullName({
            email,
            firstName: publicUserData.firstName,
            lastName: publicUserData.lastName,
          }),
          photoUrl: publicUserData.hasImage ? publicUserData.imageUrl : null,
        }),
      );
    }

    offset += limit;
  } while (offset < totalCount);

  return synced;
}
