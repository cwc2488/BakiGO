import Link from "next/link";
import { IconQuizHub } from "@/components/ui/BrandIcons";

export function IcebreakerQuizHomeCard() {
  return (
    <Link
      className="home-section block rounded-[1.75rem] border border-[#f0d4dc] bg-[linear-gradient(135deg,#fff8fa_0%,#ffffff_100%)] px-5 py-4 shadow-[0_4px_20px_rgba(192,138,152,0.08)] transition-transform duration-200 active:scale-[0.99] hover:border-[#e8c4cf]"
      href="/quiz/hub"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff4f7] text-[#c08a98]">
          <IconQuizHub size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[#c08a98]">
            破冰工具
          </p>
          <h2 className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">破冰測驗</h2>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#86868b]">
            用有趣的測驗開啟話題，快速了解對方真正的需求。
          </p>
          <p className="mt-3 text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]">開始使用 →</p>
        </div>
      </div>
    </Link>
  );
}
