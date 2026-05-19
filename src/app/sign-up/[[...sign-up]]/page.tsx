import { SignUp } from "@clerk/nextjs";
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
  const signUpProps = buildClerkLocalAuthProps({
    page: "sign-up",
    redirectPath,
  }) as ComponentProps<typeof SignUp>;

  return (
    <main className="auth-shell">
      <SignUp {...signUpProps} />
    </main>
  );
}
