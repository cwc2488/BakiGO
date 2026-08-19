import type { LearningResource } from "@/types/learning-resource";
import { LEARNING_STUCK_POINT_LABELS } from "@/types/learning-resource";

/** 組織提供的業務教學 YouTube 片單 — 依標題對應卡關點。 */
export const LEARNING_RESOURCE_CATALOG: LearningResource[] = [
  {
    id: "objection_01",
    title: "破解直銷的10大異議問題 01",
    youtubeUrl: "https://youtu.be/bEVbO2_9j9s",
    stuckPoints: ["objection_handling", "pipeline_consultation"],
    seriesKey: "objection_handling",
    seriesPart: 1,
    note: "若此集沒有聲音，可在 YouTube 搜尋「破解直銷的10大異議問題」下一集。",
  },
  {
    id: "dream_snowball",
    title: "圓夢四部·第一部·主席的雪球計畫",
    youtubeUrl: "https://youtu.be/ibUYQORjTzg",
    stuckPoints: ["organization_growth", "president_path"],
    seriesKey: "dream_quartet",
    seriesPart: 1,
  },
  {
    id: "dream_18_month_president",
    title: "18個月上總裁計畫",
    youtubeUrl: "https://youtu.be/2Z04Aq1IGD8",
    stuckPoints: ["president_path", "organization_growth"],
  },
  {
    id: "dream_map",
    title: "圓夢四部·第二部·倫哥的 MAP 計畫",
    youtubeUrl: "https://youtu.be/9LncbC4H8NE",
    stuckPoints: ["map_qualification", "foundation_newcomer"],
    seriesKey: "dream_quartet",
    seriesPart: 2,
  },
  {
    id: "dream_newcomer",
    title: "圓夢四部·第三部·嚕咪姐的新人規劃",
    youtubeUrl: "https://youtu.be/KUMKY-Yucn4",
    stuckPoints: ["foundation_newcomer", "pipeline_empty", "pipeline_early"],
    seriesKey: "dream_quartet",
    seriesPart: 3,
  },
  {
    id: "dream_retail_house",
    title: "圓夢四部·第四部·士謙哥的零售屋計畫",
    youtubeUrl: "https://youtu.be/TIfH8KP7u6o",
    stuckPoints: ["retail_house", "retail_vp"],
    seriesKey: "dream_quartet",
    seriesPart: 4,
  },
  {
    id: "marketing_plan",
    title: "市場行銷計劃",
    youtubeUrl: "https://youtu.be/T7CufAN7YKg",
    stuckPoints: ["marketing_overview", "foundation_newcomer"],
  },
  {
    id: "product_full",
    title: "士謙哥全產品",
    youtubeUrl: "https://youtu.be/V9Xnpw_N5sE",
    stuckPoints: ["product_knowledge", "pipeline_consultation"],
  },
  {
    id: "promotion_abc_bachi",
    title: "巴奇推廣 實戰促銷ABC",
    youtubeUrl: "https://youtu.be/KJFSKyzuAZk",
    stuckPoints: ["pipeline_consultation", "objection_handling", "organization_growth"],
    seriesKey: "promotion_abc",
    seriesPart: 1,
  },
  {
    id: "promotion_abc_kaohsiung",
    title: "高雄一日培訓 · 促銷ABC（蔡明蕙 富豪組）",
    youtubeUrl: "https://youtu.be/k87wl0qXVzA",
    stuckPoints: ["pipeline_consultation", "objection_handling", "organization_growth"],
    seriesKey: "promotion_abc",
    seriesPart: 2,
  },
  {
    id: "promotion_abc_store",
    title: "認識店家績優組ABC法則",
    youtubeUrl: "https://youtu.be/WfkKLHI8VNI",
    stuckPoints: ["pipeline_consultation", "organization_growth", "retail_house"],
    seriesKey: "promotion_abc",
    seriesPart: 3,
  },
  {
    id: "promotion_abc_lumi",
    title: "促銷ABC（Lumi 富豪）",
    youtubeUrl: "https://youtu.be/oYYQOO3Ys-o",
    stuckPoints: ["pipeline_consultation", "objection_handling", "organization_growth"],
    seriesKey: "promotion_abc",
    seriesPart: 4,
  },
  {
    id: "after_sales_goldmine",
    title: "服務是金礦（士謙哥 · 售後服務）",
    youtubeUrl: "https://youtu.be/jtngUiEbwMc",
    stuckPoints: ["product_knowledge", "retail_house", "pipeline_consultation"],
    seriesKey: "after_sales",
    seriesPart: 1,
  },
  {
    id: "comprehensive_playlist",
    title: "綜合大全（完整片單）",
    youtubeUrl: "https://youtube.com/playlist?list=PLI5FMVK_dFp9xekrYRUNkqOBHTYwXco_Z",
    stuckPoints: ["marketing_overview", "foundation_newcomer"],
    seriesKey: "comprehensive",
    note: "YouTube 播放清單，含多堂業務教學影片。",
  },
  {
    id: "training_marketing_plan",
    title: "市場行銷計劃",
    youtubeUrl: "https://youtu.be/-zWNALSOOZ8",
    stuckPoints: ["marketing_overview", "foundation_newcomer"],
    seriesKey: "training_videos",
    seriesPart: 1,
  },
  {
    id: "training_talk_case",
    title: "談case",
    youtubeUrl: "https://youtu.be/FNQD24OVMYI",
    stuckPoints: ["pipeline_consultation", "objection_handling"],
    seriesKey: "training_videos",
    seriesPart: 2,
  },
  {
    id: "training_weight_loss_female",
    title: "減重女",
    youtubeUrl: "https://youtu.be/HDMWnKHsMWc",
    stuckPoints: ["product_knowledge", "pipeline_consultation"],
    seriesKey: "training_videos",
    seriesPart: 3,
  },
  {
    id: "training_weight_loss_male",
    title: "減重男",
    youtubeUrl: "https://youtu.be/9ZoNxTE9iBQ",
    stuckPoints: ["product_knowledge", "pipeline_consultation"],
    seriesKey: "training_videos",
    seriesPart: 4,
  },
  {
    id: "training_weight_gain_male",
    title: "增重男",
    youtubeUrl: "https://youtu.be/nPbQUmc73vU",
    stuckPoints: ["product_knowledge", "pipeline_consultation"],
    seriesKey: "training_videos",
    seriesPart: 5,
  },
  {
    id: "training_sculpt_female",
    title: "雕塑女",
    youtubeUrl: "https://youtu.be/O969KIZuzfw",
    stuckPoints: ["product_knowledge", "pipeline_consultation"],
    seriesKey: "training_videos",
    seriesPart: 6,
  },
  {
    id: "training_baki_close",
    title: "巴其哥締結",
    youtubeUrl: "https://youtu.be/jtngUiEbwMc",
    stuckPoints: ["organization_growth", "pipeline_consultation"],
    seriesKey: "training_videos",
    seriesPart: 7,
  },
  {
    id: "training_after_sales",
    title: "售後服務課程",
    youtubeUrl: "https://youtu.be/9cvNCXeTpcY",
    stuckPoints: ["product_knowledge", "retail_house", "pipeline_consultation"],
    seriesKey: "training_videos",
    seriesPart: 8,
  },
  {
    id: "training_five_keys",
    title: "事業成功的五大關鍵",
    youtubeUrl: "https://youtu.be/YxRiCxLUSao",
    stuckPoints: ["marketing_overview", "foundation_newcomer"],
    seriesKey: "training_videos",
    seriesPart: 9,
  },
  {
    id: "training_how_to_retail",
    title: "如何零售",
    youtubeUrl: "https://youtu.be/mswgwDTOQyc",
    stuckPoints: ["retail_house", "retail_vp"],
    seriesKey: "training_videos",
    seriesPart: 10,
  },
  {
    id: "training_packaging_story",
    title: "包裝故事",
    youtubeUrl: "https://youtu.be/mswgwDTOQyc",
    stuckPoints: ["retail_house", "retail_vp"],
    seriesKey: "training_videos",
    seriesPart: 11,
  },
  {
    id: "five_courses_develop",
    title: "開發",
    youtubeUrl: "https://youtu.be/P9KLepxXCLM?si=EUdYIDd0ubwFp6g7",
    stuckPoints: ["pipeline_empty", "pipeline_early", "foundation_newcomer"],
    seriesKey: "five_courses",
    seriesPart: 1,
  },
  {
    id: "five_courses_after_sales",
    title: "售服",
    youtubeUrl: "https://youtu.be/tDPQcERX3hM?si=LPI5ybZaEyEq3kZ5",
    stuckPoints: ["product_knowledge", "retail_house", "pipeline_consultation"],
    seriesKey: "five_courses",
    seriesPart: 2,
    note: "技術問題，9 分鐘開始有聲音",
  },
  {
    id: "five_courses_uplift",
    title: "提升",
    youtubeUrl: "https://youtu.be/YM0mB2laXyA?si=tb0Jg_xrxnzCV3lb",
    stuckPoints: ["organization_growth"],
    seriesKey: "five_courses",
    seriesPart: 3,
  },
  {
    id: "five_courses_retain",
    title: "保留",
    youtubeUrl: "https://youtu.be/_fFkyy0V31A?si=_xXzcO2GDe8A2Gu4",
    stuckPoints: ["organization_growth"],
    seriesKey: "five_courses",
    seriesPart: 4,
  },
  {
    id: "five_courses_escape_map",
    title: "逃生圖",
    youtubeUrl: "https://youtu.be/CauON42FOWc?si=Rpx3aE8NRxilghzI",
    stuckPoints: ["marketing_overview", "president_path"],
    seriesKey: "five_courses",
    seriesPart: 5,
  },
];

