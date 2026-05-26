import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb, hasDatabaseUrl, schema } from "@/db";
import { getServerEnv } from "@/lib/env";
import { sendMagicLinkEmail } from "@/lib/email/resend";
import {
  createMagicLinkToken,
  createSessionToken,
  hashToken,
  isActiveMagicLink,
} from "@/lib/auth/security";

const MAGIC_LINK_MINUTES = 15;
const SESSION_DAYS = 30;

export const SESSION_COOKIE = "cpa_awards_session";

export type CurrentUser = {
  member: {
    id: string;
    name: string;
    email: string;
    chapter: string;
    awardsEligible: boolean;
    photoUrl: string | null;
    staffType: "main" | "monitoring_only" | "nss";
  };
  role: "member" | "reviewer" | "admin";
};

function allowDemoMode() {
  return !hasDatabaseUrl() && process.env.NODE_ENV !== "production";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

export function demoCurrentUser(): CurrentUser {
  return {
    member: {
      id: "mem-1",
      name: "Ari Morgan",
      email: "ari@cpa.example",
      chapter: "North",
      awardsEligible: true,
      photoUrl: null,
      staffType: "main",
    },
    role: "admin",
  };
}

export async function requestMagicLink(emailInput: string) {
  const email = normalizeEmail(emailInput);

  if (!hasDatabaseUrl()) {
    if (!allowDemoMode()) {
      return { ok: true, delivered: false };
    }

    return {
      ok: true,
      demo: true,
      message: "Demo mode: configure POSTGRES_URL or DATABASE_URL to send real magic links.",
    };
  }

  const db = getDb();
  const [member] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.email, email), eq(schema.members.status, "active")))
    .limit(1);

  if (!member) {
    return { ok: true, delivered: false };
  }

  const token = createMagicLinkToken();
  const tokenHash = await hashToken(token);
  const env = getServerEnv();
  const magicLinkUrl = new URL("/auth/verify", env.APP_URL);
  magicLinkUrl.searchParams.set("token", token);

  await db.insert(schema.authMagicLinks).values({
    memberId: member.id,
    tokenHash,
    expiresAt: addMinutes(new Date(), MAGIC_LINK_MINUTES),
  });

  await sendMagicLinkEmail({ email, magicLinkUrl: magicLinkUrl.toString() });

  return {
    ok: true,
    delivered: true,
    devMagicLink: process.env.NODE_ENV === "production" ? undefined : magicLinkUrl.toString(),
  };
}

export async function verifyMagicLink(token: string) {
  if (!hasDatabaseUrl()) {
    if (!allowDemoMode()) {
      return { ok: false, reason: "DATABASE_NOT_CONFIGURED" };
    }

    return {
      ok: true,
      demo: true,
      sessionToken: createSessionToken(),
      memberId: demoCurrentUser().member.id,
    };
  }

  const db = getDb();
  const tokenHash = await hashToken(token);
  const [magicLink] = await db
    .select()
    .from(schema.authMagicLinks)
    .where(eq(schema.authMagicLinks.tokenHash, tokenHash))
    .limit(1);

  if (!magicLink || !isActiveMagicLink(magicLink)) {
    return { ok: false, reason: "INVALID_OR_EXPIRED_LINK" };
  }

  const sessionToken = createSessionToken();
  const sessionTokenHash = await hashToken(sessionToken);

  await db
    .update(schema.authMagicLinks)
    .set({ usedAt: new Date() })
    .where(eq(schema.authMagicLinks.id, magicLink.id));

  await db.insert(schema.authSessions).values({
    memberId: magicLink.memberId,
    tokenHash: sessionTokenHash,
    expiresAt: addDays(new Date(), SESSION_DAYS),
  });

  return { ok: true, sessionToken, memberId: magicLink.memberId };
}

export async function getCurrentUserFromToken(sessionToken: string | undefined) {
  if (!hasDatabaseUrl()) {
    return allowDemoMode() ? demoCurrentUser() : null;
  }

  if (!sessionToken) return null;

  const db = getDb();
  const tokenHash = await hashToken(sessionToken);
  const [session] = await db
    .select()
    .from(schema.authSessions)
    .where(
      and(
        eq(schema.authSessions.tokenHash, tokenHash),
        isNull(schema.authSessions.revokedAt),
        gt(schema.authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) return null;

  const [member] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.id, session.memberId), eq(schema.members.status, "active")))
    .limit(1);

  if (!member) return null;

  const roles = await db
    .select()
    .from(schema.staffUsers)
    .where(and(eq(schema.staffUsers.email, member.email), eq(schema.staffUsers.active, true)));

  const role = roles.some((staff) => staff.role === "admin")
    ? "admin"
    : roles.some((staff) => staff.role === "reviewer")
      ? "reviewer"
      : "member";

  return {
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      chapter: member.chapter,
      awardsEligible: member.awardsEligible,
      photoUrl: member.photoUrl,
      staffType: member.staffType as "main" | "monitoring_only" | "nss",
    },
    role,
  } satisfies CurrentUser;
}

export async function revokeSession(sessionToken: string | undefined) {
  if (!sessionToken || !hasDatabaseUrl()) return;

  const db = getDb();
  await db
    .update(schema.authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(schema.authSessions.tokenHash, await hashToken(sessionToken)));
}
