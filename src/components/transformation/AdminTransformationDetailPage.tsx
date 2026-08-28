"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import {
  TRANSFORMATION_LEAD_STATUS_LABEL,
  TRANSFORMATION_LOST_REASON_LABEL,
  TRANSFORMATION_LOST_REASONS,
  type TransformationLeadStatus,
  type TransformationLostReason,
} from "@/lib/transformation/transformation-contract";
import type { TransformationLeadRecord } from "@/lib/transformation/transformation-service";

const STATUS_ACTIONS: { status: TransformationLeadStatus; label: string }[] = [
  { status: "contacted", label: "標記已聯絡" },
  { status: "qualified", label: "標記已確認需求" },
  { status: "appointment", label: "標記已安排" },
  { status: "showed", label: "標記已到店" },
  { status: "converted", label: "標記已轉換" },
];

export function AdminTransformationDetailPage({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<TransformationLeadRecord | null>(null);
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [lostReason, setLostReason] = useState<TransformationLostReason>("no_interest");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth(`/api/admin/transformation/leads/${leadId}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        lead?: TransformationLeadRecord;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.lead) {
        throw new Error(payload.error ?? "無法載入名單");
      }
      setLead(payload.lead);
      setNotes(payload.lead.notes ?? "");
      setCustomerId(payload.lead.customerId ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入名單");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchLead = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetchWithMemberAuth(`/api/admin/transformation/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        lead?: TransformationLeadRecord;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.lead) {
        throw new Error(payload.error ?? "更新失敗");
      }
      setLead(payload.lead);
      setNotes(payload.lead.notes ?? "");
      setCustomerId(payload.lead.customerId ?? "");
      setMessage("已更新");
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  const createCustomerHref =
    lead &&
    `/customers/list?create=1&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(lead.phone)}${lead.socialContact ? `&line=${encodeURIComponent(lead.socialContact)}` : ""}&returnTo=${encodeURIComponent(`/admin/transformation/${leadId}`)}`;

  if (loading) {
    return (
      <PageShell title="體態改造名單" backHref="/admin/transformation" backLabel="返回名單" variant="plain">
        <BrandCard>
          <p className="text-sm text-[#86868b]">載入中…</p>
        </BrandCard>
      </PageShell>
    );
  }

  if (error && !lead) {
    return (
      <PageShell title="體態改造名單" backHref="/admin/transformation" backLabel="返回名單" variant="plain">
        <p className="text-sm text-[#b42318]">{error}</p>
      </PageShell>
    );
  }

  if (!lead) return null;

  return (
    <PageShell
      title={lead.name}
      subtitle={TRANSFORMATION_LEAD_STATUS_LABEL[lead.status]}
      backHref="/admin/transformation"
      backLabel="返回名單"
      variant="plain"
    >
      {message ? <p className="text-sm text-[#248a3d]">{message}</p> : null}
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}

      <BrandCard variant="bordered" className="space-y-2">
        <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">聯絡方式</h3>
        <p className="text-[0.9375rem]">手機：{lead.phone}</p>
        {lead.socialContact ? <p className="text-[0.9375rem]">LINE / IG：{lead.socialContact}</p> : null}
      </BrandCard>

      <BrandCard variant="bordered" className="space-y-2">
        <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">需求</h3>
        <p className="text-[0.9375rem]">希望改善：{lead.goal}</p>
        <p className="text-[0.9375rem]">部位／問題：{lead.targetAreaOrProblem}</p>
        <p className="text-[0.9375rem]">困擾原因：{lead.painPoint}</p>
      </BrandCard>

      <BrandCard variant="bordered" className="space-y-2">
        <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">來源</h3>
        <p className="text-[0.8125rem] leading-6 text-[#636366]">
          {[
            lead.source && `source=${lead.source}`,
            lead.utmSource && `utm_source=${lead.utmSource}`,
            lead.utmMedium && `utm_medium=${lead.utmMedium}`,
            lead.utmCampaign && `utm_campaign=${lead.utmCampaign}`,
            lead.utmContent && `utm_content=${lead.utmContent}`,
            lead.campaignId && `campaign=${lead.campaignId}`,
            lead.adsetId && `adset=${lead.adsetId}`,
            lead.adId && `ad=${lead.adId}`,
            lead.placement && `placement=${lead.placement}`,
            `version=${lead.landingPageVersion}`,
          ]
            .filter(Boolean)
            .join(" · ") || "無"}
        </p>
        <p className="text-[0.75rem] text-[#86868b]">
          {new Date(lead.createdAt).toLocaleString("zh-TW")} · code {lead.shareCode}
        </p>
      </BrandCard>

      <BrandCard variant="bordered" className="space-y-2">
        <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">生命週期</h3>
        <div className="flex flex-wrap gap-2">
          {STATUS_ACTIONS.map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={busy || lead.status === action.status}
              onClick={() =>
                void patchLead({
                  status: action.status,
                  ...(action.status === "converted" && customerId ? { customerId } : {}),
                })
              }
              className="rounded-full border border-[#eadfd6] px-3 py-1.5 text-[0.8125rem] font-medium disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
        {lead.status === "converted" || lead.status !== "lost" ? (
          <div className="space-y-2 pt-2">
            <label className="block text-[0.8125rem] text-[#86868b]">
              連結顧客 ID（僅已轉換）
              <input
                className="mt-1 w-full min-h-11 rounded-2xl border border-[#eadfd6] bg-white px-3 text-[0.9375rem]"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="建立顧客後貼上 ID"
                disabled={lead.status !== "converted"}
              />
            </label>
            {lead.status === "converted" && customerId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void patchLead({ customerId })}
                className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[0.8125rem] font-semibold text-white"
              >
                儲存顧客連結
              </button>
            ) : null}
            {lead.status === "converted" && createCustomerHref ? (
              <p className="text-[0.8125rem] text-[#86868b]">
                <Link href={createCustomerHref} className="underline">
                  建立顧客
                </Link>
                後，將顧客 ID 貼上並儲存連結。
              </p>
            ) : null}
            {lead.customerId ? (
              <Link href={`/customers/${lead.customerId}`} className="text-[0.875rem] text-[#248a3d] underline">
                查看已連結顧客
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2 border-t border-[#eadfd6] pt-3">
          <p className="text-[0.8125rem] font-medium text-[#86868b]">標記流失</p>
          <select
            className="min-h-11 w-full rounded-2xl border border-[#eadfd6] bg-white px-3 text-[0.9375rem]"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value as TransformationLostReason)}
          >
            {TRANSFORMATION_LOST_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {TRANSFORMATION_LOST_REASON_LABEL[reason]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void patchLead({ status: "lost", lostReason })}
            className="rounded-full border border-[#b42318] px-4 py-2 text-[0.8125rem] font-semibold text-[#b42318]"
          >
            標記流失
          </button>
        </div>
        <ul className="space-y-1 pt-2 text-[0.75rem] text-[#86868b]">
          {lead.contactedAt ? <li>已聯絡：{new Date(lead.contactedAt).toLocaleString("zh-TW")}</li> : null}
          {lead.qualifiedAt ? <li>已確認：{new Date(lead.qualifiedAt).toLocaleString("zh-TW")}</li> : null}
          {lead.appointmentAt ? <li>已安排：{new Date(lead.appointmentAt).toLocaleString("zh-TW")}</li> : null}
          {lead.showedAt ? <li>已到店：{new Date(lead.showedAt).toLocaleString("zh-TW")}</li> : null}
          {lead.convertedAt ? <li>已轉換：{new Date(lead.convertedAt).toLocaleString("zh-TW")}</li> : null}
          {lead.lostAt ? (
            <li>
              已流失：{new Date(lead.lostAt).toLocaleString("zh-TW")}
              {lead.lostReason ? `（${TRANSFORMATION_LOST_REASON_LABEL[lead.lostReason]}）` : ""}
            </li>
          ) : null}
        </ul>
      </BrandCard>

      <BrandCard variant="bordered" className="space-y-3">
        <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">備註</h3>
        <textarea
          className="min-h-28 w-full rounded-2xl border border-[#eadfd6] bg-white px-3 py-2 text-[0.9375rem]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void patchLead({ notes })}
          className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[0.8125rem] font-semibold text-white"
        >
          儲存備註
        </button>
      </BrandCard>
    </PageShell>
  );
}
