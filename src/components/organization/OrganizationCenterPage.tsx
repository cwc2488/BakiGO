"use client";

import { getCurrentMember, getCurrentSession } from "@/lib/auth/auth-service";
import {
  canAdjustDownlineRank,
  getVisibleMembers,
} from "@/lib/auth/organization-access";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { buildViewerCloudOrganizationSnapshot } from "@/lib/cloud/build-cloud-organization-tree";
import {
  collectMemberIdsFromTree,
  fetchDownlineCloudData,
  getDownlineEvents,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { todayISODate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import { loadMemberMetrics } from "@/lib/mission-control/format";
import { findMemberSubtree } from "@/lib/organization/organization-selectors";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { OrganizationCenterSnapshot, OrganizationTreeNode } from "@/types/organization-center";
import type { Member } from "@/types/member";
import { PageShell } from "@/components/ui/PageShell";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageStates";
import { APP_ICON } from "@/lib/ui/app-icons";
import { PARTNER_LABELS } from "@/lib/ui/partner-labels";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationMemberDetail } from "./OrganizationMemberDetail";
import {
  collectDefaultExpandedIds,
  OrganizationTreeDiagram,
} from "./OrganizationTreeDiagram";

type LoadState = "loading" | "ready" | "error";

function mergeCloudTreeWithLocalMetrics(
  node: OrganizationTreeNode,
  members: Member[],
  storage: ReturnType<typeof createLocalStorageAdapter>,
  downlineCache?: DownlineCloudDataCache,
): OrganizationTreeNode {
  const localMember = members.find((member) => member.id === node.member.memberId);
  const supplementalEvents = getDownlineEvents(node.member.memberId, downlineCache);
  const metrics = localMember
    ? loadMemberMetrics(localMember.id, storage, supplementalEvents)
    : supplementalEvents.length > 0
      ? loadMemberMetrics(node.member.memberId, storage, supplementalEvents)
      : null;

  const mergedMember = metrics
    ? {
        ...node.member,
        memberNumber: node.member.memberNumber || localMember?.herbalifeMemberId || "",
        monthlyVp: metrics.productVp?.monthlyTotal ?? metrics.vp.totalVp,
        metMonthlyVp2500: node.member.monthlyVpTarget
          ? (metrics.productVp?.monthlyTotal ?? metrics.vp.totalVp) >=
            node.member.monthlyVpTarget
          : false,
      }
    : {
        ...node.member,
        memberNumber: node.member.memberNumber || localMember?.herbalifeMemberId || "",
      };

  return {
    member: mergedMember,
    children: node.children.map((child) =>
      mergeCloudTreeWithLocalMetrics(child, members, storage, downlineCache),
    ),
  };
}

export default function OrganizationCenterPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [snapshot, setSnapshot] = useState<OrganizationCenterSnapshot | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [viewer, setViewer] = useState<Member | null>(null);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [downlineCache, setDownlineCache] = useState<DownlineCloudDataCache>(() => new Map());

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const storage = createLocalStorageAdapter();
      const session = getCurrentSession(storage);
      if (!session) {
        setLoadState("error");
        return;
      }

      await syncCloudMembersToLocalStorage(storage);

      const viewer = getCurrentMember(storage);
      if (!viewer) {
        setLoadState("error");
        return;
      }

      const { members: cloudMembers, relationships } = await fetchCloudOrganizationData();
      const viewerCloud = cloudMembers.find((member) => member.id === session.memberId);
      if (!viewerCloud) {
        setLoadState("error");
        return;
      }

      const cloudSnapshot = buildViewerCloudOrganizationSnapshot({
        viewerMemberNumber: viewerCloud.memberNumber,
        members: cloudMembers,
        relationships,
        referenceDate: todayISODate(),
      });

      const localMembers = loadAllMembers(storage);
      const visibleMembers = getVisibleMembers(viewer, localMembers);

      const downlineIds = cloudSnapshot.roots.flatMap((root) => collectMemberIdsFromTree(root));
      const cloudCache = await fetchDownlineCloudData(downlineIds, session.memberId);
      setDownlineCache(cloudCache);

      const mergedRoots = cloudSnapshot.roots.map((root) =>
        mergeCloudTreeWithLocalMetrics(root, visibleMembers, storage, cloudCache),
      );

      const nextSnapshot: OrganizationCenterSnapshot = {
        referenceDate: cloudSnapshot.referenceDate,
        rootMemberId: cloudSnapshot.rootMemberId,
        roots: mergedRoots,
        totalMembers: cloudSnapshot.totalMembers,
        computedAt: cloudSnapshot.computedAt,
      };

      setSnapshot(nextSnapshot);
      setViewer(viewer);
      setAllMembers(localMembers);
      setExpandedIds(collectDefaultExpandedIds(nextSnapshot.roots, 2));
      setSelectedMemberId(viewer.id);
      setLoadState("ready");
    } catch {
      setSnapshot(null);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const selectedNode = useMemo(() => {
    if (!snapshot || !selectedMemberId) {
      return null;
    }
    return findMemberSubtree(snapshot.roots, selectedMemberId);
  }, [snapshot, selectedMemberId]);

  const expandAll = useCallback(() => {
    if (!snapshot) {
      return;
    }
    setExpandedIds(collectDefaultExpandedIds(snapshot.roots, 99));
  }, [snapshot]);

  const canAdjustSelectedRank = useMemo(() => {
    if (!viewer || !selectedMemberId) {
      return false;
    }
    return canAdjustDownlineRank(viewer, selectedMemberId, allMembers);
  }, [allMembers, selectedMemberId, viewer]);

  const toggleExpanded = useCallback((memberId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }, []);

  if (loadState === "loading") {
    return <PageLoadingState message="載入組織圖…" />;
  }

  if (loadState === "error" || !snapshot) {
    return (
      <PageErrorState message="無法載入組織圖" onRetry={() => void load()} title="載入失敗" />
    );
  }

  return (
    <PageShell
      subtitle={`共 ${snapshot.totalMembers} 位夥伴 · 雲端同步 · 自己 → 第一代 → 第二代…`}
      title={PARTNER_LABELS.organization}
      titleIcon={APP_ICON.page.organization}
    >
        <section className="home-section">
          <OrganizationTreeDiagram
            expandedIds={expandedIds}
            onExpandAll={expandAll}
            onSelectMember={setSelectedMemberId}
            onToggleExpand={toggleExpanded}
            roots={snapshot.roots}
            selectedMemberId={selectedMemberId}
          />
        </section>

        {selectedNode ? (
          <section className="home-section">
            <OrganizationMemberDetail
              key={selectedNode.member.memberId}
              canAdjustRank={canAdjustSelectedRank}
              downlineEvents={getDownlineEvents(selectedNode.member.memberId, downlineCache)}
              member={selectedNode.member}
              onRankAdjusted={() => void load()}
            />
          </section>
        ) : null}
    </PageShell>
  );
}
