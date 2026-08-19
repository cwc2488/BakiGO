"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { PresentationCropEditor } from "@/components/recognition/PresentationCropEditor";
import {
  fetchRecognitionCandidatePhotoObjectUrl,
  fetchRecognitionPhotoReviewQueue,
  updateRecognitionCandidatePhotoReview,
} from "@/lib/recognition/recognition-fetch";
import {
  defaultRecognitionCoverCrop,
  nextRecognitionPhotoReviewCandidateId,
  RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY,
  RECOGNITION_PHOTO_REVIEW_FLAG_LABELS,
  RECOGNITION_PHOTO_REVIEW_FLAGS,
  RECOGNITION_LOW_RESOLUTION_WARNING,
  recognitionHasLowResolutionWarning,
} from "@/lib/recognition/recognition-photo-review";
import type {
  RecognitionNormalizedCrop,
  RecognitionPhotoReviewFlag,
  RecognitionPhotoReviewQueueFilter,
  RecognitionPhotoReviewQueueItem,
  RecognitionPresentationPhotoReadinessState,
} from "@/types/recognition";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const FILTERS: Array<{ id: RecognitionPhotoReviewQueueFilter; label: string }> = [
  { id: "all-photo-required", label: "全部需照片" },
  { id: "needs-review", label: "待裁切" },
  { id: "crop-ready", label: "已完成" },
  { id: "blocked", label: "已封鎖" },
  { id: "missing-photo", label: "缺少照片" },
  { id: "no-preferred-photo", label: "未選正式照片" },
];

const STATE_LABELS: Record<RecognitionPresentationPhotoReadinessState, string> = {
  not_required: "不需照片",
  no_original_photo: "缺少原圖",
  invalid_photo: "缺少有效照片",
  preferred_source_not_selected: "尚未選擇正式照片",
  needs_photo_review: "需要照片審查",
  crop_ready: "裁切完成",
  photo_blocked: "照片不可用",
};

function PrivatePhoto({
  eventId,
  candidateId,
  sourceEntryId,
  children,
}: {
  eventId: string;
  candidateId: string;
  sourceEntryId: string;
  children: (url: string) => ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchRecognitionCandidatePhotoObjectUrl(eventId, candidateId, sourceEntryId)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [eventId, candidateId, sourceEntryId]);

  if (!url) {
    return <div className="h-40 rounded-2xl bg-[#eee]" />;
  }
  return <>{children(url)}</>;
}

