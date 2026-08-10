export type QuizOption = {
  id: string;
  label: string;
  personality?: "A" | "B" | "C" | "D" | "E" | "F";
};

export type QuizQuestion = {
  number: number;
  text: string;
  type: "single" | "multi";
  options: QuizOption[];
};

export const FAT_LOSS_QUESTIONS: QuizQuestion[] = [
  {
    number: 1,
    text: "每次減脂最容易在哪個時刻破功？",
    type: "single",
    options: [
      { id: "A", label: "壓力大、心情差，很想吃點東西", personality: "A" },
      { id: "B", label: "還沒開始就覺得很麻煩", personality: "B" },
      { id: "C", label: "前幾天超認真，後來突然不想做", personality: "C" },
      { id: "D", label: "我都有做，但成果就是不明顯", personality: "D" },
      { id: "E", label: "一忙、一聚餐、一熬夜就整個亂掉", personality: "E" },
      { id: "F", label: "基本都有做到，但卡在某個階段", personality: "F" },
    ],
  },
  {
    number: 2,
    text: "朋友突然約你吃宵夜，你最可能？",
    type: "single",
    options: [
      { id: "A", label: "今天很累，吃一下犒賞自己", personality: "A" },
      { id: "B", label: "本來也還沒正式開始，明天再說", personality: "B" },
      { id: "C", label: "前幾天很認真，今天放縱一下", personality: "C" },
      { id: "D", label: "我會努力選「看起來比較健康」的", personality: "D" },
      { id: "E", label: "我的生活本來就很難固定吃飯", personality: "E" },
      { id: "F", label: "我會吃，但會想辦法調整其他餐", personality: "F" },
    ],
  },
  {
    number: 3,
    text: "哪句話最像你？",
    type: "single",
    options: [
      { id: "A", label: "吃東西真的會讓我心情變好", personality: "A" },
      { id: "B", label: "我知道該減，但就是還沒開始", personality: "B" },
      { id: "C", label: "我每次開始都超認真", personality: "C" },
      { id: "D", label: "我明明已經很努力了", personality: "D" },
      { id: "E", label: "我的工作／生活根本不允許", personality: "E" },
      { id: "F", label: "我知道基本方法，只是想再突破", personality: "F" },
    ],
  },
  {
    number: 4,
    text: "你最常卡在哪？",
    type: "single",
    options: [
      { id: "A", label: "嘴饞／情緒／壓力", personality: "A" },
      { id: "B", label: "懶得開始", personality: "B" },
      { id: "C", label: "無法持續", personality: "C" },
      { id: "D", label: "不知道自己哪裡做錯", personality: "D" },
      { id: "E", label: "時間與作息", personality: "E" },
      { id: "F", label: "停滯期", personality: "F" },
    ],
  },
  {
    number: 5,
    text: "如果有人幫你規劃，你最希望他幫你解決什麼？",
    type: "single",
    options: [
      { id: "A", label: "怎麼不用一直忍著不能吃", personality: "A" },
      { id: "B", label: "怎麼讓開始變簡單", personality: "B" },
      { id: "C", label: "怎麼讓我這次真的維持下去", personality: "C" },
      { id: "D", label: "到底是哪裡做錯", personality: "D" },
      { id: "E", label: "怎麼配合我的真實生活", personality: "E" },
      { id: "F", label: "怎麼讓成果再上一階", personality: "F" },
    ],
  },
  {
    number: 6,
    text: "你以前最像哪種減脂方式？",
    type: "single",
    options: [
      { id: "A", label: "控制幾天，壓力一大就吃回來", personality: "A" },
      { id: "B", label: "查很多資料但很少真正開始", personality: "B" },
      { id: "C", label: "突然節食＋狂運動", personality: "C" },
      { id: "D", label: "換過很多方法", personality: "D" },
      { id: "E", label: "做得不錯，但生活一亂就停", personality: "E" },
      { id: "F", label: "已經有固定飲食／運動習慣", personality: "F" },
    ],
  },
  {
    number: 7,
    text: "如果這次又失敗，你覺得最可能的原因？",
    type: "single",
    options: [
      { id: "A", label: "忍不住想吃", personality: "A" },
      { id: "B", label: "又拖著沒開始", personality: "B" },
      { id: "C", label: "撐不久", personality: "C" },
      { id: "D", label: "方法不適合我", personality: "D" },
      { id: "E", label: "太忙／太累", personality: "E" },
      { id: "F", label: "沒人幫我找到突破點", personality: "F" },
    ],
  },
  {
    number: 8,
    text: "看到理想身材的人，你第一個念頭比較像？",
    type: "single",
    options: [
      { id: "A", label: "如果不用戒掉喜歡吃的東西就好了", personality: "A" },
      { id: "B", label: "我真的也該開始了……", personality: "B" },
      { id: "C", label: "好！明天開始認真！", personality: "C" },
      { id: "D", label: "到底他是怎麼做到的？", personality: "D" },
      { id: "E", label: "他一定沒我這麼忙", personality: "E" },
      { id: "F", label: "我應該也可以再更好", personality: "F" },
    ],
  },
  {
    number: 9,
    text: "如果三個月後身材完全沒有改變，你的感覺？",
    type: "single",
    options: [
      { id: "1", label: "沒差" },
      { id: "2", label: "有點可惜" },
      { id: "3", label: "我會滿失望" },
      { id: "4", label: "我真的不能接受" },
    ],
  },
  {
    number: 10,
    text: "你為了身材曾經做過哪些事？（可複選）",
    type: "multi",
    options: [
      { id: "fitness", label: "健身" },
      { id: "diet", label: "節食" },
      { id: "self_research", label: "自己研究飲食" },
      { id: "coach", label: "找教練" },
      { id: "health_products", label: "買健康相關產品" },
      { id: "program", label: "參加減脂計畫" },
      { id: "none", label: "幾乎沒有" },
    ],
  },
  {
    number: 11,
    text: "如果現在有一套適合你生活的方法，你會？",
    type: "single",
    options: [
      { id: "1", label: "先看看再說" },
      { id: "2", label: "願意試一點" },
      { id: "3", label: "願意認真執行" },
      { id: "4", label: "如果適合我，我想現在開始" },
    ],
  },
  {
    number: 12,
    text: "如果只能先改變一件事，你最想要？",
    type: "single",
    options: [
      { id: "waist", label: "腰腹變小" },
      { id: "weight", label: "體重下降" },
      { id: "body_fat", label: "體脂下降" },
      { id: "shape", label: "線條更好" },
      { id: "clothes", label: "穿衣服更好看" },
      { id: "energy", label: "體力健康" },
      { id: "confidence", label: "更有自信" },
      { id: "other", label: "其他" },
    ],
  },
];

export const GOAL_LABELS: Record<string, string> = {
  waist: "腰腹變小",
  weight: "體重下降",
  body_fat: "體脂下降",
  shape: "線條更好",
  clothes: "穿衣服更好看",
  energy: "體力健康",
  confidence: "更有自信",
  other: "其他",
};

export const ACTION_HISTORY_LABELS: Record<string, string> = {
  fitness: "健身",
  diet: "節食",
  self_research: "自己研究飲食",
  coach: "找教練",
  health_products: "買健康相關產品",
  program: "參加減脂計畫",
  none: "幾乎沒有",
};
