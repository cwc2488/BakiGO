"use client";

import Link from "next/link";
import {
  buildPartnerContactActions,
  displayConfirmedText,
  formatRelativeZh,
  QUIZ_PARTNER_STATUS_LABEL,
  toQuizPartnerUiStatus,
} from "@/lib/quiz/partner/quiz-partner-presentation";

export type QuizPartnerLeadCardData = {
  id: string;
  displayName: string;
  createdAt: string;
  status: string;
  whyNow: string;
  realBottleneck: string;
  contactChannel: string | null;
  contactValue: string | null;
  animalLabel: string;
};

const CHIP: Record<string, string> = {
  waiting: "bg-[#c08a98] text-white",
  contacted: "bg-[#f4e6ea] text-[#8a5a66]",
  joined: "bg-[#e8f8ee] text-[#248a3d]",
  declined: "bg-[#f5f5f7] text-[#636366]",
};

export function QuizPartnerLeadCard({
  item,
  onMarkContacted,
  busy,
}: {
  item: QuizPartnerLeadCardData;
  onMarkContacted?: (id: string) => void;
  busy?: boolean;
}) {
  const ui = toQuizPartnerUiStatus(item.status);
  const contact = buildPartnerContactActions(item.contactChannel, item.contactValue);
  return (
    <article className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-4 shadow-[0_8px_32px_rgba(80,40,40,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[1.0625rem] font-semibold text-[#1d1d1f]">{item.displayName}</h2>
          {contact ? (
            <p className="mt-0.5 truncate text-[0.875rem] text-[#636366]">{contact.display}</p>
          ) : null}
          <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">{formatRelativeZh(item.createdAt)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ${CHIP[ui]}`}>
          {QUIZ_PARTNER_STATUS_LABEL[ui]}
        </span>
      </div>
      {item.animalLabel ? (
        <p className="mt-3 text-[0.9375rem] font-medium text-[#1d1d1f]">{item.animalLabel}</p>
      ) : null}
      <p className="mt-3 text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">她現在為什麼想改變</p>
      <p className="mt-1 text-[0.9375rem] leading-6 text-[#1d1d1f]">{displayConfirmedText(item.whyNow)}</p>
      <p className="mt-3 text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">真正卡住的地方</p>
      <p className="mt-1 text-[0.9375rem] leading-6 text-[#636366]">{displayConfirmedText(item.realBottleneck)}</p>
      <div className="mt-4 flex gap-2">
        <Link
          href={`/quiz/21d/${item.id}`}
          className="flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-[#eadfd6] bg-white px-3 text-[0.875rem] font-semibold text-[#1d1d1f]"
        >
          查看詳情
        </Link>
        {ui === "waiting" && onMarkContacted ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMarkContacted(item.id)}
            className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-[#1d1d1f] px-3 text-[0.875rem] font-semibold text-white disabled:opacity-50"
          >
            已聯絡
          </button>
        ) : null}
      </div>
    </article>
  );
}
