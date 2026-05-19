import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, verifyMagicLink } from "@/lib/auth/service";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/?auth=missing-token", request.url));
  }

  const result = await verifyMagicLink(token);

  if (!result.ok || !result.sessionToken) {
    return NextResponse.redirect(new URL("/?auth=expired", request.url));
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.redirect(new URL("/?auth=verified", request.url));
}
