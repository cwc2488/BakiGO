import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";

export interface PipelineComposition {
  newCustomerPool: number;
  existingMemberPool: number;
  nearCloseNew: number;
  earlyNew: number;
  accumulatedCustomerCount: number;
  repurchaseMemberCount: number;
  mapCount: number;
  supervisorCount: number;
  worldTeamCount: number;
  supervisorPathCount: number;
  returningCustomerCount: number;
  returningMemberCount: number;
  accumulatedCustomerNames: string[];
  repurchaseMemberNames: string[];
  supervisorPathNames: string[];
  memberNames: string[];
  nearCloseNames: string[];
}

const EMPTY_COMPOSITION: PipelineComposition = {
  newCustomerPool: 0,
  existingMemberPool: 0,
  nearCloseNew: 0,
  earlyNew: 0,
  accumulatedCustomerCount: 0,
  repurchaseMemberCount: 0,
  mapCount: 0,
  supervisorCount: 0,
  worldTeamCount: 0,
  supervisorPathCount: 0,
  returningCustomerCount: 0,
  returningMemberCount: 0,
  accumulatedCustomerNames: [],
  repurchaseMemberNames: [],
  supervisorPathNames: [],
  memberNames: [],
  nearCloseNames: [],
};

/** Pipeline feature retired — always empty composition. */
export function analyzePipeline(_snapshot: RetailPipelineSnapshot | null): PipelineComposition {
  return EMPTY_COMPOSITION;
}

export function isPipelineColdStart(_composition: PipelineComposition): boolean {
  return false;
}
