"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TabRootShell } from "@/components/ui/TabRootShell";
import {
  QUESTIONNAIRE_CONTACT_TYPE_LABEL,
  QUESTIONNAIRE_EXERCISE_OPTIONS,
  QUESTIONNAIRE_INTEREST_OPTIONS,
  QUESTIONNAIRE_LEAD_STATUS_LABEL,
  QUESTIONNAIRE_SOURCE_LABEL,
  allowedQuestionnaireStatusActions,
} from "@/lib/questionnaire/contract";
import {
  deleteQuestionnaireLead,
  fetchQuestionnaireLead,
  patchQuestionnaireLeadStatus,
  readCachedQuestionnaireLead,
} from "@/lib/questionnaire/client";
import type {
  QuestionnaireLeadDetail,
  QuestionnaireLeadStatus,
  QuestionnaireLeadSummary,
} from "@/types/questionnaire";

const ACTION_LABEL: Record<string, string> = {
  contacted: "標記已聯絡",
  invitation_started: "開始邀約5步驟",
  paused: "暫不追蹤",
  completed: "標記完成",
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function exerciseLabel(value: string): string {
  return QUESTIONNAIRE_EXERCISE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function interestPartnerLabel(value: string): string {
  return QUESTIONNAIRE_INTEREST_OPTIONS.find((o) => o.value === value)?.partnerLabel ?? value;
}

function interestPublicLabel(value: string): string {
  return QUESTIONNAIRE_INTEREST_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function isFullDetail(
  value: QuestionnaireLeadDetail | QuestionnaireLeadSummary | null,
): value is QuestionnaireLeadDetail {
  return Boolean(value && "contactType" in value && "firstResponseAt" in value);
}

export default function QuestionnaireLeadDetailPage({ leadId }: { leadId: string }) {
  const router = useRouter();
  const cached = readCachedQuestionnaireLead(leadId);
  const [lead, setLead] = useState<QuestionnaireLeadDetail | QuestionnaireLeadSummary | null>(
    cached,
  );
  const [coldLoading, setColdLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleHint, setStaleHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const hasCache = Boolean(readCachedQuestionnaireLead(leadId));
    if (hasCache) {
      setRefreshing(true);
    } else {
      setColdLoading(true);
    }
    setError(null);
    try {
      const data = await fetchQuestionnaireLead(leadId);
      setLead(data);
      setStaleHint(null);
    } catch (err) {
      if (hasCache) {
        setStaleHint("更新失敗，顯示上次資料");
      } else {
        setError(err instanceof Error ? err.message : "載入失敗");
      }
    } finally {
      setColdLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

  useEffect(() => {
    const next = readCachedQuestionnaireLead(leadId);
    if (next) {
      setLead(next);
      setColdLoading(false);
    }
    void load();
  }, [leadId, load]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function applyStatus(next: string) {
    if (!lead) return;
    if (next === "invitation_started") {
      const ok = window.confirm(
        "確定這位對象已正式開始進入『邀約5步驟』嗎？\n\n確認後，本週邀約5步驟會自動 +1。",
      );
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await patchQuestionnaireLeadStatus(leadId, next);
      setLead(updated);
      setToast("已更新狀態");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteLead() {
    setDeleting(true);
    setError(null);
    try {
      await deleteQuestionnaireLead(leadId);
      router.replace("/questionnaire/leads");
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const full = isFullDetail(lead) ? lead : null;
  const actions = lead
    ? allowedQuestionnaireStatusActions(lead.status as QuestionnaireLeadStatus)
    : [];
  const response = full?.latestResponse;
  const displayName = lead?.displayName ?? "問卷名單";

  return (
    <TabRootShell
      header={
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/questionnaire/leads"
              className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]"
            >
              ← 我的問卷名單
            </Link>
            {refreshing ? (
              <p className="text-[0.6875rem] text-[var(--brand-hint)]">更新中…</p>
            ) : null}
          </div>
          <h1 className="text-[1.5rem] font-semibold tracking-tight text-[var(--brand-text)]">
            {displayName}
          </h1>
        </header>
      }
    >
      {coldLoading && !lead ? (
        <div className="space-y-4 animate-pulse" aria-busy="true">
          <div className="h-32 rounded-[1.25rem] bg-[var(--brand-primary-muted)]" />
          <div className="h-24 rounded-[1.25rem] bg-[var(--brand-primary-muted)]" />
        </div>
      ) : null}

      {error && !lead ? (
        <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {staleHint ? (
        <p className="mb-3 text-[0.75rem] text-[var(--brand-text-muted)]">{staleHint}</p>
      ) : null}

      {error && lead ? (
        <p className="mb-3 rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {lead ? (
        <div className="space-y-5">
          <section className="space-y-2 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4">
            {full ? (
              <>
                <p className="text-[0.875rem] text-[var(--brand-text)]">
                  聯絡方式：{QUESTIONNAIRE_CONTACT_TYPE_LABEL[full.contactType]} · {full.contactValue}
                </p>
                <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
                  狀態：{QUESTIONNAIRE_LEAD_STATUS_LABEL[full.status]}
                </p>
                <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
                  來源：{QUESTIONNAIRE_SOURCE_LABEL[full.firstSource]}
                  {full.lastSource !== full.firstSource
                    ? ` → ${QUESTIONNAIRE_SOURCE_LABEL[full.lastSource]}`
                    : ""}
                </p>
                <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">
                  第一次：{formatTime(full.firstResponseAt)}
                </p>
                <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">
                  最後：{formatTime(full.lastResponseAt)} · 填寫 {full.responseCount} 次
                </p>
              </>
            ) : (
              <>
                <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
                  狀態：{QUESTIONNAIRE_LEAD_STATUS_LABEL[lead.status]}
                </p>
                <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">
                  最後：{formatTime(lead.lastResponseAt)}
                </p>
              </>
            )}
          </section>

          <section className="space-y-3 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4">
            <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
              摘要
            </h2>
            <div>
              <p className="text-[0.75rem] font-semibold text-[var(--brand-text-muted)]">🔥 核心需求</p>
              <p className="text-[0.9375rem] text-[var(--brand-text)]">{lead.primaryNeed ?? "—"}</p>
            </div>
            <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
              需求標籤：{lead.needTags.length ? lead.needTags.join("、") : "—"}
            </p>
            <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
              意願：{interestPartnerLabel(lead.interestLevel ?? "")}
            </p>
          </section>

          {response ? (
            <section className="space-y-3 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4">
              <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
                最新問卷答案
              </h2>
              <ol className="list-decimal space-y-2 pl-5 text-[0.875rem] text-[var(--brand-text)]">
                <li>
                  想改善什麼：{response.improvementAreas.join("、")}
                  {response.improvementOther ? `（${response.improvementOther}）` : ""}
                </li>
                <li>滿意度：{response.bodySatisfactionScore} 分</li>
                <li>運動頻率：{exerciseLabel(response.weeklyExerciseFrequency)}</li>
                <li>是否使用健康食品／補給品：{response.usesSupplements ? "有" : "沒有"}</li>
                <li>
                  目前使用什麼：
                  {response.usesSupplements ? response.supplementDetails ?? "—" : "—"}
                </li>
                <li>最想先改善什麼：{response.priorityImprovement}</li>
                <li>
                  是否願意進一步了解：
                  {interestPublicLabel(response.furtherUnderstandingInterest)}
                </li>
              </ol>
            </section>
          ) : null}

          {actions.length > 0 ? (
            <section className="space-y-2">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={saving || deleting}
                  onClick={() => void applyStatus(action)}
                  className={`flex min-h-11 w-full items-center justify-center rounded-[0.875rem] px-4 text-[0.9375rem] font-semibold disabled:opacity-50 ${
                    action === "invitation_started"
                      ? "bg-[var(--brand-primary)] text-white"
                      : "border border-[var(--brand-border)] text-[var(--brand-text)]"
                  }`}
                >
                  {ACTION_LABEL[action] ?? action}
                </button>
              ))}
            </section>
          ) : full ? (
            <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">此狀態為唯讀</p>
          ) : null}

          <section className="border-t border-[var(--brand-border)]/70 pt-5">
            {!confirmDelete ? (
              <button
                type="button"
                disabled={deleting || saving}
                onClick={() => setConfirmDelete(true)}
                className="flex min-h-11 w-full items-center justify-center rounded-[0.875rem] border border-[#d70015]/40 px-4 text-[0.875rem] font-medium text-[#d70015] disabled:opacity-50"
              >
                刪除這筆問卷
              </button>
            ) : (
              <div className="space-y-3 rounded-[1rem] border border-[#d70015]/30 bg-[#fff2f2] p-4">
                <p className="text-[0.9375rem] font-semibold text-[var(--brand-text)]">
                  確定要刪除「{displayName}」的問卷嗎？
                </p>
                <p className="text-[0.8125rem] leading-relaxed text-[var(--brand-text-secondary)]">
                  刪除後：
                  <br />
                  ・這位對象的問卷紀錄會刪除
                  <br />
                  ・如果曾自動計入魚池，會扣回 1
                  <br />
                  ・如果曾自動計入邀約5步驟，會扣回 1
                  <br />
                  <br />
                  此操作無法復原。
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-[0.875rem] border border-[var(--brand-border)] text-[0.875rem] font-semibold disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void confirmDeleteLead()}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-[0.875rem] bg-[#d70015] text-[0.875rem] font-semibold text-white disabled:opacity-50"
                  >
                    {deleting ? "刪除中…" : "確認刪除"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {toast ? (
        <p className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--brand-text)] px-4 py-2 text-[0.8125rem] text-white shadow-lg">
          {toast}
        </p>
      ) : null}
    </TabRootShell>
  );
}
