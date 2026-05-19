import { NextResponse } from "next/server";
import { z } from "zod";

import { requestMagicLink } from "@/lib/auth/service";

const requestSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  }

  const result = await requestMagicLink(parsed.data.email);

  return NextResponse.json({
    ok: true,
    message: "If that email is an active CPA member, a sign-in link has been sent.",
    devMagicLink: result.devMagicLink,
    demo: result.demo,
  });
}