export const LEARNING_SERIES_LABELS: Record<string, string> = {
  training_videos: "培訓影片",
  five_courses: "五堂課程",
  dream_quartet: "圓夢四部曲",
  promotion_abc: "促銷ABC · 零售成交或招募",
  objection_handling: "異議處理",
  after_sales: "售後服務",
  general: "事業基礎",
  comprehensive: "綜合大全",
};

export const LEARNING_SERIES_NOTES: Record<string, string> = {
  five_courses: "內部培訓，連結請勿外傳唷❤️",
};

export interface LearningResourceGroup {
  key: string;
  title: string;
  note?: string;
  resources: LearningResource[];
}

export function getLearningResourceById(id: string): LearningResource | undefined {
  return LEARNING_RESOURCE_CATALOG.find((resource) => resource.id === id);
}

export function formatLearningStuckPoints(resource: LearningResource): string[] {
  return resource.stuckPoints.map((point) => LEARNING_STUCK_POINT_LABELS[point]);
}

const GROUP_ORDER = [
  "training_videos",
  "five_courses",
  "dream_quartet",
  "promotion_abc",
  "objection_handling",
  "after_sales",
  "general",
  "comprehensive",
] as const;

export function groupLearningResources(): LearningResourceGroup[] {
  const buckets = new Map<string, LearningResource[]>();

  for (const resource of LEARNING_RESOURCE_CATALOG) {
    const key = resource.seriesKey ?? "general";
    const list = buckets.get(key) ?? [];
    list.push(resource);
    buckets.set(key, list);
  }

  for (const [key, resources] of buckets) {
    resources.sort((left, right) => {
      const leftPart = left.seriesPart ?? 999;
      const rightPart = right.seriesPart ?? 999;
      if (leftPart !== rightPart) {
        return leftPart - rightPart;
      }
      return left.title.localeCompare(right.title, "zh-Hant");
    });
    buckets.set(key, resources);
  }

  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    title: LEARNING_SERIES_LABELS[key] ?? key,
    note: LEARNING_SERIES_NOTES[key],
    resources: buckets.get(key) ?? [],
  }));
}
