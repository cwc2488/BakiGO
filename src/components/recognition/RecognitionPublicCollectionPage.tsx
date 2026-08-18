"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { fetchRecognitionPublicEvent, submitRecognitionPublicForm } from "@/lib/recognition/recognition-fetch";
import type { RecognitionPublicEvent } from "@/types/recognition";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type PublicEntry = {
  id: string;
  eventAwardId: string;
  submittedName: string;
  photo: File | null;
};

function createEntry(defaultAwardId = ""): PublicEntry {
  return {
    id: crypto.randomUUID(),
    eventAwardId: defaultAwardId,
    submittedName: "",
    photo: null,
  };
}

const INPUT_CLASS =
  "w-full appearance-none rounded-2xl border border-[#d9e2dc] bg-white px-4 py-3 text-[1rem] outline-none focus:border-[#248a3d]";

export function RecognitionPublicCollectionPage({ token }: { token: string }) {
  const [event, setEvent] = useState<RecognitionPublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitterName, setSubmitterName] = useState("");
  const [submitterOrganization, setSubmitterOrganization] = useState("");
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch starts here; state updates happen in promise callbacks
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
    setEntries((prev) => (prev.length === 1 ? prev : prev.filter((entry) => entry.id !== id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.set("submitterName", submitterName);
      formData.set("submitterOrganization", submitterOrganization);

      const entryPayload = entries.map((entry, index) => {
        const fileKey = entry.photo ? `photo_${index}` : null;
        if (entry.photo && fileKey) {
          formData.set(fileKey, entry.photo);
        }
        return {
          submittedName: entry.submittedName,
          eventAwardId: entry.eventAwardId,
          photoFieldKey: fileKey,
        };
      });
      formData.set("entries", JSON.stringify(entryPayload));

      const result = await submitRecognitionPublicForm(token, formData);
      setSuccessMessage(result.message);
      setEntries([createEntry(event.awards[0]?.eventAwardId ?? "")]);
      setSubmitterName("");
      setSubmitterOrganization("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#f7fbf8] px-5 py-10 text-center text-[#6f7d73]">載入中…</div>;
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-[#f7fbf8] px-5 py-10">
        <div className="mx-auto max-w-md rounded-[2rem] border border-[#d9e2dc] bg-white p-6 text-center shadow-[0_12px_40px_rgba(36,138,61,0.08)]">
          <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">表揚收件連結</p>
          <p className="mt-3 text-[0.9375rem] text-[#ff375f]">{error ?? "連結無效"}</p>
        </div>
      </div>
    );
  }

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
        </section>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <section className="rounded-[2rem] border border-[#d9e2dc] bg-white p-5">
            <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">填報者資訊</p>
            <div className="mt-4 flex flex-col gap-3">
              <input
                className={INPUT_CLASS}
                placeholder="你的姓名"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                disabled={submitting}
              />
              <input
                className={INPUT_CLASS}
                placeholder="組織 / 團隊名稱"
                value={submitterOrganization}
                onChange={(e) => setSubmitterOrganization(e.target.value)}
                disabled={submitting}
              />
            </div>
          </section>

          {entries.map((entry, index) => {
            const award = awardMap.get(entry.eventAwardId);
            return (
              <section key={entry.id} className="rounded-[2rem] border border-[#d9e2dc] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">第 {index + 1} 位</p>
                  {entries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      className="text-[0.875rem] font-medium text-[#ff375f]"
                    >
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
                    onChange={(e) => updateEntry(entry.id, { eventAwardId: e.target.value, photo: null })}
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
                      <label className="block text-[0.875rem] font-medium text-[#1d1d1f]">照片</label>
                      <input
                        type="file"
                        accept="image/*,.heic,.heif"
                        className="mt-3 block w-full text-[0.875rem] text-[#6f7d73]"
                        onChange={(e) => updateEntry(entry.id, { photo: e.target.files?.[0] ?? null })}
                        disabled={submitting}
                      />
                      {entry.photo && (
                        <div className="mt-3 flex flex-col gap-2">
                          <Image
                            src={URL.createObjectURL(entry.photo)}
                            alt="預覽"
                            width={640}
                            height={320}
                            unoptimized
                            className="h-40 w-full rounded-2xl object-cover"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => updateEntry(entry.id, { photo: null })}
                              className="rounded-xl border border-[#d9e2dc] px-3 py-1.5 text-[0.8125rem] font-medium text-[#1d1d1f]"
                            >
                              移除照片
                            </button>
                          </div>
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
          {successMessage && <p className="rounded-2xl bg-[#eef8f1] px-4 py-3 text-[0.9375rem] text-[#248a3d]">{successMessage}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-2xl bg-[#1d1d1f] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "送出中…" : "送出表揚名單"}
          </button>
        </form>
      </div>
    </div>
  );
}
