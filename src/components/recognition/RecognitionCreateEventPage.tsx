"use client";

import { createRecognitionEvent } from "@/lib/recognition/recognition-fetch";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard, PrimaryButton } from "@/components/ui/brand-ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"] as const;

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[0.9375rem] font-medium text-[#1d1d1f]">{label}</label>
      {children}
      {hint && <p className="text-[0.8125rem] text-[#86868b]">{hint}</p>}
    </div>
  );
}

const INPUT_CLASS =
  "w-full appearance-none rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]";

export function RecognitionCreateEventPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [collectStartsAt, setCollectStartsAt] = useState("");
  const [collectEndsAt, setCollectEndsAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("請輸入活動名稱");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const event = await createRecognitionEvent({
        name: name.trim(),
        year,
        month,
        collectStartsAt: collectStartsAt || null,
        collectEndsAt: collectEndsAt || null,
      });
      router.push(`/recognition/events/${event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗，請稍後再試");
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      title="建立表揚活動"
      backHref="/recognition"
      backLabel="返回表揚中心"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
        <BrandCard variant="bordered">
          <div className="flex flex-col gap-4">
            <Field label="活動名稱" hint="例：2026 年 9 月月會">
              <input
                type="text"
                className={INPUT_CLASS}
                placeholder="2026 年 9 月月會"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={submitting}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="年份">
                <select
                  className={INPUT_CLASS}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  disabled={submitting}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="月份">
                <select
                  className={INPUT_CLASS}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  disabled={submitting}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{MONTH_LABELS[m - 1]}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </BrandCard>

        <BrandCard variant="bordered">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
            收件時間（選填）
          </p>
          <div className="mt-3 flex flex-col gap-4">
            <Field label="開始收件">
              <input
                type="datetime-local"
                className={INPUT_CLASS}
                value={collectStartsAt}
                onChange={(e) => setCollectStartsAt(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="截止收件">
              <input
                type="datetime-local"
                className={INPUT_CLASS}
                value={collectEndsAt}
                onChange={(e) => setCollectEndsAt(e.target.value)}
                disabled={submitting}
              />
            </Field>
          </div>
        </BrandCard>

        {error && (
          <p className="rounded-2xl bg-[#fff1f1] px-4 py-3 text-[0.9375rem] text-[#ff375f]">
            {error}
          </p>
        )}

        <BrandCard variant="bordered">
          <p className="text-[0.875rem] text-[#86868b]">
            建立後，系統會自動從表揚項目目錄複製預設 27 項，你可以在活動頁面啟用／停用並調整排序。
          </p>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">初始狀態為<strong>草稿</strong>，開始公開收件前可隨時修改設定。</p>
        </BrandCard>

        <PrimaryButton type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "建立中…" : "建立表揚活動"}
        </PrimaryButton>
      </form>
    </PageShell>
  );
}
