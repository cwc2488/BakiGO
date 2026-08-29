/**
 * Intention routing for Go21 coach replies.
 * Answer what was asked (memory / menu / meal / goal) — do not collapse
 * every turn into the same generic fat-loss advice.
 */

export type Go21CoachIntent =
  | "memory_food_recall"
  | "memory_goal_recall"
  | "memory_photo_recall"
  | "menu_request"
  | "meal_report"
  | "goal_conflict_plan"
  | "other";

const MEMORY_FOOD_RE =
  /(?:記得|跟你說|告訴過你|跟你講|說過|講過).{0,24}(?:吃|喝)|(?:吃|喝).{0,24}(?:什麼|啥)|我(?:跟你)?說(?:了)?什麼|what\s+(?:did\s+)?i\s+(?:tell|say|eat|ate)|what\s+(?:have\s+)?i\s+(?:told|eaten)|remind\s+me\s+what|你還記得我.{0,12}吃/iu;

const MEMORY_GOAL_RE =
  /(?:記得|說過|講過).{0,20}(?:目標|想改|方向)|我(?:的)?目標(?:是|什麼)|what(?:'s|\s+is)\s+my\s+goal|21\s*天想改什麼/iu;

const MEMORY_PHOTO_RE =
  /剛剛拍|我拍了什麼|剛傳的|那張照片|剛剛.*什麼|照片(?:裡|是)什麼/u;

const MENU_RE =
  /(?:給|推薦|建議|幫).{0,8}(?:菜單|餐單|吃什麼|晚餐吃什麼|午餐吃什麼)|菜單|menu|今天吃什麼好|晚餐怎麼選|給我.*選項/iu;

const GOAL_PLAN_RE =
  /等一下|待會|等等|打算|想吃|準備吃|晚上.*吃|再吃/u;

const HEAVY_FOOD_RE =
  /炸|漢堡|薯條|奶茶|蛋糕|泡麵|炸雞|鹹酥雞|披薩|可樂|雞排|甜甜圈|炸麵|炸物/;

export function detectGo21CoachIntent(input: {
  freeMessage: string | null | undefined;
}): Go21CoachIntent {
  const msg = (input.freeMessage ?? "").trim();
  if (!msg) return "other";
  if (MEMORY_PHOTO_RE.test(msg)) return "memory_photo_recall";
  if (MEMORY_FOOD_RE.test(msg)) return "memory_food_recall";
  if (MEMORY_GOAL_RE.test(msg)) return "memory_goal_recall";
  if (MENU_RE.test(msg)) return "menu_request";
  if (GOAL_PLAN_RE.test(msg) && HEAVY_FOOD_RE.test(msg)) return "goal_conflict_plan";
  if (looksLikeMealReport(msg)) return "meal_report";
  return "other";
}

function looksLikeMealReport(msg: string): boolean {
  if (/[？?]/.test(msg) && /什麼|嗎|呢|why|what|how/i.test(msg)) return false;
  return /(?:吃了|喝了|午餐|晚餐|早餐|宵夜|剛吃|剛剛吃)/.test(msg);
}

export type RecalledFoodItem = {
  label: string;
  source: "turn" | "today_meal" | "vision";
};

/**
 * Collect foods the customer actually reported — never invent.
 */
export function collectReportedFoods(input: {
  recentCustomerTurnContents: string[];
  todayMealNotes: Array<{ slot: string; note: string | null | undefined }>;
  visionSummaries?: Array<{ summary: string; correction: string | null }>;
}): RecalledFoodItem[] {
  const items: RecalledFoodItem[] = [];
  const seen = new Set<string>();

  const push = (label: string, source: RecalledFoodItem["source"]) => {
    const cleaned = cleanFoodLabel(label);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ label: cleaned, source });
  };

  for (const vision of input.visionSummaries ?? []) {
    if (vision.correction?.trim()) push(vision.correction, "vision");
    else if (vision.summary?.trim()) {
      const fromVision = extractFoodFromVisionSummary(vision.summary);
      if (fromVision) push(fromVision, "vision");
    }
  }

  for (const meal of input.todayMealNotes) {
    if (meal.note?.trim()) {
      const foods = extractFoodsFromCustomerText(meal.note);
      for (const f of foods) push(f, "today_meal");
    }
  }

  for (const content of input.recentCustomerTurnContents) {
    // Skip pure recall questions / system blobs when scanning
    if (MEMORY_FOOD_RE.test(content) && !/(?:吃了|喝了)/.test(content)) continue;
    const foods = extractFoodsFromCustomerText(content);
    for (const f of foods) push(f, "turn");
    // Photo-only turns don't name food in content — vision path covers that
  }

  return items.slice(0, 8);
}

