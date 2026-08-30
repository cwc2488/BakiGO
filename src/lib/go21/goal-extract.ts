import {
  GO21_PRIMARY_DIRECTION_LABELS,
  type Go21ExtractedEvent,
  type Go21GoalRefinementProposal,
  type Go21PrimaryDirection,
} from "@/types/go21";
import { isGo21PrimaryDirection } from "@/lib/go21/goal";

/**
 * Distinguish current measured weight vs desired target weight.
 * Never treat "我最近胖到 70" as target = 70.
 */
export function extractCurrentAndTargetWeightKg(text: string): {
  currentWeightKg: number | null;
  targetWeightKg: number | null;
} {
  const scrubbed = text
    .replace(/\d+\s*(?:分鐘|分鍾|min)/gi, " ")
    .replace(/\d+\s*(?:ml|ML|毫升)/g, " ")
    .replace(/\d+\s*步/g, " ");

  let currentWeightKg: number | null = null;
  let targetWeightKg: number | null = null;

  // Explicit pairs: 現在70…希望21天先到68 / 希望先到68 / 目標68
  // Do NOT capture the "21" in 「21天」 as a weight target.
  const pair = scrubbed.match(
    /(?:現在|目前|今天量[到了]?|量到)\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|KG|公斤)?[^。！？\n]{0,48}?(?:希望|想要?)[^。！？\n]{0,24}?(?:先)?(?:到|降至?|減到|減至)\s*(\d{2,3}(?:\.\d{1,2})?)/,
  );
  if (pair) {
    const cur = Number(pair[1]);
    const tgt = Number(pair[2]);
    if (validWeight(cur)) currentWeightKg = cur;
    if (validWeight(tgt)) targetWeightKg = tgt;
    return { currentWeightKg, targetWeightKg };
  }

  const pairAlt = scrubbed.match(
    /(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|KG|公斤)[^。！？\n]{0,48}?(?:希望|想要?)[^。！？\n]{0,24}?(?:先)?(?:到|降至?|減到|減至)\s*(\d{2,3}(?:\.\d{1,2})?)/,
  );
  if (pairAlt) {
    const cur = Number(pairAlt[1]);
    const tgt = Number(pairAlt[2]);
    if (validWeight(cur)) currentWeightKg = cur;
    if (validWeight(tgt)) targetWeightKg = tgt;
    return { currentWeightKg, targetWeightKg };
  }

  const targetOnly = scrubbed.match(
    /(?:目標(?:體重)?|希望[^。！？\n]{0,24}?(?:先)?(?:到|降至?|減到)|想(?:先)?到|先到|降到|減到|先往)\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|KG|公斤)?/,
  );
  if (targetOnly) {
    const tgt = Number(targetOnly[1]);
    if (validWeight(tgt)) targetWeightKg = tgt;
  }

  // Target revision: 「68先不要，69比較實際」
  const revise = scrubbed.match(
    /(\d{2,3}(?:\.\d{1,2})?)\s*(?:先不要|先別|不要了)[^。！？\n]{0,30}?(\d{2,3}(?:\.\d{1,2})?)\s*(?:比較|更)?(?:實際|剛好|可以)/,
  );
  if (revise) {
    const tgt = Number(revise[2]);
    if (validWeight(tgt)) targetWeightKg = tgt;
  }

  // Current measurement — avoid stealing target-only numbers
  if (currentWeightKg == null) {
    const currentMatch = scrubbed.match(
      /(?:現在|目前|今天量[到了]?|量[到了]?|秤[到了]?|體重)\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|KG|公斤)?/,
    );
    if (currentMatch) {
      const cur = Number(currentMatch[1]);
      if (validWeight(cur) && cur !== targetWeightKg) currentWeightKg = cur;
    }
  }

  // 「我最近胖到70」 is current, never target
  const gained = scrubbed.match(/(?:胖到|重到|來到)\s*(\d{2,3}(?:\.\d{1,2})?)/);
  if (gained) {
    const cur = Number(gained[1]);
    if (validWeight(cur)) {
      currentWeightKg = cur;
      // Do not treat as target
    }
  }

  return { currentWeightKg, targetWeightKg };
}

