"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { buildCustomerFollowUpHints } from "@/lib/customers/body-composition-compare";
import { searchCustomers } from "@/lib/customers/customer-search";
import { todayISODate } from "@/lib/config/app-config";
import {
  getNotificationPermissionState,
  requestAppNotificationPermission,
} from "@/lib/notifications/show-app-notification";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { PageShell } from "@/components/ui/PageShell";
import { CrmButton, CrmInput } from "@/components/members/ui";
import { ImageUploadSectionButton } from "@/components/ui/ImageUploadButtons";
import { APP_ICON } from "@/lib/ui/app-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer, CustomerSex } from "@/types/customer";
import { CUSTOMER_SEX_LABELS } from "@/types/customer";

interface CustomerListItem extends Customer {
  latestRecordDate?: string;
  followUpReason?: string;
  followUpUrgency?: "high" | "medium" | "low";
}

function shortStatusLabel(customer: CustomerListItem): string {
  if (customer.followUpReason) return customer.followUpReason;
  if (customer.latestRecordDate) return "有量測";
  return "尚無量測";
}

function CustomerCard({
  customer,
}: {
  customer: CustomerListItem;
}) {
  return (
    <Link
      className="block rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-3 transition-transform duration-200 active:scale-[0.99]"
      href={`/customers/${customer.id}`}
    >
      <p className="truncate text-[0.9375rem] font-semibold text-[#1d1d1f]">{customer.displayName}</p>
      <p className="mt-1 line-clamp-2 text-[0.75rem] leading-snug text-[#86868b]">
        {shortStatusLabel(customer)}
      </p>
    </Link>
  );
}

