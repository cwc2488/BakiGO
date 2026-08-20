"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  fetchRecognitionExceptions,
  postRecognitionExceptionAction,
} from "@/lib/recognition/recognition-fetch";
import type { RecognitionExceptionItem } from "@/types/recognition";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { useCallback, useEffect, useState } from "react";

export function RecognitionExceptionCenterPage({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<RecognitionExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRecognitionExceptions(eventId)
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "無法載入例外"))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(entryId: string, action: "override" | "exclude") {
    setBusyId(entryId);
    setError(null);
    try {
      await postRecognitionExceptionAction(eventId, entryId, action, reason);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell
      title="例外處理"
      subtitle="只處理系統無法自動決定、需要你做業務判斷的項目。照片品質請由投稿者自行修正。"
      backHref={`/recognition/events/${eventId}`}
      backLabel="返回活動"
    >
      {loading && <p className="text-[0.9375rem] text-[#86868b]">載入中…</p>}
      {error && <p className="text-[0.9375rem] text-[#ff375f]">{error}</p>}
      {!loading && items.length === 0 && (
        <BrandCard variant="bordered">
          <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">沒有需要你決定的項目</p>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">正常投稿已自動通過，可以直接產生表揚 PPT。</p>
        </BrandCard>
      )}
      {items.map((item) => (
        <BrandCard key={item.entryId} variant="bordered">
          <p className="text-[0.8125rem] text-[#86868b]">{item.awardName}</p>
          <h2 className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">{item.submittedName || "（未填姓名）"}</h2>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">投稿者 {item.submitterName}</p>
          <p className="mt-3 text-[0.875rem] font-semibold text-[#1d1d1f]">需要我決定</p>
          <ul className="mt-2 flex flex-col gap-1 text-[0.875rem] text-[#ff375f]">
            {item.issues
              .filter((issue) => issue.severity === "blocked" || issue.severity === "technical")
              .map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
          </ul>
          <p className="mt-2 text-[0.75rem] text-[#aeaeb2]">系統狀態（除錯）：{item.validationStatus}</p>
          <textarea
            className="mt-3 w-full rounded-2xl border border-[var(--brand-border)] px-3 py-2 text-[0.875rem]"
            rows={2}
            placeholder="備註（可選）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-3 flex flex-col gap-2">
            {item.canAdminOverride && (
              <button
                type="button"
                disabled={busyId === item.entryId}
                onClick={() => void run(item.entryId, "override")}
                className="rounded-2xl bg-[#1d1d1f] px-4 py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-60"
              >
                確認無誤・強制通過
              </button>
            )}
            {item.hasTechnicalBlocker && (
              <p className="text-[0.8125rem] text-[#86868b]">
                此筆有技術問題，無法強制通過。請修正照片，或取消此筆表揚。
              </p>
            )}
            <button
              type="button"
              disabled={busyId === item.entryId}
              onClick={() => void run(item.entryId, "exclude")}
              className="rounded-2xl border border-[#ff375f]/30 bg-[#fff5f6] px-4 py-3 text-[0.9375rem] font-semibold text-[#ff375f] disabled:opacity-60"
            >
              取消此筆表揚
            </button>
          </div>
        </BrandCard>
      ))}
    </PageShell>
  );
}
