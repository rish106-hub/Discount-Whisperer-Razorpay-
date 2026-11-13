-- 0001_tables: all tables. Money = integer paise. Idempotent.
create table if not exists public.offers (
  id                text primary key,
  merchant_id       text not null,
  code              text not null,
  kind              text not null check (kind in ('pct','flat','cashback_pct')),
  value             integer not null check (value > 0),
  max_paise         integer check (max_paise is null or max_paise >= 0),
  min_order_paise   integer not null default 0 check (min_order_paise >= 0),
  method            text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  funded_by         text not null check (funded_by in ('merchant','bank')),
  razorpay_offer_id text,
  active            boolean not null default true,
  updated_at        timestamptz not null default now(),
  constraint offers_window check (ends_at > starts_at),
  constraint offers_pct_range check (kind = 'flat' or value between 1 and 100),
  constraint offers_flat_no_cap check (kind <> 'flat' or max_paise is null)
);
create index if not exists offers_merchant_active_idx on public.offers (merchant_id, active);

create table if not exists public.fillers (
  merchant_id text not null,
  sku         text not null,
  name        text not null,
  price_paise integer not null check (price_paise >= 0),
  primary key (merchant_id, sku)
);

create table if not exists public.outbox (
  id           bigserial primary key,
  merchant_id  text not null,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists outbox_pending_idx on public.outbox (merchant_id, id) where processed_at is null;

create table if not exists public.events (
  id         bigserial primary key,
  merchant_id text not null,
  session_id text not null,
  type       text not null check (type in ('seen','nudge_click','addon','checkout','payment_verified')),
  cart_paise integer not null check (cart_paise >= 0),
  offer_id   text,
  created_at timestamptz not null default now()
);
create index if not exists events_merchant_type_idx on public.events (merchant_id, type);

create table if not exists public.payments (
  id                  bigserial primary key,
  merchant_id         text not null,
  offer_id            text,
  razorpay_order_id   text not null unique,
  razorpay_payment_id text unique,
  amount_paise        integer not null check (amount_paise >= 0),
  cart_paise          integer not null check (cart_paise >= 0),
  expected_saving_paise integer not null check (expected_saving_paise >= 0),
  mode                text not null check (mode in ('razorpay_offer','server_discount')),
  status              text not null default 'created' check (status in ('created','verified','failed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
