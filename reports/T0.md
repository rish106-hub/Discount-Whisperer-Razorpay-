# T0 report: contracts and scaffold

Branch `dw-t0-contracts`. Status: **done, waiting for human checkpoint 1.**

## Acceptance
| Check | Result |
|---|---|
| `pnpm install` | pass (pnpm 11.8.0; `allowBuilds: esbuild` needed, pnpm 11 blocks build scripts) |
| `pnpm -r typecheck` | pass (contracts + api) |
| golden.json parses, >= 14 cases | pass: 3 sets, 16 lookup + 16 validate = 32 cases (`pnpm --filter @dw/contracts test`) |
| cart 180000 / method null matches spec | pass: conditional O3 9000, top unlock O1 gap 19900, filler gamcha |
| index.ts mounts all 8 route modules | pass |
| Independent recompute (fresh Opus agent, by hand) | 26/26 original cases agree; 6 more cases added from its coverage gaps |
| Schema ↔ type drift | `src/schemas/_assert.ts` fails typecheck if any zod output differs from its TS type (verified by injecting a drift) |

## File tree
```
package.json  pnpm-workspace.yaml  tsconfig.base.json  .gitignore  .editorconfig  CLAUDE.md  README.md
packages/contracts/
  src/index.ts            zod-free entry: types + constants + db names
  src/constants.ts        ladderKey, limits, patterns, EVENT_TYPES
  src/db.ts               TABLES, RPC, *_COLUMNS, APP_CONFIG_KEYS
  src/types/              offer filler ladder lookup validate events payments api repo golden
  src/schemas/            zod mirrors + _assert.ts (exported at @dw/contracts/schemas)
  fixtures/golden.json    sets m1 (golden merchant), e1, e2 + 32 cases
  scripts/check-golden.ts structural check
apps/api/
  src/index.ts            createApp(deps) + default {fetch, scheduled}   (frozen)
  src/env.ts              Env, Deps, AppEnv                              (frozen)
  src/routes/*.ts         8 stubs: xRoutes(deps) -> Hono<AppEnv>
  src/log.ts, reconciler.ts, supabaseRepo.ts   T2-owned stubs
```

## Mount table
| Prefix | Module | Owner |
|---|---|---|
| `/` (`/healthz`) | health | T2 |
| `/v1/ladder` | ladder | T2 |
| `/v1/admin` | admin | T2 |
| `/internal` | internal | T2 |
| `/v1/checkout` | checkout | T2 |
| `/v1/events` | events | T2 |
| `/v1/metrics` | metrics | T2 |
| `/v1/payments` | payments | T4 |

## Golden cases (m1 = Shantipur Tant House; now = 2026-06-01 unless noted)
| # | Case | Expected |
|---|---|---|
| 1 | m1 1,800 null | step 1; cond O3 9000; unlock O1 (gap 19900), O2 (69900); filler gamcha |
| 2 | m1 2,600 HDFC_CC | step 3; O1 26000, O2 25000; nothing to unlock |
| 3 | m1 1,998.99 null | cond O3 9994; unlock O1 gap 1, O2 gap 50001; gamcha |
| 4 | m1 1,999 null | O1 19990; cond O3 9995; unlock O2 gap 50000; potli bag |
| 5 | m1 1,999.01 null | O1 19990; cond O3 9995; O2 gap 49999; potli bag |
| 6 | m1 1,999 UPI | O1 19990, O3 9995; O2 dropped |
| 7 | m1 2,600 ICICI_CC | O1 26000 only |
| 8 | m1 2,498.99 null | O1 24989; cond O3 12494; O2 gap 1; gamcha |
| 9 | m1 5,000 HDFC_CC | O1 capped 30000, O2 25000 |
| 10 | expired (now = endsAt) | all empty |
| 11 | not started (startsAt - 1) | all empty |
| 12 | m1 0 HDFC_CC | unlock O2 (score 0.10004) above O1 (0.1); no filler fits -> null |
| 13 | e1 0 null | below every min; C, B (merchant) before A (bank); filler price tie -> sku "bag" |
| 14 | e1 700 null | flat 80000 on 70000 cart -> saving 70000; B before A on full tie |
| 15 | m1 2,499 HDFC_CC at startsAt | live at start; O2 25000 before O1 24990 |
| 16 | e2 0 null | four 0.1 scores, gap asc decides, top-3 cut |
| V | 16 validate cases | spec O2 -> 25000/235000; O1 below_min; cashback charge unchanged; method_mismatch (null and wrong); unknown; expired; not_started; cap; inactive; charge 0; offerId null; check order x2; endsAt-1 live; cashback cap |

