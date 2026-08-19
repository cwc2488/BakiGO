import type { QuizPartnerLeadCardData } from "@/components/quiz/QuizPartnerLeadCard";
import type { QuizPartnerFunnelView } from "@/components/quiz/QuizPartnerPerformancePanel";
import { QUIZ_PARTNER_EMPTY_RATE } from "@/lib/quiz/partner/quiz-partner-presentation";

const waiting: QuizPartnerLeadCardData = {
  id: "preview-waiting",
  displayName: "小美",
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  status: "interested",
  whyNow: "最近開始覺得自己的精神和體力比以前差。",
  realBottleneck: "工作累之後，很難維持原本知道的方法。",
  contactChannel: "instagram",
  contactValue: "xiaomei.life",
  animalLabel: "🐼 熬夜熊貓",
};

const contacted: QuizPartnerLeadCardData = {
  ...waiting,
  id: "preview-contacted",
  displayName: "阿豪",
  status: "contacted",
  contactChannel: "line",
  contactValue: "hao.line",
  animalLabel: "🐘 療癒胖象",
  createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
};

const joined: QuizPartnerLeadCardData = {
  ...waiting,
  id: "preview-joined",
  displayName: "小安",
  status: "joined",
  contactChannel: "phone",
  contactValue: "0912345678",
  animalLabel: "🐆 突破獵豹",
  createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
};

const emptyFunnel: QuizPartnerFunnelView = {
  range: "month",
  counts: {
    humanViews: 0,
    quizStarted: 0,
    quizCompleted: 0,
    reportReady: 0,
    interested21d: 0,
    joined: 0,
  },
  rates: {
    quizComplete: QUIZ_PARTNER_EMPTY_RATE,
    reportTo21d: QUIZ_PARTNER_EMPTY_RATE,
    interestToJoined: QUIZ_PARTNER_EMPTY_RATE,
  },
};

export const QUIZ_PARTNER_PREVIEW_FIXTURES = {
  waiting,
  contacted,
  joined,
  emptyFunnel,
  share: {
    shareCode: "ABC123",
    href: "https://bakigo.tw/q/ABC123",
    display: "bakigo.tw/q/ABC123",
  },
};
