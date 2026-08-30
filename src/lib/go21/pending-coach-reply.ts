/**
 * Authoritative pending-coach-reply reconciliation.
 *
 * A customer turn is only "pending" when no durable coach reply exists for it.
 * Persisted coach reply (replyToCustomerTurnId or shared clientRequestId)
 * supersedes any transient failed/retry UI state.
 */

export type Go21TurnForPendingReply = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  channel: string | null;
  clientRequestId: string | null;
  /** Present on coach turns when persisted. */
  replyToCustomerTurnId?: string | null;
};

export type Go21PendingCoachReply = {
  customerTurnId: string;
  clientRequestId: string;
  content: string;
  logDate: string;
};

/** True when a coach turn answers this customer turn. */
export function go21CoachTurnAnswersCustomer(
  coach: Go21TurnForPendingReply,
  customer: Go21TurnForPendingReply,
): boolean {
  if (coach.role !== "coach") return false;
  if (coach.channel === "system") return false;
  if (coach.replyToCustomerTurnId && coach.replyToCustomerTurnId === customer.id) {
    return true;
  }
  if (
    coach.clientRequestId &&
    customer.clientRequestId &&
    coach.clientRequestId === customer.clientRequestId
  ) {
    return true;
  }
  return false;
}

/**
 * Resolve whether the conversation still needs a coach reply for the
 * latest unanswered customer turn.
 *
 * Returns null when a valid coach reply already exists — even if the
 * thread "looks" like it ends on a customer due to system reminders,
 * truncated windows, or stale client failed state.
 */
export function resolveGo21PendingCoachReply(
  turns: Go21TurnForPendingReply[],
): Go21PendingCoachReply | null {
  const lastMeaningful = [...turns].reverse().find((t) => t.channel !== "system");
  if (!lastMeaningful || lastMeaningful.role !== "customer") return null;
  if (!lastMeaningful.clientRequestId) return null;

  const answered = turns.some((t) => go21CoachTurnAnswersCustomer(t, lastMeaningful));
  if (answered) return null;

  return {
    customerTurnId: lastMeaningful.id,
    clientRequestId: lastMeaningful.clientRequestId,
    content: lastMeaningful.content,
    logDate: lastMeaningful.createdAt.slice(0, 10),
  };
}

/**
 * Client-side guard: do not show failure card when turns already contain
 * a coach reply after the pending customer turn (server truth wins).
 */
export function shouldShowGo21CoachFailedCard(input: {
  pendingCoachReply: Go21PendingCoachReply | null | undefined;
  turns: Array<{ id: string; role: string; channel?: string | null }>;
}): boolean {
  const pending = input.pendingCoachReply;
  if (!pending?.clientRequestId) return false;

  const customerIdx = input.turns.findIndex((t) => t.id === pending.customerTurnId);
  if (customerIdx >= 0) {
    const laterCoach = input.turns
      .slice(customerIdx + 1)
      .some((t) => t.role === "coach" && t.channel !== "system");
    if (laterCoach) return false;
  }

  return true;
}
