"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import {
  advancePipelineLead,
  createPipelineLead,
  deletePipelineLead,
  updatePipelineLeadRegion,
  updatePipelineLeadSchedule,
} from "@/lib/retail-pipeline/advance-pipeline-lead";
import { RegionField } from "@/components/ui/RegionField";
import { buildRetailPipelineSnapshot } from "@/lib/retail-pipeline/pipeline-selectors";
import { todayISODate } from "@/lib/config/app-config";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { RetailPipelineColumnView, RetailPipelineLeadView } from "@/types/retail-pipeline";
import type { RetailPipelineStageKey } from "@/types/retail-pipeline";
import { PageShell } from "@/components/ui/PageShell";
import { PARTNER_LABELS } from "@/lib/ui/partner-labels";
import { IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { useCallback, useEffect, useMemo, useState } from "react";

const STAGE_DOT: Record<RetailPipelineStageKey, string> = {
  stranger: "bg-[#aeaeb2]",
  measurement: "bg-[var(--brand-primary)]",
  consultation: "bg-[#bf5af2]",
  new_customer: "bg-[#ff9f0a]",
  returning_customer: "bg-[#ff6482]",
  new_member: "bg-[#30d158]",
  returning_member: "bg-[#248a3d]",
  map: "bg-[#ff6482]",
  supervisor: "bg-[#ffd60a]",
  world_team: "bg-[var(--brand-primary)]",
};

function formatScheduledDateHint(scheduledDate: string | undefined): string | null {
  if (!scheduledDate) {
    return null;
  }
  const today = todayISODate();
  if (scheduledDate === today) {
    return "今天執行";
  }
  if (scheduledDate < today) {
    return "已逾期";
  }
  return null;
}

function formatScheduledLabel(scheduledDate?: string, scheduledTime?: string): string | null {
  if (!scheduledDate) {
    return null;
  }
  const monthDay = `${Number(scheduledDate.slice(5, 7))}/${Number(scheduledDate.slice(8, 10))}`;
  return scheduledTime ? `${monthDay} ${scheduledTime}` : monthDay;
}

function LeadCard({
  lead,
  onAdvance,
  onScheduleChange,
  onRegionChange,
  onDelete,
  isAdvancing,
}: {
  lead: RetailPipelineLeadView;
  onAdvance: (leadId: string) => void;
  onScheduleChange: (leadId: string, scheduledDate: string, scheduledTime: string) => void;
  onRegionChange: (leadId: string, region: string) => void;
  onDelete: (leadId: string) => void;
  isAdvancing: boolean;
}) {
  const scheduleHint = formatScheduledDateHint(lead.scheduledDate);
  const scheduleLabel = formatScheduledLabel(lead.scheduledDate, lead.scheduledTime);

  return (
    <article className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[1rem] font-semibold text-[#1d1d1f]">{lead.displayName}</p>
          {scheduleLabel ? (
            <p className="mt-1 text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]">
              排定 {scheduleLabel}
              {lead.calendarEventId ? " · 已同步行事曆" : ""}
            </p>
          ) : null}
        </div>
        <button
          className="shrink-0 rounded-lg px-2 py-1 text-[0.75rem] font-medium text-[#ff375f]"
          onClick={() => onDelete(lead.leadId)}
          type="button"
        >
          刪除
        </button>
      </div>

      <label className="mt-3 block space-y-1.5">
        <span className="text-[0.75rem] font-medium text-[#86868b]">地區</span>
        <RegionField
          onChange={(region) => onRegionChange(lead.leadId, region)}
          value={lead.region ?? ""}
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block space-y-1.5">
          <span className="text-[0.75rem] font-medium text-[#86868b]">排定日期</span>
          <input
            className="date-input w-full"
            onChange={(event) =>
              onScheduleChange(lead.leadId, event.target.value, lead.scheduledTime ?? "")
            }
            type="date"
            value={lead.scheduledDate ?? ""}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[0.75rem] font-medium text-[#86868b]">排定時間</span>
          <input
            className="date-input w-full"
            onChange={(event) =>
              onScheduleChange(lead.leadId, lead.scheduledDate ?? "", event.target.value)
            }
            type="time"
            value={lead.scheduledTime ?? ""}
          />
        </label>
      </div>
      {scheduleHint ? (
        <span
          className={`mt-1 inline-block text-[0.75rem] font-medium ${
            scheduleHint === "已逾期" ? "text-[#ff375f]" : "text-[var(--brand-primary-dark)]"
          }`}
        >
          {scheduleHint}
        </span>
      ) : null}

      {lead.autoRolloverHint ? (
        <p className="mt-1.5 text-[0.8125rem] font-medium leading-relaxed text-[#5856d6]">
          {lead.autoRolloverHint}
        </p>
      ) : null}

      {lead.nextStepLabel ? (
        <p className="mt-1.5 text-[0.8125rem] text-[#86868b]">
          下一步：<span className="font-medium text-[var(--brand-primary-dark)]">{lead.nextStepLabel}</span>
        </p>
      ) : !lead.autoRolloverHint ? (
        <p className="mt-1.5 text-[0.8125rem] font-medium text-[#248a3d]">已完成流程</p>
      ) : null}
      {lead.canAdvance ? (
        <button
          className="mt-3 w-full rounded-xl bg-[var(--brand-primary)] px-3 py-2.5 text-[0.875rem] font-semibold text-white disabled:opacity-60"
          disabled={isAdvancing}
          onClick={() => onAdvance(lead.leadId)}
          type="button"
        >
          {isAdvancing ? "記錄中…" : "完成下一步"}
        </button>
      ) : null}
    </article>
  );
}

function PipelineStageSection({
  column,
  stageIndex,
  advancingLeadId,
  onAdvance,
  onScheduleChange,
  onRegionChange,
  onDelete,
}: {
  column: RetailPipelineColumnView;
  stageIndex: number;
  advancingLeadId: string | null;
  onAdvance: (leadId: string) => void;
  onScheduleChange: (leadId: string, scheduledDate: string, scheduledTime: string) => void;
  onRegionChange: (leadId: string, region: string) => void;
  onDelete: (leadId: string) => void;
}) {
  const hasLeads = column.leads.length > 0;

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--brand-border)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_DOT[column.stageKey]}`}
          />
          <div>
            <p className="text-[0.75rem] font-medium text-[#86868b]">第 {stageIndex + 1} 階</p>
            <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{column.title}</h2>
          </div>
        </div>
        <span className="rounded-full bg-[var(--brand-bg)] px-2.5 py-1 text-[0.8125rem] font-medium text-[#636366]">
          {column.count}
        </span>
      </header>

      <div className="p-4">
        {hasLeads ? (
          <div className="space-y-3">
            {column.leads.map((lead) => (
              <LeadCard
                key={lead.leadId}
                isAdvancing={advancingLeadId === lead.leadId}
                lead={lead}
                onAdvance={onAdvance}
                onDelete={onDelete}
                onRegionChange={onRegionChange}
                onScheduleChange={onScheduleChange}
              />
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-[0.8125rem] text-[#aeaeb2]">尚無名單</p>
        )}
      </div>
    </section>
  );
}

export default function RetailPipelinePage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [snapshot, setSnapshot] = useState(() =>
    buildRetailPipelineSnapshot(resolveAuthenticatedMemberId(storage), storage),
  );
  const [advancingLeadId, setAdvancingLeadId] = useState<string | null>(null);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadRegion, setNewLeadRegion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSnapshot(buildRetailPipelineSnapshot(resolveAuthenticatedMemberId(storage), storage));
  }, [storage]);

  useEffect(() => {
    queueMicrotask(refresh);
  }, [refresh]);

  const handleAdvance = useCallback(
    async (leadId: string) => {
      setError(null);
      setAdvancingLeadId(leadId);

      try {
        advancePipelineLead(leadId, storage);
        refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "無法推進名單");
      } finally {
        setAdvancingLeadId(null);
      }
    },
    [refresh, storage],
  );

  const handleScheduleChange = useCallback(
    (leadId: string, scheduledDate: string, scheduledTime: string) => {
      setError(null);
      try {
        updatePipelineLeadSchedule(
          leadId,
          {
            scheduledDate: scheduledDate || undefined,
            scheduledTime: scheduledTime || undefined,
          },
          storage,
        );
        refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "無法更新排定時間");
      }
    },
    [refresh, storage],
  );

  const handleDeleteLead = useCallback(
    (leadId: string) => {
      setError(null);
      try {
        deletePipelineLead(leadId, storage);
        refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "無法刪除名單");
      }
    },
    [refresh, storage],
  );

  const handleRegionChange = useCallback(
    (leadId: string, region: string) => {
      setError(null);
      try {
        updatePipelineLeadRegion(leadId, region || undefined, storage);
        refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "無法更新地區");
      }
    },
    [refresh, storage],
  );

  function handleCreateLead(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      createPipelineLead(newLeadName, storage, newLeadRegion);
      setNewLeadName("");
      setNewLeadRegion("");
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法新增名單");
    }
  }

  return (
    <PageShell
      subtitle={`共 ${snapshot.totalLeads} 位名單 · 舊客/舊會員長期累積 · 新客/新會員下月自動轉舊`}
      title={PARTNER_LABELS.memberList}
      titleIcon={APP_ICON.page.pipeline}
      variant="plain"
    >
        <form
          className="flex flex-col gap-3 rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5"
          onSubmit={handleCreateLead}
        >
          <input
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-[0.9375rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
            placeholder="新增名單姓名"
            value={newLeadName}
            onChange={(event) => setNewLeadName(event.target.value)}
          />
          <label className="block space-y-1.5">
            <span className="text-[0.8125rem] font-medium text-[#86868b]">地區</span>
            <RegionField onChange={setNewLeadRegion} value={newLeadRegion} />
          </label>
          <button
            className="rounded-2xl bg-[var(--brand-primary)] px-5 py-3 text-[0.9375rem] font-semibold text-white"
            type="submit"
          >
            <IconLabel icon={APP_ICON.action.addRecord}>新增陌生人</IconLabel>
          </button>
        </form>

        {error ? <p className="text-[0.9375rem] text-[#ff375f]">{error}</p> : null}

        <div className="flex flex-col gap-3">
          {snapshot.columns.map((column, index) => (
            <PipelineStageSection
              key={column.stageKey}
              advancingLeadId={advancingLeadId}
              column={column}
              onAdvance={handleAdvance}
              onDelete={handleDeleteLead}
              onRegionChange={handleRegionChange}
              onScheduleChange={handleScheduleChange}
              stageIndex={index}
            />
          ))}
        </div>
    </PageShell>
  );
}
