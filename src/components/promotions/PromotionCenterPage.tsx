"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { APP_IDS, todayISODate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import { canManagePromotions } from "@/lib/promotions/promotion-access";
import { buildMemberMonthlyPromotions } from "@/lib/promotions/promotion-selectors";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import {
  createPromotionRepository,
  loadOrganizationPromotions,
} from "@/lib/repositories/promotion-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type {
  PromotionCampaign,
  PromotionConditionType,
  PromotionTier,
} from "@/types/promotion-campaign";
import { APP_ICON } from "@/lib/ui/app-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MonthlyPromotionsPanel } from "./MonthlyPromotionsPanel";
import { PageShell } from "@/components/ui/PageShell";

const CONDITION_LABELS: Record<PromotionConditionType, string> = {
  consecutive_monthly_vp: "連續月份 VP 達標",
  single_month_vp: "單月 VP 達標",
  custom: "自訂條件",
};

function emptyTier(level: number): PromotionTier {
  return {
    tierLevel: level,
    title: `第 ${level} 重獎勵`,
    conditionType: "consecutive_monthly_vp",
    startMonth: "",
    endMonth: "",
    vpTarget: 3500,
    rewardTitle: "",
    rewardDescription: "",
  };
}

function TierBadge({ level }: { level: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--brand-primary)] text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]">
      {level}
    </span>
  );
}

