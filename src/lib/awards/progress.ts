import { getCycleProgress as getCycleProgressMjs } from "./progress.mjs";

const getCycleProgressRuntime = getCycleProgressMjs as (input?: unknown) => unknown;

type ProgressCategory = {
  active?: boolean;
  ballotScope?: string;
  id: string;
  status?: string;
};

type ProgressCertification = {
  categoryId: string;
  status: string;
};

type ProgressFinalist = {
  categoryId: string;
  status: string;
};

type ProgressMember = {
  active?: boolean;
  awardsEligible?: boolean;
  id: string;
  status?: string;
};

type ProgressNomination = {
  categoryId: string;
  nominatorId: string;
};

type ProgressVoteReceipt = {
  ballotScope?: string;
  memberId: string;
};

export type CycleProgressInput = {
  ballotScope?: string;
  categories?: ProgressCategory[];
  certifications?: ProgressCertification[];
  finalists?: ProgressFinalist[];
  members?: ProgressMember[];
  nominations?: ProgressNomination[];
  voteReceipts?: ProgressVoteReceipt[];
};

export type CycleProgress = {
  activeCategoryCount: number;
  approvedCategoryCount: number;
  approvedFinalistCount: number;
  certifiedCategoryCount: number;
  eligibleMemberCount: number;
  nominationCompletionCount: number;
  nominationSubmissionCount: number;
  nominationsRequiredCount: number;
  voteReceiptCount: number;
  votingRequiredCount: number;
};

export function getCycleProgress(input: CycleProgressInput = {}): CycleProgress {
  return getCycleProgressRuntime(input) as CycleProgress;
}
