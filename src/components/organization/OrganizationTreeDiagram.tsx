"use client";

import { MemberAvatar } from "@/components/members/MemberAvatar";
import type { OrganizationMemberView, OrganizationTreeNode } from "@/types/organization-center";
import { useMemo, useState } from "react";

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 0.72;

function NodeCard({
  member,
  isSelected,
  isExpanded,
  hasChildren,
  isRoot,
  onSelect,
  onToggle,
}: {
  member: OrganizationMemberView;
  isSelected: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  isRoot?: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <button
        className={`relative w-[6.75rem] rounded-xl border px-2 py-2 text-left transition-all duration-200 sm:w-[7.25rem] ${
          isSelected
            ? "border-[var(--brand-primary)] bg-[var(--brand-primary-light)] shadow-[0_4px_16px_rgba(119,181,57,0.15)]"
            : "border-[var(--brand-border)] bg-[var(--brand-surface)] hover:border-[#b8d4bc]"
        } ${isRoot ? "ring-2 ring-[#1d1d1f]/10" : ""}`}
        onClick={onSelect}
        type="button"
      >
        <span
          className={`absolute right-2 top-2 h-2 w-2 rounded-full ${
            member.metMonthlyVp2500 ? "bg-[#30d158]" : "bg-[#ffd60a]"
          }`}
          title={member.metMonthlyVp2500 ? "本月 VP 達標" : "本月 VP 未達標"}
        />
        <div className="flex justify-center">
          <MemberAvatar avatarUrl={member.avatarUrl} name={member.name} size="sm" />
        </div>
        <p className="mt-2 pr-3 text-[0.8125rem] font-semibold leading-snug text-[#1d1d1f]">
          {member.name}
        </p>
        <p className="mt-0.5 truncate text-[0.625rem] text-[#86868b]">{member.qualificationLabel}</p>
        <p className="mt-1 text-[0.6875rem] font-medium text-[#636366]">{member.monthlyVp} VP</p>
        {hasChildren ? (
          <p className="mt-0.5 text-[0.625rem] text-[#aeaeb2]">
            下線 {member.directDownlineCount} 位
          </p>
        ) : null}
      </button>

      {hasChildren ? (
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "收合下線" : "展開下線"}
          className="mt-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-bg)] text-[0.75rem] font-semibold text-[#636366] transition-colors hover:bg-[var(--brand-border)]"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          type="button"
        >
          {isExpanded ? "−" : "+"}
        </button>
      ) : null}
    </div>
  );
}

function TreeBranch({
  node,
  selectedMemberId,
  expandedIds,
  onSelect,
  onToggle,
  isRoot = false,
}: {
  node: OrganizationTreeNode;
  selectedMemberId: string;
  expandedIds: Set<string>;
  onSelect: (memberId: string) => void;
  onToggle: (memberId: string) => void;
  isRoot?: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.member.memberId);
  const isSelected = selectedMemberId === node.member.memberId;

  return (
    <>
      <NodeCard
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        isRoot={isRoot}
        isSelected={isSelected}
        member={node.member}
        onSelect={() => onSelect(node.member.memberId)}
        onToggle={() => onToggle(node.member.memberId)}
      />

      {hasChildren && isExpanded ? (
        <>
          <div aria-hidden className="h-3 w-px bg-[#d1d1d6]" />
          <div className="relative w-full overflow-x-auto pb-1">
            <ul className="relative inline-flex min-w-full items-start justify-center gap-3 px-2 pt-3">
              <div
                aria-hidden
                className="pointer-events-none absolute left-6 right-6 top-0 h-px bg-[#d1d1d6]"
              />
              {node.children.map((child) => (
                <li key={child.member.memberId} className="relative flex flex-col items-center">
                  <div
                    aria-hidden
                    className="absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-[#d1d1d6]"
                  />
                  <TreeBranch
                    expandedIds={expandedIds}
                    node={child}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    selectedMemberId={selectedMemberId}
                  />
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </>
  );
}

export function collectDefaultExpandedIds(
  roots: OrganizationTreeNode[],
  maxDepth = 2,
): Set<string> {
  const ids = new Set<string>();

  function walk(node: OrganizationTreeNode, depth: number) {
    ids.add(node.member.memberId);
    if (depth < maxDepth) {
      node.children.forEach((child) => walk(child, depth + 1));
    }
  }

  roots.forEach((root) => walk(root, 0));
  return ids;
}

export function OrganizationTreeDiagram({
  roots,
  selectedMemberId,
  expandedIds,
  onSelectMember,
  onToggleExpand,
  onExpandAll,
}: {
  roots: OrganizationTreeNode[];
  selectedMemberId: string;
  expandedIds: Set<string>;
  onSelectMember: (memberId: string) => void;
  onToggleExpand: (memberId: string) => void;
  onExpandAll: () => void;
}) {
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  function adjustZoom(delta: number) {
    setZoom((current) => {
      const next = Math.round((current + delta) * 10) / 10;
      return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-[#86868b]">
          點選節點查看詳情 · ＋／− 展開下線
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-1">
            <button
              aria-label="縮小組織圖"
              className="rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-semibold text-[#636366] disabled:opacity-40"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => adjustZoom(-ZOOM_STEP)}
              type="button"
            >
              −
            </button>
            <span className="min-w-[3rem] px-1 text-center text-[0.75rem] font-medium text-[#86868b]">
              {zoomLabel}
            </span>
            <button
              aria-label="放大組織圖"
              className="rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-semibold text-[#636366] disabled:opacity-40"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => adjustZoom(ZOOM_STEP)}
              type="button"
            >
              +
            </button>
            <button
              className="rounded-lg px-2.5 py-1.5 text-[0.75rem] font-medium text-[var(--brand-primary-dark)]"
              onClick={() => setZoom(ZOOM_DEFAULT)}
              type="button"
            >
              預設
            </button>
          </div>
          <button
            className="shrink-0 text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
            onClick={onExpandAll}
            type="button"
          >
            全部展開
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] px-3 py-4 sm:px-4">
        <div
          className="mx-auto origin-top transition-transform duration-200"
          style={{
            transform: `scale(${zoom})`,
            width: `${100 / zoom}%`,
          }}
        >
          <ul className="inline-flex min-w-full flex-col items-center">
            {roots.map((root) => (
              <li key={root.member.memberId} className="flex flex-col items-center">
                <TreeBranch
                  expandedIds={expandedIds}
                  isRoot
                  node={root}
                  onSelect={onSelectMember}
                  onToggle={onToggleExpand}
                  selectedMemberId={selectedMemberId}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[0.75rem] text-[#86868b]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#30d158]" />
          本月 VP 達標
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffd60a]" />
          本月 VP 未達標
        </span>
      </div>
    </div>
  );
}
