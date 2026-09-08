import { lose2kgFetch } from "@/lib/lose2kg/authenticated-fetch";
import type {
  Lose2kgDraw,
  Lose2kgMeasurement,
  Lose2kgMeasurementSlot,
  Lose2kgParticipant,
  Lose2kgPeriod,
  Lose2kgPeriodStatus,
  Lose2kgPrize,
  Lose2kgTempDrawSession,
  Lose2kgTicketEvent,
  Lose2kgWeightMilestone,
} from "@/types/lose2kg";

export async function fetchLose2kgHome(): Promise<{
  active: Lose2kgPeriod[];
  completed: Lose2kgPeriod[];
  draft: Lose2kgPeriod[];
}> {
  const body = await lose2kgFetch<{
    ok: true;
    data: { active: Lose2kgPeriod[]; completed: Lose2kgPeriod[]; draft: Lose2kgPeriod[] };
  }>("/api/admin/lose2kg", { cache: "no-store" });
  return body.data;
}

export async function createLose2kgPeriod(input: {
  name: string;
  firstMeasurementDate: string;
  measurementDates?: [string, string, string, string];
}): Promise<Lose2kgPeriod> {
  const body = await lose2kgFetch<{ ok: true; period: Lose2kgPeriod }>("/api/admin/lose2kg/periods", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.period;
}

export async function fetchLose2kgPeriod(periodId: string): Promise<{
  period: Lose2kgPeriod;
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  prizes: Lose2kgPrize[];
  draws: Lose2kgDraw[];
  tempSessions: Lose2kgTempDrawSession[];
}> {
  const body = await lose2kgFetch<{
    ok: true;
    data: {
      period: Lose2kgPeriod;
      participants: Lose2kgParticipant[];
      measurements: Lose2kgMeasurement[];
      prizes: Lose2kgPrize[];
      draws: Lose2kgDraw[];
      tempSessions: Lose2kgTempDrawSession[];
    };
  }>(`/api/admin/lose2kg/periods/${periodId}`, { cache: "no-store" });
  return body.data;
}

export async function patchLose2kgPeriod(
  periodId: string,
  patch: {
    name?: string;
    status?: Lose2kgPeriodStatus;
    measurementDates?: [string, string, string, string];
    publicEnabled?: boolean;
  },
): Promise<Lose2kgPeriod> {
  const body = await lose2kgFetch<{ ok: true; period: Lose2kgPeriod }>(
    `/api/admin/lose2kg/periods/${periodId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return body.period;
}

export async function regenerateLose2kgPeriodToken(
  periodId: string,
): Promise<{ period: Lose2kgPeriod; publicUrl: string }> {
  const body = await lose2kgFetch<{ ok: true; period: Lose2kgPeriod; publicUrl: string }>(
    `/api/admin/lose2kg/periods/${periodId}/public-token`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return { period: body.period, publicUrl: body.publicUrl };
}

export async function createLose2kgParticipant(
  periodId: string,
  input: { name: string; publicDisplayName?: string; note?: string },
): Promise<Lose2kgParticipant> {
  const body = await lose2kgFetch<{ ok: true; participant: Lose2kgParticipant }>(
    `/api/admin/lose2kg/periods/${periodId}/participants`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return body.participant;
}

export async function patchLose2kgParticipant(
  participantId: string,
  patch: {
    name?: string;
    publicDisplayName?: string;
    note?: string | null;
    status?: Lose2kgParticipant["status"];
  },
): Promise<Lose2kgParticipant> {
  const body = await lose2kgFetch<{ ok: true; participant: Lose2kgParticipant }>(
    `/api/admin/lose2kg/participants/${participantId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return body.participant;
}

export async function removeLose2kgParticipant(participantId: string): Promise<void> {
  await lose2kgFetch<{ ok: true }>(`/api/admin/lose2kg/participants/${participantId}`, {
    method: "DELETE",
  });
}

export async function fetchLose2kgParticipantDetail(participantId: string): Promise<{
  participant: Lose2kgParticipant;
  measurements: Lose2kgMeasurement[];
  milestones: Lose2kgWeightMilestone[];
  events: Lose2kgTicketEvent[];
}> {
  const body = await lose2kgFetch<{
    ok: true;
    data: {
      participant: Lose2kgParticipant;
      measurements: Lose2kgMeasurement[];
      milestones: Lose2kgWeightMilestone[];
      events: Lose2kgTicketEvent[];
    };
  }>(`/api/admin/lose2kg/participants/${participantId}`, { cache: "no-store" });
  return body.data;
}

export async function upsertLose2kgMeasurement(
  participantId: string,
  input: { slot: Lose2kgMeasurementSlot; weightKg: number | null; reason?: string },
): Promise<{ participant: Lose2kgParticipant; measurements: Lose2kgMeasurement[] }> {
  const body = await lose2kgFetch<{
    ok: true;
    participant: Lose2kgParticipant;
    measurements: Lose2kgMeasurement[];
  }>(`/api/admin/lose2kg/participants/${participantId}/measurements`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { participant: body.participant, measurements: body.measurements };
}

export async function adjustLose2kgActivityTickets(
  participantId: string,
  input: { delta: number; reason: string; eventDate?: string },
): Promise<Lose2kgParticipant> {
  const body = await lose2kgFetch<{ ok: true; participant: Lose2kgParticipant }>(
    `/api/admin/lose2kg/participants/${participantId}/tickets`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return body.participant;
}

export async function createLose2kgPrize(
  periodId: string,
  input: { name: string; winnerCount?: number },
): Promise<Lose2kgPrize> {
  const body = await lose2kgFetch<{ ok: true; prize: Lose2kgPrize }>(
    `/api/admin/lose2kg/periods/${periodId}/prizes`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return body.prize;
}

export async function executeLose2kgFormalDraw(
  periodId: string,
  input: { prizeId: string; idempotencyKey?: string },
): Promise<{
  draw: Lose2kgDraw;
  duplicate: boolean;
  winners: { id: string; name: string; tickets: number }[];
}> {
  const body = await lose2kgFetch<{
    ok: true;
    draw: Lose2kgDraw;
    duplicate: boolean;
    winners: { id: string; name: string; tickets: number }[];
  }>(`/api/admin/lose2kg/periods/${periodId}/draws`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { draw: body.draw, duplicate: body.duplicate, winners: body.winners };
}

export async function voidLose2kgFormalDraw(
  drawId: string,
  reason: string,
): Promise<Lose2kgDraw> {
  const body = await lose2kgFetch<{ ok: true; draw: Lose2kgDraw }>(
    `/api/admin/lose2kg/draws/${drawId}/void`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
  return body.draw;
}

export async function createLose2kgTempDraw(
  periodId: string,
  presentParticipantIds: string[],
): Promise<{ session: Lose2kgTempDrawSession; publicUrl: string }> {
  const body = await lose2kgFetch<{
    ok: true;
    session: Lose2kgTempDrawSession;
    publicUrl: string;
  }>(`/api/admin/lose2kg/periods/${periodId}/temp-draws`, {
    method: "POST",
    body: JSON.stringify({ presentParticipantIds }),
  });
  return { session: body.session, publicUrl: body.publicUrl };
}

export async function voidLose2kgTempDraw(
  sessionId: string,
  reason: string,
): Promise<Lose2kgTempDrawSession> {
  const body = await lose2kgFetch<{ ok: true; session: Lose2kgTempDrawSession }>(
    `/api/admin/lose2kg/temp-draws/${sessionId}/void`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
  return body.session;
}
