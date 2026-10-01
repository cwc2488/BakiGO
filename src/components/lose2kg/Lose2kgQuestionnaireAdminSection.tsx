"use client";

import { PersistentShareUrl } from "@/components/lose2kg/CopyLinkButton";
import { Lose2kgButton } from "@/components/lose2kg/Lose2kgUi";
import {
  fetchLose2kgQuestionnaireSettings,
  fetchLose2kgQuestionnaireResults,
  patchLose2kgQuestionnaire,
} from "@/lib/lose2kg/v2-client";
import {
  matchesQuestionnaireSegment,
} from "@/lib/lose2kg/questionnaire-rules";
import type {
  Lose2kgQuestionnaireResultRow,
  Lose2kgQuestionnaireSegment,
  Lose2kgQuestionnaireSettings,
} from "@/types/lose2kg";
import { useEffect, useMemo, useState, useTransition } from "react";

const SEGMENTS: { id: Lose2kgQuestionnaireSegment; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待填問卷" },
  { id: "consultation", label: "待健康諮詢" },
  { id: "product_high", label: "產品高意願" },
  { id: "business_interest", label: "事業有興趣" },
  { id: "product_and_business", label: "產品＋事業都有興趣" },
  { id: "no_demand", label: "暫無需求" },
];

function statusLabel(settings: Lose2kgQuestionnaireSettings | null) {
  if (!settings) return "載入中";
  if (settings.isOpen) return "開放中";
  if (settings.openedAt || settings.closedAt) return "已關閉";
  return "未開放";
}

function productLabel(value: string | null) {
  switch (value) {
    case "know_what":
      return "已知想用哪些";
    case "interested_need_guidance":
      return "有興趣需搭配";
    case "want_to_learn":
      return "還想了解";
    case "none":
      return "目前沒有";
    default:
      return "—";
  }
}

function businessLabel(value: string | null) {
  switch (value) {
    case "very_interested":
      return "很有興趣";
    case "open_to_listen":
      return "可聽聽看";
    case "customer_only":
      return "只想當顧客";
    case "not_now":
      return "目前沒有";
    default:
      return "—";
  }
}

function consultationLabel(value: string | null) {
  switch (value) {
    case "yes":
      return "我要";
    case "contact_later":
      return "可再聯絡";
    case "no":
      return "目前不用";
    default:
      return "—";
  }
}

