"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { flushCustomerCloudPush } from "@/lib/cloud/customer-cloud-sync";
import { createConsultationSessionApi } from "@/lib/consultation/consultation-client";
import { ConsultationPrimaryButton } from "@/components/consultation/ConsultationFlowShell";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Customer } from "@/types/customer";

export function ConsultationNewPage() {
  const router = useRouter();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const repo = useMemo(() => createCustomerRepository(storage), [storage]);
  const memberId = useMemo(() => resolveAuthenticatedMemberId(storage), [storage]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [region, setRegion] = useState("");
  const [occupation, setOccupation] = useState("");
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadCustomers = useCallback(() => {
    if (!memberId) {
      setCustomers([]);
      return;
    }
    setCustomers(repo.getCustomersByOwner(memberId));
  }, [memberId, repo]);

  useEffect(() => {
    reloadCustomers();
  }, [reloadCustomers]);

  useEffect(() => {
    if (!memberId || !phone.trim()) {
      setDuplicateCustomer(null);
      return;
    }
    setDuplicateCustomer(repo.findCustomerByPhoneForOwner(memberId, phone) ?? null);
  }, [memberId, phone, repo]);

  async function startConsultation(customerId: string) {
    setLoading(true);
    setError(null);
    try {
      await flushCustomerCloudPush(storage);
      const payload = await createConsultationSessionApi(customerId);
      if (!payload.session?.id) {
        throw new Error(payload.error ?? "無法建立諮詢場次");
      }
      router.push(`/consultation/${payload.session.id}/step/${payload.session.currentStep}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "無法建立諮詢場次");
    } finally {
      setLoading(false);
    }
  }

  async function handleExistingSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCustomerId) {
      setError("請選擇一位顧客");
      return;
    }
    await startConsultation(selectedCustomerId);
  }

  async function handleNewSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!memberId) {
      setError("請先登入");
      return;
    }
    if (!displayName.trim()) {
      setError("請輸入姓名");
      return;
    }
    if (duplicateCustomer) {
      setError("可能已有此客戶，請改用既有顧客或取消建立。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const parsedHeight = heightCm.trim() ? Number(heightCm) : undefined;
      const customer = repo.createCustomer({
        ownerMemberId: memberId,
        displayName: displayName.trim(),
        phone: phone.trim() || undefined,
        birthDate: birthDate.trim() || undefined,
        heightCm: Number.isFinite(parsedHeight) ? parsedHeight : undefined,
        region: region.trim() || undefined,
        occupation: occupation.trim() || undefined,
      });
      reloadCustomers();
      await startConsultation(customer.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "無法建立顧客");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-[#faf6f1]">
      <main className="mx-auto w-full max-w-lg px-4 pb-10 pt-8 sm:px-6">
        <Link className="text-sm text-[#8b7d74]" href="/">
          ← 返回首頁
        </Link>
        <div className="mt-4 space-y-2">
          <h1 className="text-[1.75rem] font-semibold text-[#2f2622]">開始引導式諮詢</h1>
          <p className="text-[0.98rem] leading-7 text-[#6f5f57]">
            選擇或建立正式顧客檔案後，依 SOP 一步一步完成諮詢。
          </p>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
              mode === "existing"
                ? "bg-[#2f2622] text-white"
                : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
            }`}
            onClick={() => setMode("existing")}
          >
            既有顧客
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
              mode === "new"
                ? "bg-[#2f2622] text-white"
                : "bg-white text-[#6f5f57] ring-1 ring-[#eadfd6]"
            }`}
            onClick={() => setMode("new")}
          >
            新顧客
          </button>
        </div>

        {mode === "existing" ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void handleExistingSubmit(event)}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f4f47]">選擇顧客</span>
              <select
                className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
                value={selectedCustomerId}
                onChange={(event) => setSelectedCustomerId(event.target.value)}
              >
                <option value="">請選擇…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.displayName}
                    {customer.phone ? ` · ${customer.phone}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {customers.length === 0 ? (
              <p className="text-sm text-[#9a8b82]">尚無顧客，請改用「新顧客」建立正式檔案。</p>
            ) : null}
            <ConsultationPrimaryButton type="submit" disabled={loading}>
              {loading ? "準備中…" : "開始諮詢"}
            </ConsultationPrimaryButton>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={(event) => void handleNewSubmit(event)}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f4f47]">姓名（必填）</span>
              <input
                className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="正式顧客姓名"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f4f47]">電話</span>
              <input
                className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            {duplicateCustomer ? (
              <div className="rounded-[1.25rem] border border-[#f0d4dc] bg-[#fff8fa] px-4 py-4">
                <p className="text-sm font-medium text-[#c08a98]">可能已有此客戶</p>
                <p className="mt-1 text-sm text-[#6f5f57]">
                  {duplicateCustomer.displayName}
                  {duplicateCustomer.phone ? ` · ${duplicateCustomer.phone}` : ""}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <ConsultationPrimaryButton
                    type="button"
                    disabled={loading}
                    onClick={() => void startConsultation(duplicateCustomer.id)}
                  >
                    使用既有顧客開始諮詢
                  </ConsultationPrimaryButton>
                  <button
                    type="button"
                    className="text-sm text-[#8b7d74] underline"
                    onClick={() => {
                      setPhone("");
                      setDuplicateCustomer(null);
                    }}
                  >
                    取消建立
                  </button>
                </div>
              </div>
            ) : null}
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f4f47]">出生年月日</span>
              <input
                className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f4f47]">身高 (cm)</span>
              <input
                className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
                inputMode="decimal"
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f4f47]">地區</span>
              <input
                className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f4f47]">工作</span>
              <input
                className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base"
                value={occupation}
                onChange={(event) => setOccupation(event.target.value)}
              />
            </label>
            {!duplicateCustomer ? (
              <ConsultationPrimaryButton type="submit" disabled={loading}>
                {loading ? "建立中…" : "建立顧客並開始諮詢"}
              </ConsultationPrimaryButton>
            ) : null}
          </form>
        )}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </main>
    </div>
  );
}
