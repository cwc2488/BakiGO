/**
 * Secure-ish weighted / equal draw helpers for lose2kg.
 * Inject `random` for tests; production uses crypto-backed [0,1).
 */

export type RandomFn = () => number;

export type WeightedCandidate = {
  id: string;
  name: string;
  tickets: number;
};

export type EqualCandidate = {
  id: string;
  name: string;
};

function assertValidRandom(random: RandomFn): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("random() must return a number in [0, 1).");
  }
  return value;
}

/** Node/browser-safe crypto random in [0, 1). */
export function cryptoRandom(): number {
  // Prefer Web Crypto when available (Edge/browser); fall back to node:crypto.
  const g = globalThis as typeof globalThis & {
    crypto?: { getRandomValues?: (arr: Uint32Array) => Uint32Array };
  };
  if (g.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    g.crypto.getRandomValues(buf);
    return buf[0]! / 2 ** 32;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) / 2 ** 32;
}

/**
 * Pick one winner with probability ∝ tickets.
 */
export function pickWeightedWinner(
  candidates: readonly WeightedCandidate[],
  random: RandomFn = cryptoRandom,
): { winner: WeightedCandidate; totalTickets: number; roll: number } {
  const eligible = candidates.filter((c) => c.tickets > 0);
  if (eligible.length === 0) {
    throw new Error("沒有有效抽獎券的參賽者。");
  }
  const totalTickets = eligible.reduce((sum, c) => sum + c.tickets, 0);
  const roll = assertValidRandom(random);
  let threshold = roll * totalTickets;
  for (const candidate of eligible) {
    threshold -= candidate.tickets;
    if (threshold < 0) {
      return { winner: candidate, totalTickets, roll };
    }
  }
  return { winner: eligible[eligible.length - 1]!, totalTickets, roll };
}

/**
 * Equal-probability pick (臨時抽獎): 1 person = 1 share.
 */
export function pickEqualWinner(
  candidates: readonly EqualCandidate[],
  random: RandomFn = cryptoRandom,
): { winner: EqualCandidate; poolSize: number; roll: number } {
  if (candidates.length === 0) {
    throw new Error("沒有可抽獎的參賽者。");
  }
  const roll = assertValidRandom(random);
  const index = Math.min(candidates.length - 1, Math.floor(roll * candidates.length));
  return { winner: candidates[index]!, poolSize: candidates.length, roll };
}

/**
 * Pick multiple distinct weighted winners sequentially (without replacement by person).
 * Used when a prize has winnerCount > 1.
 */
export function pickWeightedWinnersWithoutReplacement(
  candidates: readonly WeightedCandidate[],
  count: number,
  random: RandomFn = cryptoRandom,
): { winners: WeightedCandidate[]; totalTickets: number; rolls: number[] } {
  if (count < 1) throw new Error("得獎人數至少為 1。");
  const remaining = candidates.filter((c) => c.tickets > 0).map((c) => ({ ...c }));
  if (remaining.length < count) {
    throw new Error("有效參賽者不足，無法抽出所需名額。");
  }
  const winners: WeightedCandidate[] = [];
  const rolls: number[] = [];
  const initialTotal = remaining.reduce((sum, c) => sum + c.tickets, 0);

  for (let i = 0; i < count; i += 1) {
    const { winner, roll } = pickWeightedWinner(remaining, random);
    winners.push(winner);
    rolls.push(roll);
    const idx = remaining.findIndex((c) => c.id === winner.id);
    remaining.splice(idx, 1);
  }

  return { winners, totalTickets: initialTotal, rolls };
}
