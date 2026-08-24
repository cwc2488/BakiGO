import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import { RESET_ANIMAL_COPY } from "@/lib/analysis/reset/reset-animals";

/** CHARACTER-01 official artwork. Visual only — does not change scoring or taxonomy. */
export type ResetAnimalAsset = {
  code: PersonalityType;
  name: string;
  image: string;
  accent: string;
  softAccent: string;
  alt: string;
};

export const RESET_ANIMAL_ASSETS: Record<PersonalityType, ResetAnimalAsset> = {
  A: {
    code: "A",
    name: RESET_ANIMAL_COPY.A.animalName,
    image: "/reset/characters/A.png",
    accent: "#B85C72",
    softAccent: "#F4C7C3",
    alt: "療癒胖象",
  },
  B: {
    code: "B",
    name: RESET_ANIMAL_COPY.B.animalName,
    image: "/reset/characters/B.png",
    accent: "#7A6A98",
    softAccent: "#D8C7E8",
    alt: "明天樹懶",
  },
  C: {
    code: "C",
    name: RESET_ANIMAL_COPY.C.animalName,
    image: "/reset/characters/C.png",
    accent: "#C45C5C",
    softAccent: "#F5B8B0",
    alt: "暴衝兔",
  },
  D: {
    code: "D",
    name: RESET_ANIMAL_COPY.D.animalName,
    image: "/reset/characters/D.png",
    accent: "#C4A05A",
    softAccent: "#F5E2B8",
    alt: "跑輪倉鼠",
  },
  E: {
    code: "E",
    name: RESET_ANIMAL_COPY.E.animalName,
    image: "/reset/characters/E.png",
    accent: "#6E6A8C",
    softAccent: "#C9C4E0",
    alt: "熬夜熊貓",
  },
  F: {
    code: "F",
    name: RESET_ANIMAL_COPY.F.animalName,
    image: "/reset/characters/F.png",
    accent: "#7A8F68",
    softAccent: "#CDDCCF",
    alt: "突破獵豹",
  },
};

export const RESET_ANIMAL_ASSET_ORDER: PersonalityType[] = ["A", "B", "C", "D", "E", "F"];

export function resetAnimalAsset(code: PersonalityType): ResetAnimalAsset {
  return RESET_ANIMAL_ASSETS[code];
}

/** ART-01/02 CSS tokens. Wash stays local to presentation. */
export type ResetCharacterTheme = {
  type: PersonalityType;
  accent: string;
  accentDeep: string;
  wash: string;
};

export const RESET_CHARACTER_THEME: Record<PersonalityType, ResetCharacterTheme> = {
  A: { type: "A", accent: RESET_ANIMAL_ASSETS.A.softAccent, accentDeep: RESET_ANIMAL_ASSETS.A.accent, wash: "#FBE7E2" },
  B: { type: "B", accent: RESET_ANIMAL_ASSETS.B.softAccent, accentDeep: RESET_ANIMAL_ASSETS.B.accent, wash: "#EFE8F6" },
  C: { type: "C", accent: RESET_ANIMAL_ASSETS.C.softAccent, accentDeep: RESET_ANIMAL_ASSETS.C.accent, wash: "#FBE4DE" },
  D: { type: "D", accent: RESET_ANIMAL_ASSETS.D.softAccent, accentDeep: RESET_ANIMAL_ASSETS.D.accent, wash: "#FBF3DE" },
  E: { type: "E", accent: RESET_ANIMAL_ASSETS.E.softAccent, accentDeep: RESET_ANIMAL_ASSETS.E.accent, wash: "#E8E6F2" },
  F: { type: "F", accent: RESET_ANIMAL_ASSETS.F.softAccent, accentDeep: RESET_ANIMAL_ASSETS.F.accent, wash: "#E7F0E8" },
};
