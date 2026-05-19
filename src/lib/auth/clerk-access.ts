export {
  getCpaAwardsRole,
  isAllowedClerkOrganization,
  isCpaAwardsAdmin,
} from "./clerk-access.mjs";

export type CpaAwardsRole = "admin" | "member" | "reviewer";
