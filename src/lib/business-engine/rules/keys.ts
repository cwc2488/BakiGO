/** Rank keys — organization may override via BusinessRulesConfig. */
export const RANK_KEYS = {
  NEW_MEMBER: "new_member",
  SUPERVISOR: "supervisor",
  ACTIVE_SUPERVISOR: "active_supervisor",
  WORLD_TEAM: "world_team",
  PRESIDENT: "president",
  PROMOTION_GROUP: "promotion_group",
  WEALTH_GROUP: "wealth_group",
} as const;

/** Activity keys referenced by challenge criteria and rank qualification. */
export const ACTIVITY_KEYS = {
  MEASUREMENT: "measurement",
  CONSULTATION: "consultation",
  PRODUCT_SHARING: "product_sharing",
  RETAIL_HOUSE_UPDATE: "retail_house_update",
} as const;

/** Retail transaction type keys — labels and rules live in retailTransactionTypes config. */
export const RETAIL_TRANSACTION_TYPE_KEYS = {
  NEW_CUSTOMER_NTD: "new_customer_ntd",
  RETURNING_CUSTOMER_NTD: "returning_customer_ntd",
  NEW_MEMBER_VP: "new_member_vp",
  RETURNING_MEMBER_VP: "returning_member_vp",
} as const;

/** Leaderboard metric identifiers. */
export const LEADERBOARD_METRICS = {
  MONTHLY_CHALLENGE_PROGRESS: "monthly_challenge_progress",
  ACTIVITY_COUNT: "activity_count",
  RETAIL_AMOUNT: "retail_amount",
} as const;
