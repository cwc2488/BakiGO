"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { buildCustomerFollowUpHints } from "@/lib/customers/body-composition-compare";
import { buildDailyFollowUpSnapshot } from "@/lib/customers/customer-follow-up-reminder";
import { todayISODate } from "@/lib/config/app-config";
import {
  getNotificationPermissionState,
  requestAppNotificationPermission,
} from "@/lib/notifications/show-app-notification";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { PageShell } from "@/components/ui/PageShell";
import { APP_ICON } from "@/lib/ui/app-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer } from "@/types/customer";

interface CustomerListItem extends Customer {
  latestRecordDate?: string;
  followUpReason?: string;
  followUpUrgency?: "high" | "medium" | "low";
}

function CustomerCard({ customer }: { customer: CustomerListItem }) {
  const urgencyStyles = {
    high: "bg-[#fff1f0] text-[#cf1322]",
    medium: "bg-[#fff7e6] text-[#d46b08]",
    low: "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]",
  };

  return (
    <Link
      className="block rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 transition-transform duration-200 active:scale-[0.99]"
      href={`/customers/${customer.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[1rem] font-semibold text-[#1d1d1f]">{customer.displayName}</p>
          {customer.latestRecordDate ? (
            <p className="mt-1 text-[0.8125rem] text-[#86868b]">
              上次量測 {customer.latestRecordDate}
            </p>
          ) : (
            <p className="mt-1 text-[0.8125rem] text-[#86868b]">尚無量測紀錄</p>
          )}
        </div>
        {customer.followUpReason ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[0.75rem] font-medium ${
              urgencyStyles[customer.followUpUrgency ?? "low"]
            }`}
          >
            {customer.followUpReason}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default function CustomerListPage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const repo = useMemo(() => createCustomerRepository(storage), [storage]);
  const today = todayISODate();

  const [ownerMemberId, setOwnerMemberId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [notificationState, setNotificationState] = useState(() =>
    typeof window === "undefined" ? "default" : getNotificationPermissionState(),
  );

  const dailyFollowUp = useMemo(
    () => buildDailyFollowUpSnapshot(storage, ownerMemberId, today),
    [storage, ownerMemberId, today, customers],
  );

  const reload = useCallback(() => {
    const memberId = resolveAuthenticatedMemberId(storage);
    setOwnerMemberId(memberId);
    if (!memberId) {
      setCustomers([]);
      return;
    }

    const items = repo.getCustomersByOwner(memberId).map((customer) => {
      const records = repo.getBodyRecordsByCustomer(customer.id);
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

  const handleEnableNotifications = async () => {
    const next = await requestAppNotificationPermission();
    setNotificationState(next);
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ownerMemberId || !name.trim()) {
      return;
    }

    repo.createCustomer({
      ownerMemberId,
      displayName: name,
      phone: phone || undefined,
      heightCm: heightCm ? Number(heightCm) : undefined,
    });
    setName("");
    setPhone("");
    setHeightCm("");
    setShowForm(false);
    reload();
  };

  return (
    <PageShell
      backHref="/profile"
      backLabel="返回個人"
      subtitle="管理顧客量測與追蹤，資料僅教練本人可見"
      title="顧客關懷"
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
          <button
            className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
            onClick={() => setShowForm((current) => !current)}
            type="button"
          >
            {showForm ? "取消" : "新增顧客"}
          </button>
        </div>

        {showForm ? (
          <form className="mt-4 space-y-3" onSubmit={handleCreate}>
            <label className="block space-y-2">
              <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">姓名</span>
              <input
                className="date-input w-full"
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">電話（選填）</span>
              <input
                className="date-input w-full"
                inputMode="tel"
                onChange={(event) => setPhone(event.target.value)}
                value={phone}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">身高 cm（選填，設定後固定）</span>
              <input
                className="date-input w-full"
                inputMode="decimal"
                onChange={(event) => setHeightCm(event.target.value)}
                value={heightCm}
              />
            </label>
            <button
              className="w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[1rem] font-semibold text-white"
              type="submit"
            >
              建立顧客
            </button>
          </form>
        ) : null}

        <div className="mt-4 space-y-3">
          {customers.length > 0 ? (
            customers.map((customer) => <CustomerCard customer={customer} key={customer.id} />)
          ) : (
            <p className="text-[0.9375rem] text-[#86868b]">尚無顧客，先新增第一位開始追蹤。</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