## Decisions to approve at checkpoint 1
1. **Live window is `startsAt <= now < endsAt`** (end exclusive).
2. **`step` = number of live offers with min <= cart, whatever their method.** It can be larger than the number of offers shown (case 7: step 3, 1 applicable).
3. **`applicable` and `conditional` are sorted by saving desc, then id.** Cashback is ranked with instant discounts.
4. **`unlockable[].method` was added** (not in the original output) so the widget can say "if you pay with X" without a second lookup.
5. **An unlockable's saving is computed at exactly minOrderPaise**, as specified. After adding a filler the real saving on a pct offer can be a little higher than shown. This is safe for money because it under-promises.
6. **`validateSelection` accepts `offerId: null`** (valid, saving 0), so `/v1/payments/order` with no offer uses the same path. `/v1/checkout/validate` still requires an offerId.
7. **Validate check order:** unknown_offer, inactive, not_started, expired, below_min, method_mismatch.
8. **chargePaise can be 0** (flat >= cart). The payments route must return `409 amount_too_low` below `RAZORPAY_MIN_AMOUNT_PAISE` (100).
9. **Flat offers must have `maxPaise: null`**, and percent values must be 1..100 (zod rejects otherwise).
10. **Ladder `version` hashes `{v, merchantId, disabled, offers, fillers}`.** `builtAt` is not hashed, so the same content gives the same ETag. The kill switch changes the version.
11. **Kill switch source:** `buildLadder({..., disabled})` defaults to false, and nothing in the DB stores it yet. For the drill, T7 writes `disabled: true` into KV directly. Add a column later if needed.
12. **Ladder vs clock skew:** the ladder drops offers that ended before `builtAt`. If a browser clock runs behind `builtAt`, it shows fewer offers, never wrong money. The property test must use `nowMs >= buildNowMs`.
13. **Outbox protocol:** `Repo.pendingOutboxMaxId` plus `markOutboxProcessed(m, upToId)`, so an edit that lands during a rebuild is never marked processed by mistake. I added two Repo methods, `pendingOutboxMaxId` and `getPaymentByOrderId` (needed for idempotent verify).
14. **payments table gets `cart_paise` and `mode` columns**, for the amount_match drill and for "log mode in payments".
15. **`widget_seen_rate` is always null.** No page_view event type exists. Add `page_view` now if you want that ratio.
16. **Events are sent as text/plain JSON** (sendBeacon avoids a CORS preflight), so T2 must parse the body whatever its Content-Type.
17. **merchantId is at most 20 lower-case chars**, so the receipt `dw_{id}_{ms}` fits 40. Cart is at most 2,000,000,000 paise (Postgres int).
18. **Dependency injection:** routes are `xRoutes(deps: Deps)` and `createApp(deps)` is exported. Tests inject an in-memory Repo and a fixed clock without the Workers pool.
19. **Versions:** typescript 5.9.3 (7.0 is the new native compiler, skipped for tooling compatibility), zod 4.6.7, hono 4.13.18, @cloudflare/workers-types 4.20260702.1 (T2 may move to `wrangler types`), tsx 4.23.15.

## Open risks
- T0 stubs sit in T2-owned files. T2 must keep the exports. If T2 deletes a stub, `index.ts` breaks.
- T4 needs deps in `apps/api/package.json`, which T2 owns. Probably none are needed: fetch and crypto.subtle are built in.
- TypeScript 5.9 vs 7: if a later tool needs TS 7, upgrade at T7.

## Requests
None.
