"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import {
  TRANSFORMATION_LEAD_STATUS_LABEL,
  TRANSFORMATION_LEAD_STATUSES,
  type TransformationLeadStatus,
} from "@/lib/transformation/transformation-contract";
import type { TransformationLeadRecord, TransformationShareLinkView } from "@/lib/transformation/transformation-service";

function formatLeadCreatedAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

export function AdminTransformationPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"" | TransformationLeadStatus>("");
  const [leads, setLeads] = useState<TransformationLeadRecord[]>([]);
  const [shareLink, setShareLink] = useState<TransformationShareLinkView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TransformationLeadRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [successHint, setSuccessHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const [leadsRes, shareRes] = await Promise.all([
        fetchWithMemberAuth(`/api/admin/transformation/leads${query}`),
        fetchWithMemberAuth("/api/admin/transformation/share"),
      ]);
      const leadsPayload = (await leadsRes.json()) as {
        ok?: boolean;
        leads?: TransformationLeadRecord[];
        error?: string;
      };
      const sharePayload = (await shareRes.json()) as {
        ok?: boolean;
        link?: TransformationShareLinkView;
        error?: string;
      };
      if (!leadsRes.ok || !leadsPayload.ok) {
        throw new Error(leadsPayload.error ?? "無法載入體態改造名單");
      }
      setLeads(leadsPayload.leads ?? []);
      if (shareRes.ok && sharePayload.ok && sharePayload.link) {
        setShareLink(sharePayload.link);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入體態改造名單");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCopyLink = async () => {
    if (!shareLink?.href) return;
    try {
      await navigator.clipboard.writeText(shareLink.href);
      setCopyHint("已複製廣告連結");
      setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint("無法複製，請手動選取連結");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth(`/api/admin/transformation/leads/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "刪除失敗");
      }
      setLeads((current) => current.filter((lead) => lead.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSuccessHint("已刪除名單");
      setTimeout(() => setSuccessHint(null), 2500);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "刪除失敗");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <PageShell
      title="體態改造名單"
      subtitle="Owner-only 體態改造模特兒獲取名單。"
      backHref="/admin"
      backLabel="返回管理中心"
      variant="plain"
    >
      {shareLink ? (
        <BrandCard variant="bordered" className="space-y-2">
          <p className="text-[0.8125rem] font-medium text-[#248a3d]">廣告分享連結</p>
          <p className="break-all text-[0.875rem] text-[#1d1d1f]">{shareLink.display}</p>
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[0.8125rem] font-semibold text-white"
          >
            複製連結
          </button>
          {copyHint ? <p className="text-[0.8125rem] text-[#248a3d]">{copyHint}</p> : null}
        </BrandCard>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block text-[0.8125rem] text-[#86868b]">
          狀態篩選
          <select
            className="mt-1.5 min-h-9 w-full rounded-xl border border-[#eadfd6] bg-white px-3 text-[0.875rem] text-[#1d1d1f] sm:w-56"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "" | TransformationLeadStatus)}
          >
            <option value="">全部狀態</option>
            {TRANSFORMATION_LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TRANSFORMATION_LEAD_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[0.8125rem] text-[#86868b]">共 {leads.length} 筆</p>
      </div>

      {successHint ? <p className="text-sm text-[#248a3d]">{successHint}</p> : null}
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}

      {loading ? (
        <BrandCard>
          <p className="text-sm text-[#86868b]">載入中…</p>
        </BrandCard>
      ) : leads.length === 0 ? (
        <BrandCard variant="bordered">
          <p className="text-[0.9375rem] leading-7 text-[#86868b]">目前沒有符合條件的名單。</p>
        </BrandCard>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#eadfd6] bg-white">
          <table className="w-full min-w-[960px] border-collapse text-left text-[0.8125rem] leading-tight text-[#1d1d1f]">
            <thead className="border-b border-[#eadfd6] bg-[#faf8f6] text-[0.75rem] font-semibold uppercase tracking-wide text-[#86868b]">
              <tr>
                <th className="whitespace-nowrap px-2.5 py-2">建立時間</th>
                <th className="whitespace-nowrap px-2.5 py-2">姓名</th>
                <th className="whitespace-nowrap px-2.5 py-2">手機</th>
                <th className="whitespace-nowrap px-2.5 py-2">LINE / IG</th>
                <th className="whitespace-nowrap px-2.5 py-2">目標</th>
                <th className="min-w-[8rem] px-2.5 py-2">最想改善部位／問題</th>
                <th className="whitespace-nowrap px-2.5 py-2">狀態</th>
                <th className="whitespace-nowrap px-2.5 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="cursor-pointer border-b border-[#f0ebe6] transition-colors hover:bg-[#faf8f6] last:border-b-0"
                  onClick={() => router.push(`/admin/transformation/${lead.id}`)}
                >
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-[#636366]">
                    {formatLeadCreatedAt(lead.createdAt)}
                  </td>
                  <td className="max-w-[6rem] truncate px-2.5 py-1.5 font-medium">{lead.name}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-[#636366]">{lead.phone}</td>
                  <td className="max-w-[5rem] truncate px-2.5 py-1.5 text-[#636366]">
                    {lead.socialContact ?? "—"}
                  </td>
                  <td className="max-w-[5rem] truncate px-2.5 py-1.5">{lead.goal}</td>
                  <td className="max-w-[10rem] truncate px-2.5 py-1.5 text-[#636366]">
                    {truncateText(lead.targetAreaOrProblem, 28)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5">
                    <span className="inline-block rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[0.6875rem] text-[#636366]">
                      {TRANSFORMATION_LEAD_STATUS_LABEL[lead.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/transformation/${lead.id}`}
                        className="text-[0.75rem] font-medium text-[#248a3d] underline-offset-2 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        查看
                      </Link>
                      <button
                        type="button"
                        className="text-[0.75rem] font-medium text-[#b42318] underline-offset-2 hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(lead);
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-lead-title"
          >
            <h2 id="delete-lead-title" className="text-[1rem] font-semibold text-[#1d1d1f]">
              確定刪除？
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-7 text-[#636366]">
              確定要刪除「{deleteTarget.name}」的申請資料嗎？此操作無法復原。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteTarget(null)}
                className="rounded-full border border-[#eadfd6] px-4 py-2 text-[0.8125rem] font-medium text-[#636366]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void handleDeleteConfirm()}
                className="rounded-full bg-[#b42318] px-4 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
