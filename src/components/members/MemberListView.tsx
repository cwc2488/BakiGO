"use client";

import {
  canDeleteMemberRecord,
  loadPartnerCareMembers,
} from "@/lib/auth/member-management-access";
import { getCurrentMember } from "@/lib/auth/auth-service";
import {
  buildDailyPartnerFollowUpSnapshot,
  buildPartnerFollowUpHints,
} from "@/lib/members/partner-follow-up";
import {
  getMemberDisplayName,
  getMemberAvatarUrl,
  getMemberRankLabel,
  MEMBER_STATUS_LABELS,
  searchMembers,
  sortMembers,
  type MemberSortKey,
} from "@/lib/members/member-service";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createMemberWorkspaceRepository } from "@/lib/repositories/member-workspace-repository";
import { getPartnerCareMeta } from "@/lib/repositories/partner-care-meta-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { todayISODate } from "@/lib/config/app-config";
import { PageShell } from "@/components/ui/PageShell";
import { APP_ICON } from "@/lib/ui/app-icons";
import type { Member } from "@/types/member";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CrmButton } from "./ui";
import { MemberNameWithAvatar } from "./MemberNameWithAvatar";

interface PartnerListItem extends Member {
  followUpReason?: string;
  followUpUrgency?: "high" | "medium" | "low";
}

