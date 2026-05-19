import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

import { hasClerkConfig } from "@/lib/auth/clerk-config";

export default function SignUpPage() {
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

  return (
    <main className="auth-shell">
      <SignUp />
    </main>
  );
}
