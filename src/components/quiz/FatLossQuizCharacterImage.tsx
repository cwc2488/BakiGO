"use client";

import Image from "next/image";
import { getCharacterAsset } from "@/lib/quiz/fat-loss/character-assets";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";

type FatLossQuizCharacterImageProps = {
  type: PersonalityType;
  variant?: "hero" | "thumb";
  priority?: boolean;
  className?: string;
};

export function FatLossQuizCharacterImage({
  type,
  variant = "hero",
  priority = false,
  className = "",
}: FatLossQuizCharacterImageProps) {
  const asset = getCharacterAsset(type);
  const src = variant === "hero" ? asset.heroSrc : asset.thumbSrc;
  const isHero = variant === "hero";

  if (isHero) {
    return (
      <div
        className={`relative mx-auto w-full max-w-[340px] ${className}`}
        style={{ aspectRatio: "4 / 5" }}
      >
        <div
          className="absolute inset-0 overflow-hidden rounded-[2rem]"
          style={{
            background: `linear-gradient(180deg, ${asset.sceneGradient[0]} 0%, ${asset.sceneGradient[1]} 52%, ${asset.sceneGradient[2]} 100%)`,
            boxShadow: `0 24px 64px ${asset.sceneGlow}`,
          }}
        >
          <div
            className="absolute -right-8 -top-8 h-40 w-40 rounded-full opacity-60 blur-2xl"
            style={{ background: asset.sceneGradient[1] }}
          />
          <div
            className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full opacity-50 blur-3xl"
            style={{ background: asset.sceneGradient[0] }}
          />
        </div>
        <Image
          src={src}
          alt={asset.heroAlt}
          fill
          priority={priority}
          sizes="(max-width: 512px) 92vw, 340px"
          className="absolute inset-0 z-10 object-contain object-bottom px-2 pb-1 drop-shadow-[0_18px_32px_rgba(47,38,34,0.18)]"
        />
      </div>
    );
  }

  return (
    <div className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl ${className}`}>
      <Image
        src={src}
        alt=""
        fill
        sizes="44px"
        aria-hidden
        className="object-cover object-center"
      />
    </div>
  );
}
