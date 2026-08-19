import { resetAnimalAsset } from "@/lib/analysis/reset/reset-art";
import type { ResetAnimalCopy } from "@/lib/analysis/reset/reset-animals";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";

export function ResetAnimalVisual({
  animal,
  size = "reveal",
}: {
  animal: ResetAnimalCopy | { type: PersonalityType };
  size?: "reveal" | "chip" | "peek";
}) {
  const asset = resetAnimalAsset(animal.type);
  return (
    <img
      src={asset.image}
      alt={size === "peek" ? "" : asset.alt}
      className={
        size === "chip"
          ? "rx-animal-art rx-animal-art-chip"
          : size === "peek"
            ? "rx-animal-art rx-animal-art-peek"
            : "rx-animal-art rx-animal-art-reveal"
      }
      data-animal={animal.type}
      draggable={false}
    />
  );
}

const QUIZ_CUES = ["heart", "moon", "spark", "clock"] as const;

export function ResetQuizCue({ index, selected }: { index: number; selected: boolean }) {
  if (selected) return <span className="rx-check" aria-hidden />;
  const cue = QUIZ_CUES[index % QUIZ_CUES.length];
  return (
    <span className="rx-choice-cue" data-cue={cue} aria-hidden>
      {cue === "heart" ? (
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path
            d="M8 13.2S2.8 9.6 2.8 6.4A2.7 2.7 0 0 1 8 5.2a2.7 2.7 0 0 1 5.2 1.2C13.2 9.6 8 13.2 8 13.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {cue === "moon" ? (
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path
            d="M10.6 3.2A5.1 5.1 0 1 0 12.8 11 4.2 4.2 0 0 1 10.6 3.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {cue === "spark" ? (
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path
            d="M8 2.2 8.9 6.4 13.2 7.2 8.9 8.1 8 12.4 7.1 8.1 2.8 7.2 7.1 6.4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {cue === "clock" ? (
        <svg viewBox="0 0 16 16" width="16" height="16">
          <circle cx="8" cy="8" r="5.1" fill="none" stroke="currentColor" strokeWidth="1.35" />
          <path d="M8 5.2v3.1l2.1 1.2" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
}
