import type { EntityId } from "./common";

export interface DownlinePartnerSuggestion {
  memberId: EntityId;
  displayName: string;
  generation: number;
  signalKey: string;
  title: string;
  description: string;
  actionHref: string;
  enginePriority: number;
}
