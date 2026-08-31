import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  buildDownlineEntry,
  getDownlineMonthlyProductVp,
  getDownlineMonthlyProductVpResult,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import { enrichOrganizationRootsWithProductVp } from "@/lib/organization/enrich-organization-product-vp";
import { findMemberSubtree } from "@/lib/organization/organization-selectors";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import {
  resolveAuthoritativeRetailTransactionsFromPayloads,
} from "@/lib/retail-house/authoritative-retail-transactions";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { OrganizationTreeNode } from "@/types/organization-center";
import type { RetailTransaction } from "@/types/retail-transaction";

const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHEN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/**
 * Production-shaped August fixture for 陳佳昱.
 * Cloud member_app_data payload: JSON array, 10 transactions, Product VP = 2338.85.
 */
function productionChenRetailPayload(): RetailTransaction[] {
  const rows: Array<{
    id: string;
    type: string;
    date: string;
    amount: number;
    retailVp?: number;
  }> = [
    { id: "p1", type: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD, date: "2026-08-01", amount: 8500, retailVp: 312.5 },
    { id: "p2", type: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD, date: "2026-08-03", amount: 4200, retailVp: 188.25 },
    { id: "p3", type: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP, date: "2026-08-05", amount: 450 },
    { id: "p4", type: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP, date: "2026-08-08", amount: 275.1 },
    { id: "p5", type: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD, date: "2026-08-10", amount: 6000, retailVp: 200 },
    { id: "p6", type: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD, date: "2026-08-14", amount: 3100, retailVp: 95 },
    { id: "p7", type: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP, date: "2026-08-18", amount: 320 },
    { id: "p8", type: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD, date: "2026-08-21", amount: 9800, retailVp: 400 },
    { id: "p9", type: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP, date: "2026-08-25", amount: 48 },
    { id: "p10", type: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD, date: "2026-08-28", amount: 2500, retailVp: 50 },
  ];
  // 312.5+188.25+450+275.1+200+95+320+400+48+50 = 2338.85

  return rows.map((row) => {
    const isCustomer = row.type.endsWith("_ntd");
    return {
      id: row.id,
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
      organizationId: "org-1",
      memberId: CHEN,
      customerName: "顧客",
      transactionTypeKey: row.type,
      transactionDate: row.date,
      amount: row.amount,
      currencyCode: "TWD",
      metadata: {
        customerName: "顧客",
        currencyCode: "TWD",
        ...(isCustomer && row.retailVp != null ? { retailVp: row.retailVp } : {}),
      },
    };
  });
}

function memoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function orgNode(
  memberId: string,
  name: string,
  children: OrganizationTreeNode[] = [],
): OrganizationTreeNode {
  return {
    member: {
      memberId,
      memberNumber: memberId.slice(0, 8),
      name,
      qualificationLabel: "Supervisor",
      monthlyVp: 0,
      monthlyVpTarget: null,
      metMonthlyVp2500: false,
      productVpStatus: "empty",
      nextQualification: {
        nextRankLabel: null,
        currentSummary: null,
        remainingSummary: null,
      },
      directDownlineCount: children.length,
      monthlyPoints: 0,
      lifetimePoints: 0,
      availablePoints: 0,
      streakMultiplier: 1,
    },
    children,
  };
}

describe("REQUIRED — Production-shaped Product VP 2338.85 end-to-end", () => {
  it("payload parse → authoritative VP = 2338.85 (decimals preserved)", () => {
    const payload = productionChenRetailPayload();
    expect(payload).toHaveLength(10);

    const loaded = resolveAuthoritativeRetailTransactionsFromPayloads({
      ownerMemberId: CHEN,
      events: [],
      legacyTransactions: payload,
    });
    expect(loaded.transactions).toHaveLength(10);

    const vp = calculateMonthlyProductVp({
      memberId: CHEN,
      yearMonth: "2026-08",
      transactions: loaded.transactions,
    });
    expect(vp).toBe(2338.85);
  });

  it("string amount coercion still yields 2338.85", () => {
    const payload = productionChenRetailPayload().map((row) => ({
      ...row,
      amount: String(row.amount) as unknown as number,
      metadata: {
        ...row.metadata,
        retailVp:
          row.metadata?.retailVp != null
            ? (String(row.metadata.retailVp) as unknown as number)
            : row.metadata?.retailVp,
      },
    }));
    const loaded = resolveAuthoritativeRetailTransactionsFromPayloads({
      ownerMemberId: CHEN,
      events: [],
      legacyTransactions: payload as unknown as RetailTransaction[],
    });
    expect(loaded.transactions).toHaveLength(10);
    expect(
      calculateMonthlyProductVp({
        memberId: CHEN,
        yearMonth: "2026-08",
        transactions: loaded.transactions,
      }),
    ).toBe(2338.85);
  });

  it("cloud payload → buildDownlineEntry → batch → enrich → Partner Detail = 2338.85", () => {
    const payload = productionChenRetailPayload();
    const cache: DownlineCloudDataCache = new Map([
      [CHEN, buildDownlineEntry(CHEN, [], payload, [])],
    ]);

    expect(cache.get(CHEN)?.legacyRetailTransactions).toHaveLength(10);
    expect(getDownlineMonthlyProductVp(CHEN, "2026-08", cache)).toBe(2338.85);
    expect(getDownlineMonthlyProductVpResult(CHEN, "2026-08", cache).status).toBe("ok");
    expect(getDownlineMonthlyProductVpResult(CHEN, "2026-08", cache).monthlyTotal).toBe(2338.85);

    const enriched = enrichOrganizationRootsWithProductVp({
      roots: [orgNode(VIEWER, "Upline", [orgNode(CHEN, "陳佳昱")])],
      members: [],
      storage: memoryStorage(),
      viewerId: VIEWER,
      yearMonth: "2026-08",
      downlineCache: cache,
      downlineIds: [VIEWER, CHEN],
    });

    const detail = findMemberSubtree(enriched, CHEN);
    expect(detail?.member.monthlyVp).toBe(2338.85);
    expect(detail?.member.productVpStatus).toBe("ready");

    // Cross-screen: Organization node VP === Partner Detail VP === cloud calc
    expect(enriched[0]?.children[0]?.member.monthlyVp).toBe(2338.85);
    expect(detail?.member.monthlyVp).toBe(
      getDownlineMonthlyProductVp(CHEN, "2026-08", cache),
    );
  });

  it("RLS migration aligns sponsor walk with Organization tree and key allowlist", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/072_member_app_data_downline_sponsor_rls.sql"),
      "utf8",
    );
    expect(sql).toContain("sponsor_member_number");
    expect(sql).toContain("organization_relationships");
    expect(sql).toContain("member_app_data_select_downline");
    expect(sql).toContain("on conflict (parent_member_number, child_member_number) do nothing");
    expect(sql).toContain("'baki-go:baki-events'");
    expect(sql).toContain("'baki-go:retail-transactions'");
    expect(sql).toContain("'baki-go:retail-pipeline-leads'");
    expect(sql).toContain("with recursive downline(id, member_number) as");
    expect(sql).toMatch(/join\s+lateral\s*\(/i);
    expect(sql).not.toContain("'baki-go:calendar-events'");
  });
});
