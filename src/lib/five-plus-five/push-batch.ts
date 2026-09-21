/**
 * Push quota batching: already-claimed / deduped members must NOT consume
 * the successful-claim limit, so subsequent cron ticks can progress through
 * large orgs (100 / 500 / 1000 active push members).
 */

export type PushClaimResult = "sent" | "already_claimed" | "send_failed";

export type ProcessDueQuotaResult = {
  scanned: number;
  sent: number;
  alreadyClaimed: number;
  sendFailed: number;
  /** Newly claimed slots (sent + send_failed). Caps the batch. */
  newlyClaimed: number;
};

/**
 * Scan due members; only newly claimed slots count toward `limit`.
 * Bounded concurrency for claim/send work.
 *
 * Reservation: before awaiting claim, reserve an in-flight slot so concurrent
 * workers cannot overshoot `limit`. already_claimed releases the reservation
 * without consuming quota.
 */
export async function processDueMembersWithQuota(input: {
  dueMemberIds: readonly string[];
  limit: number;
  concurrency?: number;
  tryClaimAndSend: (memberId: string) => Promise<PushClaimResult>;
}): Promise<ProcessDueQuotaResult> {
  const limit = Math.max(1, Math.floor(input.limit));
  const concurrency = Math.max(1, Math.min(25, Math.floor(input.concurrency ?? 10)));
  const due = input.dueMemberIds;

  let cursor = 0;
  let scanned = 0;
  let sent = 0;
  let alreadyClaimed = 0;
  let sendFailed = 0;
  let newlyClaimed = 0;
  let inFlight = 0;

  async function worker() {
    while (true) {
      if (newlyClaimed >= limit) {
        return;
      }

      // Sync reservation — JS is single-threaded between awaits
      if (newlyClaimed + inFlight >= limit) {
        if (newlyClaimed >= limit) return;
        // Wait for an in-flight claim to finish / release
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        continue;
      }

      inFlight += 1;
      const index = cursor;
      cursor += 1;

      if (index >= due.length) {
        inFlight -= 1;
        return;
      }

      scanned += 1;
      const memberId = due[index];

      try {
        const result = await input.tryClaimAndSend(memberId);
        if (result === "already_claimed") {
          alreadyClaimed += 1;
        } else {
          newlyClaimed += 1;
          if (result === "sent") {
            sent += 1;
          } else {
            sendFailed += 1;
          }
        }
      } finally {
        inFlight -= 1;
      }
    }
  }

  const workerCount = Math.min(concurrency, Math.max(1, due.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { scanned, sent, alreadyClaimed, sendFailed, newlyClaimed };
}
