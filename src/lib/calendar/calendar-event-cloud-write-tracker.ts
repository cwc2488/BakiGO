/**
 * Tracks in-flight personal calendar event cloud writes so UI can await
 * authoritative server persistence (not just local optimistic state).
 */
type TrackedWrite = {
  promise: Promise<void>;
  settled: boolean;
};

const inFlight = new Map<string, TrackedWrite>();
let chain: Promise<void> = Promise.resolve();

function trackKey(memberId: string, eventId: string, op: string): string {
  return `${memberId}:${eventId}:${op}`;
}

export function trackCalendarEventCloudWrite(
  memberId: string,
  eventId: string,
  operation: "upsert" | "delete",
  work: () => Promise<void>,
): Promise<void> {
  const key = trackKey(memberId, eventId, operation);
  const run = chain.then(async () => {
    await work();
  });
  // Keep chain alive even if one write fails so later writes still run.
  chain = run.catch(() => undefined);

  const tracked: TrackedWrite = { promise: run, settled: false };
  inFlight.set(key, tracked);
  void run.finally(() => {
    tracked.settled = true;
    // Only delete if still the current tracked write for this key.
    if (inFlight.get(key) === tracked) {
      inFlight.delete(key);
    }
  });
  return run;
}

export async function awaitCalendarEventCloudWrites(): Promise<void> {
  const pending = [...inFlight.values()].map((item) => item.promise);
  if (pending.length === 0) {
    await chain;
    return;
  }
  await Promise.allSettled(pending);
  await chain;
}

export function getCalendarEventCloudWriteInFlightCount(): number {
  return [...inFlight.values()].filter((item) => !item.settled).length;
}

/** Test helper */
export function resetCalendarEventCloudWriteTracker(): void {
  inFlight.clear();
  chain = Promise.resolve();
}
