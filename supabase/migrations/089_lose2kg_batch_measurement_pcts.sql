-- lose2kg: batch update measurement percentages only (additive)
-- NEVER mutates weight_kg / measured_at / created_at.

create or replace function public.lose2kg_batch_update_measurement_pcts(
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'invalid_pct_updates' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_updates) = 0 then
    return;
  end if;

  -- Only weight_change_pct + updated_at. Identifying key: id.
  update public.lose2kg_measurements m
  set
    weight_change_pct = case
      when u.elem->>'weight_change_pct' is null
        or u.elem->>'weight_change_pct' = 'null'
      then null
      else (u.elem->>'weight_change_pct')::numeric
    end,
    updated_at = coalesce(
      nullif(u.elem->>'updated_at', '')::timestamptz,
      now()
    )
  from jsonb_array_elements(p_updates) as u(elem)
  where m.id = (u.elem->>'id')::uuid;
end;
$$;

revoke all on function public.lose2kg_batch_update_measurement_pcts(jsonb)
  from public, anon, authenticated;

grant execute on function public.lose2kg_batch_update_measurement_pcts(jsonb)
  to service_role;

comment on function public.lose2kg_batch_update_measurement_pcts(jsonb) is
  'Lose2kg-only: batch-update measurement percentage columns only. Does not rewrite stored weights or measurement timestamps.';
