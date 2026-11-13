# T2 report: api-worker

Branch `dw-t2-api-3bf648`. Status: **done; unverified against the real `@dw/offer-core` (T1 not merged).**

## Diff summary
- `apps/api/src`: `log.ts`, `auth.ts` (SHA-256 digest compare, empty secret never authorizes), `ladderStore.ts`, `rebuild.ts`, `reconciler.ts`, `repo.ts` (in-memory), `supabaseRepo.ts`, `http.ts` (new, see Requests), routes health/ladder/admin/internal/checkout/events/metrics. T0 stub export names and signatures kept; `index.ts`/`env.ts`/contracts untouched.
- `wrangler.toml` (placeholder KV id, cron `*/5 * * * *`), `.dev.vars.example`, `vitest.config.ts`, `package.json` (+hono, zod, supabase-js, offer-core, vitest, wrangler), `README.md` with curl examples.
- Tests: `test/api.test.ts` (30), `test/supabaseRepo.test.ts` (3), `test/helpers.ts`, `test/standin/offer-core.ts`.

## Test command and results
`cd apps/api && ./node_modules/.bin/vitest run` -> 2 files, 33 tests pass. `tsc -p tsconfig.json` clean. `wrangler dev --local` served `/healthz` `{"ok":true,...}`; ladder 404 for an unbuilt merchant. Golden check passes: `{m1, 260000, HDFC_CC, m1_O2}` -> valid, 25000, 235000. Secret grep (`rzp_`, `service_role`, `eyJ`) is clean outside `rzp_test_` placeholders.
Not run: supabaseRepo against a real Supabase (no keys, G4/G5); only its row mapping is unit-tested.

## T1 dependency (important)
`@dw/offer-core` is declared `workspace:*` but is not on this branch. For local runs I created an **untracked** `packages/offer-core` shim that re-exports the **committed, labeled stand-in** `apps/api/test/standin/offer-core.ts` (written from PLAN.xml semantics: `buildLadder`, `validateSelection`, `savingPaise` only; its version hash is not FNV-1a). On a clean checkout `pnpm install` fails until T1 merges. After the T1 merge, delete the shim/stand-in and re-run the tests; stand-in is not imported by `src/`.

## Open risks
- `pnpm install` / `pnpm --filter` fail with `ERR_PNPM_IGNORED_BUILDS: workerd` (pnpm 11). I ran `tsc` and `vitest` via `node_modules/.bin`. Needs `allowBuilds: workerd: true` (see Requests).
- Rebuild keeps `disabled` from the existing KV ladder (kill switch drill); a rebuild of a merchant with no KV entry defaults to false.
- Cron `pendingOutboxMerchants` reads up to 1000 oldest pending outbox rows then groups client-side; fine at this scale.
- `DEBUG_FAIL_REBUILD` fails once per isolate, tracked in module state.
- `supabaseRepo.deactivateOffer` does an ownership select before the RPC (RPC takes only the offer id); two round trips.
- Events are not checked against a known merchant (cheap, unauthenticated endpoint; bounded by 1 KB body).

## Requests
1. Root `pnpm-workspace.yaml` (T0/T7): add `workerd: true` under `allowBuilds` (and `esbuild` already there).
2. Scope: I added `apps/api/src/http.ts` (shared error/parse/CORS helpers for T2 routes) which is not in the T2 file list; T4 may reuse it or ignore it.
3. T7: after T1 merge remove `apps/api/test/standin/` and rerun tests; then `pnpm install` to refresh the lockfile.
