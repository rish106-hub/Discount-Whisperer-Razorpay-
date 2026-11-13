-- 0004_outbox_trigger: on each outbox insert, ping the Worker's /internal/rebuild via pg_net.
-- Config comes from app_config (T7 sets rebuild_url + rebuild_secret after deploy). Missing -> no-op.
-- pg_net exists on hosted Supabase only; plain Postgres skips it (net.http_post resolves at runtime).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

create or replace function public.outbox_notify()
returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.app_config where key = 'rebuild_url';
  select value into v_secret from public.app_config where key = 'rebuild_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return new; end if;
  begin
    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object('merchant_id', new.merchant_id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-rebuild-secret', v_secret));
  exception when others then
    -- never fail the write because the ping failed; the cron reconciler catches it
    raise warning 'outbox_notify failed: %', sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.outbox_notify() from public, anon, authenticated;

drop trigger if exists outbox_after_insert on public.outbox;
create trigger outbox_after_insert after insert on public.outbox
  for each row execute function public.outbox_notify();
