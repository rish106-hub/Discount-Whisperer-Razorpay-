# Runbook

Local operations for Discount Whisperer. Local targets only. Secrets come from the shell environment and are never written to files or logs.

## Prerequisites

- Node 22 or newer, pnpm 11 (`packageManager` pins 11.8.0).
- `pnpm install` at the repo root.
- k6 binary (optional, for load tests): https://grafana.com/docs/k6/latest/set-up/install-k6/
- Playwright browsers (for smoke and memory specs): `pnpm --filter @dw/tools exec playwright install chromium`

## Environment variables (names only)

| Name | Used by | Notes |
|---|---|---|
| `DW_API` | seed loader, k6 | Default `http://localhost:8787` |
| `ADMIN_TOKEN` | seed loader | Bearer token for `/v1/admin/*`. 32+ random characters. Export in shell only. |
| `DEMO_URL` | Playwright | Default `http://localhost:8787` |
| `MERCHANT`, `OFFER`, `VUS`, `DURATION` | k6 | Optional overrides |

## Seed data

```bash
pnpm --filter @dw/tools seed:generate        # writes tools/seed/out/m1..m50.json (gitignored except m1)
pnpm --filter @dw/tools test                 # m1 must equal golden sets.m1
export ADMIN_TOKEN=...                       # from your secret store
pnpm --filter @dw/tools seed:load            # all merchants; or pass ids: seed:load m1 m2
```

The loader POSTs each offer (NewOffer body), PUTs fillers, then POSTs rebuild per merchant. Each call retries 3 times with backoff. It prints a summary table and exits 1 on any failure.

## Load tests

```bash
k6 inspect tools/k6/ladder.js
k6 run tools/k6/ladder.js                    # 10 VUs, 30 s, http_req_failed < 1%
k6 run tools/k6/validate.js
```

## Browser checks

```bash
DEMO_URL=http://localhost:8787 pnpm --filter @dw/tools smoke
```

The smoke spec stops at the order result. Razorpay Checkout steps are manual; see [test-payments.md](test-payments.md).

## Drills

Run from the coordinating session after merge. Each drill is a fault we inject and then check against the expected behaviour.

| Drill | Injection | Expected |
|---|---|---|
| api_down | stop the Worker | widget renders nothing, host page unaffected |
| slow_api | delay the ladder route past 800 ms | widget times out and fails closed |
| trigger_rebuild | insert an offer | ladder version changes within the cron window or on the admin rebuild |
| stale_money | edit an offer in Supabase, skip rebuild | checkout validate still uses the new rules (reads Supabase, not KV) |
| trigger_down | disable the pg_net trigger | cron reconciler picks up the outbox row |
| bad_signature | post a wrong `razorpay_signature` | `verified: false`, no order marked verified |
| amount_match | compare shown saving with charged amount | zero mismatch |
| kill_switch | set `ladder.disabled` true | widget renders nothing |
| memory | `smoke/memory.spec.ts` | heap growth under 5 MB over 100 mount/unmount cycles |

## Failure triage

- Loader prints `failed after 3 attempts`: check `DW_API` reachability and `ADMIN_TOKEN`. A 401 means the token is wrong. Do not print the token to debug.
- Ladder 404 `unknown_merchant`: the merchant has no rebuild yet. Run the loader for that merchant.
- Playwright `order-result` timeout: the demo `?api=` target is wrong, or the Worker returned 409 `invalid_offer`. Check the Worker log line.
