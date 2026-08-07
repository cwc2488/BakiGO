"use client";

import {
  getMemberDisplayName,
  getMemberAvatarUrl,
  getMemberRankLabel,
  loadOperationalMembers,
  MEMBER_STATUS_LABELS,
  searchMembers,
  sortMembers,
  type MemberSortKey,
} from "@/lib/members/member-service";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CrmButton } from "./ui";
import { MemberNameWithAvatar } from "./MemberNameWithAvatar";

export function MemberListView() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    return loadOperationalMembers(createLocalStorageAdapter());
  });
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<MemberSortKey>("name");
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  function reloadMembers() {
    const storage = createLocalStorageAdapter();
    setMembers(loadOperationalMembers(storage));
  }

  const visibleMembers = useMemo(
    () => sortMembers(searchMembers(members, query), sortKey),
    [members, query, sortKey],
  );

  function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    const storage = createLocalStorageAdapter();
    createMemberRepository(storage).delete(deleteTarget.id);
    setDeleteTarget(null);
    reloadMembers();
  }

  return (
    <div className="min-h-full bg-[var(--brand-bg)]">
      <main className="profile-container flex flex-col gap-6 pb-24 pt-10 sm:pt-12">
        <header className="space-y-3">
          <Link className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]" href="/">
            ← 返回首頁
          </Link>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-semibold tracking-tight text-[#1d1d1f]">
                會員管理
              </h1>
              <p className="mt-1 text-[1rem] text-[#86868b]">{members.length} 位會員</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                className="rounded-full border border-[var(--brand-border)] px-5 py-3 text-[0.9375rem] font-semibold text-[#1d1d1f]"
                href="/organization"
              >
                組織圖
              </Link>
              <Link
                className="rounded-full bg-[var(--brand-primary)] px-5 py-3 text-[0.9375rem] font-semibold text-white"
                href="/members/new"
              >
                新增
              </Link>
            </div>
          </div>
        </header>

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
                key={key}
                className={`rounded-full px-4 py-2 text-[0.8125rem] font-medium ${
                  sortKey === key
                    ? "bg-[#1d1d1f] text-white"
                    : "bg-[var(--brand-bg)] text-[#636366]"
                }`}
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
            visibleMembers.map((member) => (
              <article
                key={member.id}
                className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.03)]"
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
                    <span className="shrink-0 pt-1 text-[1rem] text-[#c7c7cc]">→</span>
                  </div>
                </button>
                <div className="mt-3 flex gap-2">
                  <Link
                    className="rounded-full bg-[var(--brand-bg)] px-4 py-2 text-[0.8125rem] font-medium text-[#636366]"
                    href={`/members/${member.id}/edit`}
                  >
                    編輯
                  </Link>
                  <button
                    className="rounded-full bg-[#fff1f0] px-4 py-2 text-[0.8125rem] font-medium text-[#cf1322]"
                    onClick={() => setDeleteTarget(member)}
                    type="button"
                  >
                    刪除
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[1.75rem] bg-[var(--brand-bg)] px-5 py-8 text-center">
              <p className="text-[1rem] font-semibold text-[#1d1d1f]">找不到會員</p>
              <p className="mt-2 text-[0.875rem] text-[#86868b]">
                調整搜尋條件，或建立第一位會員。
              </p>
            </div>
          )}
        </div>

        {deleteTarget ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-5 sm:items-center">
            <div className="w-full max-w-sm rounded-[1.75rem] bg-[var(--brand-surface)] p-6">
              <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">刪除會員？</p>
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
      </main>
    </div>
  );
}
