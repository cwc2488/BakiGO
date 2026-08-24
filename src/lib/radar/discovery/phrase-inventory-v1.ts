/**
 * Phrase Inventory V1 — discovery definition only.
 *
 * TypeScript is the versioned source for phrase identity, family, and class.
 * After a phrase is measured and retained, it may be activated into
 * `radar_system_keywords` (the daily pipeline DB source of truth).
 * Unmeasured phrases must not be seeded. SCALE-03 retained topic nouns
 * activate via `radar-system-keyword-seed.ts` / migration 048. First-person stays off.
 *
 * Nothing here is an extraction input or a scoring signal.
 */

export const PHRASE_INVENTORY_VERSION = "phrase_inventory_v1" as const;

export const PHRASE_CLASSES = [
  "topic_noun",
  "first_person_need",
  "blocked_meta",
] as const;

export type PhraseClass = (typeof PHRASE_CLASSES)[number];

export const NEED_FAMILIES = [
  "body_fat",
  "muscle_fitness",
  "health_improve",
  "side_income",
  "money_change",
] as const;

export type NeedFamily = (typeof NEED_FAMILIES)[number];

export type PhraseInventoryEntry = {
  phrase_key: string;
  phrase: string;
  need_family: NeedFamily;
  phrase_class: PhraseClass;
  locale: "zh-TW";
  inventory_version: typeof PHRASE_INVENTORY_VERSION;
};

export const BLOCKED_META_PHRASES = ["減脂", "減肥", "瘦身", "增肌"] as const;

export const PHRASE_INVENTORY_V1: readonly PhraseInventoryEntry[] = [
  // Arm A — known-usable topic nouns from SCALE-01/02, plus adjacent nouns.
  topic("noun_fitness", "健身", "muscle_fitness"),
  topic("noun_exercise", "運動", "muscle_fitness"),
  topic("noun_healthy_life", "健康生活", "health_improve"),
  topic("noun_side_hustle", "副業", "side_income"),
  topic("noun_strength_training", "重訓", "muscle_fitness"),
  topic("noun_running", "跑步", "muscle_fitness"),
  topic("noun_part_time", "兼職", "side_income"),
  topic("noun_startup", "創業", "money_change"),

  // Arm B — first-person need / change probes. Capability is measured, not assumed.
  firstPerson("fp_i_want_thin", "我想瘦", "body_fat"),
  firstPerson("fp_got_fatter", "最近胖了", "body_fat"),
  firstPerson("fp_cannot_lose", "怎麼都瘦不下來", "body_fat"),
  firstPerson("fp_want_stronger", "想練壯", "muscle_fitness"),
  firstPerson("fp_energy_down", "體力變差", "muscle_fitness"),
  firstPerson("fp_want_healthy", "想變健康", "health_improve"),
  firstPerson("fp_want_side_hustle", "想找副業", "side_income"),
  firstPerson("fp_salary_not_enough", "薪水不夠用", "money_change"),

  // Defined, not sent this round — reserved so we do not spend extra requests.
  firstPerson("fp_want_income", "想增加收入", "side_income"),
  firstPerson("fp_fix_routine", "想改善作息", "health_improve"),
  firstPerson("fp_training_stuck", "練不出來", "muscle_fitness"),
  firstPerson("fp_sleep_bad", "睡不好", "health_improve"),

  // Capability denylist — recorded, never substituted, never sent to Meta.
  blocked("blocked_cut_fat", "減脂", "body_fat"),
  blocked("blocked_lose_weight", "減肥", "body_fat"),
  blocked("blocked_slim", "瘦身", "body_fat"),
  blocked("blocked_gain_muscle", "增肌", "muscle_fitness"),
];

function topic(
  phrase_key: string,
  phrase: string,
  need_family: NeedFamily,
): PhraseInventoryEntry {
  return {
    phrase_key,
    phrase,
    need_family,
    phrase_class: "topic_noun",
    locale: "zh-TW",
    inventory_version: PHRASE_INVENTORY_VERSION,
  };
}

function firstPerson(
  phrase_key: string,
  phrase: string,
  need_family: NeedFamily,
): PhraseInventoryEntry {
  return {
    phrase_key,
    phrase,
    need_family,
    phrase_class: "first_person_need",
    locale: "zh-TW",
    inventory_version: PHRASE_INVENTORY_VERSION,
  };
}

function blocked(
  phrase_key: string,
  phrase: string,
  need_family: NeedFamily,
): PhraseInventoryEntry {
  return {
    phrase_key,
    phrase,
    need_family,
    phrase_class: "blocked_meta",
    locale: "zh-TW",
    inventory_version: PHRASE_INVENTORY_VERSION,
  };
}

export function getPhraseByKey(phrase_key: string): PhraseInventoryEntry | undefined {
  return PHRASE_INVENTORY_V1.find((entry) => entry.phrase_key === phrase_key);
}

export function phrasesForClass(phrase_class: PhraseClass): PhraseInventoryEntry[] {
  return PHRASE_INVENTORY_V1.filter((entry) => entry.phrase_class === phrase_class);
}

/** Phrases the Phase 3 experiment may send to Meta. Blocked terms are excluded. */
export function experimentArmATopicNouns(): PhraseInventoryEntry[] {
  return phrasesForClass("topic_noun");
}

/**
 * First-person probes actually sent this round (8, matching arm A request count).
 * Remaining first-person entries stay in the inventory as unmeasured.
 */
export const PHASE3_ARM_B_KEYS = [
  "fp_i_want_thin",
  "fp_got_fatter",
  "fp_cannot_lose",
  "fp_want_stronger",
  "fp_energy_down",
  "fp_want_healthy",
  "fp_want_side_hustle",
  "fp_salary_not_enough",
] as const;

export function experimentArmBFirstPerson(): PhraseInventoryEntry[] {
  return PHASE3_ARM_B_KEYS.map((key) => {
    const entry = getPhraseByKey(key);
    if (!entry) throw new Error(`Phrase Inventory V1 missing ${key}`);
    return entry;
  });
}

export function isBlockedMetaPhrase(phrase: string): boolean {
  return (BLOCKED_META_PHRASES as readonly string[]).includes(phrase.trim());
}

/** Provenance that may sit on raw snapshots / discoveries — never on extraction. */
export type DiscoveryProvenance = {
  phrase_key: string;
  phrase: string;
  need_family: NeedFamily;
  phrase_class: PhraseClass;
  inventory_version: typeof PHRASE_INVENTORY_VERSION;
};

export function discoveryProvenance(entry: PhraseInventoryEntry): DiscoveryProvenance {
  return {
    phrase_key: entry.phrase_key,
    phrase: entry.phrase,
    need_family: entry.need_family,
    phrase_class: entry.phrase_class,
    inventory_version: entry.inventory_version,
  };
}
