import { QUIZ_EXPLORE_SEGMENTS } from "@/components/analysis/experience/experience-progress";

export function QuizExploreDots({ step }: { step: number }) {
  const filled = Math.min(Math.max(step, 1), QUIZ_EXPLORE_SEGMENTS);
  return (
    <div
      className="ax-dots"
      role="status"
      aria-label={`AI 探索中，目前第 ${filled} 題，最多大約 ${QUIZ_EXPLORE_SEGMENTS} 題`}
    >
      {Array.from({ length: QUIZ_EXPLORE_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={`ax-dot${i < filled - 1 ? " is-done" : ""}${i === filled - 1 ? " is-now" : ""}`}
          aria-hidden
        />
      ))}
    </div>
  );
}
