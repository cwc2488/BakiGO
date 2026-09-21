"use client";

import Link from "next/link";
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
  fetchQuestionnaireLead,
  patchQuestionnaireLeadStatus,
} from "@/lib/questionnaire/client";
import type { QuestionnaireLeadDetail, QuestionnaireLeadStatus } from "@/types/questionnaire";

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

export default function QuestionnaireLeadDetailPage({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<QuestionnaireLeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchQuestionnaireLead(leadId);
      setLead(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const actions = lead ? allowedQuestionnaireStatusActions(lead.status as QuestionnaireLeadStatus) : [];
  const response = lead?.latestResponse;

  return (
    <TabRootShell
      header={
        <header className="space-y-3">
          <Link
            href="/questionnaire/leads"
            className="text-[0.8125rem] font-medium text-[var(--brand-text-secondary)]"
          >
            ← 我的問卷名單
          </Link>
          <h1 className="text-[1.5rem] font-semibold tracking-tight text-[var(--brand-text)]">
            {lead?.displayName ?? "問卷名單"}
          </h1>
        </header>
      }
    >
      {loading ? (
        <p className="text-[0.875rem] text-[var(--brand-text-muted)]">載入中…</p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {lead ? (
        <div className="space-y-5">
          <section className="space-y-2 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4">
            <p className="text-[0.875rem] text-[var(--brand-text)]">
              聯絡方式：{QUESTIONNAIRE_CONTACT_TYPE_LABEL[lead.contactType]} · {lead.contactValue}
            </p>
            <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
              狀態：{QUESTIONNAIRE_LEAD_STATUS_LABEL[lead.status]}
            </p>
            <p className="text-[0.875rem] text-[var(--brand-text-secondary)]">
              來源：{QUESTIONNAIRE_SOURCE_LABEL[lead.firstSource]}
              {lead.lastSource !== lead.firstSource
                ? ` → ${QUESTIONNAIRE_SOURCE_LABEL[lead.lastSource]}`
                : ""}
            </p>
            <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">
              第一次：{formatTime(lead.firstResponseAt)}
            </p>
            <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">
              最後：{formatTime(lead.lastResponseAt)} · 填寫 {lead.responseCount} 次
            </p>
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
                  disabled={saving}
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
          ) : (
            <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">此狀態為唯讀</p>
          )}
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
