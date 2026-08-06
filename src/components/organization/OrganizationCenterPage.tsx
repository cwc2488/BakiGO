"use client";

import { getCurrentMember, getCurrentSession } from "@/lib/auth/auth-service";
import {
  canAdjustDownlineRank,
  getVisibleMembers,
} from "@/lib/auth/organization-access";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { buildViewerCloudOrganizationSnapshot } from "@/lib/cloud/build-cloud-organization-tree";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { todayISODate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import { loadMemberMetrics } from "@/lib/mission-control/format";
import { findMemberSubtree } from "@/lib/organization/organization-selectors";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { OrganizationCenterSnapshot, OrganizationTreeNode } from "@/types/organization-center";
import type { Member } from "@/types/member";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import Link from "next/link";
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
): OrganizationTreeNode {
  const localMember = members.find((member) => member.id === node.member.memberId);
  const metrics = localMember ? loadMemberMetrics(localMember.id, storage) : null;

  const mergedMember = metrics
    ? {
        ...node.member,
        monthlyVp: metrics.vp.totalVp,
        metMonthlyVp2500: node.member.monthlyVpTarget
          ? metrics.vp.totalVp >= node.member.monthlyVpTarget
          : false,
        monthlyPoints: metrics.gamification.points.monthlyPoints,
        lifetimePoints: metrics.gamification.points.lifetimePoints,
        availablePoints: metrics.gamification.points.availablePoints,
        streakMultiplier: metrics.gamification.points.streakMultiplier,
      }
    : node.member;

  return {
    member: mergedMember,
    children: node.children.map((child) => mergeCloudTreeWithLocalMetrics(child, members, storage)),
  };
}

export default function OrganizationCenterPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [snapshot, setSnapshot] = useState<OrganizationCenterSnapshot | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [viewer, setViewer] = useState<Member | null>(null);
  const [allMembers, setAllMembers] = useState<Member[]>([]);

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
      const mergedRoots = cloudSnapshot.roots.map((root) =>
        mergeCloudTreeWithLocalMetrics(root, visibleMembers, storage),
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
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
        載入組織圖…
      </div>
    );
  }

  if (loadState === "error" || !snapshot) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-[var(--brand-bg)] px-6">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">
          {APP_EMOJI.mood.error} 無法載入組織圖
        </p>
        <button className="text-[var(--brand-primary-dark)]" onClick={() => void load()} type="button">
          重新載入
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f0faf3_0%,#f5faf6_48%,#e8f8ee_100%)]">
      <main className="home-container flex flex-col gap-5 pb-24 pt-10 sm:pt-12">
        <header className="home-section space-y-3">
          <Link className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]" href="/">
            ← 返回首頁
          </Link>
          <h1 className="text-[2rem] font-semibold tracking-tight text-[#1d1d1f]">
            {APP_EMOJI.page.organization} 組織圖
          </h1>
          <p className="text-[1rem] leading-relaxed text-[#636366]">
            共 {snapshot.totalMembers} 位夥伴 · 雲端同步 · 自己 → 第一代 → 第二代…
          </p>
        </header>

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
            {selectedMemberId === viewer?.id ? (
              <p className="mb-3 rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3 text-[0.875rem] text-[#636366]">
                {APP_EMOJI.action.redeem} 點選組織圖中的下線夥伴，即可為其兌換積分（支援所有世代）。
              </p>
            ) : null}
            <OrganizationMemberDetail
              key={selectedNode.member.memberId}
              canAdjustRank={canAdjustSelectedRank}
              member={selectedNode.member}
              onRankAdjusted={() => void load()}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