function TierEditor({
  tier,
  onChange,
  onRemove,
  canRemove,
}: {
  tier: PromotionTier;
  onChange: (tier: PromotionTier) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <TierBadge level={tier.tierLevel} />
          <p className="text-[1rem] font-semibold text-[#1d1d1f]">第 {tier.tierLevel} 重</p>
        </div>
        {canRemove ? (
          <button
            className="text-[0.8125rem] font-medium text-[#ff375f]"
            onClick={onRemove}
            type="button"
          >
            移除
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[0.8125rem] font-medium text-[#636366]">獎勵名稱</span>
          <input
            className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
            onChange={(event) => onChange({ ...tier, title: event.target.value })}
            placeholder="例如：夏威夷五日遊"
            value={tier.title}
          />
        </label>

        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[0.8125rem] font-medium text-[#636366]">條件類型</span>
          <select
            className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
            onChange={(event) =>
              onChange({ ...tier, conditionType: event.target.value as PromotionConditionType })
            }
            value={tier.conditionType}
          >
            {Object.entries(CONDITION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {tier.conditionType === "consecutive_monthly_vp" ? (
          <>
            <label className="block space-y-1">
              <span className="text-[0.8125rem] font-medium text-[#636366]">起始月</span>
              <input
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
                onChange={(event) => onChange({ ...tier, startMonth: event.target.value })}
                type="month"
                value={tier.startMonth ?? ""}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[0.8125rem] font-medium text-[#636366]">結束月</span>
              <input
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
                onChange={(event) => onChange({ ...tier, endMonth: event.target.value })}
                type="month"
                value={tier.endMonth ?? ""}
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[0.8125rem] font-medium text-[#636366]">每月 VP 門檻</span>
              <input
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
                min={0}
                onChange={(event) =>
                  onChange({ ...tier, vpTarget: Number(event.target.value) || 0 })
                }
                type="number"
                value={tier.vpTarget ?? 3500}
              />
            </label>
          </>
        ) : null}

        {tier.conditionType === "single_month_vp" ? (
          <>
            <label className="block space-y-1">
              <span className="text-[0.8125rem] font-medium text-[#636366]">目標月</span>
              <input
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
                onChange={(event) => onChange({ ...tier, targetMonth: event.target.value })}
                type="month"
                value={tier.targetMonth ?? ""}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[0.8125rem] font-medium text-[#636366]">VP 門檻</span>
              <input
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
                min={0}
                onChange={(event) =>
                  onChange({ ...tier, vpTarget: Number(event.target.value) || 0 })
                }
                type="number"
                value={tier.vpTarget ?? 0}
              />
            </label>
          </>
        ) : null}

        {tier.conditionType === "custom" ? (
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-[0.8125rem] font-medium text-[#636366]">條件說明</span>
            <textarea
              className="min-h-[4rem] w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
              onChange={(event) => onChange({ ...tier, customCondition: event.target.value })}
              placeholder="例如：連續三個月各完成 2 場 MAP 會議"
              value={tier.customCondition ?? ""}
            />
          </label>
        ) : null}

        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[0.8125rem] font-medium text-[#636366]">獎勵內容</span>
          <input
            className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
            onChange={(event) => onChange({ ...tier, rewardTitle: event.target.value })}
            placeholder="例如：免費旅遊、現金獎金"
            value={tier.rewardTitle}
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[0.8125rem] font-medium text-[#636366]">獎勵補充（選填）</span>
          <input
            className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5 text-[0.9375rem]"
            onChange={(event) => onChange({ ...tier, rewardDescription: event.target.value })}
            value={tier.rewardDescription ?? ""}
          />
        </label>
      </div>
    </div>
  );
}

export default function PromotionCenterPage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(todayISODate());
  const [endDate, setEndDate] = useState(todayISODate());
  const [tiers, setTiers] = useState<PromotionTier[]>([emptyTier(1)]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const viewer = createMemberRepository(storage).getById(resolveAuthenticatedMemberId(storage));
    setViewerId(viewer?.id ?? "");
    setCanManage(canManagePromotions(viewer));
    setCampaigns(loadOrganizationPromotions(storage));
  }, [storage]);

  useEffect(() => {
    queueMicrotask(refresh);
  }, [refresh]);

  const monthlyView = useMemo(() => {
    if (!viewerId) {
      return null;
    }
    return buildMemberMonthlyPromotions({
      viewerMemberId: viewerId,
      members: loadAllMembers(storage),
      campaigns,
      referenceDate: todayISODate(),
    });
  }, [campaigns, storage, viewerId]);

  const myPublishedCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.createdByMemberId === viewerId),
    [campaigns, viewerId],
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!canManage) {
      setError("僅推廣組、富豪組、總裁組可新增促銷");
      return;
    }

    if (!title.trim()) {
      setError("請輸入促銷名稱");
      return;
    }

    if (tiers.some((tier) => !tier.rewardTitle.trim())) {
      setError("每重獎勵都需填寫獎勵內容");
      return;
    }

    try {
      const created = createPromotionRepository(storage).create({
        organizationId: APP_IDS.organizationId,
        createdByMemberId: resolveAuthenticatedMemberId(storage),
        title: title.trim(),
        description: description.trim() || undefined,
        startDate,
        endDate,
        tiers,
      });
      setTitle("");
      setDescription("");
      setTiers([emptyTier(1)]);
      setShowForm(false);
      setSuccessMessage(`已發布，並掛勾 ${created.linkedDownlineCount} 位下線夥伴`);
      refresh();
    } catch {
      setError("儲存失敗");
    }
  }

  return (
    <PageShell
      headerExtra={
        canManage ? (
          <button
            className="shrink-0 rounded-full bg-[#1d1d1f] px-5 py-2.5 text-[0.9375rem] font-semibold text-white"
            onClick={() => setShowForm((current) => !current)}
            type="button"
          >
            {showForm ? "取消" : "新增促銷"}
          </button>
        ) : null
      }
      subtitle="發布後自動掛勾全組織下線 · 推廣組以上可發布"
      title="促銷專欄"
      titleIcon={APP_ICON.hub.promotions}
    >
        {successMessage ? (
          <p className="rounded-2xl bg-[#e8f8ee] px-4 py-3 text-[0.9375rem] font-medium text-[#248a3d]">
            {successMessage}
          </p>
        ) : null}

        {monthlyView ? <MonthlyPromotionsPanel variant="full" view={monthlyView} /> : null}

        {!canManage ? (
          <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
            <p className="text-[0.9375rem] text-[#636366]">
              以上為您本月可參與的促銷。達推廣組、富豪組或總裁組後，可為下線發布新促銷。
            </p>
          </section>
        ) : null}

        {showForm && canManage ? (
          <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
            <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">新增促銷</h2>
            <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">促銷名稱</span>
                <input
                  className="w-full rounded-2xl border border-[var(--brand-border)] px-4 py-3 text-[1rem]"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：2026 夏季衝刺賽"
                  value={title}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">說明（選填）</span>
                <textarea
                  className="min-h-[4rem] w-full rounded-2xl border border-[var(--brand-border)] px-4 py-3 text-[1rem]"
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-[0.875rem] font-medium text-[#636366]">開始日</span>
                  <input
                    className="w-full rounded-2xl border border-[var(--brand-border)] px-4 py-3"
                    onChange={(event) => setStartDate(event.target.value)}
                    type="date"
                    value={startDate}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-[0.875rem] font-medium text-[#636366]">結束日</span>
                  <input
                    className="w-full rounded-2xl border border-[var(--brand-border)] px-4 py-3"
                    onChange={(event) => setEndDate(event.target.value)}
                    type="date"
                    value={endDate}
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">獎勵關卡</p>
                  <button
                    className="text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]"
                    onClick={() =>
                      setTiers((current) => [...current, emptyTier(current.length + 1)])
                    }
                    type="button"
                  >
                    ＋ 加一重
                  </button>
                </div>
                {tiers.map((tier, index) => (
                  <TierEditor
                    key={tier.tierLevel}
                    canRemove={tiers.length > 1}
                    onChange={(nextTier) =>
                      setTiers((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? nextTier : item)),
                      )
                    }
                    onRemove={() =>
                      setTiers((current) =>
                        current
                          .filter((_, itemIndex) => itemIndex !== index)
                          .map((item, itemIndex) => ({ ...item, tierLevel: itemIndex + 1 })),
                      )
                    }
                    tier={tier}
                  />
                ))}
              </div>

              {error ? <p className="text-[0.875rem] text-[#ff375f]">{error}</p> : null}

              <button
                className="w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-4 text-[1rem] font-semibold text-white"
                type="submit"
              >
                發布促銷
              </button>
            </form>
          </section>
        ) : null}

        {canManage && myPublishedCampaigns.length > 0 ? (
          <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
            <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">我發布的促銷</h2>
            <ul className="mt-4 divide-y divide-[var(--brand-border)]">
              {myPublishedCampaigns.map((campaign) => (
                <li key={campaign.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium text-[#1d1d1f]">{campaign.title}</p>
                    <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">
                      {campaign.startDate} ～ {campaign.endDate}
                    </p>
                  </div>
                  <span className="shrink-0 text-[0.8125rem] text-[#636366]">
                    掛勾 {campaign.linkedDownlineCount} 位下線
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
    </PageShell>
  );
}
