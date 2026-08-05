import type { AppMember } from "@/lib/config/app-config";
import type { BakiEvent } from "@/types/baki-event";

/** Member rank comes from CRM registration; qualification progress is computed by the engine. */
export function applyMemberStateFromEvents(
  members: AppMember[],
  ..._ignored: [BakiEvent[]?]
): AppMember[] {
  void _ignored;
  return members;
}
