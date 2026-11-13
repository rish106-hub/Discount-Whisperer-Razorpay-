-- 0002_rpc: write paths. SECURITY INVOKER (service role calls them), explicit search_path,
-- each function body is one transaction.

-- p_offer keys = offers column names. starts_at/ends_at accept epoch ms (number) or ISO string.
create or replace function public.upsert_offer_with_outbox(p_offer jsonb)
returns public.offers
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_id text := p_offer->>'id';
  v_merchant text := p_offer->>'merchant_id';
  v_code text := p_offer->>'code';
  v_kind text := p_offer->>'kind';
  v_value bigint;
  v_max bigint;
  v_min bigint;
  v_starts timestamptz;
  v_ends timestamptz;
  v_funded text := p_offer->>'funded_by';
  v_method text := nullif(p_offer->>'method', '');
  v_rzp text := nullif(p_offer->>'razorpay_offer_id', '');
  v_active boolean := coalesce((p_offer->>'active')::boolean, true);
  v_row public.offers;
begin
  if p_offer is null or jsonb_typeof(p_offer) <> 'object' then raise exception 'invalid_offer: not an object'; end if;
  if v_merchant is null or v_merchant = '' or v_code is null or v_code = '' then
    raise exception 'invalid_offer: merchant_id and code required';
  end if;
  if v_id is null or v_id <> v_merchant || '_' || v_code then
    raise exception 'invalid_offer: id must be merchant_id_code';
  end if;
  if v_kind is null or v_kind not in ('pct','flat','cashback_pct') then raise exception 'invalid_offer: kind'; end if;
  if v_funded is null or v_funded not in ('merchant','bank') then raise exception 'invalid_offer: funded_by'; end if;
  if jsonb_typeof(p_offer->'value') is distinct from 'number' then raise exception 'invalid_offer: value must be a number'; end if;
  v_value := (p_offer->>'value')::numeric::bigint;
  if (p_offer->>'value')::numeric <> v_value then raise exception 'invalid_offer: value must be an integer'; end if;
  if v_value < 1 then raise exception 'invalid_offer: value must be positive'; end if;
  if v_kind <> 'flat' and v_value > 100 then raise exception 'invalid_offer: percent value must be 1..100'; end if;
  if v_value > 2147483647 then raise exception 'invalid_offer: value too large'; end if;

  if jsonb_typeof(p_offer->'max_paise') = 'number' then
    v_max := (p_offer->>'max_paise')::numeric::bigint;
    if v_max < 0 or v_max > 2147483647 then raise exception 'invalid_offer: max_paise out of range'; end if;
  elsif p_offer->'max_paise' is null or jsonb_typeof(p_offer->'max_paise') = 'null' then
    v_max := null;
  else raise exception 'invalid_offer: max_paise'; end if;
  if v_kind = 'flat' and v_max is not null then raise exception 'invalid_offer: flat offer must have null max_paise'; end if;

  v_min := coalesce((p_offer->>'min_order_paise')::numeric::bigint, 0);
  if v_min < 0 or v_min > 2147483647 then raise exception 'invalid_offer: min_order_paise out of range'; end if;

  if jsonb_typeof(p_offer->'starts_at') = 'number' then v_starts := to_timestamp((p_offer->>'starts_at')::numeric / 1000.0);
  else v_starts := (p_offer->>'starts_at')::timestamptz; end if;
  if jsonb_typeof(p_offer->'ends_at') = 'number' then v_ends := to_timestamp((p_offer->>'ends_at')::numeric / 1000.0);
  else v_ends := (p_offer->>'ends_at')::timestamptz; end if;
  if v_starts is null or v_ends is null then raise exception 'invalid_offer: starts_at and ends_at required'; end if;
  if v_ends <= v_starts then raise exception 'invalid_offer: ends_at must be after starts_at'; end if;

  insert into public.offers as o (id, merchant_id, code, kind, value, max_paise, min_order_paise, method,
                                  starts_at, ends_at, funded_by, razorpay_offer_id, active, updated_at)
  values (v_id, v_merchant, v_code, v_kind, v_value::int, v_max::int, v_min::int, v_method,
          v_starts, v_ends, v_funded, v_rzp, v_active, now())
  on conflict (id) do update set
    kind = excluded.kind, value = excluded.value, max_paise = excluded.max_paise,
    min_order_paise = excluded.min_order_paise, method = excluded.method,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, funded_by = excluded.funded_by,
    razorpay_offer_id = excluded.razorpay_offer_id, active = excluded.active, updated_at = now()
  where o.merchant_id = excluded.merchant_id
  returning * into v_row;

  if v_row.id is null then raise exception 'invalid_offer: id belongs to another merchant'; end if;
  insert into public.outbox (merchant_id) values (v_merchant);
  return v_row;
