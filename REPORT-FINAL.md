# Discount Whisperer: final report (T7)

Status: **local build complete and drilled. Not deployed** (waiting on human checkpoint 2).
Task reports: `reports/T0.md` … `reports/T6.md`.

## Test matrix on main
| Package | Result |
|---|---|
| contracts | golden.json structural check OK (32 cases) |
| offer-core | 62 pass (golden, 5 fast-check properties on 4+ seeds) |
| api | 97 pass (routes, payments, golden-three-ways, review regressions) |
| widget | 46 pass |
| tools | 3 pass (m1 seed equals golden) |

## Numbers (local)
| Metric | Value | Budget |
|---|---|---|
| m1 ladder | 924 B | < 1 KB |
| m50 ladder (250 offers) | 33.6 KB | — |
| Widget bundle | 9.33 KB gzip | ≤ 15 KB |
| lookup, 250 offers (Node) | ~9.5 µs median | < 50 µs |
| Edit → new ladder in KV (admin path) | 82 ms | — |
| k6 ladder, 10 VUs 30 s | 2,706 req, 0% failed, p95 20 ms | < 1% failed |
| k6 validate, 10 VUs 30 s | 2,724 req, 0% failed, p95 24 ms | < 1% failed |
| Widget heap growth, 100 mount/unmount | 15 KB total (~150 B/cycle) | no steady growth |

## Drills (local Worker: `apps/api/wrangler.dev.toml`, in-memory repo, local KV, fake Razorpay orders)
| Drill | Result | Evidence |
|---|---|---|
| api_down | **pass** | widget called the dead host `127.0.0.1:9`, rendered nothing, cart and Pay still work, no page errors |
| slow_api (2 s ladder) | **pass** | ladder request aborted ~913 ms after navigation; widget never rendered; page works |
| trigger_rebuild | **pass (local admin path)** | new version in KV 82 ms after PATCH. pg_net trigger path needs hosted Supabase |
| stale_money | **pass** | after moving O1 min to 209900, validate at 199900 → `below_min`; order → 409 |
| trigger_down | **pass** | rebuild forced to fail → ladder stale; one cron run (`/__scheduled`) processed the pending outbox row → new version |
| bad_signature | **pass** | `deadbeef` and 64 zeros → `verified:false`; real HMAC → `verified:true`; repeat verify does not double-count |
| amount_match | **not run** | needs a real Razorpay test payment (checkpoint 3) |
| kill_switch | **pass** | `disabled:true` in KV → widget renders nothing; a rebuild keeps the flag and gives a new content-hash ETag |
| memory | **pass** | see heap row above |
| unplanned: repo/ladder disagree | **pass** | after a dev reload emptied the repo, widget showed O1 from KV; server answered `unknown_offer`; demo retried without offer and charged full price |

## Money review (independent Opus reviewer)
| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | high | server_discount mode trusts client `method`; a UPI payer can get the HDFC_CC-only discount | **open: needs human decision** |
| 2 | high | verify race could downgrade verified → failed, or let a second payment_id add a second event | fixed: compare-and-set in all repos (`review-verify-race.test.ts`). Allowed transitions: created→verified, created→failed, failed→verified (good signature); verified is terminal |
| 3 | med | demo picked an offer the server rejects (charge < 100 paise), no fallback | fixed: `pick-offer.js` + one retry with no offer |
| 4 | med | widget showed every applicable offer as "applied"; only one is ever applied | fixed: best one applied, rest shown as "or" |
| 5 | low | cashback offer with a Razorpay id would be sent as an instant Razorpay offer | fixed: cashback always server_discount, amount = cart |
| 6 | low | widget ladder cache never expires and uses the browser clock | accepted: server re-validates; demo now falls back |
| — | note | server never prices the cart (cartPaise is client-claimed) | out of scope (no catalogue); record for v3.1 |
| — | note | razorpay_offer mode never checks the amount Razorpay actually charged | covered by amount_match drill; Razorpay webhook is a stretch goal |

## T7 cross-package fixes
- Removed offer-core stand-ins from T2, T4, T5 (real package merged).
- `pnpm-workspace.yaml`: `allowBuilds` for esbuild and workerd (pnpm 11).
- `apps/demo/public/demo.js`: `?api=` now reaches the widget as `api-base`.
- `tools/smoke/smoke.spec.ts`: cart-value is text, not an input; test the real server-validated order.
- Added `apps/api/test/golden-three-ways.test.ts`, `apps/api/dev/worker.ts` + `wrangler.dev.toml` (local only), `tools/drills/*`.
- Ignored `supabase/.temp/`.

## Not verified yet (needs hosted or real payment)
- Supabase via PostgREST (`supabaseRepo`), `supabase/tests/smoke.mjs`, anon-key RLS over REST.
- pg_net trigger → `/internal/rebuild` over HTTP.
- Real Razorpay order, Checkout modal, signature from Razorpay, amount_match.
- KV propagation time across Cloudflare locations.

## Local runbook
```bash
pnpm --filter @dw/api dev:local          # Worker + demo on http://localhost:8787
ADMIN_TOKEN=... DW_API=http://localhost:8787 pnpm --filter @dw/tools seed:load
CHROME_PATH=... DRILL=normal pnpm --filter @dw/tools exec playwright test -c drills/playwright.config.ts
```
