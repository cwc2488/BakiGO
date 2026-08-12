"use client";

import { useCallback, useEffect, useState } from "react";
import { CrmButton, CrmCard, CrmSectionTitle } from "@/components/members/ui";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import type { CoachingCoachActionRecord } from "@/types/coaching-coach-actions";

type ResolutionChoice = "observe" | "follow_up" | "resolved";

const RESOLUTION_LABELS: Record<ResolutionChoice, string> = {
  observe: "已處理，持續觀察",
  follow_up: "需要之後追蹤",
  resolved: "已解決",
};

export default function CoachingCoachActionPanel({
  enrollmentId,
  reasonCodes = [],
  onSaved,
}: {
  enrollmentId: string;
  reasonCodes?: string[];
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState<ResolutionChoice>("observe");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<CoachingCoachActionRecord[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/coach-actions`,
      );
      const body = (await response.json()) as {
        ok?: boolean;
        actions?: CoachingCoachActionRecord[];
        error?: string;
      };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "無法載入教練紀錄");
      }
      setRecent((body.actions ?? []).slice(0, 3));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入教練紀錄");
    }
  }, [enrollmentId]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const actionType =
        resolution === "follow_up" ? "follow_up" : resolution === "observe" ? "acknowledged" : "note";
      const status =
        resolution === "resolved"
          ? "resolved"
          : resolution === "follow_up"
            ? "follow_up"
            : "acknowledged";

      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/coach-actions`,
        {
          method: "POST",
          body: JSON.stringify({
            actionType,
            status,
            note: note.trim() || null,
            relatedReasonCodes: reasonCodes,
            resolve: resolution === "resolved",
          }),
        },
      );
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "儲存失敗");
      }
      setNote("");
      setResolution("observe");
      setOpen(false);
      await loadRecent();
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrmCard className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CrmSectionTitle>教練處理紀錄</CrmSectionTitle>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">
            記錄你已了解的原因與處理方式，系統之後會記得，避免重複追問。
          </p>
        </div>
        <CrmButton type="button" variant="secondary" disabled={busy} onClick={() => setOpen((value) => !value)}>
          {open ? "取消" : "已了解原因／記錄處理"}
        </CrmButton>
      </div>

      {recent.length > 0 ? (
        <ul className="space-y-2">
          {recent.map((action) => (
            <li key={action.id} className="rounded-[1rem] border border-[#eef2ea] px-3 py-2">
              <p className="text-[0.75rem] text-[#86868b]">
                {action.createdAt.slice(0, 10)} · {action.status}
                {action.relatedReasonCodes.length > 0
                  ? ` · ${action.relatedReasonCodes.join("、")}`
                  : ""}
              </p>
              <p className="mt-1 text-[0.875rem] text-[#1d1d1f]">
                {action.note?.trim() || "（無文字說明）"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.875rem] text-[#86868b]">尚無教練處理紀錄。</p>
      )}

      {open ? (
        <div className="space-y-3 border-t border-[#eef2ea] pt-3">
          <label className="block space-y-1">
            <span className="text-[0.8125rem] font-medium text-[#636366]">處理說明</span>
            <textarea
              className="min-h-24 w-full rounded-[1rem] border border-[#e5e5ea] px-3 py-2 text-[0.9375rem] text-[#1d1d1f]"
              placeholder="例如：最近公司加班，預計週五後恢復正常作息。"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="space-y-2">
            {(Object.keys(RESOLUTION_LABELS) as ResolutionChoice[]).map((choice) => (
              <label key={choice} className="flex min-h-10 items-center gap-2 text-[0.875rem] text-[#1d1d1f]">
                <input
                  type="radio"
                  name="coach-action-resolution"
                  checked={resolution === choice}
                  onChange={() => setResolution(choice)}
                />
                {RESOLUTION_LABELS[choice]}
              </label>
            ))}
          </div>
          <CrmButton type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "儲存中…" : "儲存處理紀錄"}
          </CrmButton>
        </div>
      ) : null}

      {error ? <p className="text-[0.875rem] text-[#cf1322]">{error}</p> : null}
    </CrmCard>
  );
}
