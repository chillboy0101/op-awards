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
    subject: "Your CPA Awards sign-in link",
    text: `Use this secure link to sign in to CPA Awards: ${magicLinkUrl}`,
  });
}

export async function sendVoteReceiptEmail({
  email,
  confirmationCode,
}: {
  email: string;
  confirmationCode: string;
}) {
  const env = getServerEnv();

  if (!env.RESEND_API_KEY) {
    return { skipped: true, reason: "RESEND_API_KEY is not configured." };
  }

  return getResend().emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: "CPA Awards ballot receipt",
    text: `Your CPA Awards ballot was received. Receipt: ${confirmationCode}. Your selections are stored anonymously.`,
  });
}
