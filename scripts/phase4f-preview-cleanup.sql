-- Phase 4f CLEANUP after gate
delete from public.growth_referral_attributions
where share_id in (
  'dddddddd-4f01-4000-8000-0000000000d1'::uuid,
  'eeeeeeee-4f01-4000-8000-0000000000e1'::uuid,
  'ffffffff-4f01-4000-8000-0000000000f1'::uuid,
  '11111111-4f01-4000-8000-000000000011'::uuid
)
or introducer_customer_id = 'aaaaaaaa-4f01-4000-8000-0000000000a1'::uuid;

delete from public.growth_shares
where id in (
  'dddddddd-4f01-4000-8000-0000000000d1'::uuid,
  'eeeeeeee-4f01-4000-8000-0000000000e1'::uuid,
  'ffffffff-4f01-4000-8000-0000000000f1'::uuid,
  '11111111-4f01-4000-8000-000000000011'::uuid
);

delete from public.growth_opportunities
where id = 'cccccccc-4f01-4000-8000-0000000000c1'::uuid;

delete from public.customers
where id in (
  'aaaaaaaa-4f01-4000-8000-0000000000a1'::uuid,
  'bbbbbbbb-4f01-4000-8000-0000000000b1'::uuid
)
or note like 'phase4f-gate-live-%'
or (display_name like '4fLiveB-%');

select jsonb_build_object(
  'remaining_shares', (
    select count(*) from public.growth_shares
    where id = 'dddddddd-4f01-4000-8000-0000000000d1'::uuid
  ),
  'remaining_fixture_customers', (
    select count(*) from public.customers
    where note like 'phase4f-gate-live-%'
       or display_name like '4fLive%'
       or id in (
         'aaaaaaaa-4f01-4000-8000-0000000000a1'::uuid,
         'bbbbbbbb-4f01-4000-8000-0000000000b1'::uuid
       )
  )
) as cleanup;
