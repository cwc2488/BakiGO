"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { fetchRecognitionPublicEvent, submitRecognitionPublicForm } from "@/lib/recognition/recognition-fetch";
import { defaultRecognitionCoverCrop } from "@/lib/recognition/recognition-photo-review";
import type { RecognitionNormalizedCrop, RecognitionPublicEvent } from "@/types/recognition";
import { useEffect, useMemo, useRef, useState } from "react";

type PublicEntry = {
  id: string;
  serverEntryId?: string;
  eventAwardId: string;
  submittedName: string;
  photo: File | null;
  previewUrl: string | null;
  crop: RecognitionNormalizedCrop | null;
  originalWidth: number | null;
  originalHeight: number | null;
  keepMultiPerson: boolean;
};

type IssueCode =
  | "multi_person"
  | "no_person"
  | "uncertain_person"
  | "low_resolution"
  | "missing_name"
  | "missing_photo"
  | "other";

type ReviewIssue = {
  entryId: string;
  name: string;
  awardName: string;
  codes: IssueCode[];
  messages: string[];
};

type PageView = "loading" | "already_submitted" | "form" | "review" | "success";

type ExistingSubmissionSummary = {
  submissionId: string;
  submitterName: string;
  entries: Array<{
    entryId: string;
    submittedName: string;
    eventAwardId: string;
    hasPhoto: boolean;
    photoPreviewUrl: string | null;
    confirmedCrop: RecognitionNormalizedCrop | null;
    originalWidth: number | null;
    originalHeight: number | null;
    confirmedWarnings: string[];
  }>;
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

function classifyIssueMessage(message: string, code?: string): IssueCode {
  if (code === "multi_person" || message.includes("多位人物")) return "multi_person";
  if (code === "no_person" || message.includes("看不到清楚的受表揚者")) return "no_person";
  if (code === "uncertain_person" || message.includes("無法清楚辨識受表揚者")) return "uncertain_person";
  if (
    code === "low_resolution"
    || message.includes("模糊")
    || message.includes("畫質")
    || message.includes("解析度")
  ) {
    return "low_resolution";
  }
  if (code === "missing_name" || message.includes("姓名")) return "missing_name";
  if (code === "missing_photo" || message.includes("照片")) return "missing_photo";
  return "other";
}

function plainIssueTitle(code: IssueCode): string {
  if (code === "multi_person") return "照片中可能有多位人物";
  if (code === "no_person") return "這張照片看不到清楚的受表揚者";
  if (code === "uncertain_person") return "這張照片無法清楚辨識受表揚者";
  if (code === "low_resolution") return "照片畫質不足";
  if (code === "missing_name") return "尚未填寫姓名";
  if (code === "missing_photo") return "尚未上傳照片";
  return "需要修正";
}

function plainIssueHint(code: IssueCode, fallback: string): string {
  if (code === "no_person") return "請重新上傳一張可以清楚看到人物的照片。";
  if (code === "uncertain_person") return "請重新上傳一張人物較清楚的照片。";
  if (code === "low_resolution") return "請重新上傳較清楚的照片。";
  if (code === "multi_person") {
    return "如果照片中的人物都是本次一起受表揚者，可以繼續使用。";
  }
  return fallback;
}

const INPUT_CLASS =
  "w-full appearance-none rounded-2xl border border-[#d9e2dc] bg-white px-4 py-3 text-[1rem] outline-none focus:border-[#248a3d]";

const EDIT_KEY = (token: string) => `recognition-edit:${token}`;

function PhotoUploadButton({
  hasPhoto,
  disabled,
  onFile,
}: {
  hasPhoto: boolean;
  disabled?: boolean;
  onFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[0.9375rem] font-semibold text-white disabled:opacity-60"
      >
        {hasPhoto ? "🔄 更換照片" : "📷 上傳照片"}
      </button>
    </>
  );
}

function PhotoPreview({
  previewUrl,
  crop,
}: {
  previewUrl: string;
  crop: RecognitionNormalizedCrop | null;
}) {
  const objectPosition = crop
    ? `${((crop.x + crop.width / 2) * 100)}% ${((crop.y + crop.height / 2) * 100)}%`
    : "50% 50%";
  return (
    <div className="overflow-hidden rounded-2xl bg-[#111]" style={{ aspectRatio: "3 / 4" }}>
      {/* Authorized blob/signed URL; next/image cannot take arbitrary object URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt=""
        className="h-full w-full object-cover"
        style={{ objectPosition }}
      />
    </div>
  );
}

export function RecognitionPublicCollectionPage({ token }: { token: string }) {
  const [event, setEvent] = useState<RecognitionPublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitterName, setSubmitterName] = useState("");
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [view, setView] = useState<PageView>("loading");
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [existingSummary, setExistingSummary] = useState<ExistingSubmissionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await fetchRecognitionPublicEvent(token);
        if (cancelled) return;
        setEvent(data);
        setEntries([createEntry(data.awards[0]?.eventAwardId ?? "")]);

        let storedEditToken: string | null = null;
        try {
          const raw = window.localStorage.getItem(EDIT_KEY(token));
          if (raw) {
            const parsed = JSON.parse(raw) as { editToken?: string };
            if (parsed.editToken) storedEditToken = parsed.editToken;
          }
        } catch {
          // ignore bad local cache
        }

        if (!storedEditToken) {
          setEditToken(null);
          setExistingSummary(null);
          setView("form");
          return;
        }

        setEditToken(storedEditToken);
        const res = await fetch(
          `/api/recognition/public/${encodeURIComponent(token)}/submissions/current?editToken=${encodeURIComponent(storedEditToken)}`,
        );
        if (cancelled) return;

        if (res.ok) {
          const json = await res.json() as ExistingSubmissionSummary & { ok?: boolean };
          setExistingSummary({
            submissionId: json.submissionId,
            submitterName: json.submitterName,
            entries: json.entries,
          });
          setView("already_submitted");
          return;
        }

        if (res.status === 404) {
          try {
            window.localStorage.removeItem(EDIT_KEY(token));
          } catch {
            // ignore
          }
          setEditToken(null);
          setExistingSummary(null);
          setView("form");
          return;
        }

        // Deadline / closed / other: no edit entry — stay on new form if event still loaded.
        setExistingSummary(null);
        setView("form");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "無法載入連結");
          setView("form");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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

  function beginEditExisting() {
    if (!existingSummary || !event) return;
    setSubmitterName(existingSummary.submitterName);
    setEntries(existingSummary.entries.map((item) => ({
      id: crypto.randomUUID(),
      serverEntryId: item.entryId,
      eventAwardId: item.eventAwardId || event.awards[0]?.eventAwardId || "",
      submittedName: item.submittedName,
      photo: null,
      previewUrl: item.photoPreviewUrl,
      crop: item.confirmedCrop,
      originalWidth: item.originalWidth,
      originalHeight: item.originalHeight,
      keepMultiPerson: (item.confirmedWarnings ?? []).includes("multi_person"),
    })));
    setError(null);
    setView("form");
  }

  async function onPhotoSelected(entry: PublicEntry, file: File | null) {
    if (entry.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(entry.previewUrl);
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

  function confirmedWarningsFor(entry: PublicEntry): string[] {
    const warnings: string[] = [];
    if (entry.keepMultiPerson) warnings.push("multi_person");
    return warnings;
  }

  function applyServerResult(input: {
    complete: boolean;
    readyCount: number;
    blockedCount: number;
    total: number;
    message: string;
    issues: ReviewIssue[];
  }) {
    setReadyCount(input.readyCount);
    setReviewIssues(input.issues);
    if (input.complete) {
      setView("success");
      setError(null);
      window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 50);
      return;
    }
    setView("review");
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  }

  async function patchEntry(entry: PublicEntry, edit: string) {
    const entryId = entry.serverEntryId!;
    if (entry.photo) {
      const formData = new FormData();
      formData.set("editToken", edit);
      formData.set("entryId", entryId);
      formData.set("photo", entry.photo);
      if (entry.crop) formData.set("crop", JSON.stringify(entry.crop));
      formData.set("confirmedWarnings", confirmedWarningsFor(entry).join(","));
      const res = await fetch(`/api/recognition/public/${encodeURIComponent(token)}/submissions/current`, {
        method: "PATCH",
        body: formData,
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "修正失敗");
    }
    const res = await fetch(`/api/recognition/public/${encodeURIComponent(token)}/submissions/current`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editToken: edit,
        entryId,
        submittedName: entry.submittedName,
        eventAwardId: entry.eventAwardId,
        crop: entry.crop,
        originalWidth: entry.originalWidth,
        originalHeight: entry.originalHeight,
        confirmedWarnings: confirmedWarningsFor(entry),
      }),
    });
    const json = await res.json() as {
      error?: string;
      status?: string;
      issues?: Array<{ code?: string; message: string }>;
      pptReady?: boolean;
      submissionComplete?: boolean;
    };
    if (!res.ok) throw new Error(json.error ?? "修正失敗");
    return json;
  }

  async function handleCheckAndSubmit() {
    if (!event) return;
    setSubmitting(true);
    setError(null);

    try {
      if (editToken && entries.every((entry) => entry.serverEntryId)) {
        const issueRows: ReviewIssue[] = [];
        let needsFix = 0;
        let ready = 0;
        for (const entry of entries) {
          const json = await patchEntry(entry, editToken);
          const incomplete = json.submissionComplete === false
            || json.status === "BLOCKED"
            || (json.pptReady === false && json.status !== "EXCLUDED");
          if (incomplete) {
            needsFix += 1;
            const messages = (json.issues ?? []).map((issue) => issue.message);
            issueRows.push({
              entryId: entry.id,
              name: entry.submittedName,
              awardName: awardMap.get(entry.eventAwardId)?.name ?? "",
              codes: (json.issues ?? []).map((issue) => classifyIssueMessage(issue.message, issue.code)),
              messages,
            });
          } else if (json.status !== "EXCLUDED") {
            ready += 1;
          }
        }
        applyServerResult({
          complete: needsFix === 0,
          readyCount: ready,
          blockedCount: needsFix,
          total: entries.length,
          message: needsFix === 0 ? "✅ 投稿完成" : `還有 ${needsFix} 項需要修改`,
          issues: issueRows,
        });
        return;
      }

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
          confirmedWarnings: confirmedWarningsFor(entry),
        };
      });
      formData.set("entries", JSON.stringify(entryPayload));

      const result = await submitRecognitionPublicForm(token, formData);
      if (result.editToken) {
        setEditToken(result.editToken);
        window.localStorage.setItem(EDIT_KEY(token), JSON.stringify({
          submissionId: result.submissionId,
          editToken: result.editToken,
        }));
      }
      if (result.entries?.length) {
        setEntries((prev) => prev.map((entry, index) => ({
          ...entry,
          serverEntryId: result.entries?.[index]?.entryId ?? entry.serverEntryId,
          // Clear local File after successful upload so later fixes only send when replaced.
          photo: null,
        })));
        setExistingSummary({
          submissionId: result.submissionId,
          submitterName,
          entries: (result.entries ?? []).map((item, index) => ({
            entryId: item.entryId,
            submittedName: item.submittedName,
            eventAwardId: entries[index]?.eventAwardId ?? "",
            hasPhoto: Boolean(entries[index]?.previewUrl),
            photoPreviewUrl: entries[index]?.previewUrl ?? null,
            confirmedCrop: entries[index]?.crop ?? null,
            originalWidth: entries[index]?.originalWidth ?? null,
            originalHeight: entries[index]?.originalHeight ?? null,
            confirmedWarnings: confirmedWarningsFor(entries[index] ?? createEntry()),
          })),
        });
      }

      const issueRows: ReviewIssue[] = (result.entries ?? [])
        .filter((item) => item.status === "BLOCKED" || item.pptReady === false)
        .map((item) => {
          const local = entries.find((entry) => entry.serverEntryId === item.entryId)
            ?? entries.find((entry, index) => result.entries?.[index]?.entryId === item.entryId);
          return {
            entryId: local?.id ?? item.entryId,
            name: item.submittedName,
            awardName: item.awardName,
            codes: item.issues.map((issue) => classifyIssueMessage(issue.message, issue.code)),
            messages: item.issues.map((issue) => issue.message),
          };
        });

      applyServerResult({
        complete: Boolean(result.completion?.complete),
        readyCount: result.completion?.readyCount ?? 0,
        blockedCount: result.completion?.blockedCount ?? issueRows.length,
        total: result.completion?.total ?? entries.length,
        message: result.message,
        issues: issueRows,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
      setView("form");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmMultiPerson(entryId: string) {
    updateEntry(entryId, { keepMultiPerson: true });
  }

  async function handleRecheck() {
    await handleCheckAndSubmit();
  }

  if (loading || view === "loading") {
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

  if (view === "already_submitted" && existingSummary) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f4fbf6_0%,#f7fbf8_45%,#eef8f1_100%)] px-4 py-8">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <section className="rounded-[2rem] border border-[#b9e4c4] bg-[#eef8f1] p-6 shadow-[0_12px_40px_rgba(36,138,61,0.08)]">
            <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#77a183]">{event.name}</p>
            <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight text-[#1d1d1f]">你已經完成投稿</h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#6f7d73]">
              截止前仍可以修改內容。
            </p>
            <button
              type="button"
              onClick={beginEditExisting}
              className="mt-6 w-full rounded-2xl bg-[#1d1d1f] px-4 py-4 text-[1rem] font-semibold text-white"
            >
              ✏️ 修改上一篇投稿
            </button>
          </section>
        </div>
      </div>
    );
  }

  if (view === "success") {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f4fbf6_0%,#f7fbf8_45%,#eef8f1_100%)] px-4 py-8">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <section className="rounded-[2rem] border border-[#b9e4c4] bg-[#eef8f1] p-6 shadow-[0_12px_40px_rgba(36,138,61,0.08)]">
            <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#77a183]">{event.name}</p>
            <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight text-[#1d1d1f]">✅ 投稿完成</h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#6f7d73]">
              你的表揚資料已送出，可以關閉此頁面。
            </p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#6f7d73]">
              截止前若需要修改，請再次開啟同一投稿連結。
            </p>
          </section>
        </div>
      </div>
    );
  }

  if (view === "review") {
    const okCount = Math.max(0, entries.length - reviewIssues.length);
    const photoFixCount = reviewIssues.filter((item) => (
      item.codes.includes("multi_person")
      || item.codes.includes("no_person")
      || item.codes.includes("uncertain_person")
      || item.codes.includes("low_resolution")
    )).length;
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f4fbf6_0%,#f7fbf8_45%,#eef8f1_100%)] px-4 py-8">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <section className="rounded-[2rem] border border-[#ffd60a] bg-[#fff8e5] p-5">
            <h1 className="text-[1.375rem] font-semibold text-[#1d1d1f]">
              還有 {reviewIssues.length} {photoFixCount > 0 ? "張照片／項目" : "項"}需要修改
            </h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#6f7d73]">
              其他資料都沒問題，修改完成後即可投稿。
            </p>
          </section>

          {reviewIssues.map((issue) => {
            const entry = entries.find((item) => item.id === issue.entryId);
            const primaryCode = issue.codes[0] ?? "other";
            const canConfirmMulti = issue.codes.includes("multi_person")
              && !issue.codes.includes("no_person")
              && !issue.codes.includes("uncertain_person")
              && !issue.codes.includes("low_resolution");
            return (
              <section key={issue.entryId} className="rounded-[2rem] border border-[#d9e2dc] bg-white p-5">
                <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">{issue.name || "未填姓名"}</h2>
                <p className="mt-1 text-[0.8125rem] text-[#6f7d73]">{issue.awardName}</p>
                <p className="mt-3 text-[0.9375rem] font-semibold text-[#1d1d1f]">
                  ⚠️ {plainIssueTitle(primaryCode)}
                </p>
                <p className="mt-2 text-[0.875rem] leading-relaxed text-[#6f7d73]">
                  {plainIssueHint(primaryCode, issue.messages[0] ?? "請修正後再送出。")}
                </p>

                {entry?.previewUrl ? (
                  <div className="mt-4 max-w-[12rem]">
                    <PhotoPreview previewUrl={entry.previewUrl} crop={entry.crop} />
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-2">
                  {canConfirmMulti && (
                    <button
                      type="button"
                      disabled={submitting}
                      className="w-full rounded-2xl bg-[#248a3d] px-4 py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-60"
                      onClick={() => handleConfirmMultiPerson(issue.entryId)}
                    >
                      ✓ 確認照片沒問題
                    </button>
                  )}
                  {entry && (
                    <PhotoUploadButton
                      hasPhoto={Boolean(entry.previewUrl)}
                      disabled={submitting}
                      onFile={(file) => void onPhotoSelected(entry, file)}
                    />
                  )}
                  {issue.codes.includes("missing_name") && entry && (
                    <input
                      className={INPUT_CLASS}
                      placeholder="受表揚者姓名"
                      value={entry.submittedName}
                      onChange={(e) => updateEntry(entry.id, { submittedName: e.target.value })}
                      disabled={submitting}
                    />
                  )}
                </div>
              </section>
            );
          })}

          {okCount > 0 && (
            <p className="rounded-2xl bg-[#eef8f1] px-4 py-3 text-[0.9375rem] font-medium text-[#248a3d]">
              ✅ 其他 {okCount} 位資料皆已通過檢查
            </p>
          )}

          {error && <p className="rounded-2xl bg-[#fff1f1] px-4 py-3 text-[0.9375rem] text-[#ff375f]">{error}</p>}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleRecheck()}
            className="rounded-2xl bg-[#1d1d1f] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "重新檢查中…" : "重新檢查並送出"}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setView("form")}
            className="rounded-2xl px-4 py-3 text-[0.9375rem] font-medium text-[#6f7d73]"
          >
            返回修改全部資料
          </button>
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
          <p className="mt-3 text-[0.875rem] leading-relaxed text-[#6f7d73]">
            請先填完所有資料與照片，再按「檢查並送出」。系統會一次檢查整份投稿。
          </p>
        </section>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCheckAndSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <section className="rounded-[2rem] border border-[#d9e2dc] bg-white p-5">
            <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">填報者</p>
            <div className="mt-4">
              <input
                className={INPUT_CLASS}
                placeholder="你的姓名"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
          </section>

          {entries.map((entry, index) => {
            const award = awardMap.get(entry.eventAwardId);
            return (
              <section key={entry.id} className="rounded-[2rem] border border-[#d9e2dc] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">第 {index + 1} 位</p>
                  {entries.length > 1 && !entry.serverEntryId && (
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
                    required
                  />
                  <select
                    className={INPUT_CLASS}
                    value={entry.eventAwardId}
                    onChange={(e) => updateEntry(entry.id, {
                      eventAwardId: e.target.value,
                      photo: null,
                      previewUrl: null,
                      crop: null,
                      keepMultiPerson: false,
                    })}
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
                      <p className="text-[0.875rem] font-medium text-[#1d1d1f]">受表揚者照片</p>
                      <div className="mt-3">
                        <PhotoUploadButton
                          hasPhoto={Boolean(entry.previewUrl)}
                          disabled={submitting}
                          onFile={(file) => void onPhotoSelected(entry, file)}
                        />
                      </div>
                      {entry.previewUrl && (
                        <div className="mt-3">
                          <PhotoPreview previewUrl={entry.previewUrl} crop={entry.crop} />
                          <p className="mt-2 text-[0.75rem] text-[#6f7d73]">預覽僅供確認人物，系統會自動整理進簡報。</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {!entries.some((entry) => entry.serverEntryId) && (
            <button
              type="button"
              onClick={addEntry}
              disabled={submitting || entries.length >= 10}
              className="rounded-2xl border border-dashed border-[#b9cec0] bg-white px-4 py-3 text-[0.9375rem] font-semibold text-[#248a3d] disabled:opacity-50"
            >
              + 新增下一位
            </button>
          )}

          {error && <p className="rounded-2xl bg-[#fff1f1] px-4 py-3 text-[0.9375rem] text-[#ff375f]">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-2xl bg-[#1d1d1f] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "檢查並送出中…" : "檢查並送出"}
          </button>
          {readyCount > 0 && view === "form" ? (
            <p className="text-center text-[0.8125rem] text-[#6f7d73]">先前已通過 {readyCount} 位</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
