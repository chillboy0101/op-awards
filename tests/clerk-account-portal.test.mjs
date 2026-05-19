import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildClerkLocalAuthProps,
  buildClerkAccountPortalUrl,
  clerkAccountPortalOriginFromPublishableKey,
  safeAuthRedirectPath,
} from "../src/lib/auth/clerk-account-portal.mjs";

describe("Clerk Account Portal redirects", () => {
  it("derives the Account Portal origin from a Clerk publishable key", () => {
    assert.equal(
      clerkAccountPortalOriginFromPublishableKey(
        "pk_test_bGVnYWwtZmlzaC02MS5jbGVyay5hY2NvdW50cy5kZXYk",
      ),
      "https://legal-fish-61.clerk.accounts.dev",
    );
  });

  it("builds a hosted sign-in URL with a safe app redirect", () => {
    assert.equal(
      buildClerkAccountPortalUrl({
        appOrigin: "https://cpa-awards.vercel.app",
        page: "sign-in",
        publishableKey: "pk_test_bGVnYWwtZmlzaC02MS5jbGVyay5hY2NvdW50cy5kZXYk",
        redirectPath: "/member",
      }),
      "https://legal-fish-61.clerk.accounts.dev/sign-in?redirect_url=https%3A%2F%2Fcpa-awards.vercel.app%2Fmember",
    );
  });

  it("builds app-local embedded Clerk auth props instead of a hosted accounts.dev URL", () => {
    assert.deepEqual(
      buildClerkLocalAuthProps({
        page: "sign-in",
        redirectPath: "https://evil.example/member",
      }),
      {
        fallbackRedirectUrl: "/member",
        forceRedirectUrl: "/member",
        path: "/sign-in",
        routing: "path",
        signUpUrl: "/sign-up",
      },
    );
  });

  it("rejects external redirect paths", () => {
    assert.equal(safeAuthRedirectPath("https://evil.example/member"), "/member");
    assert.equal(safeAuthRedirectPath("//evil.example/member"), "/member");
    assert.equal(safeAuthRedirectPath("/member?category=leadership"), "/member?category=leadership");
  });
});
