# Discount Whisperer

An offers widget for small Indian D2C stores. It shows which offers apply now, the cheapest next unlock, and a product that fills the gap. The server re-validates every offer with the same rules code before Razorpay (test mode) charges.

- **Write path:** admin API → Supabase (offer + outbox in one transaction) → pg_net trigger / 5-min cron → Worker rebuilds a sorted "ladder" → Cloudflare KV.
- **Read path:** `<dw-offers>` widget fetches the ladder (800 ms timeout, fails closed) and runs `lookup` in the browser.
- **Pay path:** Worker re-reads offers from Supabase, `validateSelection`, creates a Razorpay test order, verifies the HMAC signature.

## Layout
```
packages/contracts   types, zod schemas, DB names, golden fixtures (frozen)
packages/offer-core  buildLadder, lookup, bruteForce, savingPaise, validateSelection
packages/widget      <dw-offers> Preact custom element
apps/api             Cloudflare Worker (Hono)
apps/demo            static demo store
supabase             migrations, seed, smoke test
tools, docs          seed generator, load/smoke scripts, runbook
```

## Develop
```bash
pnpm install
pnpm -r typecheck
pnpm -r test
```

<!-- T7: deployed URL, setup, drill results -->
