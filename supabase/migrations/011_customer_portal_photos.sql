-- Extend customer portal RPC with before/after progress photos.

create or replace function public.get_customer_portal_by_token(portal_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_customer_id uuid;
  result jsonb;
begin
  select customer_id into matched_customer_id
  from public.customer_portal_tokens
  where token = portal_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if matched_customer_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'displayName', c.display_name,
    'heightCm', c.height_cm,
    'records', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'recordDate', r.record_date,
          'weightKg', r.weight_kg,
          'bodyFatPercent', r.body_fat_percent,
          'visceralFatLevel', r.visceral_fat_level,
          'bodyAge', r.body_age,
          'basalMetabolicRate', r.basal_metabolic_rate,
          'bmi', r.bmi
        )
        order by r.record_date desc
      )
      from public.body_composition_records r
      where r.customer_id = matched_customer_id
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'phase', p.phase,
          'angle', p.angle,
          'photoDate', p.photo_date,
          'imageDataUrl', p.image_data_url
        )
        order by p.photo_date desc
      )
      from public.customer_progress_photos p
      where p.customer_id = matched_customer_id
        and p.image_data_url is not null
    ), '[]'::jsonb)
  )
  into result
  from public.customers c
  where c.id = matched_customer_id;

  return result;
end;
$$;

revoke all on function public.get_customer_portal_by_token(text) from public;
grant execute on function public.get_customer_portal_by_token(text) to anon, authenticated;
