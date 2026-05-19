import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasClerkConfig } from "@/lib/auth/clerk-config";
import {
  buildClerkAccountPortalUrl,
  safeAuthRedirectPath,
} from "@/lib/auth/clerk-account-portal.mjs";

type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function requestOrigin() {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "cpa-awards.vercel.app";
  const proto = headerStore.get("x-forwarded-proto") ?? "https";

  return `${proto}://${host}`;
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: AuthSearchParams;
}) {
  if (!hasClerkConfig()) {
    return (
      <main className="auth-shell">
        <div className="auth-panel">
          <p className="section-label">O&P AWARDS</p>
          <h1>Sign-up is managed in Clerk.</h1>
          <p>Connect the existing Latewatch Clerk app to enable account access.</p>
          <Link className="secondary-action" href="/">
            Back to public site
          </Link>
        </div>
      </main>
    );
  }

  const params = searchParams ? await searchParams : {};
  const redirectPath = safeAuthRedirectPath(firstParam(params.redirect_url), "/member");
  const signUpUrl = buildClerkAccountPortalUrl({
    appOrigin: await requestOrigin(),
    page: "sign-up",
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    redirectPath,
  });

  if (signUpUrl) redirect(signUpUrl);

  return (
    <main className="auth-shell">
      <div className="auth-panel">
        <p className="section-label">O&P AWARDS</p>
        <h1>Sign-up could not start.</h1>
        <p>Check the Clerk publishable key and Account Portal settings.</p>
        <Link className="secondary-action" href="/">
          Back to public site
        </Link>
      </div>
    </main>
  );
}
