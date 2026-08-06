"use client";

import {
  formatJoinedDate,
  formatShortDate,
  loadMemberMetrics,
} from "@/lib/mission-control/format";
import {
  getCoachName,
  getMemberDisplayName,
  getMemberAvatarUrl,
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
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Member } from "@/types/member";
import type { MemberWorkspaceData } from "@/types/member-workspace";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmCard, CrmField, CrmSectionTitle } from "./ui";
import { ProgressBar } from "@/components/home/ui";
import { CoachNoteSection, parseFollowUpItems } from "./workspace/CoachNoteSection";
import { InBodySection, parseInBodyNumber } from "./workspace/InBodySection";
import { MemberDashboard } from "./workspace/MemberDashboard";
import { MemberTimelineSection } from "./workspace/MemberTimelineSection";
import { ProgressPhotoSection } from "./workspace/ProgressPhotoSection";
import { MemberNameWithAvatar } from "./MemberNameWithAvatar";

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function MemberDetailPage({ memberId }: { memberId: string }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [member, setMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [workspace, setWorkspace] = useState<MemberWorkspaceData>({
    inBodyRecords: [],
    progressPhotos: [],
    coachNotes: [],
  });

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

      const snapshot = loadMemberMetrics(memberId, storage);
      const workspaceData = createMemberWorkspaceRepository(storage).loadWorkspace(memberId);

      setMember(found);
      setMembers(allMembers);
      setMetrics(snapshot);
      setWorkspace(workspaceData);
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
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
        載入中…
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-[var(--brand-bg)] px-6">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">找不到會員</p>
        <Link className="text-[var(--brand-primary-dark)]" href="/members">
          返回會員列表
        </Link>
      </div>
    );
  }

  if (loadState === "error" || !member || !metrics || !dashboard) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-[var(--brand-bg)] px-6">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">無法載入會員資料</p>
        <button className="text-[var(--brand-primary-dark)]" onClick={load} type="button">
          重新載入
        </button>
      </div>
    );
  }

  const profile = getMemberProfileFields(member, members);
  const workspaceRepo = createMemberWorkspaceRepository(createLocalStorageAdapter());

  return (
    <div className="min-h-full bg-[var(--brand-bg)]">
      <main className="profile-container flex flex-col gap-6 pb-24 pt-10 sm:pt-12">
        <header className="space-y-3">
          <Link className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]" href="/members">
            ← 返回會員列表
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <MemberNameWithAvatar
                avatarUrl={getMemberAvatarUrl(member)}
                name={getMemberDisplayName(member)}
                nameClassName="text-[2rem] font-semibold tracking-tight text-[#1d1d1f]"
                size="xl"
                subtitle={`${profile.rankLabel} · ${profile.statusLabel}`}
                subtitleClassName="text-[1rem] text-[#86868b]"
                variant="hero"
              />
            </div>
            <Link
              className="rounded-full bg-[var(--brand-bg)] px-4 py-2 text-[0.875rem] font-medium text-[#636366]"
              href={`/members/${member.id}/edit`}
            >
              編輯
            </Link>
          </div>
        </header>

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
      </main>
    </div>
  );
}
