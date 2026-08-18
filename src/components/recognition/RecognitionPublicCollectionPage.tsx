"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { fetchRecognitionPublicEvent, submitRecognitionPublicForm } from "@/lib/recognition/recognition-fetch";
import { PresentationCropEditor } from "@/components/recognition/PresentationCropEditor";
import { defaultRecognitionCoverCrop, recognitionHasLandscapeOrientationHint } from "@/lib/recognition/recognition-photo-review";
import type { RecognitionNormalizedCrop, RecognitionPublicEvent } from "@/types/recognition";
import { useEffect, useMemo, useState } from "react";

type PublicEntry = {
  id: string;
  eventAwardId: string;
  submittedName: string;
  photo: File | null;
  previewUrl: string | null;
  crop: RecognitionNormalizedCrop | null;
  originalWidth: number | null;
  originalHeight: number | null;
  keepMultiPerson: boolean;
};

type CompletionView = {
  complete: boolean;
  readyCount: number;
  blockedCount: number;
  total: number;
  message: string;
  issues: Array<{ name: string; awardName: string; messages: string[] }>;
};

function createEntry(defaultAwardId = ""): PublicEntry {
  return {
    id: crypto.randomUUID(),
    eventAwardId: defaultAwardId,
    submittedName: "",
    photo: null,
    previewUrl: null,
    crop: null,
    originalWidth: null,
    originalHeight: null,
    keepMultiPerson: false,
  };
}

const INPUT_CLASS =
  "w-full appearance-none rounded-2xl border border-[#d9e2dc] bg-white px-4 py-3 text-[1rem] outline-none focus:border-[#248a3d]";

const EDIT_KEY = (token: string) => `recognition-edit:${token}`;

