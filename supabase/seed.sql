-- Golden merchant m1 (Shantipur Tant House), from packages/contracts/fixtures/golden.json sets.m1.
-- razorpay_offer_id stays NULL. Idempotent. Times: 1767225600000 = 2026-01-01Z, 1893456000000 = 2030-01-01Z.
insert into public.offers (id, merchant_id, code, kind, value, max_paise, min_order_paise, method, starts_at, ends_at, funded_by, razorpay_offer_id, active, updated_at) values
 ('m1_O1','m1','O1','pct',10,30000,199900,null,   to_timestamp(1767225600), to_timestamp(1893456000),'merchant',null,true,to_timestamp(1767225600)),
 ('m1_O2','m1','O2','flat',25000,null,249900,'HDFC_CC',to_timestamp(1767225600), to_timestamp(1893456000),'bank',null,true,to_timestamp(1767225600)),
 ('m1_O3','m1','O3','cashback_pct',5,null,0,'UPI', to_timestamp(1767225600), to_timestamp(1893456000),'merchant',null,true,to_timestamp(1767225600))
on conflict (id) do update set kind=excluded.kind, value=excluded.value, max_paise=excluded.max_paise,
  min_order_paise=excluded.min_order_paise, method=excluded.method, starts_at=excluded.starts_at,
  ends_at=excluded.ends_at, funded_by=excluded.funded_by, active=excluded.active;

insert into public.fillers (merchant_id, sku, name, price_paise) values
 ('m1','gamcha','Gamcha',19900),
 ('m1','handloom-stole','Handloom stole',44900),
 ('m1','silk-potli-bag','Silk potli bag',69900),
 ('m1','tant-saree','Tant saree',129900)
on conflict (merchant_id, sku) do update set name=excluded.name, price_paise=excluded.price_paise;
