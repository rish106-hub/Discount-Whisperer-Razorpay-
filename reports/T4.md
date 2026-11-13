# T4 report: razorpay-payments

Branch `dw-t4-razorpay-b895f4`. Status: **done, 1 fix iteration (tsc config only).**

## Diff summary
- `apps/api/src/razorpay/signature.ts`: HMAC-SHA256 hex via crypto.subtle; constant-time compare; malformed signature returns false.
- `apps/api/src/razorpay/client.ts`: fetch Orders client. Basic auth, 8 s timeout, one retry (jittered 200-400 ms) on 5xx / network / timeout, never on 4xx. Refuses unless key id starts `rzp_test_`. Errors carry no upstream body or secrets.
- `apps/api/src/razorpay/modes.ts`: `planOrder`. Offer with `razorpayOfferId` -> `razorpay_offer` (amount = cart, `offers:[id]`); else `server_discount` (amount = chargePaise).
- `apps/api/src/routes/payments.ts`: `POST /order`, `POST /verify`.
- `apps/api/test/payments/**`: own in-memory repo, tests, stand-in for offer-core, local vitest config, `scripts/try-order.mjs`.

## Behaviour decisions
- Order: body parsed as JSON regardless of Content-Type; zod 400 `validation_failed`; `validateSelection` (re-reads `getAllOffers`, never KV) -> 409 `invalid_offer` (detail = reason); **`chargePaise` < 100 -> 409 `amount_too_low`** (checked on the post-discount charge in both modes); Razorpay failure -> 502 `upstream_error` (no detail); payments row inserted after the order exists; response never has the secret.
- Verify: unknown order -> 404 `not_found`. Bad/malformed signature -> 200 `{verified:false}`, row `failed`. Good -> `verified` + one `payment_verified` event (event failure is logged, does not fail verify).
- **A verified payment is never downgraded** by a later bad signature (otherwise anyone could flip a paid order to failed). `failed -> verified` is allowed.
- Duplicate verify with same payment id: `{verified:true}`, no second event. Different payment id on an already verified order: `{verified:false}`, no state change.

## Tests
`cd apps/api && npx vitest run -c test/payments/vitest.config.ts`: **29 passed / 0 failed** (3 files: signature 5, client 6, payments routes 18). `npx tsc -p tsconfig.json` clean. Grep for `rzp_` key-like strings, `eyJ`, `service_role` in src/test: none.

## Real test-mode order
**Not run**: `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` not set in this shell. Run once with keys exported:
`node apps/api/test/payments/scripts/try-order.mjs` (refuses non `rzp_test_`; prints id and amount only).

## Open risks
- **Stand-in for offer-core** (T1 not on this branch): `test/payments/offer-core-standin.ts` + `offer-core-shim.d.ts` + the alias in `test/payments/vitest.config.ts`. T7: delete all three, add the dependency, rerun against the real `validateSelection`. `src/routes/payments.ts` imports `@dw/offer-core`; it does not typecheck without the shim until T1 merges.
- Retry on timeout/network error can leave an orphan Razorpay order if the first attempt actually succeeded. Harmless (never paid), but no payments row.
- Two concurrent verifies of the same payment could both insert a `payment_verified` event (no atomic compare-and-set in the Repo contract). `payments.razorpay_payment_id` is unique so the row stays consistent; the metric could double count in a race.
- `razorpay_offer` mode: server trusts Razorpay to apply the discount at Checkout; `expectedSavingPaise` and `cartPaise` are recorded for the amount_match drill, but verify does not fetch the payment amount from Razorpay (out of spec).
- Razorpay `offers` param confirmed from the plan; Context7 Razorpay Node docs did not show the `offers` field, so its behaviour is not re-verified against live docs. Try-order does not exercise `offers`.

## Requests
1. T2 (`apps/api/package.json`): add devDependency `vitest` (I used `^3.2.7`) and a script e.g. `"test": "vitest run"`. I added vitest locally only (uncommitted changes to `apps/api/package.json` and `pnpm-lock.yaml` are NOT in my commit).
2. T2: `apps/api/vitest.config.ts` should `include` / exclude `test/payments/**` as needed; T4 tests use their own config at `test/payments/vitest.config.ts` until the stand-in is removed.
3. T7: add `"@dw/offer-core": "workspace:*"` to `apps/api/package.json`; remove the stand-in (see Open risks).
