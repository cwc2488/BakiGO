"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  fetchEventAwards,
  fetchRecognitionEvent,
  downloadRecognitionEventPresentation,
  fetchRecognitionEventPptReadiness,
  fetchRecognitionPresentationSummary,
  fetchRecognitionEventToken,
  fetchRecognitionRawSubmissions,
  fetchRecognitionTextRoster,
  reorderEventAwards,
  rotateRecognitionEventToken,
  updateEventAward,
  updateRecognitionEvent,
} from "@/lib/recognition/recognition-fetch";
import type {
  RecognitionEvent,
  RecognitionEventAward,
  RecognitionEventPptReadiness,
  RecognitionEventStatus,
  RecognitionPresentationSummary,
  RecognitionRawSubmissionView,
} from "@/types/recognition";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const STATUS_LABELS: Record<RecognitionEventStatus, string> = {
  draft:      "草稿",
  collecting: "收件中",
  closed:     "已截止",
  archived:   "已封存",
};

const STATUS_TRANSITIONS: Record<RecognitionEventStatus, { label: string; next: RecognitionEventStatus }[]> = {
  draft:      [{ label: "開始收件", next: "collecting" }, { label: "封存", next: "archived" }],
  collecting: [{ label: "截止收件", next: "closed" }, { label: "封存", next: "archived" }],
  closed:     [{ label: "重新開放收件", next: "collecting" }, { label: "封存", next: "archived" }],
  archived:   [],
};

const INPUT_CLASS =
  "w-full appearance-none rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]";

const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"] as const;

