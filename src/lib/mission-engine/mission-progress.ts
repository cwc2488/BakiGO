import type { Mission, MissionProgress } from "@/types/mission";

export function toMissionProgress(mission: Mission): MissionProgress {
  return {
    missionId: mission.id,
    current: mission.current,
    target: mission.target,
    remaining: mission.remaining,
    progress: mission.progress,
    status: mission.status,
    updatedAt: new Date(),
  };
}

export function toMissionProgressList(missions: Mission[]): MissionProgress[] {
  return missions.map(toMissionProgress);
}
