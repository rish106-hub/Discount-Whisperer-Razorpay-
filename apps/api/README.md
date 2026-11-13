# @dw/api: Discount Whisperer Worker

Hono on Cloudflare Workers. Ladders in KV (`ladder:{merchantId}`), source of truth in Supabase.

## Local run
```bash
cp .dev.vars.example .dev.vars   # fill test values; never commit .dev.vars
pnpm --filter @dw/api dev        # wrangler dev, http://localhost:8787
pnpm --filter @dw/api test       # vitest, in-memory Repo + fake KV
```
Cron locally: `wrangler dev --test-scheduled`, then `curl "localhost:8787/__scheduled?cron=*/5+*+*+*+*"`.

## curl examples
```bash
API=http://localhost:8787; T=$ADMIN_TOKEN

curl $API/healthz

# create offer (rebuild is kicked automatically)
curl -X POST $API/v1/admin/merchants/m1/offers -H "authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"code":"O1","kind":"pct","value":10,"maxPaise":30000,"minOrderPaise":199900,"startsAt":1767225600000,"endsAt":1893456000000,"fundedBy":"merchant"}'

# patch / delete
curl -X PATCH  $API/v1/admin/merchants/m1/offers/m1_O1 -H "authorization: Bearer $T" -d '{"value":12}'
curl -X DELETE $API/v1/admin/merchants/m1/offers/m1_O1 -H "authorization: Bearer $T"

# fillers (max 20)
curl -X PUT $API/v1/admin/merchants/m1/fillers -H "authorization: Bearer $T" \
  -d '[{"sku":"gamcha","name":"Gamcha","pricePaise":19900}]'

# force rebuild, then read the ladder (ETag + 304)
curl -X POST $API/v1/admin/merchants/m1/rebuild -H "authorization: Bearer $T"
curl -i $API/v1/ladder/m1
curl -i $API/v1/ladder/m1 -H 'if-none-match: "<version>"'

# internal rebuild (what the Supabase trigger calls)
curl -X POST $API/internal/rebuild -H "x-rebuild-secret: $REBUILD_HOOK_SECRET" -d '{"merchant_id":"m1"}'

# checkout validate (always re-reads Supabase)
curl -X POST $API/v1/checkout/validate -d '{"merchantId":"m1","cartPaise":260000,"method":"HDFC_CC","offerId":"m1_O2"}'

# events (sendBeacon style, text/plain) and metrics
curl -X POST $API/v1/events -H 'content-type: text/plain' -d '{"merchantId":"m1","sessionId":"sess-12345678","type":"seen","cartPaise":180000}'
curl $API/v1/metrics/m1
```

## Notes
- Errors are always `{error, detail?}`. One JSON log line per request; secrets are never logged.
- Drills: `DEBUG_SLOW_LADDER_MS`, `DEBUG_FAIL_REBUILD` (fails the first rebuild per isolate).
- `wrangler.toml` has a placeholder KV id; T7 sets the real one after checkpoint 2.
- `@dw/offer-core` comes from T1. Until it is merged, tests use `test/standin/offer-core.ts` (see REPORT.md).
