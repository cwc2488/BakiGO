"use client";

import { useCallback, useEffect, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";

type Invite = {
  shareId: string;
  status: string;
  ctaTitle: string;
  ctaBody: string;
  shareTypeLabel: string;
  canActivate: boolean;
  canDecline: boolean;
  preview: {
    headline: string;
    bodyCopy: string;
  };
};

export default function CoachingPortalShareCard({ token }: { token: string }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shareUrlById, setShareUrlById] = useState<Record<string, string>>({});
  const [draftById, setDraftById] = useState<
    Record<
      string,
      {
        showIntroducerName: boolean;
        showDayCount: boolean;
        showMeasurementDelta: boolean;
        shareText: string;
        measurementDeltaSummary: string;
      }
    >
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/share`);
      const data = (await res.json()) as { ok?: boolean; invites?: Invite[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "無法載入分享邀請");
      setInvites(data.invites ?? []);
      setDraftById((prev) => {
        const next = { ...prev };
        for (const invite of data.invites ?? []) {
          if (!next[invite.shareId]) {
            next[invite.shareId] = {
              showIntroducerName: false,
              showDayCount: true,
              showMeasurementDelta: false,
              shareText: "",
              measurementDeltaSummary: "",
            };
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入分享邀請");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = async (shareId: string) => {
    const draft = draftById[shareId];
    if (!draft) return;
    setBusyId(shareId);
    setError(null);
    try {
      const res = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate",
          shareId,
          showIntroducerName: draft.showIntroducerName,
          showDayCount: draft.showDayCount,
          showMeasurementDelta: draft.showMeasurementDelta,
          shareText: draft.shareText || null,
          measurementDeltaSummary: draft.showMeasurementDelta
            ? draft.measurementDeltaSummary || null
            : null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        shareUrl?: string;
        publicPath?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "無法建立分享連結");
      const path = data.shareUrl ?? data.publicPath ?? "";
      const absolute =
        typeof window !== "undefined" && path ? `${window.location.origin}${path}` : path;
      setShareUrlById((prev) => ({ ...prev, [shareId]: absolute }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法建立分享連結");
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (shareId: string) => {
    setBusyId(shareId);
    try {
      const res = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline", shareId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "無法記錄");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法記錄");
    } finally {
      setBusyId(null);
    }
  };

  const copyOrShare = async (url: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "分享我的改變", url });
        return;
      }
    } catch {
      // fall through to copy
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  };

  if (loading && invites.length === 0) return null;
  if (!loading && invites.length === 0) return null;

  return (
    <div className="space-y-3">
      {error ? <p className="text-[0.875rem] text-[#c62828]">{error}</p> : null}
      {invites.map((invite) => {
        const draft = draftById[invite.shareId];
        const url = shareUrlById[invite.shareId];
        return (
          <CrmCard key={invite.shareId} className="space-y-4">
            <div>
              <p className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]">
                {invite.shareTypeLabel}
              </p>
              <h2 className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">{invite.ctaTitle}</h2>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-[#636366]">{invite.ctaBody}</p>
            </div>

            {draft && invite.status === "pending_consent" ? (
              <div className="space-y-3">
                <label className="flex items-center gap-3 text-[0.9375rem] text-[#1d1d1f]">
                  <input
                    type="checkbox"
                    checked={draft.showIntroducerName}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [invite.shareId]: { ...draft, showIntroducerName: e.target.checked },
                      }))
                    }
                  />
                  顯示我的名字
                </label>
                <label className="flex items-center gap-3 text-[0.9375rem] text-[#1d1d1f]">
                  <input
                    type="checkbox"
                    checked={draft.showDayCount}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [invite.shareId]: { ...draft, showDayCount: e.target.checked },
                      }))
                    }
                  />
                  顯示陪跑天數
                </label>
                <label className="block space-y-1">
                  <span className="text-[0.8125rem] text-[#86868b]">我想分享的感受（選填）</span>
                  <textarea
                    className="min-h-20 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-3 py-2"
                    value={draft.shareText}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [invite.shareId]: { ...draft, shareText: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="flex items-center gap-3 text-[0.9375rem] text-[#1d1d1f]">
                  <input
                    type="checkbox"
                    checked={draft.showMeasurementDelta}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [invite.shareId]: { ...draft, showMeasurementDelta: e.target.checked },
                      }))
                    }
                  />
                  我想自己寫一段改變摘要（不會自動公開體重／體脂）
                </label>
                {draft.showMeasurementDelta ? (
                  <textarea
                    className="min-h-16 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-3 py-2"
                    placeholder="例如：精神比較好、衣服變合身"
                    value={draft.measurementDeltaSummary}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [invite.shareId]: {
                          ...draft,
                          measurementDeltaSummary: e.target.value,
                        },
                      }))
                    }
                  />
                ) : null}
              </div>
            ) : null}

            <div className="rounded-2xl bg-[#f5f5f7] px-4 py-3">
              <p className="text-[0.8125rem] text-[#86868b]">預覽</p>
              <p className="mt-1 font-semibold text-[#1d1d1f]">{invite.preview.headline}</p>
              <p className="mt-1 text-[0.875rem] text-[#636366]">{invite.preview.bodyCopy}</p>
            </div>

            {url ? (
              <div className="space-y-2">
                <p className="break-all text-[0.8125rem] text-[#636366]">{url}</p>
                <CrmButton type="button" onClick={() => void copyOrShare(url)}>
                  分享／複製連結
                </CrmButton>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {invite.canActivate ? (
                  <CrmButton
                    type="button"
                    disabled={busyId === invite.shareId}
                    onClick={() => void activate(invite.shareId)}
                  >
                    取得分享連結
                  </CrmButton>
                ) : null}
                {invite.canDecline ? (
                  <CrmButton
                    type="button"
                    variant="secondary"
                    disabled={busyId === invite.shareId}
                    onClick={() => void decline(invite.shareId)}
                  >
                    先不要
                  </CrmButton>
                ) : null}
              </div>
            )}
          </CrmCard>
        );
      })}
    </div>
  );
}
