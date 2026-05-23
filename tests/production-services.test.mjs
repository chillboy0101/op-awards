import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  assertRole,
  createMagicLinkToken,
  createSessionToken,
  hashToken,
  isActiveMagicLink,
  verifyToken,
} from "../src/lib/auth/security.mjs";

describe("magic link and session security", () => {
  it("hashes tokens and verifies only the original token", async () => {
    const token = createMagicLinkToken();
    const hash = await hashToken(token);

    assert.equal(token.length >= 32, true);
    assert.notEqual(hash, token);
    assert.equal(await verifyToken(token, hash), true);
    assert.equal(await verifyToken(`${token}x`, hash), false);
  });

  it("treats expired or used magic links as inactive", () => {
    const now = new Date("2026-05-19T12:00:00.000Z");

    assert.equal(
      isActiveMagicLink({
        expiresAt: new Date("2026-05-19T12:05:00.000Z"),
        usedAt: null,
      }, now),
      true,
    );
    assert.equal(
      isActiveMagicLink({
        expiresAt: new Date("2026-05-19T11:59:59.000Z"),
        usedAt: null,
      }, now),
      false,
    );
    assert.equal(
      isActiveMagicLink({
        expiresAt: new Date("2026-05-19T12:05:00.000Z"),
        usedAt: new Date("2026-05-19T11:58:00.000Z"),
      }, now),
      false,
    );
  });

  it("creates opaque session tokens and enforces staff roles", () => {
    assert.equal(createSessionToken().length >= 32, true);
    assert.doesNotThrow(() => assertRole("admin", ["admin"]));
    assert.doesNotThrow(() => assertRole("reviewer", ["admin", "reviewer"]));
    assert.throws(
      () => assertRole("member", ["admin"]),
      /Requires one of: admin/,
    );
  });
});

describe("awards email policy", () => {
  it("does not send a ballot receipt email after voting", async () => {
    const [actionsSource, resendSource] = await Promise.all([
      readFile(new URL("../src/app/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/email/resend.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(actionsSource.includes("sendVoteReceiptEmail"), false);
    assert.equal(resendSource.includes("O&P Awards ballot receipt"), false);
  });
});
