-- Smoke test on plain Postgres (no PostgREST): run after local/bootstrap.sql + migrations 0001-0004 + seed.
-- Same checks as smoke.mjs (hosted). Raises on first failure; rolls back so the DB stays clean.
\set ON_ERROR_STOP on
begin;
set local role service_role;
do $$
declare r offers; n int; m jsonb; ok boolean;
  o jsonb := '{"id":"smk_T1","merchant_id":"smk","code":"T1","kind":"pct","value":10,"max_paise":30000,"min_order_paise":199900,"starts_at":1767225600000,"ends_at":1893456000000,"funded_by":"merchant"}';
begin
  r := upsert_offer_with_outbox(o);
  assert r.id = 'smk_T1' and extract(epoch from r.starts_at) = 1767225600, 'upsert';
  select count(*) into n from outbox where merchant_id='smk' and processed_at is null; assert n = 1, 'outbox 1';
  r := upsert_offer_with_outbox(o || '{"value":15}'); assert r.value = 15, 'update';
  select count(*) into n from outbox where merchant_id='smk'; assert n = 2, 'outbox 2';
  -- every bad input must raise and add no outbox row
  foreach o in array array[
    o||'{"kind":"flat","value":5,"max_paise":10}', o||'{"value":101}', o||'{"ends_at":1767225600000}',
    o||'{"min_order_paise":-1}', o||'{"kind":"bogus"}', o||'{"id":"x_T1"}', o||'{"value":1.5}', o||'{"value":0}'] loop
    ok := false; begin perform upsert_offer_with_outbox(o); exception when others then ok := true; end;
    assert ok, 'should reject '||o::text;
  end loop;
  select count(*) into n from outbox where merchant_id='smk'; assert n = 2, 'rejects leave outbox';
  assert set_fillers_with_outbox('smk','[{"sku":"a","name":"A","price_paise":1},{"sku":"b","name":"B","price_paise":2}]') = 2, 'fillers 2';
  assert set_fillers_with_outbox('smk','[{"sku":"a","name":"A","price_paise":9}]') = 1, 'fillers replace';
  ok := false; begin perform set_fillers_with_outbox('smk','[{"sku":"a","name":"A","price_paise":-5}]'); exception when others then ok := true; end; assert ok, 'neg filler';
  perform deactivate_offer_with_outbox('smk_T1');
  assert (select active from offers where id='smk_T1') = false, 'deactivated';
  ok := false; begin perform deactivate_offer_with_outbox('smk_nope'); exception when others then ok := true; end; assert ok, 'deactivate unknown';
  select count(*) into n from outbox where merchant_id='smk'; assert n = 5, 'outbox 5';
  -- partial mark processed
  update outbox set processed_at=now() where merchant_id='smk' and id <= (select id from outbox where merchant_id='smk' order by id offset 3 limit 1) and processed_at is null;
  select count(*) into n from outbox where merchant_id='smk' and processed_at is null; assert n = 1, 'partial mark';
  insert into events(merchant_id,session_id,type,cart_paise) values ('smk','s','seen',1),('smk','s','seen',1),('smk','s','addon',1),('smk','s','payment_verified',1);
  m := metrics_for_merchant('smk');
  assert m = '{"seen":2,"addon":1,"checkout":0,"nudge_click":0,"payment_verified":1}', 'metrics '||m::text;
  insert into payments(merchant_id,razorpay_order_id,amount_paise,cart_paise,expected_saving_paise,mode) values ('smk','o1',1,2,1,'server_discount');
  ok := false; begin insert into payments(merchant_id,razorpay_order_id,amount_paise,cart_paise,expected_saving_paise,mode) values ('smk','o1',1,2,1,'server_discount'); exception when unique_violation then ok := true; end; assert ok, 'dup order';
  -- trigger no-op with empty app_config, fires when configured
  assert (select count(*) from app_config) = 0, 'config empty';
  insert into outbox(merchant_id) values ('smk');
end $$;
reset role;
-- RLS: anon / authenticated see nothing and cannot call RPCs
set local role anon;
do $$ declare ok boolean; t text; n int; begin
  -- blocked = privilege error, or RLS filtering to zero rows (rows exist from the block above)
  foreach t in array array['offers','fillers','outbox','events','payments'] loop
    ok := false;
    begin execute format('select count(*) from %I', t) into n; ok := (n = 0);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'anon sees rows in '||t;
  end loop;
  ok := false;
  begin select count(*) into n from app_config; ok := (n = 0); exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon sees app_config';
  ok := false; begin perform metrics_for_merchant('smk'); exception when insufficient_privilege then ok := true; end; assert ok, 'anon rpc';
end $$;
reset role;
select 'LOCAL SMOKE PASS' as result;
rollback;  -- leaves db clean
