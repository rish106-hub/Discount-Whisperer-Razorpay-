-- LOCAL ONLY (plain Postgres). Not a migration. Hosted Supabase already has these roles/schema.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase default privileges on new public tables/functions; migrations then revoke/grant as needed.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
