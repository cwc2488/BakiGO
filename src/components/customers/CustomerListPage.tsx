"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { buildCustomerFollowUpHints } from "@/lib/customers/body-composition-compare";
import { buildDailyFollowUpSnapshot } from "@/lib/customers/customer-follow-up-reminder";
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
import type { Customer } from "@/types/customer";

interface CustomerListItem extends Customer {
  latestRecordDate?: string;
  followUpReason?: string;
  followUpUrgency?: "high" | "medium" | "low";
}

function CustomerCard({
  customer,
  onDelete,
}: {
  customer: CustomerListItem;
  onDelete: (customer: CustomerListItem) => void;
}) {
  const urgencyStyles = {
    high: "bg-[#fff1f0] text-[#cf1322]",
    medium: "bg-[#fff7e6] text-[#d46b08]",
    low: "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]",
  };

  return (
    <article className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
      <Link
        className="block transition-transform duration-200 active:scale-[0.99]"
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
            {customer.lastContactDate ? (
              <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">
                上次聯絡 {customer.lastContactDate}
              </p>
            ) : null}
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
      <div className="mt-3">
        <button
          className="rounded-full bg-[#fff1f0] px-4 py-2 text-[0.8125rem] font-medium text-[#cf1322]"
          onClick={() => onDelete(customer)}
          type="button"
        >
          刪除
        </button>
      </div>
    </article>
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
  const [birthYear, setBirthYear] = useState("");
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CustomerListItem | null>(null);
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
      birthYear: birthYear ? Number(birthYear) : undefined,
    });
    setName("");
    setPhone("");
    setHeightCm("");
    setBirthYear("");
    setShowForm(false);
    reload();
    router.push(`/customers/${customer.id}`);
  };

  const handleDelete = () => {
    if (!deleteTarget || !ownerMemberId || deleteTarget.ownerMemberId !== ownerMemberId) {
      return;
    }

    repo.deleteCustomer(deleteTarget.id);
    setDeleteTarget(null);
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
            <div className="grid grid-cols-2 gap-3">
              <CrmInput
                inputMode="decimal"
                label="身高 cm"
                onChange={(event) => setHeightCm(event.target.value)}
                value={heightCm}
              />
              <CrmInput
                inputMode="numeric"
                label="出生年"
                onChange={(event) => setBirthYear(event.target.value)}
                value={birthYear}
              />
            </div>
            <p className="text-[0.8125rem] text-[#86868b]">
              身高設定後固定；有出生年時，量測會自動帶入年齡。
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

        <div className="mt-4 space-y-3">
          {visibleCustomers.length > 0 ? (
            visibleCustomers.map((customer) => (
              <CustomerCard customer={customer} key={customer.id} onDelete={setDeleteTarget} />
            ))
          ) : customers.length > 0 ? (
            <p className="text-[0.9375rem] text-[#86868b]">找不到符合的顧客，試試其他關鍵字。</p>
          ) : (
            <p className="text-[0.9375rem] text-[#86868b]">尚無顧客，先新增第一位開始追蹤。</p>
          )}
        </div>
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-5 sm:items-center">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-[var(--brand-surface)] p-6">
            <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">刪除顧客？</p>
            <p className="mt-2 text-[0.9375rem] text-[#86868b]">
              將刪除 {deleteTarget.displayName} 的所有資料，包含量測、照片、收據與顧客連結。
            </p>
            <div className="mt-5 space-y-2">
              <CrmButton onClick={handleDelete} variant="danger">
                確認刪除
              </CrmButton>
              <CrmButton onClick={() => setDeleteTarget(null)} variant="secondary">
                取消
              </CrmButton>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
