"use client";

import { getCurrentMember, getCurrentSession } from "@/lib/auth/auth-service";
import { canAdjustDownlineRank } from "@/lib/auth/organization-access";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { buildViewerCloudOrganizationSnapshot } from "@/lib/cloud/build-cloud-organization-tree";
import {
  collectMemberIdsFromTree,
  fetchDownlineCloudData,
  getDownlineEvents,
  resolveYearMonthFromReferenceDate,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { todayISODate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import { enrichOrganizationRootsWithProductVp } from "@/lib/organization/enrich-organization-product-vp";
import {
  buildOrganizationNextQualificationView,
  findMemberSubtree,
  resolveOrganizationQualificationLabel,
} from "@/lib/organization/organization-selectors";
import { loadMemberMetrics } from "@/lib/mission-control/format";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { OrganizationCenterSnapshot } from "@/types/organization-center";
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
        console.error("[organization] organization_fetch_failure", "missing_session");
        setLoadState("error");
        return;
      }

      await syncCloudMembersToLocalStorage(storage);

      const viewer = getCurrentMember(storage);
      if (!viewer) {
        console.error("[organization] organization_fetch_failure", "missing_viewer");
        setLoadState("error");
        return;
      }

      // —— Stage 1: core organization (must succeed for page to load) ——
      const { members: cloudMembers, relationships } = await fetchCloudOrganizationData();
      const viewerCloud = cloudMembers.find((member) => member.id === session.memberId);
      if (!viewerCloud) {
        console.error("[organization] organization_fetch_failure", "viewer_not_in_cloud");
        setLoadState("error");
        return;
      }

      const referenceDate = todayISODate();
      const yearMonth = resolveYearMonthFromReferenceDate(referenceDate);

      const cloudSnapshot = buildViewerCloudOrganizationSnapshot({
        viewerMemberNumber: viewerCloud.memberNumber,
        members: cloudMembers,
        relationships,
        referenceDate,
      });

      const localMembers = loadAllMembers(storage);
      const downlineIds = cloudSnapshot.roots.flatMap((root) => collectMemberIdsFromTree(root));

      // —— Stage 2: downline cloud (isolated — failure → empty cache) ——
      let cloudCache: DownlineCloudDataCache = new Map();
      try {
        cloudCache = await fetchDownlineCloudData(downlineIds, session.memberId);
      } catch (error) {
        console.error("[organization] downline_cloud_failure", error);
        cloudCache = new Map();
      }
      // Enrich from the local cloudCache variable — never from prior React state.
      setDownlineCache(cloudCache);

      // —— Stage 3: Product VP enrichment (isolated — never blanks org) ——
      let mergedRoots = cloudSnapshot.roots;
      try {
        mergedRoots = enrichOrganizationRootsWithProductVp({
          roots: cloudSnapshot.roots,
          members: localMembers,
          storage,
          viewerId: session.memberId,
          yearMonth,
          downlineCache: cloudCache,
          downlineIds,
          loadMetrics: loadMemberMetrics,
          qualificationHelpers: {
            resolveQualificationLabel: resolveOrganizationQualificationLabel,
            buildNextQualification: buildOrganizationNextQualificationView,
          },
        });
      } catch (error) {
        console.error("[organization] product_vp_enrichment_failure", error);
        mergedRoots = cloudSnapshot.roots;
      }

      const nextSnapshot: OrganizationCenterSnapshot = {
        referenceDate: cloudSnapshot.referenceDate,
        rootMemberId: cloudSnapshot.rootMemberId,
        roots: mergedRoots,
        totalMembers: cloudSnapshot.totalMembers,
        computedAt: cloudSnapshot.computedAt,
      };

      // Replace snapshot atomically so selectedNode (derived via useMemo) always
      // reads post-enrichment monthlyVp — never a pre-enrichment 0 placeholder.
      setSnapshot(nextSnapshot);
      setViewer(viewer);
      setAllMembers(localMembers);
      setExpandedIds(collectDefaultExpandedIds(nextSnapshot.roots, 2));
      setSelectedMemberId(viewer.id);
      setLoadState("ready");
    } catch (error) {
      console.error("[organization] organization_fetch_failure", error);
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
