import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

import { hasClerkConfig } from "@/lib/auth/clerk-config";

export default function SignInPage() {
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

  return (
    <main className="auth-shell">
      <SignIn />
    </main>
  );
}
