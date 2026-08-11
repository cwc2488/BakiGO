/** Central constants for coaching AI meal image pipeline (server-side). */
export const COACHING_AI_MEAL_PHOTO_BUCKET = "coaching-meal-photos" as const;

export const COACHING_AI_MAX_IMAGES_PER_MEAL = 1 as const;

export const COACHING_AI_MAX_MEAL_IMAGES_PER_DAY = 3 as const;

export const COACHING_AI_MEAL_IMAGE_MAX_LONG_EDGE = 1024 as const;

export const COACHING_AI_MEAL_IMAGE_JPEG_QUALITY = 78 as const;

export const COACHING_AI_MEAL_IMAGE_FETCH_CONCURRENCY = 3 as const;

export const COACHING_AI_PRIMARY_MEAL_SLOTS_FOR_IMAGES = ["breakfast", "lunch", "dinner"] as const;
