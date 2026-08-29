import type { Go21RelevanceClass } from "@/types/go21";
import { assessCoachingAiV2Safety } from "@/lib/coaching/ai/v2/v2-safety";

const IN_SCOPE =
  /吃|餐|飯|麵|面|早餐|午餐|晚餐|點心|零食|嘴饞|餓|飽|喝|水|蛋白|碳水|脂肪|纖維|體重|体脂|體脂|肌肉|內臟|減脂|增肌|運動|健身|睡眠|熬夜|渴|鈉|份量|沙拉|奶昔|便當|炸|甜|飲料|營養|飲食|飢餓|渴望|堅持|破戒|聚餐|宵夜|BMR|量體|秤/;

const CONTEXTUAL =
  /累|加班|壓力|心情|分手|失戀|吵架|失眠|出差|應酬|朋友|家人|忙|焦慮|情緒|低潮|沒動力|生病|不舒服|經期|生理期/;

const OUT_OF_SCOPE =
  /寫程式|寫\s*code|寫\s*Python|Python|幫我寫|股票|台積電|比特幣|投資|旅遊行程|規劃.*行程|機票|飯店|戀愛建議|愛不愛|復合|算命|星座|政治|選舉|作業|考試答案|翻譯整篇|寫小說/i;

/**
 * Contextual relevance routing — safety has priority over role boundary.
 */
export function classifyGo21Relevance(message: string): Go21RelevanceClass {
  const text = message.trim();
  if (!text) return "in_scope";

  const safety = assessCoachingAiV2Safety({ freeMessage: text });
  if (safety.triggered) return "safety";

  const hasInScope = IN_SCOPE.test(text);
  const hasContextual = CONTEXTUAL.test(text);
  const hasOut = OUT_OF_SCOPE.test(text);

  if (hasOut && !hasInScope && !hasContextual) return "out_of_scope";
  if (hasContextual && hasInScope) return "contextually_relevant";
  if (hasInScope) return "in_scope";
  if (hasContextual) return "contextually_relevant";
  if (hasOut) return "out_of_scope";

  if (text.length <= 40) return "in_scope";
  return "contextually_relevant";
}
