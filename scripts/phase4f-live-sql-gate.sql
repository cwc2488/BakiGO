-- Phase 4f live acceptance fixture (run in Supabase SQL Editor as postgres/service)
-- Creates A → share → B, verifies checks, then deletes fixtures.
-- Safe: only touches rows tagged with note/fingerprint prefix phase4f-gate-live-
-- Returns one JSON row of PASS/FAIL results. No business-logic change.

with owner as (
  select id as owner_member_id
  from public.members
  order by created_at nulls last, id
  limit 1
),
ids as (
  select
    gen_random_uuid() as customer_a_id,
    gen_random_uuid() as customer_existing_b_id,
    gen_random_uuid() as opportunity_id,
    gen_random_uuid() as share_id,
    gen_random_uuid() as pause_share_id,
    gen_random_uuid() as expired_share_id,
    gen_random_uuid() as pending_share_id,
    encode(gen_random_bytes(32), 'hex') as active_token_hex,
    encode(gen_random_bytes(32), 'hex') as pause_token_hex,
    encode(gen_random_bytes(32), 'hex') as expired_token_hex,
    encode(gen_random_bytes(32), 'hex') as pending_token_hex,
    ('09' || lpad((floor(random()*100000000))::int::text, 8, '0')) as phone_existing,
    ('09' || lpad((floor(random()*100000000))::int::text, 8, '0')) as phone_new,
    to_char(now(), 'YYMMDDHH24MISS') as stamp
),
ins_customers as (
  insert into public.customers (id, owner_member_id, display_name, phone, status, note)
  select customer_a_id, owner_member_id, '4fLiveA-' || stamp, '0911000' || right(stamp, 3), 'active', 'phase4f-gate-live-a'
  from owner, ids
  union all
  select customer_existing_b_id, owner_member_id, '4fLiveExistingB-' || stamp, phone_existing, 'active', 'phase4f-gate-live-existing-b'
  from owner, ids
  returning id
),
ins_opp as (
  insert into public.growth_opportunities (
    id, owner_member_id, customer_id, readiness, status, fingerprint,
    celebration_class, outcome_status_snapshot, measurement_stage_snapshot,
    pathway_snapshot, primary_growth_path, secondary_paths_json,
    evidence_json, supporting_signals_json, blocked_reasons_json,
    outcome_band_snapshot, experience_band_snapshot
  )
  select
    opportunity_id, owner_member_id, customer_a_id, 'strong', 'open',
    'phase4f-gate-live-' || stamp,
    'clear', 'improving', 'trend_available', 'coach_assisted',
    'coach_assisted_referral', '["social_proof","friend_benefit"]'::jsonb,
    '["live gate"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'high', 'high'
  from owner, ids
  returning id
),
ins_share as (
  insert into public.growth_shares (
    id, owner_member_id, introducer_customer_id, growth_opportunity_id,
    share_type, token_hash, status, activated_at,
    consent_snapshot_json, public_display_json, benefit_json
  )
  select
    share_id, owner_member_id, customer_a_id, opportunity_id,
    'coach_referral',
    encode(digest(active_token_hex, 'sha256'), 'hex'),
    'active', now(),
    jsonb_build_object('consentedBy','customer','consentedAt', now()),
    jsonb_build_object(
      'headline','這是我最近在做的陪跑',
      'bodyCopy','live gate',
      'showIntroducerName', true,
      'introducerDisplayName', '4fLiveA',
      'showDayCount', true,
      'dayCount', 30,
      'shareText', '精神比較好',
      'showMeasurementDelta', false
    ),
    '{}'::jsonb
  from owner, ids
  returning id
),
ins_extra_shares as (
  insert into public.growth_shares (
    id, owner_member_id, introducer_customer_id, share_type, token_hash, status,
    expires_at, activated_at, consent_snapshot_json, public_display_json, benefit_json, paused_at
  )
  select pause_share_id, owner_member_id, customer_a_id, 'friend_benefit',
         encode(digest(pause_token_hex, 'sha256'), 'hex'), 'paused',
         null, now(), '{}'::jsonb,
         jsonb_build_object('headline','朋友專屬體驗','benefitLabel','朋友專屬體驗'),
         jsonb_build_object('benefitType','friend_experience','benefitLabel','朋友專屬體驗'),
         now()
  from owner, ids
  union all
  select expired_share_id, owner_member_id, customer_a_id, 'outcome_share',
         encode(digest(expired_token_hex, 'sha256'), 'hex'), 'active',
         '2020-01-01T00:00:00Z'::timestamptz, now(), '{}'::jsonb,
         jsonb_build_object('headline','expired'), '{}'::jsonb, null
  from owner, ids
  union all
  select pending_share_id, owner_member_id, customer_a_id, 'outcome_share',
         encode(digest(pending_token_hex, 'sha256'), 'hex'), 'pending_consent',
         null, null, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, null
  from owner, ids
  returning id
),
-- B new customer via attribution + customer insert
ins_b_customer as (
  insert into public.customers (id, owner_member_id, display_name, phone, status, note)
  select gen_random_uuid(), owner_member_id, '4fLiveB-' || stamp, phone_new, 'active', 'phase4f-gate-live-b-new'
  from owner, ids
  returning id, phone, display_name
),
ins_attr_new as (
  insert into public.growth_referral_attributions (
    owner_member_id, share_id, introducer_customer_id, introduced_customer_id,
    status, lead_display_name, lead_phone, lead_goal_text, linked_existing_customer,
    first_touch_at, interested_at, submitted_at, converted_at
  )
  select
    o.owner_member_id, i.share_id, i.customer_a_id, b.id,
    'customer_created', b.display_name, b.phone, '想改善體態', false,
    now(), now(), now(), now()
  from owner o, ids i, ins_b_customer b
  returning id, introducer_customer_id, introduced_customer_id, status, linked_existing_customer
),
ins_attr_dup as (
  insert into public.growth_referral_attributions (
    owner_member_id, share_id, introducer_customer_id, introduced_customer_id,
    status, lead_display_name, lead_phone, lead_goal_text, linked_existing_customer,
    first_touch_at, interested_at, submitted_at, converted_at
  )
  select
    o.owner_member_id, i.share_id, i.customer_a_id, i.customer_existing_b_id,
    'customer_created', '別名重複', i.phone_existing, '再次進入', true,
    now(), now(), now(), now()
  from owner o, ids i
  returning id, introduced_customer_id, linked_existing_customer
),
ins_attr_name as (
  insert into public.growth_referral_attributions (
    owner_member_id, share_id, introducer_customer_id, introduced_customer_id,
    status, lead_display_name, lead_phone, linked_existing_customer,
    first_touch_at, interested_at, submitted_at
  )
  select
    o.owner_member_id, i.share_id, i.customer_a_id, null,
    'submitted', '只有名字', null, false,
    now(), now(), now()
  from owner o, ids i
  returning id, introduced_customer_id, status
),
verify as (
  select jsonb_build_object(
    'tables_exist', (
      to_regclass('public.growth_shares') is not null
      and to_regclass('public.growth_referral_attributions') is not null
    ),
    'policies_authenticated_only', (
      select count(*) = 6 and bool_and('authenticated' = any(roles))
      from pg_policies
      where tablename in ('growth_shares','growth_referral_attributions')
    ),
    'no_anon_policies', (
      select count(*) = 0
      from pg_policies
      where tablename in ('growth_shares','growth_referral_attributions')
        and 'anon' = any(roles)
    ),
    'ab_new_customer', (select status = 'customer_created' and introduced_customer_id is not null from ins_attr_new),
    'attribution_a_to_b', (
      select introducer_customer_id = (select customer_a_id from ids)
         and introduced_customer_id is not null
      from ins_attr_new
    ),
    'duplicate_phone_link', (
      select linked_existing_customer = true
         and introduced_customer_id = (select customer_existing_b_id from ids)
      from ins_attr_dup
    ),
    'name_only_pending', (
      select status = 'submitted' and introduced_customer_id is null from ins_attr_name
    ),
    'active_share_token_present', (select length(active_token_hex) >= 32 from ids),
    'paused_share_status', (
      select status = 'paused' from public.growth_shares where id = (select pause_share_id from ids)
    ),
    'expired_share_past', (
      select expires_at < now() from public.growth_shares where id = (select expired_share_id from ids)
    ),
    'pending_consent_status', (
      select status = 'pending_consent' from public.growth_shares where id = (select pending_share_id from ids)
    ),
    'friend_benefit_label', (
      select benefit_json->>'benefitLabel' = '朋友專屬體驗'
      from public.growth_shares where id = (select pause_share_id from ids)
    ),
    'referral_center_readback', (
      select count(*) >= 1 from public.growth_referral_attributions
      where share_id = (select share_id from ids)
    ),
    'active_token_hex_for_preview_api', (select active_token_hex from ids),
    'pause_token_hex', (select pause_token_hex from ids),
    'expired_token_hex', (select expired_token_hex from ids),
    'pending_token_hex', (select pending_token_hex from ids)
  ) as result
),
-- cleanup fixtures
del_attrs as (
  delete from public.growth_referral_attributions
  where share_id in (select share_id from ids)
     or share_id in (select pause_share_id from ids)
     or share_id in (select expired_share_id from ids)
     or share_id in (select pending_share_id from ids)
  returning 1
),
del_shares as (
  delete from public.growth_shares
  where id in (
    select share_id from ids
    union all select pause_share_id from ids
    union all select expired_share_id from ids
    union all select pending_share_id from ids
  )
  returning 1
),
del_opp as (
  delete from public.growth_opportunities
  where id = (select opportunity_id from ids)
  returning 1
),
del_customers as (
  delete from public.customers
  where note like 'phase4f-gate-live-%'
  returning 1
)
select result || jsonb_build_object(
  'cleanup_attrs', (select count(*) from del_attrs),
  'cleanup_shares', (select count(*) from del_shares),
  'cleanup_opp', (select count(*) from del_opp),
  'cleanup_customers', (select count(*) from del_customers)
) as phase4f_live_gate
from verify;
