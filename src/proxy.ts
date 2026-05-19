import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { getAllowedClerkOrgId, hasClerkConfig } from "@/lib/auth/clerk-config";
import { isAllowedClerkOrganization } from "@/lib/auth/clerk-access";

const isMemberRoute = createRouteMatcher(["/member(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isProtectedRoute = createRouteMatcher(["/member(.*)", "/admin(.*)"]);

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (!isProtectedRoute(request)) return NextResponse.next();

  const authState = await auth.protect({
    unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
  });
  const allowedOrgId = getAllowedClerkOrgId();

  if (!isAllowedClerkOrganization({ orgId: authState.orgId }, allowedOrgId)) {
    return NextResponse.redirect(new URL("/?access=organization", request.url));
  }

  return NextResponse.next();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!hasClerkConfig()) {
    if (process.env.NODE_ENV !== "production" || !isProtectedRoute(request)) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/?setup=clerk", request.url));
  }

  if (!isMemberRoute(request) && !isAdminRoute(request)) {
    return NextResponse.next();
  }

  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
