/** App-wide emoji accents — keep colors unchanged, only decorate copy. */
export const APP_EMOJI = {
  nav: {
    home: "🏠",
    daily: "☀️",
    calendar: "📅",
    pipeline: "📋",
    retailHouse: "🏪",
  },
  hub: {
    dailyAction: "⚡",
    leaderboard: "🏆",
    pipeline: "📝",
    retailHouse: "🛒",
    organization: "🌳",
    promotions: "🎁",
    calendar: "📅",
    events: "📌",
  },
  section: {
    presidentAi: "🧠",
    missions: "✅",
    promotion: "🚀",
    achievements: "🎖️",
    nextSteps: "👣",
    mapUniverse: "🌌",
    points: "💚",
    calendarToday: "🗓️",
    quickLog: "✍️",
    superLeague: "🏅",
    memberProfile: "👤",
    growth: "📈",
    business: "💼",
    organization: "🤝",
    aiAnalysis: "🔮",
    activity: "📊",
    promotions: "🎯",
    retailRules: "📐",
    groupCompetition: "⚔️",
  },
  page: {
    dailyAction: "☀️",
    calendar: "📅",
    retailHouse: "🏪",
    leaderboard: "🏆",
    organization: "🌳",
    pipeline: "📋",
    events: "📌",
    profile: "👤",
  },
  action: {
    measurement: "📏",
    consultation: "💬",
    recruit: "🤝",
    addRecord: "➕",
    presentation: "📽️",
    redeem: "🎁",
    notify: "🔔",
  },
  mood: {
    welcome: "👋",
    empty: "🌱",
    done: "✨",
    error: "😵",
    loading: "⏳",
    streak: "🔥",
    trophy: "🏆",
  },
  greeting: {
    morning: "🌅",
    afternoon: "🌤️",
    evening: "🌙",
  },
  quadrant: {
    newCustomer: "🆕",
    returningCustomer: "🔁",
    newMember: "⭐",
    returningMember: "💎",
  },
} as const;

export const WORK_HUB_EMOJIS: Record<string, string> = {
  "/daily-action": APP_EMOJI.hub.dailyAction,
  "/leaderboard": APP_EMOJI.hub.leaderboard,
  "/retail-pipeline": APP_EMOJI.hub.pipeline,
  "/retail-house": APP_EMOJI.hub.retailHouse,
  "/organization": APP_EMOJI.hub.organization,
  "/promotions": APP_EMOJI.hub.promotions,
  "/calendar": APP_EMOJI.hub.calendar,
  "/events": APP_EMOJI.hub.events,
};

export const QUADRANT_EMOJIS: Record<string, string> = {
  new_customer: APP_EMOJI.quadrant.newCustomer,
  returning_customer: APP_EMOJI.quadrant.returningCustomer,
  new_member: APP_EMOJI.quadrant.newMember,
  returning_member: APP_EMOJI.quadrant.returningMember,
};

export function withEmoji(emoji: string, text: string): string {
  return `${emoji} ${text}`;
}
