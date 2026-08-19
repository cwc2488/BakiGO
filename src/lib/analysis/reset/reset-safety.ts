const MEDICAL_COACHING_RE =
  /改善血糖|控制血糖|血糖.{0,16}(飲食|運動|改善|控制)|怎麼控制血糖|如何改善血糖|治療.{0,10}(血糖|紅字)|給你.{0,8}(藥|處方)|你有糖尿病|確診你|這代表你生病/;

const USER_MEDICAL_CUE_RE = /醫生|醫師|血糖|紅字|吃藥/;

const GOAL_OVERRIDE_RE = /你其實不用減|那你不要減了|維持現在就好|其實不用改/;

export function looksLikeUserMedicalContext(text: string): boolean {
  return USER_MEDICAL_CUE_RE.test(text);
}

export function hasUnsafeMedicalCoaching(text: string): boolean {
  return MEDICAL_COACHING_RE.test(text);
}

export function stripUnsafeMedicalCopy(text: string): string {
  return text
    .replace(/你有糖尿病[^。！]*[。！]?/g, "")
    .replace(/確診你[^。！]*[。！]?/g, "")
    .replace(/給你.{0,8}(藥|處方)[^。！]*[。！]?/g, "")
    .trim();
}

export function stripGoalOverride(text: string): string {
  if (!GOAL_OVERRIDE_RE.test(text)) return text;
  return text
    .replace(/你其實不用減[^。！]*[。！]?/g, "")
    .replace(/那你不要減了[^。！]*[。！]?/g, "")
    .replace(/其實不用改[^。！]*[。！]?/g, "")
    .replace(/維持現在就好[^。！]*[。！]?/g, "")
    .trim();
}

export const MEDICAL_GUIDANCE =
  "健康相關的事我不會幫你下判斷。需要醫療決定時，請找專業人員。";
