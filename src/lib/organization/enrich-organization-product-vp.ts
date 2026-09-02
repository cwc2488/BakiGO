/**
 * Organization tree enrichment with canonical Product VP.
 * Isolated from core org snapshot fetch so enrichment failures cannot blank the page.
 *
 * Product VP comes only from the authoritative Retail House read layer
 * (events ∪ legacy retailTransactions) — never from qualification metrics.vp.
 */

import {
  getDownlineEvents,
  getDownlineMonthlyProductVpBatchResults,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import {
  DEFAULT_VP_RULES,
  resolveVpTargetAmount,
  VP_TARGET_KEYS,
} from "@/lib/business-engine/rules/vp";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  getAuthoritativeMonthlyProductVp,
  type ProductVpReadResult,
} from "@/lib/retail-house/authoritative-retail-transactions";
import type { Member } from "@/types/member";
import type {
  OrganizationNextQualificationView,
  OrganizationTreeNode,
} from "@/types/organization-center";
import type { EntityId, YearMonth } from "@/types";
import type { BakiEvent } from "@/types/baki-event";

/** Opaque metrics object from loadMemberMetrics — kept structural to avoid circular imports. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OrganizationEnrichmentMetrics = any;

export type OrganizationMetricsLoader = (
  memberId: EntityId,
  storage: StorageAdapter,
  supplementalEvents?: BakiEvent[],
) => OrganizationEnrichmentMetrics | null;

export type OrganizationQualificationHelpers = {
  resolveQualificationLabel: (member: Member, metrics: OrganizationEnrichmentMetrics) => string;
  buildNextQualification: (
    metrics: OrganizationEnrichmentMetrics,
  ) => OrganizationNextQualificationView;
};

function resolveMonthlyVpTarget(): number | null {
  return resolveVpTargetAmount(
    VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_PERSONAL,
    DEFAULT_VP_RULES,
  );
}

function toProductVpStatus(
  result: ProductVpReadResult | undefined,
): "ready" | "empty" | "error" {
  if (!result || result.status === "error") {
    return "error";
  }
  if (result.status === "empty") {
    return "empty";
  }
  return "ready";
}

/**
 * Product VP for org nodes — viewer: local authoritative RH; downline: cloud batch.
 * Never throws. Distinguishes real 0 (ready/empty) from read error.
 */
export function resolveNodeProductVp(input: {
  memberId: EntityId;
  viewerId: EntityId;
  yearMonth: YearMonth;
  downlineProductVp: Map<EntityId, ProductVpReadResult>;
  storage: StorageAdapter;
}): { monthlyVp: number; productVpStatus: "ready" | "empty" | "error" } {
  try {
    if (input.memberId === input.viewerId) {
      const result = getAuthoritativeMonthlyProductVp({
        storage: input.storage,
        memberId: input.memberId,
        yearMonth: input.yearMonth,
      });
      return {
        monthlyVp: result.monthlyTotal ?? 0,
        productVpStatus: toProductVpStatus(result),
      };
    }
    const result = input.downlineProductVp.get(input.memberId);
    return {
      monthlyVp: result?.monthlyTotal ?? 0,
      productVpStatus: toProductVpStatus(result),
    };
  } catch (error) {
    console.error("[organization] product_vp_node_failure", {
      memberId: input.memberId,
      error,
    });
    return { monthlyVp: 0, productVpStatus: "error" };
  }
}

export function mergeCloudTreeWithLocalMetrics(
  node: OrganizationTreeNode,
  members: Member[],
  storage: StorageAdapter,
  viewerId: EntityId,
  yearMonth: YearMonth,
  downlineProductVp: Map<EntityId, ProductVpReadResult>,
  downlineCache?: DownlineCloudDataCache,
  loadMetrics?: OrganizationMetricsLoader,
  qualificationHelpers?: OrganizationQualificationHelpers,
): OrganizationTreeNode {
  try {
    const localMember = members.find((member) => member.id === node.member.memberId);
    const supplementalEvents = getDownlineEvents(node.member.memberId, downlineCache);
    const metricsMemberId = localMember?.id ?? node.member.memberId;

    let metrics: OrganizationEnrichmentMetrics | null = null;
    try {
      if (loadMetrics && (localMember || supplementalEvents.length > 0)) {
        metrics = loadMetrics(metricsMemberId, storage, supplementalEvents);
      }
    } catch (error) {
      console.error("[organization] member_metrics_failure", {
        memberId: metricsMemberId,
        error,
      });
      metrics = null;
    }

    const monthlyVpTarget = resolveMonthlyVpTarget();
    const { monthlyVp, productVpStatus } = resolveNodeProductVp({
      memberId: node.member.memberId,
      viewerId,
      yearMonth,
      downlineProductVp,
      storage,
    });

    const mergedMember = {
      ...node.member,
      memberNumber: node.member.memberNumber || localMember?.herbalifeMemberId || "",
      monthlyVp,
      productVpStatus,
      monthlyVpTarget,
      metMonthlyVp2500:
        productVpStatus === "error"
          ? false
          : monthlyVpTarget !== null
            ? monthlyVp >= monthlyVpTarget
            : false,
      qualificationLabel:
        localMember && metrics && qualificationHelpers
          ? qualificationHelpers.resolveQualificationLabel(localMember, metrics)
          : node.member.qualificationLabel,
      nextQualification:
        metrics && qualificationHelpers
          ? qualificationHelpers.buildNextQualification(metrics)
          : node.member.nextQualification,
    };

    return {
      member: mergedMember,
      children: node.children.map((child) =>
        mergeCloudTreeWithLocalMetrics(
          child,
          members,
          storage,
          viewerId,
          yearMonth,
          downlineProductVp,
          downlineCache,
          loadMetrics,
          qualificationHelpers,
        ),
      ),
    };
  } catch (error) {
    console.error("[organization] tree_node_enrichment_failure", {
      memberId: node.member.memberId,
      error,
    });
    return {
      member: {
        ...node.member,
        monthlyVp: node.member.monthlyVp ?? 0,
        productVpStatus: "error",
      },
      children: node.children.map((child) =>
        mergeCloudTreeWithLocalMetrics(
          child,
          members,
          storage,
          viewerId,
          yearMonth,
          downlineProductVp,
          downlineCache,
          loadMetrics,
          qualificationHelpers,
        ),
      ),
    };
  }
}

/**
 * Enrich organization roots with downline Product VP from authoritative RH sources.
 * Safe: never throws; returns roots with best-effort VP.
 */
export function enrichOrganizationRootsWithProductVp(input: {
  roots: OrganizationTreeNode[];
  members: Member[];
  storage: StorageAdapter;
  viewerId: EntityId;
  yearMonth: YearMonth;
  downlineCache: DownlineCloudDataCache;
  downlineIds: EntityId[];
  loadMetrics?: OrganizationMetricsLoader;
  qualificationHelpers?: OrganizationQualificationHelpers;
}): OrganizationTreeNode[] {
  let downlineProductVp = new Map<EntityId, ProductVpReadResult>();
  try {
    downlineProductVp = getDownlineMonthlyProductVpBatchResults(
      input.downlineIds.filter((id) => id !== input.viewerId),
      input.yearMonth,
      input.downlineCache,
    );
  } catch (error) {
    console.error("[organization] product_vp_enrichment_failure", error);
  }

  return input.roots.map((root) =>
    mergeCloudTreeWithLocalMetrics(
      root,
      input.members,
      input.storage,
      input.viewerId,
      input.yearMonth,
      downlineProductVp,
      input.downlineCache,
      input.loadMetrics,
      input.qualificationHelpers,
    ),
  );
}
