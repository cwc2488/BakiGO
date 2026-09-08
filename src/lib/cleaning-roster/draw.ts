import type {
  CleaningRosterPreviewAssignment,
  CleaningRosterPreviewRester,
} from "@/types/cleaning-roster";

export type WeightedMember = {
  id: string;
  name: string;
  weight: number;
};

export type DrawArea = {
  id: string;
  name: string;
};

export type DrawResult = {
  assignments: CleaningRosterPreviewAssignment[];
  resting: CleaningRosterPreviewRester[];
};

export type RandomFn = () => number;

function assertValidRandom(random: RandomFn): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("random() must return a number in [0, 1).");
  }
  return value;
}

/**
 * Weighted random pick among candidates. Probability ∝ weight.
 * Does not mutate the input array.
 */
export function pickWeightedMember(
  candidates: readonly WeightedMember[],
  random: RandomFn = Math.random,
): WeightedMember {
  if (candidates.length === 0) {
    throw new Error("Cannot pick from an empty candidate list.");
  }
  const total = candidates.reduce((sum, member) => {
    if (!(member.weight > 0)) {
      throw new Error(`Member ${member.id} must have positive weight.`);
    }
    return sum + member.weight;
  }, 0);

  let threshold = assertValidRandom(random) * total;
  for (const member of candidates) {
    threshold -= member.weight;
    if (threshold < 0) return member;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * Pick `count` distinct members via sequential weighted random without replacement.
 */
export function pickWeightedWithoutReplacement(
  pool: readonly WeightedMember[],
  count: number,
  random: RandomFn = Math.random,
): WeightedMember[] {
  if (count < 0) throw new Error("count must be non-negative.");
  if (count > pool.length) {
    throw new Error("Cannot pick more distinct members than the pool size.");
  }
  const remaining = [...pool];
  const selected: WeightedMember[] = [];
  for (let i = 0; i < count; i += 1) {
    const picked = pickWeightedMember(remaining, random);
    selected.push(picked);
    const index = remaining.findIndex((member) => member.id === picked.id);
    remaining.splice(index, 1);
  }
  return selected;
}

function shuffleInPlace<T>(items: T[], random: RandomFn): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(assertValidRandom(random) * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/**
 * Fair weighted cleaning draw.
 *
 * - members >= areas: assign one unique member per area; extras rest.
 * - members < areas: every member works; loads differ by at most 1 (ceil/floor).
 *   Extra slots are granted via weighted picks among members.
 */
export function drawCleaningRoster(
  areas: readonly DrawArea[],
  members: readonly WeightedMember[],
  random: RandomFn = Math.random,
): DrawResult {
  if (areas.length === 0) {
    throw new Error("至少需要一個打掃區域。");
  }
  if (members.length === 0) {
    throw new Error("至少需要一位參與人員。");
  }

  const areaList = [...areas];
  const memberList = [...members];

  if (memberList.length >= areaList.length) {
    const workers = pickWeightedWithoutReplacement(memberList, areaList.length, random);
    const workerIds = new Set(workers.map((member) => member.id));
    const resting: CleaningRosterPreviewRester[] = memberList
      .filter((member) => !workerIds.has(member.id))
      .map((member) => ({ memberId: member.id, memberName: member.name }));

    const shuffledAreas = shuffleInPlace([...areaList], random);
    const assignments: CleaningRosterPreviewAssignment[] = shuffledAreas.map((area, index) => {
      const worker = workers[index]!;
      return {
        areaId: area.id,
        areaName: area.name,
        memberId: worker.id,
        memberName: worker.name,
      };
    });

    return { assignments, resting };
  }

  // members < areas → multi-area loads, gap ≤ 1
  const baseLoad = Math.floor(areaList.length / memberList.length);
  const extraSlots = areaList.length % memberList.length;
  const loadById = new Map(memberList.map((member) => [member.id, baseLoad]));
  const extras = pickWeightedWithoutReplacement(memberList, extraSlots, random);
  for (const member of extras) {
    loadById.set(member.id, (loadById.get(member.id) ?? 0) + 1);
  }

  const slots: WeightedMember[] = [];
  for (const member of memberList) {
    const load = loadById.get(member.id) ?? 0;
    for (let i = 0; i < load; i += 1) {
      slots.push(member);
    }
  }
  shuffleInPlace(slots, random);
  const shuffledAreas = shuffleInPlace([...areaList], random);

  const assignments: CleaningRosterPreviewAssignment[] = shuffledAreas.map((area, index) => {
    const worker = slots[index]!;
    return {
      areaId: area.id,
      areaName: area.name,
      memberId: worker.id,
      memberName: worker.name,
    };
  });

  return { assignments, resting: [] };
}

/** Count how many areas each member received in a draw result. */
export function countAssignmentsByMember(
  result: DrawResult,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const assignment of result.assignments) {
    counts.set(assignment.memberId, (counts.get(assignment.memberId) ?? 0) + 1);
  }
  return counts;
}
