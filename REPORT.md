# T6 report: tools, seed, load, docs

Branch `dw-t6-tools-dd8051`. Status: **done.** Not merged to main. Commits: `4d4b167` (seed, loader, m1 test), `04bf68c` (k6, Playwright, docs).

## Diff summary
- `tools/package.json`, `tools/tsconfig.json`: package `@dw/tools`. Deps: `@faker-js/faker` 10.5.0, `zod` 4.6.7 (matches contracts), `@dw/contracts` workspace, dev `@playwright/test` 1.59.1, `tsx` 4.23.15, `typescript` 5.9.3, `@types/node` 24.19.2. `pnpm-lock.yaml` updated.
- `tools/seed/generate.ts`: m1 = `golden.sets.m1` verbatim. m2..m49 faker en_IN (locale chain en_IN, en, base), 3..8 offers each. m50 = 250 offers. Every offer goes through `OfferSchema.parse`, every filler set through `PutFillersSchema.parse`, before write. Prints a per-merchant table and a total.
- `tools/seed/load.ts`: `DW_API` (default `http://localhost:8787`), `ADMIN_TOKEN` required from env (never printed). POST offers as NewOffer (strips `id`, `merchantId`, `updatedAt`), PUT fillers, POST rebuild. 3 attempts with 500 ms doubling backoff. Summary table. Exit 1 on any failure. Optional argv picks merchants.
- `tools/seed/diff.test.ts`: 3 tests. Committed `out/m1.json` equals golden `sets.m1`. Fresh `buildM1()` equals golden. Generator emits 50 sets, m50 = 250, ids = `merchantId_code`.
- `tools/seed/out/m1.json`: committed (force-added past the `tools/seed/out/*` ignore). Other outputs gitignored.
- `tools/k6/ladder.js`, `tools/k6/validate.js`: 10 VUs, 30 s default, `http_req_failed: rate<0.01`. Env overrides for DW_API, MERCHANT, OFFER, VUS, DURATION.
- `tools/smoke/playwright.config.ts`, `smoke.spec.ts`, `memory.spec.ts`: chromium only. Smoke = Rs 1,800 gamcha nudge, then HDFC_CC at Rs 2,600, then Pay, expect order result. Memory = 100 mount/unmount cycles of `<dw-offers>`, CDP `HeapProfiler.collectGarbage` + `Runtime.getHeapUsage` before/after, fails if growth > 5 MB.
- `docs/runbook.md`: setup, env names only, seed/load commands, k6 and smoke commands, drill table, triage.
- `docs/metrics.md`: 4 input metrics with null rules, 3 guardrails, log line shape.
- `docs/test-payments.md`: links Razorpay's official test card and test UPI pages. No card numbers copied. Manual modal steps and signature check described.

## Acceptance
| Check | Result |
|---|---|
| `pnpm --filter @dw/tools seed:generate` writes 50 files, prints counts | pass: 50 files, 499 offers, m50 = 250 |
| every record passes zod | pass (parsed at generation time, not just a post-check) |
| m1 diff test vs golden sets.m1 | pass: 3/3 (`pnpm --filter @dw/tools test`) |
| `pnpm --filter @dw/tools typecheck` | pass |
| `k6 inspect` | **not run**: k6 not installed on this machine. Scripts unverified by k6. |
| Playwright config and specs load | pass: `playwright test --list` shows 3 tests. Browsers not installed, specs not executed. |
| loader against dead port | pass: retries, table prints `failed`, exit 1 |

## Loop count
Iterations used: 2 of 3. Fix 1: `Offer` type import from `@dw/contracts` (root), not `schemas`. Fix 2: `tsconfig` gets `DOM` lib for the memory spec, and the `.ts` extension import in the test changed to extensionless.

## Open risks
- k6 scripts never run through `k6 inspect` or a real run. Install k6 and run `k6 inspect tools/k6/ladder.js`.
- Playwright specs never executed. Need `pnpm --filter @dw/tools exec playwright install chromium` and a running Worker plus demo (T5 and T2 not merged here).
- Smoke assumes `cart-value` is an input (uses `.fill`). If T5 renders it as a span, the second smoke test breaks. Also assumes `data-testid` attributes on demo and widget (`dw-nudge` via shadow DOM). Verify when T5 merges.
- Memory threshold (5 MB over 100 cycles) is my guess, not from PLAN. Tune after the first real run.
- Per-merchant seed is `42 + n`, not a single seed 42 stream. Chosen so each merchant differs but generation stays deterministic and order-independent. Confirm this reading is acceptable.
- Runbook drill "expected" column is my reading of the PLAN drill names. Check against T7's drill definitions.
- `tools/seed/out/m1.json` is the only committed seed output. Re-running `seed:generate` leaves git clean (verified).

## Requests
- T2 (`apps/api`): the loader posts to `/v1/admin/merchants/:id/offers` with NewOffer body and expects 201. Confirm the route accepts the stripped body (no `id`, `merchantId`, `updatedAt`).
- T5 (`apps/demo`): please expose `data-testid` on `cart-value` (input), `pay-method`, `pay-button`, `order-result`, and the widget's `dw-nudge` test id, matching `demo_contract` in PLAN.xml.
- T7: `pnpm --filter @dw/tools` needs `playwright install chromium` and k6 on PATH before the drills.
