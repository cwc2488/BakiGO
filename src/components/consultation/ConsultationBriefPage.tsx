"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConsultationPrimaryButton } from "@/components/consultation/ConsultationFlowShell";
import { loadConsultationBriefApi } from "@/lib/consultation/consultation-client";
import {
  CONSULTATION_GOAL_TYPE_LABELS,
  CONSULTATION_METHOD_INTEREST_LABELS,
  CONSULTATION_OUTCOME_LABELS,
} from "@/lib/consultation/consultation-flow-engine";
import type { ConsultationBriefSnapshot } from "@/types/consultation";

export function ConsultationBriefPage({ sessionId }: { sessionId: string }) {
  const [brief, setBrief] = useState<ConsultationBriefSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadConsultationBriefApi(sessionId)
      .then((payload) => {
        if (!payload.brief) {
          throw new Error(payload.error ?? "無法載入諮詢摘要");
        }
        setBrief(payload.brief);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "無法載入諮詢摘要");
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#faf6f1] text-[#8b7d74]">
        載入中…
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-[#faf6f1] px-6 text-center">
        <p className="text-sm text-red-600">{error ?? "無法載入諮詢摘要"}</p>
        <Link className="mt-4 text-sm font-medium text-[#2f2622]" href={`/consultation/${sessionId}/step/14`}>
          返回諮詢流程
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#faf6f1]">
      <main className="mx-auto w-full max-w-lg px-4 pb-10 pt-8 sm:px-6">
        <Link className="text-sm text-[#8b7d74]" href={`/customers/${brief.customerId}`}>
          ← 查看顧客檔案
        </Link>
        <div className="mt-4 space-y-2">
          <h1 className="text-[1.75rem] font-semibold text-[#2f2622]">Consultation Brief</h1>
          <p className="text-sm text-[#8b7d74]">僅夥伴本人可讀 · {new Date(brief.generatedAt).toLocaleString("zh-TW")}</p>
        </div>
        <div className="mt-6 space-y-4">
          <BriefSection title="顧客基本資料">
            <BriefLine label="姓名" value={brief.customerProfile.displayName} />
            <BriefLine label="性別" value={brief.customerProfile.sex} />
            <BriefLine label="生日" value={brief.customerProfile.birthDate} />
            <BriefLine label="地區" value={brief.customerProfile.region} />
            <BriefLine label="工作" value={brief.customerProfile.occupation} />
          </BriefSection>
          {brief.bodyMeasurement ? (
            <BriefSection title="身體量測">
              <BriefLine label="日期" value={String(brief.bodyMeasurement.recordDate ?? "—")} />
              <BriefLine label="體重" value={brief.bodyMeasurement.weightKg ? `${brief.bodyMeasurement.weightKg} kg` : undefined} />
              <BriefLine label="體脂率" value={brief.bodyMeasurement.bodyFatPercent ? `${brief.bodyMeasurement.bodyFatPercent} %` : undefined} />
            </BriefSection>
          ) : null}
          <BriefSection title="目標與動機">
            <BriefLine
              label="目標類型"
              value={brief.goal?.goalType ? CONSULTATION_GOAL_TYPE_LABELS[brief.goal.goalType] : undefined}
            />
            <BriefLine label="理想身材" value={brief.goal?.desiredBodyDescription} />
            <BriefLine label="理由 1" value={brief.motivations?.reason1} />
            <BriefLine label="理由 2" value={brief.motivations?.reason2} />
            <BriefLine label="理由 3" value={brief.motivations?.reason3} />
          </BriefSection>
          <BriefSection title="Decision Tree">
            <BriefLine label="決心" value={brief.commitmentScore !== undefined ? `${brief.commitmentScore} 分` : undefined} />
            <BriefLine label="準備度" value={brief.readiness?.gateDecision} />
            <BriefLine label="成功案例數" value={String(brief.successStoryCount)} />
            <BriefLine
              label="願意了解方法"
              value={
                brief.methodInterest?.interest
                  ? CONSULTATION_METHOD_INTEREST_LABELS[brief.methodInterest.interest]
                  : undefined
              }
            />
          </BriefSection>
          <BriefSection title="結果">
            <BriefLine
              label="Outcome"
              value={brief.outcome?.outcome ? CONSULTATION_OUTCOME_LABELS[brief.outcome.outcome] : undefined}
            />
            <BriefLine label="疑問" value={brief.outcome?.customerQuestions} />
            <BriefLine label="疑慮" value={brief.outcome?.objections} />
            <BriefLine label="下一步" value={brief.outcome?.nextStep} />
            <BriefLine label="追蹤日期" value={brief.outcome?.followUpDate} />
            <BriefLine label="安全旗標" value={brief.healthSafetyFlag} />
            <BriefLine label="Session 狀態" value={brief.sessionStatus} />
          </BriefSection>
        </div>
        <div className="mt-8">
          <Link href="/consultation/new">
            <ConsultationPrimaryButton type="button">開始另一場諮詢</ConsultationPrimaryButton>
          </Link>
        </div>
      </main>
    </div>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.5rem] bg-white/90 p-5 ring-1 ring-[#eadfd6]">
      <h2 className="text-sm font-semibold text-[#2f2622]">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function BriefLine({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <p className="text-sm leading-6 text-[#6f5f57]">
      <span className="font-medium text-[#2f2622]">{label}：</span>
      {value}
    </p>
  );
}
