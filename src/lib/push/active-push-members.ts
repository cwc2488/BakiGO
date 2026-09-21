/**
 * Paginate active push_subscriptions so PostgREST default row caps
 * cannot truncate unique member discovery (1000+ devices / members).
 */

export const PUSH_SUBSCRIPTION_PAGE_SIZE = 1000;

export type PushSubscriptionMemberRow = { member_id: string };

/**
 * Pure pagination + dedupe. Inject fetchPage for unit tests.
 */
export async function collectActivePushMemberIds(input: {
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<PushSubscriptionMemberRow[]>;
  pageSize?: number;
}): Promise<string[]> {
  const pageSize = Math.max(1, input.pageSize ?? PUSH_SUBSCRIPTION_PAGE_SIZE);
  const unique = new Set<string>();
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const rows = await input.fetchPage(from, to);
    for (const row of rows) {
      if (row?.member_id) {
        unique.add(String(row.member_id));
      }
    }
    if (rows.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return Array.from(unique);
}
