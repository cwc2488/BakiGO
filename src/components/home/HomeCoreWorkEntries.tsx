import { IconConsultation, IconQuizHub } from "@/components/ui/BrandIcons";
import { HomeFeatureEntryCard } from "@/components/home/HomeFeatureEntryCard";

export function HomeCoreWorkEntries() {
  return (
    <section className="home-section space-y-3">
      <HomeFeatureEntryCard
        className="border border-[#f0d4dc] bg-[linear-gradient(135deg,#fff8fa_0%,#ffffff_100%)] hover:border-[#e8c4cf]"
        cta="開始使用 →"
        description="用有趣的測驗開啟話題，快速了解對方真正的需求。"
        eyebrow="破冰工具"
        eyebrowClassName="text-[#c08a98]"
        href="/quiz/hub"
        icon={
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff4f7] text-[#c08a98]">
            <IconQuizHub size={22} />
          </span>
        }
        title="破冰測驗"
      />
      <HomeFeatureEntryCard
        className="border border-[#c8e6d0] bg-[linear-gradient(135deg,#f0faf3_0%,#ffffff_100%)] hover:border-[#b8ddc8]"
        cta="開始諮詢 →"
        description="跟著流程一步一步完成專業諮詢"
        eyebrow="專業諮詢"
        eyebrowClassName="text-[#248a3d]"
        href="/consultation/new"
        icon={
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f8ee] text-[#248a3d]">
            <IconConsultation size={22} />
          </span>
        }
        title="引導式諮詢"
      />
    </section>
  );
}
