/**
 * Organization tree enrichment with canonical Product VP.
 * Isolated from core org snapshot fetch so enrichment failures cannot blank the page.
 *
 * Intentionally avoids importing organization-selectors / member-service / app-config
 * (circular APP_IDS init). Callers inject qualification helpers when needed.
 */

import {
  getDownlineEvents,
  getDownlineMonthlyProductVpBatch,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import {
  DEFAULT_VP_RULES,
  resolveVpTargetAmount,
  VP_TARGET_KEYS,
} from "@/lib/business-engine/rules/vp";
import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { resolveMonthlyProductVpFromEvents } from "@/lib/retail-house/downline-product-vp";
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

/**
 * Product VP for org nodes comes from Retail House transaction events —
 * viewer: local events; downline: cloud batch projection (not metrics.vp).
 * Never throws — returns 0 on enrichment failure.
 */
export function resolveNodeProductVp(input: {
  memberId: EntityId;
  viewerId: EntityId;
  yearMonth: YearMonth;
  downlineProductVp: Map<EntityId, number>;
  storage: StorageAdapter;
}): number {
  try {
    if (input.memberId === input.viewerId) {
      const localEvents = createEventRepository(input.storage).getByMemberId(input.memberId);
      return resolveMonthlyProductVpFromEvents({
        memberId: input.memberId,
        yearMonth: input.yearMonth,
        events: localEvents,
      });
    }
    return input.downlineProductVp.get(input.memberId) ?? 0;
  } catch (error) {
    console.error("[organization] product_vp_node_failure", {
      memberId: input.memberId,
      error,
    });
    return 0;
  }
}

export function mergeCloudTreeWithLocalMetrics(
  node: OrganizationTreeNode,
  members: Member[],
  storage: StorageAdapter,
  viewerId: EntityId,
  yearMonth: YearMonth,
  downlineProductVp: Map<EntityId, number>,
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
    const monthlyVp = resolveNodeProductVp({
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
      monthlyVpTarget,
      metMonthlyVp2500: monthlyVpTarget !== null ? monthlyVp >= monthlyVpTarget : false,
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
 * Enrich organization roots with downline Product VP.
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
  let downlineProductVp = new Map<EntityId, number>();
  try {
    downlineProductVp = getDownlineMonthlyProductVpBatch(
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
