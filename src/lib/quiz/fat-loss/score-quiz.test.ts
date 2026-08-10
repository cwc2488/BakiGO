import { describe, expect, it } from "vitest";
import { scoreFatLossQuiz, calculateInteractionPriority } from "./score-quiz";

describe("scoreFatLossQuiz", () => {
  it("scores primary and secondary personality types", () => {
    const result = scoreFatLossQuiz({
      "1": "A",
      "2": "A",
      "3": "A",
      "4": "A",
      "5": "B",
      "6": "B",
      "7": "B",
      "8": "B",
      "9": "3",
      "10": ["fitness", "diet"],
      "11": "4",
      "12": "waist",
    });

    expect(result.primaryType).toBe("A");
    expect(result.secondaryType).toBe("B");
    expect(result.urgency).toBe("high");
    expect(result.readiness).toBe("very_high");
    expect(result.actionHistory).toEqual(["fitness", "diet"]);
    expect(result.primaryGoal).toBe("waist");
  });

  it("uses tie breaker questions when scores are equal", () => {
    const result = scoreFatLossQuiz({
      "1": "C",
      "2": "D",
      "3": "C",
      "4": "D",
      "5": "C",
      "6": "D",
      "7": "C",
      "8": "D",
      "9": "2",
      "10": ["none"],
      "11": "2",
      "12": "shape",
    });

    expect(result.primaryType).toBe("C");
    expect(result.secondaryType).toBe("D");
  });

  it("calculates interaction priority bands", () => {
    expect(
      calculateInteractionPriority({ urgency: "very_high", readiness: "very_high", actionCount: 5 }),
    ).toBe("very_high");
    expect(
      calculateInteractionPriority({ urgency: "low", readiness: "low", actionCount: 0 }),
    ).toBe("low");
  });
});
