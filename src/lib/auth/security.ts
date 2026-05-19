import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

function createOpaqueToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function createMagicLinkToken() {
  return createOpaqueToken();
}

export function createSessionToken() {
  return createOpaqueToken();
}

export async function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyToken(token: string, expectedHash: string) {
  const actualHash = await hashToken(token);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

export function isActiveMagicLink(
  link: { expiresAt: Date | string; usedAt: Date | string | null },
  now = new Date(),
) {
  return !link.usedAt && new Date(link.expiresAt).getTime() > now.getTime();
}

export function assertRole(actualRole: string, allowedRoles: string[]) {
  if (!allowedRoles.includes(actualRole)) {
    throw new Error(`Requires one of: ${allowedRoles.join(", ")}`);
  }
}
