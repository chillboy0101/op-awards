import {
  getEffectiveCycleStage,
  getMemberPhaseAccess,
  normalizeAwardStage,
} from "./phase.mjs";

export { getEffectiveCycleStage, getMemberPhaseAccess, normalizeAwardStage };

export type EffectiveCycleStageOptions = Parameters<typeof getEffectiveCycleStage>[0];
export type MemberPhaseAccess = ReturnType<typeof getMemberPhaseAccess>;
