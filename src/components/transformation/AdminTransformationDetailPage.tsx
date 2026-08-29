"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { searchCustomers } from "@/lib/customers/customer-search";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  TRANSFORMATION_LEAD_STATUS_LABEL,
  TRANSFORMATION_LOST_REASON_LABEL,
  TRANSFORMATION_LOST_REASONS,
  type TransformationLeadStatus,
  type TransformationLostReason,
} from "@/lib/transformation/transformation-contract";
import type { TransformationLeadRecord } from "@/lib/transformation/transformation-service";
import type { Customer } from "@/types/customer";

const STATUS_ACTIONS: { status: TransformationLeadStatus; label: string }[] = [
  { status: "contacted", label: "標記已聯絡" },
  { status: "qualified", label: "標記已確認需求" },
  { status: "appointment", label: "標記已安排" },
  { status: "showed", label: "標記已到店" },
  { status: "converted", label: "標記已轉換" },
];

export function AdminTransformationDetailPage({ leadId }: { leadId: string }) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const repo = useMemo(() => createCustomerRepository(storage), [storage]);
  const [lead, setLead] = useState<TransformationLeadRecord | null>(null);
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState<TransformationLostReason>("no_interest");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入名單");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadCustomers = useCallback(() => {
    const memberId = resolveAuthenticatedMemberId(storage);
    if (!memberId) {
      setCustomers([]);
      return;
    }
    setCustomers(repo.getCustomersByOwner(memberId));
  }, [repo, storage]);

  useEffect(() => {
    reloadCustomers();
  }, [reloadCustomers]);

  const customerMatches = useMemo(
    () => searchCustomers(customers, customerQuery).slice(0, 12),
    [customers, customerQuery],
  );

  const linkedCustomer = useMemo(
    () => (lead?.customerId ? customers.find((customer) => customer.id === lead.customerId) : undefined),
    [customers, lead?.customerId],
  );

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
      setMessage("已更新");
      setSelectedCustomer(null);
      setLinkPanelOpen(false);
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
              onClick={() => void patchLead({ status: action.status })}
              className="rounded-full border border-[#eadfd6] px-3 py-1.5 text-[0.8125rem] font-medium disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
        {lead.status === "converted" ? (
          <div className="space-y-2 border-t border-[#eadfd6] pt-3">
            <p className="text-[0.8125rem] font-medium text-[#86868b]">顧客連結</p>
            {lead.customerId ? (
              <div className="space-y-1">
                <p className="text-[0.9375rem] text-[#1d1d1f]">
                  已連結：{linkedCustomer?.displayName ?? lead.customerId}
                  {linkedCustomer?.phone ? ` · ${linkedCustomer.phone}` : ""}
                </p>
                <Link href={`/customers/${lead.customerId}`} className="text-[0.875rem] text-[#248a3d] underline">
                  查看已連結顧客
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    reloadCustomers();
                    setCustomerQuery(lead.phone || lead.name);
                    setSelectedCustomer(null);
                    setLinkPanelOpen(true);
                  }}
                  className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
                >
                  連結顧客
                </button>
                {createCustomerHref ? (
                  <p className="text-[0.8125rem] text-[#86868b]">
                    尚未建立顧客？{" "}
                    <Link href={createCustomerHref} className="underline">
                      建立顧客
                    </Link>
                  </p>
                ) : null}
              </div>
            )}
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

      {linkPanelOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center">
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-customer-title"
          >
            <h2 id="link-customer-title" className="text-[1rem] font-semibold text-[#1d1d1f]">
              連結顧客
            </h2>
            <p className="mt-1 text-[0.8125rem] text-[#86868b]">搜尋姓名或手機，選擇正確的顧客後確認連結。</p>
            <input
              className="mt-3 w-full min-h-11 rounded-2xl border border-[#eadfd6] bg-white px-3 text-[0.9375rem]"
              value={customerQuery}
              onChange={(event) => {
                setCustomerQuery(event.target.value);
                setSelectedCustomer(null);
              }}
              placeholder="輸入姓名或手機"
              autoFocus
            />
            <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
              {customerMatches.length === 0 ? (
                <li className="rounded-xl bg-[#faf8f6] px-3 py-4 text-center text-[0.875rem] text-[#86868b]">
                  尚未建立顧客
                </li>
              ) : (
                customerMatches.map((customer) => {
                  const selected = selectedCustomer?.id === customer.id;
                  return (
                    <li key={customer.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(customer)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left text-[0.875rem] ${
                          selected
                            ? "border-[#248a3d] bg-[#f0faf3]"
                            : "border-[#eadfd6] bg-white hover:bg-[#faf8f6]"
                        }`}
                      >
                        <p className="font-medium text-[#1d1d1f]">{customer.displayName}</p>
                        <p className="mt-0.5 text-[0.75rem] text-[#86868b]">
                          {customer.phone || "無手機"}
                          {customer.lineId ? ` · ${customer.lineId}` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setLinkPanelOpen(false);
                  setSelectedCustomer(null);
                }}
                className="rounded-full border border-[#eadfd6] px-4 py-2 text-[0.8125rem] font-medium text-[#636366]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy || !selectedCustomer}
                onClick={() => {
                  if (!selectedCustomer) return;
                  void patchLead({ customerId: selectedCustomer.id });
                }}
                className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
              >
                確認連結
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