function toLocalDatetimeString(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventInfoSection({
  event,
  onUpdated,
}: {
  event: RecognitionEvent;
  onUpdated: (e: RecognitionEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(event.name);
  const [collectStartsAt, setCollectStartsAt] = useState(toLocalDatetimeString(event.collectStartsAt));
  const [collectEndsAt, setCollectEndsAt] = useState(toLocalDatetimeString(event.collectEndsAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateRecognitionEvent(event.id, {
        name,
        collectStartsAt: collectStartsAt ? new Date(collectStartsAt).toISOString() : null,
        collectEndsAt: collectEndsAt ? new Date(collectEndsAt).toISOString() : null,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(next: RecognitionEventStatus) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateRecognitionEvent(event.id, { status: next });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "狀態變更失敗");
    } finally {
      setSaving(false);
    }
  }

  const month = MONTH_LABELS[(event.month - 1)] ?? `${event.month}月`;

  return (
    <BrandCard variant="bordered">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] text-[#86868b]">{event.year} / {month}</p>
          <h2 className="mt-0.5 text-[1.125rem] font-semibold text-[#1d1d1f]">{event.name}</h2>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">
            狀態：<strong>{STATUS_LABELS[event.status]}</strong>
          </p>
          {(event.collectStartsAt || event.collectEndsAt) && (
            <p className="mt-1 text-[0.8125rem] text-[#86868b]">
              {event.collectStartsAt && `收件開始：${new Date(event.collectStartsAt).toLocaleString("zh-TW")}`}
              {event.collectStartsAt && event.collectEndsAt && <br />}
              {event.collectEndsAt && `截止：${new Date(event.collectEndsAt).toLocaleString("zh-TW")}`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="shrink-0 rounded-xl border border-[var(--brand-border)] px-3 py-1.5 text-[0.875rem] font-medium text-[#1d1d1f] transition-transform active:scale-[0.98]"
        >
          {editing ? "取消" : "編輯"}
        </button>
      </div>

      {editing && (
        <div className="mt-4 flex flex-col gap-3 border-t border-[var(--brand-border)] pt-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.875rem] font-medium text-[#1d1d1f]">活動名稱</label>
            <input type="text" className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.875rem] font-medium text-[#1d1d1f]">開始收件</label>
            <input type="datetime-local" className={INPUT_CLASS} value={collectStartsAt} onChange={(e) => setCollectStartsAt(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.875rem] font-medium text-[#1d1d1f]">截止收件</label>
            <input type="datetime-local" className={INPUT_CLASS} value={collectEndsAt} onChange={(e) => setCollectEndsAt(e.target.value)} disabled={saving} />
          </div>
          {error && <p className="text-[0.875rem] text-[#ff375f]">{error}</p>}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-2xl bg-[#1d1d1f] px-4 py-3 text-[0.9375rem] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      )}

      {/* Status transitions */}
      {STATUS_TRANSITIONS[event.status].length > 0 && !editing && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--brand-border)] pt-3">
          {STATUS_TRANSITIONS[event.status].map(({ label, next }) => (
            <button
              key={next}
              type="button"
              disabled={saving}
              onClick={() => void handleStatusChange(next)}
              className="rounded-xl border border-[var(--brand-border)] px-3 py-1.5 text-[0.875rem] font-medium text-[#1d1d1f] transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!editing && error && (
        <p className="mt-2 text-[0.875rem] text-[#ff375f]">{error}</p>
      )}
    </BrandCard>
  );
}

function AwardRow({
  award,
  onToggle,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  award: RecognitionEventAward;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
        award.isEnabled
          ? "border-[var(--brand-border)] bg-[var(--brand-surface)]"
          : "border-[var(--brand-border)] bg-[#f5f5f7] opacity-60"
      }`}
    >
      {/* Sort controls */}
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[0.75rem] text-[#636366] transition-colors hover:bg-[var(--brand-border)] disabled:opacity-30"
          aria-label="上移"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[0.75rem] text-[#636366] transition-colors hover:bg-[var(--brand-border)] disabled:opacity-30"
          aria-label="下移"
        >
          ▼
        </button>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[0.9375rem] font-medium text-[#1d1d1f] truncate">{award.awardName}</p>
        {award.requiresPhoto && (
          <p className="text-[0.75rem] text-[#86868b]">需要照片</p>
        )}
      </div>

      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={`shrink-0 rounded-xl px-3 py-1.5 text-[0.8125rem] font-semibold transition-transform active:scale-[0.98] ${
          award.isEnabled
            ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
            : "bg-[#f2f2f7] text-[#636366]"
        }`}
      >
        {award.isEnabled ? "啟用中" : "已停用"}
      </button>
    </div>
  );
}

function AwardSection({
  eventId,
}: {
  eventId: string;
}) {
  const [awards, setAwards] = useState<RecognitionEventAward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAwards = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchEventAwards(eventId)
      .then((data) => { setAwards(data); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "無法載入表揚項目"); })
      .finally(() => { setLoading(false); });
  }, [eventId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch starts here; state updates happen in promise callbacks
  useEffect(() => {
    loadAwards();
  }, [loadAwards]);

  async function handleToggle(award: RecognitionEventAward) {
    setSaving(true);
    try {
      const updated = await updateEventAward(eventId, award.id, { isEnabled: !award.isEnabled });
      setAwards((prev) => prev.map((a) => (a.id === award.id ? updated : a)));
    } catch {
      // no-op; keep state unchanged
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const newAwards = [...awards];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newAwards.length) return;
    [newAwards[index], newAwards[targetIndex]] = [newAwards[targetIndex]!, newAwards[index]!];
    setAwards(newAwards);

    setSaving(true);
    try {
      await reorderEventAwards(eventId, newAwards.map((a) => a.id));
    } catch {
      // revert on failure
      void loadAwards();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          表揚項目 ({awards.filter((a) => a.isEnabled).length} / {awards.length} 啟用)
        </h3>
        {saving && <p className="text-[0.8125rem] text-[#86868b]">儲存中…</p>}
      </div>

      {loading && <p className="text-[0.9375rem] text-[#86868b]">載入中…</p>}

      {!loading && error && (
        <p className="text-[0.9375rem] text-[#ff375f]">{error}</p>
      )}

      {!loading && !error && awards.map((award, index) => (
        <AwardRow
          key={award.id}
          award={award}
          isFirst={index === 0}
          isLast={index === awards.length - 1}
          onToggle={() => void handleToggle(award)}
          onMoveUp={() => void handleMove(index, "up")}
          onMoveDown={() => void handleMove(index, "down")}
        />
      ))}
    </div>
  );
}

export function RecognitionEventPage({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<RecognitionEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch starts here; state updates happen in promise callbacks
  useEffect(() => {
    setLoading(true);
    fetchRecognitionEvent(eventId)
      .then(setEvent)
      .catch((err) => setError(err instanceof Error ? err.message : "無法載入活動"))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <PageShell title="表揚活動" backHref="/recognition" backLabel="返回表揚中心">
        <p className="text-[0.9375rem] text-[#86868b]">載入中…</p>
      </PageShell>
    );
  }

  if (error || !event) {
    return (
      <PageShell title="表揚活動" backHref="/recognition" backLabel="返回表揚中心">
        <p className="text-[0.9375rem] text-[#ff375f]">{error ?? "活動不存在"}</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={event.name}
      subtitle={`${event.year} 年 ${event.month} 月`}
      backHref="/recognition"
      backLabel="返回表揚中心"
    >
      <EventInfoSection event={event} onUpdated={setEvent} />
      <PublicCollectionSection eventId={event.id} />
      <AwardSection eventId={event.id} />
      <ReviewAndRosterSection eventId={event.id} eventName={event.name} />
      <PhotoReviewAndPptSection eventId={event.id} />
      <RawSubmissionsSection eventId={event.id} />
    </PageShell>
  );
}

function PublicCollectionSection({ eventId }: { eventId: string }) {
  const [tokenInfo, setTokenInfo] = useState<{ token: string | null; url: string | null; rotatedAt: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadToken = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRecognitionEventToken(eventId)
      .then(setTokenInfo)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "無法載入公開連結"))
      .finally(() => setLoading(false));
  }, [eventId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch starts here; state updates happen in promise callbacks
  useEffect(() => {
    loadToken();
  }, [loadToken]);

  async function handleRotate() {
    setSaving(true);
    setError(null);
    try {
      const next = await rotateRecognitionEventToken(eventId);
      setTokenInfo(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法更新公開連結");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!tokenInfo?.url) return;
    await navigator.clipboard.writeText(tokenInfo.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <BrandCard variant="bordered">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">公開收件連結</p>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">Recognition Admin 可分享這個連結給各組織提交表揚名單。</p>
        </div>
        <button
          type="button"
          onClick={() => void handleRotate()}
          disabled={saving}
          className="rounded-xl border border-[var(--brand-border)] px-3 py-1.5 text-[0.875rem] font-medium text-[#1d1d1f] disabled:opacity-60"
        >
          {tokenInfo?.token ? "旋轉 token" : "產生 token"}
        </button>
      </div>

      {loading && <p className="mt-3 text-[0.875rem] text-[#86868b]">載入中…</p>}
      {!loading && tokenInfo?.url && (
        <div className="mt-3 rounded-2xl bg-[#f5f5f7] p-4">
          <p className="text-[0.875rem] break-all text-[#1d1d1f]">{tokenInfo.url}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded-xl bg-[#1d1d1f] px-3 py-2 text-[0.875rem] font-semibold text-white"
            >
              {copied ? "已複製" : "複製連結"}
            </button>
            {tokenInfo.rotatedAt && (
              <p className="text-[0.75rem] text-[#86868b]">
                最後更新：{new Date(tokenInfo.rotatedAt).toLocaleString("zh-TW")}
              </p>
            )}
          </div>
        </div>
      )}
      {!loading && !tokenInfo?.url && (
        <p className="mt-3 text-[0.875rem] text-[#86868b]">尚未建立公開收件連結。</p>
      )}
      {error && <p className="mt-2 text-[0.875rem] text-[#ff375f]">{error}</p>}
    </BrandCard>
  );
}

function RawSubmissionsSection({ eventId }: { eventId: string }) {
  const [data, setData] = useState<{ totalSubmissions: number; totalEntries: number; submissions: RecognitionRawSubmissionView[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRecognitionRawSubmissions(eventId)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "無法載入原始 submissions"))
      .finally(() => setLoading(false));
  }, [eventId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch starts here; state updates happen in promise callbacks
  useEffect(() => {
    load();
  }, [load]);

  return (
    <BrandCard variant="bordered">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">原始 submissions</p>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">只讀 evidence。審核與正式名單請使用審核中心。</p>
        </div>
        {data && (
          <p className="text-[0.8125rem] text-[#86868b]">
            {data.totalSubmissions} submissions / {data.totalEntries} entries
          </p>
        )}
      </div>

      {loading && <p className="mt-3 text-[0.875rem] text-[#86868b]">載入中…</p>}
      {error && <p className="mt-3 text-[0.875rem] text-[#ff375f]">{error}</p>}
      {!loading && !error && data && data.submissions.length === 0 && (
        <p className="mt-3 text-[0.875rem] text-[#86868b]">尚無 public submissions。</p>
      )}
      {!loading && !error && data && data.submissions.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {data.submissions.map(({ submission, entries }) => (
            <div key={submission.id} className="rounded-2xl bg-[#f5f5f7] p-4">
              <div className="flex flex-col gap-1">
                <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{submission.submitterName}</p>
                <p className="text-[0.8125rem] text-[#86868b]">{submission.submitterOrganization}</p>
                <p className="text-[0.75rem] text-[#86868b]">{new Date(submission.submittedAt).toLocaleString("zh-TW")}</p>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {entries.map((entry) => (
                  <div key={entry.id} className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[0.875rem] font-medium text-[#1d1d1f]">{entry.submittedName}</p>
                    <p className="text-[0.75rem] text-[#86868b]">{entry.awardName}</p>
                    <p className="text-[0.75rem] text-[#86868b]">
                      {entry.hasOriginalPhoto ? "有原圖" : "無原圖"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </BrandCard>
  );
}

function ReviewAndRosterSection({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRecognitionTextRoster(eventId)
      .then((result) => setText(result.text))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "無法載入文字版名單"))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCopy() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <BrandCard variant="bordered">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">審核與歷史名單</p>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">
            正式名單只含已核准候選人。
          </p>
        </div>
        <Link
          href={`/recognition/events/${eventId}/review`}
          className="rounded-xl bg-[#1d1d1f] px-3 py-2 text-[0.875rem] font-semibold text-white"
        >
          打開審核中心
        </Link>
      </div>
      {loading && <p className="mt-3 text-[0.875rem] text-[#86868b]">載入文字版…</p>}
      {error && <p className="mt-3 text-[0.875rem] text-[#ff375f]">{error}</p>}
      {!loading && !error && (
        <div className="mt-3">
          <pre className="whitespace-pre-wrap rounded-2xl bg-[#f5f5f7] p-4 text-[0.875rem] text-[#1d1d1f]">
            {text.trim() ? text : `${eventName}\n\n尚無已核准名單`}
          </pre>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!text.trim()}
            className="mt-3 rounded-xl border border-[var(--brand-border)] px-3 py-2 text-[0.875rem] font-medium text-[#1d1d1f] disabled:opacity-40"
          >
            {copied ? "已複製" : "複製文字版"}
          </button>
        </div>
      )}
    </BrandCard>
  );
}

function PhotoReviewAndPptSection({ eventId }: { eventId: string }) {
  const [readiness, setReadiness] = useState<RecognitionEventPptReadiness | null>(null);
  const [summary, setSummary] = useState<RecognitionPresentationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchRecognitionEventPptReadiness(eventId),
      fetchRecognitionPresentationSummary(eventId),
    ])
      .then(([nextReadiness, nextSummary]) => {
        setReadiness(nextReadiness);
        setSummary(nextSummary);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "無法載入 PPT 準備狀態"))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = readiness?.totalBlockingIssues ?? summary?.blockers.length ?? 0;
  const canGenerate = Boolean(summary?.ready) && pending === 0 && !generating;

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      await downloadRecognitionEventPresentation(eventId);
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : "無法產生簡報");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <BrandCard variant="bordered">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">照片審查與表揚 PPT</p>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">
            審查正式照片並建立簡報裁切。原圖不會被覆蓋。
          </p>
        </div>
        <Link
          href={`/recognition/events/${eventId}/photos`}
          className="rounded-xl bg-[#1d1d1f] px-3 py-2 text-[0.875rem] font-semibold text-white"
        >
          照片審查{pending > 0 ? ` ${pending} 待處理` : ""}
        </Link>
      </div>

      <div className="mt-4 rounded-2xl bg-[#f5f5f7] p-4">
        <p className="text-[0.8125rem] font-semibold text-[#1d1d1f]">PPT 準備狀態</p>
        {loading && <p className="mt-2 text-[0.875rem] text-[#86868b]">載入中…</p>}
        {error && <p className="mt-2 text-[0.875rem] text-[#ff375f]">{error}</p>}
        {readiness && (
          <div className="mt-2 space-y-1 text-[0.875rem] text-[#1d1d1f]">
            <p>已核准：{readiness.totalApproved}</p>
            <p>需要照片：{readiness.photoRequiredApproved}</p>
            <p>照片已完成：{readiness.readyPhotos}</p>
            <p>缺少原圖：{readiness.missingOriginalPhotos}</p>
            <p>尚未選照片：{readiness.missingPreferredPhoto}</p>
            <p>尚未裁切：{readiness.missingCrop}</p>
            <p>照片有問題：{readiness.blockedPhotos}</p>
            {summary && (
              <>
                <p>表揚獎項頁：{summary.awardSectionCount}</p>
                <p>已核准受獎人：{summary.approvedRecipientCount}</p>
                <p>預估投影片：{summary.expectedSlideCount}</p>
              </>
            )}
            <p className="pt-1 font-medium">
              {pending > 0
                ? `尚有 ${pending} 個問題需要處理`
                : summary && summary.expectedSlideCount === 0
                  ? "尚無已核准名單"
                  : "照片準備完成"}
            </p>
          </div>
        )}
      </div>

      {pending > 0 && (
        <p className="mt-3 text-[0.875rem] text-[#ff375f]">
          仍有照片問題，請先到照片審查處理後再產生簡報。
        </p>
      )}
      {generateError && (
        <p className="mt-3 whitespace-pre-wrap text-[0.875rem] text-[#ff375f]">{generateError}</p>
      )}

      <button
        type="button"
        disabled={!canGenerate}
        onClick={() => void handleGenerate()}
        className="mt-3 rounded-xl bg-[#1d1d1f] px-3 py-2 text-[0.875rem] font-semibold text-white disabled:bg-transparent disabled:border disabled:border-[var(--brand-border)] disabled:font-medium disabled:text-[#86868b]"
      >
        {generating ? "產生中…" : pending > 0 ? "尚有照片問題，無法產生 PPT" : "產生表揚 PPT"}
      </button>
    </BrandCard>
  );
}
