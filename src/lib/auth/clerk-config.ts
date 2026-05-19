export function hasClerkConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export function getAllowedClerkOrgId() {
  return process.env.CLERK_ALLOWED_ORG_ID?.trim() || null;
}

export function allowLocalDemoAuth() {
  return !hasClerkConfig() && process.env.NODE_ENV !== "production";
}
