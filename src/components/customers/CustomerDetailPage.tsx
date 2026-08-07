"use client";

import { BodyCompositionTrendCharts } from "@/components/customers/BodyCompositionTrendCharts";
import {
  CustomerBodySection,
  parseCustomerBodyNumber,
  type CustomerBodyFormValues,
} from "@/components/customers/CustomerBodySection";
import { CustomerPhotoCompareSection } from "@/components/customers/CustomerPhotoCompareSection";
import {
  CustomerProgressPhotoSection,
  type CustomerProgressPhotoFormValues,
} from "@/components/customers/CustomerProgressPhotoSection";
import {
  CustomerReceiptPhotoSection,
  type CustomerReceiptPhotoFormValues,
} from "@/components/customers/CustomerReceiptPhotoSection";
import { CrmButton, CrmCard, CrmField, CrmInput, CrmSectionTitle } from "@/components/members/ui";
import { PageShell } from "@/components/ui/PageShell";
import { getCurrentMember } from "@/lib/auth/auth-service";
import {
  ensureCustomerPortalToken,
  fetchCustomerPortalToken,
  renewCustomerPortalToken,
  revokeCustomerPortalToken,
  updateCustomerPortalTokenExpiry,
} from "@/lib/cloud/customer-cloud-service";
import {
  findLinkableDownlineMembers,
  linkCustomerToMember,
  unlinkCustomerFromMember,
} from "@/lib/customers/customer-member-bridge";
import { loadAllMembers, getMemberDisplayName } from "@/lib/members/member-service";
import {
  compareBodyRecords,
  formatMetricDeltaLine,
} from "@/lib/customers/body-composition-compare";
import { buildBodyCompositionTrendSeries } from "@/lib/customers/body-composition-trends";
import { computeBmi, computeAgeFromBirthYear } from "@/lib/customers/body-metrics";
import { todayISODate } from "@/lib/config/app-config";
import { formatShortDate } from "@/lib/mission-control/format";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { APP_ICON } from "@/lib/ui/app-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BodyCompositionRecord, Customer, CustomerPortalToken, CustomerProgressPhoto, CustomerReceiptPhoto } from "@/types/customer";
import type { Member } from "@/types/member";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CustomerDetailPage({ customerId }: { customerId: string }) {
  const router = useRouter();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const repo = useMemo(() => createCustomerRepository(storage), [storage]);
  const today = todayISODate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [records, setRecords] = useState<BodyCompositionRecord[]>([]);
  const [photos, setPhotos] = useState<CustomerProgressPhoto[]>([]);
  const [receipts, setReceipts] = useState<CustomerReceiptPhoto[]>([]);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [portalToken, setPortalToken] = useState<CustomerPortalToken | null>(null);
  const [portalExpiry, setPortalExpiry] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const viewer = useMemo(() => getCurrentMember(storage), [storage]);
  const allMembers = useMemo(() => loadAllMembers(storage), [storage]);
  const linkableMembers = useMemo(() => {
    if (!customer || !viewer) {
      return [] as Member[];
    }
    return findLinkableDownlineMembers(customer, viewer, storage);
  }, [customer, viewer, storage]);
  const linkedMember = useMemo(() => {
    if (!customer?.linkedMemberId) {
      return null;
    }
    return allMembers.find((member) => member.id === customer.linkedMemberId) ?? null;
  }, [allMembers, customer?.linkedMemberId]);

  const portalStatus = useMemo(() => {
    if (!portalToken) {
      return "none" as const;
    }
    if (portalToken.revokedAt) {
      return "revoked" as const;
    }
    if (portalToken.expiresAt && new Date(portalToken.expiresAt) <= new Date()) {
      return "expired" as const;
    }
    return "active" as const;
  }, [portalToken]);

  const portalStatusLabel = {
    none: "尚未產生連結",
    active: "連結有效",
    revoked: "連結已撤銷",
    expired: "連結已過期",
  }[portalStatus];

  const reload = useCallback(() => {
    const found = repo.getCustomerById(customerId);
    setCustomer(found ?? null);
    setRecords(found ? repo.getBodyRecordsByCustomer(customerId) : []);
    setPhotos(found ? repo.getProgressPhotosByCustomer(customerId) : []);
    setReceipts(found ? repo.getReceiptPhotosByCustomer(customerId) : []);
  }, [customerId, repo]);

  useEffect(() => {
    queueMicrotask(reload);
  }, [reload]);

  useEffect(() => {
    if (!customer) {
      return;
    }
    void fetchCustomerPortalToken(customerId)
      .then((token) => {
        setPortalToken(token);
        if (token && !token.revokedAt) {
          setPortalLink(`${window.location.origin}/c/${token.token}`);
        }
        if (token?.expiresAt) {
          setPortalExpiry(token.expiresAt.slice(0, 10));
        }
      })
      .catch(() => {
        setPortalToken(null);
      });
  }, [customer, customerId]);

  const comparison = useMemo(() => compareBodyRecords(records), [records]);
  const trendSeries = useMemo(() => buildBodyCompositionTrendSeries(records), [records]);

  const handleCreateRecord = (values: CustomerBodyFormValues) => {
    const currentCustomer = repo.getCustomerById(customerId);
    const weightKg = parseCustomerBodyNumber(values.weightKg);
    const bmi =
      parseCustomerBodyNumber(values.bmi) ??
      computeBmi(weightKg, currentCustomer?.heightCm ?? null);
    const age =
      parseCustomerBodyNumber(values.age) ??
      computeAgeFromBirthYear(currentCustomer?.birthYear, values.recordDate);

    repo.createBodyRecord({
      customerId,
      recordDate: values.recordDate,
      age,
      weightKg,
      skeletalMuscleKg: parseCustomerBodyNumber(values.skeletalMuscleKg),
      bmi,
      bodyFatPercent: parseCustomerBodyNumber(values.bodyFatPercent),
      visceralFatLevel: parseCustomerBodyNumber(values.visceralFatLevel),
      basalMetabolicRate: parseCustomerBodyNumber(values.basalMetabolicRate),
      bodyAge: parseCustomerBodyNumber(values.bodyAge),
      note: values.note,
    });
    reload();
  };

  const handleCreatePhoto = (values: CustomerProgressPhotoFormValues) => {
    repo.createProgressPhoto({
      customerId,
      phase: values.phase,
      angle: values.angle,
      photoDate: values.photoDate,
      imageDataUrl: values.imageDataUrl,
      note: values.note,
    });
    reload();
  };

  const handleCreateReceipt = (values: CustomerReceiptPhotoFormValues) => {
    if (!values.imageDataUrl) {
      return;
    }

    repo.createReceiptPhoto({
      customerId,
      receiptDate: values.receiptDate,
      imageDataUrl: values.imageDataUrl,
      note: values.note || undefined,
    });
    reload();
  };

  const handleHeightChange = (value: string) => {
    const parsed = parseCustomerBodyNumber(value);
    repo.updateCustomer(customerId, {
      heightCm: parsed ?? undefined,
    });
    reload();
  };

  const handleBirthYearChange = (value: string) => {
    const parsed = parseCustomerBodyNumber(value);
    repo.updateCustomer(customerId, {
      birthYear: parsed ?? undefined,
    });
    reload();
  };

  const handleFollowUpDateChange = (value: string) => {
    repo.updateCustomer(customerId, {
      nextFollowUpDate: value || undefined,
    });
    reload();
  };

  const handleMarkContacted = () => {
    repo.updateCustomer(customerId, {
      lastContactDate: today,
    });
    reload();
  };

  const handleShareLink = async () => {
    setLinkError(null);
    setPortalBusy(true);
    try {
      const token = await ensureCustomerPortalToken(customerId);
      if (!token) {
        setLinkError("雲端尚未設定，無法產生顧客連結");
        return;
      }
      const url = `${window.location.origin}/c/${token.token}`;
      setPortalToken(token);
      setPortalLink(url);
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "無法產生連結");
    } finally {
      setPortalBusy(false);
    }
  };

  const handleRevokeLink = async () => {
    setLinkError(null);
    setPortalBusy(true);
    try {
      await revokeCustomerPortalToken(customerId);
      const token = await fetchCustomerPortalToken(customerId);
      setPortalToken(token);
      setPortalLink(null);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "無法撤銷連結");
    } finally {
      setPortalBusy(false);
    }
  };

  const handleRenewLink = async () => {
    setLinkError(null);
    setPortalBusy(true);
    try {
      const expiresAt = portalExpiry ? new Date(`${portalExpiry}T23:59:59`).toISOString() : null;
      const token = await renewCustomerPortalToken(customerId, expiresAt);
      if (!token) {
        setLinkError("雲端尚未設定，無法產生顧客連結");
        return;
      }
      const url = `${window.location.origin}/c/${token.token}`;
      setPortalToken(token);
      setPortalLink(url);
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "無法重新產生連結");
    } finally {
      setPortalBusy(false);
    }
  };

  const handleExpiryChange = async (value: string) => {
    setPortalExpiry(value);
    if (!value || portalStatus !== "active") {
      return;
    }
    try {
      await updateCustomerPortalTokenExpiry(
        customerId,
        new Date(`${value}T23:59:59`).toISOString(),
      );
      const token = await fetchCustomerPortalToken(customerId);
      setPortalToken(token);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "無法更新到期日");
    }
  };

  const handleLinkMember = () => {
    if (!selectedMemberId) {
      return;
    }
    setLinkErrorMessage(null);
    try {
      linkCustomerToMember(customerId, selectedMemberId, storage);
      setSelectedMemberId("");
      reload();
    } catch (error) {
      setLinkErrorMessage(error instanceof Error ? error.message : "無法關聯夥伴");
    }
  };

  const handleUnlinkMember = () => {
    setLinkErrorMessage(null);
    try {
      unlinkCustomerFromMember(customerId, storage);
      reload();
    } catch (error) {
      setLinkErrorMessage(error instanceof Error ? error.message : "無法解除關聯");
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customer || !viewer || customer.ownerMemberId !== viewer.id) {
      return;
    }

    setDeleteError(null);
    setDeleteBusy(true);
    try {
      if (portalStatus === "active") {
        await revokeCustomerPortalToken(customerId).catch(() => undefined);
      }
      repo.deleteCustomer(customerId);
      router.push("/customers");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "無法刪除顧客");
      setDeleteBusy(false);
    }
  };

  if (!customer) {
    return (
      <PageShell backHref="/customers" backLabel="返回顧客列表" title="顧客關懷" variant="plain">
        <p className="text-[0.9375rem] text-[#86868b]">找不到這位顧客。</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      backHref="/customers"
      backLabel="返回顧客列表"
      subtitle="體組成資料僅你與顧客本人可見"
      title={customer.displayName}
      titleIcon={APP_ICON.quadrant.newCustomer}
      variant="plain"
    >
      {comparison ? (
        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] p-5">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[var(--brand-primary-dark)]">
            與上次相比（{comparison.daysBetween} 天）
          </p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#1d1d1f]">{comparison.summary}</p>
          {comparison.deltas.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[0.8125rem] text-[#636366]">
              {comparison.deltas.slice(0, 4).map((delta) => (
                <li key={delta.label}>{formatMetricDeltaLine(delta)}</li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-4 space-y-2">
            {comparison.suggestions.map((suggestion) => (
              <li
                className="rounded-2xl bg-white/80 px-4 py-3 text-[0.875rem] leading-relaxed text-[#1d1d1f]"
                key={suggestion}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CustomerBodySection
        birthYear={customer.birthYear}
        heightCm={customer.heightCm}
        onCreate={handleCreateRecord}
        records={records}
        today={today}
      />

      <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
              聯絡紀錄
            </p>
            <p className="mt-2 text-[0.9375rem] text-[#1d1d1f]">
              {customer.lastContactDate
                ? `上次聯絡 ${formatShortDate(customer.lastContactDate)}`
                : "尚未記錄聯絡"}
            </p>
          </div>
          <button
            className="shrink-0 rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-2.5 text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
            onClick={handleMarkContacted}
            type="button"
          >
            今天已聯絡
          </button>
        </div>
      </section>

      <BodyCompositionTrendCharts seriesList={trendSeries} />

      <CustomerPhotoCompareSection customerName={customer.displayName} photos={photos} />

      <CustomerProgressPhotoSection onCreate={handleCreatePhoto} photos={photos} today={today} />

      <CustomerReceiptPhotoSection onCreate={handleCreateReceipt} receipts={receipts} today={today} />

      <CrmCard>
        <CrmSectionTitle>基本資料</CrmSectionTitle>
        <dl className="mt-4">
          <CrmField label="電話" value={customer.phone} />
          <CrmField label="LINE" value={customer.lineId} />
          <CrmField label="出生年" value={customer.birthYear} />
          <CrmField label="身高 (cm)" value={customer.heightCm} />
          <CrmField label="備註" value={customer.note} />
        </dl>
        <div className="mt-5 space-y-4">
          <CrmInput
            label="身高 (cm)"
            inputMode="decimal"
            onChange={(event) => handleHeightChange(event.target.value)}
            value={customer.heightCm?.toString() ?? ""}
          />
          <CrmInput
            label="出生年"
            inputMode="numeric"
            onChange={(event) => handleBirthYearChange(event.target.value)}
            value={customer.birthYear?.toString() ?? ""}
          />
          <p className="text-[0.8125rem] text-[#86868b]">
            身高設定後固定；有出生年時，量測會自動帶入年齡。
          </p>
          <CrmInput
            label="下次追蹤日"
            onChange={(event) => handleFollowUpDateChange(event.target.value)}
            type="date"
            value={customer.nextFollowUpDate ?? ""}
          />
        </div>
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
            <p className="text-[0.8125rem] text-[#86868b]">Magic Link 狀態</p>
            <p className="mt-1 text-[0.9375rem] font-medium text-[#1d1d1f]">{portalStatusLabel}</p>
            {portalLink && portalStatus === "active" ? (
              <p className="mt-2 break-all text-[0.8125rem] text-[#86868b]">{portalLink}</p>
            ) : null}
          </div>
          <CrmInput
            label="連結到期日（選填）"
            onChange={(event) => void handleExpiryChange(event.target.value)}
            type="date"
            value={portalExpiry}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[0.9375rem] font-semibold text-white disabled:opacity-60"
              disabled={portalBusy}
              onClick={() => void handleShareLink()}
              type="button"
            >
              {linkCopied ? "已複製連結" : portalStatus === "active" ? "複製 Magic Link" : "產生 Magic Link"}
            </button>
            {portalStatus === "active" ? (
              <button
                className="rounded-2xl bg-[#fff1f0] px-4 py-3.5 text-[0.9375rem] font-semibold text-[#cf1322] disabled:opacity-60"
                disabled={portalBusy}
                onClick={() => void handleRevokeLink()}
                type="button"
              >
                撤銷連結
              </button>
            ) : (
              <button
                className="rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3.5 text-[0.9375rem] font-semibold text-[var(--brand-primary-dark)] disabled:opacity-60"
                disabled={portalBusy}
                onClick={() => void handleRenewLink()}
                type="button"
              >
                重新產生連結
              </button>
            )}
          </div>
          {linkError ? <p className="text-[0.8125rem] text-[#cf1322]">{linkError}</p> : null}
        </div>
      </CrmCard>

      <CrmCard>
        <CrmSectionTitle>夥伴關聯</CrmSectionTitle>
        {linkedMember ? (
          <div className="mt-4 space-y-3">
            <p className="text-[0.9375rem] text-[#1d1d1f]">
              已關聯夥伴：{getMemberDisplayName(linkedMember)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded-full bg-[var(--brand-primary-muted)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
                href={`/members/${linkedMember.id}`}
              >
                查看夥伴檔案
              </Link>
              <button
                className="rounded-full bg-[#fff1f0] px-4 py-2 text-[0.8125rem] font-medium text-[#cf1322]"
                onClick={handleUnlinkMember}
                type="button"
              >
                解除關聯
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-[0.875rem] text-[#86868b]">
              顧客加入成為夥伴後，可關聯到夥伴檔案；系統也會依姓名或電話自動比對。
            </p>
            {linkableMembers.length > 0 ? (
              <>
                <label className="block text-[0.8125rem] font-medium text-[#636366]">
                  選擇下線夥伴
                  <select
                    className="mt-2 w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
                    onChange={(event) => setSelectedMemberId(event.target.value)}
                    value={selectedMemberId}
                  >
                    <option value="">請選擇…</option>
                    {linkableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {getMemberDisplayName(member)}
                        {member.phone ? ` · ${member.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
                  disabled={!selectedMemberId}
                  onClick={handleLinkMember}
                  type="button"
                >
                  關聯夥伴
                </button>
              </>
            ) : (
              <p className="text-[0.875rem] text-[#86868b]">目前沒有可關聯的下線夥伴。</p>
            )}
            {linkErrorMessage ? (
              <p className="text-[0.8125rem] text-[#cf1322]">{linkErrorMessage}</p>
            ) : null}
          </div>
        )}
      </CrmCard>

      <section className="rounded-[1.75rem] border border-[#ffd6d6] bg-[#fffafa] p-5">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#cf1322]">
          危險操作
        </p>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-[#86868b]">
          刪除後將一併移除量測紀錄、進度照片、收據與 Magic Link，且無法復原。
        </p>
        <button
          className="mt-4 w-full rounded-2xl bg-[#fff1f0] px-4 py-3.5 text-[0.9375rem] font-semibold text-[#cf1322]"
          onClick={() => setShowDeleteConfirm(true)}
          type="button"
        >
          刪除顧客
        </button>
        {deleteError ? <p className="mt-2 text-[0.8125rem] text-[#cf1322]">{deleteError}</p> : null}
      </section>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-5 sm:items-center">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-[var(--brand-surface)] p-6">
            <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">刪除顧客？</p>
            <p className="mt-2 text-[0.9375rem] text-[#86868b]">
              將刪除 {customer.displayName} 的所有資料，包含量測、照片、收據與顧客連結。
            </p>
            <div className="mt-5 space-y-2">
              <CrmButton
                disabled={deleteBusy}
                onClick={() => void handleDeleteCustomer()}
                variant="danger"
              >
                {deleteBusy ? "刪除中…" : "確認刪除"}
              </CrmButton>
              <CrmButton
                disabled={deleteBusy}
                onClick={() => setShowDeleteConfirm(false)}
                variant="secondary"
              >
                取消
              </CrmButton>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