end $$;

-- p_fillers = [{sku, name, price_paise}]. Replaces all fillers for the merchant; returns new count.
create or replace function public.set_fillers_with_outbox(p_merchant_id text, p_fillers jsonb)
returns integer
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_merchant_id is null or p_merchant_id = '' then raise exception 'invalid_fillers: merchant_id required'; end if;
  if p_fillers is null or jsonb_typeof(p_fillers) <> 'array' then raise exception 'invalid_fillers: array required'; end if;
  if jsonb_array_length(p_fillers) > 20 then raise exception 'invalid_fillers: max 20'; end if;
  if exists (select 1 from jsonb_array_elements(p_fillers) f
             where jsonb_typeof(f) <> 'object' or coalesce(f->>'sku','') = '' or coalesce(f->>'name','') = ''
                or jsonb_typeof(f->'price_paise') is distinct from 'number'
                or (f->>'price_paise')::numeric < 0 or (f->>'price_paise')::numeric <> trunc((f->>'price_paise')::numeric)
                or (f->>'price_paise')::numeric > 2147483647) then
    raise exception 'invalid_fillers: each needs sku, name, integer price_paise >= 0';
  end if;
  if (select count(distinct f->>'sku') from jsonb_array_elements(p_fillers) f) <> jsonb_array_length(p_fillers) then
    raise exception 'invalid_fillers: duplicate sku';
  end if;

  delete from public.fillers where merchant_id = p_merchant_id;
  insert into public.fillers (merchant_id, sku, name, price_paise)
  select p_merchant_id, f->>'sku', f->>'name', (f->>'price_paise')::int from jsonb_array_elements(p_fillers) f;
  get diagnostics v_count = row_count;
  insert into public.outbox (merchant_id) values (p_merchant_id);
  return v_count;
end $$;

-- Soft delete. Raises 'offer_not_found' if missing so the caller can map it to false/404.
create or replace function public.deactivate_offer_with_outbox(p_offer_id text)
returns void
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v_merchant text;
begin
  update public.offers set active = false, updated_at = now() where id = p_offer_id returning merchant_id into v_merchant;
  if v_merchant is null then raise exception 'offer_not_found'; end if;
  insert into public.outbox (merchant_id) values (v_merchant);
end $$;

create or replace function public.metrics_for_merchant(p_merchant_id text)
returns jsonb
language sql stable security invoker set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'seen',             count(*) filter (where type = 'seen'),
    'nudge_click',      count(*) filter (where type = 'nudge_click'),
    'addon',            count(*) filter (where type = 'addon'),
    'checkout',         count(*) filter (where type = 'checkout'),
    'payment_verified', count(*) filter (where type = 'payment_verified'))
  from public.events where merchant_id = p_merchant_id;
$$;

-- Only the service role may call these (revoke the default PUBLIC execute).
revoke all on function public.upsert_offer_with_outbox(jsonb) from public, anon, authenticated;
revoke all on function public.set_fillers_with_outbox(text, jsonb) from public, anon, authenticated;
revoke all on function public.deactivate_offer_with_outbox(text) from public, anon, authenticated;
revoke all on function public.metrics_for_merchant(text) from public, anon, authenticated;
grant execute on function public.upsert_offer_with_outbox(jsonb) to service_role;
grant execute on function public.set_fillers_with_outbox(text, jsonb) to service_role;
grant execute on function public.deactivate_offer_with_outbox(text) to service_role;
grant execute on function public.metrics_for_merchant(text) to service_role;
