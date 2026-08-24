import type { ReactNode } from "react";
import { QuizPartnerLeadCard } from "@/components/quiz/QuizPartnerLeadCard";
import { QuizPartnerSharePanel } from "@/components/quiz/QuizPartnerSharePanel";
import { QuizPartnerPerformancePanel } from "@/components/quiz/QuizPartnerPerformancePanel";
import {
  QUIZ_PARTNER_EMPTY_RATE,
  QUIZ_PARTNER_STATUS_LABEL,
} from "@/lib/quiz/partner/quiz-partner-presentation";
import { QUIZ_PARTNER_PREVIEW_FIXTURES } from "@/lib/quiz/partner/quiz-partner-fixtures";

export function QuizPartnerPreviewStories({ shot }: { shot: string }) {
  const { waiting, contacted, joined, emptyFunnel, share } = QUIZ_PARTNER_PREVIEW_FIXTURES;

  if (shot === "partner-leads-empty") {
    return (
      <PreviewShell title="心理測驗" tab="21 天名單">
        <p className="text-[0.9375rem] leading-7 text-[#86868b]">
          還沒有人想了解 21 天。先把心理測驗分享出去。
        </p>
      </PreviewShell>
    );
  }

  if (shot === "partner-share") {
    return (
      <PreviewShell title="心理測驗" tab="我的分享">
        <QuizPartnerSharePanel display={share.display} href={share.href} shareCode={share.shareCode} />
      </PreviewShell>
    );
  }

  if (shot === "partner-performance") {
    return (
      <PreviewShell title="心理測驗" tab="我的成效">
        <QuizPartnerPerformancePanel funnel={emptyFunnel} onRange={() => undefined} range="month" />
        <p className="sr-only">{QUIZ_PARTNER_EMPTY_RATE}</p>
      </PreviewShell>
    );
  }

  if (shot === "partner-lead-detail" || shot === "partner-contacted" || shot === "partner-closed") {
    const item = shot === "partner-closed" ? joined : shot === "partner-contacted" ? contacted : waiting;
    const ui = shot === "partner-closed" ? "joined" : shot === "partner-contacted" ? "contacted" : "waiting";
    return (
      <PreviewShell title={item.displayName} tab="詳情">
        <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
          <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">這個人</p>
          <h2 className="mt-1 text-[1.25rem] font-semibold">{item.displayName}</h2>
          <p className="mt-1">{item.animalLabel}</p>
          <p className="mt-2 text-[0.8125rem] text-[#86868b]">
            Instagram @xiaomei.life · {QUIZ_PARTNER_STATUS_LABEL[ui]} · 心理測驗
          </p>
        </section>
        <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
          <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">AI 已經幫你了解的事</p>
          <p className="mt-3 text-[0.9375rem] leading-7">{item.whyNow}</p>
          <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">{item.realBottleneck}</p>
        </section>
        {ui === "waiting" ? (
          <button type="button" className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] font-semibold text-white">
            標記已聯絡
          </button>
        ) : null}
        {ui === "contacted" ? (
          <div className="space-y-2">
            <button type="button" className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] font-semibold text-white">
              已成交
            </button>
            <button type="button" className="min-h-12 w-full rounded-2xl border border-[#eadfd6] font-semibold">
              未成交
            </button>
          </div>
        ) : null}
        {ui === "joined" ? (
          <div className="space-y-2">
            <p className="rounded-2xl bg-[#e8f8ee] py-3 text-center font-semibold text-[#248a3d]">成交</p>
            <p className="text-center text-[0.8125rem] leading-6 text-[#636366]">
              成交後，請建立顧客並啟動 21 天體驗
            </p>
            <button type="button" className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] font-semibold text-white">
              啟動 21 天體驗
            </button>
          </div>
        ) : null}
      </PreviewShell>
    );
  }

  if (shot === "partner-leads") {
    return (
      <PreviewShell title="心理測驗" tab="21 天名單">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-[#c08a98] px-3 py-3 text-center text-white">
            <p className="text-[0.75rem] text-white/90">待聯絡</p>
            <p className="mt-1 text-[1.375rem] font-semibold">1</p>
          </div>
          <div className="rounded-2xl bg-[#fffdf9] px-3 py-3 text-center ring-1 ring-[#eadfd6]">
            <p className="text-[0.75rem] text-[#86868b]">已聯絡</p>
            <p className="mt-1 text-[1.375rem] font-semibold">1</p>
          </div>
          <div className="rounded-2xl bg-[#fffdf9] px-3 py-3 text-center ring-1 ring-[#eadfd6]">
            <p className="text-[0.75rem] text-[#86868b]">已成交</p>
            <p className="mt-1 text-[1.375rem] font-semibold">1</p>
          </div>
        </div>
        <QuizPartnerLeadCard item={waiting} onMarkContacted={() => undefined} />
        <QuizPartnerLeadCard item={contacted} />
      </PreviewShell>
    );
  }

  if (shot === "start-21d-confirm") {
    return (
      <PreviewShell title="啟動 21 天體驗" tab="21 天體驗">
        <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
          <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">21 天體驗</p>
          <h2 className="mt-1 text-[1.25rem] font-semibold">顧客：小美</h2>
          <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">21 天從顧客拿到產品的隔天開始。</p>
          <dl className="mt-5 space-y-3 text-[0.9375rem] leading-7">
            <div>
              <dt className="text-[#86868b]">拿到產品</dt>
              <dd className="font-semibold">8 月 17 日</dd>
            </div>
            <div>
              <dt className="text-[#86868b]">開始陪跑</dt>
              <dd className="font-semibold">8 月 18 日</dd>
            </div>
            <div>
              <dt className="text-[#86868b]">預計完成</dt>
              <dd className="font-semibold">9 月 7 日</dd>
            </div>
          </dl>
        </section>
        <button type="button" className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] font-semibold text-white">
          啟動 21 天體驗
        </button>
      </PreviewShell>
    );
  }

  if (shot === "start-21d-success") {
    return (
      <PreviewShell title="21 天體驗" tab="21 天體驗">
        <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
          <p className="text-[1.125rem] font-semibold">21 天體驗已啟動</p>
          <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">
            Day 1：8/18
            <br />
            Day 21：9/7
          </p>
        </section>
        <button type="button" className="min-h-12 w-full rounded-2xl bg-[#1d1d1f] font-semibold text-white">
          查看陪跑
        </button>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell title="心理測驗" tab="21 天名單">
      <QuizPartnerLeadCard item={waiting} />
    </PreviewShell>
  );
}

function PreviewShell({ title, tab, children }: { title: string; tab: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#faf6f1] px-4 py-8">
      <div className="mx-auto flex w-full max-w-[390px] flex-col gap-4">
        <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">{tab}</p>
        <h1 className="text-[1.5rem] font-semibold text-[#1d1d1f]">{title}</h1>
        {children}
      </div>
    </div>
  );
}
