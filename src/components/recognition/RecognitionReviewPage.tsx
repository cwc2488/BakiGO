"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  fetchEventAwards,
  fetchRecognitionCandidatePhotoObjectUrl,
  fetchRecognitionCandidates,
  reorderRecognitionCandidates,
  syncRecognitionCandidates,
  updateRecognitionCandidate,
} from "@/lib/recognition/recognition-fetch";
import { candidateMatchesRecognitionFilters } from "@/lib/recognition/recognition-candidates";
import type {
  RecognitionCandidate,
  RecognitionEventAward,
  RecognitionReviewStatus,
} from "@/types/recognition";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_LABELS: Record<RecognitionReviewStatus, string> = {
  pending: "待審核",
  approved: "已核准",
  needs_fix: "需修正",
  rejected: "已拒絕",
};

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待審核" },
  { id: "approved", label: "已核准" },
  { id: "needs_fix", label: "需修正" },
  { id: "rejected", label: "已拒絕" },
  { id: "photo-required", label: "需照片" },
  { id: "warnings", label: "有警示" },
] as const;

const INPUT_CLASS =
  "w-full appearance-none rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--brand-primary)]";

function EvidencePhoto({
  eventId,
  candidateId,
  sourceEntryId,
}: {
  eventId: string;
  candidateId: string;
  sourceEntryId: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchRecognitionCandidatePhotoObjectUrl(eventId, candidateId, sourceEntryId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [eventId, candidateId, sourceEntryId]);

  if (!src) {
    return <div className="h-24 w-24 rounded-xl bg-[#eee]" />;
  }
  // Authorized blob URL from the admin photo API; next/image cannot take object URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-24 w-24 rounded-xl object-cover" />;
}

function CandidateCard({
  eventId,
  candidate,
  awardCandidates,
  isFirst,
  isLast,
  onChanged,
  onMove,
}: {
  eventId: string;
  candidate: RecognitionCandidate;
  awardCandidates: RecognitionCandidate[];
  isFirst: boolean;
  isLast: boolean;
  onChanged: (candidate: RecognitionCandidate) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [displayName, setDisplayName] = useState(candidate.displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(input: Parameters<typeof updateRecognitionCandidate>[2]) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateRecognitionCandidate(eventId, candidate.id, input);
      onChanged(updated);
      setDisplayName(updated.displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-0.5">
          <button type="button" disabled={isFirst || saving} onClick={() => onMove(-1)} className="h-8 w-8 rounded-lg border text-[#1d1d1f] disabled:opacity-30">↑</button>
          <button type="button" disabled={isLast || saving} onClick={() => onMove(1)} className="h-8 w-8 rounded-lg border text-[#1d1d1f] disabled:opacity-30">↓</button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.75rem] text-[#86868b]">{candidate.awardName}</p>
          <p className="text-[1rem] font-semibold text-[#1d1d1f]">{candidate.displayName}</p>
          <p className="mt-1 text-[0.75rem] text-[#86868b]">
            {STATUS_LABELS[candidate.reviewStatus]} · {candidate.sourceCount} 筆來源
            {candidate.hasOriginalPhoto ? " · 有照片" : " · 無照片"}
          </p>
          {candidate.submitterOrganizations.length > 0 && (
            <p className="mt-1 text-[0.75rem] text-[#86868b]">
              {candidate.submitterOrganizations.join("、")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {candidate.crossAwardWarning && (
          <span className="rounded-full bg-[#fff4d6] px-2.5 py-1 text-[0.75rem] font-medium text-[#9a6700]">
            此姓名同時出現在其他表揚項目
          </span>
        )}
        {candidate.suspectedDuplicateWarning && (
          <span className="rounded-full bg-[#fff4d6] px-2.5 py-1 text-[0.75rem] font-medium text-[#9a6700]">
            疑似重複
          </span>
        )}
        {candidate.missingRequiredPhoto && (
          <span className="rounded-full bg-[#ffe5ea] px-2.5 py-1 text-[0.75rem] font-medium text-[#ff375f]">
            缺少照片
          </span>
        )}
      </div>

      {(candidate.crossAwardMatches.length > 0 || candidate.suspectedDuplicates.length > 0) && (
        <div className="mt-2 space-y-1 text-[0.75rem] text-[#9a6700]">
          {candidate.crossAwardMatches.map((match) => (
            <p key={match.candidateId}>也出現在「{match.awardName}」：{match.displayName}</p>
          ))}
          {candidate.suspectedDuplicates.map((match) => (
            <p key={match.candidateId}>疑似重複：{match.displayName}（{match.awardName}）</p>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["approved", "needs_fix", "rejected", "pending"] as const).map((status) => (
          <button
            key={status}
            type="button"
            disabled={saving || candidate.reviewStatus === status}
            onClick={() => void patch({ reviewStatus: status })}
            className="rounded-xl border border-[var(--brand-border)] px-3 py-2 text-[0.8125rem] font-medium text-[#1d1d1f] disabled:opacity-40"
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-3 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
      >
        {expanded ? "收合來源" : "查看來源與照片"}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-[var(--brand-border)] pt-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.8125rem] font-medium text-[#1d1d1f]">正式姓名</label>
            <input className={INPUT_CLASS} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <button
              type="button"
              disabled={saving || displayName.trim() === candidate.displayName}
              onClick={() => void patch({ displayName })}
              className="rounded-xl bg-[#1d1d1f] px-3 py-2 text-[0.875rem] font-semibold text-white disabled:opacity-40"
            >
              儲存姓名
            </button>
            <p className="text-[0.75rem] text-[#86868b]">不會改動原始 submitted_name，也不會自動合併其他人。</p>
          </div>

          {candidate.sources.map((source) => (
            <div key={source.id} className="rounded-2xl bg-[#f5f5f7] p-3">
              <p className="text-[0.875rem] font-medium text-[#1d1d1f]">原始姓名：{source.submittedName}</p>
              <p className="text-[0.75rem] text-[#86868b]">{source.submitterName} · {source.submitterOrganization}</p>
              <p className="text-[0.75rem] text-[#86868b]">{source.awardName}</p>
              {source.submittedAt && (
                <p className="text-[0.75rem] text-[#86868b]">{new Date(source.submittedAt).toLocaleString("zh-TW")}</p>
              )}
              {source.hasOriginalPhoto && (
                <div className="mt-2 flex items-end gap-3">
                  <EvidencePhoto
                    eventId={eventId}
                    candidateId={candidate.id}
                    sourceEntryId={source.submissionEntryId}
                  />
                  <button
                    type="button"
                    disabled={saving || candidate.preferredSourceEntryId === source.submissionEntryId}
                    onClick={() => void patch({ preferredSourceEntryId: source.submissionEntryId })}
                    className="rounded-xl border px-3 py-2 text-[0.75rem] font-medium disabled:opacity-40"
                  >
                    {candidate.preferredSourceEntryId === source.submissionEntryId ? "目前選用照片" : "設為選用照片"}
                  </button>
                </div>
              )}
            </div>
          ))}
          {error && <p className="text-[0.875rem] text-[#ff375f]">{error}</p>}
          {awardCandidates.length > 1 && (
            <p className="text-[0.75rem] text-[#86868b]">上下箭頭只調整此表揚項目內的順序，供未來簡報使用。</p>
          )}
        </div>
      )}
    </div>
  );
}

export function RecognitionReviewPage({ eventId }: { eventId: string }) {
  const [candidates, setCandidates] = useState<RecognitionCandidate[]>([]);
  const [awards, setAwards] = useState<RecognitionEventAward[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [awardId, setAwardId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextAwards, nextCandidates] = await Promise.all([
        fetchEventAwards(eventId),
        fetchRecognitionCandidates(eventId),
      ]);
      setAwards(nextAwards);
      setCandidates(nextCandidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入審核名單");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncRecognitionCandidates(eventId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失敗");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void handleSync();
    // Initial sync when Review Center opens; subsequent syncs are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const visibleCandidates = useMemo(
    () => candidates.filter((candidate) => candidateMatchesRecognitionFilters({
      candidate,
      status: status as RecognitionCandidate["reviewStatus"] | "all" | "photo-required" | "warnings",
      eventAwardId: awardId || undefined,
      query,
    })),
    [candidates, status, awardId, query],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, RecognitionCandidate[]>();
    for (const candidate of visibleCandidates) {
      const list = map.get(candidate.eventAwardId) ?? [];
      list.push(candidate);
      map.set(candidate.eventAwardId, list);
    }
    return map;
  }, [visibleCandidates]);

  async function handleMove(candidate: RecognitionCandidate, direction: -1 | 1) {
    const fullGroup = candidates.filter((item) => item.eventAwardId === candidate.eventAwardId);
    const ids = fullGroup.map((item) => item.id);
    const index = ids.indexOf(candidate.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const ordered = [...ids];
    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(next, 0, moved);
    try {
      await reorderRecognitionCandidates(eventId, candidate.eventAwardId, ordered);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法調整順序");
    }
  }

  return (
    <PageShell
      title="審核中心"
      subtitle="整併名單、審核、挑選照片"
      backHref={`/recognition/events/${eventId}`}
      backLabel="返回活動"
    >
      <BrandCard variant="bordered">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">同步投稿</p>
            <p className="mt-1 text-[0.875rem] text-[#86868b]">依相同活動 + 相同項目 + 相同 normalized name 整併。不會覆蓋已審核狀態。</p>
          </div>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            className="rounded-xl bg-[#1d1d1f] px-3 py-2 text-[0.875rem] font-semibold text-white disabled:opacity-60"
          >
            {syncing ? "同步中…" : "更新／同步投稿名單"}
          </button>
        </div>
      </BrandCard>

      <div className="flex flex-col gap-2">
        <input
          className={INPUT_CLASS}
          placeholder="搜尋姓名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={INPUT_CLASS}
          value={awardId}
          onChange={(e) => setAwardId(e.target.value)}
        >
          <option value="">全部表揚項目</option>
          {awards.filter((award) => award.isEnabled).map((award) => (
            <option key={award.id} value={award.id}>{award.awardName}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatus(filter.id)}
              className={`rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ${
                status === filter.id ? "bg-[#1d1d1f] text-white" : "bg-[#f5f5f7] text-[#1d1d1f]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-[0.9375rem] text-[#86868b]">載入中…</p>}
      {error && <p className="text-[0.9375rem] text-[#ff375f]">{error}</p>}
      {!loading && visibleCandidates.length === 0 && (
        <BrandCard variant="bordered">
          <p className="text-[0.9375rem] text-[#86868b]">尚無候選人。請先同步投稿名單。</p>
        </BrandCard>
      )}

      {Array.from(grouped.entries()).map(([eventAwardId, group]) => (
        <div key={eventAwardId} className="flex flex-col gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{group[0]?.awardName}</h2>
          {group.map((candidate) => {
            const fullGroup = candidates.filter((item) => item.eventAwardId === candidate.eventAwardId);
            const index = fullGroup.findIndex((item) => item.id === candidate.id);
            return (
            <CandidateCard
              key={candidate.id}
              eventId={eventId}
              candidate={candidate}
              awardCandidates={fullGroup}
              isFirst={index === 0}
              isLast={index === fullGroup.length - 1}
              onChanged={(updated) => {
                setCandidates((current) => current.map((item) => item.id === updated.id ? updated : item));
              }}
              onMove={(direction) => void handleMove(candidate, direction)}
            />
            );
          })}
        </div>
      ))}
    </PageShell>
  );
}
