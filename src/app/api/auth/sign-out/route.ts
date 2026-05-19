import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { revokeSession, SESSION_COOKIE } from "@/lib/auth/service";

export async function POST() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  await revokeSession(sessionToken);
  cookieStore.delete(SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}
