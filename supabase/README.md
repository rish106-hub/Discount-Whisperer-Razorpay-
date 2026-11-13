# supabase (T3)

Migrations, seed and smoke test for the Discount Whisperer database. Names match `packages/contracts/src/db.ts`.

| File | What |
|---|---|
| `migrations/0001_tables.sql` | offers, fillers, outbox, events, payments (incl. `cart_paise`, `mode`), app_config. Idempotent. |
| `migrations/0002_rpc.sql` | 4 RPCs, SECURITY INVOKER, `search_path = public, pg_temp`. Execute granted to `service_role` only. |
| `migrations/0003_rls.sql` | RLS on every table, no policies; grants revoked from anon/authenticated. |
| `migrations/0004_outbox_trigger.sql` | `pg_net` extension + SECURITY DEFINER trigger on `outbox` insert. |
| `seed.sql` | Golden merchant m1 only; `razorpay_offer_id` NULL. |
| `tests/smoke.mjs` | Zero-dep (fetch -> PostgREST) end-to-end check; cleans up merchant `smoke_t3`. |

## Apply
```bash
for f in supabase/migrations/*.sql; do psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql   # optional, m1 demo data
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... [SUPABASE_ANON_KEY=...] node supabase/tests/smoke.mjs
```
Export the three vars in your shell; never put them in files.

## Contract notes (for T2 / T4 / T7)
- `upsert_offer_with_outbox(p_offer jsonb)`: keys are snake_case column names; `starts_at`/`ends_at` may be **epoch ms numbers** or ISO strings; `id` must equal `merchant_id || '_' || code`. Raises (`invalid_offer: ...`) on bad kind, non-integer/non-positive value, pct > 100, flat with `max_paise`, `ends_at <= starts_at`, negative paise, id owned by another merchant. Returned `starts_at`/`ends_at`/`updated_at` are ISO strings; the repo converts to epoch ms.
- `set_fillers_with_outbox`: max 20, unique sku, integer `price_paise >= 0`. Returns count.
- `deactivate_offer_with_outbox`: raises `offer_not_found` if the id does not exist (map to `false`/404). It does not take a merchant id, so the route must check ownership first.
- Outbox: `pendingOutboxMaxId` = `select max(id) from outbox where merchant_id=$1 and processed_at is null`; `markOutboxProcessed` = `update outbox set processed_at=now() where merchant_id=$1 and id<=$2 and processed_at is null`. Partial index covers both.
- Trigger: POSTs `{"merchant_id": ...}` with header `x-rebuild-secret` to `app_config.rebuild_url`. No-op if either key is missing/empty; a failed ping only raises a WARNING (the cron reconciler is the safety net). **T7** sets, after deploy:
  `insert into app_config(key,value) values ('rebuild_url','https://<worker>/internal/rebuild'),('rebuild_secret','<secret>') on conflict (key) do update set value=excluded.value;`
- All RPCs and tables are unreachable with the anon key; only the service-role key (Worker only) works.
