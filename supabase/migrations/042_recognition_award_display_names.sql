-- Display-copy correction: “第三個月過關” is not part of official award names.
-- Eligibility slugs and photo flags are unchanged.

update public.recognition_award_definitions
set name = 'MAP 第三個月', updated_at = now()
where slug = 'map_month_3_pass'
  and name <> 'MAP 第三個月';

update public.recognition_award_definitions
set name = '新科推廣組', updated_at = now()
where slug = 'new_promo_pass'
  and name <> '新科推廣組';

update public.recognition_award_definitions
set name = '新科RO2500推廣組', updated_at = now()
where slug = 'new_ro2500_promo_pass'
  and name <> '新科RO2500推廣組';

update public.recognition_award_definitions
set name = '新科富豪組', updated_at = now()
where slug = 'new_wealth_pass'
  and name <> '新科富豪組';

update public.recognition_award_definitions
set name = 'RO7500富豪組', updated_at = now()
where slug = 'ro7500_wealth_pass'
  and name <> 'RO7500富豪組';

update public.recognition_award_definitions
set name = '新科總裁組', updated_at = now()
where slug = 'new_president_pass'
  and name <> '新科總裁組';
