"use client";

import { getCurrentMember, resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { canEditMemberRecord, canViewMemberRecord } from "@/lib/auth/member-management-access";
import { getCustomerLinkedToMember } from "@/lib/customers/customer-member-bridge";
import {
  formatJoinedDate,
  formatShortDate,
  loadMemberMetrics,
} from "@/lib/mission-control/format";
import {
  getCoachName,
  getMemberDisplayName,
  getMemberProfileFields,
  getReferrerName,
  loadAllMembers,
} from "@/lib/members/member-service";
import {
  buildMemberTimeline,
  selectMemberDashboard,
} from "@/lib/members/workspace-selectors";
import { todayISODate } from "@/lib/config/app-config";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createMemberWorkspaceRepository } from "@/lib/repositories/member-workspace-repository";
import {
  getPartnerCareMeta,
  upsertPartnerCareMeta,
} from "@/lib/repositories/partner-care-meta-repository";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Member } from "@/types/member";
import type { MemberWorkspaceData } from "@/types/member-workspace";
import type { Customer } from "@/types/customer";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmCard, CrmField, CrmInput, CrmSectionTitle } from "./ui";
import { ProgressBar } from "@/components/home/ui";
import { PageShell } from "@/components/ui/PageShell";
import { PageLoadingState } from "@/components/ui/PageStates";
import { APP_ICON } from "@/lib/ui/app-icons";
import { CoachNoteSection, parseFollowUpItems } from "./workspace/CoachNoteSection";
import { InBodySection, parseInBodyNumber } from "./workspace/InBodySection";
import { MemberDashboard } from "./workspace/MemberDashboard";
import { MemberTimelineSection } from "./workspace/MemberTimelineSection";
import { ProgressPhotoSection } from "./workspace/ProgressPhotoSection";

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function MemberDetailPage({ memberId }: { memberId: string }) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const viewerId = resolveAuthenticatedMemberId(storage);
  const isSelfView = memberId === viewerId;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [member, setMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [workspace, setWorkspace] = useState<MemberWorkspaceData>({
    inBodyRecords: [],
    progressPhotos: [],
    coachNotes: [],
  });
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const [lastContactDate, setLastContactDate] = useState<string | undefined>();
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string | undefined>();

  const today = todayISODate();

  const load = useCallback(() => {
    setLoadState("loading");
    try {
      const storage = createLocalStorageAdapter();
      const allMembers = loadAllMembers(storage);
      const found = createMemberRepository(storage).getById(memberId);

      if (!found) {
        setLoadState("not-found");
        return;
      }

      const viewer = getCurrentMember(storage);
      if (viewer && !canViewMemberRecord(viewer, memberId, allMembers)) {
        setLoadState("not-found");
        return;
      }

      const snapshot = loadMemberMetrics(memberId, storage);
      const workspaceData = createMemberWorkspaceRepository(storage).loadWorkspace(memberId);

      setMember(found);
      setMembers(allMembers);
      setMetrics(snapshot);
      setWorkspace(workspaceData);
      const meta = getPartnerCareMeta(storage, memberId);
      setLastContactDate(meta?.lastContactDate);
      setNextFollowUpDate(meta?.nextFollowUpDate);
      setLinkedCustomer(getCustomerLinkedToMember(memberId, storage) ?? null);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [memberId]);

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, [load]);

  const reloadWorkspace = useCallback(() => {
    const storage = createLocalStorageAdapter();
    setWorkspace(createMemberWorkspaceRepository(storage).loadWorkspace(memberId));
  }, [memberId]);

  const dashboard = useMemo(
    () => (metrics ? selectMemberDashboard(metrics, workspace) : null),
    [metrics, workspace],
  );

  const timeline = useMemo(
    () => (metrics ? buildMemberTimeline(metrics, workspace) : []),
    [metrics, workspace],
  );

  if (loadState === "loading") {
    return <PageLoadingState message="載入夥伴資料…" />;
  }

  if (loadState === "not-found") {
    return (
      <PageShell backHref="/profile" backLabel="返回" title="夥伴關懷" variant="plain">
        <p className="text-[0.9375rem] text-[#86868b]">找不到這位夥伴。</p>
      </PageShell>
    );
  }

  if (loadState === "error" || !member || !metrics || !dashboard) {
    return (
      <PageShell backHref="/profile" backLabel="返回" title="夥伴關懷" variant="plain">
        <p className="text-[0.9375rem] text-[#86868b]">無法載入夥伴資料。</p>
        <button className="mt-3 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]" onClick={load} type="button">
          重新載入
        </button>
      </PageShell>
    );
  }

  const profile = getMemberProfileFields(member, members);
  const workspaceRepo = createMemberWorkspaceRepository(createLocalStorageAdapter());
  const viewer = getCurrentMember(createLocalStorageAdapter());
  const canEdit = viewer ? canEditMemberRecord(viewer, member.id, members) : false;
  const partnerCareBackHref = isSelfView ? "/profile" : canEdit ? "/members" : "/organization";
  const partnerCareBackLabel = isSelfView ? "返回我的" : canEdit ? "返回夥伴列表" : "返回組織圖";

  function handleMarkContacted() {
    const meta = upsertPartnerCareMeta(storage, memberId, { lastContactDate: today });
    setLastContactDate(meta.lastContactDate);
  }

  function handleFollowUpDateChange(value: string) {
    const meta = upsertPartnerCareMeta(storage, memberId, {
      nextFollowUpDate: value || undefined,
    });
    setNextFollowUpDate(meta.nextFollowUpDate);
  }

  return (
    <PageShell
      backHref={partnerCareBackHref}
      backLabel={partnerCareBackLabel}
      headerExtra={
        !isSelfView && canEdit ? (
          <Link
            className="rounded-full bg-[var(--brand-bg)] px-4 py-2.5 text-[0.875rem] font-medium text-[#636366]"
            href={`/members/${member.id}/edit`}
          >
            編輯
          </Link>
        ) : null
      }
      subtitle={`${profile.rankLabel} · ${profile.statusLabel}`}
      title={getMemberDisplayName(member)}
      titleIcon={APP_ICON.section.organization}
      variant="plain"
    >
      {!isSelfView && canEdit ? (
        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
                聯絡紀錄
              </p>
              <p className="mt-2 text-[0.9375rem] text-[#1d1d1f]">
                {lastContactDate ? `上次聯絡 ${formatShortDate(lastContactDate)}` : "尚未記錄聯絡"}
              </p>
            </div>
            <button
              className="shrink-0 rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-2.5 text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
              onClick={handleMarkContacted}
              type="button"
            >
              今天已聯絡
            </button>
          </div>
          <div className="mt-4">
            <CrmInput
              label="下次追蹤日"
              onChange={(event) => handleFollowUpDateChange(event.target.value)}
              type="date"
              value={nextFollowUpDate ?? ""}
            />
          </div>
        </section>
      ) : null}

      {linkedCustomer ? (
        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] p-5">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[var(--brand-primary-dark)]">
            關聯顧客檔案
          </p>
          <p className="mt-2 text-[0.9375rem] text-[#1d1d1f]">
            此夥伴對應顧客「{linkedCustomer.displayName}」
          </p>
          <Link
            className="mt-3 inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
            href={`/customers/${linkedCustomer.id}`}
          >
            查看顧客檔案 →
          </Link>
        </section>
      ) : null}

      <MemberDashboard dashboard={dashboard} />

        <InBodySection
          records={workspace.inBodyRecords}
          today={today}
          onCreate={(values) => {
            workspaceRepo.createInBodyRecord({
              memberId,
              recordDate: values.recordDate,
              heightCm: parseInBodyNumber(values.heightCm),
              weightKg: parseInBodyNumber(values.weightKg),
              skeletalMuscleKg: parseInBodyNumber(values.skeletalMuscleKg),
              bodyFatKg: parseInBodyNumber(values.bodyFatKg),
              bmi: parseInBodyNumber(values.bmi),
              bodyFatPercent: parseInBodyNumber(values.bodyFatPercent),
              visceralFatLevel: parseInBodyNumber(values.visceralFatLevel),
              basalMetabolicRate: parseInBodyNumber(values.basalMetabolicRate),
              bodyAge: parseInBodyNumber(values.bodyAge),
              note: values.note.trim() || undefined,
            });
            reloadWorkspace();
          }}
        />

        <ProgressPhotoSection
          photos={workspace.progressPhotos}
          today={today}
          onCreate={(values) => {
            workspaceRepo.createProgressPhoto({
              memberId,
              photoDate: values.photoDate,
              angle: values.angle,
              imageDataUrl: values.imageDataUrl,
              note: values.note.trim() || undefined,
            });
            reloadWorkspace();
          }}
        />

        <CoachNoteSection
          notes={workspace.coachNotes}
          today={today}
          onCreate={(values) => {
            workspaceRepo.createCoachNote({
              memberId,
              noteDate: values.noteDate,
              category: values.category,
              content: values.content.trim(),
              followUpItems: parseFollowUpItems(values.followUpItems),
            });
            reloadWorkspace();
          }}
          onUpdate={(noteId, values) => {
            workspaceRepo.updateCoachNote(noteId, {
              noteDate: values.noteDate,
              category: values.category,
              content: values.content.trim(),
              followUpItems: parseFollowUpItems(values.followUpItems),
            });
            reloadWorkspace();
          }}
        />

        <MemberTimelineSection timeline={timeline} />

        <CrmCard>
          <CrmSectionTitle>基本資料</CrmSectionTitle>
          <dl className="mt-4">
            <CrmField label="姓名" value={member.displayName} />
            <CrmField label="暱稱" value={member.nickname} />
            <CrmField label="性別" value={member.gender} />
            <CrmField
              label="生日"
              value={member.birthday ? formatJoinedDate(member.birthday) : null}
            />
            <CrmField label="電話" value={member.phone} />
            <CrmField label="LINE" value={member.lineId} />
            <CrmField label="Instagram" value={member.instagram} />
            <CrmField label="電子郵件" value={member.email} />
            <CrmField label="加入日期" value={formatJoinedDate(member.joinedAt)} />
            <CrmField label="推薦人" value={getReferrerName(member, members)} />
            <CrmField label="教練" value={getCoachName(member, members)} />
            <CrmField label="城市" value={member.city} />
            <CrmField label="職業" value={member.occupation} />
            <CrmField label="目標" value={member.goal} />
            <CrmField label="標籤" value={member.tags.length > 0 ? member.tags.join("、") : null} />
            <CrmField label="備註" value={member.notes} />
          </dl>
        </CrmCard>

        <CrmCard>
          <CrmSectionTitle>成交紀錄</CrmSectionTitle>
          <div className="mt-4 space-y-4">
            {metrics.retailWeeklyReport.categories.some((category) => category.weeklyItems.length > 0) ? (
              metrics.retailWeeklyReport.categories.map((category) =>
                category.weeklyItems.length > 0 ? (
                  <div key={category.transactionTypeKey}>
                    <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{category.title}</p>
                    <ul className="mt-2 space-y-2">
                      {category.weeklyItems.map((item) => (
                        <li
                          key={item.transactionId}
                          className="flex items-center justify-between rounded-2xl bg-[var(--brand-bg)] px-4 py-3 text-[0.875rem]"
                        >
                          <span className="text-[#1d1d1f]">{item.customerName}</span>
                          <span className="text-[#86868b]">
                            {formatShortDate(item.transactionDate)} · {item.amount} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )
            ) : (
              <p className="text-[0.9375rem] text-[#86868b]">尚無成交紀錄</p>
            )}
            <Link
              className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
              href="/events"
            >
              新增成交 →
            </Link>
          </div>
        </CrmCard>

        <CrmCard>
          <CrmSectionTitle>晉升資格</CrmSectionTitle>
          <div className="mt-4 space-y-3">
            {metrics.qualificationResults.map((result) => (
              <article key={result.ruleKey} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
                <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{result.name}</p>
                <p className="mt-1 text-[0.875rem] text-[#86868b]">
                  {result.isQualified ? "已符合" : "進行中"}
                  {result.overallProgressPercent !== null
                    ? ` · ${result.overallProgressPercent}%`
                    : ""}
                </p>
                {result.overallProgressPercent !== null ? (
                  <div className="mt-2">
                    <ProgressBar color="#77b539" percent={result.overallProgressPercent} />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </CrmCard>

        <CrmCard>
          <CrmSectionTitle>零售屋</CrmSectionTitle>
          <p className="mt-4 text-[0.9375rem] text-[#86868b]">
            本月零售 {metrics.retailHouse.houses[0]?.transactionCount ?? 0} 筆 ·{" "}
            {metrics.retailHouse.houses[0]?.totalAmount ?? 0} NT$
          </p>
          <Link
            className="mt-3 inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
            href="/retail-house"
          >
            開啟零售屋 →
          </Link>
        </CrmCard>
    </PageShell>
  );
}
