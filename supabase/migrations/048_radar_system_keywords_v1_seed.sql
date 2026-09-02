-- Radar V1 — seed SCALE-03 measured topic nouns into radar_system_keywords.
--
-- Evidence: docs/AI_RADAR.md §6.10.12 — Arm A 8/8 Meta keyword_search success.
-- First-person phrases and blocked Meta terms (減脂 / 減肥 / 瘦身 / 增肌) are
-- intentionally absent. No schema change. Idempotent: skip phrases already present.

INSERT INTO public.radar_system_keywords (
  phrase,
  discovery_intent,
  signal_type,
  discovery_weight,
  locale,
  is_active
)
SELECT
  seed.phrase,
  seed.discovery_intent,
  seed.signal_type,
  seed.discovery_weight,
  seed.locale,
  seed.is_active
FROM (
  VALUES
    ('健身'::text, 'body_transformation'::text, 'broad_need'::text, 1, 'zh-TW'::text, true),
    ('運動', 'body_transformation', 'broad_need', 1, 'zh-TW', true),
    ('健康生活', 'health_improvement', 'broad_need', 1, 'zh-TW', true),
    ('副業', 'income_need', 'broad_need', 1, 'zh-TW', true),
    ('重訓', 'body_transformation', 'broad_need', 1, 'zh-TW', true),
    ('跑步', 'body_transformation', 'broad_need', 1, 'zh-TW', true),
    ('兼職', 'income_need', 'broad_need', 1, 'zh-TW', true),
    ('創業', 'career_business_change', 'broad_need', 1, 'zh-TW', true)
) AS seed(phrase, discovery_intent, signal_type, discovery_weight, locale, is_active)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.radar_system_keywords existing
  WHERE existing.phrase = seed.phrase
    AND existing.locale = seed.locale
);
