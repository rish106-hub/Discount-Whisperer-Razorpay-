# T3 report: supabase-db

Branch `dw-t3-supabase-4c9876`. Status: **SQL done and verified on local plain Postgres 17. NOT applied to hosted project** (moved to T7 after checkpoint 2).

## Files (all under `supabase/`)
migrations `0001_tables`, `0002_rpc`, `0003_rls`, `0004_outbox_trigger`; `seed.sql` (m1, razorpay_offer_id NULL); `local/bootstrap.sql` (local roles only); `tests/smoke.sql` (plain PG); `tests/smoke.mjs` (hosted, zero-dep fetch->PostgREST, unrun); `README.md`.

## Local verification (plain PG17, `~/.dw-pg`, port 54322, db `dw`; conn `postgresql://postgres@127.0.0.1:54322/dw`, trust auth, no password)
Start: `pg_ctl -D ~/.dw-pg/data -o "-p 54322 -k $HOME/.dw-pg -c listen_addresses=127.0.0.1" -l ~/.dw-pg/log start`. Left running for T7.
| Check | Result |
|---|---|
| bootstrap + 0001..0004 + seed applied twice | pass, idempotent (offers 3, fillers 4) |
| `tests/smoke.sql`: RPC happy paths, 8 bad inputs rejected w/o outbox row, fillers replace/neg/count, deactivate unknown raises, partial outbox mark, metrics counts, payments unique order id, outbox insert with empty app_config | `LOCAL SMOKE PASS` (rolls back; tables clean after) |
| RLS: 6 tables `relrowsecurity = t`, `pg_policies` = 0; anon blocked, anon cannot call RPCs | pass |
| 0004 on plain PG (no pg_net) | pass; DO block skips extension |

## Only hosted can verify (T7)
- Real `pg_net` `net.http_post` call and `x-rebuild-secret` delivery to the Worker (earlier stub run showed correct args only).
- PostgREST / supabase-js path: `node supabase/tests/smoke.mjs`, and anon-key REST check (`SUPABASE_ANON_KEY`).
- Hosted apply of migrations (G5: T3 owns; env vars not in agent shell).

## Notes for T2
- `p_offer` keys snake_case; `starts_at`/`ends_at` accept epoch ms or ISO. Returned timestamps are ISO strings -> convert to ms.
- `id` must equal `merchant_id_code`. Errors are raised as `invalid_offer: ...` (PostgREST 400).
- `deactivate_offer_with_outbox` raises `offer_not_found`; takes no merchant id, check ownership in route.
- `set_fillers_with_outbox` enforces max 20, unique sku, int price >= 0.
- Outbox helpers are plain queries: max(id) where merchant_id and processed_at is null; update ... id <= upTo.
- Only `service_role` can execute RPCs.

## Notes for T7
After deploy: `insert into app_config(key,value) values ('rebuild_url','https://<worker>/internal/rebuild'),('rebuild_secret','<secret>') on conflict (key) do update set value=excluded.value;` Trigger ping failure only warns; cron reconciler is the safety net. Apply: `for f in supabase/migrations/*.sql; do psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done`.

## Requests
None.
