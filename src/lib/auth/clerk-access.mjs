const validRoles = new Set(["admin", "member", "reviewer"]);

export function getCpaAwardsRole(publicMetadata) {
  const cpaAwards =
    publicMetadata && typeof publicMetadata === "object"
      ? publicMetadata.cpaAwards
      : undefined;
  const role =
    cpaAwards && typeof cpaAwards === "object" ? cpaAwards.role : undefined;

  return typeof role === "string" && validRoles.has(role) ? role : null;
}

export function isCpaAwardsAdmin(publicMetadata) {
  return getCpaAwardsRole(publicMetadata) === "admin";
}

export function isAllowedClerkOrganization(authState, allowedOrgId) {
  if (!allowedOrgId) return false;
  return authState?.orgId === allowedOrgId;
}
