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
];

export const LEARNING_SERIES_LABELS: Record<string, string> = {
  dream_quartet: "圓夢四部曲",
  promotion_abc: "促銷ABC · 零售成交或招募",
  objection_handling: "異議處理",
  after_sales: "售後服務",
  general: "事業基礎",
  comprehensive: "綜合大全",
};

export interface LearningResourceGroup {
  key: string;
  title: string;
  resources: LearningResource[];
}

export function getLearningResourceById(id: string): LearningResource | undefined {
  return LEARNING_RESOURCE_CATALOG.find((resource) => resource.id === id);
}

export function formatLearningStuckPoints(resource: LearningResource): string[] {
  return resource.stuckPoints.map((point) => LEARNING_STUCK_POINT_LABELS[point]);
}

const GROUP_ORDER = [
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
    resources: buckets.get(key) ?? [],
  }));
}