export function Lose2kgQuestionnaireAdminSection({
  periodId,
  onToast,
}: {
  periodId: string;
  onToast: (msg: string) => void;
}) {
  const [settings, setSettings] = useState<Lose2kgQuestionnaireSettings | null>(null);
  const [rows, setRows] = useState<Lose2kgQuestionnaireResultRow[]>([]);
  const [summary, setSummary] = useState({
    activeParticipantCount: 0,
    responseCount: 0,
    pendingCount: 0,
    consultationCount: 0,
    productHighCount: 0,
    businessInterestCount: 0,
  });
  const [showResults, setShowResults] = useState(false);
  const [segment, setSegment] = useState<Lose2kgQuestionnaireSegment>("all");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function loadResults() {
    const data = await fetchLose2kgQuestionnaireResults(periodId);
    setSettings(data.settings);
    setRows(data.rows);
    setSummary({
      activeParticipantCount: data.activeParticipantCount,
      responseCount: data.responseCount,
      pendingCount: data.pendingCount,
      consultationCount: data.consultationCount,
      productHighCount: data.productHighCount,
      businessInterestCount: data.businessInterestCount,
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Settings only on mount — results lazy-load via 查看結果
        const next = await fetchLose2kgQuestionnaireSettings(periodId);
        if (cancelled) return;
        setSettings(next);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "問卷載入失敗");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodId]);

  const filtered = useMemo(
    () => rows.filter((r) => matchesQuestionnaireSegment(r, segment)),
    [rows, segment],
  );

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          await action();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "操作失敗");
        }
      })();
    });
  }

  return (
    <section className="space-y-4 border-b border-[#e8e4dc] pb-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[1rem] font-semibold">第四週成果問卷</h2>
          <p className="text-[0.8125rem] text-[#86868b]">
            狀態：{statusLabel(settings)}
            {showResults
              ? ` · 已填 ${summary.responseCount}/${summary.activeParticipantCount}`
              : ""}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-[#fff2f2] px-3 py-2 text-[0.8125rem] text-[#d70015]">
          {error}
        </p>
      ) : null}

      {settings?.surveyUrl ? (
        <PersistentShareUrl title="問卷連結" url={settings.surveyUrl} />
      ) : (
        <p className="text-[0.8125rem] text-[#86868b]">載入問卷連結中…</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!settings?.isOpen ? (
          <Lose2kgButton
            loading={pending}
            onClick={() =>
              run(async () => {
                const result = await patchLose2kgQuestionnaire(periodId, { isOpen: true });
                setSettings(result.settings);
                onToast("✓ 問卷已開放");
              })
            }
          >
            開放問卷
          </Lose2kgButton>
        ) : (
          <Lose2kgButton
            tone="secondary"
            loading={pending}
            onClick={() =>
              run(async () => {
                const result = await patchLose2kgQuestionnaire(periodId, { isOpen: false });
                setSettings(result.settings);
                onToast("✓ 問卷已關閉");
              })
            }
          >
            關閉問卷
          </Lose2kgButton>
        )}
        <Lose2kgButton
          tone="secondary"
          loading={pending}
          onClick={() =>
            run(async () => {
              const result = await patchLose2kgQuestionnaire(periodId, {
                regenerateToken: true,
              });
              setSettings(result.settings);
              onToast("✓ 已重設問卷連結");
            })
          }
        >
          重設連結
        </Lose2kgButton>
        <Lose2kgButton
          tone="secondary"
          loading={pending}
          onClick={() =>
            run(async () => {
              await loadResults();
              setShowResults(true);
              onToast("✓ 結果已更新");
            })
          }
        >
          {showResults ? "重新整理結果" : "查看結果"}
        </Lose2kgButton>
      </div>

      {showResults ? (
        <div className="space-y-4 rounded-xl border border-[#e8e4dc] bg-white p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SummaryChip label="參賽者" value={summary.activeParticipantCount} />
            <SummaryChip label="已填問卷" value={summary.responseCount} />
            <SummaryChip label="尚未填" value={summary.pendingCount} />
            <SummaryChip label="願意諮詢" value={summary.consultationCount} />
            <SummaryChip label="產品高意願" value={summary.productHighCount} />
            <SummaryChip label="事業有興趣" value={summary.businessInterestCount} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SEGMENTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSegment(s.id)}
                className={`rounded-lg px-2.5 py-1.5 text-[0.75rem] ${
                  segment === s.id
                    ? "bg-[#1d1d1f] text-white"
                    : "bg-[#f4f1ea] text-[#86868b]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[0.75rem]">
              <thead className="text-[#86868b]">
                <tr>
                  <th className="px-2 py-2">參賽者</th>
                  <th className="px-2 py-2">邀請人</th>
                  <th className="px-2 py-2">教練</th>
                  <th className="px-2 py-2">產品</th>
                  <th className="px-2 py-2">事業</th>
                  <th className="px-2 py-2">諮詢</th>
                  <th className="px-2 py-2">時間</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.participantId} className="border-t border-[#f3efe6]">
                    <td className="px-2 py-2 font-medium">{r.publicDisplayName}</td>
                    <td className="px-2 py-2">{r.inviterName ?? "—"}</td>
                    <td className="px-2 py-2">{r.coachName ?? "—"}</td>
                    <td className="px-2 py-2">{productLabel(r.productInterest)}</td>
                    <td className="px-2 py-2">{businessLabel(r.businessInterest)}</td>
                    <td className="px-2 py-2">
                      {consultationLabel(r.consultationInterest)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {r.submittedAt
                        ? new Date(r.submittedAt).toLocaleString("zh-TW", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-[#86868b]">
                      此篩選無資料
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[#f4f1ea] px-3 py-2 text-center">
      <p className="text-[0.65rem] text-[#86868b]">{label}</p>
      <p className="text-[1.125rem] font-semibold tabular-nums">{value}</p>
    </div>
  );
}