export function RecognitionPhotoReviewPage({ eventId }: { eventId: string }) {
  const [filter, setFilter] = useState<RecognitionPhotoReviewQueueFilter>("needs-review");
  const [items, setItems] = useState<RecognitionPhotoReviewQueueItem[]>([]);
  const [allItems, setAllItems] = useState<RecognitionPhotoReviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crop, setCrop] = useState<RecognitionNormalizedCrop | null>(null);
  const [flags, setFlags] = useState<RecognitionPhotoReviewFlag[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState("");
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const load = useCallback(async (nextSelectedId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [filtered, all] = await Promise.all([
        fetchRecognitionPhotoReviewQueue(eventId, filter),
        fetchRecognitionPhotoReviewQueue(eventId, "all-photo-required"),
      ]);
      setItems(filtered.items);
      setAllItems(all.items);
      const keepId = nextSelectedId
        ?? selectedId
        ?? filtered.items[0]?.candidate.id
        ?? all.items.find((item) => item.validation.readinessState === "needs_photo_review")?.candidate.id
        ?? all.items[0]?.candidate.id
        ?? null;
      setSelectedId(keepId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入照片審查");
    } finally {
      setLoading(false);
    }
  }, [eventId, filter, selectedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, filter]);

  const selected = useMemo(
    () => allItems.find((item) => item.candidate.id === selectedId) ?? items.find((item) => item.candidate.id === selectedId) ?? null,
    [allItems, items, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setCrop(selected.photoReview?.crop ?? null);
    setFlags(selected.photoReview?.flags ?? []);
    setIsBlocked(selected.photoReview?.isBlocked ?? false);
    setBlockedReason(selected.photoReview?.blockedReason ?? "");
    if (selected.photoReview?.originalWidth && selected.photoReview.originalHeight) {
      setDimensions({
        width: selected.photoReview.originalWidth,
        height: selected.photoReview.originalHeight,
      });
    } else {
      setDimensions(null);
    }
  }, [selected]);

  const pendingCount = allItems.filter((item) => (
    item.validation.readinessState === "needs_photo_review"
    || item.validation.readinessState === "no_original_photo"
    || item.validation.readinessState === "invalid_photo"
    || item.validation.readinessState === "preferred_source_not_selected"
    || item.validation.readinessState === "photo_blocked"
  )).length;

  async function save(finalize: boolean, nextCrop: RecognitionNormalizedCrop | null = crop) {
    if (!selected?.preferredSource) {
      setError("請先在審核中心選擇正式使用的照片。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateRecognitionCandidatePhotoReview(eventId, selected.candidate.id, {
        sourceEntryId: selected.preferredSource.submissionEntryId,
        crop: nextCrop,
        flags,
        isBlocked,
        blockedReason: isBlocked ? blockedReason : null,
        originalWidth: dimensions?.width,
        originalHeight: dimensions?.height,
        finalize,
      });
      await load(updated.candidate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  function goNext() {
    const nextId = nextRecognitionPhotoReviewCandidateId({
      items: allItems.map((item) => ({
        candidateId: item.candidate.id,
        readinessState: item.validation.readinessState,
      })),
      currentCandidateId: selected?.candidate.id ?? "",
    });
    if (nextId) setSelectedId(nextId);
  }

  function toggleFlag(flag: RecognitionPhotoReviewFlag) {
    setFlags((current) => (
      current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]
    ));
  }

  return (
    <PageShell
      title="照片審查"
      subtitle="原圖保留，只建立簡報用裁切"
      backHref={`/recognition/events/${eventId}`}
      backLabel="返回活動"
    >
      <BrandCard variant="bordered">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ${
                filter === item.id ? "bg-[#1d1d1f] text-white" : "border border-[var(--brand-border)] text-[#1d1d1f]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[0.8125rem] text-[#86868b]">{pendingCount} 待處理</p>
      </BrandCard>

      {loading && <p className="text-[0.875rem] text-[#86868b]">載入中…</p>}
      {error && <p className="text-[0.875rem] text-[#ff375f]">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <BrandCard variant="bordered">
          <p className="text-[0.8125rem] font-semibold text-[#86868b]">候選人</p>
          <div className="mt-3 flex max-h-[70vh] flex-col gap-2 overflow-auto">
            {(filter === "all-photo-required" ? allItems : items).map((item) => (
              <button
                key={item.candidate.id}
                type="button"
                onClick={() => setSelectedId(item.candidate.id)}
                className={`rounded-2xl px-3 py-2 text-left ${
                  item.candidate.id === selectedId ? "bg-[#1d1d1f] text-white" : "bg-[#f5f5f7] text-[#1d1d1f]"
                }`}
              >
                <p className="text-[0.875rem] font-semibold">{item.candidate.displayName}</p>
                <p className="text-[0.75rem] opacity-80">{item.candidate.awardName}</p>
                <p className="text-[0.75rem] opacity-80">{STATE_LABELS[item.validation.readinessState]}</p>
              </button>
            ))}
            {!loading && items.length === 0 && (
              <p className="text-[0.875rem] text-[#86868b]">這個篩選沒有候選人。</p>
            )}
          </div>
        </BrandCard>

        {selected && (
          <BrandCard variant="bordered">
            <p className="text-[0.75rem] text-[#86868b]">{selected.candidate.awardName}</p>
            <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">{selected.candidate.displayName}</h2>
            <p className="mt-1 text-[0.8125rem] text-[#86868b]">
              {selected.candidate.requiresPhoto ? "需要照片" : "純姓名"} · {STATE_LABELS[selected.validation.readinessState]}
            </p>
            {selected.preferredSource && (
              <p className="mt-1 text-[0.8125rem] text-[#86868b]">
                來源：{selected.preferredSource.submitterName} · {selected.preferredSource.submitterOrganization}
              </p>
            )}
            {dimensions && (
              <p className="mt-1 text-[0.8125rem] text-[#86868b]">
                原始尺寸：{dimensions.width} × {dimensions.height}
              </p>
            )}
            {recognitionHasLowResolutionWarning({
              originalWidth: dimensions?.width,
              originalHeight: dimensions?.height,
            }) && (
              <p className="mt-2 rounded-xl bg-[#fff4d6] px-3 py-2 text-[0.8125rem] text-[#9a6700]">
                {RECOGNITION_LOW_RESOLUTION_WARNING}
              </p>
            )}
            {selected.validation.warnings.map((warning) => (
              <p key={warning} className="mt-2 text-[0.8125rem] text-[#9a6700]">{warning}</p>
            ))}
            {selected.validation.blockers.map((blocker) => (
              <p key={blocker} className="mt-2 text-[0.8125rem] text-[#ff375f]">{blocker}</p>
            ))}

            {selected.preferredSource ? (
              <div className="mt-4">
                <PrivatePhoto
                  eventId={eventId}
                  candidateId={selected.candidate.id}
                  sourceEntryId={selected.preferredSource.submissionEntryId}
                >
                  {(url) => (
                    <PresentationCropEditor
                      imageUrl={url}
                      crop={crop}
                      onChange={setCrop}
                      onDimensions={(width, height) => setDimensions({ width, height })}
                    />
                  )}
                </PrivatePhoto>
              </div>
            ) : (
              <p className="mt-4 text-[0.875rem] text-[#86868b]">尚未選擇正式照片，無法裁切。</p>
            )}

            <div className="mt-4">
              <p className="text-[0.8125rem] font-semibold text-[#1d1d1f]">照片問題標記</p>
              <p className="mt-1 text-[0.75rem] text-[#86868b]">
                這些是審查標記，不會改動原圖。系統不會從合照中猜測哪一個人是受表揚者。
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {RECOGNITION_PHOTO_REVIEW_FLAGS.map((flag) => (
                  <button
                    key={flag}
                    type="button"
                    onClick={() => toggleFlag(flag)}
                    className={`rounded-full px-3 py-1.5 text-[0.75rem] font-medium ${
                      flags.includes(flag) ? "bg-[#1d1d1f] text-white" : "border border-[var(--brand-border)]"
                    }`}
                  >
                    {flag === "group_photo" ? RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY : RECOGNITION_PHOTO_REVIEW_FLAG_LABELS[flag]}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-[0.875rem] text-[#1d1d1f]">
              <input
                type="checkbox"
                checked={isBlocked}
                onChange={(event) => setIsBlocked(event.target.checked)}
              />
              此照片不可安全用於簡報
            </label>
            {isBlocked && (
              <input
                className="mt-2 w-full rounded-2xl border border-[var(--brand-border)] px-3 py-2 text-[0.875rem]"
                placeholder="封鎖原因"
                value={blockedReason}
                onChange={(event) => setBlockedReason(event.target.value)}
              />
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || !selected.preferredSource || !crop}
                onClick={() => void save(true)}
                className="rounded-xl bg-[#1d1d1f] px-3 py-2 text-[0.875rem] font-semibold text-white disabled:opacity-40"
              >
                {saving ? "儲存中…" : "儲存裁切"}
              </button>
              <button
                type="button"
                disabled={saving || !selected.preferredSource}
                onClick={() => void save(false)}
                className="rounded-xl border px-3 py-2 text-[0.875rem] font-medium disabled:opacity-40"
              >
                儲存標記
              </button>
              <button
                type="button"
                disabled={saving || !dimensions}
                onClick={() => {
                  if (!dimensions) return;
                  setCrop(defaultRecognitionCoverCrop({
                    originalWidth: dimensions.width,
                    originalHeight: dimensions.height,
                  }));
                }}
                className="rounded-xl border px-3 py-2 text-[0.875rem] font-medium disabled:opacity-40"
              >
                重設裁切
              </button>
              <button
                type="button"
                disabled={saving || !selected.preferredSource}
                onClick={() => void save(false, null)}
                className="rounded-xl border px-3 py-2 text-[0.875rem] font-medium disabled:opacity-40"
              >
                清除裁切
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded-xl border px-3 py-2 text-[0.875rem] font-medium"
              >
                下一位需要處理
              </button>
            </div>
          </BrandCard>
        )}
      </div>
    </PageShell>
  );
}