export default function CustomerListPage() {
  const router = useRouter();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const repo = useMemo(() => createCustomerRepository(storage), [storage]);
  const today = todayISODate();

  const [ownerMemberId, setOwnerMemberId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [sex, setSex] = useState<CustomerSex | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [query, setQuery] = useState("");
  const [notificationState, setNotificationState] = useState(() =>
    typeof window === "undefined" ? "default" : getNotificationPermissionState(),
  );

  const dailyFollowUp = useMemo(() => {
    const items = customers
      .filter((customer) => customer.followUpReason)
      .map((customer) => ({
        customer,
        reason: customer.followUpReason!,
        urgency: customer.followUpUrgency ?? ("low" as const),
      }));
    return { count: items.length, items };
  }, [customers]);

  const reload = useCallback(() => {
    const memberId = resolveAuthenticatedMemberId(storage);
    setOwnerMemberId(memberId);
    if (!memberId) {
      setCustomers([]);
      return;
    }

    const bodyByCustomer = repo.getBodyRecordsGroupedByCustomer();
    const items = repo.getCustomersByOwner(memberId).map((customer) => {
      const records = bodyByCustomer.get(customer.id) ?? [];
      const hints = buildCustomerFollowUpHints(customer, records, today);
      const topHint = hints.sort((left, right) => {
        const rank = { high: 0, medium: 1, low: 2 };
        return rank[left.urgency] - rank[right.urgency];
      })[0];

      return {
        ...customer,
        latestRecordDate: records[0]?.recordDate,
        followUpReason: topHint?.reason,
        followUpUrgency: topHint?.urgency,
      };
    });

    items.sort((left, right) => {
      const leftRank = left.followUpUrgency
        ? { high: 0, medium: 1, low: 2 }[left.followUpUrgency]
        : 3;
      const rightRank = right.followUpUrgency
        ? { high: 0, medium: 1, low: 2 }[right.followUpUrgency]
        : 3;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.displayName.localeCompare(right.displayName, "zh-Hant");
    });

    setCustomers(items);
  }, [repo, storage, today]);

  useEffect(() => {
    queueMicrotask(reload);
  }, [reload]);

  const followUpCount = dailyFollowUp.count;

  const visibleCustomers = useMemo(
    () => searchCustomers(customers, query),
    [customers, query],
  );

  const handleEnableNotifications = async () => {
    const next = await requestAppNotificationPermission();
    setNotificationState(next);
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ownerMemberId || !name.trim()) {
      return;
    }

    const customer = repo.createCustomer({
      ownerMemberId,
      displayName: name,
      phone: phone || undefined,
      heightCm: heightCm ? Number(heightCm) : undefined,
      sex: sex || undefined,
      // Full date only — do not invent MM/DD for legacy birth_year-only rows.
      birthDate: birthDate || undefined,
    });
    setName("");
    setPhone("");
    setHeightCm("");
    setSex("");
    setBirthDate("");
    setShowForm(false);
    reload();
    router.push(`/customers/${customer.id}`);
  };

  return (
    <PageShell
      backHref="/customers"
      backLabel="返回顧客"
      subtitle="管理顧客量測與追蹤，資料僅教練本人可見"
      title="顧客列表"
      titleIcon={APP_ICON.quadrant.newCustomer}
      variant="plain"
    >
      {followUpCount > 0 ? (
        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
            今日建議關心
          </p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#1d1d1f]">
            有 {followUpCount} 位顧客值得今天花幾分鐘關心一下。
          </p>
          <ul className="mt-4 space-y-2">
            {dailyFollowUp.items.slice(0, 5).map((item) => (
              <li key={item.customer.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--brand-bg)] px-4 py-3"
                  href={`/customers/${item.customer.id}`}
                >
                  <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">
                    {item.customer.displayName}
                  </span>
                  <span className="text-[0.8125rem] text-[#86868b]">{item.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {notificationState !== "granted" ? (
        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <p className="text-[0.9375rem] leading-relaxed text-[#636366]">
            開啟通知後，每天早上 9 點會提醒你哪些顧客該關心（不會出現在首頁）。
          </p>
          <button
            className="mt-4 w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[1rem] font-semibold text-white"
            disabled={notificationState === "unsupported" || notificationState === "denied"}
            onClick={() => void handleEnableNotifications()}
            type="button"
          >
            {notificationState === "denied" ? "通知已在系統設定中關閉" : "開啟每日提醒"}
          </button>
        </section>
      ) : null}

      <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
            我的顧客
          </p>
          <ImageUploadSectionButton
            active={showForm}
            inactiveLabel="新增顧客"
            onClick={() => setShowForm((current) => !current)}
          />
        </div>

        {showForm ? (
          <form className="mt-4 space-y-4" onSubmit={handleCreate}>
            <CrmInput
              label="姓名"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            <CrmInput
              inputMode="tel"
              label="電話"
              onChange={(event) => setPhone(event.target.value)}
              value={phone}
            />
            <CrmInput
              inputMode="decimal"
              label="身高 cm"
              onChange={(event) => setHeightCm(event.target.value)}
              value={heightCm}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">性別</span>
                <select
                  className="w-full rounded-[1rem] border border-[#e5e5ea] bg-white px-4 py-3 text-[1rem] text-[#1d1d1f]"
                  onChange={(event) => setSex(event.target.value as CustomerSex | "")}
                  value={sex}
                >
                  <option value="">未填</option>
                  <option value="male">{CUSTOMER_SEX_LABELS.male}</option>
                  <option value="female">{CUSTOMER_SEX_LABELS.female}</option>
                </select>
              </label>
              <CrmInput
                label="出生日期"
                onChange={(event) => setBirthDate(event.target.value)}
                type="date"
                value={birthDate}
              />
            </div>
            <p className="text-[0.8125rem] text-[#86868b]">
              身高設定後固定；填完整出生日期後，量測會自動帶入年齡。
            </p>

            <CrmButton type="submit">建立並開始記錄</CrmButton>
          </form>
        ) : null}

        <div className="mt-4 space-y-3">
          <input
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋姓名、電話、LINE、備註…"
            type="search"
            value={query}
          />
          {customers.length > 0 ? (
            <p className="text-[0.8125rem] text-[#86868b]">
              {query.trim()
                ? `找到 ${visibleCustomers.length} / ${customers.length} 位顧客`
                : `共 ${customers.length} 位顧客`}
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibleCustomers.length > 0 ? (
            visibleCustomers.map((customer) => (
              <CustomerCard customer={customer} key={customer.id} />
            ))
          ) : customers.length > 0 ? (
            <p className="col-span-full text-[0.9375rem] text-[#86868b]">找不到符合的顧客，試試其他關鍵字。</p>
          ) : (
            <p className="col-span-full text-[0.9375rem] text-[#86868b]">尚無顧客，先新增第一位開始追蹤。</p>
          )}
        </div>
      </section>

    </PageShell>
  );
}
