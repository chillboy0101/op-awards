import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildClerkMemberValues } from "../src/lib/auth/clerk-member-sync.mjs";

describe("Clerk member sync values", () => {
  const profile = {
    clerkUserId: "user_123",
    email: "member@op.test",
    name: "Member One",
    photoUrl: "https://example.com/photo.jpg",
  };

  it("preserves a manually excluded member during sync", () => {
    assert.deepEqual(
      buildClerkMemberValues({
        existing: { awardsEligible: false, status: "active" },
        profile,
      }),
      {
        awardsEligible: false,
        clerkUserId: "user_123",
        email: "member@op.test",
        name: "Member One",
        photoUrl: "https://example.com/photo.jpg",
        status: "active",
      },
    );
  });

  it("defaults new synced members to eligible", () => {
    assert.equal(
      buildClerkMemberValues({
        existing: null,
        profile,
      }).awardsEligible,
      true,
    );
  });
});
