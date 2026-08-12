-- Phase 4f Preview Gate SETUP (run once in SQL Editor)
-- Creates Customer A + open opportunity + ACTIVE share with known token.
-- Token plaintext (for Preview /r/[token]):
--   Phase4fGateSmokeToken_7f3a9c2e1b8d4e6f0a1c2b3d4e5f6789xx
-- Also creates same-owner existing B phone for duplicate-link test.
-- Tag: note / fingerprint prefix phase4f-gate-live-

with owner as (
  select id as owner_member_id
  from public.members
  order by created_at nulls last, id
  limit 1
),
ids as (
  select
    'aaaaaaaa-4f01-4000-8000-0000000000a1'::uuid as customer_a_id,
    'bbbbbbbb-4f01-4000-8000-0000000000b1'::uuid as customer_existing_b_id,
    'cccccccc-4f01-4000-8000-0000000000c1'::uuid as opportunity_id,
    'dddddddd-4f01-4000-8000-0000000000d1'::uuid as share_id,
    'eeeeeeee-4f01-4000-8000-0000000000e1'::uuid as pause_share_id,
    'ffffffff-4f01-4000-8000-0000000000f1'::uuid as expired_share_id,
    '11111111-4f01-4000-8000-000000000011'::uuid as pending_share_id,
    '8db4a01955031f1efdd27b1960525c810b0b62adc3aa68749ae644ba286cb614' as active_token_hash,
    'f5a685cad8e52c9e8699e7de1c07a8e181cb315aa8a4104b28bb4798d2aade2f' as pause_token_hash,
    '108bbb156bb8feb29509abd98269c1ba457d43404e5666d825d3f029b796451d' as expired_token_hash,
    'e8cfe516f54f3426091fc4a6e4a1d850c32f0cde6694e07dc6dc75bf55400919' as pending_token_hash
)
-- cleanup any prior fixture with same fixed ids
, cleanup as (
  delete from public.growth_referral_attributions
  where share_id in (
    select share_id from ids
    union all select pause_share_id from ids
    union all select expired_share_id from ids
    union all select pending_share_id from ids
  )
  returning 1
)
, cleanup_shares as (
  delete from public.growth_shares
  where id in (
    select share_id from ids
    union all select pause_share_id from ids
    union all select expired_share_id from ids
    union all select pending_share_id from ids
  )
  returning 1
)
, cleanup_opp as (
  delete from public.growth_opportunities where id = (select opportunity_id from ids) returning 1
)
, cleanup_customers as (
  delete from public.customers
  where id in (select customer_a_id from ids union all select customer_existing_b_id from ids)
     or note like 'phase4f-gate-live-%'
  returning 1
)
, ins_customers as (
  insert into public.customers (id, owner_member_id, display_name, phone, status, note)
  select customer_a_id, owner_member_id, '4fLiveA', '0911000111', 'active', 'phase4f-gate-live-a'
  from owner, ids
  union all
  select customer_existing_b_id, owner_member_id, '4fLiveExistingB', '0922000222', 'active', 'phase4f-gate-live-existing-b'
  from owner, ids
  returning id
)
, ins_opp as (
  insert into public.growth_opportunities (
    id, owner_member_id, customer_id, readiness, status, fingerprint,
    celebration_class, outcome_status_snapshot, measurement_stage_snapshot,
    pathway_snapshot, primary_growth_path, secondary_paths_json,
    evidence_json, supporting_signals_json, blocked_reasons_json,
    outcome_band_snapshot, experience_band_snapshot
  )
  select
    opportunity_id, owner_member_id, customer_a_id, 'strong', 'open',
    'phase4f-gate-live-fingerprint',
    'clear', 'improving', 'trend_available', 'coach_assisted',
    'coach_assisted_referral', '["social_proof","friend_benefit"]'::jsonb,
    '["live gate"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'high', 'high'
  from owner, ids
  returning id
)
, ins_active as (
  insert into public.growth_shares (
    id, owner_member_id, introducer_customer_id, growth_opportunity_id,
    share_type, token_hash, status, activated_at,
    consent_snapshot_json, public_display_json, benefit_json
  )
  select
    share_id, owner_member_id, customer_a_id, opportunity_id,
    'coach_referral', active_token_hash, 'active', now(),
    jsonb_build_object('consentedBy','customer','showIntroducerName', true, 'showDayCount', true),
    jsonb_build_object(
      'headline','這是我最近在做的陪跑',
      'bodyCopy','如果你也想了解，可以留下資料。',
      'showIntroducerName', true,
      'introducerDisplayName', '4fLiveA',
      'showDayCount', true,
      'dayCount', 30,
      'shareText', '精神比較好',
      'showMeasurementDelta', false,
      'measurementDeltaSummary', null
    ),
    '{}'::jsonb
  from owner, ids
  returning id
)
, ins_paused as (
  insert into public.growth_shares (
    id, owner_member_id, introducer_customer_id, share_type, token_hash, status,
    activated_at, paused_at, consent_snapshot_json, public_display_json, benefit_json
  )
  select
    pause_share_id, owner_member_id, customer_a_id, 'friend_benefit', pause_token_hash,
    'paused', now(), now(), '{}'::jsonb,
    jsonb_build_object('headline','朋友專屬體驗'),
    jsonb_build_object('benefitType','friend_experience','benefitLabel','朋友專屬體驗')
  from owner, ids
  returning id
)
, ins_expired as (
  insert into public.growth_shares (
    id, owner_member_id, introducer_customer_id, share_type, token_hash, status,
    activated_at, expires_at, consent_snapshot_json, public_display_json, benefit_json
  )
  select
    expired_share_id, owner_member_id, customer_a_id, 'outcome_share', expired_token_hash,
    'active', now(), '2020-01-01T00:00:00Z'::timestamptz, '{}'::jsonb,
    jsonb_build_object('headline','expired'), '{}'::jsonb
  from owner, ids
  returning id
)
, ins_pending as (
  insert into public.growth_shares (
    id, owner_member_id, introducer_customer_id, share_type, token_hash, status,
    consent_snapshot_json, public_display_json, benefit_json
  )
  select
    pending_share_id, owner_member_id, customer_a_id, 'outcome_share', pending_token_hash,
    'pending_consent', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  from owner, ids
  returning id
)
select jsonb_build_object(
  'ok', true,
  'owner_member_id', (select owner_member_id from owner),
  'customer_a_id', (select customer_a_id from ids),
  'existing_b_id', (select customer_existing_b_id from ids),
  'share_id', (select share_id from ids),
  'active_token', 'Phase4fGateSmokeToken_7f3a9c2e1b8d4e6f0a1c2b3d4e5f6789xx',
  'existing_b_phone', '0922000222',
  'cleanup_prior', jsonb_build_object(
    'attrs', (select count(*) from cleanup),
    'shares', (select count(*) from cleanup_shares),
    'opp', (select count(*) from cleanup_opp),
    'customers', (select count(*) from cleanup_customers)
  ),
  'inserted', jsonb_build_object(
    'customers', (select count(*) from ins_customers),
    'opportunity', (select count(*) from ins_opp),
    'active_share', (select count(*) from ins_active),
    'paused_share', (select count(*) from ins_paused),
    'expired_share', (select count(*) from ins_expired),
    'pending_share', (select count(*) from ins_pending)
  )
) as setup;
