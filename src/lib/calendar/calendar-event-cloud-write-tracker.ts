/**
 * Tracks in-flight personal calendar event cloud writes so UI can await
 * authoritative server persistence (not just local optimistic state).
 *
 * Failures must NOT be silently treated as success by awaiters.
 * Callers should catch inside `work` and enqueue pending mutations when
 * appropriate so the tracked promise resolves only after queue-or-save.
 */
type TrackedWrite = {
  promise: Promise<void>;
  settled: boolean;
  rejected: boolean;
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

  const tracked: TrackedWrite = { promise: run, settled: false, rejected: false };
  inFlight.set(key, tracked);
  void run.then(
    () => {
      tracked.settled = true;
      if (inFlight.get(key) === tracked) {
        inFlight.delete(key);
      }
    },
    () => {
      tracked.settled = true;
      tracked.rejected = true;
      if (inFlight.get(key) === tracked) {
        inFlight.delete(key);
      }
    },
  );
  return run;
}

/**
 * Await all in-flight calendar cloud writes.
 * Rejects if any write failed without being handled (propagates to UI).
 */
export async function awaitCalendarEventCloudWrites(): Promise<void> {
  const pending = [...inFlight.values()];
  if (pending.length === 0) {
    await chain;
    return;
  }
  const results = await Promise.allSettled(pending.map((item) => item.promise));
  await chain;
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected && rejected.status === "rejected") {
    throw rejected.reason instanceof Error
      ? rejected.reason
      : new Error(String(rejected.reason ?? "Calendar cloud write failed"));
  }
}

export function getCalendarEventCloudWriteInFlightCount(): number {
  return [...inFlight.values()].filter((item) => !item.settled).length;
}

/** Test helper */
export function resetCalendarEventCloudWriteTracker(): void {
  inFlight.clear();
  chain = Promise.resolve();
}
