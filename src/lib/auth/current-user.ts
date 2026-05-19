import { cookies } from "next/headers";

import {
  getCurrentUserFromToken,
  SESSION_COOKIE,
  type CurrentUser,
} from "@/lib/auth/service";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  return getCurrentUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
}
