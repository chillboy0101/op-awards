import { Resend } from "resend";

import { getServerEnv } from "@/lib/env";

let cachedResend: Resend | null = null;

function getResend() {
  const env = getServerEnv();

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!cachedResend) {
    cachedResend = new Resend(env.RESEND_API_KEY);
  }

  return cachedResend;
}

export async function sendMagicLinkEmail({
  email,
  magicLinkUrl,
}: {
  email: string;
  magicLinkUrl: string;
}) {
  const env = getServerEnv();

  if (!env.RESEND_API_KEY) {
    return { skipped: true, reason: "RESEND_API_KEY is not configured." };
  }

  return getResend().emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: "Your O&P Awards sign-in link",
    text: `Use this secure link to sign in to O&P Awards: ${magicLinkUrl}`,
  });
}
