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
import { CrmCard, CrmField, CrmInput, CrmSectionTitle } from "@/components/members/ui";
import { PageShell } from "@/components/ui/PageShell";
import { ensureCustomerPortalToken } from "@/lib/cloud/customer-cloud-service";
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
import type { BodyCompositionRecord, Customer, CustomerProgressPhoto } from "@/types/customer";

export default function CustomerDetailPage({ customerId }: { customerId: string }) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const repo = useMemo(() => createCustomerRepository(storage), [storage]);
  const today = todayISODate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [records, setRecords] = useState<BodyCompositionRecord[]>([]);
  const [photos, setPhotos] = useState<CustomerProgressPhoto[]>([]);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const reload = useCallback(() => {
    const found = repo.getCustomerById(customerId);
    setCustomer(found ?? null);
    setRecords(found ? repo.getBodyRecordsByCustomer(customerId) : []);
    setPhotos(found ? repo.getProgressPhotosByCustomer(customerId) : []);
  }, [customerId, repo]);

  useEffect(() => {
    queueMicrotask(reload);
  }, [reload]);

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
      bodyFatKg: parseCustomerBodyNumber(values.bodyFatKg),
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
    try {
      const token = await ensureCustomerPortalToken(customerId);
      if (!token) {
        setLinkError("雲端尚未設定，無法產生顧客連結");
        return;
      }
      const url = `${window.location.origin}/c/${token.token}`;
      setPortalLink(url);
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "無法產生連結");
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
        <div className="mt-5 space-y-2">
          <button
            className="w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[1rem] font-semibold text-white"
            onClick={() => void handleShareLink()}
            type="button"
          >
            {linkCopied ? "已複製顧客連結" : "分享 Magic Link 給顧客"}
          </button>
          {portalLink ? (
            <p className="break-all text-[0.8125rem] text-[#86868b]">{portalLink}</p>
          ) : null}
          {linkError ? <p className="text-[0.8125rem] text-[#cf1322]">{linkError}</p> : null}
        </div>
      </CrmCard>

      <CustomerBodySection
        birthYear={customer.birthYear}
        onCreate={handleCreateRecord}
        records={records}
        today={today}
      />
    </PageShell>
  );
}