function validWeight(w: number): boolean {
  return Number.isFinite(w) && w >= 35 && w <= 200;
}

/**
 * Detect meaningful goal refinement proposals from free text.
 * Weak inferences → needsConfirmation; never silent overwrite of major goals.
 */
export function detectGo21GoalRefinement(text: string): Go21GoalRefinementProposal | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const weights = extractCurrentAndTargetWeightKg(trimmed);
  const direction = detectDirectionShift(trimmed);
  const personal = detectPersonalGoalShift(trimmed);

  const hasSignal =
    direction != null ||
    Boolean(personal) ||
    weights.targetWeightKg != null ||
    /目標|我想改|比較想|其實我現在覺得/.test(trimmed);

  if (!hasSignal && weights.targetWeightKg == null) return null;

  const explicit =
    /其實|比較想|我想改|目標改|先不要|比較實際|不是最重要|重點是/.test(trimmed) ||
    weights.targetWeightKg != null;

  const confidence: "high" | "medium" | "low" =
    weights.targetWeightKg != null && explicit
      ? "high"
      : personal && explicit
        ? "high"
        : direction && explicit
          ? "medium"
          : "low";

  if (confidence === "low" && !weights.targetWeightKg) return null;

  return {
    personalGoal: personal,
    primaryDirection: direction,
    targetWeightKg: weights.targetWeightKg,
    clearTargetWeight: /體重不是最重要|數字不重要|先不要.*目標/.test(trimmed),
    confidence,
    needsConfirmation: confidence !== "high" || Boolean(personal && personal.length > 12 && !/目標/.test(trimmed)),
  };
}

function detectDirectionShift(text: string): Go21PrimaryDirection | null {
  if (/晚餐|晚上|失控|亂吃|嘴饞/.test(text) && /控制|不要|改善|穩定/.test(text)) {
    return "reduce_chaos_eating";
  }
  if (/習慣|節奏|穩定飲食|規律/.test(text) && /建立|養成|想/.test(text)) {
    return "stable_habits";
  }
  if (/減脂|體態|腰圍|瘦一?點/.test(text)) return "fat_loss_body";
  if (/精神|體力|生活狀態|更有精神/.test(text)) return "energy_lifestyle";
  return null;
}

function detectPersonalGoalShift(text: string): string | null {
  const m = text.match(
    /(?:其實|現在覺得|比較想|我想|希望)([^。！？\n]{4,80}?)(?:[。！？]|$)/,
  );
  if (!m) return null;
  const phrase = m[1]!.trim();
  if (phrase.length < 4) return null;
  // Avoid capturing pure measurement sentences as goal
  if (/^\d/.test(phrase) || /公斤|kg|體重\s*\d/i.test(phrase)) return null;
  return phrase.slice(0, 200);
}

/** Merge weight/target fields into an extracted event (called from extractGo21StructuredEvent). */
export function enrichExtractedEventWithGoalFields(
  base: Go21ExtractedEvent,
  text: string,
): Go21ExtractedEvent {
  const weights = extractCurrentAndTargetWeightKg(text);
  // Prefer explicit current; do not let target overwrite current measurement.
  if (weights.currentWeightKg != null) {
    base.weightKg = weights.currentWeightKg;
  }
  if (weights.targetWeightKg != null) {
    base.targetWeightKg = weights.targetWeightKg;
    base.confidence = "high";
  }
  const refinement = detectGo21GoalRefinement(text);
  if (refinement) {
    base.goalRefinement = refinement;
  }
  return base;
}

export function formatDirectionLabel(direction: Go21PrimaryDirection): string {
  return isGo21PrimaryDirection(direction)
    ? GO21_PRIMARY_DIRECTION_LABELS[direction]
    : GO21_PRIMARY_DIRECTION_LABELS.other;
}
