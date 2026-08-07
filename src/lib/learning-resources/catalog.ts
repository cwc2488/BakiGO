import type { LearningResource } from "@/types/learning-resource";

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
];

export function getLearningResourceById(id: string): LearningResource | undefined {
  return LEARNING_RESOURCE_CATALOG.find((resource) => resource.id === id);
}