export function RecognitionPublicCollectionPage({ token }: { token: string }) {
  const [event, setEvent] = useState<RecognitionPublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitterName, setSubmitterName] = useState("");
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [completion, setCompletion] = useState<CompletionView | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchRecognitionPublicEvent(token)
      .then((data) => {
        setEvent(data);
        setEntries([createEntry(data.awards[0]?.eventAwardId ?? "")]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "無法載入連結"))
      .finally(() => setLoading(false));
  }, [token]);

  const awardMap = useMemo(
    () => new Map((event?.awards ?? []).map((award) => [award.eventAwardId, award])),
    [event],
  );

  function updateEntry(id: string, patch: Partial<PublicEntry>) {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, createEntry(event?.awards[0]?.eventAwardId ?? "")]);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.length === 1 ? prev : prev.filter((entry) => entry.id !== id));
  }

  async function onPhotoSelected(entry: PublicEntry, file: File | null) {
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    if (!file) {
      updateEntry(entry.id, {
        photo: null,
        previewUrl: null,
        crop: null,
        originalWidth: null,
        originalHeight: null,
        keepMultiPerson: false,
      });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ width: 1200, height: 1600 });
      image.src = previewUrl;
    });
    updateEntry(entry.id, {
      photo: file,
      previewUrl,
      originalWidth: dims.width,
      originalHeight: dims.height,
      crop: defaultRecognitionCoverCrop({ originalWidth: dims.width, originalHeight: dims.height }),
      keepMultiPerson: false,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSubmitting(true);
    setError(null);
    setCompletion(null);

    try {
      const formData = new FormData();
      formData.set("submitterName", submitterName);
      formData.set("submitterOrganization", "");

      const entryPayload = entries.map((entry, index) => {
        const fileKey = entry.photo ? `photo_${index}` : null;
        if (entry.photo && fileKey) formData.set(fileKey, entry.photo);
        return {
          submittedName: entry.submittedName,
          eventAwardId: entry.eventAwardId,
          photoFieldKey: fileKey,
          crop: entry.crop,
          originalWidth: entry.originalWidth,
          originalHeight: entry.originalHeight,
          confirmedWarnings: entry.keepMultiPerson ? ["multi_person"] : [],
        };
      });
      formData.set("entries", JSON.stringify(entryPayload));

      const result = await submitRecognitionPublicForm(token, formData);
      if (result.editToken) {
        window.localStorage.setItem(EDIT_KEY(token), JSON.stringify({
          submissionId: result.submissionId,
          editToken: result.editToken,
        }));
      }
      setCompletion({
        complete: Boolean(result.completion?.complete),
        readyCount: result.completion?.readyCount ?? 0,
        blockedCount: result.completion?.blockedCount ?? 0,
        total: result.completion?.total ?? entries.length,
        message: result.message,
        issues: (result.entries ?? [])
          .filter((item) => item.status === "BLOCKED")
          .map((item) => ({
            name: item.submittedName,
            awardName: item.awardName,
            messages: item.issues.map((issue) => issue.message),
          })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#f7fbf8] px-5 py-10 text-center text-[#6f7d73]">載入中…</div>;
  }

  if (error && !event) {
    return (
      <div className="min-h-screen bg-[#f7fbf8] px-5 py-10">
        <div className="mx-auto max-w-md rounded-[2rem] border border-[#d9e2dc] bg-white p-6 text-center shadow-[0_12px_40px_rgba(36,138,61,0.08)]">
          <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">表揚收件連結</p>
          <p className="mt-3 text-[0.9375rem] text-[#ff375f]">{error}</p>
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4fbf6_0%,#f7fbf8_45%,#eef8f1_100%)] px-4 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <section className="rounded-[2rem] border border-[#d9e2dc] bg-white p-6 shadow-[0_12px_40px_rgba(36,138,61,0.08)]">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#77a183]">Baki GO 表揚中心</p>
          <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight text-[#1d1d1f]">{event.name}</h1>
          <p className="mt-2 text-[0.9375rem] text-[#6f7d73]">
            {event.year} 年 {event.month} 月
          </p>
          {event.collectEndsAt && (
            <p className="mt-1 text-[0.875rem] text-[#6f7d73]">
              收件截止：{new Date(event.collectEndsAt).toLocaleString("zh-TW")}
            </p>
          )}
          <p className="mt-3 text-[0.875rem] leading-relaxed text-[#6f7d73]">
            請把資料整理到可直接進簡報。系統會立刻檢查，完整資料會自動通過。
          </p>
        </section>

        {completion && (
          <section className={`rounded-[2rem] border p-5 ${completion.complete ? "border-[#b9e4c4] bg-[#eef8f1]" : "border-[#ffd60a] bg-[#fff8e5]"}`}>
            <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{completion.message}</p>
            {!completion.complete && (
              <>
                <p className="mt-2 text-[0.9375rem] text-[#1d1d1f]">
                  ⚠️ 投稿尚未完成　{completion.readyCount} / {completion.total} 完成
                </p>
                <p className="text-[0.875rem] text-[#6f7d73]">{completion.blockedCount} 筆需要修正</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {completion.issues.map((issue) => (
                    <li key={`${issue.name}-${issue.awardName}`} className="rounded-2xl bg-white px-3 py-2 text-[0.875rem]">
                      <strong>{issue.name}</strong> · {issue.awardName}
                      <div className="mt-1 text-[#ff375f]">{issue.messages.join(" ")}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {completion.complete && (
              <p className="mt-2 text-[0.875rem] text-[#248a3d]">✅ 投稿完成。截止前仍可回來修改照片與姓名。</p>
            )}
          </section>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <section className="rounded-[2rem] border border-[#d9e2dc] bg-white p-5">
            <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">填報者</p>
            <div className="mt-4">
              <input
                className={INPUT_CLASS}
                placeholder="你的姓名"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                disabled={submitting}
              />
            </div>
          </section>

          {entries.map((entry, index) => {
            const award = awardMap.get(entry.eventAwardId);
            const landscape = recognitionHasLandscapeOrientationHint({
              originalWidth: entry.originalWidth,
              originalHeight: entry.originalHeight,
            });
            return (
              <section key={entry.id} className="rounded-[2rem] border border-[#d9e2dc] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">第 {index + 1} 位</p>
                  {entries.length > 1 && (
                    <button type="button" onClick={() => removeEntry(entry.id)} className="text-[0.875rem] font-medium text-[#ff375f]">
                      移除
                    </button>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  <input
                    className={INPUT_CLASS}
                    placeholder="受表揚者姓名"
                    value={entry.submittedName}
                    onChange={(e) => updateEntry(entry.id, { submittedName: e.target.value })}
                    disabled={submitting}
                  />
                  <select
                    className={INPUT_CLASS}
                    value={entry.eventAwardId}
                    onChange={(e) => updateEntry(entry.id, { eventAwardId: e.target.value, photo: null, previewUrl: null })}
                    disabled={submitting}
                  >
                    {event.awards.map((item) => (
                      <option key={item.eventAwardId} value={item.eventAwardId}>
                        {item.name}{item.requiresPhoto ? "（需照片）" : ""}
                      </option>
                    ))}
                  </select>

                  {award?.requiresPhoto && (
                    <div className="rounded-2xl bg-[#f7fbf8] p-4">
                      <label className="block text-[0.875rem] font-medium text-[#1d1d1f]">照片 · 最後會這樣出現在 PPT</label>
                      <input
                        type="file"
                        accept="image/*,.heic,.heif"
                        className="mt-3 block w-full text-[0.875rem] text-[#6f7d73]"
                        onChange={(e) => void onPhotoSelected(entry, e.target.files?.[0] ?? null)}
                        disabled={submitting}
                      />
                      {entry.previewUrl && (
                        <div className="mt-3 flex flex-col gap-3">
                          <PresentationCropEditor
                            imageUrl={entry.previewUrl}
                            crop={entry.crop}
                            onChange={(crop) => updateEntry(entry.id, { crop })}
                            onDimensions={(width, height) => updateEntry(entry.id, { originalWidth: width, originalHeight: height })}
                          />
                          {landscape && !entry.keepMultiPerson && (
                            <div className="rounded-2xl bg-[#fff8e5] p-3 text-[0.875rem] leading-relaxed text-[#1d1d1f]">
                              照片中似乎有多位人物。如果本次為夫妻／共同受獎，可以直接使用。如果只有其中一位受表揚，建議調整照片。
                              <div className="mt-3 flex flex-col gap-2">
                                <button
                                  type="button"
                                  className="rounded-xl bg-[#1d1d1f] px-3 py-2 text-[0.8125rem] font-semibold text-white"
                                  onClick={() => updateEntry(entry.id, { keepMultiPerson: true })}
                                >
                                  保持原照片
                                </button>
                                <label className="rounded-xl border border-[#d9e2dc] bg-white px-3 py-2 text-center text-[0.8125rem] font-medium">
                                  重新上傳
                                  <input
                                    type="file"
                                    accept="image/*,.heic,.heif"
                                    className="hidden"
                                    onChange={(e) => void onPhotoSelected(entry, e.target.files?.[0] ?? null)}
                                  />
                                </label>
                              </div>
                            </div>
                          )}
                          {entry.keepMultiPerson && (
                            <p className="text-[0.8125rem] text-[#248a3d]">已確認使用這張合照／共同受獎照片。</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          <button
            type="button"
            onClick={addEntry}
            disabled={submitting || entries.length >= 10}
            className="rounded-2xl border border-dashed border-[#b9cec0] bg-white px-4 py-3 text-[0.9375rem] font-semibold text-[#248a3d] disabled:opacity-50"
          >
            + 新增下一位
          </button>

          {error && <p className="rounded-2xl bg-[#fff1f1] px-4 py-3 text-[0.9375rem] text-[#ff375f]">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-2xl bg-[#1d1d1f] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "檢查並送出中…" : "送出表揚名單"}
          </button>
        </form>
      </div>
    </div>
  );
}
