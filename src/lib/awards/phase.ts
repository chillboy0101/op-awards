import {
  getEffectiveCycleStage as getEffectiveCycleStageMjs,
  getMemberPhaseAccess as getMemberPhaseAccessMjs,
  normalizeAwardStage as normalizeAwardStageMjs,
} from "./phase.mjs";

export type EffectiveCycleStageOptions = {
  activeCategoryCount?: number;
  approvedCategoryCount?: number;
  approvedFinalistCount?: number;
  configuredStage?: string;
  eligibleMemberCount?: number;
  nominationCompletionCount?: number;
  nominationParticipantCount?: number;
  now?: Date | string;
  publishedAt?: Date | string | null;
  voteReceiptCount?: number;
};

export const getEffectiveCycleStage = getEffectiveCycleStageMjs as (
  options?: EffectiveCycleStageOptions,
) => string;
export const getMemberPhaseAccess = getMemberPhaseAccessMjs as (stage: string) => {
  canNominate: boolean;
  canVote: boolean;
  currentTask: "nomination" | "status" | "voting";
  label: string;
  message: string;
};
export const normalizeAwardStage = normalizeAwardStageMjs as (stage: string) => string;
export type MemberPhaseAccess = ReturnType<typeof getMemberPhaseAccess>;