export function MemberListView() {
  const router = useRouter();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const viewer = getCurrentMember(storage);

  const [members, setMembers] = useState<PartnerListItem[]>(() => {
    if (typeof window === "undefined" || !viewer) {
      return [];
    }
    return buildPartnerListItems(viewer, storage);
  });
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<MemberSortKey>("name");
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  function reloadMembers() {
    if (!viewer) {
      setMembers([]);
      return;
    }
    setMembers(buildPartnerListItems(viewer, createLocalStorageAdapter()));
  }

  const dailyFollowUp = useMemo(
    () => (viewer ? buildDailyPartnerFollowUpSnapshot(storage, viewer) : { count: 0, items: [] }),
    [storage, viewer],
  );

  const visibleMembers = useMemo(
    () => sortMembers(searchMembers(members, query), sortKey) as PartnerListItem[],
    [members, query, sortKey],
  );

  function handleDelete() {
    if (!deleteTarget || !viewer) {
      return;
    }

    const allMembers = createMemberRepository(storage).getAll();
    if (!canDeleteMemberRecord(viewer, deleteTarget.id, allMembers)) {
      return;
    }

    createMemberRepository(storage).delete(deleteTarget.id);
    setDeleteTarget(null);
    reloadMembers();
  }

  return (
    <PageShell
      backHref="/profile"
      backLabel="返回個人"
      headerExtra={
        <Link
          className="rounded-full bg-[var(--brand-primary)] px-5 py-3 text-[0.875rem] font-semibold text-white"
          href="/members/new"
        >
          新增
        </Link>
      }
      subtitle={`${members.length} 位下線夥伴 · 體組成與教練筆記`}
      title="夥伴關懷"
      titleIcon={APP_ICON.section.organization}
      variant="plain"
    >
      {dailyFollowUp.count > 0 ? (
        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] p-5">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[var(--brand-primary-dark)]">
            今日建議關心
          </p>
          <p className="mt-2 text-[0.9375rem] text-[#1d1d1f]">
            有 {dailyFollowUp.count} 位夥伴值得今天花幾分鐘關心一下。
          </p>
          <ul className="mt-4 space-y-2">
            {dailyFollowUp.items.slice(0, 5).map((item) => (
              <li key={item.member.id}>
                <Link
                  className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3 text-[0.875rem]"
                  href={`/members/${item.member.id}`}
                >
                  <span className="font-medium text-[#1d1d1f]">{getMemberDisplayName(item.member)}</span>
                  <span className="text-[#86868b]">{item.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="space-y-3">
        <input
          className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋姓名、電話、電子郵件、標籤…"
          type="search"
          value={query}
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["name", "姓名"],
              ["joinDate", "加入日期"],
              ["status", "狀態"],
            ] as const
          ).map(([key, label]) => (
            <button
              className={`rounded-full px-4 py-2 text-[0.8125rem] font-medium ${
                sortKey === key
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-[var(--brand-bg)] text-[#636366]"
              }`}
              key={key}
              onClick={() => setSortKey(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {visibleMembers.length > 0 ? (
          visibleMembers.map((member) => {
            const allMembers = createMemberRepository(storage).getAll();
            const canDelete = viewer
              ? canDeleteMemberRecord(viewer, member.id, allMembers)
              : false;

            return (
              <article
                className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5"
                key={member.id}
              >
                <button
                  className="w-full text-left"
                  onClick={() => router.push(`/members/${member.id}`)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <MemberNameWithAvatar
                      avatarUrl={getMemberAvatarUrl(member)}
                      name={getMemberDisplayName(member)}
                      nameClassName="text-[1.125rem] font-semibold text-[#1d1d1f]"
                      size="md"
                      subtitle={
                        <>
                          {getMemberRankLabel(member.rankKey)} · {MEMBER_STATUS_LABELS[member.status]}
                          {member.phone ? (
                            <>
                              <br />
                              <span className="text-[#aeaeb2]">{member.phone}</span>
                            </>
                          ) : null}
                        </>
                      }
                    />
                    {member.followUpReason ? (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[0.75rem] font-medium ${
                          member.followUpUrgency === "high"
                            ? "bg-[#fff1f0] text-[#cf1322]"
                            : member.followUpUrgency === "medium"
                              ? "bg-[#fff7e6] text-[#d46b08]"
                              : "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
                        }`}
                      >
                        {member.followUpReason}
                      </span>
                    ) : (
                      <span className="shrink-0 pt-1 text-[1rem] text-[#c7c7cc]">→</span>
                    )}
                  </div>
                </button>
                <div className="mt-3 flex gap-2">
                  <Link
                    className="rounded-full bg-[var(--brand-bg)] px-4 py-2 text-[0.8125rem] font-medium text-[#636366]"
                    href={`/members/${member.id}/edit`}
                  >
                    編輯
                  </Link>
                  {canDelete ? (
                    <button
                      className="rounded-full bg-[#fff1f0] px-4 py-2 text-[0.8125rem] font-medium text-[#cf1322]"
                      onClick={() => setDeleteTarget(member)}
                      type="button"
                    >
                      刪除
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-[1.75rem] bg-[var(--brand-bg)] px-5 py-8 text-center">
            <p className="text-[1rem] font-semibold text-[#1d1d1f]">尚無可管理的夥伴</p>
            <p className="mt-2 text-[0.875rem] text-[#86868b]">
              這裡會列出你的下線夥伴，方便追蹤體組成與教練筆記。
            </p>
          </div>
        )}
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-5 sm:items-center">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-[var(--brand-surface)] p-6">
            <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">刪除夥伴？</p>
            <p className="mt-2 text-[0.9375rem] text-[#86868b]">
              將刪除 {getMemberDisplayName(deleteTarget)} 的會員資料。紀錄仍會保留。
            </p>
            <div className="mt-5 space-y-2">
              <CrmButton onClick={handleDelete} variant="danger">
                確認刪除
              </CrmButton>
              <CrmButton onClick={() => setDeleteTarget(null)} variant="secondary">
                取消
              </CrmButton>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

function buildPartnerListItems(viewer: Member, storage: ReturnType<typeof createLocalStorageAdapter>): PartnerListItem[] {
  const today = todayISODate();
  const workspaceRepo = createMemberWorkspaceRepository(storage);
  const urgencyRank = { high: 0, medium: 1, low: 2 } as const;

  return loadPartnerCareMembers(viewer, storage)
    .map((member) => {
      const workspace = workspaceRepo.loadWorkspace(member.id);
      const meta = getPartnerCareMeta(storage, member.id);
      const hints = buildPartnerFollowUpHints(member, workspace, meta, today);
      const topHint = hints.sort((left, right) => urgencyRank[left.urgency] - urgencyRank[right.urgency])[0];
      return {
        ...member,
        followUpReason: topHint?.reason,
        followUpUrgency: topHint?.urgency,
      };
    })
    .sort((left, right) => {
      const leftRank = left.followUpUrgency ? urgencyRank[left.followUpUrgency] : 3;
      const rightRank = right.followUpUrgency ? urgencyRank[right.followUpUrgency] : 3;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return getMemberDisplayName(left).localeCompare(getMemberDisplayName(right), "zh-Hant");
    });
}
