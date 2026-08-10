import type { PersonalityType } from "./types";

export type CharacterAsset = {
  type: PersonalityType;
  /** Primary hero illustration for result / share screens. */
  heroSrc: string;
  heroAlt: string;
  /** Compact thumbnail for secondary personality badge. */
  thumbSrc: string;
  /** Scene gradient stops for the character card background. */
  sceneGradient: readonly [string, string, string];
  sceneGlow: string;
};

export const CHARACTER_ASSETS: Record<PersonalityType, CharacterAsset> = {
  A: {
    type: "A",
    heroSrc: "/quiz/fat-loss/characters/a-healing-elephant.svg",
    thumbSrc: "/quiz/fat-loss/characters/a-healing-elephant-thumb.svg",
    heroAlt: "療癒胖象 — 快樂補償型減脂卡關人格",
    sceneGradient: ["#fde8ef", "#f8b4c4", "#fff8f2"],
    sceneGlow: "rgba(248, 180, 196, 0.45)",
  },
  B: {
    type: "B",
    heroSrc: "/quiz/fat-loss/characters/b-tomorrow-sloth.svg",
    thumbSrc: "/quiz/fat-loss/characters/b-tomorrow-sloth-thumb.svg",
    heroAlt: "明天樹懶 — 明天再開始型減脂卡關人格",
    sceneGradient: ["#f5efe4", "#d4c4a8", "#fff8f2"],
    sceneGlow: "rgba(212, 196, 168, 0.45)",
  },
  C: {
    type: "C",
    heroSrc: "/quiz/fat-loss/characters/c-sprint-rabbit.svg",
    thumbSrc: "/quiz/fat-loss/characters/c-sprint-rabbit-thumb.svg",
    heroAlt: "暴衝兔 — 三分鐘熱度型減脂卡關人格",
    sceneGradient: ["#ffece8", "#ffb8a8", "#fff8f2"],
    sceneGlow: "rgba(255, 184, 168, 0.45)",
  },
  D: {
    type: "D",
    heroSrc: "/quiz/fat-loss/characters/d-wheel-hamster.svg",
    thumbSrc: "/quiz/fat-loss/characters/d-wheel-hamster-thumb.svg",
    heroAlt: "跑輪倉鼠 — 努力錯方向型減脂卡關人格",
    sceneGradient: ["#f0ebfa", "#c9b8f0", "#fff8f2"],
    sceneGlow: "rgba(201, 184, 240, 0.45)",
  },
  E: {
    type: "E",
    heroSrc: "/quiz/fat-loss/characters/e-night-panda.svg",
    thumbSrc: "/quiz/fat-loss/characters/e-night-panda-thumb.svg",
    heroAlt: "熬夜熊貓 — 生活失控型減脂卡關人格",
    sceneGradient: ["#e8f2fa", "#b8d4f0", "#fff8f2"],
    sceneGlow: "rgba(184, 212, 240, 0.45)",
  },
  F: {
    type: "F",
    heroSrc: "/quiz/fat-loss/characters/f-breakthrough-leopard.svg",
    thumbSrc: "/quiz/fat-loss/characters/f-breakthrough-leopard-thumb.svg",
    heroAlt: "突破獵豹 — 差臨門一腳型減脂卡關人格",
    sceneGradient: ["#faf3dc", "#f0d48c", "#fff8f2"],
    sceneGlow: "rgba(240, 212, 140, 0.45)",
  },
};

export function getCharacterAsset(type: PersonalityType): CharacterAsset {
  return CHARACTER_ASSETS[type];
}
