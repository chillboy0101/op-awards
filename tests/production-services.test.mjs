import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertRole,
  createMagicLinkToken,
  createSessionToken,
  hashToken,
  isActiveMagicLink,
  verifyToken,
} from "../src/lib/auth/security.mjs";
import {
  buildCloudinaryMemberPhotoParams,
  signCloudinaryParams,
} from "../src/lib/media/cloudinary.mjs";

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

describe("Cloudinary member-photo signing", () => {
  it("builds admin-only member photo upload params and signs them deterministically", () => {
    const params = buildCloudinaryMemberPhotoParams({
      memberId: "mem_123",
      timestamp: 1_779_193_600,
    });

    assert.deepEqual(params, {
      folder: "cpa-awards/members",
      overwrite: true,
      public_id: "member_mem_123",
      tags: "cpa-awards,member-photo",
      timestamp: 1_779_193_600,
    });

    const signature = signCloudinaryParams(params, "secret");

    assert.equal(signature, "f1e71deb89a906f8ab668af2b28232a9768b56e8");
  });
});
