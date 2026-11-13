# T3 report: supabase-db

Branch `dw-t3-supabase-4c9876`. Status: **SQL done and verified on local Postgres 17. NOT yet applied to hosted project** (SUPABASE_* vars not visible in agent shell). Hosted acceptance pending.

## Files (all under `supabase/`)
migrations `0001_tables`, `0002_rpc`, `0003_rls`, `0004_outbox_trigger`; `seed.sql` (m1, razorpay_offer_id NULL); `tests/smoke.mjs` (hosted, zero-dep fetch->PostgREST); `tests/local.sql` (plain-Postgres equivalent); `README.md`.

## Local verification (throwaway PG17 over unix socket; roles anon/authenticated/service_role + stub `net.http_post`)
| Check | Result |
|---|---|
| 4 migrations + seed apply; re-run 0001/0002/seed | pass, idempotent |
| `tests/local.sql` (RPC happy paths, 8 bad-input rejects with no outbox row, fillers replace/neg/count, deactivate unknown raises, partial outbox mark, metrics counts, payments unique order id, outbox insert with empty app_config) | `LOCAL SMOKE PASS` |
| Trigger: no-op with empty app_config; with config posts `{"merchant_id": ...}` + `x-rebuild-secret` | pass (manual run, stubbed net) |
| RLS: all 6 tables `relrowsecurity = t`, `pg_policies` count 0 | pass |
| anon select (granted SELECT on purpose) returns 0 rows; anon without grant gets "permission denied"; anon cannot call RPCs | pass |

## Not verified (needs hosted project)
- Real `pg_net` extension + `net.http_post` signature on hosted Supabase.
- `node supabase/tests/smoke.mjs` (syntax-checked only). Local PostgREST test was blocked (would expose PG on all interfaces); used SQL equivalent instead.
- Anon-key REST check on hosted.

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
