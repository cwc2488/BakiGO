"use client";

import { useMemo, useState } from "react";
import {
  deriveExperience21dSchedule,
  formatExperience21dShortDate,
  formatExperience21dZhDate,
  isIsoDate,
} from "@/lib/coaching/experience-21d";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { QUIZ_PARTNER_PREVIEW_FIXTURES } from "@/lib/quiz/partner/quiz-partner-fixtures";
import { QUIZ_PARTNER_STATUS_LABEL } from "@/lib/quiz/partner/quiz-partner-presentation";

type Step =
  | "list"
  | "contacted"
  | "joined"
  | "needs-customer"
  | "create-customer"
  | "confirm"
  | "success"
  | "coaching"
  | "already-active";

/**
 * Preview-only UX walk for 21D-START-01.
 * Local fixture state only. Does not call member APIs or write customers / enrollments.
 */
export function Quiz21dStartPreviewWalk() {
  const lead = QUIZ_PARTNER_PREVIEW_FIXTURES.contacted;
  const [step, setStep] = useState<Step>("list");
  const [confirmJoined, setConfirmJoined] = useState(false);
  const [name, setName] = useState(lead.displayName);
  const [phone, setPhone] = useState("");
  const [lineId, setLineId] = useState(lead.contactValue ?? "");
  const [productReceivedDate, setProductReceivedDate] = useState(coachingTodayLogDate());
  const [started, setStarted] = useState(false);

  const schedule = useMemo(() => {
    if (!isIsoDate(productReceivedDate)) return null;
    try {
      return deriveExperience21dSchedule(productReceivedDate);
    } catch {
      return null;
    }
  }, [productReceivedDate]);

  return (
    <div className="min-h-dvh bg-[#faf6f1] px-4 py-8">
      <div className="mx-auto flex w-full max-w-[390px] flex-col gap-4">
        <p className="rounded-2xl bg-[#fff4e5] px-4 py-3 text-[0.8125rem] leading-6 text-[#8a5a66]">
          Preview 驗收流程，不會寫入顧客、陪跑或 21 天名單。正式啟動仍要登入後走真實 API。
        </p>

        {step === "list" ? (
          <WalkShell title="心理測驗" tab="21 天名單">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="待聯絡" value="1" primary />
              <Stat label="已聯絡" value="1" />
              <Stat label="已成交" value="0" />
            </div>
            <LeadPreview
              name={QUIZ_PARTNER_PREVIEW_FIXTURES.waiting.displayName}
              status="waiting"
              animal={QUIZ_PARTNER_PREVIEW_FIXTURES.waiting.animalLabel}
            />
            <LeadPreview
              name={lead.displayName}
              status="contacted"
              animal={lead.animalLabel}
              actionLabel="查看詳情"
              onAction={() => setStep("contacted")}
            />
          </WalkShell>
        ) : null}

        {step === "contacted" ? (
          <WalkShell title={lead.displayName} tab="詳情" onBack={() => setStep("list")}>
            <LeadDetail name={lead.displayName} status="contacted" animal={lead.animalLabel} />
            <button
              type="button"
              onClick={() => setConfirmJoined(true)}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
            >
              已成交
            </button>
            <button
              type="button"
              className="min-h-12 w-full rounded-2xl border border-[#eadfd6] text-[0.9375rem] font-semibold"
            >
              未成交
            </button>
            {confirmJoined ? (
              <ConfirmSheet
                title="確定這位顧客已完成 21 天體驗成交？"
                body="成交只代表這筆名單已確認，不會自動建立顧客或開始陪跑。"
                confirmLabel="確認成交"
                onCancel={() => setConfirmJoined(false)}
                onConfirm={() => {
                  setConfirmJoined(false);
                  setStep("joined");
                }}
              />
            ) : null}
          </WalkShell>
        ) : null}

        {step === "joined" ? (
          <WalkShell title={lead.displayName} tab="詳情" onBack={() => setStep("list")}>
            <LeadDetail name={lead.displayName} status="joined" animal={lead.animalLabel} />
            <p className="rounded-2xl bg-[#e8f8ee] py-3 text-center text-[0.9375rem] font-semibold text-[#248a3d]">
              成交
            </p>
            <p className="text-center text-[0.8125rem] leading-6 text-[#636366]">
              成交後，請建立顧客並啟動 21 天體驗
            </p>
            <button
              type="button"
              onClick={() => setStep("needs-customer")}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
            >
              啟動 21 天體驗
            </button>
          </WalkShell>
        ) : null}

        {step === "needs-customer" ? (
          <WalkShell title="啟動 21 天體驗" tab="21 天體驗" onBack={() => setStep("joined")}>
            <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
              <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">成交後，請建立顧客並啟動 21 天體驗</p>
              <p className="mt-2 text-[0.9375rem] leading-7 text-[#636366]">
                成交只代表這筆名單已確認。要開始陪跑，請先建立顧客。
              </p>
            </section>
            <button
              type="button"
              onClick={() => setStep("create-customer")}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
            >
              建立顧客
            </button>
            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="min-h-12 w-full rounded-2xl border border-[#eadfd6] text-[0.9375rem] font-semibold"
            >
              選擇已有顧客
            </button>
          </WalkShell>
        ) : null}

        {step === "create-customer" ? (
          <WalkShell title="顧客列表" tab="新增顧客" onBack={() => setStep("needs-customer")}>
            <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
              <p className="text-[0.8125rem] leading-6 text-[#86868b]">沿用既有新增顧客，不是第二套顧客流程。Instagram 不會寫進顧客資料。</p>
              <label className="mt-4 block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">姓名</span>
                <input
                  className="min-h-12 w-full rounded-2xl border border-[#eadfd6] bg-white px-4 text-[1rem]"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="mt-4 block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">電話</span>
                <input
                  className="min-h-12 w-full rounded-2xl border border-[#eadfd6] bg-white px-4 text-[1rem]"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
              <label className="mt-4 block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">LINE ID</span>
                <input
                  className="min-h-12 w-full rounded-2xl border border-[#eadfd6] bg-white px-4 text-[1rem]"
                  value={lineId}
                  onChange={(event) => setLineId(event.target.value)}
                />
              </label>
            </section>
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => setStep("confirm")}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white disabled:opacity-50"
            >
              儲存顧客
            </button>
          </WalkShell>
        ) : null}

        {step === "confirm" ? (
          <WalkShell title="啟動 21 天體驗" tab="21 天體驗" onBack={() => setStep("needs-customer")}>
            <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
              <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">21 天體驗</p>
              <h2 className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">顧客：{name || lead.displayName}</h2>
              <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">21 天從顧客拿到產品的隔天開始。</p>
              <label className="mt-5 block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">顧客拿到產品的日期</span>
                <input
                  className="min-h-12 w-full rounded-2xl border border-[#eadfd6] bg-white px-4 text-[1rem]"
                  type="date"
                  value={productReceivedDate}
                  onChange={(event) => setProductReceivedDate(event.target.value)}
                />
              </label>
              {schedule ? (
                <dl className="mt-5 space-y-3 text-[0.9375rem] leading-7">
                  <div>
                    <dt className="text-[#86868b]">拿到產品</dt>
                    <dd className="font-semibold text-[#1d1d1f]">{formatExperience21dZhDate(schedule.productReceivedDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#86868b]">開始陪跑</dt>
                    <dd className="font-semibold text-[#1d1d1f]">{formatExperience21dZhDate(schedule.startDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#86868b]">預計完成</dt>
                    <dd className="font-semibold text-[#1d1d1f]">{formatExperience21dZhDate(schedule.plannedEndAt)}</dd>
                  </div>
                </dl>
              ) : null}
            </section>
            <button
              type="button"
              disabled={!schedule}
              onClick={() => {
                if (started) {
                  setStep("already-active");
                  return;
                }
                setStarted(true);
                setStep("success");
              }}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white disabled:opacity-50"
            >
              啟動 21 天體驗
            </button>
          </WalkShell>
        ) : null}

        {step === "success" && schedule ? (
          <WalkShell title="21 天體驗" tab="21 天體驗">
            <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
              <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">21 天體驗已啟動</p>
              <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">
                Day 1：{formatExperience21dShortDate(schedule.startDate)}
                <br />
                Day 21：{formatExperience21dShortDate(schedule.plannedEndAt)}
              </p>
            </section>
            <button
              type="button"
              onClick={() => setStep("coaching")}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
            >
              查看陪跑
            </button>
          </WalkShell>
        ) : null}

        {step === "coaching" && schedule ? (
          <WalkShell title={`${name || lead.displayName}的陪跑`} tab="既有 Coaching" onBack={() => setStep("success")}>
            <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
              <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">21 天體驗</p>
              <p className="mt-2 text-[1.125rem] font-semibold text-[#1d1d1f]">進入既有 Coaching 陪跑</p>
              <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">
                Day 1：{formatExperience21dShortDate(schedule.startDate)}
                <br />
                Day 21：{formatExperience21dShortDate(schedule.plannedEndAt)}
              </p>
              <p className="mt-3 text-[0.8125rem] leading-6 text-[#86868b]">
                這不是第二套陪跑。正式啟動後會打開既有 `/coaching/[enrollmentId]`。
              </p>
            </section>
            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="min-h-12 w-full rounded-2xl border border-[#eadfd6] text-[0.9375rem] font-semibold"
            >
              再啟動一次（應被擋住）
            </button>
          </WalkShell>
        ) : null}

        {step === "already-active" && schedule ? (
          <WalkShell title="啟動 21 天體驗" tab="21 天體驗" onBack={() => setStep("coaching")}>
            <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
              <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">這位顧客目前已在 21 天體驗中</p>
              <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">
                Day 1：{formatExperience21dShortDate(schedule.startDate)}
                <br />
                Day 21：{formatExperience21dShortDate(schedule.plannedEndAt)}
              </p>
            </section>
            <button
              type="button"
              onClick={() => setStep("coaching")}
              className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
            >
              查看陪跑
            </button>
          </WalkShell>
        ) : null}
      </div>
    </div>
  );
}

function WalkShell({
  title,
  tab,
  onBack,
  children,
}: {
  title: string;
  tab: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {onBack ? (
        <button type="button" onClick={onBack} className="self-start text-[0.875rem] text-[#8a5a66]">
          返回
        </button>
      ) : null}
      <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">{tab}</p>
      <h1 className="text-[1.5rem] font-semibold text-[#1d1d1f]">{title}</h1>
      {children}
    </>
  );
}

function Stat({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div
      className={`rounded-2xl px-3 py-3 text-center ${
        primary ? "bg-[#c08a98] text-white" : "bg-[#fffdf9] ring-1 ring-[#eadfd6]"
      }`}
    >
      <p className={`text-[0.75rem] ${primary ? "text-white/90" : "text-[#86868b]"}`}>{label}</p>
      <p className="mt-1 text-[1.375rem] font-semibold">{value}</p>
    </div>
  );
}

function LeadPreview({
  name,
  status,
  animal,
  actionLabel,
  onAction,
}: {
  name: string;
  status: "waiting" | "contacted" | "joined";
  animal: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <article className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{name}</h2>
        <span className="rounded-full bg-[#f4e6ea] px-2.5 py-1 text-[0.75rem] font-semibold text-[#8a5a66]">
          {QUIZ_PARTNER_STATUS_LABEL[status]}
        </span>
      </div>
      <p className="mt-3 text-[0.9375rem] font-medium">{animal}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-2xl border border-[#eadfd6] bg-white text-[0.875rem] font-semibold"
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

function LeadDetail({
  name,
  status,
  animal,
}: {
  name: string;
  status: "contacted" | "joined";
  animal: string;
}) {
  return (
    <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
      <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">這個人</p>
      <h2 className="mt-1 text-[1.25rem] font-semibold">{name}</h2>
      <p className="mt-1">{animal}</p>
      <p className="mt-2 text-[0.8125rem] text-[#86868b]">{QUIZ_PARTNER_STATUS_LABEL[status]} · 心理測驗</p>
    </section>
  );
}

function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 md:items-center">
      <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-5">
        <p className="text-[1rem] font-semibold leading-7 text-[#1d1d1f]">{title}</p>
        <p className="mt-2 text-[0.9375rem] leading-7 text-[#636366]">{body}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-2xl border border-[#eadfd6] text-[0.875rem] font-semibold"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 flex-1 rounded-2xl bg-[#1d1d1f] text-[0.875rem] font-semibold text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
