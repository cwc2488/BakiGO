import type { PersonalityType } from "./types";

export type CharacterAsset = {
  type: PersonalityType;
  /** Official character illustration (shared by hero and thumb). */
  src: string;
  heroAlt: string;
  /** Scene gradient stops for the character card background. */
  sceneGradient: readonly [string, string, string];
  sceneGlow: string;
};

export const CHARACTER_ASSETS: Record<PersonalityType, CharacterAsset> = {
  A: {
    type: "A",
    src: "/quiz/fat-loss/characters/a-healing-elephant.png",
    heroAlt: "療癒胖象 — 快樂補償型減脂卡關人格",
    sceneGradient: ["#fde8ef", "#f8b4c4", "#fff8f2"],
    sceneGlow: "rgba(248, 180, 196, 0.45)",
  },
  B: {
    type: "B",
    src: "/quiz/fat-loss/characters/b-tomorrow-sloth.png",
    heroAlt: "明天樹懶 — 明天再開始型減脂卡關人格",
    sceneGradient: ["#f5efe4", "#d4c4a8", "#fff8f2"],
    sceneGlow: "rgba(212, 196, 168, 0.45)",
  },
  C: {
    type: "C",
    src: "/quiz/fat-loss/characters/c-sprint-rabbit.png",
    heroAlt: "暴衝兔 — 三分鐘熱度型減脂卡關人格",
    sceneGradient: ["#ffece8", "#ffb8a8", "#fff8f2"],
    sceneGlow: "rgba(255, 184, 168, 0.45)",
  },
  D: {
    type: "D",
    src: "/quiz/fat-loss/characters/d-wheel-hamster.png",
    heroAlt: "跑輪倉鼠 — 努力錯方向型減脂卡關人格",
    sceneGradient: ["#f0ebfa", "#c9b8f0", "#fff8f2"],
    sceneGlow: "rgba(201, 184, 240, 0.45)",
  },
  E: {
    type: "E",
    src: "/quiz/fat-loss/characters/e-night-panda.png",
    heroAlt: "熬夜熊貓 — 生活失控型減脂卡關人格",
    sceneGradient: ["#e8f2fa", "#b8d4f0", "#fff8f2"],
    sceneGlow: "rgba(184, 212, 240, 0.45)",
  },
  F: {
    type: "F",
    src: "/quiz/fat-loss/characters/f-breakthrough-leopard.png",
    heroAlt: "突破獵豹 — 差臨門一腳型減脂卡關人格",
    sceneGradient: ["#faf3dc", "#f0d48c", "#fff8f2"],
    sceneGlow: "rgba(240, 212, 140, 0.45)",
  },
};

export function getCharacterAsset(type: PersonalityType): CharacterAsset {
  return CHARACTER_ASSETS[type];
}
