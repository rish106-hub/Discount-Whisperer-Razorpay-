-- 0003_rls: RLS on every table, deliberately NO policies. anon/authenticated get nothing;
-- service_role bypasses RLS. Also drop table grants for defense in depth.
alter table public.offers     enable row level security;
alter table public.fillers    enable row level security;
alter table public.outbox     enable row level security;
alter table public.events     enable row level security;
alter table public.payments   enable row level security;
alter table public.app_config enable row level security;

revoke all on public.offers, public.fillers, public.outbox, public.events, public.payments, public.app_config
  from anon, authenticated;
