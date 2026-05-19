import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getCpaAwardsRole,
  isAllowedClerkOrganization,
  isCpaAwardsAdmin,
} from "../src/lib/auth/clerk-access.mjs";

describe("Clerk CPA Awards access", () => {
  it("reads only the namespaced CPA Awards public metadata role", () => {
    assert.equal(
      getCpaAwardsRole({
        cpaAwards: { role: "admin" },
        latewatch: { role: "owner" },
      }),
      "admin",
    );

    assert.equal(getCpaAwardsRole({ latewatch: { role: "admin" } }), null);
    assert.equal(getCpaAwardsRole({ cpaAwards: { role: "member" } }), "member");
    assert.equal(getCpaAwardsRole({ cpaAwards: { role: "owner" } }), null);
  });

  it("limits admin access to cpaAwards.role admin", () => {
    assert.equal(isCpaAwardsAdmin({ cpaAwards: { role: "admin" } }), true);
    assert.equal(isCpaAwardsAdmin({ cpaAwards: { role: "reviewer" } }), false);
    assert.equal(isCpaAwardsAdmin({}), false);
  });

  it("requires the configured Latewatch Clerk organization for member access", () => {
    assert.equal(
      isAllowedClerkOrganization({ orgId: "org_latewatch" }, "org_latewatch"),
      true,
    );
    assert.equal(isAllowedClerkOrganization({ orgId: "org_other" }, "org_latewatch"), false);
    assert.equal(isAllowedClerkOrganization({ orgId: null }, "org_latewatch"), false);
  });
});
