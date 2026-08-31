"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DownlinePartnersSection } from "@/components/partner-v2/DownlinePartnersSection";
import { PartnerSecondaryButton } from "@/components/partner-v2/PartnerUi";
import { PageShell } from "@/components/ui/PageShell";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageStates";
import { getCurrentMember, getCurrentSession } from "@/lib/auth/auth-service";
import {
  collectMemberIdsFromTree,
  fetchDownlineCloudData,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { buildViewerCloudOrganizationSnapshot } from "@/lib/cloud/build-cloud-organization-tree";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { todayISODate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import {
  buildDirectDownlineProgressRows,
  viewerHasDirectDownline,
} from "@/lib/partner-v2/downline-progress";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { APP_ICON } from "@/lib/ui/app-icons";

type LoadState = "loading" | "ready" | "error" | "empty";

export default function PartnersPage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<ReturnType<typeof buildDirectDownlineProgressRows>>([]);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      await syncCloudMembersToLocalStorage(storage);
      const viewer = getCurrentMember(storage);
      if (!viewer) {
        setLoadState("error");
        return;
      }

      const members = loadAllMembers(storage);
      if (!viewerHasDirectDownline(viewer.id, members)) {
        setLoadState("empty");
        return;
      }

      const referenceDate = todayISODate();
      let downlineCache: DownlineCloudDataCache = new Map();

      try {
        const session = getCurrentSession(storage);
        if (session) {
          const { members: cloudMembers, relationships } = await fetchCloudOrganizationData();
          const viewerCloud = cloudMembers.find((member) => member.id === viewer.id);
          if (viewerCloud) {
            const cloudSnapshot = buildViewerCloudOrganizationSnapshot({
              viewerMemberNumber: viewerCloud.memberNumber,
              members: cloudMembers,
              relationships,
              referenceDate,
            });
            const downlineIds = cloudSnapshot.roots.flatMap((root) =>
              collectMemberIdsFromTree(root),
            );
            downlineCache = await fetchDownlineCloudData(downlineIds, session.memberId);
          }
        }
      } catch {
        // Local-only fallback.
      }

      setRows(
        buildDirectDownlineProgressRows({
          viewerId: viewer.id,
          members,
          referenceDate,
          storage,
          downlineCache,
        }),
      );
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [storage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === "loading") {
    return <PageLoadingState message="載入夥伴進度…" />;
  }

  if (loadState === "error") {
    return <PageErrorState onRetry={load} title="我的夥伴" />;
  }

  if (loadState === "empty") {
    return (
      <PageShell backHref="/" subtitle="查看第一代夥伴的本月行動進度" title="我的夥伴" titleIcon={APP_ICON.page.organization}>
        <p className="rounded-[var(--pv2-radius-lg)] border border-[var(--pv2-border-subtle)] bg-[var(--pv2-surface)] px-5 py-8 text-center text-[0.9375rem] text-[var(--pv2-text-secondary)]">
          目前沒有直接下線夥伴。發展組織後，這裡會顯示夥伴的本月諮詢與量測進度。
        </p>
        <PartnerSecondaryButton href="/organization">查看組織</PartnerSecondaryButton>
      </PageShell>
    );
  }

  return (
    <PageShell backHref="/" subtitle="誰有在行動？誰可能需要協助？" title="我的夥伴" titleIcon={APP_ICON.page.organization}>
      <DownlinePartnersSection rows={rows} />
      <p className="text-[0.8125rem] text-[var(--pv2-text-muted)]">
        點選夥伴可查看詳細進度，或
        <Link className="font-semibold text-[var(--pv2-brand-primary-dark)]" href="/organization">
          {" "}
          開啟組織圖
        </Link>
        。
      </p>
    </PageShell>
  );
}