export function formatFoodRecallReply(foods: RecalledFoodItem[]): string {
  if (foods.length === 0) {
    return "我這邊翻了一下，還沒有記到你明確說過吃了什麼。你再用一句話跟我說一次就好。";
  }
  const labels = foods.map((f) => f.label);
  if (labels.length === 1) {
    return `你跟我說過：${labels[0]}。`;
  }
  if (labels.length === 2) {
    return `你跟我說過：${labels[0]}、${labels[1]}。`;
  }
  const head = labels.slice(0, -1).join("、");
  const last = labels[labels.length - 1];
  return `你跟我說過：${head}，還有${last}。`;
}

export function formatGoalRecallReply(input: {
  personalGoal: string | null | undefined;
  primaryDirectionLabel: string | null | undefined;
}): string | null {
  const goal = input.personalGoal?.trim();
  if (!goal) return null;
  const direction = input.primaryDirectionLabel?.trim();
  if (direction) {
    return `你現在的方向是「${direction}」，你說過想要：${goal}。`;
  }
  return `你說過你想要：${goal}。`;
}

export function formatMenuSuggestionReply(input: {
  primaryDirection: string | null | undefined;
  personalGoal: string | null | undefined;
  alreadyHeavyToday: boolean;
}): string {
  const fatLoss =
    input.primaryDirection === "fat_loss_body" ||
    /減脂|瘦|體脂|體態/.test(`${input.personalGoal ?? ""}`);

  if (input.alreadyHeavyToday && fatLoss) {
    return "今天前面已經偏重了，這一餐建議：清湯／燙青菜＋雞胸或魚，主食少半碗。少再疊炸物或漢堡。";
  }
  if (fatLoss) {
    return "這一餐可以這樣選：蛋白質清楚一點（雞胸／魚／蛋）＋蔬菜，主食控制份量。想外食的话選烤的或燙的比較穩。";
  }
  return "這一餐可以蛋白質＋蔬菜打底，再依你今天餓不餓決定主食份量。";
}

function cleanFoodLabel(raw: string): string | null {
  const t = raw
    .replace(/\[(?:影像觀察|顧客更正|近期影像觀察)[^\]]*\]/g, "")
    .replace(/📷\s*照片/g, "")
    .replace(/[。！？!?,，、\s]+$/u, "")
    .trim();
  if (t.length < 2 || t.length > 24) return null;
  if (/^我|^你|^今天|^剛剛/.test(t) && t.length > 12) return null;
  return t;
}

function extractFoodsFromCustomerText(text: string): string[] {
  const cleaned = text
    .replace(/\[近期影像觀察[^\]]*\]\s*[^\n]*/g, "")
    .replace(/\[顧客更正\]\s*/g, "")
    .trim();
  if (!cleaned || cleaned === "📷 照片" || cleaned === "（訊息）") return [];

  const out: string[] = [];
  const patterns = [
    /(?:晚餐|午餐|早餐|宵夜|剛剛)?(?:吃了|吃|喝了|喝)\s*([^\n。！？?]{1,20}(?:飯|麵|漢堡|奶茶|紅茶|咖啡|雞胸|泡麵|蛋糕|滷肉|沙拉|便當|壽司|炸雞|炸麵|雞排|披薩|薯條|蛋|魚|肉|湯|水餃|鍋貼))/u,
    /(?:是|像|為)\s*([^\s，,。！？\n]{1,12}(?:飯|麵|漢堡|茶|雞|肉|沙拉|便當))/u,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m?.[1]) out.push(m[1].trim());
  }
  // Short bare meal lines: "炸麵" / "午餐炸麵"
  if (out.length === 0) {
    const bare = cleaned
      .replace(/^(?:晚餐|午餐|早餐|宵夜)(?:吃了|吃)?/, "")
      .trim();
    if (
      bare.length >= 2 &&
      bare.length <= 16 &&
      /飯|麵|漢堡|茶|雞|肉|沙拉|便當|壽司|炸|蛋|魚|排/.test(bare) &&
      !/[？?]/.test(bare)
    ) {
      out.push(bare);
    }
  }
  return out;
}

function extractFoodFromVisionSummary(summary: string): string | null {
  const m = summary.match(
    /(?:看起來像|像是|像|為|是)\s*([^\s，,。！？\n]{1,16})/,
  );
  return m?.[1]?.trim() ?? null;
}

/** Jump control is useful only when the user left the bottom on a scrollable thread. */
export function shouldShowJumpToLatest(input: {
  stickToBottom: boolean;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  thresholdPx?: number;
}): boolean {
  if (input.stickToBottom) return false;
  const canScroll = input.scrollHeight - input.clientHeight > 8;
  if (!canScroll) return false;
  const threshold = input.thresholdPx ?? 120;
  const distance = input.scrollHeight - input.scrollTop - input.clientHeight;
  return distance > threshold;
}
