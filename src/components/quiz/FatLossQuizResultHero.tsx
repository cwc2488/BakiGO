"use client";

import type { PersonalityProfile } from "@/lib/quiz/fat-loss/types";
import { FatLossQuizCharacterImage } from "@/components/quiz/FatLossQuizCharacterImage";

type FatLossQuizResultHeroProps = {
  respondentName: string;
  primary: PersonalityProfile;
  secondary: PersonalityProfile;
};

export function FatLossQuizResultHero({
  respondentName,
  primary,
  secondary,
}: FatLossQuizResultHeroProps) {
  return (
    <section
      id="share-card"
      className="overflow-hidden rounded-[2rem] border border-[#eadfd6] bg-white/90 shadow-[0_20px_56px_rgba(47,38,34,0.08)]"
    >
      <div className="px-5 pb-6 pt-5 text-center">
        <p className="text-[0.82rem] font-medium tracking-[0.08em] text-[#c08a98]">
          {respondentName ? `${respondentName} · ` : ""}你的減脂卡關人格是
        </p>

        <div className="mt-4">
          <FatLossQuizCharacterImage type={primary.type} variant="hero" priority />
        </div>

        <div className="mt-5 space-y-2">
          <h1 className="text-[1.75rem] font-semibold leading-tight text-[#2f2622]">
            {primary.animalName}
          </h1>
          <p className="text-sm font-medium tracking-wide text-[#a0897d]">{primary.tagline}</p>
          <p className="mx-auto mt-3 max-w-[19rem] text-[1rem] leading-7 text-[#5f4f47]">
            {primary.headline}
          </p>
        </div>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#eadfd6] bg-[#fff8f2] px-4 py-2">
          <FatLossQuizCharacterImage type={secondary.type} variant="thumb" />
          <p className="text-sm text-[#6f5f57]">
            次人格傾向 · <span className="font-medium text-[#2f2622]">{secondary.animalName}</span>
          </p>
        </div>

        <p className="mt-5 text-[0.72rem] tracking-[0.06em] text-[#b8a79d]">
          Baki GO · 你是哪一種瘦不下來的人？
        </p>
      </div>
    </section>
  );
}
