import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import type { ComponentProps } from "react";

import { hasClerkConfig } from "@/lib/auth/clerk-config";
import {
  buildClerkLocalAuthProps,
  safeAuthRedirectPath,
} from "@/lib/auth/clerk-account-portal.mjs";

type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: AuthSearchParams;
}) {
  if (!hasClerkConfig()) {
    return (
      <main className="auth-shell">
        <div className="auth-panel">
          <p className="section-label">O&P AWARDS</p>
          <h1>Clerk is not connected yet.</h1>
          <p>Add the Clerk environment variables for the existing Latewatch app.</p>
          <Link className="secondary-action" href="/">
            Back to public site
          </Link>
        </div>
      </main>
    );
  }

  const params = searchParams ? await searchParams : {};
  const redirectPath = safeAuthRedirectPath(firstParam(params.redirect_url), "/member");
  const signInProps = buildClerkLocalAuthProps({
    page: "sign-in",
    redirectPath,
  }) as ComponentProps<typeof SignIn>;

  return (
    <main className="auth-shell">
      <SignIn {...signInProps} />
    </main>
  );
}
