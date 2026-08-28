"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
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

export function AdminTransformationPage() {
  const [statusFilter, setStatusFilter] = useState<"" | TransformationLeadStatus>("");
  const [leads, setLeads] = useState<TransformationLeadRecord[]>([]);
  const [shareLink, setShareLink] = useState<TransformationShareLinkView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

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
            className="mt-1.5 min-h-11 w-full rounded-2xl border border-[#eadfd6] bg-white px-3 text-[0.9375rem] text-[#1d1d1f] sm:w-56"
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
        <ul className="space-y-3">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link href={`/admin/transformation/${lead.id}`} className="block">
                <BrandCard variant="bordered" className="transition-shadow hover:shadow-md active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{lead.name}</h3>
                      <p className="mt-1 text-[0.875rem] text-[#636366]">{lead.goal}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[0.75rem] text-[#636366]">
                      {TRANSFORMATION_LEAD_STATUS_LABEL[lead.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.8125rem] text-[#86868b]">
                    {new Date(lead.createdAt).toLocaleString("zh-TW")}
                    {lead.source ? ` · ${lead.source}` : ""}
                  </p>
                </BrandCard>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
