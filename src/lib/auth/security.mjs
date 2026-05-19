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

export async function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyToken(token, expectedHash) {
  const actualHash = await hashToken(token);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

export function isActiveMagicLink(link, now = new Date()) {
  return !link.usedAt && new Date(link.expiresAt).getTime() > now.getTime();
}

export function assertRole(actualRole, allowedRoles) {
  if (!allowedRoles.includes(actualRole)) {
    throw new Error(`Requires one of: ${allowedRoles.join(", ")}`);
  }
}
