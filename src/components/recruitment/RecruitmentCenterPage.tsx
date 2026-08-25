"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import {
  RECRUITMENT_LEAD_STATUS_LABEL,
  RECRUITMENT_LEAD_STATUSES,
  type RecruitmentLeadStatus,
} from "@/lib/recruitment/recruitment-contract";
import type { RecruitmentLeadRecord, RecruitmentShareLinkView } from "@/lib/recruitment/recruitment-service";

export function RecruitmentCenterPage() {
  const [share, setShare] = useState<RecruitmentShareLinkView | null>(null);
  const [leads, setLeads] = useState<RecruitmentLeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [shareRes, leadsRes] = await Promise.all([
        fetchWithMemberAuth("/api/recruitment/share"),
        fetchWithMemberAuth("/api/recruitment/leads"),
      ]);
      const sharePayload = (await shareRes.json()) as {
        ok?: boolean;
        share?: RecruitmentShareLinkView;
        error?: string;
      };
      const leadsPayload = (await leadsRes.json()) as {
        ok?: boolean;
        leads?: RecruitmentLeadRecord[];
        error?: string;
      };
      if (!shareRes.ok || !sharePayload.ok || !sharePayload.share) {
        throw new Error(sharePayload.error ?? "無法載入招募連結");
      }
      if (!leadsRes.ok || !leadsPayload.ok) {
        throw new Error(leadsPayload.error ?? "無法載入招募名單");
      }
      setShare(sharePayload.share);
      setLeads(leadsPayload.leads ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入招募名單");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async () => {
    if (!share?.href) return;
    try {
      await navigator.clipboard.writeText(share.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const shareLink = async () => {
    if (!share?.href) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "運動教室｜擴大經營",
          text: "板橋・土城招募合作夥伴 — 健身 × 健康產業 × 個人事業發展",
          url: share.href,
        });
        setShared(true);
        return;
      } catch {
        /* user cancel or unsupported */
      }
    }
    await copy();
  };

  const updateStatus = async (leadId: string, status: RecruitmentLeadStatus) => {
    setBusyLeadId(leadId);
    setError(null);
    try {
      const response = await fetchWithMemberAuth(`/api/recruitment/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        lead?: RecruitmentLeadRecord;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.lead) {
        throw new Error(payload.error ?? "更新狀態失敗");
      }
      setLeads((prev) => prev.map((item) => (item.id === leadId ? payload.lead! : item)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新狀態失敗");
    } finally {
      setBusyLeadId(null);
    }
  };

  return (
    <PageShell
      title="招募名單"
      subtitle="分享專屬連結，把有興趣了解合作的人留在這裡。"
      variant="plain"
    >
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}

      {loading ? (
        <BrandCard>
          <p className="text-sm text-[#86868b]">載入中…</p>
        </BrandCard>
      ) : (
        <>
          {share ? (
            <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
              <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">我的招募連結</h2>
              <p className="mt-2 text-[0.9375rem] leading-7 text-[#636366]">
                把連結分享給朋友，或放進你的廣告。對方留下資料後，會出現在下方名單。
              </p>
              <p className="mt-5 break-all rounded-2xl bg-[#faf6f1] px-4 py-3 text-center text-[1.0625rem] font-semibold tracking-wide text-[#1d1d1f]">
                {share.display}
              </p>
              <p className="mt-2 text-center text-[0.75rem] text-[#86868b]">專屬短連結 · 不會變</p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="min-h-12 rounded-2xl bg-[#1d1d1f] px-4 text-[0.9375rem] font-semibold text-white"
                >
                  {copied ? "已複製" : "複製連結"}
                </button>
                <button
                  type="button"
                  onClick={() => void shareLink()}
                  className="min-h-12 rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.9375rem] font-semibold text-[#1d1d1f]"
                >
                  {shared ? "已分享" : "分享"}
                </button>
                <Link
                  href={share.previewPath}
                  className="flex min-h-12 items-center justify-center rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.9375rem] font-semibold text-[#1d1d1f]"
                  target="_blank"
                  rel="noreferrer"
                >
                  預覽公開頁
                </Link>
              </div>
              <p className="sr-only">{share.shareCode}</p>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
              名單
            </h2>
            {leads.length === 0 ? (
              <BrandCard variant="bordered">
                <p className="text-[0.9375rem] leading-7 text-[#86868b]">
                  還沒有人留下資料。先複製上方連結分享出去吧。
                </p>
              </BrandCard>
            ) : (
              <ul className="space-y-3">
                {leads.map((lead) => (
                  <li key={lead.id}>
                    <BrandCard variant="bordered" className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{lead.name}</h3>
                          <p className="mt-1 text-[0.875rem] text-[#636366]">
                            {lead.city}
                            {lead.district} · {lead.ageRange} · {lead.workStatus}
                          </p>
                          <p className="mt-1 text-[0.8125rem] text-[#86868b]">
                            {lead.motivations.join("、")}
                          </p>
                          <p className="mt-2 text-[0.8125rem] leading-6 text-[#636366]">
                            {[
                              lead.instagram ? `IG ${lead.instagram}` : null,
                              lead.lineId ? `LINE ${lead.lineId}` : null,
                              lead.phone ? `手機 ${lead.phone}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "未留聯絡方式"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[0.75rem] text-[#86868b]">
                          {new Date(lead.createdAt).toLocaleDateString("zh-TW")}
                        </span>
                      </div>
                      <label className="block text-[0.8125rem] text-[#86868b]">
                        狀態
                        <select
                          className="mt-1.5 min-h-11 w-full rounded-2xl border border-[#eadfd6] bg-white px-3 text-[0.9375rem] text-[#1d1d1f]"
                          value={lead.status}
                          disabled={busyLeadId === lead.id}
                          onChange={(event) =>
                            void updateStatus(lead.id, event.target.value as RecruitmentLeadStatus)
                          }
                        >
                          {RECRUITMENT_LEAD_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {RECRUITMENT_LEAD_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </BrandCard>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
