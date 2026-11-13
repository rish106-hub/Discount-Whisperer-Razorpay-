# T1 report: offer-core

Branch `dw-t1-core-3f989e`. Status: **done.** Scope: `packages/offer-core/**` only (plus the `pnpm-lock.yaml` entries for it, see Requests).

## Diff summary
New package `@dw/offer-core` (no runtime deps; `import type` from `@dw/contracts`; no zod in src):
- `src/money.ts` `savingPaise`, `chargeFor`. Integer paise, `Math.floor`, cap, flat = min(value, cart).
- `src/brute.ts` `bruteForce`: independent reference (filter/sort, no ladder, own comparators).
- `src/build.ts` `buildLadder`: drops inactive and `endsAt <= nowMs`, copies only public fields, sorts offers (min, id) and fillers (price, sku), builds `mins`, version hash.
- `src/lookup.ts` `lookup`: binary search split on `mins`, running top-3 for unlockable, first-fit filler on the price-sorted list.
- `src/validate.ts` `validateSelection`: contract check order; cashback charge = cart.
- `src/hash.ts` FNV-1a 64 (BigInt) over UTF-8 of canonical JSON (recursively sorted keys), 16 hex chars. Verified against published FNV test vectors.
- `test/golden.test.ts` all 32 golden cases (lookup via ladder and via bruteForce, 1e-9 score tolerance; validate), `test/ladder.test.ts`, `test/property.test.ts`, `bench/lookup.bench.ts`.

## Tests
Command: `pnpm --filter @dw/offer-core test` (seed via `FC_SEED=<n>`), `typecheck`, `bench`.
- 62 tests pass (3 files): 32 golden lookup/validate cases x (ladder + brute for lookup), hash vectors, ladder build, 5 property tests.
- Seeds 12345, 987654321, 1, 424242 (plus a random one): all pass, 0 counterexamples. Typecheck passes.
- Properties: lookup == bruteForce (10,000 runs, small ranges to force ties, carts on/next to minimums, nowMs >= build time); applicable passes validateSelection with same saving (3,000); saving <= cart and <= cap, charge in [0, cart] (3,000); buildLadder deterministic and input-order independent (2,000); ladder sorted, mins parallel (2,000).
- Sanity: mutating the binary-search boundary made 4 tests fail, so the properties do bite.

## Bench
250 offers, mixed methods, 6 carts x 3 methods, Node 26: median **~9.5 µs**, p95 ~10 µs (budget 50 µs).

## Ambiguities (decided)
1. Tie on `score` uses exact float equality; equal rationals give equal floats (IEEE division is correctly rounded), and brute and lookup compute it identically.
2. `savingPaise` returns 0 for cart <= 0.
3. `step` counts live offers with min <= cart only (inactive and ended excluded; not-started excluded). Matches golden.
4. `lookup` does not check `ladder.disabled`; widget decides to render nothing.
5. `validateSelection` ignores merchantId; callers pass that merchant's offers.

## Open risks
- Ladder correctness relies on `nowMs >= builtAt` (checkpoint decision 12); a clock behind builtAt can show offers the ladder dropped, never wrong money.

## Requests
- T7: `pnpm-lock.yaml` changed (new workspace package + vitest 5.1.0, fast-check 4.10.2). Regenerate with `pnpm install` on merge rather than hand-merging conflicts.
- None for contracts.
