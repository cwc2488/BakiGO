-- Phase 4f VERIFY + revoke (run after Preview smoke POSTs)
-- Confirms A→B attribution, duplicate link, then revokes active share.

with base as (
  select
    'dddddddd-4f01-4000-8000-0000000000d1'::uuid as share_id,
    'aaaaaaaa-4f01-4000-8000-0000000000a1'::uuid as customer_a_id,
    'bbbbbbbb-4f01-4000-8000-0000000000b1'::uuid as existing_b_id
),
attrs as (
  select *
  from public.growth_referral_attributions
  where share_id = (select share_id from base)
),
new_b as (
  select *
  from attrs
  where linked_existing_customer = false
    and introduced_customer_id is not null
    and status = 'customer_created'
  order by created_at desc
  limit 1
),
dup_b as (
  select *
  from attrs
  where linked_existing_customer = true
    and introduced_customer_id = (select existing_b_id from base)
  order by created_at desc
  limit 1
),
revoke_share as (
  update public.growth_shares
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = (select share_id from base)
  returning id, status, revoked_at
)
select jsonb_build_object(
  'attribution_count', (select count(*) from attrs),
  'ab_new_customer', (
    select jsonb_build_object(
      'ok', true,
      'introducer', introducer_customer_id,
      'introduced', introduced_customer_id,
      'status', status,
      'friend', lead_display_name,
      'phone', lead_phone,
      'goal', lead_goal_text
    )
    from new_b
  ),
  'duplicate_phone_link', (
    select jsonb_build_object(
      'ok', linked_existing_customer = true
           and introduced_customer_id = (select existing_b_id from base),
      'introduced', introduced_customer_id,
      'linked', linked_existing_customer,
      'friend', lead_display_name
    )
    from dup_b
  ),
  'attribution_survives', (
    select introducer_customer_id = (select customer_a_id from base)
       and introduced_customer_id is not null
    from new_b
  ),
  'referral_center_readback', (
    select count(*) >= 1 from attrs where status in ('submitted','customer_created')
  ),
  'a_is_introducer', (
    select bool_and(introducer_customer_id = (select customer_a_id from base)) from attrs
  ),
  'revoked', (select status from revoke_share),
  'friend_benefit_label_ok', (
    select benefit_json->>'benefitLabel' = '朋友專屬體驗'
    from public.growth_shares
    where id = 'eeeeeeee-4f01-4000-8000-0000000000e1'::uuid
  ),
  'no_fake_discount', (
    select coalesce(benefit_json->>'benefitLabel','') not like '%折扣%'
       and coalesce(benefit_json->>'benefitLabel','') not like '%VP%'
    from public.growth_shares
    where id = 'eeeeeeee-4f01-4000-8000-0000000000e1'::uuid
  )
) as verify;
