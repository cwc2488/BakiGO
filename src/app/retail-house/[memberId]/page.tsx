"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RetailHousePage from "@/components/retail-house/RetailHousePage";
import { PageShell } from "@/components/ui/PageShell";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageStates";
import { getCurrentMember } from "@/lib/auth/auth-service";
import { canViewDownlineMemberData } from "@/lib/partner-v2/downline-access";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { loadAllMembers, getMemberDisplayName } from "@/lib/members/member-service";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { APP_ICON } from "@/lib/ui/app-icons";

type LoadState = "loading" | "ready" | "forbidden" | "error";

export default function DownlineRetailHouseRoute() {
  const params = useParams<{ memberId: string }>();
  const memberId = params.memberId;
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [displayName, setDisplayName] = useState("");

  const verify = useCallback(async () => {
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

      setDisplayName(getMemberDisplayName(target));
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [memberId, storage]);

  useEffect(() => {
    void verify();
  }, [verify]);

  if (loadState === "loading") {
    return <PageLoadingState message="載入零售屋…" />;
  }

  if (loadState === "forbidden") {
    return (
      <PageShell backHref="/retail-house" backLabel="返回零售屋" title="無法查看" titleIcon={APP_ICON.page.retailHouse}>
        <p className="text-[0.9375rem] text-[var(--pv2-text-secondary)]">
          你沒有權限查看這位夥伴的零售屋。
        </p>
      </PageShell>
    );
  }

  if (loadState === "error") {
    return <PageErrorState onRetry={verify} title="零售屋" />;
  }

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-[var(--pv2-border-subtle)] bg-[var(--pv2-brand-primary-muted)] px-5 py-3">
        <p className="home-container text-[0.8125rem] font-medium text-[var(--pv2-brand-primary-dark)]">
          正在查看：<span className="font-semibold">{displayName}</span> 的零售屋（唯讀）
        </p>
        <Link
          className="home-container mt-1 inline-flex text-[0.8125rem] font-semibold text-[var(--pv2-text-secondary)]"
          href={`/partners/${memberId}`}
        >
          ← 返回夥伴進度
        </Link>
      </div>
      <RetailHousePage readOnly viewMemberId={memberId} />
    </>
  );
}
