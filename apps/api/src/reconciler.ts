/** Owner: T2. Cron safety net: rebuild merchants whose outbox rows are still pending. */
import { RECONCILER_BATCH } from "@dw/contracts";
import type { Deps, Env } from "./env";
import { rebuild } from "./rebuild";

export async function runReconciler(env: Env, deps: Deps): Promise<void> {
  const pending = await deps.repo(env).pendingOutboxMerchants(RECONCILER_BATCH);
  let ok = 0;
  let failed = 0;
  for (const p of pending) {
    try {
      await rebuild(env, deps, p.merchantId);
      ok++;
    } catch {
      failed++; // next tick retries; the row stays pending
    }
  }
  console.log(JSON.stringify({ ts: deps.now(), route: "cron:reconciler", pending: pending.length, ok, failed }));
}
