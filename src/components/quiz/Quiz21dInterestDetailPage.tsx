"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { PageShell } from "@/components/ui/PageShell";
import {
  buildPartnerContactActions,
  displayConfirmedText,
  formatRelativeZh,
  partnerSourceLabel,
  QUIZ_PARTNER_STATUS_LABEL,
  toQuizPartnerUiStatus,
} from "@/lib/quiz/partner/quiz-partner-presentation";
import { animalPresentation } from "@/lib/quiz/partner/quiz-partner-presentation";

type Detail = {
  card: {
    id: string;
    displayName: string;
    createdAt: string;
    source: string;
    status: string;
    animalType: string | null;
    animalLabel: string;
  };
  brief: {
    why_now: string;
    real_bottleneck: string;
    past_pattern: string;
    first_change: string;
    important_context: string;
    avoid_assumption: string;
    suggested_opening: string;
  };
  contactChannel: string | null;
  contactValue: string | null;
  analysis: { report: { why_now: string; bottleneck: string; first_change: string } | null };
};

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function Quiz21dInterestDetailPage({ interestId }: { interestId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"joined" | "declined" | "archive" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const load = useCallback(async () => {
    const response = await fetchWithMemberAuth(`/api/quiz/21d/${interestId}`);
    const payload = (await response.json()) as Detail & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "找不到這筆名單");
    setDetail(payload);
  }, [interestId]);

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "無法載入"));
  }, [load]);

  async function postStatus(action: "mark_contacted" | "mark_joined" | "mark_declined") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth(`/api/quiz/21d/${interestId}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("無法更新狀態");
      setConfirm(null);
      await load();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "無法更新狀態");
    } finally {
      setBusy(false);
    }
  }

  async function archiveLead() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth(`/api/quiz/21d/${interestId}`, {
        method: "POST",
        body: JSON.stringify({ action: "archive" }),
      });
      if (!response.ok) throw new Error("無法刪除名單");
      setConfirm(null);
      router.replace("/quiz/21d");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "無法刪除名單");
      setBusy(false);
    }
  }

  if (error && !detail) {
    return (
      <PageShell title="21 天名單" backHref="/quiz/21d">
        <p className="text-sm text-red-600">{error}</p>
      </PageShell>
    );
  }
  if (!detail) {
    return (
      <PageShell title="21 天名單" backHref="/quiz/21d">
        <p className="text-sm text-[#86868b]">載入中…</p>
      </PageShell>
    );
  }

  const ui = toQuizPartnerUiStatus(detail.card.status);
  const contact = buildPartnerContactActions(detail.contactChannel, detail.contactValue);
  const animal = detail.card.animalLabel || animalPresentation(detail.card.animalType).label;
  const brief = detail.brief;

  return (
    <PageShell title={detail.card.displayName} subtitle="有人主動想了解，你現在只要去跟他聊。" backHref="/quiz/21d">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
        <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">這個人</p>
        <h2 className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">{detail.card.displayName}</h2>
        {animal ? <p className="mt-1 text-[0.9375rem] text-[#1d1d1f]">{animal}</p> : null}
        <p className="mt-2 text-[0.8125rem] text-[#86868b]">
          {formatRelativeZh(detail.card.createdAt)} · {QUIZ_PARTNER_STATUS_LABEL[ui]} ·{" "}
          {partnerSourceLabel(detail.card.source)}
        </p>
        {contact ? (
          <div className="mt-4 space-y-2">
            <p className="text-[0.9375rem] text-[#1d1d1f]">{contact.display}</p>
            <div className="flex flex-wrap gap-2">
              {contact.openHref ? (
                <a
                  href={contact.openHref}
                  target={contact.openHref.startsWith("tel:") ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-2xl bg-[#1d1d1f] px-4 text-[0.875rem] font-semibold text-white"
                >
                  {contact.openHref.includes("instagram.com")
                    ? "開啟 Instagram"
                    : contact.openHref.startsWith("tel:")
                      ? "撥打"
                      : contact.openLabel}
                </a>
              ) : null}
              {contact.copyValue && contact.copyLabel ? (
                <button
                  type="button"
                  onClick={() => {
                    void copyText(contact.copyValue!).then(() => {
                      setCopied(contact.copyLabel);
                      window.setTimeout(() => setCopied(null), 1600);
                    });
                  }}
                  className="inline-flex min-h-11 items-center rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.875rem] font-semibold text-[#1d1d1f]"
                >
                  {copied === contact.copyLabel
                    ? "已複製"
                    : contact.copyLabel === "複製 LINE ID"
                      ? "複製 LINE ID"
                      : contact.copyLabel}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
        <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">AI 已經幫你了解的事</p>
        <dl className="mt-4 space-y-4 text-[0.9375rem] leading-7">
          <div>
            <dt className="text-[0.75rem] font-semibold text-[#8a5a66]">WHY NOW</dt>
            <dd>{displayConfirmedText(brief.why_now)}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-semibold text-[#8a5a66]">REAL BOTTLENECK</dt>
            <dd>{displayConfirmedText(brief.real_bottleneck)}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-semibold text-[#8a5a66]">PAST PATTERN</dt>
            <dd>{displayConfirmedText(brief.past_pattern)}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-semibold text-[#8a5a66]">FIRST CHANGE</dt>
            <dd>{displayConfirmedText(brief.first_change)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
        <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">真人承接提示</p>
        <dl className="mt-4 space-y-4 text-[0.9375rem] leading-7">
          <div>
            <dt className="text-[0.75rem] font-semibold text-[#8a5a66]">IMPORTANT CONTEXT</dt>
            <dd>{displayConfirmedText(brief.important_context)}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-semibold text-[#8a5a66]">AVOID ASSUMPTION</dt>
            <dd>{displayConfirmedText(brief.avoid_assumption)}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-semibold text-[#8a5a66]">SUGGESTED OPENING</dt>
            <dd className="rounded-2xl bg-[#faf6f1] p-3">{displayConfirmedText(brief.suggested_opening)}</dd>
            {brief.suggested_opening && brief.suggested_opening !== "尚未確認" ? (
              <button
                type="button"
                onClick={() => {
                  void copyText(brief.suggested_opening).then(() => {
                    setCopied("opening");
                    window.setTimeout(() => setCopied(null), 1600);
                  });
                }}
                className="mt-2 inline-flex min-h-11 items-center rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.875rem] font-semibold text-[#1d1d1f]"
              >
                {copied === "opening" ? "已複製開場" : "複製開場"}
              </button>
            ) : null}
          </div>
        </dl>
      </section>

      <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
        <button
          type="button"
          onClick={() => setShowAnalysis((open) => !open)}
          className="min-h-11 w-full text-left text-[0.9375rem] font-semibold text-[#1d1d1f]"
        >
          {showAnalysis ? "收合完整 AI 分析" : "查看完整 AI 分析"}
        </button>
        {showAnalysis ? (
          <div className="mt-3 space-y-3 text-[0.9375rem] leading-7 text-[#1d1d1f]">
            <p>{detail.analysis.report?.why_now ?? "尚未確認"}</p>
            <p className="text-[#636366]">{detail.analysis.report?.bottleneck ?? "尚未確認"}</p>
            <p className="text-[#636366]">{detail.analysis.report?.first_change ?? "尚未確認"}</p>
          </div>
        ) : null}
      </section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 space-y-2 bg-[#faf6f1]/95 py-3 backdrop-blur-sm md:bottom-0">
        {ui === "waiting" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void postStatus("mark_contacted")}
            className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white disabled:opacity-50"
          >
            標記已聯絡
          </button>
        ) : null}
        {ui === "contacted" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm("joined")}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white disabled:opacity-50"
            >
              已成交
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm("declined")}
              className="min-h-12 w-full rounded-2xl border border-[#eadfd6] bg-white text-[0.9375rem] font-semibold text-[#1d1d1f] disabled:opacity-50"
            >
              未成交
            </button>
          </>
        ) : null}
        {ui === "joined" ? (
          <div className="space-y-2">
            <p className="rounded-2xl bg-[#e8f8ee] py-3 text-center text-[0.9375rem] font-semibold text-[#248a3d]">
              成交
            </p>
            <p className="text-center text-[0.8125rem] leading-6 text-[#636366]">
              成交後，請建立顧客並啟動 21 天體驗
            </p>
            <Link
              href={`/quiz/21d/${interestId}/start`}
              className="flex min-h-12 items-center justify-center rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
            >
              啟動 21 天體驗
            </Link>
          </div>
        ) : null}
        {ui === "declined" ? (
          <p className="rounded-2xl bg-[#f5f5f7] py-3 text-center text-[0.9375rem] font-semibold text-[#636366]">
            未成交
          </p>
        ) : null}
        <Link href="/quiz/21d" className="block text-center text-[0.8125rem] text-[#8a5a66]">
          返回名單
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirm("archive")}
          className="block min-h-11 w-full text-center text-[0.8125rem] text-[#86868b] disabled:opacity-50"
        >
          刪除名單
        </button>
      </div>

      {confirm === "archive" ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-5">
            <p className="text-[1rem] font-semibold leading-7 text-[#1d1d1f]">確定刪除這筆名單？</p>
            <p className="mt-2 text-[0.9375rem] leading-7 text-[#636366]">
              刪除後不會再出現在 21 天名單中，也不會計入工作台成效。
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="min-h-11 flex-1 rounded-2xl border border-[#eadfd6] text-[0.875rem] font-semibold"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void archiveLead()}
                className="min-h-11 flex-1 rounded-2xl bg-[#1d1d1f] text-[0.875rem] font-semibold text-white disabled:opacity-50"
              >
                刪除名單
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm && confirm !== "archive" ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-5">
            <p className="text-[1rem] font-semibold leading-7 text-[#1d1d1f]">
              {confirm === "joined"
                ? "確定這位顧客已完成 21 天體驗成交？"
                : "確定標記為未成交？"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="min-h-11 flex-1 rounded-2xl border border-[#eadfd6] text-[0.875rem] font-semibold"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void postStatus(confirm === "joined" ? "mark_joined" : "mark_declined")}
                className="min-h-11 flex-1 rounded-2xl bg-[#1d1d1f] text-[0.875rem] font-semibold text-white"
              >
                {confirm === "joined" ? "確認成交" : "確認未成交"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
