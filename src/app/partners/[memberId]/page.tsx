"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import {
  PartnerCard,
  PartnerMetricValue,
  PartnerProgressTrack,
  PartnerSecondaryButton,
  PartnerStatusPill,
} from "@/components/partner-v2/PartnerUi";
import { PageShell } from "@/components/ui/PageShell";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageStates";
import { getCurrentMember } from "@/lib/auth/auth-service";
import { canViewDownlineMemberData } from "@/lib/partner-v2/downline-access";
import { getDownlineEvents } from "@/lib/cloud/downline-cloud-data";
import { fetchDownlineCloudData } from "@/lib/cloud/downline-cloud-data";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { todayISODate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import { buildDownlinePartnerProgressRow } from "@/lib/partner-v2/downline-progress";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { APP_ICON } from "@/lib/ui/app-icons";

type LoadState = "loading" | "ready" | "forbidden" | "error";

export default function PartnerDetailPage() {
  const params = useParams<{ memberId: string }>();
  const memberId = params.memberId;
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [row, setRow] = useState<ReturnType<typeof buildDownlinePartnerProgressRow> | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      await syncCloudMembersToLocalStorage(storage);
      const viewer = getCurrentMember(storage);
      const members = loadAllMembers(storage);
      const target = members.find((member) => member.id === memberId);

      if (!viewer || !target) {
        setLoadState("error");
        return;
      }

      if (!canViewDownlineMemberData(viewer, memberId, members)) {
        setLoadState("forbidden");
        return;
      }

      let downlineCache = await fetchDownlineCloudData([memberId], viewer.id).catch(() => new Map());
      const progressRow = buildDownlinePartnerProgressRow(
        target,
        todayISODate(),
        storage,
        downlineCache,
      );
      setRow(progressRow);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [memberId, storage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === "loading") {
    return <PageLoadingState message="載入夥伴進度…" />;
  }

  if (loadState === "forbidden") {
    return (
      <PageShell backHref="/partners" backLabel="返回夥伴列表" title="無法查看" titleIcon={APP_ICON.page.organization}>
        <p className="text-[0.9375rem] text-[var(--pv2-text-secondary)]">
          你沒有權限查看這位夥伴的資料。
        </p>
      </PageShell>
    );
  }

  if (loadState === "error" || !row) {
    return <PageErrorState onRetry={load} title="夥伴進度" />;
  }

  return (
    <PageShell
      backHref="/partners"
      backLabel="返回夥伴列表"
      subtitle="本月諮詢 / 量測進度（唯讀）"
      title={row.displayName}
      titleIcon={APP_ICON.page.organization}
    >
      <PartnerCard>
        <div className="flex items-center gap-3">
          <MemberAvatar avatarUrl={row.avatarUrl} name={row.displayName} size="md" />
          <div>
            <p className="text-[1.0625rem] font-semibold text-[var(--pv2-text-primary)]">{row.displayName}</p>
            <PartnerStatusPill status={row.status} />
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[0.8125rem] font-medium text-[var(--pv2-text-secondary)]">諮詢</p>
            <PartnerMetricValue current={row.consultationCurrent} target={row.consultationTarget} />
            <div className="mt-2">
              <PartnerProgressTrack percent={row.consultationProgressPercent} />
            </div>
          </div>
          <div>
            <p className="text-[0.8125rem] font-medium text-[var(--pv2-text-secondary)]">量測</p>
            <PartnerMetricValue current={row.measurementCurrent} target={row.measurementTarget} />
            <div className="mt-2">
              <PartnerProgressTrack percent={row.measurementProgressPercent} />
            </div>
          </div>
        </div>
      </PartnerCard>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PartnerSecondaryButton href={`/retail-house/${memberId}`}>
          查看零售屋
        </PartnerSecondaryButton>
        <PartnerSecondaryButton href={`/organization?member=${memberId}`}>
          組織圖
        </PartnerSecondaryButton>
      </div>
    </PageShell>
  );
}
