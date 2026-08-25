"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import {
  RECRUITMENT_LEAD_STATUS_LABEL,
  RECRUITMENT_LEAD_STATUSES,
  type RecruitmentLeadStatus,
} from "@/lib/recruitment/recruitment-contract";
import type { RecruitmentLeadRecord } from "@/lib/recruitment/recruitment-service";

export function AdminRecruitmentPage() {
  const [statusFilter, setStatusFilter] = useState<"" | RecruitmentLeadStatus>("");
  const [leads, setLeads] = useState<RecruitmentLeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const response = await fetchWithMemberAuth(`/api/admin/recruitment/leads${query}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        leads?: RecruitmentLeadRecord[];
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "無法載入招募名單");
      }
      setLeads(payload.leads ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入招募名單");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell
      title="招募名單（全組織）"
      subtitle="查看所有 Partner 的招募名單與來源。"
      backHref="/admin"
      backLabel="返回管理中心"
      variant="plain"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block text-[0.8125rem] text-[#86868b]">
          狀態篩選
          <select
            className="mt-1.5 min-h-11 w-full rounded-2xl border border-[#eadfd6] bg-white px-3 text-[0.9375rem] text-[#1d1d1f] sm:w-56"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "" | RecruitmentLeadStatus)
            }
          >
            <option value="">全部狀態</option>
            {RECRUITMENT_LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RECRUITMENT_LEAD_STATUS_LABEL[status]}
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
              <BrandCard variant="bordered" className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.75rem] font-medium text-[#86868b]">
                      Partner · {lead.partnerDisplayName ?? lead.partnerMemberId.slice(0, 8)}
                    </p>
                    <h3 className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">{lead.name}</h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[0.75rem] text-[#636366]">
                    {RECRUITMENT_LEAD_STATUS_LABEL[lead.status]}
                  </span>
                </div>
                <p className="text-[0.875rem] text-[#636366]">
                  {lead.city}
                  {lead.district} · {lead.ageRange} · {lead.workStatus}
                </p>
                <p className="text-[0.8125rem] text-[#86868b]">{lead.motivations.join("、")}</p>
                <p className="text-[0.8125rem] text-[#636366]">
                  每週可投入：{lead.weeklyAvailability}
                </p>
                <p className="text-[0.8125rem] leading-6 text-[#636366]">
                  {[
                    lead.instagram ? `IG ${lead.instagram}` : null,
                    lead.lineId ? `LINE ${lead.lineId}` : null,
                    lead.phone ? `手機 ${lead.phone}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "未留聯絡方式"}
                </p>
                <p className="text-[0.75rem] leading-5 text-[#86868b]">
                  UTM：
                  {[
                    lead.utmSource && `source=${lead.utmSource}`,
                    lead.utmMedium && `medium=${lead.utmMedium}`,
                    lead.utmCampaign && `campaign=${lead.utmCampaign}`,
                    lead.utmContent && `content=${lead.utmContent}`,
                    lead.utmTerm && `term=${lead.utmTerm}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "無"}
                </p>
                <p className="text-[0.75rem] text-[#86868b]">
                  {new Date(lead.createdAt).toLocaleString("zh-TW")} · code {lead.shareCode}
                </p>
              </BrandCard>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
