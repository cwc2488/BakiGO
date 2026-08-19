export type QuizHubItem = {
  slug: string;
  title: string;
  description: string;
  coverSrc: string;
  manageHref: string;
  leadsHref: string;
};

export const QUIZ_HUB_ITEMS: readonly QuizHubItem[] = [
  {
    slug: "fat-loss",
    title: "你是哪一種瘦不下來的人？",
    description: "12 題，找出真正讓你卡住的原因",
    coverSrc: "/quiz/fat-loss/quiz-cover.png",
    manageHref: "/quiz/21d?tab=share",
    leadsHref: "/quiz/21d",
  },
] as const;
